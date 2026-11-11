import './globals.css';
import { Providers } from './providers';
import Link from 'next/link';
import { Activity, BarChart3, Settings, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'PreTra - Futures Momentum & Early Plateau Monitor',
  description: 'Monitoreo temprano de desaceleración y mesetas en contratos de futuros Binance USDⓈ-M',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-background text-slate-100 flex flex-col antialiased selection:bg-accent selection:text-white">
        <Providers>
          {/* Header Superior Principal */}
          <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/90 backdrop-blur-md">
            <div className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              
              {/* Marca y Subtítulo */}
              <div className="flex items-center gap-3">
                <Link href="/" className="flex items-center gap-2.5 group">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-base font-extrabold tracking-tight text-white block leading-none">
                      PRETRA
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                      Plateau & Momentum Monitor
                    </span>
                  </div>
                </Link>
              </div>

              {/* Enlaces de Navegación */}
              <nav className="flex items-center gap-1 sm:gap-2">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-surfaceLight transition-colors flex items-center gap-1.5"
                >
                  <BarChart3 className="w-4 h-4 text-accent" />
                  <span>Monitoreo</span>
                </Link>

                <Link
                  href="/plateaus"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-surfaceLight transition-colors flex items-center gap-1.5"
                >
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span className="hidden sm:inline">Historial</span>
                  <span>Mesetas</span>
                </Link>

                <Link
                  href="/settings"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-surfaceLight transition-colors flex items-center gap-1.5"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span className="hidden sm:inline">Ajustes</span>
                </Link>

                {/* Badge de Seguridad Local / Sin Claves Privadas */}
                <div className="hidden lg:flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-1 rounded-full ml-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Modo Público Seguro (Sin API Keys)</span>
                </div>
              </nav>

            </div>
          </header>

          {/* Contenido Principal Responsivo para Todo Tipo de Pantallas */}
          <main className="flex-1 max-w-[1700px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-5">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-border py-4 text-center text-xs text-slate-500">
            PreTra v1.0 • Futuros Binance USDⓈ-M • Zona Horaria: America/La_Paz (UTC-4) • Herramienta analítica y descriptiva, no constituye asesoramiento financiero.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
