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
  openInterestData?: {
    currentOiValueUsd?: number | null;
    oiChange1hPct?: number | null;
    oiChange24hPct?: number | null;
  } | null;
  fundingData?: {
    fundingRatePct?: number | null;
    nextFundingTime?: number | null;
  } | null;
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

  // 7.1 Rangos específicos para ventanas operativas: 30m, 1h, 2h, 4h
  function computeWindowRange(mins: number): number | null {
    const start = currentTime - mins * 60_000;
    const wCandles = windowCandles.filter(c => c.openTime >= start);
    if (wCandles.length < 2) return null;
    let max = -Infinity;
    let min = Infinity;
    for (const c of wCandles) {
      const highVal = config.useClosesForPeaks ? c.close : c.high;
      const lowVal = config.useClosesForPeaks ? c.close : c.low;
      if (highVal > max) max = highVal;
      if (lowVal < min) min = lowVal;
    }
    if (max <= 0 || min <= 0 || max === -Infinity) return null;
    return roundTo(calculateRangePct(max, min), 2);
  }

  const range30mPct = computeWindowRange(30);
  const range1hPct = computeWindowRange(60);
  const range2hPct = computeWindowRange(120);
  const range4hPct = computeWindowRange(240);
  const range6hPct = computeWindowRange(360);
  const range12hPct = computeWindowRange(720);
  const range24hPct = computeWindowRange(1440);

  // Subida acumulada de los últimos 5 días (120h)
  const fiveDaysAgoMs = currentTime - 5 * 24 * 3600_000;
  let refCandle5d: Candle | null = null;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].openTime >= fiveDaysAgoMs) {
      refCandle5d = candles[i];
      break;
    }
  }
  const surge5dPct = refCandle5d ? roundTo(calculateReturnPct(currentPrice, refCandle5d.open), 2) : impulseTotalPct;

  // Detección de meseta estrecha (subidas y bajas no mayores a 2% en las últimas 2h o 30m)
  const tightThreshold = config.tightPlateauThresholdPct || 2.0;
  const isTightIn2h = range2hPct !== null && range2hPct <= tightThreshold;
  const isTightIn30m = range30mPct !== null && range30mPct <= tightThreshold && hoursWithoutNewHigh >= 0.5;
  const isTightPlateau = isTightIn2h || isTightIn30m;

  // 7.1.1 Detección de Meseta Amplia / Canal de Consolidación (ej. 0.70 a 0.78 durante >= 6h a 12h+ tras subida de 48-72h)
  const wideMinOscillation = config.widePlateauMinOscillationPct ?? 3.0;
  const wideMaxOscillation = config.widePlateauMaxOscillationPct ?? 14.0;
  const wideMinHours = config.widePlateauMinHours ?? 6.0;
  const wideMaxDistToPeak = config.widePlateauMaxDistanceToPeakPct ?? 15.0;

  // Evaluamos las velas del canal desde que no hay nuevo máximo (o en una ventana de hasta 36h)
  const channelHours = Math.max(wideMinHours, Math.min(36, hoursWithoutNewHigh));
  const channelStartMs = currentTime - channelHours * 3600_000;
  const channelCandles = windowCandles.filter(c => c.openTime >= channelStartMs);

  let channelCeiling = -Infinity;
  let channelFloor = Infinity;
  for (const c of channelCandles) {
    const highVal = config.useClosesForPeaks ? c.close : c.high;
    const lowVal = config.useClosesForPeaks ? c.close : c.low;
    if (highVal > channelCeiling) channelCeiling = highVal;
    if (lowVal < channelFloor) channelFloor = lowVal;
  }
  if (channelCeiling === -Infinity) channelCeiling = peakPrice;
  if (channelFloor === Infinity) channelFloor = currentPrice;

  const channelOscillationPct = roundTo(calculateRangePct(channelCeiling, channelFloor), 2);

  // Comprobar condiciones de canal amplio sostenido
  const hasPriorRally = (impulseTotalPct >= 30.0) ||
                        (surge5dPct !== null && surge5dPct >= 20.0) ||
                        ((changes['48h'] ?? 0) !== null && (changes['48h'] ?? 0)! >= 20.0) ||
                        ((changes['72h'] ?? 0) !== null && (changes['72h'] ?? 0)! >= 25.0);

  const hasChannelDuration = hoursWithoutNewHigh >= wideMinHours;
  const isWithinOscillationBand = channelOscillationPct >= wideMinOscillation && channelOscillationPct <= wideMaxOscillation;
  const isFloorHolding = currentPrice >= channelFloor * 0.985; // El precio actual no ha perforado el piso del canal
  const isWithinPeakTolerance = Math.abs(distanceToPeakPct) <= wideMaxDistToPeak;

  const isWidePlateau = hasPriorRally && hasChannelDuration && isWithinOscillationBand && isFloorHolding && isWithinPeakTolerance;
  const plateauType: 'TIGHT' | 'WIDE' | 'NONE' = isTightPlateau ? 'TIGHT' : (isWidePlateau ? 'WIDE' : 'NONE');

  // 7.2 Detección de Clímax de Volumen y Absorción (Mechas Superiores)
  const recentCandlesForWicks = windowCandles.slice(-Math.min(60, windowCandles.length));
  let sumVol = 0;
  for (const c of recentCandlesForWicks) sumVol += c.volume;
  const avgVol = recentCandlesForWicks.length > 0 ? (sumVol / recentCandlesForWicks.length) : 1;

  let maxUpperWickPct = 0;
  let maxClimaxVolRatio = 1.0;
  let hasVolumeClimax = false;

  for (const c of recentCandlesForWicks) {
    const range = c.high - c.low;
    if (range > 0) {
      const upperWick = c.high - Math.max(c.open, c.close);
      const wickPct = (upperWick / range) * 100;
      const volRatio = avgVol > 0 ? (c.volume / avgVol) : 1;
      if (wickPct > maxUpperWickPct) maxUpperWickPct = wickPct;
      if (volRatio > maxClimaxVolRatio) maxClimaxVolRatio = volRatio;

      if (volRatio >= 2.0 && wickPct >= 38.0) {
        hasVolumeClimax = true;
      }
    }
  }

  maxUpperWickPct = roundTo(maxUpperWickPct, 1);
  maxClimaxVolRatio = roundTo(maxClimaxVolRatio, 1);

  let absorptionState: 'HEAVY_ABSORPTION' | 'MODERATE_ABSORPTION' | 'NORMAL' = 'NORMAL';
  let absorptionNote: string | null = null;
  if (hasVolumeClimax || (maxUpperWickPct >= 45 && maxClimaxVolRatio >= 2.0)) {
    absorptionState = maxUpperWickPct >= 55 ? 'HEAVY_ABSORPTION' : 'MODERATE_ABSORPTION';
    absorptionNote = `Absorción detectada: Mecha superior de ${maxUpperWickPct}% con volumen ${maxClimaxVolRatio}x vs media (rechazo institucional).`;
  }

  // 7.3 Divergencia de Open Interest
  let oiDivergence: 'EXHAUSTION_DROP' | 'ABSORPTION_SPIKE' | 'NEUTRAL' | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA';
  let oiDivergenceNote: string | null = null;
  const oi1h = input.openInterestData?.oiChange1hPct ?? null;
  const oiVal = input.openInterestData?.currentOiValueUsd ?? null;
  const oi24h = input.openInterestData?.oiChange24hPct ?? null;

  if (typeof oi1h === 'number') {
    if (isTightPlateau && oi1h <= -2.5) {
      oiDivergence = 'EXHAUSTION_DROP';
      oiDivergenceNote = `Agotamiento de OI: El Interés Abierto cayó ${oi1h.toFixed(1)}% en 1h con precio en meseta (cierre de largos).`;
    } else if (isTightPlateau && oi1h >= 3.5) {
      oiDivergence = 'ABSORPTION_SPIKE';
      oiDivergenceNote = `Absorción de OI: El Interés Abierto aumentó +${oi1h.toFixed(1)}% en 1h sin superar el techo (presión de cortos).`;
    } else {
      oiDivergence = 'NEUTRAL';
      oiDivergenceNote = `OI equilibrado (${oi1h >= 0 ? '+' : ''}${oi1h.toFixed(1)}% en 1h).`;
    }
  }

  // 7.4 Monitoreo de Funding Rate y riesgo de liquidaciones
  const fundingRatePct = input.fundingData?.fundingRatePct ?? null;
  const nextFundingTime = input.fundingData?.nextFundingTime ?? null;
  let fundingRateAnnualizedPct: number | null = null;
  let fundingStatus: 'EXTREME_LONG_CROWD' | 'HIGH_LONG' | 'NORMAL' | 'EXTREME_SHORT_CROWD' = 'NORMAL';
  let liquidationRisk: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

  if (typeof fundingRatePct === 'number') {
    fundingRateAnnualizedPct = roundTo(fundingRatePct * 3 * 365, 2);
    if (fundingRatePct >= 0.08) {
      fundingStatus = 'EXTREME_LONG_CROWD';
      liquidationRisk = 'HIGH';
    } else if (fundingRatePct >= 0.03) {
      fundingStatus = 'HIGH_LONG';
      liquidationRisk = isTightPlateau ? 'HIGH' : 'MEDIUM';
    } else if (fundingRatePct <= -0.04) {
      fundingStatus = 'EXTREME_SHORT_CROWD';
      liquidationRisk = 'MEDIUM';
    } else {
      fundingStatus = 'NORMAL';
      liquidationRisk = 'LOW';
    }
  }

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
  } else if (!hasSignificantImpulse && !(surge5dPct !== null && surge5dPct >= 20.0 && (isTightPlateau || isWidePlateau)) && !isWidePlateau) {
    newState = CoinState.OBSERVACION;
  } else {
    // Hay un impulso significativo previo (ej. >= 70% o subida sostenida >= 20% o canal amplio)
    // 1. Prioridad: Meseta estrecha (rango <= 2% en 2h o 30m cerca del pico)
    if (isTightPlateau && Math.abs(distanceToPeakPct) <= config.plateauMaxDistanceToPeakPct * 1.5 && hoursWithoutNewHigh >= 0.5) {
      newState = CoinState.MESETA_TEMPRANA;
      confidenceScore = Math.min(95, 80 + Math.floor(hoursWithoutNewHigh * 3));
      plateauAction = {
        action: previousState === CoinState.MESETA_TEMPRANA ? 'NONE' : 'START',
        status: PlateauStatus.IN_PROGRESS,
        rangeHigh,
        rangeLow,
        peakPrice
      };
    } else if (isWidePlateau) {
      // 2. Meseta Amplia / Canal de Consolidación en Máximos (ej. 0.70 a 0.78 durante >= 6h a 12h)
      newState = CoinState.MESETA_TEMPRANA;
      confidenceScore = Math.min(92, 75 + Math.floor(Math.min(hoursWithoutNewHigh, 24) * 0.7));
      plateauAction = {
        action: previousState === CoinState.MESETA_TEMPRANA ? 'NONE' : 'START',
        status: PlateauStatus.IN_PROGRESS,
        rangeHigh: channelCeiling,
        rangeLow: channelFloor,
        peakPrice
      };
    } else if (hoursWithoutNewHigh < config.earlyPlateauMinHours && !hasVelocityDropped) {
      newState = CoinState.IMPULSO_ALCISTA;
      confidenceScore = 80;
    } else if (hasSignificantImpulse && hasTimeWithoutHigh && isNearPeak && isRangeTight) {
      // Meseta confirmada y establecida estándar
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
      const effectiveFloor = (isWidePlateau || plateauType === 'WIDE') ? channelFloor : rangeLow;
      const breakdownThreshold = effectiveFloor * (1 - config.breakdownPullbackPct / 100);
      if (currentPrice < breakdownThreshold || (!isWidePlateau && distanceToPeakPct < -config.breakdownPullbackPct * 1.5)) {
        newState = CoinState.RUPTURA_BAJISTA;
        confidenceScore = 85;
        plateauAction = {
          action: 'BREAKDOWN',
          status: PlateauStatus.BROKEN_DOWN,
          rangeHigh: channelCeiling,
          rangeLow: effectiveFloor,
          peakPrice
        };
      }
    }
  }

  // 9. Redacción de explicación puramente fáctica
  const speedDisplay = roundTo(recentSpeedPerMin * 60, 2);
  const explanationParts = [];

  if (newState === CoinState.MESETA_TEMPRANA && isWidePlateau) {
    explanationParts.push(
      `Meseta Amplia (Canal de Consolidación): Precio oscilando entre ${formatPrice(channelFloor)} y ${formatPrice(channelCeiling)} (${channelOscillationPct}% amplitud) durante ${hoursWithoutNewHigh.toFixed(1)}h tras subida previa (+${impulseTotalPct}%). Piso sostenido sin quiebre.`
    );
  } else if (newState === CoinState.MESETA_TEMPRANA && isTightPlateau) {
    const activeTightWin = isTightIn2h ? '2h' : '30m';
    const activeTightVal = isTightIn2h ? range2hPct : range30mPct;
    explanationParts.push(
      `Meseta confirmada: En las últimas ${activeTightWin} el precio osciló apenas ${activeTightVal}% (<= ${tightThreshold}% umbral).`,
      `Sin nuevo máximo en ${hoursWithoutNewHigh}h tras subida previa (+${impulseTotalPct}%).`,
      `A ${distanceToPeakPct}% del máximo.`
    );
  } else {
    explanationParts.push(
      `Impulso estimado +${impulseTotalPct}% en ${impulseDurationHours}h.`,
      `Lleva ${hoursWithoutNewHigh}h sin nuevo máximo (máx: ${formatPrice(peakPrice)}).`,
      `A ${distanceToPeakPct}% del máximo.`,
      `Últimos 60m: ${change1h >= 0 ? '+' : ''}${change1h}%.`,
      `Rango consolidación reciente: ${recentRangePct}%.`
    );
  }

  if (absorptionNote) {
    explanationParts.push(absorptionNote);
  }
  if (oiDivergenceNote) {
    explanationParts.push(oiDivergenceNote);
  }

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
    explanation,
    range30mPct,
    range1hPct,
    range2hPct,
    range4hPct,
    range6hPct,
    range12hPct,
    range24hPct,
    surge5dPct,
    isTightPlateau,
    isWidePlateau,
    plateauType,
    channelFloor: isWidePlateau ? channelFloor : null,
    channelCeiling: isWidePlateau ? channelCeiling : null,
    channelOscillationPct: isWidePlateau ? channelOscillationPct : null,
    hoursInChannel: isWidePlateau ? hoursWithoutNewHigh : null,
    oiValueUsd: oiVal,
    oiChange1hPct: oi1h,
    oiChange24hPct: oi24h,
    oiDivergence,
    oiDivergenceNote,
    hasVolumeClimax,
    maxUpperWickPct,
    climaxVolumeRatio: maxClimaxVolRatio,
    absorptionState,
    absorptionNote,
    fundingRatePct,
    fundingRateAnnualizedPct,
    fundingStatus,
    nextFundingTime,
    liquidationRisk
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
