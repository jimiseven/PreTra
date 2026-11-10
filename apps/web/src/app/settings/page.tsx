'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Sliders, ShieldCheck, Server, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { DEFAULT_DETECTION_CONFIG, DetectionConfig } from '@pretra/shared';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<DetectionConfig>(DEFAULT_DETECTION_CONFIG);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Consulta de configuración actual
  const { data: serverConfig, isLoading } = useQuery({
    queryKey: ['detector-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings/detector');
      if (!res.ok) return DEFAULT_DETECTION_CONFIG;
      return res.json();
    }
  });

  // Consulta de salud del sistema
  const { data: health } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 10_000
  });

  useEffect(() => {
    if (serverConfig) {
      setConfig(serverConfig);
    }
  }, [serverConfig]);

  // Mutación para guardar configuración
  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<DetectionConfig>) => {
      const res = await fetch('/api/settings/detector', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok) throw new Error('Error al guardar configuración');
      return res.json();
    },
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['detector-settings'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(config);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-accent" />
          Ajustes del Sistema y Detector
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Parámetros algorítmicos, estado de conexiones públicas de Binance y observabilidad
        </p>
      </div>

      {/* Monitor de Salud y Conexiones */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          Observabilidad y Estado de Conexión
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-surfaceLight/60 p-3 rounded-lg border border-border/40">
            <span className="text-slate-400 block text-[10px] uppercase">Binance REST</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {health?.binanceRest || 'Conectado'}
            </span>
          </div>

          <div className="bg-surfaceLight/60 p-3 rounded-lg border border-border/40">
            <span className="text-slate-400 block text-[10px] uppercase">Binance WebSocket</span>
            <span className={`font-bold flex items-center gap-1 mt-1 ${
              health?.binanceWs === 'connected' ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              <RefreshCw className={`w-3.5 h-3.5 ${health?.binanceWs === 'connected' ? '' : 'animate-spin'}`} />
              {health?.binanceWs === 'connected' ? 'En Vivo (1m)' : health?.binanceWs || 'Conectando...'}
            </span>
          </div>

          <div className="bg-surfaceLight/60 p-3 rounded-lg border border-border/40">
            <span className="text-slate-400 block text-[10px] uppercase">Base de Datos</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {health?.database || 'Activa (PostgreSQL)'}
            </span>
          </div>

          <div className="bg-surfaceLight/60 p-3 rounded-lg border border-border/40">
            <span className="text-slate-400 block text-[10px] uppercase">Tiempo Activo</span>
            <span className="font-bold text-slate-200 mt-1 block font-mono">
              {health?.uptimeSeconds ? `${Math.floor(health.uptimeSeconds / 60)} min` : 'Reciente'}
            </span>
          </div>
        </div>
      </div>

      {/* Formulario de Umbrales del Detector */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent" />
              Umbrales y Reglas del Detector de Mesetas
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Todos los valores son completamente configurables según sección 2.4 de la especificación
            </p>
          </div>
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Guardado con éxito
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Impulso previo mínimo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Impulso previo mínimo (%):
              </label>
              <input
                type="number"
                step="5"
                value={config.minImpulsePct}
                onChange={e => setConfig({ ...config, minImpulsePct: parseFloat(e.target.value) || 70 })}
                className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">Ejemplo: 70% de subida previa para considerar candidato</span>
            </div>

            {/* Ventana de impulso en horas */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Ventana rodante de impulso (horas):
              </label>
              <input
                type="number"
                step="6"
                value={config.impulseWindowHours}
                onChange={e => setConfig({ ...config, impulseWindowHours: parseFloat(e.target.value) || 48 })}
                className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">Normalmente 24h a 48h</span>
            </div>

            {/* Rango de consolidación máximo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Rango máximo de consolidación (%):
              </label>
              <input
                type="number"
                step="0.5"
                value={config.plateauMaxRangePct}
                onChange={e => setConfig({ ...config, plateauMaxRangePct: parseFloat(e.target.value) || 5 })}
                className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">(maxHigh - minLow) / minLow &lt;= 5%</span>
            </div>

            {/* Distancia máxima al techo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Distancia máxima al máximo (%):
              </label>
              <input
                type="number"
                step="0.5"
                value={config.plateauMaxDistanceToPeakPct}
                onChange={e => setConfig({ ...config, plateauMaxDistanceToPeakPct: parseFloat(e.target.value) || 3 })}
                className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">Estar dentro del 3% respecto al pico</span>
            </div>

            {/* Horas sin nuevo máximo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Horas sin nuevo máximo para meseta establecida:
              </label>
              <input
                type="number"
                step="0.5"
                value={config.minHoursWithoutNewHigh}
                onChange={e => setConfig({ ...config, minHoursWithoutNewHigh: parseFloat(e.target.value) || 3 })}
                className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">Mínimo 3h sin romper el techo</span>
            </div>

            {/* Fracción de caída de velocidad */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Fracción de desaceleración de velocidad:
              </label>
              <input
                type="number"
                step="0.05"
                value={config.velocityDropFraction}
                onChange={e => setConfig({ ...config, velocityDropFraction: parseFloat(e.target.value) || 0.35 })}
                className="w-full bg-surfaceLight border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">Velocidad actual &lt; 35% de la velocidad de subida</span>
            </div>

          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-6 py-2.5 rounded-lg font-bold text-sm bg-accent hover:bg-blue-600 text-white shadow-lg shadow-accent/20 transition-all"
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar Parámetros'}
            </button>
          </div>
        </form>
      </div>

      {/* Guía Rápida de Acceso LAN y Tailscale */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Acceso Móvil Seguro (Misma Wi-Fi o Tailscale)
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Para ver el monitor desde tu celular sin exponer puertos a Internet:
        </p>
        <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-5">
          <li><strong>En casa (misma Wi-Fi):</strong> Abre en el navegador de tu celular: <code className="text-accent bg-surfaceLight px-1.5 py-0.5 rounded">http://[IP_LAN_DE_TU_PC]:3000</code>. El proxy interno de Next.js redirige automáticamente las peticiones.</li>
          <li><strong>Fuera de casa (Tailscale):</strong> Conecta tu PC y tu celular a tu red privada Tailscale y accede por <code className="text-accent bg-surfaceLight px-1.5 py-0.5 rounded">http://[IP_O_NOMBRE_TAILSCALE]:3000</code>.</li>
          <li><strong>Seguridad:</strong> Nunca abras puertos en el router hacia PostgreSQL ni hacia la API de administración.</li>
        </ul>
      </div>

    </div>
  );
}
