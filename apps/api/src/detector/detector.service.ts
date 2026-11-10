import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SseService } from '../sse/sse.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseService: SseService
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

    const previousCache = this.activeStatesCache.get(symbol);
    const previousState = previousCache?.state || CoinState.OBSERVACION;

    const result = evaluatePlateauDetector({
      symbol,
      candles,
      currentState: previousState,
      previousMetrics: previousCache?.metrics,
      config: this.currentConfig,
      isBackfill
    });

    // Actualizamos cache en memoria
    this.activeStatesCache.set(symbol, {
      state: result.state,
      metrics: result.metrics
    });

    // Solo persistimos en base de datos si la base de datos está disponible
    try {
      // 1. Upsert en MarketState
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

      // 2. Si hubo evento de cambio de estado o meseta
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

        // 3. Si hubo acción de meseta (START / BREAKDOWN / INVALIDATE)
        if (result.plateauAction && result.plateauAction.action !== 'NONE') {
          if (result.plateauAction.action === 'START') {
            await this.prisma.plateauEpisode.create({
              data: {
                symbol,
                startedAt: new Date(result.metrics.peakAt),
                detectedAt: new Date(),
                peakPrice: new Prisma.Decimal(result.metrics.peakPrice),
                rangeHigh: new Prisma.Decimal(result.plateauAction.rangeHigh),
                rangeLow: new Prisma.Decimal(result.plateauAction.rangeLow),
                riseBeforePct: new Prisma.Decimal(result.metrics.impulseTotalPct || 0),
                drawdownAtDetectionPct: new Prisma.Decimal(Math.abs(result.metrics.distanceToPeakPct)),
                status: result.plateauAction.status,
                metricsSnapshot: result.metrics as any,
                algorithmVersion: this.currentConfig.version
              }
            });
          } else if (result.plateauAction.action === 'BREAKDOWN' || result.plateauAction.action === 'INVALIDATE') {
            // Actualizamos último episodio en progreso
            const latestEpisode = await this.prisma.plateauEpisode.findFirst({
              where: { symbol, status: 'IN_PROGRESS' },
              orderBy: { detectedAt: 'desc' }
            });
            if (latestEpisode) {
              await this.prisma.plateauEpisode.update({
                where: { id: latestEpisode.id },
                data: {
                  endedAt: new Date(),
                  status: result.plateauAction.status
                }
              });
            }
          }
        }
      }
    } catch (dbErr) {
      // Ignorar si la base de datos aún no está migrada o en modo offline
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
}
