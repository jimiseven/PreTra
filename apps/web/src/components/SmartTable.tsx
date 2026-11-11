'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StateBadge } from './StateBadge';
import { CoinState } from '@pretra/shared';
import {
  ExternalLink,
  Archive,
  RefreshCw,
  ArrowUpDown,
  Clock,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  CheckSquare,
  Square,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { LiveTicker } from '../hooks/useRealtimeStream';

interface SmartTableProps {
  items: any[];
  liveTickers: Record<string, LiveTicker>;
  onArchive: (id: string) => void;
  onReactivate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

type SortField = 'priority' | 'hoursWithoutNewHigh' | 'impulse' | 'symbol' | 'price' | 'range2h';

export function SmartTable({
  items,
  liveTickers,
  onArchive,
  onReactivate,
  onDelete,
  onBulkDelete,
  onRefresh,
  isRefreshing = false
}: SmartTableProps) {
  const [filter, setFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Selección múltiple para eliminar del historial
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<boolean>(false);

  // Estados de paginación y navegación de pantallas
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => {
    return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const handleManualRefresh = () => {
    if (onRefresh) {
      onRefresh();
      setLastRefreshedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  };

  // Combinar datos persistidos con tickers en vivo y métricas avanzadas de meseta
  const enrichedItems = items.map(item => {
    const live = liveTickers[item.symbol];
    const metrics = item.marketState?.metrics || {};
    const state = live?.state || item.marketState?.currentState || CoinState.OBSERVACION;
    const price = live?.price ?? metrics.currentPrice ?? 0;
    const change1h = live?.change1h ?? metrics.changes?.['1h'] ?? null;
    const change24h = live?.change24h ?? metrics.changes?.['24h'] ?? null;
    const impulseTotalPct = metrics.impulseTotalPct ?? null;
    const hoursWithoutNewHigh = live?.hoursWithoutNewHigh ?? metrics.hoursWithoutNewHigh ?? 0;
    const distanceToPeakPct = live?.distanceToPeakPct ?? metrics.distanceToPeakPct ?? 0;
    const recentRangePct = metrics.recentRangePct ?? 0;
    const explanation = live?.explanation || metrics.explanation || '';

    // Métricas específicas de meseta <= 2%
    const range30mPct = metrics.range30mPct ?? null;
    const range1hPct = metrics.range1hPct ?? null;
    const range2hPct = metrics.range2hPct ?? null;
    const range4hPct = metrics.range4hPct ?? null;
    const isTightPlateau = metrics.isTightPlateau ?? (range2hPct !== null && range2hPct <= 2.0);
    const surge5dPct = metrics.surge5dPct ?? null;

    // Métricas de flujo y microestructura (OI, Absorción, Funding)
    const oiValueUsd = metrics.oiValueUsd ?? null;
    const oiChange1hPct = metrics.oiChange1hPct ?? null;
    const oiDivergence = metrics.oiDivergence ?? 'NEUTRAL';
    const oiDivergenceNote = metrics.oiDivergenceNote ?? null;

    const hasVolumeClimax = metrics.hasVolumeClimax ?? false;
    const maxUpperWickPct = metrics.maxUpperWickPct ?? null;
    const climaxVolumeRatio = metrics.climaxVolumeRatio ?? null;
    const absorptionState = metrics.absorptionState ?? 'NORMAL';
    const absorptionNote = metrics.absorptionNote ?? null;

    const fundingRatePct = metrics.fundingRatePct ?? null;
    const fundingRateAnnualizedPct = metrics.fundingRateAnnualizedPct ?? null;
    const fundingStatus = metrics.fundingStatus ?? 'NORMAL';
    const liquidationRisk = metrics.liquidationRisk ?? 'LOW';

    // Prioridad descriptiva de vigilancia
    let priorityScore = 1;
    if (state === CoinState.MESETA_TEMPRANA) priorityScore = 5;
    else if (state === CoinState.DESACELERACION) priorityScore = 4;
    else if (state === CoinState.IMPULSO_ALCISTA) priorityScore = 3;
    else if (state === CoinState.RUPTURA_BAJISTA) priorityScore = 2;

    return {
      ...item,
      state,
      price,
      change1h,
      change24h,
      impulseTotalPct,
      hoursWithoutNewHigh,
      distanceToPeakPct,
      recentRangePct,
      range30mPct,
      range1hPct,
      range2hPct,
      range4hPct,
      isTightPlateau,
      surge5dPct,
      oiValueUsd,
      oiChange1hPct,
      oiDivergence,
      oiDivergenceNote,
      hasVolumeClimax,
      maxUpperWickPct,
      climaxVolumeRatio,
      absorptionState,
      absorptionNote,
      fundingRatePct,
      fundingRateAnnualizedPct,
      fundingStatus,
      liquidationRisk,
      explanation,
      priorityScore
    };
  });

  // Filtrado
  const filteredItems = enrichedItems.filter(item => {
    if (filter === 'ALL') return item.status === 'ACTIVE';
    if (filter === 'ARCHIVED') return item.status === 'ARCHIVED';
    if (filter === CoinState.MESETA_TEMPRANA) return item.state === CoinState.MESETA_TEMPRANA && item.status === 'ACTIVE';
    if (filter === CoinState.DESACELERACION) return item.state === CoinState.DESACELERACION && item.status === 'ACTIVE';
    if (filter === CoinState.IMPULSO_ALCISTA) return item.state === CoinState.IMPULSO_ALCISTA && item.status === 'ACTIVE';
    if (filter === CoinState.RUPTURA_BAJISTA) return item.state === CoinState.RUPTURA_BAJISTA && item.status === 'ACTIVE';
    return true;
  });

  // Reiniciar selección al cambiar filtro
  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setCurrentPage(1);
    setSelectedIds([]);
  };

  // Ordenamiento
  const sortedItems = [...filteredItems].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'priority') {
      comparison = b.priorityScore - a.priorityScore;
      if (comparison === 0) comparison = (b.hoursWithoutNewHigh || 0) - (a.hoursWithoutNewHigh || 0);
    } else if (sortField === 'hoursWithoutNewHigh') {
      comparison = (b.hoursWithoutNewHigh || 0) - (a.hoursWithoutNewHigh || 0);
    } else if (sortField === 'impulse') {
      comparison = (b.impulseTotalPct || 0) - (a.impulseTotalPct || 0);
    } else if (sortField === 'price') {
      comparison = (b.price || 0) - (a.price || 0);
    } else if (sortField === 'range2h') {
      comparison = (a.range2hPct || 999) - (b.range2hPct || 999);
    } else {
      comparison = a.symbol.localeCompare(b.symbol);
    }
    return sortAsc ? -comparison : comparison;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setCurrentPage(1);
  };

  // Paginación
  const totalItems = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = sortedItems.slice(startIndex, startIndex + pageSize);

  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(target);
  };

  // Gestión de selección múltiple
  const handleToggleSelectAll = () => {
    if (selectedIds.length === paginatedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedItems.map(i => i.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const executeBulkDelete = () => {
    if (onBulkDelete && selectedIds.length > 0) {
      onBulkDelete(selectedIds);
      setSelectedIds([]);
      setConfirmBulkDelete(false);
    }
  };

  const executeSingleDelete = (id: string) => {
    if (onDelete) {
      onDelete(id);
      setSelectedIds(prev => prev.filter(i => i !== id));
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Modal de confirmación para eliminación individual */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-rose-800/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">¿Eliminar del Historial?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Esta acción eliminará de forma permanente la moneda y todo su historial de métricas y velas. No se podrá recuperar.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surfaceLight hover:bg-slate-700 text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeSingleDelete(confirmDeleteId)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminación masiva */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-rose-800/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">¿Eliminar {selectedIds.length} Monedas?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Estás a punto de eliminar permanentemente del historial las <strong>{selectedIds.length}</strong> monedas seleccionadas. Esta operación es irreversible.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surfaceLight hover:bg-slate-700 text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={executeBulkDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
              >
                Sí, Eliminar Seleccionadas ({selectedIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Filtros, Estado y Botón de Actualización */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-xl border border-border shadow-sm">
        
        {/* Filtros por Estado */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleFilterChange('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'ALL' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Activas ({enrichedItems.filter(i => i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => handleFilterChange(CoinState.MESETA_TEMPRANA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.MESETA_TEMPRANA ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Meseta Temprana ({enrichedItems.filter(i => i.state === CoinState.MESETA_TEMPRANA && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => handleFilterChange(CoinState.DESACELERACION)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.DESACELERACION ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Desaceleración ({enrichedItems.filter(i => i.state === CoinState.DESACELERACION && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => handleFilterChange(CoinState.IMPULSO_ALCISTA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.IMPULSO_ALCISTA ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Impulso ({enrichedItems.filter(i => i.state === CoinState.IMPULSO_ALCISTA && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => handleFilterChange(CoinState.RUPTURA_BAJISTA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.RUPTURA_BAJISTA ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Ruptura ({enrichedItems.filter(i => i.state === CoinState.RUPTURA_BAJISTA && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => handleFilterChange('ARCHIVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'ARCHIVED' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Archivadas ({enrichedItems.filter(i => i.status === 'ARCHIVED').length})
          </button>
        </div>

        {/* Acciones de la barra: Eliminar seleccionadas + Indicador sutil de actualización */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          
          {/* Botón de eliminación masiva cuando hay seleccionadas en cualquier vista */}
          {selectedIds.length > 0 && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md animate-pulse cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar seleccionadas ({selectedIds.length})</span>
            </button>
          )}

          {/* Indicador sutil de que el sistema está actualizado en vivo */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs font-medium cursor-default"
              title="Sincronizado continuamente vía WebSocket & SSE"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold">Actualizado</span>
              <span className="text-[10px] text-emerald-400/80 font-mono">({lastRefreshedAt})</span>
            </div>

            {/* Botón compacto de actualización manual */}
            {onRefresh && (
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Forzar sincronización inmediata con Binance"
                className="p-1.5 rounded-lg bg-surfaceLight hover:bg-slate-700 text-slate-300 hover:text-white border border-border transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-accent ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Tabla Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-surfaceLight text-slate-400 text-xs uppercase border-b border-border">
            <tr>
              {/* Checkbox de selección universal para cualquier vista */}
              <th className="py-3 px-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.includes(i.id))}
                  onChange={handleToggleSelectAll}
                  title="Seleccionar todas las de esta página"
                  className="w-4 h-4 rounded border-border bg-surface text-accent cursor-pointer"
                />
              </th>

              <th className="py-3 px-4 cursor-pointer select-none hover:text-white" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-1">
                  <span>Símbolo</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer select-none hover:text-white" onClick={() => handleSort('price')}>
                <div className="flex items-center gap-1">
                  <span>Precio</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4">Cambio 1h</th>
              <th className="py-3 px-4">Cambio 24h</th>
              <th className="py-3 px-4 cursor-pointer select-none hover:text-white" onClick={() => handleSort('impulse')}>
                <div className="flex items-center gap-1">
                  <span>Impulso Total</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer select-none hover:text-white" onClick={() => handleSort('hoursWithoutNewHigh')}>
                <div className="flex items-center gap-1">
                  <span>Sin Máx.</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4">Distancia Máx.</th>
              <th className="py-3 px-4 cursor-pointer select-none hover:text-white" onClick={() => handleSort('priority')}>
                <div className="flex items-center gap-1">
                  <span>Estado</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer select-none hover:text-white" onClick={() => handleSort('range2h')}>
                <div className="flex items-center gap-1">
                  <span>Rango Meseta (2h / 30m)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-3">Flujo & Derivados</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 text-center text-slate-400">
                  No hay contratos en esta vista.
                </td>
              </tr>
            ) : (
              paginatedItems.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors group ${
                      isSelected ? 'bg-rose-950/20' : 'hover:bg-surfaceLight/50'
                    }`}
                  >
                    {/* Checkbox de fila */}
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="w-4 h-4 rounded border-border bg-surface text-accent cursor-pointer"
                      />
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <Link href={`/coins/${item.symbol}`} className="hover:text-accent flex items-center gap-1">
                          {item.symbol}
                          <ExternalLink className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </div>
                      <span className="text-[11px] text-slate-400">USDT Perpetuo</span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      ${item.price > 0 ? (item.price >= 1 ? item.price.toFixed(4) : item.price.toFixed(6)) : '--'}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      {item.change1h !== null ? (
                        <span className={item.change1h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {item.change1h >= 0 ? '+' : ''}{item.change1h.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-slate-500">N/D</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      {item.change24h !== null ? (
                        <span className={item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-slate-500">N/D</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      {item.impulseTotalPct !== null ? (
                        <span className="font-bold text-emerald-400 flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          +{item.impulseTotalPct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-500">N/D</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.hoursWithoutNewHigh ? `${item.hoursWithoutNewHigh.toFixed(1)}h` : '0h'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      <span className="text-amber-400 font-medium">
                        {item.distanceToPeakPct ? `${item.distanceToPeakPct.toFixed(2)}%` : '0.00%'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <StateBadge state={item.state} />
                    </td>

                    {/* Métrica de Rango de Meseta (<= 2% en 2h / 30m) */}
                    <td className="py-3.5 px-4 font-mono">
                      {item.isTightPlateau ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/70 border border-purple-800 text-purple-300 text-xs font-bold">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          <span>Meseta &le;2% ({item.range2hPct ? `${item.range2hPct}%` : `${item.range30mPct}%`})</span>
                        </div>
                      ) : item.range2hPct !== null ? (
                        <span className="text-slate-300 text-xs">
                          2h: {item.range2hPct}% {item.range30mPct ? `| 30m: ${item.range30mPct}%` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">{item.recentRangePct ? `${item.recentRangePct}%` : '--'}</span>
                      )}
                    </td>

                    {/* Columna de Flujo & Derivados (OI, Absorción, Funding) */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-1 text-[11px] font-mono">
                        {/* Open Interest */}
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">OI:</span>
                          <span className="text-slate-200 font-bold">
                            {item.oiValueUsd ? `$${(item.oiValueUsd / 1_000_000).toFixed(1)}M` : '--'}
                          </span>
                          {item.oiChange1hPct !== null && (
                            <span className={item.oiChange1hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              ({item.oiChange1hPct >= 0 ? '+' : ''}{item.oiChange1hPct}%)
                            </span>
                          )}
                        </div>

                        {/* Absorción & Funding */}
                        <div className="flex items-center gap-1 text-[10px]">
                          {item.absorptionState === 'HEAVY_ABSORPTION' ? (
                            <span className="px-1 rounded bg-rose-950/70 border border-rose-800 text-rose-300 font-semibold" title={item.absorptionNote || ''}>
                              Absorción {item.maxUpperWickPct}%
                            </span>
                          ) : item.maxUpperWickPct ? (
                            <span className="text-slate-400">Mecha: {item.maxUpperWickPct}%</span>
                          ) : null}

                          {item.fundingRatePct !== null && (
                            <span className={`px-1 rounded font-semibold ${
                              item.fundingRatePct >= 0.05
                                ? 'bg-amber-950/70 border border-amber-800 text-amber-300'
                                : 'text-slate-400'
                            }`} title={`Funding: ${item.fundingRatePct}%`}>
                              F:{item.fundingRatePct >= 0 ? '+' : ''}{item.fundingRatePct}%
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/coins/${item.symbol}`}
                          className="px-2.5 py-1 text-xs font-semibold bg-accent/20 text-accent hover:bg-accent hover:text-white rounded transition-colors"
                        >
                          Detalle
                        </Link>

                        {item.status === 'ACTIVE' ? (
                          <>
                            <button
                              onClick={() => onArchive(item.id)}
                              title="Archivar"
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-surfaceLight rounded transition-colors"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            {onDelete && (
                              <button
                                onClick={() => setConfirmDeleteId(item.id)}
                                title="Eliminar del seguimiento y memoria"
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {onReactivate && (
                              <button
                                onClick={() => onReactivate(item.id)}
                                className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-950/40 rounded transition-colors font-semibold"
                              >
                                Reactivar
                              </button>
                            )}

                            {onDelete && (
                              <button
                                onClick={() => setConfirmDeleteId(item.id)}
                                title="Eliminar permanentemente del historial"
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Vista Móvil Responsiva en Tarjetas de Alta Densidad */}
      <div className="block md:hidden space-y-3">
        {paginatedItems.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-6 text-center text-slate-400 text-sm">
            No hay contratos en esta vista.
          </div>
        ) : (
          paginatedItems.map(item => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`bg-surface border rounded-xl p-4 shadow-sm transition-all space-y-3 ${
                  isSelected ? 'border-rose-600 bg-rose-950/10' : 'border-border hover:border-slate-700'
                }`}
              >
                {/* Cabecera Móvil: Checkbox + Símbolo + Precio + Estado */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="w-4 h-4 rounded border-border bg-surface text-accent cursor-pointer"
                    />
                    <div>
                      <Link href={`/coins/${item.symbol}`} className="text-base font-bold text-white hover:text-accent flex items-center gap-1">
                        <span>{item.symbol}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      </Link>
                      <div className="text-xs text-slate-400 font-mono">
                        ${item.price > 0 ? (item.price >= 1 ? item.price.toFixed(4) : item.price.toFixed(6)) : '--'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                    <StateBadge state={item.state} size="sm" />
                    {item.isTightPlateau && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                        Meseta &le; 2%
                      </span>
                    )}
                  </div>
                </div>

                {/* Métricas Principales en Grid */}
                <div className="grid grid-cols-3 gap-2 bg-surfaceLight/60 p-2.5 rounded-lg border border-border/40 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Impulso</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {item.impulseTotalPct !== null ? `+${item.impulseTotalPct.toFixed(1)}%` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Sin ATH</span>
                    <span className="font-bold text-slate-200 font-mono">
                      {item.hoursWithoutNewHigh ? `${item.hoursWithoutNewHigh.toFixed(1)}h` : '0h'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Rango 2h</span>
                    <span className={`font-bold font-mono ${item.isTightPlateau ? 'text-purple-400' : 'text-slate-300'}`}>
                      {item.range2hPct ? `${item.range2hPct}%` : (item.range30mPct ? `${item.range30mPct}%` : '--')}
                    </span>
                  </div>
                </div>

                {/* Microestructura Móvil (Open Interest, Absorción, Funding) */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono bg-surfaceLight/40 p-2 rounded-lg border border-border/30">
                  <span className="text-slate-400">OI:</span>
                  <span className="text-slate-200 font-semibold">
                    {item.oiValueUsd ? `$${(item.oiValueUsd / 1_000_000).toFixed(1)}M` : 'N/D'}
                  </span>
                  {item.oiChange1hPct !== null && (
                    <span className={item.oiChange1hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      ({item.oiChange1hPct >= 0 ? '+' : ''}{item.oiChange1hPct}%)
                    </span>
                  )}

                  {item.absorptionState === 'HEAVY_ABSORPTION' && (
                    <span className="px-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-semibold">
                      Absorción {item.maxUpperWickPct}%
                    </span>
                  )}

                  {item.fundingRatePct !== null && (
                    <span className={`px-1 rounded text-[10px] font-semibold ${
                      item.fundingRatePct >= 0.05
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                        : 'text-slate-400'
                    }`}>
                      Fund: {item.fundingRatePct >= 0 ? '+' : ''}{item.fundingRatePct}%
                    </span>
                  )}
                </div>

                {/* Acciones Móviles */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-2">
                    {item.status === 'ACTIVE' ? (
                      <>
                        <button
                          onClick={() => onArchive(item.id)}
                          className="text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors px-2 py-1 rounded bg-surfaceLight"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>Archivar</span>
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors px-2 py-1 rounded bg-rose-950/30 border border-rose-900/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {onReactivate && (
                          <button
                            onClick={() => onReactivate(item.id)}
                            className="text-emerald-400 hover:underline font-semibold"
                          >
                            Reactivar
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="text-rose-400 hover:underline flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <Link
                    href={`/coins/${item.symbol}`}
                    className="font-semibold text-accent hover:text-blue-400 flex items-center gap-1 px-3 py-1 rounded-lg bg-accent/10 border border-accent/30"
                  >
                    <span>Bitácora & Análisis &rarr;</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Controles de Navegación de Pantalla y Paginación (Adelante / Retroceder) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface p-3.5 rounded-xl border border-border shadow-sm text-xs">
        
        {/* Contador Informativo */}
        <div className="text-slate-400 font-medium">
          Mostrando <strong className="text-white">{totalItems === 0 ? 0 : startIndex + 1}</strong> a{' '}
          <strong className="text-white">{Math.min(startIndex + pageSize, totalItems)}</strong> de{' '}
          <strong className="text-white">{totalItems}</strong> contratos
        </div>

        {/* Botones de Navegación Adelante / Retroceder y Páginas */}
        <div className="flex items-center gap-2">
          
          {/* Selector de Filas por Página */}
          <div className="flex items-center gap-1.5 mr-2">
            <span className="text-slate-400">Ver:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-surfaceLight text-slate-200 border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value={5}>5 por pág.</option>
              <option value={10}>10 por pág.</option>
              <option value={20}>20 por pág.</option>
              <option value={50}>50 por pág.</option>
            </select>
          </div>

          {/* Botón Primera Página */}
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            title="Primera página"
            className="p-1.5 rounded-lg bg-surfaceLight hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-surfaceLight transition-colors"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Botón Retroceder (< Anterior) */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surfaceLight hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-surfaceLight transition-colors font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Números de Página */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1;
              if (
                p === 1 ||
                p === totalPages ||
                (p >= currentPage - 1 && p <= currentPage + 1)
              ) {
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                      currentPage === p
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-surfaceLight text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              } else if (
                (p === currentPage - 2 && p > 1) ||
                (p === currentPage + 2 && p < totalPages)
              ) {
                return (
                  <span key={p} className="text-slate-600 px-0.5">
                    ...
                  </span>
                );
              }
              return null;
            })}
          </div>

          {/* Botón Adelante (Siguiente >) */}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surfaceLight hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-surfaceLight transition-colors font-medium"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Botón Última Página */}
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            title="Última página"
            className="p-1.5 rounded-lg bg-surfaceLight hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-surfaceLight transition-colors"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

        </div>

      </div>
    </div>
  );
}
