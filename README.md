# Futures Momentum & Early Plateau Monitor (PreTra)

**Versión:** 1.0.0  
**Idioma:** Español  
**Entorno de despliegue principal:** Ubuntu / Linux (Docker Compose o Node LTS + pnpm)  
**Acceso cliente:** Escritorio y Celular (Misma Wi-Fi / LAN o red privada Tailscale)

---

## 1. Visión y Propósito del Sistema

PreTra es un monitor analítico diseñado para observar contratos de futuros perpetuos Binance USDⓈ-M que experimentan fuertes impulsos alcistas (+70%, +100%, +150% o más en períodos de horas o días) y detectar de manera temprana patrones cuantitativos de **desaceleración y meseta** cerca de sus máximos.

### Principios Fundamentales:
* **Sin módulo de trading ni ejecución:** La aplicación **NO** ejecuta órdenes, no gestiona posiciones ni calcula PnL.
* **Seguridad y privacidad total:** No requiere ni solicita claves privadas de API de Binance. Toda la ingesta proviene de los endpoints públicos oficiales de Binance Futures (REST y WebSocket).
* **Alta manual de símbolos:** El usuario selecciona manualmente hasta 5 monedas nuevas por día (zona horaria `America/La_Paz`, UTC-4). Las monedas permanecen en seguimiento activo hasta que el usuario decida archivarlas manualmente.
* **Diagnóstico fáctico y verificable:** El sistema genera métricas y explicaciones objetivas basadas en hechos matemáticos comprobables (ej. *"Subió +124% en 36h; lleva 7.2h sin nuevo máximo; últimos 60m +0.8%; a -1.4% del techo"*), sin emitir promesas ni recomendaciones financieras.

---

## 2. Arquitectura del Monorepositorio

Estructura modular con `pnpm workspaces`:

```text
├── apps/
│   ├── api/             # Backend NestJS (REST API, Swagger, SSE, Ingesta Binance, Detector)
│   └── web/             # Frontend Next.js (App Router, Tailwind, TradingView Charts, Vista Móvil)
├── packages/
│   └── shared/          # Motor algorítmico, tipos compartidos, DTOs, cálculos multiplicativos y tests
├── infra/
│   └── docker/          # Dockerfile.api, Dockerfile.web, docker-compose.yml
├── docs/                # Arquitectura técnica, guía de despliegue en Ubuntu, acceso móvil y VPS
├── .env.example         # Variables de entorno documentadas
└── docker-compose.yml   # Compose de arranque rápido en raíz
```

---

## 3. Puesta en Marcha Rápida (Local en Ubuntu con Docker)

### Requisitos:
* Docker Engine (>= 24.0) y Docker Compose plugin (>= 2.20)
* Opcional para desarrollo local sin Docker: Node.js (>= 20 LTS) y pnpm (>= 9)

### Paso 1: Clonar y configurar entorno
```bash
cp .env.example .env
```

### Paso 2: Iniciar con Docker Compose
```bash
docker compose up -d --build
```

Esto levantará automáticamente 3 contenedores:
1. `pretra-postgres`: Base de datos PostgreSQL 16 con volumen persistente (`pretra_postgres_data`) y healthcheck activo.
2. `pretra-api`: Backend NestJS con Swagger, WebSocket de Binance, Ingesta 1m y canal SSE.
3. `pretra-web`: Frontend Next.js responsive con proxy interno para acceso móvil.

