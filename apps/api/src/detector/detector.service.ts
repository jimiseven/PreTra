import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SseService } from '../sse/sse.service';
import { BinancePublicService } from '../binance/binance-public.service';
import {
  evaluatePlateauDetector,
  Candle,
  CoinState,
  DetectionConfig,
  DEFAULT_DETECTION_CONFIG,
  MetricsSnapshot
} from '@pretra/shared';
import { Prisma } from '@prisma/client';

@Injectable()
export class DetectorService {
  private readonly logger = new Logger(DetectorService.name);
  private currentConfig: DetectionConfig = { ...DEFAULT_DETECTION_CONFIG };
  private activeStatesCache = new Map<string, { state: CoinState; metrics: MetricsSnapshot }>();

  // Caché de Open Interest y Funding Rate
  private oiCache = new Map<string, { data: any; updatedAt: number }>();
  private fundingCache = new Map<string, { data: any; updatedAt: number }>();

  // Almacén en memoria para eventos y episodios
  private memoryEvents = new Map<string, any[]>();
  private memoryEpisodes: any[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseService: SseService,
    private readonly binanceService: BinancePublicService
  ) {}

  getConfig(): DetectionConfig {
    return { ...this.currentConfig };
  }

  updateConfig(newConfig: Partial<DetectionConfig>): DetectionConfig {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    this.logger.log(`Configuración del detector actualizada a versión ${this.currentConfig.version}`);
    return this.getConfig();
  }

  /**
   * Evalúa una moneda con su historial reciente de velas
   */
  async evaluateCoin(
    symbol: string,
    candles: Candle[],
    isBackfill: boolean = false
  ) {
    if (!candles || candles.length === 0) return null;

    // Obtener o refrescar Open Interest y Funding Rate de Binance si no es backfill y expiró caché (60s)
    let openInterestData = null;
    let fundingData = null;

    if (!isBackfill) {
      const now = Date.now();
      let oiEntry = this.oiCache.get(symbol);
      if (!oiEntry || now - oiEntry.updatedAt > 60_000) {
        try {
          const oi = await this.binanceService.getOpenInterest(symbol);
          oiEntry = { data: oi, updatedAt: Date.now() };
          this.oiCache.set(symbol, oiEntry);
        } catch {}
      }
      openInterestData = oiEntry?.data || null;

      let fundingEntry = this.fundingCache.get(symbol);
      if (!fundingEntry || now - fundingEntry.updatedAt > 60_000) {
        try {
          const f = await this.binanceService.getFundingRate(symbol);
          fundingEntry = { data: f, updatedAt: Date.now() };
          this.fundingCache.set(symbol, fundingEntry);
        } catch {}
      }
      fundingData = fundingEntry?.data || null;
    }

    const previousCache = this.activeStatesCache.get(symbol);
    const previousState = previousCache?.state || CoinState.OBSERVACION;

    const result = evaluatePlateauDetector({
      symbol,
      candles,
      currentState: previousState,
      previousMetrics: previousCache?.metrics,
      config: this.currentConfig,
      isBackfill,
      openInterestData,
      fundingData
    });

    // Actualizamos cache en memoria
    this.activeStatesCache.set(symbol, {
      state: result.state,
      metrics: result.metrics
    });

    // Guardar en almacén en memoria
    if (result.event && (!isBackfill || result.state === CoinState.MESETA_TEMPRANA)) {
      const eventRecord = {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        symbol,
        ...result.event,
        detectedAt: result.event.detectedAt.toISOString(),
        effectiveAt: result.event.effectiveAt.toISOString()
      };
      const symbolEvents = this.memoryEvents.get(symbol) || [];
      symbolEvents.unshift(eventRecord);
      this.memoryEvents.set(symbol, symbolEvents.slice(0, 50));

      if (result.plateauAction && result.plateauAction.action !== 'NONE') {
        if (result.plateauAction.action === 'START') {
          this.memoryEpisodes.unshift({
            id: `ep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            symbol,
            startedAt: new Date(result.metrics.peakAt).toISOString(),
            detectedAt: new Date().toISOString(),
            peakPrice: result.metrics.peakPrice,
            rangeHigh: result.plateauAction.rangeHigh,
            rangeLow: result.plateauAction.rangeLow,
            riseBeforePct: result.metrics.impulseTotalPct || 0,
            drawdownAtDetectionPct: Math.abs(result.metrics.distanceToPeakPct),
            status: result.plateauAction.status,
            metricsSnapshot: result.metrics,
            algorithmVersion: this.currentConfig.version
          });
        }
      }
    }

    // Persistir en PostgreSQL si está disponible
    if (this.prisma.isConnected) {
      try {
        await this.prisma.marketState.upsert({
          where: { symbol },
          create: {
            symbol,
            currentState: result.state,
            lastEvaluatedAt: new Date(result.metrics.peakAt || Date.now()),
            peakPrice: new Prisma.Decimal(result.metrics.peakPrice),
            peakAt: new Date(result.metrics.peakAt || Date.now()),
            impulseStartAt: result.metrics.impulseStartAt ? new Date(result.metrics.impulseStartAt) : null,
            currentPlateauStartAt: result.metrics.plateauDurationHours ? new Date() : null,
            metrics: result.metrics as any,
            algorithmVersion: this.currentConfig.version
          },
          update: {
            currentState: result.state,
            lastEvaluatedAt: new Date(),
            peakPrice: new Prisma.Decimal(result.metrics.peakPrice),
            peakAt: new Date(result.metrics.peakAt || Date.now()),
            impulseStartAt: result.metrics.impulseStartAt ? new Date(result.metrics.impulseStartAt) : null,
            metrics: result.metrics as any,
            algorithmVersion: this.currentConfig.version
          }
        });

        if (result.event && (!isBackfill || result.state === CoinState.MESETA_TEMPRANA)) {
          await this.prisma.detectionEvent.create({
            data: {
              symbol,
              eventType: result.event.eventType,
              stateFrom: result.event.stateFrom,
              stateTo: result.event.stateTo,
              detectedAt: result.event.detectedAt,
              effectiveAt: result.event.effectiveAt,
              isRetrospective: result.event.isRetrospective,
              metricsSnapshot: result.event.metricsSnapshot as any,
              configVersion: result.event.configVersion,
              explanation: result.event.explanation,
              dedupeKey: result.event.dedupeKey
            }
          });
        }
      } catch (dbErr) {
        // Ignorar si falla la persistencia en DB
      }
    }

    // Difusión en tiempo real hacia el Frontend
    if (!isBackfill) {
      if (result.stateChanged) {
        this.sseService.broadcast('STATE_CHANGE', {
          symbol,
          from: result.previousState,
          to: result.state,
          explanation: result.metrics.explanation,
          metrics: result.metrics
        });
      }

      this.sseService.broadcast('TICKER_UPDATE', {
        symbol,
        price: result.metrics.currentPrice,
        change1h: result.metrics.changes['1h'] ?? null,
        change24h: result.metrics.changes['24h'] ?? null,
        state: result.state,
        distanceToPeakPct: result.metrics.distanceToPeakPct,
        hoursWithoutNewHigh: result.metrics.hoursWithoutNewHigh,
        explanation: result.metrics.explanation
      });
    }

    return result;
  }

  getCachedState(symbol: string) {
    return this.activeStatesCache.get(symbol);
  }

  getMemoryEvents(symbol: string) {
    return this.memoryEvents.get(symbol) || [];
  }

  getMemoryEpisodes() {
    return this.memoryEpisodes;
  }
}
