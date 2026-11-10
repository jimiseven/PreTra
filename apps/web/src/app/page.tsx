'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SmartTable } from '../components/SmartTable';
import { MobileCardView } from '../components/MobileCardView';
import { AddCoinModal } from '../components/AddCoinModal';
import { useRealtimeStream } from '../hooks/useRealtimeStream';
import { CoinState } from '@pretra/shared';
import { Plus, Activity, AlertTriangle, Layers, Radio, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Stream en tiempo real vía SSE
  const { tickers: liveTickers, isConnected } = useRealtimeStream(() => {
    // Cuando llega un evento de cambio de estado o watchlist, invalidamos queries
    queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    queryClient.invalidateQueries({ queryKey: ['quota'] });
  });

  // Query Watchlist
  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist');
      if (!res.ok) throw new Error('Error al obtener lista de seguimiento');
      return res.json();
    },
    refetchInterval: 10_000
  });

  // Query Cuota de altas diarias
  const { data: quota = { count: 0, max: 5 } } = useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist/quota');
      if (!res.ok) return { count: 0, max: 5 };
      return res.json();
    },
    refetchInterval: 30_000
  });

  // Mutación Archivar
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/watchlist/${id}/archive`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Error al archivar');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    }
  });

  // Mutación Reactivar
  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/watchlist/${id}/reactivate`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Error al reactivar');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    }
  });

  // Conteos
  const activeCoins = watchlist.filter((i: any) => i.status === 'ACTIVE');
  const plateauCoinsCount = activeCoins.filter((i: any) => {
    const state = liveTickers[i.symbol]?.state || i.marketState?.currentState;
    return state === CoinState.MESETA_TEMPRANA;
  }).length;

  const decelerationCoinsCount = activeCoins.filter((i: any) => {
    const state = liveTickers[i.symbol]?.state || i.marketState?.currentState;
    return state === CoinState.DESACELERACION;
  }).length;

  return (
    <div className="space-y-6">
      
      {/* Banner Superior & Controles Principales */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            Panel de Monitoreo
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              isConnected ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800' : 'bg-rose-950/70 text-rose-400 border border-rose-800'
            }`}>
              <Radio className="w-3 h-3 animate-pulse" />
              {isConnected ? 'Stream en Vivo' : 'Reconectando...'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Detección de desaceleración y mesetas tempranas en contratos Binance Futures USDⓈ-M
          </p>
        </div>

        {/* Botón Añadir Moneda */}
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-accent hover:bg-blue-600 text-white shadow-lg shadow-accent/25 transition-all transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Añadir Moneda</span>
          <span className="text-[11px] bg-blue-800/80 px-2 py-0.5 rounded-full ml-1">
            {quota.count}/{quota.max} hoy
          </span>
        </button>
      </div>

      {/* Tarjetas de Resumen Global */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        
        {/* Monedas Activas */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-950/70 text-blue-400 flex items-center justify-center border border-blue-800/40">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">Monedas Activas</span>
            <span className="text-xl font-black text-white font-mono">{activeCoins.length}</span>
          </div>
        </div>

        {/* En Meseta Temprana */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-950/70 text-purple-400 flex items-center justify-center border border-purple-800/40">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-purple-300 font-medium block">Meseta Temprana</span>
            <span className="text-xl font-black text-purple-300 font-mono">{plateauCoinsCount}</span>
          </div>
        </div>

        {/* En Desaceleración */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-950/70 text-amber-400 flex items-center justify-center border border-amber-800/40">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-amber-300 font-medium block">Desaceleración</span>
            <span className="text-xl font-black text-amber-300 font-mono">{decelerationCoinsCount}</span>
          </div>
        </div>

        {/* Cuota Diaria */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-700">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">Altas Hoy (La Paz)</span>
            <span className="text-xl font-black text-slate-200 font-mono">
              {quota.count} <span className="text-xs text-slate-500 font-normal">/ {quota.max}</span>
            </span>
          </div>
        </div>

      </div>

      {/* Contenido: Tabla Desktop y Vista Mobile */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center text-slate-400 text-sm">
          Cargando monedas en seguimiento...
        </div>
      ) : (
        <>
          <SmartTable
            items={watchlist}
            liveTickers={liveTickers}
            onArchive={id => archiveMutation.mutate(id)}
            onReactivate={id => reactivateMutation.mutate(id)}
          />

          <MobileCardView
            items={watchlist}
            liveTickers={liveTickers}
            onArchive={id => archiveMutation.mutate(id)}
          />
        </>
      )}

      {/* Modal de Alta */}
      <AddCoinModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCoinAdded={() => {
          queryClient.invalidateQueries({ queryKey: ['watchlist'] });
          queryClient.invalidateQueries({ queryKey: ['quota'] });
        }}
        dailyCount={quota.count}
        dailyMax={quota.max}
      />

    </div>
  );
}
