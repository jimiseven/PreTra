import React from 'react';
import { CoinState } from '@pretra/shared';

interface StateBadgeProps {
  state: CoinState | string;
  size?: 'sm' | 'md' | 'lg';
}

export function StateBadge({ state, size = 'md' }: StateBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1 font-semibold',
    lg: 'text-sm px-3 py-1.5 font-bold'
  }[size];

  switch (state) {
    case CoinState.MESETA_TEMPRANA:
      return (
        <span className={`inline-flex items-center rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/50 shadow-sm shadow-purple-900/30 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-1.5 animate-pulse" />
          MESETA TEMPRANA
        </span>
      );
    case CoinState.DESACELERACION:
      return (
        <span className={`inline-flex items-center rounded-full bg-amber-950/70 text-amber-300 border border-amber-500/40 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
          DESACELERACIÓN
        </span>
      );
    case CoinState.IMPULSO_ALCISTA:
      return (
        <span className={`inline-flex items-center rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
          IMPULSO ALCISTA
        </span>
      );
    case CoinState.RUPTURA_BAJISTA:
      return (
        <span className={`inline-flex items-center rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/50 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5" />
          RUPTURA BAJISTA
        </span>
      );
    case CoinState.REACELERACION:
      return (
        <span className={`inline-flex items-center rounded-full bg-sky-950/70 text-sky-300 border border-sky-500/40 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5" />
          REACELERACIÓN
        </span>
      );
    case CoinState.OBSERVACION:
      return (
        <span className={`inline-flex items-center rounded-full bg-slate-800/80 text-slate-300 border border-slate-700 ${sizeClasses}`}>
          OBSERVACIÓN
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 ${sizeClasses}`}>
          SIN DATOS
        </span>
      );
  }
}
