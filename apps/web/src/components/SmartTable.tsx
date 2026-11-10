'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StateBadge } from './StateBadge';
import { CoinState } from '@pretra/shared';
import { ExternalLink, Archive, RefreshCw, ArrowUpDown, Clock, TrendingUp } from 'lucide-react';
import { LiveTicker } from '../hooks/useRealtimeStream';

interface SmartTableProps {
  items: any[];
  liveTickers: Record<string, LiveTicker>;
  onArchive: (id: string) => void;
  onReactivate?: (id: string) => void;
}

type SortField = 'priority' | 'hoursWithoutNewHigh' | 'impulse' | 'symbol' | 'price';

export function SmartTable({ items, liveTickers, onArchive, onReactivate }: SmartTableProps) {
  const [filter, setFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Combinar datos persistidos con tickers en vivo
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

    // Prioridad descriptiva de vigilancia (NO consejo financiero)
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
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'ALL' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Activas ({enrichedItems.filter(i => i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setFilter(CoinState.MESETA_TEMPRANA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.MESETA_TEMPRANA ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Meseta Temprana ({enrichedItems.filter(i => i.state === CoinState.MESETA_TEMPRANA && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setFilter(CoinState.DESACELERACION)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.DESACELERACION ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Desaceleración ({enrichedItems.filter(i => i.state === CoinState.DESACELERACION && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setFilter(CoinState.IMPULSO_ALCISTA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.IMPULSO_ALCISTA ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Impulso ({enrichedItems.filter(i => i.state === CoinState.IMPULSO_ALCISTA && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setFilter(CoinState.RUPTURA_BAJISTA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === CoinState.RUPTURA_BAJISTA ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Ruptura ({enrichedItems.filter(i => i.state === CoinState.RUPTURA_BAJISTA && i.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setFilter('ARCHIVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'ARCHIVED' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-surfaceLight'
            }`}
          >
            Archivadas ({enrichedItems.filter(i => i.status === 'ARCHIVED').length})
          </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" />
          <span>Actualización en tiempo real (SSE)</span>
        </div>
      </div>

      {/* Tabla Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surfaceLight text-slate-400 text-xs uppercase border-b border-border">
            <tr>
              <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-1">
                  <span>Símbolo</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('price')}>
                <div className="flex items-center gap-1">
                  <span>Precio</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4">Cambio 1h</th>
              <th className="py-3 px-4">Cambio 24h</th>
              <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('impulse')}>
                <div className="flex items-center gap-1">
                  <span>Impulso Total</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('hoursWithoutNewHigh')}>
                <div className="flex items-center gap-1">
                  <span>Sin Máx.</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4">Distancia Máx.</th>
              <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('priority')}>
                <div className="flex items-center gap-1">
                  <span>Estado</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4">Rango Consolidación</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400">
                  No hay contratos en esta vista. Añade una moneda con el botón superior.
                </td>
              </tr>
            ) : (
              sortedItems.map(item => (
                <tr key={item.id} className="hover:bg-surfaceLight/50 transition-colors group">
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

                  <td className="py-3.5 px-4 font-mono text-slate-300">
                    {item.recentRangePct ? `${item.recentRangePct.toFixed(2)}%` : '--'}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/coins/${item.symbol}`}
                        className="px-2.5 py-1 text-xs font-semibold bg-accent/20 text-accent hover:bg-accent hover:text-white rounded transition-colors"
                      >
                        Ver Detalle
                      </Link>
                      {item.status === 'ACTIVE' ? (
                        <button
                          onClick={() => onArchive(item.id)}
                          title="Archivar"
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      ) : (
                        onReactivate && (
                          <button
                            onClick={() => onReactivate(item.id)}
                            className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-950/40 rounded transition-colors"
                          >
                            Reactivar
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
