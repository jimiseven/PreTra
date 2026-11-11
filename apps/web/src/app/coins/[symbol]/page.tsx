'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CoinChart, ChartInterval } from '../../../components/CoinChart';
import { StateBadge } from '../../../components/StateBadge';
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  AlertCircle,
  Calendar,
  RefreshCw,
  Gauge,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Info,
  Sparkles,
  Download,
  Copy,
  Check,
  FileText,
  Flame,
  Zap,
  Brain,
  ShieldAlert,
  Layout
} from 'lucide-react';
import { CoinState } from '@pretra/shared';

export default function CoinDetailPage() {
  const routeParams = useParams();
  const rawSymbol = (routeParams?.symbol as string) || '';
  const symbol = rawSymbol.toUpperCase();

  // Resumen de la moneda y métricas del detector
  const {
    data: summary,
    isLoading: loadingSummary,
    isFetching: fetchingSummary,
    refetch: refetchSummary
  } = useQuery({
    queryKey: ['coin-summary', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/coins/${symbol}/summary`);
      if (!res.ok) throw new Error('No se pudo cargar el resumen');
      return res.json();
    },
    refetchInterval: 5000
  });

  // Eventos históricos y transiciones de estado
  const { data: events = [] } = useQuery({
    queryKey: ['coin-events', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/coins/${symbol}/events`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10_000
  });

  // Bitácora de Auditoría para IA y Exportación CSV
  const { data: auditData } = useQuery({
    queryKey: ['coin-audit', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/coins/${symbol}/audit-export`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 15_000
  });

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [singleCoinChartCount, setSingleCoinChartCount] = useState<1 | 2 | 3 | 4>(1);
  const [slotTimeframes, setSlotTimeframes] = useState<ChartInterval[]>(['1m', '15m', '1h', '1d']);

  const handleDownloadCsv = async () => {
    setIsDownloadingCsv(true);
    try {
      let csvContent = auditData?.csv;
      if (!csvContent) {
        const res = await fetch(`/api/coins/${symbol}/audit-export`);
        const data = await res.json();
        csvContent = data.csv;
      }
      if (csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${symbol}_bitacora_pretra_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error al descargar CSV:', err);
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  const handleCopyAiPrompt = async () => {
    try {
      let prompt = auditData?.aiAuditPrompt;
      if (!prompt) {
        const res = await fetch(`/api/coins/${symbol}/audit-export`);
        const data = await res.json();
        prompt = data.aiAuditPrompt;
      }
      if (prompt) {
        await navigator.clipboard.writeText(prompt);
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 3000);
      }
    } catch (err) {
      console.error('Error al copiar prompt:', err);
    }
  };

  const metrics = summary?.metrics || {};
  const changes = metrics.changes || {};
  const speeds = metrics.speeds || {};
  const currentState = summary?.state || CoinState.OBSERVACION;

  // Marcadores visuales para el gráfico
  const chartMarkers: any[] = [];
  if (metrics.peakAt) {
    chartMarkers.push({
      time: Math.floor(metrics.peakAt / 1000),
      position: 'aboveBar',
      color: '#F59E0B',
      shape: 'arrowDown',
      text: `Pico Máx: $${metrics.peakPrice?.toFixed(4)}`
    });
  }

  if (metrics.impulseStartAt) {
    chartMarkers.push({
      time: Math.floor(metrics.impulseStartAt / 1000),
      position: 'belowBar',
      color: '#10B981',
      shape: 'arrowUp',
      text: `Inicio Rally (+${metrics.impulseTotalPct}%)`
    });
  }

  // Fórmulas y diagnósticos de lectura de entrada
  const isDecelerating = (changes['1m'] ?? 0) <= 0 && (changes['5m'] ?? 0) <= 0.1 && (changes['1h'] ?? 0) < (changes['24h'] ?? 0);
  const hoursWithoutHigh = metrics.hoursWithoutNewHigh || 0;
  const distPeak = Math.abs(metrics.distanceToPeakPct || 0);

  // Refrescar consultando directamente Binance
  const handleManualCoinRefresh = async () => {
    try {
      await fetch(`/api/coins/${symbol}/summary?refresh=true`);
    } catch {}
    refetchSummary();
  };

  return (
    <div className="space-y-6">
      
      {/* Botón Volver, Encabezado y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2.5 rounded-xl bg-surface border border-border text-slate-400 hover:text-white hover:bg-surfaceLight transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-white">{symbol}</h1>
              <span className="text-xs bg-surfaceLight border border-border px-2 py-0.5 rounded text-slate-400 font-mono">
                USDT PERP
              </span>
              <StateBadge state={currentState} size="md" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Panel de análisis cuantitativo y monitoreo de momentum en vivo
            </p>
          </div>
        </div>

        {/* Acciones: Bitácora CSV, Copiar Prompt IA, Cobertura y Refresco */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadCsv}
            disabled={isDownloadingCsv}
            title="Descargar bitácora fáctica en formato CSV para auditoría"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/80 hover:text-white transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isDownloadingCsv ? 'Generando...' : 'Descargar CSV'}</span>
          </button>

          <button
            onClick={handleCopyAiPrompt}
            title="Copiar prompt completo formateado para consultar a otra IA (ChatGPT, Claude, Gemini)"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-950/60 border border-blue-800/80 text-blue-300 hover:bg-blue-900/80 hover:text-white transition-all active:scale-95 cursor-pointer"
          >
            {copiedPrompt ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-bold">¡Copiado!</span>
              </>
            ) : (
              <>
                <Brain className="w-3.5 h-3.5 text-blue-400" />
                <span>Prompt IA</span>
              </>
            )}
          </button>

          <button
            onClick={handleManualCoinRefresh}
            disabled={fetchingSummary}
            title="Forzar actualización de precio y velas desde Binance"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface border border-border text-slate-300 hover:text-white hover:bg-surfaceLight transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-accent ${fetchingSummary ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{fetchingSummary ? 'Sincronizando...' : 'Refrescar'}</span>
          </button>

          <div className="text-xs text-slate-400 bg-surface border border-border px-3 py-2 rounded-xl flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            <span>Cobertura: <strong>{metrics.coverageHours || 0}h</strong></span>
          </div>
        </div>
      </div>

      {/* HERO BANNER: PRECIO VISUAL GIGANTE Y MÉTRICAS CLAVE EN TIEMPO REAL */}
      <div className="bg-gradient-to-r from-surface via-surfaceLight/80 to-surface border border-border/80 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        
        {/* Bloque de Precio y Variación */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Binance Futures USDⓈ-M Perpetuo
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] text-emerald-400 font-semibold font-mono">
              En Vivo (Actualización cada 1s)
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-4">
            <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight text-white drop-shadow-sm">
              {typeof metrics.currentPrice === 'number'
                ? metrics.currentPrice >= 1
                  ? `$${metrics.currentPrice.toFixed(4)}`
                  : `$${metrics.currentPrice.toFixed(6)}`
                : '--'}
            </div>

            {/* Variación 24h & 1h */}
            <div className="flex items-center gap-2">
              {changes['24h'] !== undefined && changes['24h'] !== null && (
                <span className={`px-3 py-1 rounded-xl text-sm font-bold font-mono border ${
                  changes['24h'] >= 0
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                    : 'bg-rose-950/80 text-rose-300 border-rose-800'
                }`}>
                  {changes['24h'] >= 0 ? '+' : ''}{changes['24h'].toFixed(2)}% (24h)
                </span>
              )}
              {changes['1h'] !== undefined && changes['1h'] !== null && (
                <span className={`px-2.5 py-1 rounded-xl text-xs font-bold font-mono border ${
                  changes['1h'] >= 0
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                }`}>
                  {changes['1h'] >= 0 ? '+' : ''}{changes['1h'].toFixed(2)}% (1h)
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 flex flex-wrap items-center gap-3 font-mono">
            <span>
              Máx Sesión (ATH): <strong className="text-amber-400">${typeof metrics.peakPrice === 'number' ? metrics.peakPrice.toFixed(4) : '--'}</strong>
            </span>
            <span>•</span>
            <span>
              Distancia al techo: <strong className="text-amber-300">{typeof metrics.distanceToPeakPct === 'number' ? `${metrics.distanceToPeakPct.toFixed(2)}%` : '0%'}</strong>
            </span>
            <span>•</span>
            <span>
              Tiempo sin nuevo ATH: <strong className="text-slate-200">{Number(hoursWithoutHigh || 0).toFixed(1)}h</strong>
            </span>
          </p>
        </div>

        {/* Resumen Rápido de Estado y Rango 2h */}
        <div className="flex items-center gap-3 self-start lg:self-center bg-background/60 p-3.5 rounded-xl border border-border/60">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Condición de Meseta</span>
            <span className={`text-base font-bold font-mono block ${metrics.isTightPlateau ? 'text-purple-300' : 'text-slate-300'}`}>
              {typeof metrics.range2hPct === 'number' ? `${metrics.range2hPct.toFixed(2)}% (2h)` : '--'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {metrics.isTightPlateau ? '✓ Rango Estrecho ≤ 2.0%' : 'Oscilación Amplia'}
            </span>
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
            metrics.isTightPlateau
              ? 'bg-purple-950/80 text-purple-300 border-purple-700 shadow-lg shadow-purple-950/50'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Diagnóstico Fáctico Principal del Algoritmo */}
      {metrics.explanation && (
        <div className="bg-surfaceLight/80 border border-border p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-accent">
                Diagnóstico Fáctico del Motor Matemático (v{metrics.configVersion || '1.0.0'})
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                Reglas Determinísticas
              </span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {metrics.explanation}
            </p>
            <p className="text-[11px] text-slate-400">
              ⚠️ Indicador estrictamente descriptivo de vigilancia estadística. No constituye consejo de inversión ni garantiza reversión.
            </p>
          </div>
        </div>
      )}

      {/* VISTA MULTI-GRÁFICOS SIMULTÁNEOS DE LA MISMA MONEDA (1, 2, 3 o 4 GRÁFICOS) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border p-3.5 rounded-xl shadow-sm">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-accent" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Multi-Gráficos de {symbol}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-800">
                  Auto-actualización 1s
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Visualiza simultáneamente 1, 2, 3 o 4 gráficos de esta misma moneda con temporalidades independientes (1m, 5m, 15m, 1h, 4h, 12h, 1D)
              </p>
            </div>
          </div>

          {/* Selector de número de gráficos: 1, 2, 3, 4 */}
          <div className="flex items-center gap-1 bg-surfaceLight p-1 rounded-xl border border-border self-start sm:self-auto">
            {([1, 2, 3, 4] as const).map(num => (
              <button
                key={num}
                onClick={() => setSingleCoinChartCount(num)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  singleCoinChartCount === num
                    ? 'bg-accent text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-surface'
                }`}
              >
                <span>{num} {num === 1 ? 'Gráfico' : 'Gráficos'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Gráficos de la Misma Moneda */}
        <div className={`grid gap-4 ${
          singleCoinChartCount === 1
            ? 'grid-cols-1'
            : singleCoinChartCount === 2
            ? 'grid-cols-1 lg:grid-cols-2'
            : singleCoinChartCount === 3
            ? 'grid-cols-1 lg:grid-cols-3'
            : 'grid-cols-1 md:grid-cols-2'
        }`}>
          {Array.from({ length: singleCoinChartCount }).map((_, idx) => {
            const defaultIntervals: ChartInterval[] = ['1m', '15m', '1h', '1d'];
            const slotInterval = slotTimeframes[idx] || defaultIntervals[idx] || '1m';
            const chartHeight = singleCoinChartCount === 1 ? 460 : singleCoinChartCount === 2 ? 380 : 320;

            return (
              <div key={idx} className="space-y-1 bg-surface border border-border rounded-xl p-2.5 shadow-md">
                <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-400 border-b border-border/40 pb-1.5 mb-1">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-accent" />
                    <span>Panel #{idx + 1}: {symbol}</span>
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>1s en vivo</span>
                  </span>
                </div>

                <CoinChart
                  symbol={symbol}
                  initialCandles={[]}
                  initialInterval={slotInterval}
                  markers={idx === 0 ? chartMarkers : []}
                  height={chartHeight}
                  compact={singleCoinChartCount > 1}
                  autoRefreshSeconds={1}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* PANEL DETALLADO DE SUBIDAS: Desglose por Minutos, Horas y Velocidades */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Desglose Cuantitativo de Subidas por Minutos y Horas</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Rendimiento multiplicativo exacto: <code className="text-slate-300 font-mono text-[11px]">(P_actual / P_ref - 1) * 100</code>
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Tasa por Minuto:</span>
            <span className={`font-mono font-bold px-2 py-0.5 rounded ${
              (speeds.pctPerMinute ?? 0) >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
            }`}>
              {speeds.pctPerMinute !== undefined ? `${speeds.pctPerMinute >= 0 ? '+' : ''}${speeds.pctPerMinute.toFixed(4)}%/min` : '--'}
            </span>
          </div>
        </div>

        {/* Grupos de Temporalidad: Ultra-Corto (Minutos), Corto (Horas 1-4h), Medio/Largo (12-72h) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Bloque 1: Minutos (1m, 5m, 15m) */}
          <div className="bg-surfaceLight/50 border border-border/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Ultra-Corto Plazo (Minutos)</span>
              </span>
              <span className="text-[10px] text-slate-400">Micro-momentum</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              {(['1m', '5m', '15m'] as const).map(win => {
                const val = changes[win];
                return (
                  <div key={win} className="bg-surface/80 border border-border/60 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 block uppercase font-mono font-bold">{win}</span>
                    <span className={`text-xs font-mono font-bold mt-0.5 block ${
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

            <p className="text-[11px] text-slate-400 pt-1">
              {changes['1m'] !== undefined && changes['5m'] !== undefined ? (
                changes['1m'] < 0 && changes['5m'] <= 0 ? (
                  <span className="text-amber-400 font-medium">⚠️ Freno inmediato en el último minuto.</span>
                ) : changes['1m'] > 0.5 ? (
                  <span className="text-emerald-400 font-medium">🚀 Impulso activo en velas de 1 minuto.</span>
                ) : (
                  <span>Oscilación contenida en micro-temporalidad.</span>
                )
              ) : 'Calculando micro-retornos...'}
            </p>
          </div>

          {/* Bloque 2: Horas Inmediatas (1h, 4h) */}
          <div className="bg-surfaceLight/50 border border-border/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Corto Plazo (1h - 4h)</span>
              </span>
              <span className="text-[10px] text-slate-400">Sesión actual</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              {(['1h', '4h'] as const).map(win => {
                const val = changes[win];
                return (
                  <div key={win} className="bg-surface/80 border border-border/60 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 block uppercase font-mono font-bold">{win}</span>
                    <span className={`text-sm font-mono font-bold mt-0.5 block ${
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

            <div className="text-[11px] text-slate-400 pt-1 flex items-center justify-between">
              <span>Tasa horaria estimada:</span>
              <span className="font-mono font-semibold text-slate-200">
                {speeds.hourlyRate !== undefined ? `${speeds.hourlyRate >= 0 ? '+' : ''}${speeds.hourlyRate.toFixed(2)}%/h` : '--'}
              </span>
            </div>
          </div>

          {/* Bloque 3: Acumulado Mayor (12h, 24h, 48h, 72h) */}
          <div className="bg-surfaceLight/50 border border-border/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Impulso Acumulado (12h a 72h)</span>
              </span>
              <span className="text-[10px] text-slate-400">Dimensión del rally</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
              {(['12h', '24h', '48h', '72h'] as const).map(win => {
                const val = changes[win];
                return (
                  <div key={win} className="bg-surface/80 border border-border/60 p-1.5 rounded-lg">
                    <span className="text-[9px] text-slate-400 block uppercase font-mono font-bold">{win}</span>
                    <span className={`text-[11px] font-mono font-bold mt-0.5 block ${
                      val !== null && val !== undefined
                        ? val >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        : 'text-slate-500'
                    }`}>
                      {val !== null && val !== undefined ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : 'N/D'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] text-slate-400 pt-1 flex items-center justify-between">
              <span>Impulso total detectado:</span>
              <span className="font-mono font-bold text-emerald-400">
                {metrics.impulseTotalPct ? `+${metrics.impulseTotalPct.toFixed(1)}%` : '--'}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* DETECTOR DE MESETA: CRITERIO DE RANGO ESTRECHO <= 2% TRAS SUBIDA SOSTENIDA */}
      <div className={`border rounded-xl p-5 space-y-4 shadow-sm ${
        metrics.isTightPlateau
          ? 'bg-purple-950/20 border-purple-800/80'
          : 'bg-surface border-border'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              metrics.isTightPlateau ? 'bg-purple-900/60 text-purple-300' : 'bg-surfaceLight text-slate-400'
            }`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Verificación de Meseta Estrecha (Criterio &le; 2% de Rango)</span>
                {metrics.isTightPlateau && (
                  <span className="text-[10px] bg-purple-900/80 border border-purple-700 text-purple-200 px-2 py-0.5 rounded-full font-bold">
                    Condición Cumplida
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Identifica si tras la subida de los últimos 5 días la moneda no tiene subidas ni bajas mayores al 2% en 2h o 30m
              </p>
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="text-slate-400">Subida previa 5 días (120h): </span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              +{typeof metrics.surge5dPct === 'number' ? metrics.surge5dPct.toFixed(1) : (typeof metrics.impulseTotalPct === 'number' ? metrics.impulseTotalPct.toFixed(1) : '0')}%
            </span>
          </div>
        </div>

        {/* 4 Ventanas de Rango: 30m, 1h, 2h, 4h */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={`p-3 rounded-xl border text-center ${
            typeof metrics.range30mPct === 'number' && metrics.range30mPct <= 2.0
              ? 'bg-purple-950/40 border-purple-700 text-purple-300'
              : 'bg-surfaceLight/60 border-border text-slate-300'
          }`}>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Rango Últimos 30m</span>
            <span className="text-base font-bold font-mono mt-1 block">
              {typeof metrics.range30mPct === 'number' ? `${metrics.range30mPct.toFixed(2)}%` : '--'}
            </span>
            <span className="text-[10px] block mt-0.5">
              {typeof metrics.range30mPct === 'number' && metrics.range30mPct <= 2.0 ? '✓ ≤ 2.0% (Meseta)' : 'Oscilación'}
            </span>
          </div>

          <div className={`p-3 rounded-xl border text-center ${
            typeof metrics.range1hPct === 'number' && metrics.range1hPct <= 2.0
              ? 'bg-purple-950/40 border-purple-700 text-purple-300'
              : 'bg-surfaceLight/60 border-border text-slate-300'
          }`}>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Rango Última 1h</span>
            <span className="text-base font-bold font-mono mt-1 block">
              {typeof metrics.range1hPct === 'number' ? `${metrics.range1hPct.toFixed(2)}%` : '--'}
            </span>
            <span className="text-[10px] block mt-0.5">
              {typeof metrics.range1hPct === 'number' && metrics.range1hPct <= 2.0 ? '✓ ≤ 2.0% (Meseta)' : 'Oscilación'}
            </span>
          </div>

          <div className={`p-3 rounded-xl border text-center ${
            typeof metrics.range2hPct === 'number' && metrics.range2hPct <= 2.0
              ? 'bg-purple-950/50 border-purple-600 text-purple-200 ring-1 ring-purple-600/50'
              : 'bg-surfaceLight/60 border-border text-slate-300'
          }`}>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Rango Últimas 2h</span>
            <span className="text-base font-bold font-mono mt-1 block">
              {typeof metrics.range2hPct === 'number' ? `${metrics.range2hPct.toFixed(2)}%` : '--'}
            </span>
            <span className="text-[10px] block mt-0.5 font-semibold">
              {typeof metrics.range2hPct === 'number' && metrics.range2hPct <= 2.0 ? '✓ ≤ 2.0% (Clave Meseta)' : 'Oscilación'}
            </span>
          </div>

          <div className={`p-3 rounded-xl border text-center bg-surfaceLight/60 border-border text-slate-300`}>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Rango Últimas 4h</span>
            <span className="text-base font-bold font-mono mt-1 block">
              {typeof metrics.range4hPct === 'number' ? `${metrics.range4hPct.toFixed(2)}%` : '--'}
            </span>
            <span className="text-[10px] block mt-0.5 text-slate-400">
              Canal de sesión
            </span>
          </div>
        </div>

        {/* Diagnóstico Explicativo del Umbral */}
        <div className="text-xs p-3 rounded-lg bg-surface/80 border border-border/80 text-slate-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {metrics.isTightPlateau ? (
              <span>
                <strong>Lectura Técnica:</strong> El activo cumple la regla de estancamiento. En las últimas 2 horas (o 30 minutos), la diferencia entre el máximo y mínimo es de apenas <strong>{typeof metrics.range2hPct === 'number' ? `${metrics.range2hPct}%` : (typeof metrics.range30mPct === 'number' ? `${metrics.range30mPct}%` : '--')}</strong> (&le; 2.0%), manteniéndose sin nuevos máximos desde hace <strong>{Number(hoursWithoutHigh || 0).toFixed(1)} horas</strong> tras el impulso acumulado de 5 días.
              </span>
            ) : (
              <span>
                <strong>Lectura Técnica:</strong> La oscilación en las últimas 2 horas es de <strong>{typeof metrics.range2hPct === 'number' ? `${metrics.range2hPct}%` : '--'}</strong>. Aún no se consolida un rango &le; 2.0% continuo o el precio sigue teniendo fluctuaciones más amplias.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* SECCIÓN AVANZADA: FLUJO Y MICROESTRUCTURA DE MERCADO (OI, ABSORCIÓN Y FUNDING) */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Microestructura y Flujo Institucional (Binance Futures)</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800">
                  En Vivo
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Detección de divergencias de Interés Abierto (OI), mechas de absorción masiva y riesgo de liquidaciones por Funding Rate
              </p>
            </div>
          </div>
        </div>

        {/* 3 Bloques de Flujo Institucional */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          {/* Bloque 1: Divergencia de Open Interest */}
          <div className="bg-surfaceLight/50 border border-border/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-accent" />
                <span>Interés Abierto (Open Interest)</span>
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                metrics.oiDivergence === 'EXHAUSTION_DROP'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : metrics.oiDivergence === 'ABSORPTION_SPIKE'
                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
              }`}>
                {metrics.oiDivergence === 'EXHAUSTION_DROP' ? '⚠️ Agotamiento (OI -)' : (metrics.oiDivergence === 'ABSORPTION_SPIKE' ? '🛑 Absorción (OI +)' : 'Normal / Neutro')}
              </span>
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Total Contratos OI:</span>
                <span className="font-mono font-bold text-white">
                  {metrics.oiValueUsd ? `$${(metrics.oiValueUsd / 1_000_000).toFixed(2)}M USD` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Variación en 1 hora:</span>
                <span className={`font-mono font-bold ${
                  typeof metrics.oiChange1hPct === 'number'
                    ? metrics.oiChange1hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    : 'text-slate-500'
                }`}>
                  {typeof metrics.oiChange1hPct === 'number' ? `${metrics.oiChange1hPct >= 0 ? '+' : ''}${metrics.oiChange1hPct.toFixed(2)}%` : '--'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 pt-1 leading-relaxed bg-surface/60 p-2 rounded-lg border border-border/40">
              {metrics.oiDivergenceNote || 'Supervisando flujo de posiciones abiertas en Binance.'}
            </p>
          </div>

          {/* Bloque 2: Clímax de Volumen y Absorción */}
          <div className="bg-surfaceLight/50 border border-border/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>Clímax de Volumen & Absorción</span>
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                metrics.absorptionState === 'HEAVY_ABSORPTION'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                  : metrics.absorptionState === 'MODERATE_ABSORPTION'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-slate-800 text-slate-300'
              }`}>
                {metrics.absorptionState === 'HEAVY_ABSORPTION' ? '🚨 Absorción Fuerte' : (metrics.absorptionState === 'MODERATE_ABSORPTION' ? '⚠️ Absorción Moderada' : 'Normal')}
              </span>
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Mecha Superior Máxima:</span>
                <span className="font-mono font-bold text-slate-200">
                  {typeof metrics.maxUpperWickPct === 'number' ? `${metrics.maxUpperWickPct.toFixed(1)}% de la vela` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Clímax de Volumen vs Media:</span>
                <span className="font-mono font-bold text-amber-400">
                  {typeof metrics.climaxVolumeRatio === 'number' ? `${metrics.climaxVolumeRatio.toFixed(1)}x media` : '1.0x'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 pt-1 leading-relaxed bg-surface/60 p-2 rounded-lg border border-border/40">
              {metrics.absorptionNote || 'No se han detectado mechas de rechazo con clímax de volumen violento.'}
            </p>
          </div>

          {/* Bloque 3: Funding Rate y Riesgo de Liquidación */}
          <div className="bg-surfaceLight/50 border border-border/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <span>Funding Rate & Liquidación</span>
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                metrics.liquidationRisk === 'HIGH'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : metrics.liquidationRisk === 'MEDIUM'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
              }`}>
                Riesgo: {metrics.liquidationRisk === 'HIGH' ? 'ALTO' : (metrics.liquidationRisk === 'MEDIUM' ? 'MEDIO' : 'BAJO')}
              </span>
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Tasa Actual (8h):</span>
                <span className="font-mono font-bold text-slate-200">
                  {typeof metrics.fundingRatePct === 'number' ? `${metrics.fundingRatePct >= 0 ? '+' : ''}${metrics.fundingRatePct.toFixed(4)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Tasa Anualizada APR:</span>
                <span className={`font-mono font-bold ${
                  typeof metrics.fundingRateAnnualizedPct === 'number' && metrics.fundingRateAnnualizedPct >= 30
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}>
                  {typeof metrics.fundingRateAnnualizedPct === 'number' ? `${metrics.fundingRateAnnualizedPct >= 0 ? '+' : ''}${metrics.fundingRateAnnualizedPct.toFixed(1)}%` : '--'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 pt-1 leading-relaxed bg-surface/60 p-2 rounded-lg border border-border/40">
              {metrics.fundingStatus === 'EXTREME_LONG_CROWD'
                ? '⚠️ Hacinamiento extremo de largos. Mantener posiciones compradas es muy caro; alta vulnerabilidad a cascada bajista.'
                : metrics.fundingStatus === 'HIGH_LONG'
                ? 'Financiamiento elevado a favor de cortos. Posible presión sobre posiciones alcistas si no hay nuevos máximos.'
                : 'Financiamiento equilibrado dentro de parámetros estándar.'}
            </p>
          </div>

        </div>
      </div>

      {/* TABLERO DE ANÁLISIS DE ENTRADA / DECISIÓN OPERATIVA */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-accent" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Análisis Fáctico para Evaluación de Entrada
              </h3>
              <p className="text-xs text-slate-400">
                Puntos de control cuantitativos antes de considerar operar este contrato
              </p>
            </div>
          </div>

          <span className="text-xs px-2.5 py-1 rounded-full bg-surfaceLight border border-border text-slate-300 font-mono">
            Estado: {currentState}
          </span>
        </div>

        {/* 4 Métricas Clave de Decisión */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Métrica 1: Desaceleración y Freno */}
          <div className="bg-surfaceLight/60 border border-border p-3.5 rounded-xl space-y-1.5">
            <span className="text-xs text-slate-400 block font-medium">¿Freno o Continuidad?</span>
            <div className="flex items-center gap-2">
              {currentState === CoinState.MESETA_TEMPRANA ? (
                <div className="flex items-center gap-1.5 text-purple-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Meseta Confirmada</span>
                </div>
              ) : currentState === CoinState.DESACELERACION ? (
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Desacelerando</span>
                </div>
              ) : currentState === CoinState.IMPULSO_ALCISTA ? (
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
                  <TrendingUp className="w-4 h-4" />
                  <span>En Pleno Impulso</span>
                </div>
              ) : currentState === CoinState.RUPTURA_BAJISTA ? (
                <div className="flex items-center gap-1.5 text-rose-400 font-bold text-sm">
                  <TrendingDown className="w-4 h-4" />
                  <span>Ruptura Bajista</span>
                </div>
              ) : (
                <span className="text-slate-300 font-bold text-sm">En Observación</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {currentState === CoinState.MESETA_TEMPRANA
                ? 'El precio detuvo la creación de nuevos máximos y se mantiene en rango estrecho.'
                : currentState === CoinState.DESACELERACION
                ? 'La velocidad de ascenso decayó notablemente frente a las horas previas.'
                : 'Monitoreando la evolución del impulso actual.'}
            </p>
          </div>

          {/* Métrica 2: Distancia al Pico Techo */}
          <div className="bg-surfaceLight/60 border border-border p-3.5 rounded-xl space-y-1.5">
            <span className="text-xs text-slate-400 block font-medium">Distancia al Pico Máximo</span>
            <div className="text-base font-bold font-mono text-amber-400">
              {metrics.distanceToPeakPct ? `${metrics.distanceToPeakPct.toFixed(2)}%` : '0.00%'}
            </div>
            <p className="text-[11px] text-slate-400">
              {distPeak <= 2.5 ? (
                <span className="text-slate-200">Muy cerca del techo ({distPeak.toFixed(1)}%). Menor recorrido si se busca retroceso.</span>
              ) : distPeak <= 6.0 ? (
                <span className="text-slate-200">Rango ideal de meseta temprana (a {distPeak.toFixed(1)}% del techo).</span>
              ) : (
                <span className="text-slate-400">Lejos del pico (&gt;6%). Puede indicar corrección en marcha.</span>
              )}
            </p>
          </div>

          {/* Métrica 3: Horas sin Nuevo ATH */}
          <div className="bg-surfaceLight/60 border border-border p-3.5 rounded-xl space-y-1.5">
            <span className="text-xs text-slate-400 block font-medium">Tiempo sin Nuevo Máximo</span>
            <div className="text-base font-bold font-mono text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-accent" />
              <span>{hoursWithoutHigh ? `${hoursWithoutHigh.toFixed(1)} horas` : '0h'}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {hoursWithoutHigh >= 4 ? (
                <span className="text-purple-300 font-medium">Consolidación madura (&gt;4h). Los compradores no logran marcar nuevo ATH.</span>
              ) : hoursWithoutHigh >= 1.5 ? (
                <span className="text-slate-300">Formación incipiente de estancamiento.</span>
              ) : (
                <span className="text-slate-400">Nuevo máximo muy reciente o continuo.</span>
              )}
            </p>
          </div>

          {/* Métrica 4: Rango de Consolidación */}
          <div className="bg-surfaceLight/60 border border-border p-3.5 rounded-xl space-y-1.5">
            <span className="text-xs text-slate-400 block font-medium">Rango de Consolidación</span>
            <div className="text-base font-bold font-mono text-slate-200">
              {metrics.recentRangePct ? `${metrics.recentRangePct.toFixed(2)}%` : '--'}
            </div>
            <p className="text-[11px] text-slate-400">
              {typeof metrics.rangeHigh === 'number' && typeof metrics.rangeLow === 'number' ? (
                <span>
                  Soporte: ${metrics.rangeLow.toFixed(4)} | Techo: ${metrics.rangeHigh.toFixed(4)}
                </span>
              ) : (
                <span>Calculando amplitud de canal...</span>
              )}
            </p>
          </div>

        </div>

        {/* Línea de Tiempo de 4 Fases Visuales */}
        <div className="bg-surfaceLight/40 border border-border/60 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span>Fases Cronológicas del Movimiento</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            
            {/* Fase 1 */}
            <div className="p-2.5 rounded-lg bg-surface border border-border/80 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold text-emerald-400">1. Impulso Fuerte</span>
                <span>+{typeof metrics.impulseTotalPct === 'number' ? metrics.impulseTotalPct.toFixed(0) : 0}%</span>
              </div>
              <p className="text-[11px] text-slate-300">
                {metrics.impulseStartAt
                  ? `Iniciado: ${new Date(metrics.impulseStartAt).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })}`
                  : 'Rally inicial detectado'}
              </p>
            </div>

            {/* Fase 2 */}
            <div className="p-2.5 rounded-lg bg-surface border border-border/80 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold text-amber-400">2. Techo / Pico</span>
                <span className="font-mono">{typeof metrics.peakPrice === 'number' ? `$${metrics.peakPrice.toFixed(2)}` : '--'}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                {metrics.peakAt
                  ? `Marcado hace ${Number(hoursWithoutHigh || 0).toFixed(1)}h`
                  : 'Pico más alto registrado'}
              </p>
            </div>

            {/* Fase 3 */}
            <div className="p-2.5 rounded-lg bg-surface border border-border/80 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold text-purple-400">3. Meseta Temprana</span>
                <span>Rango {typeof metrics.recentRangePct === 'number' ? `${metrics.recentRangePct.toFixed(1)}%` : '--'}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                {hoursWithoutHigh >= 2
                  ? `${Number(hoursWithoutHigh || 0).toFixed(1)}h en canal lateral estrecho`
                  : 'En observación de rango'}
              </p>
            </div>

            {/* Fase 4 */}
            <div className="p-2.5 rounded-lg bg-surface border border-border/80 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold text-blue-400">4. Estado Actual</span>
                <span className="font-mono">{typeof metrics.currentPrice === 'number' ? `$${metrics.currentPrice.toFixed(2)}` : '--'}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                {typeof metrics.distanceToPeakPct === 'number' ? `${metrics.distanceToPeakPct.toFixed(1)}% del techo` : 'Precio presente'}
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* Cronología de Eventos de la Moneda */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          <span>Historial Cronológico de Detecciones y Transiciones</span>
        </h3>

        {events.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Aún no se han registrado transiciones de estado para este contrato.
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
                  Transición: {ev.stateFrom} &rarr; {ev.stateTo}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECCIÓN BITÁCORA POST-MORTEM & AUDITORÍA PARA OTRAS IA */}
      <div className="bg-surface border border-emerald-800/60 rounded-xl p-5 space-y-4 shadow-lg shadow-emerald-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 text-emerald-400 flex items-center justify-center border border-emerald-800/80">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Bitácora Cuantitativa Post-Mortem y Auditoría para IA</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700">
                  Exportable CSV
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Descarga un reporte fáctico con microestructura y mechas, o copia el prompt pre-estructurado para analizar este caso en ChatGPT, Claude o Gemini
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={isDownloadingCsv}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloadingCsv ? 'Generando CSV...' : `Descargar CSV (${symbol})`}</span>
            </button>

            <button
              onClick={handleCopyAiPrompt}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>¡Prompt Copiado al Portapapeles!</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 text-blue-200" />
                  <span>Copiar Prompt para Otra IA</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Resumen Informativo de la Bitácora */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-surfaceLight/40 p-3.5 rounded-xl border border-border/50">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Contenido del Archivo</span>
            <span className="text-slate-200 font-medium mt-0.5 block">
              100 velas (15m), volumen, mecha sup %, rangos y cambios
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Metadatos de Flujo</span>
            <span className="text-slate-200 font-medium mt-0.5 block">
              Divergencia OI, clímax de absorción y Funding Rate Binance
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Compatibilidad IA</span>
            <span className="text-slate-200 font-medium mt-0.5 block">
              Formato CSV estándar + Prompt cuantitativo listo para pegar
            </span>
          </div>
        </div>

        {/* Botón para Desplegar / Colapsar la vista previa del Prompt */}
        <div className="pt-1">
          <button
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="text-xs text-accent hover:underline flex items-center gap-1 font-semibold cursor-pointer"
          >
            <span>{isPreviewOpen ? 'Ocultar vista previa del prompt' : 'Ver vista previa del prompt pre-diseñado para IA'}</span>
            <span>{isPreviewOpen ? '▲' : '▼'}</span>
          </button>

          {isPreviewOpen && (
            <div className="mt-3 p-4 rounded-xl bg-background border border-border text-xs text-slate-300 font-mono space-y-2 whitespace-pre-wrap max-h-72 overflow-y-auto">
              {auditData?.aiAuditPrompt || 'Cargando prompt estructurado...'}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
