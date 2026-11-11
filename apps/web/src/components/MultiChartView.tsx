'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CoinChart } from './CoinChart';
import { StateBadge } from './StateBadge';
import { LiveTicker } from '../hooks/useRealtimeStream';
import { CoinState } from '@pretra/shared';
import {
  ExternalLink,
  Clock,
  TrendingUp,
  Maximize2,
  ChevronDown,
  Layout,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info
} from 'lucide-react';

interface MultiChartViewProps {
  watchlist: any[];
  liveTickers: Record<string, LiveTicker>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

type LayoutCount = 1 | 2 | 3 | 4 | 5;

export function MultiChartView({
  watchlist,
  liveTickers,
  onRefresh,
  isRefreshing = false,
}: MultiChartViewProps) {
  // Lista de símbolos activos
  const activeCoins = watchlist.filter(item => item.status === 'ACTIVE');
  const allSymbols = activeCoins.map(item => item.symbol);

  // Cantidad de gráficos en pantalla (1, 2, 3, 4, 5)
  const [chartCount, setChartCount] = useState<LayoutCount>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pretra_chart_count');
      if (saved && [1, 2, 3, 4, 5].includes(Number(saved))) {
        return Number(saved) as LayoutCount;
      }
    }
    return 3;
  });

  // Guardar en localStorage cuando cambie
  useEffect(() => {
    localStorage.setItem('pretra_chart_count', chartCount.toString());
  }, [chartCount]);

  // Selección de monedas para cada uno de los 5 slots
  const [slotSymbols, setSlotSymbols] = useState<string[]>(() => {
    const defaults = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT', 'SUIUSDT', 'PIEVERSEUSDT'];
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pretra_slot_symbols');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= 5) return parsed.slice(0, 5);
        } catch {}
      }
    }
    return defaults;
  });

  // Si la lista de monedas cambia y algún slot no tiene asignada una moneda válida, auto-asignar
  useEffect(() => {
    if (allSymbols.length > 0) {
      setSlotSymbols(prev => {
        const next = [...prev];
        for (let i = 0; i < 5; i++) {
          if (!next[i] || (!allSymbols.includes(next[i]) && allSymbols[i])) {
            next[i] = allSymbols[i % allSymbols.length];
          }
        }
        localStorage.setItem('pretra_slot_symbols', JSON.stringify(next));
        return next;
      });
    }
  }, [watchlist]);

  const handleSelectSlotSymbol = (index: number, newSymbol: string) => {
    setSlotSymbols(prev => {
      const next = [...prev];
      next[index] = newSymbol;
      localStorage.setItem('pretra_slot_symbols', JSON.stringify(next));
      return next;
    });
  };

  // Altura del gráfico según la cantidad en pantalla
  const getChartHeight = (count: LayoutCount, index: number) => {
    switch (count) {
      case 1:
        return 420;
      case 2:
        return 340;
      case 3:
        return 280;
      case 4:
        return 260;
      case 5:
        // En 5 gráficos: el primero es principal y más alto, los otros 4 son compactos
        return index === 0 ? 320 : 250;
      default:
        return 300;
    }
  };

  // Retorna las métricas y liveTicker de un símbolo
  const getCoinData = (symbol: string) => {
    const item = watchlist.find(w => w.symbol === symbol);
    const live = liveTickers[symbol];
    const metrics = item?.marketState?.metrics || {};
    const state = live?.state || item?.marketState?.currentState || CoinState.OBSERVACION;
    const price = live?.price ?? metrics.currentPrice ?? 0;
    const changes = live?.changes || metrics.changes || {};
    const impulseTotalPct = metrics.impulseTotalPct ?? null;
    const hoursWithoutNewHigh = live?.hoursWithoutNewHigh ?? metrics.hoursWithoutNewHigh ?? 0;
    const distanceToPeakPct = live?.distanceToPeakPct ?? metrics.distanceToPeakPct ?? 0;
    const explanation = live?.explanation || metrics.explanation || '';
    const range2hPct = metrics.range2hPct ?? null;
    const range30mPct = metrics.range30mPct ?? null;
    const isTightPlateau = metrics.isTightPlateau ?? (range2hPct !== null && range2hPct <= 2.0);
    const oiValueUsd = metrics.oiValueUsd ?? null;
    const oiChange1hPct = metrics.oiChange1hPct ?? null;
    const absorptionState = metrics.absorptionState ?? 'NORMAL';
    const fundingRatePct = metrics.fundingRatePct ?? null;

    return {
      item,
      state,
      price,
      changes,
      impulseTotalPct,
      hoursWithoutNewHigh,
      distanceToPeakPct,
      range2hPct,
      range30mPct,
      isTightPlateau,
      oiValueUsd,
      oiChange1hPct,
      absorptionState,
      fundingRatePct,
      explanation
    };
  };

  return (
    <div className="space-y-4">
      {/* Barra de Control de la Vista Multi-Gráficos */}
      <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        
        {/* Selector de cantidad de gráficos (1, 2, 3, 4, 5) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mr-1">
            <Layout className="w-4 h-4 text-accent" />
            <span>Gráficos en Pantalla:</span>
          </div>

          <div className="inline-flex rounded-lg bg-surfaceLight p-1 border border-border">
            {([1, 2, 3, 4, 5] as const).map(num => (
              <button
                key={num}
                onClick={() => setChartCount(num)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                  chartCount === num
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-surface'
                }`}
              >
                <span>{num}</span>
                <span className="hidden sm:inline text-[11px] font-normal">
                  {num === 1 ? 'Gráfico' : 'Gráficos'}
                </span>
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-400 hidden lg:inline-block ml-2">
            Compara simultáneamente velas, temporalidades e impulsos antes de entrar a un contrato.
          </span>
        </div>

        {/* Info y botón de actualización rápida */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-400">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surfaceLight hover:bg-slate-700 text-slate-200 border border-border transition-colors disabled:opacity-50 text-xs font-medium"
            >
              <span className={`w-2 h-2 rounded-full ${isRefreshing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
              <span>{isRefreshing ? 'Actualizando...' : 'Refrescar Datos'}</span>
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Sincronizado vía WebSocket</span>
          </div>
        </div>

      </div>

      {/* Renderizado de los Gráficos según el Layout Seleccionado */}
      {activeCoins.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center text-slate-400">
          No hay monedas activas para visualizar. Añade una moneda a tu seguimiento primero.
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            chartCount === 1
              ? 'grid-cols-1'
              : chartCount === 2
              ? 'grid-cols-1 lg:grid-cols-2'
              : chartCount === 3
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              : chartCount === 4
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {Array.from({ length: chartCount }).map((_, slotIndex) => {
            const currentSymbol = slotSymbols[slotIndex] || allSymbols[slotIndex % allSymbols.length] || 'BTCUSDT';
            const {
              state,
              price,
              changes,
              impulseTotalPct,
              hoursWithoutNewHigh,
              distanceToPeakPct,
              isTightPlateau,
              oiValueUsd,
              fundingRatePct,
              explanation
            } = getCoinData(currentSymbol);

            const isPrimaryInFive = chartCount === 5 && slotIndex === 0;

            return (
              <div
                key={slotIndex}
                className={`bg-surface border border-border rounded-xl overflow-hidden shadow-md flex flex-col transition-all hover:border-slate-700 ${
                  isPrimaryInFive ? 'md:col-span-2 lg:col-span-4 border-accent/40 shadow-accent/5' : ''
                }`}
              >
                {/* Cabecera del Gráfico con Selector de Moneda y Métricas en Vivo */}
                <div className="p-3 bg-surfaceLight/80 border-b border-border space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    
                    {/* Selector de Símbolo Dropdown */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          value={currentSymbol}
                          onChange={(e) => handleSelectSlotSymbol(slotIndex, e.target.value)}
                          className="bg-surface text-white font-bold text-sm rounded-lg px-2.5 py-1 pr-7 border border-border hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                        >
                          {allSymbols.map(s => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
                      </div>

                      <span className="text-[10px] text-slate-400 bg-surface px-1.5 py-0.5 rounded border border-border/70 hidden sm:inline">
                        Slot #{slotIndex + 1}
                      </span>

                      <StateBadge state={state} size="sm" />
                      {isTightPlateau && (
                        <span className="text-[10px] bg-purple-950/80 border border-purple-800 text-purple-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                          <span>Meseta &le;2%</span>
                        </span>
                      )}
                      {oiValueUsd && (
                        <span className="text-[10px] bg-blue-950/70 border border-blue-800 text-blue-300 px-1.5 py-0.5 rounded font-mono hidden sm:inline" title="Open Interest Total">
                          OI: ${(oiValueUsd / 1_000_000).toFixed(1)}M
                        </span>
                      )}
                      {fundingRatePct !== null && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono hidden sm:inline ${
                          fundingRatePct >= 0.05
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                            : 'bg-surface text-slate-400 border border-border/70'
                        }`} title="Funding Rate actual">
                          F: {fundingRatePct >= 0 ? '+' : ''}{fundingRatePct}%
                        </span>
                      )}
                    </div>

                    {/* Precio y Enlace a Detalle */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-white">
                          ${price > 0 ? (price >= 1 ? price.toFixed(4) : price.toFixed(6)) : '--'}
                        </div>
                      </div>

                      <Link
                        href={`/coins/${currentSymbol}`}
                        title="Abrir análisis completo y desglose de minutos/horas"
                        className="p-1.5 rounded-lg bg-surface hover:bg-accent text-slate-400 hover:text-white border border-border transition-all flex items-center gap-1 text-xs font-semibold"
                      >
                        <span className="hidden sm:inline">Analizar</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                  </div>

                  {/* Pills de Subidas y Desaceleración por Minutos y Horas */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-border/50 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Subidas:</span>
                      
                      {/* Retorno 1m */}
                      {changes['1m'] !== undefined && changes['1m'] !== null && (
                        <span
                          className={`font-mono px-1.5 py-0.2 rounded ${
                            changes['1m'] >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                          }`}
                          title="Cambio en 1 minuto"
                        >
                          1m: {changes['1m'] >= 0 ? '+' : ''}{changes['1m'].toFixed(2)}%
                        </span>
                      )}

                      {/* Retorno 5m */}
                      {changes['5m'] !== undefined && changes['5m'] !== null && (
                        <span
                          className={`font-mono px-1.5 py-0.2 rounded ${
                            changes['5m'] >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                          }`}
                          title="Cambio en 5 minutos"
                        >
                          5m: {changes['5m'] >= 0 ? '+' : ''}{changes['5m'].toFixed(2)}%
                        </span>
                      )}

                      {/* Retorno 15m */}
                      {changes['15m'] !== undefined && changes['15m'] !== null && (
                        <span
                          className={`font-mono px-1.5 py-0.2 rounded ${
                            changes['15m'] >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                          }`}
                          title="Cambio en 15 minutos"
                        >
                          15m: {changes['15m'] >= 0 ? '+' : ''}{changes['15m'].toFixed(2)}%
                        </span>
                      )}

                      {/* Retorno 1h */}
                      {changes['1h'] !== undefined && changes['1h'] !== null && (
                        <span
                          className={`font-mono px-1.5 py-0.2 rounded font-semibold ${
                            changes['1h'] >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                          }`}
                          title="Cambio en 1 hora"
                        >
                          1h: {changes['1h'] >= 0 ? '+' : ''}{changes['1h'].toFixed(2)}%
                        </span>
                      )}

                      {/* Retorno 24h */}
                      {changes['24h'] !== undefined && changes['24h'] !== null && (
                        <span
                          className={`font-mono px-1.5 py-0.2 rounded font-semibold ${
                            changes['24h'] >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                          }`}
                          title="Cambio en 24 horas"
                        >
                          24h: {changes['24h'] >= 0 ? '+' : ''}{changes['24h'].toFixed(2)}%
                        </span>
                      )}
                    </div>

                    {/* Impulso Total & Horas sin Nuevo Máximo */}
                    <div className="flex items-center gap-2 text-slate-400">
                      {impulseTotalPct !== null && (
                        <span className="font-mono text-emerald-400 font-semibold" title="Impulso Total Acumulado">
                          +{impulseTotalPct.toFixed(1)}% imp.
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-slate-300 font-mono" title="Horas transcurridas sin marcar un nuevo máximo">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {hoursWithoutNewHigh ? `${hoursWithoutNewHigh.toFixed(1)}h sin ATH` : '0h'}
                      </span>
                    </div>

                  </div>
                </div>

                {/* Gráfico Lightweight Charts */}
                <div className="flex-1 w-full bg-[#0F131C]">
                  <CoinChart
                    symbol={currentSymbol}
                    height={getChartHeight(chartCount, slotIndex)}
                    compact={chartCount >= 3 && !isPrimaryInFive}
                  />
                </div>

                {/* Footer fáctico con diagnóstico breve */}
                {explanation && (
                  <div className="px-3 py-1.5 bg-surfaceLight/40 border-t border-border/40 text-[11px] text-slate-400 flex items-center justify-between gap-2">
                    <span className="truncate" title={explanation}>
                      💡 {explanation}
                    </span>
                    <Link
                      href={`/coins/${currentSymbol}`}
                      className="text-accent hover:underline shrink-0 text-[10px] font-semibold"
                    >
                      Ver diagnóstico detallado &rarr;
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
