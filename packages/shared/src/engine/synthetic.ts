import { Candle } from '../types/domain.js';

/**
 * Generador de series sintéticas de velas de 1 minuto para tests reproducibles
 */
export interface GenerateOptions {
  symbol?: string;
  startPrice?: number;
  startTime?: number; // timestamp ms UTC
  intervalMinutes?: number;
}

export function createBaseCandle(
  symbol: string,
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000,
  isClosed: boolean = true
): Candle {
  return {
    symbol,
    interval: '1m',
    openTime,
    closeTime: openTime + 60_000 - 1,
    open,
    high,
    low,
    close,
    volume,
    isClosed
  };
}

/**
 * Genera una serie de N minutos con tendencia y volatilidad
 */
export function generateCandleSeries(
  minutes: number,
  startPrice: number,
  targetReturnPct: number,
  startTime: number = Date.now() - minutes * 60_000,
  volatilityPct: number = 0.2,
  symbol: string = 'TESTUSDT'
): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = startPrice;
  const targetEndPrice = startPrice * (1 + targetReturnPct / 100);
  const driftPerCandle = Math.pow(targetEndPrice / startPrice, 1 / minutes);

  for (let i = 0; i < minutes; i++) {
    const openTime = startTime + i * 60_000;
    const open = currentPrice;
    
    // Movimiento determinista + fluctuación
    const nextCloseEstimate = open * driftPerCandle;
    const randomWobble = 1 + ((Math.sin(i / 10) * volatilityPct) / 100);
    const close = nextCloseEstimate * randomWobble;
    
    const high = Math.max(open, close) * (1 + Math.abs(volatilityPct) / 200);
    const low = Math.min(open, close) * (1 - Math.abs(volatilityPct) / 200);

    candles.push(createBaseCandle(symbol, openTime, open, high, low, close, 1500));
    currentPrice = close;
  }

  return candles;
}

/**
 * Genera un escenario de IMPULSO + MESETA (Caso A)
 */
export function generateImpulseAndPlateauScenario(
  symbol: string = 'CASE_A_USDT',
  startTime: number = 1700000000000
): { candles: Candle[]; peakPrice: number; plateauStartTime: number } {
  // 1. Subida del +150% en 12 horas (720 minutos)
  const impulseMinutes = 720;
  const impulseCandles = generateCandleSeries(impulseMinutes, 10.0, 150.0, startTime, 0.15, symbol);
  
  const peakPrice = impulseCandles[impulseCandles.length - 1].close; // aprox 25.0
  const plateauStartTime = startTime + impulseMinutes * 60_000;
  
  // 2. Meseta durante 8 horas (480 minutos) oscilando en un rango estrecho del 2%
  const plateauMinutes = 480;
  const plateauCandles: Candle[] = [];
  
  for (let i = 0; i < plateauMinutes; i++) {
    const openTime = plateauStartTime + i * 60_000;
    // Oscilación dentro de [peakPrice * 0.985, peakPrice * 0.998] (no nuevo máximo, distancia <= 1.5%)
    const wave = Math.sin(i / 15) * 0.007; // +- 0.7%
    const base = peakPrice * 0.99;
    const close = base * (1 + wave);
    const open = base * (1 - wave);
    const high = Math.max(open, close) * 1.001;
    const low = Math.min(open, close) * 0.999;
    
    plateauCandles.push(createBaseCandle(symbol, openTime, open, high, low, close, 800));
  }

  return {
    candles: [...impulseCandles, ...plateauCandles],
    peakPrice,
    plateauStartTime
  };
}

/**
 * Genera escenario de PAUSA Y NUEVO IMPULSO (Caso B)
 */
export function generatePauseAndNewImpulseScenario(
  symbol: string = 'CASE_B_USDT',
  startTime: number = 1700000000000
): Candle[] {
  // 1. Impulso inicial +100% en 8h (480m)
  const impulse1 = generateCandleSeries(480, 10.0, 100.0, startTime, 0.2, symbol);
  const endImpulse1 = impulse1[impulse1.length - 1].close; // 20.0
  const pauseStart = startTime + 480 * 60_000;

  // 2. Pausa de 2h (120m) cerca de 20.0
  const pauseCandles: Candle[] = [];
  for (let i = 0; i < 120; i++) {
    const t = pauseStart + i * 60_000;
    const price = endImpulse1 * (0.99 + Math.sin(i / 10) * 0.005);
    pauseCandles.push(createBaseCandle(symbol, t, price, price * 1.002, price * 0.998, price));
  }
  const resumeStart = pauseStart + 120 * 60_000;

  // 3. Reaceleración de otro +40% en 4h (240m)
  const impulse2 = generateCandleSeries(240, endImpulse1, 40.0, resumeStart, 0.2, symbol);

  return [...impulse1, ...pauseCandles, ...impulse2];
}

/**
 * Genera escenario de MESETA Y RUPTURA BAJISTA (Caso C)
 */
export function generatePlateauAndBreakdownScenario(
  symbol: string = 'CASE_C_USDT',
  startTime: number = 1700000000000
): Candle[] {
  const { candles, peakPrice, plateauStartTime } = generateImpulseAndPlateauScenario(symbol, startTime);
  const lastPlateauCandle = candles[candles.length - 1];
  const breakdownStart = lastPlateauCandle.closeTime + 1;

  // Caída de -15% en 2 horas (120 minutos)
  const breakdownCandles = generateCandleSeries(120, lastPlateauCandle.close, -15.0, breakdownStart, 0.3, symbol);
  return [...candles, ...breakdownCandles];
}

/**
 * Genera escenario de MESETA AMPLIA / CANAL DE CONSOLIDACIÓN (Caso Usuario: 0.70 a 0.78 durante 12-14h tras rally de 48h)
 */
export function generateWidePlateauScenario(
  symbol: string = 'WIDE_PLATEAU_USDT',
  startTime: number = 1700000000000
): { candles: Candle[]; peakPrice: number; floorPrice: number; plateauHours: number } {
  // 1. Rally previo de 48 horas (2880 minutos) subiendo de 0.40 a 0.78 (+95%)
  const impulseMinutes = 2880;
  const impulseCandles = generateCandleSeries(impulseMinutes, 0.40, 95.0, startTime, 0.15, symbol);
  const peakPrice = 0.78;
  const floorPrice = 0.70;

  const plateauStartTime = startTime + impulseMinutes * 60_000;
  // 2. Consolidación de 14 horas (840 minutos) oscilando entre 0.70 y 0.78
  const plateauMinutes = 840;
  const plateauCandles: Candle[] = [];

  for (let i = 0; i < plateauMinutes; i++) {
    const openTime = plateauStartTime + i * 60_000;
    // Oscilación senoide suave entre floorPrice (0.70) y peakPrice * 0.99 (0.772), con picos hasta 0.78
    const mid = (peakPrice + floorPrice) / 2; // 0.74
    const amplitude = (peakPrice - floorPrice) / 2; // 0.04
    const wave = Math.sin(i / 30);
    const close = mid + amplitude * wave * 0.95;
    const open = mid + amplitude * Math.sin((i - 1) / 30) * 0.95;
    const high = Math.min(peakPrice, Math.max(open, close) + 0.003);
    const low = Math.max(floorPrice, Math.min(open, close) - 0.003);

    plateauCandles.push(createBaseCandle(symbol, openTime, open, high, low, close, 1200));
  }

  return {
    candles: [...impulseCandles, ...plateauCandles],
    peakPrice,
    floorPrice,
    plateauHours: 14.0
  };
}
