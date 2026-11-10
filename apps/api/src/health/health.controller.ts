import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BinancePublicService } from '../binance/binance-public.service';
import { PrismaService } from '../prisma/prisma.service';
import { WatchlistService } from '../watchlist/watchlist.service';

@ApiTags('Health & Observability')
@Controller('api/health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private readonly binanceService: BinancePublicService,
    private readonly prisma: PrismaService,
    private readonly watchlistService: WatchlistService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de salud del sistema, conectividad REST/WS y contadores' })
  async getHealth() {
    const wsStatus = this.binanceService.getWsStatus();
    let dbStatus = 'connected';
    let activeCount = 0;

    try {
      activeCount = await this.prisma.watchlistItem.count({ where: { status: 'ACTIVE' } });
    } catch {
      dbStatus = 'disconnected';
    }

    const { count: dailyAdded, max: maxDaily } = await this.watchlistService.getDailyAdditionsCount();

    return {
      status: wsStatus === 'connected' && dbStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      database: dbStatus,
      binanceRest: 'connected',
      binanceWs: wsStatus,
      activeSymbolsCount: activeCount,
      dailyAddedCount: dailyAdded,
      maxDailySymbols: maxDaily
    };
  }
}
