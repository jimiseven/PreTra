/**
 * PRETRA - Dominio de datos e interfaces principales
 */

export enum MarketType {
  USDM_FUTURES = 'USDM_FUTURES'
}

export enum WatchlistStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export enum SyncStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  STALE = 'STALE'
}

export enum CandleInterval {
  ONE_MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  ONE_HOUR = '1h',
  FOUR_HOURS = '4h',
  TWELVE_HOURS = '12h',
  ONE_DAY = '1d'
}

export enum CoinState {
  OBSERVACION = 'OBSERVACION',
  IMPULSO_ALCISTA = 'IMPULSO_ALCISTA',
  DESACELERACION = 'DESACELERACION',
  MESETA_TEMPRANA = 'MESETA_TEMPRANA',
  RUPTURA_BAJISTA = 'RUPTURA_BAJISTA',
  REACELERACION = 'REACELERACION',
  SIN_DATOS = 'SIN_DATOS'
}

export enum PlateauStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  BROKEN_DOWN = 'BROKEN_DOWN',     // Ruptura bajista confirmada
  INVALIDATED_UP = 'INVALIDATED_UP', // Ruptura alcista / nuevo máximo
  EXPIRED = 'EXPIRED'
}

export interface Candle {
  symbol: string;
  interval: string;
  openTime: number;  // timestamp UTC en milisegundos
  closeTime: number; // timestamp UTC en milisegundos
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  marketType: MarketType;
  status: WatchlistStatus;
  addedAt: Date;
  archivedAt?: Date | null;
  notes?: string | null;
  syncStatus: SyncStatus;
  coverageFrom?: Date | null;
  coverageTo?: Date | null;
  lastCandleAt?: Date | null;
}

export interface TimeWindowChange {
  window: string;
  changePct: number | null;
  referencePrice: number | null;
  referenceTime: number | null;
  hasCoverage: boolean;
}

export interface SpeedMetrics {
  pctPerMinute: number;
  hourlyRate: number;
  returnPerCandle: number;
}

export interface MetricsSnapshot {
  currentPrice: number;
  peakPrice: number;
  peakAt: number;
  distanceToPeakPct: number;
  hoursWithoutNewHigh: number;
  recentRangePct: number;
  rangeHigh: number;
  rangeLow: number;
  impulseStartAt: number | null;
  impulseTotalPct: number | null;
  changes: Record<string, number | null>;
  speeds: SpeedMetrics;
  plateauDurationHours: number | null;
  coverageHours: number;
  confidenceScore: number;
  explanation: string;
  // Métricas avanzadas de meseta ajustadas a ventanas operativas
  range30mPct?: number | null;
  range1hPct?: number | null;
  range2hPct?: number | null;
  range4hPct?: number | null;
  range6hPct?: number | null;
  range12hPct?: number | null;
  range24hPct?: number | null;
  surge5dPct?: number | null;
  isTightPlateau?: boolean;
  // Meseta Amplia / Canal de Consolidación (ej. 0.70 a 0.78, oscilación 3% - 14% por >= 6-12h)
  isWidePlateau?: boolean;
  plateauType?: 'TIGHT' | 'WIDE' | 'NONE';
  channelFloor?: number | null;
  channelCeiling?: number | null;
  channelOscillationPct?: number | null;
  hoursInChannel?: number | null;
  // Divergencia de Open Interest
  oiValueUsd?: number | null;
  oiChange1hPct?: number | null;
  oiChange24hPct?: number | null;
  oiDivergence?: 'EXHAUSTION_DROP' | 'ABSORPTION_SPIKE' | 'NEUTRAL' | 'INSUFFICIENT_DATA';
  oiDivergenceNote?: string | null;
  // Clímax de volumen y mechas de absorción
  hasVolumeClimax?: boolean;
  maxUpperWickPct?: number | null;
  climaxVolumeRatio?: number | null;
  absorptionState?: 'HEAVY_ABSORPTION' | 'MODERATE_ABSORPTION' | 'NORMAL';
  absorptionNote?: string | null;
  // Funding Rate y riesgo de liquidación
  fundingRatePct?: number | null;
  fundingRateAnnualizedPct?: number | null;
  fundingStatus?: 'EXTREME_LONG_CROWD' | 'HIGH_LONG' | 'NORMAL' | 'EXTREME_SHORT_CROWD';
  nextFundingTime?: number | null;
  liquidationRisk?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MarketStateRecord {
  symbol: string;
  currentState: CoinState;
  lastEvaluatedAt: Date;
  peakPrice: number;
  peakAt: Date;
  impulseStartAt?: Date | null;
  currentPlateauStartAt?: Date | null;
  metrics: MetricsSnapshot;
  algorithmVersion: string;
}

export interface PlateauOutcome {
  timeHorizon: string; // "+6h", "+12h", "+24h", "+48h", "+72h"
  priceAtHorizon?: number | null;
  returnFromPeakPct?: number | null;
  adverseHighPct?: number | null;
  status: 'PENDING' | 'EVALUATED' | 'INSUFFICIENT_DATA';
}

export interface PlateauEpisode {
  id: string;
  symbol: string;
  startedAt: Date;
  detectedAt: Date;
  endedAt?: Date | null;
  peakPrice: number;
  rangeHigh: number;
  rangeLow: number;
  riseBeforePct: number;
  drawdownAtDetectionPct: number;
  status: PlateauStatus;
  metricsSnapshot: MetricsSnapshot;
  outcomes?: Record<string, PlateauOutcome> | null;
  algorithmVersion: string;
}
