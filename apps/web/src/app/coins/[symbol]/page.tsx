'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CoinChart } from '../../../components/CoinChart';
import { StateBadge } from '../../../components/StateBadge';
import { ArrowLeft, Clock, TrendingUp, AlertCircle, Calendar, ShieldAlert } from 'lucide-react';
import { CoinState } from '@pretra/shared';

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export default function CoinDetailPage({ params }: PageProps) {
  const unwrappedParams = use(params);
  const symbol = unwrappedParams.symbol.toUpperCase();

  // Resumen de la moneda
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['coin-summary', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/coins/${symbol}/summary`);
      if (!res.ok) throw new Error('No se pudo cargar el resumen');
      return res.json();
    },
    refetchInterval: 5000
  });

  // Eventos históricos de la moneda
  const { data: events = [] } = useQuery({
    queryKey: ['coin-events', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/coins/${symbol}/events`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10_000
  });

  const metrics = summary?.metrics || {};
  const changes = metrics.changes || {};

  // Construir marcadores visuales para el gráfico basados en eventos y métricas
  const chartMarkers: any[] = [];
  if (metrics.peakAt) {
    chartMarkers.push({
      time: Math.floor(metrics.peakAt / 1000),
      position: 'aboveBar',
      color: '#F59E0B',
      shape: 'arrowDown',
      text: `Máximo: $${metrics.peakPrice?.toFixed(4)}`
    });
  }

  if (metrics.impulseStartAt) {
    chartMarkers.push({
      time: Math.floor(metrics.impulseStartAt / 1000),
      position: 'belowBar',
      color: '#10B981',
      shape: 'arrowUp',
      text: `Inicio Impulso (+${metrics.impulseTotalPct}%)`
    });
  }

  return (
    <div className="space-y-6">
      
      {/* Botón Volver y Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-surface border border-border text-slate-400 hover:text-white hover:bg-surfaceLight transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-white">{symbol}</h1>
              <span className="text-xs bg-surfaceLight border border-border px-2 py-0.5 rounded text-slate-400">
                USDT PERP
              </span>
              <StateBadge state={summary?.state || CoinState.OBSERVACION} size="md" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Precio actual: <span className="font-mono font-bold text-white">${metrics.currentPrice ? (metrics.currentPrice >= 1 ? metrics.currentPrice.toFixed(4) : metrics.currentPrice.toFixed(6)) : '--'}</span>
            </p>
          </div>
        </div>

        {/* Cobertura */}
        <div className="text-xs text-slate-400 bg-surface border border-border px-3 py-2 rounded-xl flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent" />
          <span>Cobertura histórica: <strong>{metrics.coverageHours || 0} horas</strong></span>
        </div>
      </div>

      {/* Explicación Fáctica del Detector */}
      {metrics.explanation && (
        <div className="bg-surfaceLight/80 border border-border p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-accent mb-1">
              Diagnóstico Fáctico del Algoritmo (v{summary?.metrics?.configVersion || '1.0.0'})
            </h4>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {metrics.explanation}
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5">
              ⚠️ Las mesetas y desaceleraciones son patrones estadísticos descriptivos y no garantizan caída de precio ni constituyen recomendación de inversión.
            </p>
          </div>
        </div>
      )}

      {/* Gráfico TradingView Lightweight Charts */}
      <CoinChart
        symbol={symbol}
        initialCandles={[]}
        markers={chartMarkers}
      />

      {/* Retornos por Ventana Temporal */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Retornos Compuestos por Ventana Temporal (Multiplicativos)
        </h3>

        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 text-center">
          {(['1m', '5m', '15m', '1h', '4h', '12h', '24h', '48h', '72h'] as const).map(win => {
            const val = changes[win];
            return (
              <div key={win} className="bg-surfaceLight/60 border border-border/50 p-2.5 rounded-lg">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">{win}</span>
                <span className={`text-xs font-mono font-bold mt-1 block ${
                  val !== null && val !== undefined
                    ? val >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    : 'text-slate-500'
                }`}>
                  {val !== null && val !== undefined ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : 'N/D'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cronología de Eventos de la Moneda */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          Historial Cronológico de Detecciones y Transiciones
        </h3>

        {events.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">
            Aún no se han registrado cambios de estado para esta moneda.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {events.map((ev: any) => (
              <div key={ev.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">
                      {new Date(ev.detectedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}
                    </span>
                    <StateBadge state={ev.stateTo} size="sm" />
                    {ev.isRetrospective && (
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                        Retrospectivo (Backfill)
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300">
                    {ev.explanation}
                  </p>
                </div>

                <div className="text-right text-[11px] text-slate-500 font-mono">
                  Transición: {ev.stateFrom} → {ev.stateTo}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
