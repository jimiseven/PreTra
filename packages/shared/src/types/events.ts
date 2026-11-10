import { CoinState, MetricsSnapshot, PlateauEpisode, WatchlistItem } from './domain.js';

export enum EventType {
  STATE_CHANGE = 'STATE_CHANGE',
  NEW_HIGH = 'NEW_HIGH',
  IMPULSO_CONFIRMED = 'IMPULSO_CONFIRMED',
  PLATEAU_DETECTED = 'PLATEAU_DETECTED',
  BREAKDOWN_CONFIRMED = 'BREAKDOWN_CONFIRMED',
  REACCELERATION_CONFIRMED = 'REACCELERATION_CONFIRMED',
  SYNC_COMPLETED = 'SYNC_COMPLETED',
  SYNC_FAILED = 'SYNC_FAILED'
}

export interface DetectionEvent {
  id: string;
  symbol: string;
  eventType: EventType;
  stateFrom: CoinState;
  stateTo: CoinState;
  detectedAt: Date;
  effectiveAt: Date;
  isRetrospective: boolean;
  metricsSnapshot: MetricsSnapshot;
  configVersion: string;
  explanation: string;
  dedupeKey: string;
}

export type SseMessageType = 
  | 'TICKER_UPDATE'
  | 'STATE_CHANGE'
  | 'NEW_EVENT'
  | 'WATCHLIST_UPDATE'
  | 'PLATEAU_EPISODE'
  | 'SYSTEM_HEALTH'
  | 'HEARTBEAT';

export interface SsePayload<T = unknown> {
  type: SseMessageType;
  timestamp: number;
  data: T;
}

export interface WatchlistSummaryItem {
  id: string;
  symbol: string;
  price: number;
  change1h: number | null;
  change24h: number | null;
  accumulatedImpulsePct: number | null;
  hoursWithoutNewHigh: number;
  distanceToPeakPct: number;
  state: CoinState;
  status: string;
  addedAt: string;
  lastCandleAt: string | null;
  coverageHours: number;
  isStale: boolean;
  explanation: string;
  peakPrice: number;
}
