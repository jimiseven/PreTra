'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  X,
  Plus,
  Check,
  Flame,
  RefreshCw,
  ExternalLink,
  Layers,
  AlertCircle
} from 'lucide-react';

interface TopGainersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCoinAdded?: () => void;
  watchlistSymbols: string[];
  dailyCount: number;
  dailyMax: number;
}

export function TopGainersModal({
  isOpen,
  onClose,
  onCoinAdded,
  watchlistSymbols,
  dailyCount,
  dailyMax
}: TopGainersModalProps) {
  const queryClient = useQueryClient();
  const [addedSymbols, setAddedSymbols] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Consulta de top gainers de Binance Futures
  const {
    data: gainers = [],
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['top-gainers'],
    queryFn: async () => {
      const res = await fetch('/api/symbols/top-gainers?limit=25');
      if (!res.ok) throw new Error('Error al cargar top gainers');
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: isOpen ? 15_000 : false
  });

  // Mutación para añadir con 1 clic
  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      setErrorMsg(null);
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, notes: 'Añadido desde Top Gainers Binance' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al añadir moneda');
      }
      return res.json();
    },
    onSuccess: (_, symbol) => {
      setAddedSymbols(prev => [...prev, symbol]);
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      onCoinAdded?.();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Error al añadir contrato');
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-surface border border-border rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabecera del Modal */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surfaceLight/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Mayores Subidas de Binance Futures (Top Gainers)</span>
                <span className="text-[11px] bg-amber-950/80 border border-amber-800 text-amber-300 px-2 py-0.5 rounded-full font-mono">
                  En Vivo
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Descubre los contratos con mayor impulso alcista en las últimas 24 horas y añádelos con 1 clic para vigilar su meseta.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra Informativa de Cuota y Refresco */}
        <div className="px-4 py-2.5 bg-surface border-b border-border/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Cuota disponible hoy:</span>
            <span className="font-mono font-bold text-white bg-surfaceLight px-2 py-0.5 rounded border border-border">
              {dailyCount} / {dailyMax} utilizadas
            </span>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-accent ${isFetching ? 'animate-spin' : ''}`} />
            <span>{isFetching ? 'Actualizando...' : 'Refrescar Lista'}</span>
          </button>
        </div>

        {/* Alerta de Error */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tabla de Top Gainers */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-accent" />
              <span>Consultando mercado de futuros de Binance...</span>
            </div>
          ) : gainers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No se obtuvieron contratos ganadores en este momento.
            </div>
          ) : (
            <div className="divide-y divide-border/60 border border-border/80 rounded-xl bg-surfaceLight/30 overflow-hidden">
              {gainers.map((g: any, index: number) => {
                const isAlreadyTracked = watchlistSymbols.includes(g.symbol) || addedSymbols.includes(g.symbol);
                const isAdding = addMutation.isPending && addMutation.variables === g.symbol;
                const volumeMillions = (g.quoteVolume / 1_000_000).toFixed(1);

                return (
                  <div
                    key={g.symbol}
                    className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-surfaceLight/60 transition-colors"
                  >
                    {/* Posición y Símbolo */}
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-slate-500 w-5 text-right">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-bold text-sm text-white flex items-center gap-1.5">
                          <span>{g.symbol}</span>
                          <span className="text-[10px] text-slate-400 bg-surface px-1.5 py-0.2 rounded border border-border/60">
                            PERP
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Volumen 24h: <strong className="text-slate-300">${volumeMillions}M USDT</strong>
                        </div>
                      </div>
                    </div>

                    {/* Precio y Subida 24h */}
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-emerald-400 flex items-center justify-end gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>+{g.priceChangePercent.toFixed(2)}%</span>
                      </div>
                      <div className="font-mono text-xs text-slate-300 mt-0.5">
                        ${g.lastPrice >= 1 ? g.lastPrice.toFixed(4) : g.lastPrice.toFixed(6)}
                      </div>
                    </div>

                    {/* Botón Acción: 1 Clic para añadir */}
                    <div className="shrink-0">
                      {isAlreadyTracked ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                          <Check className="w-3.5 h-3.5" />
                          <span>En Seguimiento</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => addMutation.mutate(g.symbol)}
                          disabled={isAdding || dailyCount >= dailyMax}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent hover:bg-blue-600 text-white transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isAdding ? 'Añadiendo...' : '+ Añadir a Tabla'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="p-3 sm:p-4 border-t border-border bg-surfaceLight/40 flex items-center justify-between text-xs text-slate-400">
          <span>Las monedas añadidas iniciarán inmediatamente su backfill de 7 días y conexión WebSocket en vivo.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-semibold bg-surface hover:bg-surfaceLight text-slate-200 border border-border"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
