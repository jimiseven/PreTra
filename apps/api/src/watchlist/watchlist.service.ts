import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BinancePublicService } from '../binance/binance-public.service';
import { MarketDataService } from '../market-data/market-data.service';
import { SseService } from '../sse/sse.service';
import {
  WatchlistStatus,
  SyncStatus,
  MarketType,
  getStartOfDayInTimezone,
  DEFAULT_TIMEZONE
} from '@pretra/shared';

@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);
  private maxDailySymbols = parseInt(process.env.MAX_DAILY_SYMBOLS || '5', 10);
  private timezone = process.env.TIMEZONE || DEFAULT_TIMEZONE;

  // Almacenamiento en memoria para modo resiliente cuando PostgreSQL no esté disponible
  private memoryWatchlist = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinancePublicService,
    private readonly marketDataService: MarketDataService,
    private readonly sseService: SseService
  ) {}

  /**
   * Obtiene la cuota y conteo de altas añadidas hoy en America/La_Paz
   */
  async getDailyAdditionsCount(): Promise<{ count: number; max: number }> {
    const startOfTodayMs = getStartOfDayInTimezone(new Date(), this.timezone);
    const startOfToday = new Date(startOfTodayMs);

    if (this.prisma.isConnected) {
      try {
        const count = await this.prisma.watchlistItem.count({
          where: { addedAt: { gte: startOfToday } }
        });
        return { count, max: this.maxDailySymbols };
      } catch {
        // Fallback a memoria
      }
    }

    let count = 0;
    for (const item of this.memoryWatchlist.values()) {
      if (new Date(item.addedAt).getTime() >= startOfTodayMs) {
        count++;
      }
    }
    return { count, max: this.maxDailySymbols };
  }

  async getWatchlist(status?: string) {
    if (this.prisma.isConnected) {
      try {
        const items = await this.prisma.watchlistItem.findMany({
          where: status ? { status } : undefined,
          include: { marketState: true },
          orderBy: { addedAt: 'desc' }
        });
        return items;
      } catch {
        // Fallback a memoria
      }
    }

    const all = Array.from(this.memoryWatchlist.values());
    if (status) {
      return all.filter(item => item.status === status);
    }
    return all;
  }

  /**
   * Añade un nuevo símbolo al seguimiento manual
   */
  async addSymbol(symbol: string, notes?: string) {
    const cleanSymbol = symbol.trim().toUpperCase();

    // 1. Validar existencia real en Binance Futures USDⓈ-M
    const validSymbols = await this.binanceService.getExchangeSymbols();
    if (validSymbols.length > 0) {
      const exists = validSymbols.some(s => s.symbol === cleanSymbol);
      if (!exists) {
        throw new BadRequestException(`El símbolo ${cleanSymbol} no es un contrato perpetuo USDT válido en Binance Futures.`);
      }
    }

    // 2. Verificar duplicado en base de datos o memoria
    let existing: any = null;
    if (this.prisma.isConnected) {
      try {
        existing = await this.prisma.watchlistItem.findUnique({
          where: { symbol: cleanSymbol }
        });
      } catch {
        existing = this.memoryWatchlist.get(cleanSymbol);
      }
    } else {
      existing = this.memoryWatchlist.get(cleanSymbol);
    }

    if (existing) {
      if (existing.status === WatchlistStatus.ACTIVE) {
        throw new ConflictException(`El símbolo ${cleanSymbol} ya está activo en la lista de seguimiento.`);
      } else {
        return this.reactivateSymbol(existing.id);
      }
    }

    // 3. Verificar cuota diaria (máx 5/día)
    const { count, max } = await this.getDailyAdditionsCount();
    if (count >= max) {
      throw new BadRequestException(`Límite diario alcanzado: Máximo ${max} altas por día (Zona ${this.timezone}).`);
    }

    // 4. Crear registro
    const itemData = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      symbol: cleanSymbol,
      marketType: MarketType.USDM_FUTURES,
      status: WatchlistStatus.ACTIVE,
      syncStatus: SyncStatus.PENDING,
      notes: notes || null,
      addedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    let item: any = itemData;

    if (this.prisma.isConnected) {
      try {
        item = await this.prisma.watchlistItem.create({
          data: {
            symbol: cleanSymbol,
            marketType: MarketType.USDM_FUTURES,
            status: WatchlistStatus.ACTIVE,
            syncStatus: SyncStatus.PENDING,
            notes: notes || null
          }
        });
      } catch (err) {
        this.logger.warn(`Error al guardar en PostgreSQL, guardando en memoria: ${err?.message || err}`);
        this.memoryWatchlist.set(cleanSymbol, itemData);
      }
    } else {
      this.memoryWatchlist.set(cleanSymbol, itemData);
    }

    // 5. Lanzar backfill asíncrono
    this.marketDataService.runBackfill(cleanSymbol).catch(err => {
      this.logger.error(`Error en backfill asíncrono para ${cleanSymbol}: ${err?.message || err}`);
    });

    this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'ADDED', item });

    return item;
  }

  async archiveSymbol(id: string) {
    let item: any = null;

    if (this.prisma.isConnected) {
      try {
        item = await this.prisma.watchlistItem.findUnique({ where: { id } });
        if (item) {
          const updated = await this.prisma.watchlistItem.update({
            where: { id },
            data: {
              status: WatchlistStatus.ARCHIVED,
              archivedAt: new Date()
            }
          });
          this.binanceService.unsubscribeSymbol(item.symbol);
          this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'ARCHIVED', item: updated });
          return updated;
        }
      } catch {}
    }

    // Buscar en memoria
    for (const [sym, memoryItem] of this.memoryWatchlist.entries()) {
      if (memoryItem.id === id) {
        memoryItem.status = WatchlistStatus.ARCHIVED;
        memoryItem.archivedAt = new Date();
        this.binanceService.unsubscribeSymbol(sym);
        this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'ARCHIVED', item: memoryItem });
        return memoryItem;
      }
    }

    throw new NotFoundException('Símbolo no encontrado.');
  }

  async reactivateSymbol(id: string) {
    if (this.prisma.isConnected) {
      try {
        const item = await this.prisma.watchlistItem.findUnique({ where: { id } });
        if (item) {
          const updated = await this.prisma.watchlistItem.update({
            where: { id },
            data: {
              status: WatchlistStatus.ACTIVE,
              archivedAt: null
            }
          });
          this.binanceService.subscribeSymbol(item.symbol);
          this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'REACTIVATED', item: updated });
          return updated;
        }
      } catch {}
    }

    for (const [sym, memoryItem] of this.memoryWatchlist.entries()) {
      if (memoryItem.id === id) {
        memoryItem.status = WatchlistStatus.ACTIVE;
        memoryItem.archivedAt = null;
        this.binanceService.subscribeSymbol(sym);
        this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'REACTIVATED', item: memoryItem });
        return memoryItem;
      }
    }

    throw new NotFoundException('Símbolo no encontrado.');
  }

  async deleteSymbol(id: string) {
    if (this.prisma.isConnected) {
      try {
        const item = await this.prisma.watchlistItem.findUnique({ where: { id } });
        if (item) {
          this.binanceService.unsubscribeSymbol(item.symbol);
          await this.prisma.watchlistItem.delete({ where: { id } });
          this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'DELETED', id, symbol: item.symbol });
          return { success: true, symbol: item.symbol };
        }
      } catch {}
    }

    for (const [sym, memoryItem] of this.memoryWatchlist.entries()) {
      if (memoryItem.id === id) {
        this.binanceService.unsubscribeSymbol(sym);
        this.memoryWatchlist.delete(sym);
        this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'DELETED', id, symbol: sym });
        return { success: true, symbol: sym };
      }
    }

    throw new NotFoundException('Símbolo no encontrado.');
  }
}
