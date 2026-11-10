'use client';

import React from 'react';
import Link from 'next/link';
import { StateBadge } from './StateBadge';
import { LiveTicker } from '../hooks/useRealtimeStream';
import { Clock, TrendingUp, ChevronRight, Archive } from 'lucide-react';
import { CoinState } from '@pretra/shared';

interface MobileCardViewProps {
  items: any[];
  liveTickers: Record<string, LiveTicker>;
  onArchive: (id: string) => void;
}

export function MobileCardView({ items, liveTickers, onArchive }: MobileCardViewProps) {
  const activeItems = items.filter(i => i.status === 'ACTIVE');

  return (
    <div className="block md:hidden space-y-3">
      {activeItems.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-slate-400 text-sm">
          No hay monedas activas en seguimiento. Pulsa &quot;+ Añadir Moneda&quot; para comenzar.
        </div>
      ) : (
        activeItems.map(item => {
          const live = liveTickers[item.symbol];
          const metrics = item.marketState?.metrics || {};
          const state = live?.state || item.marketState?.currentState || CoinState.OBSERVACION;
          const price = live?.price ?? metrics.currentPrice ?? 0;
          const change1h = live?.change1h ?? metrics.changes?.['1h'] ?? null;
          const impulseTotalPct = metrics.impulseTotalPct ?? null;
          const hoursWithoutNewHigh = live?.hoursWithoutNewHigh ?? metrics.hoursWithoutNewHigh ?? 0;
          const distanceToPeakPct = live?.distanceToPeakPct ?? metrics.distanceToPeakPct ?? 0;

          return (
            <div
              key={item.id}
              className="bg-surface border border-border rounded-xl p-4 shadow-sm hover:border-slate-700 transition-all space-y-3"
            >
              {/* Header de la tarjeta */}
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/coins/${item.symbol}`} className="text-base font-bold text-white hover:text-accent">
                    {item.symbol}
                  </Link>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    ${price > 0 ? (price >= 1 ? price.toFixed(4) : price.toFixed(6)) : '--'}
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1">
                  <StateBadge state={state} size="sm" />
                  {change1h !== null && (
                    <span className={`text-xs font-mono font-medium ${change1h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      1h: {change1h >= 0 ? '+' : ''}{change1h.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Grid de Métricas Principales */}
              <div className="grid grid-cols-3 gap-2 bg-surfaceLight/60 p-2.5 rounded-lg border border-border/40 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Impulso Previo</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1 font-mono">
                    <TrendingUp className="w-3 h-3" />
                    {impulseTotalPct !== null ? `+${impulseTotalPct.toFixed(1)}%` : '--'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block">Sin Máximo</span>
                  <span className="font-bold text-slate-200 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {hoursWithoutNewHigh ? `${hoursWithoutNewHigh.toFixed(1)}h` : '0h'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block">Dist. Techo</span>
                  <span className="font-bold text-amber-400 font-mono">
                    {distanceToPeakPct ? `${distanceToPeakPct.toFixed(2)}%` : '0%'}
                  </span>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  onClick={() => onArchive(item.id)}
                  className="text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archivar</span>
                </button>

                <Link
                  href={`/coins/${item.symbol}`}
                  className="font-semibold text-accent hover:text-blue-400 flex items-center gap-0.5"
                >
                  <span>Ver Gráfico y Métricas</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
