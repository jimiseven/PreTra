'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, SeriesMarker, Time } from 'lightweight-charts';

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '12h' | '1d';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CoinChartProps {
  symbol: string;
  initialCandles?: CandleData[];
  initialInterval?: ChartInterval;
  markers?: Array<{
    time: number;
    position: 'aboveBar' | 'belowBar' | 'inBar';
    color: string;
    shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
    text: string;
  }>;
  height?: number;
  compact?: boolean;
  autoRefreshSeconds?: number;
  onPriceUpdate?: (price: number) => void;
}

export function CoinChart({
  symbol,
  initialCandles = [],
  initialInterval = '1m',
  markers = [],
  height = 400,
  compact = false,
  autoRefreshSeconds = 1,
  onPriceUpdate
}: CoinChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);

  const [interval, setInterval] = useState<ChartInterval>(initialInterval);
  const [candles, setCandles] = useState<CandleData[]>(initialCandles);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);

  // Al cambiar de temporalidad o de moneda, permitimos re-centrar una sola vez
  const handleIntervalChange = (tf: ChartInterval) => {
    isFirstLoadRef.current = true;
    setInterval(tf);
  };

  const handleResetZoom = () => {
    chartRef.current?.timeScale().fitContent();
  };

  // Carga de velas por intervalo con resampling automático
  useEffect(() => {
    let isCancelled = false;
    isFirstLoadRef.current = true;
    async function loadCandles() {
      setIsLoadingCandles(true);
      try {
        const res = await fetch(`/api/coins/${symbol}/candles?interval=${interval}&limit=1000`);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setCandles(data);
        }
      } catch {
        // Fallback a iniciales
      } finally {
        if (!isCancelled) setIsLoadingCandles(false);
      }
    }
    loadCandles();
    return () => {
      isCancelled = true;
    };
  }, [symbol, interval]);

  // Auto-actualización ligera en tiempo real cada N segundos (por defecto 1s)
  useEffect(() => {
    if (!autoRefreshSeconds || autoRefreshSeconds <= 0) return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/coins/${symbol}/candles?interval=${interval}&limit=50`);
        if (res.ok) {
          const freshData: CandleData[] = await res.json();
          if (freshData.length > 0 && seriesRef.current) {
            const lastCandle = freshData[freshData.length - 1];
            seriesRef.current.update({
              time: lastCandle.time as Time,
              open: lastCandle.open,
              high: lastCandle.high,
              low: lastCandle.low,
              close: lastCandle.close
            });

            if (onPriceUpdate) {
              onPriceUpdate(lastCandle.close);
            }
          }
        }
      } catch {}
    }, autoRefreshSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [symbol, interval, autoRefreshSeconds, onPriceUpdate]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Crear instancia de Lightweight Chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#0F131C' },
        textColor: '#94A3B8',
      },
      grid: {
        vertLines: { color: '#1E2330' },
        horzLines: { color: '#1E2330' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#2A3040',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#2A3040',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  // Actualizar datos de velas y marcadores en la serie
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    // Formatear velas asegurando orden ascendente y timestamps únicos
    const formattedCandles = candles
      .filter((c, idx, arr) => idx === 0 || c.time > arr[idx - 1].time)
      .map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    seriesRef.current.setData(formattedCandles);

    // Añadir marcadores visuales (Impulso, Techo, Meseta, Ruptura)
    if (markers.length > 0) {
      const seriesMarkers: SeriesMarker<Time>[] = markers
        .filter(m => formattedCandles.some(c => (c.time as number) >= m.time - 300 && (c.time as number) <= m.time + 300))
        .map(m => ({
          time: m.time as Time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        }));
      seriesRef.current.setMarkers(seriesMarkers);
    }

    // Solo re-centramos automáticamente la primera vez que se carga la moneda o temporalidad,
    // permitiendo al usuario mover, hacer zoom o cambiar el aspecto sin que se regrese solo
    if (isFirstLoadRef.current) {
      chartRef.current?.timeScale().fitContent();
      isFirstLoadRef.current = false;
    }
  }, [candles, markers]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
      {/* Barra de Controles de Intervalo */}
      <div className={`flex items-center justify-between border-b border-border bg-surfaceLight/50 ${
        compact ? 'px-2.5 py-1.5' : 'px-4 py-2.5'
      }`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {!compact && <span className="text-xs font-semibold text-slate-400">Temporalidad:</span>}
          {(['1m', '5m', '15m', '1h', '4h', '12h', '1d'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => handleIntervalChange(tf)}
              className={`font-semibold rounded transition-colors ${
                compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
              } ${
                interval === tf ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-surface'
              }`}
            >
              {tf === '1d' ? '1D (Día)' : tf}
            </button>
          ))}

          <button
            onClick={handleResetZoom}
            title="Recentrar gráfico y ajustar al contenido"
            className="ml-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-surface hover:bg-slate-700 text-slate-300 border border-border/80 transition-colors"
          >
            🎯 Recentrar
          </button>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-emerald-400 font-semibold">{autoRefreshSeconds ? '1s en vivo' : ''}</span>
          <span>{compact ? `${interval}` : `Velas ${interval === '1d' ? '1D (Día)' : interval} Binance`}</span>
        </div>
      </div>

      {/* Contenedor del Gráfico */}
      <div ref={chartContainerRef} style={{ height: `${height}px` }} className="w-full" />
    </div>
  );
}
