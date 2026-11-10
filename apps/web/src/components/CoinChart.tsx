'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, SeriesMarker, Time } from 'lightweight-charts';

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
  initialCandles: CandleData[];
  markers?: Array<{
    time: number;
    position: 'aboveBar' | 'belowBar' | 'inBar';
    color: string;
    shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
    text: string;
  }>;
}

export function CoinChart({ symbol, initialCandles, markers = [] }: CoinChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [interval, setInterval] = useState<'1m' | '5m' | '15m' | '1h' | '4h'>('1m');
  const [candles, setCandles] = useState<CandleData[]>(initialCandles);

  // Carga de velas por intervalo
  useEffect(() => {
    async function loadCandles() {
      try {
        const res = await fetch(`/api/coins/${symbol}/candles?interval=${interval}&limit=1000`);
        if (res.ok) {
          const data = await res.json();
          setCandles(data);
        }
      } catch {
        // Fallback a iniciales
      }
    }
    loadCandles();
  }, [symbol, interval]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Crear instancia de Lightweight Chart
    const chart = createChart(chartContainerRef.current, {
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
      },
      timeScale: {
        borderColor: '#2A3040',
        timeVisible: true,
        secondsVisible: false,
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
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

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

    chartRef.current?.timeScale().fitContent();
  }, [candles, markers]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
      {/* Barra de Controles de Intervalo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surfaceLight/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Temporalidad:</span>
          {(['1m', '5m', '15m', '1h', '4h'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setInterval(tf)}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                interval === tf ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-surface'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Velas 1m Binance Futures USDⓈ-M</span>
        </div>
      </div>

      {/* Contenedor del Gráfico */}
      <div ref={chartContainerRef} className="w-full h-[450px]" />
    </div>
  );
}
