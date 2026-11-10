import { z } from 'zod';

export const DetectionConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  minImpulsePct: z.number().min(10).max(1000).default(70.0), // Mínimo impulso previo para considerar candidato (ej. +70%)
  impulseWindowHours: z.number().min(1).max(168).default(48.0), // Ventana rodante para buscar impulso (24h - 48h)
  plateauMaxRangePct: z.number().min(0.5).max(20).default(5.0), // Rango de consolidación máximo (ej. <= 5%)
  plateauMaxDistanceToPeakPct: z.number().min(0.1).max(15).default(3.0), // Distancia máxima al techo (ej. <= 3%)
  minHoursWithoutNewHigh: z.number().min(0.5).max(72).default(3.0), // Horas sin nuevo máximo para meseta establecida
  earlyPlateauMinHours: z.number().min(0.5).max(24).default(1.5), // Horas para meseta temprana progresiva
  velocityDropFraction: z.number().min(0.05).max(0.9).default(0.35), // Velocidad reciente vs velocidad previa de impulso
  breakdownPullbackPct: z.number().min(1.0).max(30).default(4.0), // Retroceso para confirmar ruptura bajista
  confirmationCandles: z.number().min(1).max(30).default(3), // N velas consecutivas para confirmar cambio de estado
  cooldownMinutes: z.number().min(0).max(1440).default(60), // Cooldown entre alertas repetidas del mismo estado
  useClosesForPeaks: z.boolean().default(false) // Si true usa close; si false usa high
});

export type DetectionConfig = z.infer<typeof DetectionConfigSchema>;

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  version: '1.0.0',
  minImpulsePct: 70.0,
  impulseWindowHours: 48.0,
  plateauMaxRangePct: 5.0,
  plateauMaxDistanceToPeakPct: 3.0,
  minHoursWithoutNewHigh: 3.0,
  earlyPlateauMinHours: 1.5,
  velocityDropFraction: 0.35,
  breakdownPullbackPct: 4.0,
  confirmationCandles: 3,
  cooldownMinutes: 60,
  useClosesForPeaks: false
};
