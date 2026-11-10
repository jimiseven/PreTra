'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface AddCoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCoinAdded: () => void;
  dailyCount: number;
  dailyMax: number;
}

export function AddCoinModal({
  isOpen,
  onClose,
  onCoinAdded,
  dailyCount,
  dailyMax
}: AddCoinModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedSymbol('');
      setNotes('');
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/symbols/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  const isLimitReached = dailyCount >= dailyMax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSymbol) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, notes })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al añadir símbolo');
      }

      onCoinAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surfaceLight/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-accent" />
              Alta Manual de Moneda
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Futuros Binance USDⓈ-M (Contratos Perpetuos)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Límite diario reminder */}
          <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            isLimitReached
              ? 'bg-rose-950/40 border-rose-800 text-rose-300'
              : 'bg-surfaceLight border-border text-slate-300'
          }`}>
            <span>Cuota de altas diarias (La Paz, UTC-4):</span>
            <span className="font-bold text-sm">
              {dailyCount} / {dailyMax} {isLimitReached ? '(Límite alcanzado)' : 'usadas'}
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Autocomplete Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Buscar símbolo oficial:
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Ej. BTCUSDT, DOGEUSDT..."
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setSelectedSymbol(e.target.value.toUpperCase());
                }}
                disabled={isLimitReached || submitting}
                className="w-full bg-surfaceLight border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-50"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-3 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Sugerencias desplegables */}
            {results.length > 0 && query && (
              <div className="max-h-40 overflow-y-auto bg-surfaceLight border border-border rounded-lg mt-1 divide-y divide-border/50">
                {results.map(r => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => {
                      setSelectedSymbol(r.symbol);
                      setQuery(r.symbol);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-accent/20 transition-colors ${
                      selectedSymbol === r.symbol ? 'bg-accent/30 text-accent font-bold' : 'text-slate-200'
                    }`}
                  >
                    <span>{r.symbol}</span>
                    <span className="text-[10px] text-slate-400">{r.baseAsset} / USDT PERP</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notas opcionales */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Notas personales (opcional):
            </label>
            <input
              type="text"
              placeholder="Ej. Subió +120% en últimas 18h"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isLimitReached || submitting}
              className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-50"
            />
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed bg-surfaceLight/30 p-2.5 rounded border border-border/40">
            ℹ️ Al añadir el símbolo, el sistema iniciará automáticamente el <strong>backfill de 7 días</strong> de velas de 1 minuto y conectará el stream en vivo sin requerir claves de API.
          </div>

          {/* Botones de acción */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-surfaceLight transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedSymbol || isLimitReached || submitting}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Añadiendo...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Iniciar Seguimiento
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
