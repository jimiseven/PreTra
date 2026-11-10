import { Candle, CoinState, MetricsSnapshot, PlateauStatus } from '../types/domain.js';
import { DetectionConfig, DEFAULT_DETECTION_CONFIG } from '../types/config.js';
import { EventType, DetectionEvent } from '../types/events.js';
import {
  calculateReturnPct,
  calculateDistanceToPeakPct,
  calculateRangePct,
  calculateGeometricReturnPerCandle,
  roundTo,
  formatPrice
} from '../utils/math.js';

export interface DetectorInput {
  symbol: string;
  candles: Candle[]; // Velas cerradas de 1m ordenadas ascendente por openTime
  currentState?: CoinState;
  previousMetrics?: MetricsSnapshot | null;
  config?: Partial<DetectionConfig>;
  isBackfill?: boolean;
}

export interface DetectorOutput {
  symbol: string;
  state: CoinState;
  previousState: CoinState;
  stateChanged: boolean;
  metrics: MetricsSnapshot;
  event?: Omit<DetectionEvent, 'id'> | null;
  plateauAction?: {
    action: 'START' | 'CONFIRM' | 'BREAKDOWN' | 'INVALIDATE' | 'NONE';
    status: PlateauStatus;
    rangeHigh: number;
    rangeLow: number;
    peakPrice: number;
  };
}

/**
 * Motor central de detección determinista de mesetas tempranas
 */