### Paso 3: Acceder a la aplicación
* **Dashboard Web (Escritorio):** [http://localhost:3000](http://localhost:3000)
* **Documentación Interactiva Swagger:** [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
* **Verificación de Salud:** [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## 4. Acceso desde Celular (Móvil en la misma LAN o Tailscale)

La interfaz web Next.js es 100% adaptable y dispone de una **vista móvil optimizada** con tarjetas compactas que evitan el desplazamiento horizontal forzado.

### Opción A: Misma red Wi-Fi (LAN)
1. Conoce la IP local de tu PC Ubuntu ejecutando en la terminal:
   ```bash
   ip route get 1.1.1.1 | awk '{print $7}'
   # Ejemplo de resultado: 192.168.1.100
   ```
2. Asegúrate de que el firewall UFW permita tráfico en el puerto web:
   ```bash
   sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
   ```
3. Desde tu celular abre el navegador:
   `http://192.168.1.100:3000`

> **Nota de ingeniería:** El frontend utiliza un proxy/rewrite interno en Next.js (`/api/*`), por lo que tu celular **nunca intentará consultar `localhost`** y cargará todos los datos en tiempo real de forma transparente.

### Opción B: Fuera de casa con Tailscale (Recomendada)
Sin abrir puertos en el router:
1. Instala Tailscale en la PC Ubuntu y en tu celular vinculados a tu cuenta.
2. Accede desde tu móvil mediante la IP o MagicDNS de Tailscale:
   `http://100.x.y.z:3000` o `http://tu-pc-ubuntu:3000`

---

## 5. Ejecución de Tests Unitarios y Validación del Detector

El motor de detección cuenta con una batería de pruebas con **series sintéticas deterministas** que validan los 10 escenarios requeridos (Casos A-J):

```bash
# Ejecutar todas las pruebas unitarias
pnpm test

# Ejecutar únicamente las pruebas del detector algorítmico
pnpm test:detector
```

### Casos Validados:
* **Caso A:** Subida +150% y meseta de 8h $\rightarrow$ Detección de `MESETA_TEMPRANA`.
* **Caso B:** Pausa de 2h seguida de nuevo impulso +40% $\rightarrow$ Transición a `REACELERACION` sin marcar caída errónea.
* **Caso C:** Meseta y ruptura de soporte $\rightarrow$ Registro de `RUPTURA_BAJISTA`.
* **Caso D:** Meseta y nuevo máximo $\rightarrow$ Invalidación del episodio y transición a `REACELERACION`.
* **Caso E:** Subida continua sostenida $\rightarrow$ Permanece en `IMPULSO_ALCISTA` sin falsos positivos de meseta.
* **Caso F:** Wicks aislados vs cierres $\rightarrow$ Protección frente a sombras engañosas (`useClosesForPeaks`).
* **Caso G:** Insuficiencia de cobertura ($\le$ 15 velas) $\rightarrow$ Estado `SIN_DATOS`.
* **Caso H:** Ausencia de sesgo de anticipación (*no look-ahead bias*).
* **Caso I:** Regla de cuota diaria en zona horaria `America/La_Paz` (reinicio a medianoche).
* **Caso J:** Backfill de moneda disparada $\rightarrow$ Marcado como `isRetrospective = true` sin falsas alertas en vivo.

---

## 6. Endpoints de la API Interna

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Estado de servicios, latencia, WebSocket Binance y cuota |
| `GET` | `/api/symbols/search?q=` | Autocompletado de símbolos oficiales USDⓈ-M Binance |
| `GET` | `/api/watchlist?status=` | Lista de seguimiento (`ACTIVE` o `ARCHIVED`) |
| `POST` | `/api/watchlist` | Alta manual con validación y disparo de backfill 7d |
| `PATCH` | `/api/watchlist/:id/archive` | Archivar moneda (detiene streams, conserva historial) |
| `PATCH` | `/api/watchlist/:id/reactivate`| Reactivar moneda archivada |
| `DELETE`| `/api/watchlist/:id` | Eliminar moneda y datos asociados |
| `GET` | `/api/coins/:symbol/summary` | Métricas multi-ventana, precio y estado actual |
| `GET` | `/api/coins/:symbol/candles` | Velas históricas 1m para gráficos TradingView |
| `GET` | `/api/coins/:symbol/events` | Cronología de transiciones y diagnósticos |
| `GET` | `/api/plateaus` | Historial de episodios de meseta y desenlaces |
| `GET` | `/api/settings/detector` | Lectura de umbrales configurables |
| `PUT` | `/api/settings/detector` | Actualización dinámica de parámetros de detección |
| `GET` | `/api/stream` | Canal Server-Sent Events (SSE) para tiempo real |

---

## 7. Documentación Adicional

* [Arquitectura del Sistema](docs/ARCHITECTURE.md)
* [Guía de Despliegue en Ubuntu y Seguridad](docs/DEPLOYMENT_UBUNTU.md)
* [Guía de Migración a VPS Linux](docs/VPS_MIGRATION.md)
