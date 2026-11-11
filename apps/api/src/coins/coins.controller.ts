import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { DetectorService } from '../detector/detector.service';
import { BinancePublicService } from '../binance/binance-public.service';

@ApiTags('Coins')
@Controller('api/coins')
export class CoinsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketDataService: MarketDataService,
    private readonly detectorService: DetectorService,
    private readonly binanceService: BinancePublicService
  ) {}

  @Get(':symbol/summary')
  @ApiOperation({ summary: 'Obtiene el resumen y métricas actuales de una moneda' })
  @ApiQuery({ name: 'refresh', required: false, example: 'true' })
  async getSummary(
    @Param('symbol') symbol: string,
    @Query('refresh') refresh?: string
  ) {
    const cleanSymbol = symbol.toUpperCase();

    if (refresh === 'true') {
      await this.marketDataService.refreshSymbol(cleanSymbol);
    }

    const cached = this.detectorService.getCachedState(cleanSymbol);

    if (this.prisma.isConnected) {
      try {
        const stateFromDb = await this.prisma.marketState.findUnique({
          where: { symbol: cleanSymbol },
          include: { watchlistItem: true }
        });

        if (stateFromDb) {
          return {
            symbol: cleanSymbol,
            state: cached?.state || stateFromDb?.currentState || 'OBSERVACION',
            metrics: cached?.metrics || stateFromDb?.metrics,
            lastEvaluatedAt: stateFromDb?.lastEvaluatedAt,
            watchlistItem: stateFromDb?.watchlistItem
          };
        }
      } catch {}
    }

    if (cached) {
      return {
        symbol: cleanSymbol,
        state: cached.state,
        metrics: cached.metrics,
        lastEvaluatedAt: new Date()
      };
    }

    throw new NotFoundException(`No hay datos registrados para ${cleanSymbol}.`);
  }

  @Get(':symbol/candles')
  @ApiOperation({ summary: 'Obtiene velas OHLCV históricas para gráficos' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  @ApiQuery({ name: 'limit', required: false, example: '1000' })
  async getCandles(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1m',
    @Query('limit') limitStr: string = '1000'
  ) {
    const cleanSymbol = symbol.toUpperCase();
    const limit = Math.min(2000, parseInt(limitStr, 10) || 1000);

    // Para temporalidades de 1d o 12h, consultamos directamente las velas oficiales de Binance
    if (interval === '1d' || interval === '12h') {
      const directCandles = await this.binanceService.fetchDirectKlines(cleanSymbol, interval, limit);
      if (directCandles.length > 0) {
        return directCandles.map(c => ({
          time: Math.floor(c.openTime / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume
        }));
      }
    }

    // Intentamos obtener del buffer de memoria con resampling automático de temporalidad
    const bufferCandles = this.marketDataService.getCandles(cleanSymbol, interval);
    if (bufferCandles.length > 0) {
      return bufferCandles.slice(-limit).map(c => ({
        time: Math.floor(c.openTime / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      }));
    }

    if (this.prisma.isConnected) {
      try {
        const dbCandles = await this.prisma.candle.findMany({
          where: { symbol: cleanSymbol, interval },
          orderBy: { openTime: 'asc' },
          take: limit
        });

        return dbCandles.map(c => ({
          time: Math.floor(Number(c.openTime) / 1000),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume)
        }));
      } catch {}
    }

    return [];
  }

  @Get(':symbol/events')
  @ApiOperation({ summary: 'Obtiene la cronología de eventos y cambios de estado para la moneda' })
  async getEvents(@Param('symbol') symbol: string) {
    const cleanSymbol = symbol.toUpperCase();

    if (this.prisma.isConnected) {
      try {
        const events = await this.prisma.detectionEvent.findMany({
          where: { symbol: cleanSymbol },
          orderBy: { detectedAt: 'desc' },
          take: 50
        });
        if (events.length > 0) return events;
      } catch {}
    }

    return this.detectorService.getMemoryEvents(cleanSymbol);
  }

  @Get(':symbol/audit-export')
  @ApiOperation({ summary: 'Genera bitácora completa en CSV y prompt para auditoría con otras IA' })
  async getAuditExport(@Param('symbol') symbol: string) {
    const cleanSymbol = symbol.toUpperCase();
    const cached = this.detectorService.getCachedState(cleanSymbol);
    const m = cached?.metrics;

    // Velas recientes en 15m para contexto operativo
    const rawCandles = this.marketDataService.getCandles(cleanSymbol, '15m').slice(-100);

    const candlesAudit = rawCandles.map((c, i, arr) => {
      const range = c.high - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      const upperWickPct = range > 0 ? parseFloat(((upperWick / range) * 100).toFixed(1)) : 0;
      const rangePct = c.low > 0 ? parseFloat((((c.high - c.low) / c.low) * 100).toFixed(2)) : 0;
      const prevClose = i > 0 ? arr[i - 1].close : c.open;
      const changePct = prevClose > 0 ? parseFloat((((c.close - prevClose) / prevClose) * 100).toFixed(2)) : 0;

      const dateObj = new Date(c.openTime);
      return {
        timestamp: c.openTime,
        isoTime: dateObj.toISOString(),
        laPazTime: dateObj.toLocaleString('es-BO', { timeZone: 'America/La_Paz' }),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        upperWickPct,
        rangePct,
        changePct
      };
    });

    // Formateo de CSV
    const csvHeaderLines = [
      `# ==============================================================================`,
      `# PRETRA - BITACORA DE AUDITORIA Y DETECCION DE MESETA TEMPRANA`,
      `# Contrato: ${cleanSymbol} (Binance Futures USD-M)`,
      `# Fecha de exportacion: ${new Date().toISOString()} | Hora La Paz: ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`,
      `# Estado actual: ${cached?.state || 'OBSERVACION'} | Score de confianza: ${m?.confidenceScore || 0}%`,
      `# Precio actual: ${m?.currentPrice || 0} | Pico ATH: ${m?.peakPrice || 0} (${m?.distanceToPeakPct || 0}% de distancia)`,
      `# Horas sin nuevo maximo: ${m?.hoursWithoutNewHigh || 0}h | Subida previa 5d: ${m?.surge5dPct || 0}%`,
      `# Rangos operativos: 30m=${m?.range30mPct ?? '--'}% | 1h=${m?.range1hPct ?? '--'}% | 2h=${m?.range2hPct ?? '--'}% | 4h=${m?.range4hPct ?? '--'}%`,
      `# Meseta estrecha (<= 2%): ${m?.isTightPlateau ? 'SI' : 'NO'}`,
      `# Open Interest: $${m?.oiValueUsd ? (m.oiValueUsd / 1_000_000).toFixed(2) + 'M' : 'N/A'} | Var 1h: ${m?.oiChange1hPct ?? '--'}% | Divergencia: ${m?.oiDivergence || 'NEUTRAL'}`,
      `# Diagnostico OI: ${m?.oiDivergenceNote || 'Sin anomalias'}`,
      `# Climax de volumen y absorcion: ${m?.absorptionState || 'NORMAL'} | Mecha sup max: ${m?.maxUpperWickPct ?? '--'}% | Climax Vol: ${m?.climaxVolumeRatio ? m.climaxVolumeRatio + 'x' : '1x'}`,
      `# Diagnostico Absorcion: ${m?.absorptionNote || 'Comportamiento normal'}`,
      `# Funding Rate: ${m?.fundingRatePct ?? '--'}% | Anualizado: ${m?.fundingRateAnnualizedPct ?? '--'}% | Riesgo Liquidacion: ${m?.liquidationRisk || 'BAJO'}`,
      `# Explicacion del motor: ${m?.explanation || 'Sin diagnostico'}`,
      `# ==============================================================================`,
      `Timestamp_ISO,Timestamp_LaPaz,Open,High,Low,Close,Volume,UpperWickPct,RangePct,ChangePct`
    ];

    const csvRowLines = candlesAudit.map(c =>
      `"${c.isoTime}","${c.laPazTime}",${c.open},${c.high},${c.low},${c.close},${c.volume},${c.upperWickPct},${c.rangePct},${c.changePct}`
    );

    const fullCsv = [...csvHeaderLines, ...csvRowLines].join('\n');

    // Prompt pre-estructurado para auditar con cualquier IA (Claude, Gemini, ChatGPT)
    const aiAuditPrompt = `Actúa como un analista cuantitativo experto en microestructura de mercado de futuros de criptomonedas (Binance Futures) y análisis de volumen/precio (VSA).

He extraído una bitácora de auditoría del sistema PreTra para el contrato **${cleanSymbol}**:

- **Estado Actual:** ${cached?.state || 'OBSERVACION'} (Score de confianza: ${m?.confidenceScore || 0}%)
- **Precio Actual:** ${m?.currentPrice || 0} USD
- **Máximo Local (ATH):** ${m?.peakPrice || 0} USD (a ${m?.distanceToPeakPct || 0}% del techo)
- **Tiempo sin nuevo máximo:** ${m?.hoursWithoutNewHigh || 0} horas
- **Subida sostenida previa (5 días):** +${m?.surge5dPct || 0}%
- **Oscilación reciente (Rangos):**
  * Últimos 30m: ${m?.range30mPct ?? '--'}%
  * Última 1 hora: ${m?.range1hPct ?? '--'}%
  * Últimas 2 horas: ${m?.range2hPct ?? '--'}%
  * Últimas 4 horas: ${m?.range4hPct ?? '--'}%
  * Condición de Meseta Estrecha (<= 2%): ${m?.isTightPlateau ? 'CUMPLIDA (Consolidación muy ceñida)' : 'NO'}

### Métricas de Flujo y Derivados:
- **Divergencia de Open Interest:** ${m?.oiDivergence || 'NEUTRAL'} (Var 1h: ${m?.oiChange1hPct ?? '--'}%, Total: $${m?.oiValueUsd ? (m.oiValueUsd / 1_000_000).toFixed(2) + 'M' : 'N/A'})
  * Diagnóstico OI: ${m?.oiDivergenceNote || 'Sin anomalías'}
- **Clímax de Volumen y Absorción:** ${m?.absorptionState || 'NORMAL'} (Mecha superior máxima: ${m?.maxUpperWickPct ?? '--'}%, Clímax: ${m?.climaxVolumeRatio ? m.climaxVolumeRatio + 'x' : '1x'})
  * Diagnóstico Absorción: ${m?.absorptionNote || 'Sin rechazo violento'}
- **Funding Rate:** ${m?.fundingRatePct ?? '--'}% (${m?.fundingStatus || 'NORMAL'}, Riesgo Liquidación: ${m?.liquidationRisk || 'BAJO'})

### Solicitud de Evaluación:
1. Evalúa si el estancamiento del precio representa una **fase de distribución institucional** (agotamiento del impulso con venta pasiva en mechas y caída de OI) o una **consolidación de re-acumulación** para continuar al alza.
2. Identifica los niveles críticos de soporte inmediato que confirmarían una ruptura bajista.
3. Brinda una conclusión probabilística con recomendaciones de gestión de riesgo según los lineamientos de PreTra.`;

    return {
      symbol: cleanSymbol,
      exportedAt: new Date().toISOString(),
      currentState: cached?.state || 'OBSERVACION',
      metrics: m || null,
      candlesCount: candlesAudit.length,
      aiAuditPrompt,
      csv: fullCsv
    };
  }
}
