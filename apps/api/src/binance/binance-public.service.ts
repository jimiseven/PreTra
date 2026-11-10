import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { Candle } from '@pretra/shared';

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  contractType: string;
}

export interface KlineStreamEvent {
  symbol: string;
  candle: Candle;
}

@Injectable()
export class BinancePublicService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinancePublicService.name);
  private readonly restClient: AxiosInstance;
  private readonly restBaseUrl = process.env.BINANCE_FUTURES_REST_URL || 'https://fapi.binance.com';
  private readonly wsBaseUrl = process.env.BINANCE_FUTURES_WS_URL || 'wss://fstream.binance.com';

  private ws: WebSocket | null = null;
  private subscribedSymbols = new Set<string>();
  private isConnecting = false;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPingTime = 0;
  private listeners: ((event: KlineStreamEvent) => void)[] = [];

  constructor() {
    this.restClient = axios.create({
      baseURL: this.restBaseUrl,
      timeout: 10_000,
      headers: {
        'User-Agent': 'PreTra/1.0.0 (Futures Momentum & Early Plateau Monitor)'
      }
    });
  }

  onModuleInit() {
    this.startWsClient();
  }

  onModuleDestroy() {
    this.shouldReconnect = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onKlineUpdate(listener: (event: KlineStreamEvent) => void) {
    this.listeners.push(listener);
  }

  /**
   * Obtiene la lista completa de símbolos válidos de futuros USDⓈ-M desde exchangeInfo
   */
  async getExchangeSymbols(): Promise<BinanceSymbolInfo[]> {
    try {
      const response = await this.restClient.get('/fapi/v1/exchangeInfo');
      const symbols: any[] = response.data.symbols || [];
      return symbols
        .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
        .map(s => ({
          symbol: s.symbol,
          status: s.status,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
          contractType: s.contractType
        }));
    } catch (error) {
      this.logger.error(`Error al consultar exchangeInfo de Binance: ${error?.message || error}`);
      return [];
    }
  }

  /**
   * Descarga velas históricas respetando paginación (máx 1500 por lote) y rate limits
   */
  async fetchHistoricalKlines(
    symbol: string,
    startTime: number,
    endTime: number = Date.now(),
    interval: string = '1m'
  ): Promise<Candle[]> {
    const allCandles: Candle[] = [];
    let currentStart = startTime;
    const limit = 1500;

    this.logger.log(`Iniciando backfill para ${symbol} desde ${new Date(startTime).toISOString()} hasta ${new Date(endTime).toISOString()}`);

    while (currentStart < endTime) {
      try {
        const response = await this.restClient.get('/fapi/v1/klines', {
          params: {
            symbol: symbol.toUpperCase(),
            interval,
            startTime: currentStart,
            endTime,
            limit
          }
        });

        const rawData: any[] = response.data;
        if (!rawData || rawData.length === 0) break;

        for (const row of rawData) {
          const openTime = Number(row[0]);
          const closeTime = Number(row[6]);
          allCandles.push({
            symbol: symbol.toUpperCase(),
            interval,
            openTime,
            closeTime,
            open: parseFloat(row[1]),
            high: parseFloat(row[2]),
            low: parseFloat(row[3]),
            close: parseFloat(row[4]),
            volume: parseFloat(row[5]),
            isClosed: true
          });
        }

        const lastRow = rawData[rawData.length - 1];
        const lastOpenTime = Number(lastRow[0]);

        // Si ya llegamos al lote final o no avanza el tiempo
        if (rawData.length < limit || lastOpenTime <= currentStart) {
          break;
        }

        currentStart = lastOpenTime + 60_000;

        // Pequeño retardo cortés para evitar rate limits
        await new Promise(res => setTimeout(res, 100));
      } catch (error) {
        this.logger.error(`Error descargando klines para ${symbol}: ${error?.message || error}`);
        break;
      }
    }

    this.logger.log(`Backfill completado para ${symbol}: ${allCandles.length} velas descargadas.`);
    return allCandles;
  }

  /**
   * Suscribe dinámicamente un símbolo al stream en vivo
   */
  subscribeSymbol(symbol: string) {
    const formatted = symbol.toLowerCase();
    this.subscribedSymbols.add(formatted);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = {
        method: 'SUBSCRIBE',
        params: [`${formatted}@kline_1m`],
        id: Date.now()
      };
      this.ws.send(JSON.stringify(msg));
      this.logger.log(`Suscrito a WebSocket para ${symbol}@kline_1m`);
    }
  }

  /**
   * Desuscribe dinámicamente un símbolo
   */
  unsubscribeSymbol(symbol: string) {
    const formatted = symbol.toLowerCase();
    this.subscribedSymbols.delete(formatted);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = {
        method: 'UNSUBSCRIBE',
        params: [`${formatted}@kline_1m`],
        id: Date.now()
      };
      this.ws.send(JSON.stringify(msg));
      this.logger.log(`Desuscrito de WebSocket para ${symbol}@kline_1m`);
    }
  }

  private startWsClient() {
    if (!this.shouldReconnect || this.isConnecting) return;
    this.isConnecting = true;

    const wsUrl = `${this.wsBaseUrl}/ws`;
    this.logger.log(`Conectando a Binance WebSocket: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.logger.log('Binance WebSocket conectado exitosamente.');

        // Re-suscribir todos los símbolos activos
        if (this.subscribedSymbols.size > 0) {
          const params = Array.from(this.subscribedSymbols).map(s => `${s}@kline_1m`);
          this.ws?.send(JSON.stringify({
            method: 'SUBSCRIBE',
            params,
            id: Date.now()
          }));
          this.logger.log(`Re-suscritos ${params.length} símbolos.`);
        }

        // Heartbeat / ping cada 3 minutos
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.ping();
            this.lastPingTime = Date.now();
          }
        }, 180_000);
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.e === 'kline' && payload.k) {
            const k = payload.k;
            const candle: Candle = {
              symbol: payload.s,
              interval: k.i,
              openTime: Number(k.t),
              closeTime: Number(k.T),
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isClosed: Boolean(k.x)
            };

            for (const listener of this.listeners) {
              listener({ symbol: payload.s, candle });
            }
          }
        } catch (err) {
          // Ignorar mensajes de confirmación de suscripción
        }
      });

      this.ws.on('pong', () => {
        // Latencia saludable
      });

      this.ws.on('close', () => {
        this.isConnecting = false;
        this.logger.warn('Binance WebSocket desconectado.');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        this.isConnecting = false;
        this.logger.error(`Error en Binance WebSocket: ${err?.message || err}`);
      });
    } catch (err) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    this.reconnectAttempts++;
    // Backoff exponencial con jitter: min 1s, max 30s
    const baseDelay = Math.min(30_000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    this.logger.log(`Reintentando conexión WebSocket en ${(delay / 1000).toFixed(1)}s (intento #${this.reconnectAttempts})...`);
    setTimeout(() => {
      this.startWsClient();
    }, delay);
  }

  getWsStatus(): 'connected' | 'reconnecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    if (this.ws.readyState === WebSocket.OPEN) return 'connected';
    if (this.ws.readyState === WebSocket.CONNECTING) return 'reconnecting';
    return 'disconnected';
  }
}
