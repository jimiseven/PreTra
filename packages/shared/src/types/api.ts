import { z } from 'zod';
import { DetectionConfigSchema } from './config.js';

export const AddSymbolSchema = z.object({
  symbol: z.string().min(2).max(30).transform(s => s.trim().toUpperCase()),
  notes: z.string().max(255).optional()
});

export type AddSymbolDto = z.infer<typeof AddSymbolSchema>;

export const UpdateSettingsSchema = z.object({
  detectorConfig: DetectionConfigSchema.partial().optional(),
  maxDailySymbols: z.number().int().min(1).max(50).optional(),
  defaultBackfillDays: z.number().int().min(1).max(30).optional(),
  timezone: z.string().optional()
});

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;

export interface SystemHealthDto {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptimeSeconds: number;
  binanceRestStatus: 'connected' | 'disconnected' | 'rate_limited';
  binanceWsStatus: 'connected' | 'reconnecting' | 'disconnected';
  activeSymbolsCount: number;
  dailyAddedCount: number;
  maxDailySymbols: number;
  lastCandleReceivedAt: number | null;
  gapCount24h: number;
  failedSyncsCount: number;
}
