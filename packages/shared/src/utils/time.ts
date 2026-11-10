/**
 * PRETRA - Utilidades de tiempo y Zona Horaria
 * Regla de negocio: UTC en base de datos, America/La_Paz (Bolivia, UTC-4) para presentación y límite de 5 altas por día.
 */

export const DEFAULT_TIMEZONE = 'America/La_Paz';

/**
 * Obtiene el inicio del día (medianoche 00:00:00.000) en la zona horaria especificada (default La Paz)
 * expresado como un timestamp UTC en milisegundos.
 */
export function getStartOfDayInTimezone(date: Date = new Date(), timezone: string = DEFAULT_TIMEZONE): number {
  // Convertimos a string en la zona objetivo
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  // Formato ISO para inicio de día en esa fecha
  const localDateStr = `${year}-${month}-${day}T00:00:00`;
  
  // Para obtener el timestamp real, creamos fecha y calculamos offset
  // Usamos el constructor nativo con cálculo de offset
  const tempDate = new Date(`${localDateStr}Z`);
  const invDate = new Date(tempDate.toLocaleString('en-US', { timeZone: timezone }));
  const diff = tempDate.getTime() - invDate.getTime();
  
  return tempDate.getTime() + diff;
}

/**
 * Comprueba si una fecha pertenece al día de hoy en la zona horaria de Bolivia
 */
export function isTodayInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): boolean {
  const startOfToday = getStartOfDayInTimezone(new Date(), timezone);
  const targetTime = date.getTime();
  const nextDay = startOfToday + 24 * 60 * 60 * 1000;
  return targetTime >= startOfToday && targetTime < nextDay;
}

/**
 * Formatea un timestamp para visualización en la zona horaria de Bolivia
 */
export function formatBoliviaTime(dateOrMs: Date | number, formatType: 'full' | 'time' | 'short' = 'full'): string {
  const date = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: DEFAULT_TIMEZONE,
    hour12: false
  };

  if (formatType === 'time') {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  } else if (formatType === 'short') {
    options.month = 'short';
    options.day = '2-digit';
    options.hour = '2-digit';
    options.minute = '2-digit';
  } else {
    options.year = 'numeric';
    options.month = '2-digit';
    options.day = '2-digit';
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }

  return new Intl.DateTimeFormat('es-BO', options).format(date);
}

/**
 * Convierte horas a milisegundos
 */
export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

/**
 * Convierte minutos a milisegundos
 */
export function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}
