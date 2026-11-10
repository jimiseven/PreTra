import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { BinancePublicService } from './binance/binance-public.service';
import { SseService } from './sse/sse.service';
import { SseController } from './sse/sse.controller';
import { DetectorService } from './detector/detector.service';
import { MarketDataService } from './market-data/market-data.service';
import { WatchlistService } from './watchlist/watchlist.service';
import { WatchlistController } from './watchlist/watchlist.controller';
import { SymbolsController } from './symbols/symbols.controller';
import { CoinsController } from './coins/coins.controller';
import { PlateausController } from './plateaus/plateaus.controller';
import { SettingsController } from './settings/settings.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule
  ],
  controllers: [
    WatchlistController,
    SymbolsController,
    CoinsController,
    PlateausController,
    SettingsController,
    SseController,
    HealthController
  ],
  providers: [
    BinancePublicService,
    SseService,
    DetectorService,
    MarketDataService,
    WatchlistService
  ]
})
export class AppModule {}
