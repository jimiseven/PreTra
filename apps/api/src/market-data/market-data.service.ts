import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BinancePublicService } from '../binance/binance-public.service';
import { PrismaService } from '../prisma/prisma.service';
import { DetectorService } from '../detector/detector.service';
import { SseService } from '../sse/sse.service';
import { Candle, SyncStatus } from '@pretra/shared';
import { Prisma } from '@prisma/client';

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly candleBuffers = new Map<string, Candle[]>();
  private readonly MAX_BUFFER_CANDLES = 10_080; // 7 días de velas de 1m (7 * 1440)

  constructor(
    private readonly binanceService: BinancePublicService,
    private readonly prisma: PrismaService,
    private readonly detectorService: DetectorService,
    private readonly sseService: SseService
  ) {}

  async onModuleInit() {
    this.binanceService.onKlineUpdate(event => this.handleKlineUpdate(event.symbol, event.candle));
    await this.initActiveSubscriptions();
  }

  private async initActiveSubscriptions() {
    try {
      const activeItems = await this.prisma.watchlistItem.findMany({
        where: { status: 'ACTIVE' }
      });
      for (const item of activeItems) {
        this.binanceService.subscribeSymbol(item.symbol);
      }
      this.logger.log(`Inicializadas suscripciones para ${activeItems.length} símbolos activos.`);
    } catch (err) {
      this.logger.warn(`No se pudieron cargar símbolos activos al inicio: ${err?.message || err}`);
    }
  }

  /**
   * Procesa velas entrantes desde el stream WebSocket de Binance
   */
  private async handleKlineUpdate(symbol: string, candle: Candle) {
    let buffer = this.candleBuffers.get(symbol);
    if (!buffer) {
      buffer = [];
      this.candleBuffers.set(symbol, buffer);
    }

    if (candle.isClosed) {
      // Reemplaza o añade la vela cerrada
      const existingIdx = buffer.findIndex(c => c.openTime === candle.openTime);
      if (existingIdx >= 0) {
        buffer[existingIdx] = candle;
      } else {
        buffer.push(candle);
      }

      // Mantener tamaño de buffer
      if (buffer.length > this.MAX_BUFFER_CANDLES) {
        buffer.shift();
      }

      // Persistir vela en PostgreSQL si está disponible
      if (this.prisma.isConnected) {
        try {
          await this.prisma.candle.upsert({
            where: {
              symbol_interval_openTime: {
                symbol,
                interval: candle.interval,
                openTime: BigInt(candle.openTime)
              }
            },
            create: {
              symbol,
              interval: candle.interval,
              openTime: BigInt(candle.openTime),
              closeTime: BigInt(candle.closeTime),
              open: new Prisma.Decimal(candle.open),
              high: new Prisma.Decimal(candle.high),
              low: new Prisma.Decimal(candle.low),
              close: new Prisma.Decimal(candle.close),
              volume: new Prisma.Decimal(candle.volume),
              isClosed: true
            },
            update: {
              close: new Prisma.Decimal(candle.close),
              high: new Prisma.Decimal(candle.high),
              low: new Prisma.Decimal(candle.low),
              volume: new Prisma.Decimal(candle.volume),
              isClosed: true
            }
          });
        } catch (err) {
          // Modo resiliente si DB no conectada
        }
      }

      // Evaluar detector de meseta
      await this.detectorService.evaluateCoin(symbol, buffer, false);
    } else {
      // Vela parcial (en curso): actualizamos ticker en SSE
      this.sseService.broadcast('TICKER_UPDATE', {
        symbol,
        price: candle.close,
        isPartial: true
      });
    }
  }

  /**
   * Ejecuta backfill histórico completo (default 7 días) para un símbolo
   */
  async runBackfill(symbol: string, days: number = 7) {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    this.logger.log(`Iniciando backfill de ${days} días para ${symbol}...`);

    try {
      if (this.prisma.isConnected) {
        await this.prisma.watchlistItem.updateMany({
          where: { symbol },
          data: { syncStatus: SyncStatus.SYNCING }
        });
      }

      const candles = await this.binanceService.fetchHistoricalKlines(symbol, startTime);

      if (candles.length > 0) {
        this.candleBuffers.set(symbol, candles);

        // Guardar lote en DB si está conectada
        if (this.prisma.isConnected) {
          const chunkSize = 500;
          for (let i = 0; i < candles.length; i += chunkSize) {
            const chunk = candles.slice(i, i + chunkSize);
            try {
              await this.prisma.candle.createMany({
                data: chunk.map(c => ({
                  symbol,
                  interval: c.interval,
                  openTime: BigInt(c.openTime),
                  closeTime: BigInt(c.closeTime),
                  open: new Prisma.Decimal(c.open),
                  high: new Prisma.Decimal(c.high),
                  low: new Prisma.Decimal(c.low),
                  close: new Prisma.Decimal(c.close),
                  volume: new Prisma.Decimal(c.volume),
                  isClosed: true
                })),
                skipDuplicates: true
              });
            } catch (err) {}
          }

          const firstCandle = candles[0];
          const lastCandle = candles[candles.length - 1];

          await this.prisma.watchlistItem.updateMany({
            where: { symbol },
            data: {
              syncStatus: SyncStatus.SYNCED,
              coverageFrom: new Date(firstCandle.openTime),
              coverageTo: new Date(lastCandle.closeTime),
              lastCandleAt: new Date(lastCandle.openTime)
            }
          });
        }

        // Evaluación inicial retrospectiva
        await this.detectorService.evaluateCoin(symbol, candles, true);
        this.logger.log(`Backfill para ${symbol} finalizado con éxito (${candles.length} velas procesadas).`);
      } else {
        if (this.prisma.isConnected) {
          await this.prisma.watchlistItem.updateMany({
            where: { symbol },
            data: { syncStatus: SyncStatus.FAILED }
          });
        }
      }
    } catch (err) {
      this.logger.error(`Error durante backfill de ${symbol}: ${err?.message || err}`);
      if (this.prisma.isConnected) {
        await this.prisma.watchlistItem.updateMany({
          where: { symbol },
          data: { syncStatus: SyncStatus.FAILED }
        });
      }
    }

    // Suscribir al WebSocket en vivo
    this.binanceService.subscribeSymbol(symbol);
  }

  getCandles(symbol: string): Candle[] {
    return this.candleBuffers.get(symbol) || [];
  }
}
