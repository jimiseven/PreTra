/**
 * PRETRA - Utilidades matemáticas y financieras rigurosas
 * Según especificación técnica:
 * - Retornos compuestos multiplicativamente (P_current / P_ref - 1) * 100
 * - NUNCA sumar porcentajes lineales como si fueran aditivos.
 * - Distancia al máximo: (P_current / P_peak - 1) * 100
 * - Rango de consolidación: (maxHigh - minLow) / minLow * 100
 * - Velocidad en % por minuto y retorno por vela
 */

/**
 * Calcula el retorno porcentual estricto entre dos precios
 */
export function calculateReturnPct(currentPrice: number, referencePrice: number): number {
  if (referencePrice <= 0 || currentPrice <= 0) return 0;
  return ((currentPrice / referencePrice) - 1) * 100;
}

/**
 * Calcula la distancia porcentual al máximo (siempre <= 0 si peak >= current)
 */
export function calculateDistanceToPeakPct(currentPrice: number, peakPrice: number): number {
  if (peakPrice <= 0 || currentPrice <= 0) return 0;
  return ((currentPrice / peakPrice) - 1) * 100;
}

/**
 * Calcula el rango de consolidación reciente: (maxHigh - minLow) / minLow * 100
 */
export function calculateRangePct(high: number, low: number): number {
  if (low <= 0 || high < low) return 0;
  return ((high - low) / low) * 100;
}

/**
 * Calcula la tasa geométrica de retorno por vela (compuesto estricto)
 * ( (P_t / P_0) ^ (1 / N) - 1 ) * 100
 */
export function calculateGeometricReturnPerCandle(
  startPrice: number,
  endPrice: number,
  candleCount: number
): number {
  if (candleCount <= 0 || startPrice <= 0 || endPrice <= 0) return 0;
  const ratio = endPrice / startPrice;
  return (Math.pow(ratio, 1 / candleCount) - 1) * 100;
}

/**
 * Redondeo seguro a N decimales para evitar problemas de precisión en float
 */
export function roundTo(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Formatea un precio para visualización respetando la magnitud (ej. memecoins con muchos ceros)
 */
export function formatPrice(price: number): string {
  if (price === 0) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}
