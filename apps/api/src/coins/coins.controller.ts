import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { DetectorService } from '../detector/detector.service';

@ApiTags('Coins')
@Controller('api/coins')
export class CoinsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketDataService: MarketDataService,
    private readonly detectorService: DetectorService
  ) {}

  @Get(':symbol/summary')
  @ApiOperation({ summary: 'Obtiene el resumen y métricas actuales de una moneda' })
  async getSummary(@Param('symbol') symbol: string) {
    const cleanSymbol = symbol.toUpperCase();
    const cached = this.detectorService.getCachedState(cleanSymbol);

    try {
      const stateFromDb = await this.prisma.marketState.findUnique({
        where: { symbol: cleanSymbol },
        include: { watchlistItem: true }
      });

      if (!stateFromDb && !cached) {
        throw new NotFoundException(`No hay datos registrados para ${cleanSymbol}.`);
      }

      return {
        symbol: cleanSymbol,
        state: cached?.state || stateFromDb?.currentState || 'OBSERVACION',
        metrics: cached?.metrics || stateFromDb?.metrics,
        lastEvaluatedAt: stateFromDb?.lastEvaluatedAt,
        watchlistItem: stateFromDb?.watchlistItem
      };
    } catch {
      if (cached) {
        return {
          symbol: cleanSymbol,
          state: cached.state,
          metrics: cached.metrics
        };
      }
      throw new NotFoundException(`No hay datos registrados para ${cleanSymbol}.`);
    }
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

    // Intentamos obtener del buffer de memoria primero
    const bufferCandles = this.marketDataService.getCandles(cleanSymbol);
    if (bufferCandles.length > 0) {
      return bufferCandles.slice(-limit).map(c => ({
        time: Math.floor(c.openTime / 1000), // Formato UNIX seconds para Lightweight Charts
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      }));
    }

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
    } catch {
      return [];
    }
  }

  @Get(':symbol/events')
  @ApiOperation({ summary: 'Obtiene la cronología de eventos y cambios de estado para la moneda' })
  async getEvents(@Param('symbol') symbol: string) {
    const cleanSymbol = symbol.toUpperCase();
    try {
      const events = await this.prisma.detectionEvent.findMany({
        where: { symbol: cleanSymbol },
        orderBy: { detectedAt: 'desc' },
        take: 50
      });
      return events;
    } catch {
      return [];
    }
  }
}
