import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BinancePublicService } from '../binance/binance-public.service';
import { MarketDataService } from '../market-data/market-data.service';
import { DetectorService } from '../detector/detector.service';
import { SseService } from '../sse/sse.service';
import {
  WatchlistStatus,
  SyncStatus,
  MarketType,
  getStartOfDayInTimezone,
  DEFAULT_TIMEZONE
} from '@pretra/shared';

@Injectable()
export class WatchlistService implements OnModuleInit {
  private readonly logger = new Logger(WatchlistService.name);
  private maxDailySymbols = parseInt(process.env.MAX_DAILY_SYMBOLS || '5', 10);
  private timezone = process.env.TIMEZONE || DEFAULT_TIMEZONE;

  // Almacenamiento en memoria resiliente con persistencia local JSON cuando PostgreSQL no esté disponible
  private memoryWatchlist = new Map<string, any>();
  private storagePath = path.resolve(process.cwd(), 'watchlist_store.json');

  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinancePublicService,
    private readonly marketDataService: MarketDataService,
    private readonly detectorService: DetectorService,
    private readonly sseService: SseService
  ) {}

  async onModuleInit() {
    this.loadFromStorage();
    // Iniciar backfills y streams para contratos activos recuperados
    for (const item of this.memoryWatchlist.values()) {
      if (item.status === WatchlistStatus.ACTIVE) {
        this.marketDataService.runBackfill(item.symbol).catch(() => {});
      }
    }
  }

  private loadFromStorage() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            this.memoryWatchlist.set(item.symbol, item);
          }
          this.logger.log(`Cargados ${this.memoryWatchlist.size} contratos persistidos desde ${this.storagePath}`);
        }
      }
    } catch (e: any) {
      this.logger.warn(`No se pudo leer watchlist_store.json: ${e?.message}`);
    }
  }

  private saveToStorage() {
    try {
      const list = Array.from(this.memoryWatchlist.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), 'utf8');
    } catch (e: any) {
      this.logger.warn(`No se pudo guardar watchlist_store.json: ${e?.message}`);
    }
  }

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
    let rawItems: any[] = [];
    if (this.prisma.isConnected) {
      try {
        rawItems = await this.prisma.watchlistItem.findMany({
          where: status ? { status } : undefined,
          include: { marketState: true },
          orderBy: { addedAt: 'desc' }
        });
      } catch {
        rawItems = Array.from(this.memoryWatchlist.values());
        if (status) rawItems = rawItems.filter(item => item.status === status);
      }
    } else {
      rawItems = Array.from(this.memoryWatchlist.values());
      if (status) rawItems = rawItems.filter(item => item.status === status);
    }

    // Unir siempre con los estados y métricas más recientes del detector
    return rawItems.map(item => {
      const cached = this.detectorService.getCachedState(item.symbol);
      if (cached) {
        return {
          ...item,
          marketState: {
            currentState: cached.state,
            metrics: cached.metrics,
            lastEvaluatedAt: new Date()
          }
        };
      }
      return item;
    });
  }

  /**
   * Fuerza el refresco de precios y velas desde Binance para todas las monedas activas
   */
  async refreshAllActiveSymbols() {
    this.logger.log('Refrescando contratos activos desde Binance...');
    const active = await this.getWatchlist(WatchlistStatus.ACTIVE);
    for (const item of active) {
      await this.marketDataService.refreshSymbol(item.symbol);
    }
    const updated = await this.getWatchlist();
    this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'REFRESHED', count: active.length });
    return updated;
  }

  /**
   * Elimina múltiples monedas de una vez
   */
  async bulkDeleteSymbols(ids: string[]) {
    const deletedSymbols: string[] = [];
    for (const id of ids) {
      try {
        const res = await this.deleteSymbol(id);
        if (res?.symbol) deletedSymbols.push(res.symbol);
      } catch (err) {
        // Ignorar si ya no existía
      }
    }
    return { success: true, count: deletedSymbols.length, deletedSymbols };
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
    this.saveToStorage();

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
        this.saveToStorage();
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
        this.saveToStorage();
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
        this.saveToStorage();
        this.sseService.broadcast('WATCHLIST_UPDATE', { action: 'DELETED', id, symbol: sym });
        return { success: true, symbol: sym };
      }
    }

    throw new NotFoundException('Símbolo no encontrado.');
  }
}
