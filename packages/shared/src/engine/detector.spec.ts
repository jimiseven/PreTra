import { describe, it, expect } from 'vitest';
import { evaluatePlateauDetector } from './detector.js';
import {
  generateCandleSeries,
  generateImpulseAndPlateauScenario,
  generatePauseAndNewImpulseScenario,
  generatePlateauAndBreakdownScenario,
  createBaseCandle
} from './synthetic.js';
import { CoinState, PlateauStatus } from '../types/domain.js';
import { isTodayInTimezone, getStartOfDayInTimezone } from '../utils/time.js';
import { calculateReturnPct } from '../utils/math.js';

describe('Detector de Mesetas Tempranas - Pruebas Sintéticas Exhaustivas (Casos A-J)', () => {
  
  // CASO A: Subida +150% y meseta 8h => Detectar meseta
  it('CASO A: Detecta MESETA_TEMPRANA tras subida > 70% y consolidación de 8h', () => {
    const { candles } = generateImpulseAndPlateauScenario('A_USDT');
    const result = evaluatePlateauDetector({
      symbol: 'A_USDT',
      candles,
      currentState: CoinState.OBSERVACION
    });

    expect(result.state).toBe(CoinState.MESETA_TEMPRANA);
    expect(result.metrics.hoursWithoutNewHigh).toBeGreaterThanOrEqual(7.5);
    expect(Math.abs(result.metrics.distanceToPeakPct)).toBeLessThanOrEqual(3.0);
    expect(result.metrics.recentRangePct).toBeLessThanOrEqual(5.0);
    expect(result.plateauAction?.action).toBe('START');
    expect(result.event).toBeDefined();
  });

  // CASO B: Pausa 2h seguida de nuevo +40% => Evitar clasificar definitivamente caída, transicionar a reaceleración
  it('CASO B: Pausa de 2h seguida de nuevo impulso no debe registrarse como caída definitiva sino REACELERACION', () => {
    const candles = generatePauseAndNewImpulseScenario('B_USDT');
    
    // Evaluamos al final de la pausa (2h de pausa con estado previo MESETA_TEMPRANA o DESACELERACION)
    const pauseEndIndex = 480 + 120;
    const duringPause = evaluatePlateauDetector({
      symbol: 'B_USDT',
      candles: candles.slice(0, pauseEndIndex),
      currentState: CoinState.OBSERVACION
    });
    // Debe estar en desaceleración o meseta temprana
    expect([CoinState.DESACELERACION, CoinState.MESETA_TEMPRANA]).toContain(duringPause.state);

    // Evaluamos tras el nuevo impulso de +40%
    const afterNewImpulse = evaluatePlateauDetector({
      symbol: 'B_USDT',
      candles,
      currentState: duringPause.state
    });
    
    // El precio superó el máximo anterior, debe ser REACELERACION o IMPULSO_ALCISTA, nunca RUPTURA_BAJISTA
    expect(afterNewImpulse.state).not.toBe(CoinState.RUPTURA_BAJISTA);
    expect([CoinState.REACELERACION, CoinState.IMPULSO_ALCISTA]).toContain(afterNewImpulse.state);
  });

  // CASO C: Meseta y ruptura bajista => Registrar transición RUPTURA_BAJISTA
  it('CASO C: Detecta RUPTURA_BAJISTA cuando el precio pierde el soporte de consolidación', () => {
    const candles = generatePlateauAndBreakdownScenario('C_USDT');
    
    // Primero simulamos que estaba en meseta
    const plateauIndex = 720 + 480;
    const plateauResult = evaluatePlateauDetector({
      symbol: 'C_USDT',
      candles: candles.slice(0, plateauIndex),
      currentState: CoinState.OBSERVACION
    });
    expect(plateauResult.state).toBe(CoinState.MESETA_TEMPRANA);

    // Luego con la caída (-15%)
    const breakdownResult = evaluatePlateauDetector({
      symbol: 'C_USDT',
      candles,
      currentState: plateauResult.state
    });

    expect(breakdownResult.state).toBe(CoinState.RUPTURA_BAJISTA);
    expect(breakdownResult.plateauAction?.action).toBe('BREAKDOWN');
    expect(breakdownResult.plateauAction?.status).toBe(PlateauStatus.BROKEN_DOWN);
  });

  // CASO D: Meseta y ruptura alcista => Invalidar episodio de meseta
  it('CASO D: Ruptura alcista invalida episodio de meseta y pasa a REACELERACION', () => {
    const { candles, peakPrice } = generateImpulseAndPlateauScenario('D_USDT');
    const lastCandle = candles[candles.length - 1];
    
    // Añadimos vela rompiendo al alza con fuerza
    const breakoutCandles = [
      ...candles,
      createBaseCandle('D_USDT', lastCandle.closeTime + 1, lastCandle.close, peakPrice * 1.05, lastCandle.close, peakPrice * 1.04)
    ];

    const result = evaluatePlateauDetector({
      symbol: 'D_USDT',
      candles: breakoutCandles,
      currentState: CoinState.MESETA_TEMPRANA
    });

    expect(result.state).toBe(CoinState.REACELERACION);
    expect(result.plateauAction?.action).toBe('INVALIDATE');
    expect(result.plateauAction?.status).toBe(PlateauStatus.INVALIDATED_UP);
  });

  // CASO E: Subida sostenida sin meseta => No falso positivo
  it('CASO E: Subida sostenida fuerte no genera falsos positivos de meseta temprana', () => {
    // Subida continua durante 6 horas (+120%)
    const candles = generateCandleSeries(360, 10.0, 120.0, 1700000000000, 0.1, 'E_USDT');

    const result = evaluatePlateauDetector({
      symbol: 'E_USDT',
      candles,
      currentState: CoinState.OBSERVACION
    });

    expect(result.state).toBe(CoinState.IMPULSO_ALCISTA);
    expect(result.state).not.toBe(CoinState.MESETA_TEMPRANA);
  });

  // CASO F: Wick aislado vs Cierres (evitar máximos engañosos)
  it('CASO F: Soporta useClosesForPeaks para evitar distorsiones por wicks aislados', () => {
    const { candles } = generateImpulseAndPlateauScenario('F_USDT');
    const spikeCandle = { ...candles[candles.length - 200] };
    // Creamos un wick descomunal en High pero Close normal
    spikeCandle.high = spikeCandle.close * 1.5;
    candles[candles.length - 200] = spikeCandle;

    // Con useClosesForPeaks = true no debe tomar el wick artificial
    const resultCloses = evaluatePlateauDetector({
      symbol: 'F_USDT',
      candles,
      currentState: CoinState.OBSERVACION,
      config: { useClosesForPeaks: true }
    });

    expect(resultCloses.state).toBe(CoinState.MESETA_TEMPRANA);
  });

  // CASO G: Insuficiencia de datos (< 15 velas) devuelve SIN_DATOS
  it('CASO G: Devuelve SIN_DATOS si hay menos de 15 velas de cobertura', () => {
    const candles = generateCandleSeries(10, 10.0, 5.0, 1700000000000, 0.1, 'G_USDT');
    const result = evaluatePlateauDetector({
      symbol: 'G_USDT',
      candles,
      currentState: CoinState.OBSERVACION
    });

    expect(result.state).toBe(CoinState.SIN_DATOS);
  });

  // CASO H: No look-ahead bias (evaluación cronológica estricta paso a paso)
  it('CASO H: La evaluación online solo utiliza datos disponibles hasta la última vela', () => {
    const { candles } = generateImpulseAndPlateauScenario('H_USDT');
    
    // Paso en t = 360 (mitad del impulso)
    const midImpulse = evaluatePlateauDetector({
      symbol: 'H_USDT',
      candles: candles.slice(0, 360),
      currentState: CoinState.OBSERVACION
    });
    expect(midImpulse.metrics.currentPrice).toBe(candles[359].close);
    expect(midImpulse.metrics.peakAt).toBeLessThanOrEqual(candles[359].openTime);
  });

  // CASO I: Zona horaria America/La_Paz y reinicio de contador a medianoche
  it('CASO I: Verifica pertenencia al día actual en America/La_Paz', () => {
    const now = new Date();
    expect(isTodayInTimezone(now, 'America/La_Paz')).toBe(true);
    
    // Ayer a las 23:00 no debería ser hoy
    const yesterday = new Date(getStartOfDayInTimezone(now, 'America/La_Paz') - 3600_000);
    expect(isTodayInTimezone(yesterday, 'America/La_Paz')).toBe(false);
  });

  // CASO J: Backfill retrospectivo marca isRetrospective = true y no alerta como tiempo real
  it('CASO J: Detecciones durante backfill se etiquetan como retrospectivas', () => {
    const { candles } = generateImpulseAndPlateauScenario('J_USDT');
    const result = evaluatePlateauDetector({
      symbol: 'J_USDT',
      candles,
      currentState: CoinState.OBSERVACION,
      isBackfill: true
    });

    expect(result.event?.isRetrospective).toBe(true);
  });

  // Verificación matemática de retorno multiplicativo
  it('Matemática: Comprobación de retornos multiplicativos rigurosos', () => {
    // Si sube de 10 a 20: ((20/10) - 1) * 100 = 100%
    expect(calculateReturnPct(20, 10)).toBe(100);
    // Si cae de 20 a 10: ((10/20) - 1) * 100 = -50%
    expect(calculateReturnPct(10, 20)).toBe(-50);
  });
});