export function evaluatePlateauDetector(input: DetectorInput): DetectorOutput {
  const { symbol, candles, isBackfill = false } = input;
  const config: DetectionConfig = { ...DEFAULT_DETECTION_CONFIG, ...input.config };
  const previousState = input.currentState || CoinState.OBSERVACION;

  // 1. Verificación básica de datos
  if (!candles || candles.length < 15) {
    const emptyMetrics: MetricsSnapshot = {
      currentPrice: candles && candles.length > 0 ? candles[candles.length - 1].close : 0,
      peakPrice: 0,
      peakAt: 0,
      distanceToPeakPct: 0,
      hoursWithoutNewHigh: 0,
      recentRangePct: 0,
      rangeHigh: 0,
      rangeLow: 0,
      impulseStartAt: null,
      impulseTotalPct: null,
      changes: {},
      speeds: { pctPerMinute: 0, hourlyRate: 0, returnPerCandle: 0 },
      plateauDurationHours: null,
      coverageHours: roundTo((candles?.length || 0) / 60, 1),
      confidenceScore: 0,
      explanation: 'Datos insuficientes para evaluación (< 15 velas de 1m).'
    };

    return {
      symbol,
      state: CoinState.SIN_DATOS,
      previousState,
      stateChanged: previousState !== CoinState.SIN_DATOS,
      metrics: emptyMetrics,
      event: null,
      plateauAction: { action: 'NONE', status: PlateauStatus.IN_PROGRESS, rangeHigh: 0, rangeLow: 0, peakPrice: 0 }
    };
  }

  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle.close;
  const currentTime = lastCandle.openTime;

  // 2. Cálculo de retornos por ventanas temporales estándar (compuesto multiplicativo)
  const windowMinutesMap: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '12h': 720,
    '24h': 1440,
    '48h': 2880,
    '72h': 4320
  };

  const changes: Record<string, number | null> = {};
  for (const [winKey, minutes] of Object.entries(windowMinutesMap)) {
    const targetTime = currentTime - minutes * 60_000;
    // Buscamos la vela más cercana a ese timestamp
    let refCandle: Candle | null = null;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].openTime <= targetTime) {
        refCandle = candles[i];
        break;
      }
    }
    if (refCandle) {
      changes[winKey] = roundTo(calculateReturnPct(currentPrice, refCandle.open), 2);
    } else {
      changes[winKey] = null; // No hay cobertura para esta ventana
    }
  }

  // 3. Ventana rodante para análisis de impulso (default 48h)
  const impulseWindowMs = config.impulseWindowHours * 3600_000;
  const windowStartMs = Math.max(candles[0].openTime, currentTime - impulseWindowMs);
  const windowCandles = candles.filter(c => c.openTime >= windowStartMs);

  // 4. Búsqueda de máximo dentro de la ventana de análisis
  let peakPrice = -Infinity;
  let peakAt = windowCandles[0].openTime;
  let peakIndex = 0;

  for (let i = 0; i < windowCandles.length; i++) {
    const c = windowCandles[i];
    const priceToCheck = config.useClosesForPeaks ? c.close : c.high;
    if (priceToCheck > peakPrice) {
      peakPrice = priceToCheck;
      peakAt = c.openTime;
      peakIndex = i;
    }
  }

  const distanceToPeakPct = roundTo(calculateDistanceToPeakPct(currentPrice, peakPrice), 2);
  const hoursWithoutNewHigh = roundTo(Math.max(0, (currentTime - peakAt) / 3600_000), 2);

  // 5. Identificación aproximada del inicio del impulso previo al máximo
  // Buscamos el mínimo previo al máximo en la ventana
  let impulseStartPrice = Infinity;
  let impulseStartAt: number | null = null;
  let impulseStartIndex = 0;

  for (let i = 0; i <= peakIndex; i++) {
    const c = windowCandles[i];
    const lowToCheck = config.useClosesForPeaks ? c.close : c.low;
    if (lowToCheck < impulseStartPrice) {
      impulseStartPrice = lowToCheck;
      impulseStartAt = c.openTime;
      impulseStartIndex = i;
    }
  }

  const impulseTotalPct = impulseStartPrice > 0 && impulseStartPrice < Infinity
    ? roundTo(calculateReturnPct(peakPrice, impulseStartPrice), 2)
    : 0;

  const impulseDurationHours = impulseStartAt ? roundTo((peakAt - impulseStartAt) / 3600_000, 1) : 0;
  const impulseDurationMinutes = Math.max(1, (peakAt - (impulseStartAt || peakAt)) / 60_000);
  const impulseSpeedPerMin = impulseTotalPct / impulseDurationMinutes;

  // 6. Métricas de velocidad reciente (última 1 hora)
  const change1h = changes['1h'] ?? 0;
  const recentSpeedPerMin = change1h / 60;
  const candles1h = Math.min(60, windowCandles.length);
  const returnPerCandle = calculateGeometricReturnPerCandle(
    windowCandles[Math.max(0, windowCandles.length - candles1h)].open,
    currentPrice,
    candles1h
  );

  // 7. Rango de consolidación en las últimas N horas desde el pico o últimas 4h
  const consolidationWindowHours = Math.max(1, Math.min(6, hoursWithoutNewHigh));
  const consolidationStartMs = currentTime - consolidationWindowHours * 3600_000;
  const consolidationCandles = windowCandles.filter(c => c.openTime >= consolidationStartMs);

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (const c of consolidationCandles) {
    const highVal = config.useClosesForPeaks ? c.close : c.high;
    const lowVal = config.useClosesForPeaks ? c.close : c.low;
    if (highVal > rangeHigh) rangeHigh = highVal;
    if (lowVal < rangeLow) rangeLow = lowVal;
  }
  if (rangeHigh === -Infinity) rangeHigh = peakPrice;
  if (rangeLow === Infinity) rangeLow = currentPrice;

  const recentRangePct = roundTo(calculateRangePct(rangeHigh, rangeLow), 2);

  // 8. Evaluación de condiciones de Estado
  const hasSignificantImpulse = impulseTotalPct >= config.minImpulsePct;
  const isNearPeak = Math.abs(distanceToPeakPct) <= config.plateauMaxDistanceToPeakPct;
  const isRangeTight = recentRangePct <= config.plateauMaxRangePct;
  const hasVelocityDropped = Math.abs(recentSpeedPerMin) < Math.abs(impulseSpeedPerMin * config.velocityDropFraction);
  const hasTimeWithoutHigh = hoursWithoutNewHigh >= config.minHoursWithoutNewHigh;
  const hasEarlyPlateauTime = hoursWithoutNewHigh >= config.earlyPlateauMinHours;

  let newState: CoinState = previousState;
  let confidenceScore = 0;
  let plateauAction: DetectorOutput['plateauAction'] = {
    action: 'NONE',
    status: PlateauStatus.IN_PROGRESS,
    rangeHigh,
    rangeLow,
    peakPrice
  };

  // Comprobar si se rompe el máximo anterior al alza mientras estaba en meseta o desaceleración
  const isNewHighJustMade = peakAt >= currentTime - 60_000;
  const isBreakoutFromPlateau = (previousState === CoinState.MESETA_TEMPRANA || previousState === CoinState.DESACELERACION) && isNewHighJustMade;

  if (isBreakoutFromPlateau) {
    newState = CoinState.REACELERACION;
    plateauAction = {
      action: 'INVALIDATE',
      status: PlateauStatus.INVALIDATED_UP,
      rangeHigh,
      rangeLow,
      peakPrice
    };
  } else if (!hasSignificantImpulse) {
    newState = CoinState.OBSERVACION;
  } else {
    // Hay un impulso significativo previo (ej. >= 70%)
    if (hoursWithoutNewHigh < config.earlyPlateauMinHours && !hasVelocityDropped) {
      newState = CoinState.IMPULSO_ALCISTA;
      confidenceScore = 80;
    } else if (hasSignificantImpulse && hasTimeWithoutHigh && isNearPeak && isRangeTight) {
      // Meseta confirmada y establecida
      newState = CoinState.MESETA_TEMPRANA;
      confidenceScore = Math.min(95, 70 + (hoursWithoutNewHigh * 3));
      plateauAction = {
        action: previousState === CoinState.MESETA_TEMPRANA ? 'NONE' : 'START',
        status: PlateauStatus.IN_PROGRESS,
        rangeHigh,
        rangeLow,
        peakPrice
      };
    } else if (hasSignificantImpulse && hasEarlyPlateauTime && isNearPeak) {
      // Meseta temprana progresiva / Desaceleración
      newState = CoinState.DESACELERACION;
      confidenceScore = 65;
    } else if (previousState === CoinState.MESETA_TEMPRANA || previousState === CoinState.DESACELERACION) {
      // Comprobar ruptura bajista
      const breakdownThreshold = rangeLow * (1 - config.breakdownPullbackPct / 100);
      if (currentPrice < breakdownThreshold || distanceToPeakPct < -config.breakdownPullbackPct * 1.5) {
        newState = CoinState.RUPTURA_BAJISTA;
        confidenceScore = 85;
        plateauAction = {
          action: 'BREAKDOWN',
          status: PlateauStatus.BROKEN_DOWN,
          rangeHigh,
          rangeLow,
          peakPrice
        };
      }
    }
  }

  // 9. Redacción de explicación puramente fáctica
  const speedDisplay = roundTo(recentSpeedPerMin * 60, 2);
  const explanationParts = [
    `Impulso estimado +${impulseTotalPct}% en ${impulseDurationHours}h.`,
    `Lleva ${hoursWithoutNewHigh}h sin nuevo máximo (máx: ${formatPrice(peakPrice)}).`,
    `A ${distanceToPeakPct}% del máximo.`,
    `Últimos 60m: ${change1h >= 0 ? '+' : ''}${change1h}%.`,
    `Rango consolidación reciente: ${recentRangePct}%.`
  ];
  const explanation = explanationParts.join(' ');

  const metrics: MetricsSnapshot = {
    currentPrice,
    peakPrice,
    peakAt,
    distanceToPeakPct,
    hoursWithoutNewHigh,
    recentRangePct,
    rangeHigh,
    rangeLow,
    impulseStartAt,
    impulseTotalPct,
    changes,
    speeds: {
      pctPerMinute: roundTo(recentSpeedPerMin, 4),
      hourlyRate: speedDisplay,
      returnPerCandle: roundTo(returnPerCandle, 4)
    },
    plateauDurationHours: (newState === CoinState.MESETA_TEMPRANA || newState === CoinState.DESACELERACION)
      ? hoursWithoutNewHigh
      : null,
    coverageHours: roundTo(candles.length / 60, 1),
    confidenceScore,
    explanation
  };

  const stateChanged = previousState !== newState;

  let event: Omit<DetectionEvent, 'id'> | null = null;
  if (stateChanged) {
    let eventType = EventType.STATE_CHANGE;
    if (newState === CoinState.MESETA_TEMPRANA) eventType = EventType.PLATEAU_DETECTED;
    if (newState === CoinState.RUPTURA_BAJISTA) eventType = EventType.BREAKDOWN_CONFIRMED;
    if (newState === CoinState.REACELERACION) eventType = EventType.REACCELERATION_CONFIRMED;

    event = {
      symbol,
      eventType,
      stateFrom: previousState,
      stateTo: newState,
      detectedAt: new Date(currentTime),
      effectiveAt: new Date(currentTime),
      isRetrospective: isBackfill,
      metricsSnapshot: metrics,
      configVersion: config.version,
      explanation,
      dedupeKey: `${symbol}:${newState}:${Math.floor(currentTime / (config.cooldownMinutes * 60_000))}`
    };
  }

  return {
    symbol,
    state: newState,
    previousState,
    stateChanged,
    metrics,
    event,
    plateauAction
  };
}
