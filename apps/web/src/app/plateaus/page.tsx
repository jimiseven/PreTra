'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sparkles, ArrowLeft, Clock, TrendingDown, CheckCircle2, XCircle } from 'lucide-react';

export default function PlateausPage() {
  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ['plateau-episodes'],
    queryFn: async () => {
      const res = await fetch('/api/plateaus');
      if (!res.ok) throw new Error('Error al cargar historial de mesetas');
      return res.json();
    },
    refetchInterval: 15_000
  });

  return (
    <div className="space-y-6">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="p-1.5 rounded-lg bg-surface border border-border text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              Historial de Mesetas Detectadas
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Registro de episodios de consolidación y evaluación retrospectiva de desenlaces (+6h, +12h, +24h, +48h)
          </p>
        </div>

        <div className="text-xs text-slate-400 bg-surface border border-border px-3 py-2 rounded-xl">
          Total episodios registrados: <strong>{episodes.length}</strong>
        </div>
      </div>

      {/* Tabla de Episodios */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-surfaceLight text-slate-400 text-xs uppercase border-b border-border">
            <tr>
              <th className="py-3 px-4">Símbolo</th>
              <th className="py-3 px-4">Fecha Detección (BO)</th>
              <th className="py-3 px-4">Subida Previa</th>
              <th className="py-3 px-4">Precio Techo</th>
              <th className="py-3 px-4">Rango Consolidación</th>
              <th className="py-3 px-4">Estado Episodio</th>
              <th className="py-3 px-4">Desenlace Observado</th>
              <th className="py-3 px-4 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Cargando episodios de meseta...
                </td>
              </tr>
            ) : episodes.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No hay episodios de meseta registrados aún.
                </td>
              </tr>
            ) : (
              episodes.map((ep: any) => (
                <tr key={ep.id} className="hover:bg-surfaceLight/50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white">
                    <Link href={`/coins/${ep.symbol}`} className="hover:text-accent">
                      {ep.symbol}
                    </Link>
                  </td>

                  <td className="py-3.5 px-4 text-xs font-mono text-slate-300">
                    {new Date(ep.detectedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                    +{Number(ep.riseBeforePct).toFixed(1)}%
                  </td>

                  <td className="py-3.5 px-4 font-mono text-slate-200">
                    ${Number(ep.peakPrice).toFixed(4)}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-slate-300 text-xs">
                    ${Number(ep.rangeLow).toFixed(4)} - ${Number(ep.rangeHigh).toFixed(4)}
                  </td>

                  <td className="py-3.5 px-4">
                    {ep.status === 'IN_PROGRESS' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-800">
                        En curso
                      </span>
                    )}
                    {ep.status === 'BROKEN_DOWN' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 border border-rose-800 flex items-center gap-1 w-max">
                        <TrendingDown className="w-3 h-3" />
                        Ruptura bajista
                      </span>
                    )}
                    {ep.status === 'INVALIDATED_UP' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-950/70 text-sky-300 border border-sky-800">
                        Invalidad por nuevo máximo
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-xs text-slate-400">
                    {ep.outcomes ? JSON.stringify(ep.outcomes) : 'En seguimiento'}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/coins/${ep.symbol}`}
                      className="px-2.5 py-1 text-xs font-semibold bg-surfaceLight hover:bg-accent text-slate-300 hover:text-white rounded transition-colors"
                    >
                      Ver Gráfico
                    </Link>
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
