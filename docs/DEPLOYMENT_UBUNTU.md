# Guía de Despliegue Local en Ubuntu y Acceso Móvil Seguro

Esta guía describe cómo desplegar y operar **PreTra** en una máquina con **Ubuntu Linux** que permanece encendida de forma continua, permitiendo el acceso tanto desde el escritorio como desde dispositivos móviles (vía red local Wi-Fi o red privada Tailscale).

---

## 1. Requisitos Previos en Ubuntu

Asegúrate de contar con Docker Engine y el plugin Docker Compose instalados:

```bash
# Actualizar repositorios e instalar paquetes necesarios
sudo apt update && sudo apt install -y curl ufw git

# Instalar Docker oficial si no lo tienes instalado
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Añadir tu usuario al grupo docker para ejecutar sin sudo
sudo usermod -aG docker $USER
newgrp docker

# Verificar instalación
docker version
docker compose version
```

---

## 2. Puesta en Marcha del Monorepositorio

```bash
# 1. Clonar el repositorio
git clone <URL_REPOSITORIO> pretra
cd pretra

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Compilar y levantar contenedores en segundo plano
docker compose up -d --build

# 4. Verificar que todos los servicios estén 'healthy' o 'Up'
docker compose ps
```

### Inspección de Registros (Logs en Vivo):
```bash
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs específicos del backend y detector
docker compose logs -f api
```

---

## 3. Configuración de Seguridad y Firewall (UFW)

Para evitar exponer la base de datos o puertos de administración a redes no confiables:

```bash
# Habilitar firewall si no está activo
sudo ufw enable

# Permitir SSH (si accedes a la máquina por consola remota)
sudo ufw allow ssh

# Conoce tu rango de red local (ejemplo 192.168.1.0/24)
# Permitir acceso al Dashboard Web (puerto 3000) ÚNICAMENTE desde tu Wi-Fi/LAN:
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp

# REGLA CRÍTICA: NO abras el puerto 5432 (PostgreSQL) ni el 3001 a internet
sudo ufw status verbose
```

---

## 4. Acceso desde Celular en la Misma Wi-Fi (LAN)

1. Obtén la dirección IP local de tu PC en la red:
   ```bash
   hostname -I | awk '{print $1}'
   # Ejemplo: 192.168.1.100
   ```
2. Desde tu teléfono conectado a la misma red Wi-Fi, abre el navegador web y entra a:
   `http://192.168.1.100:3000`
3. La interfaz web responsive cargará automáticamente la **vista móvil adaptada** con tarjetas compactas y métricas en tiempo real.

> **Importante:** Las peticiones del navegador del teléfono se dirigen a `/api/*`, las cuales son atendidas por el proxy interno de Next.js hacia el contenedor `api:3001`. El teléfono no necesita acceder directamente al puerto 3001.

---

## 5. Acceso Seguro Fuera de Casa mediante Tailscale (Sin Abrir Puertos)

Para consultar el monitor mientras estás fuera de casa sin configurar port-forwarding en tu router:

1. **Instalar Tailscale en la PC Ubuntu:**
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
2. **Instalar la app Tailscale en tu celular** (Android o iOS) e iniciar sesión con la misma cuenta.
3. Permite el tráfico en UFW desde la interfaz virtual de Tailscale:
   ```bash
   sudo ufw allow in on tailscale0 to any port 3000 proto tcp
   ```
4. En tu celular, con Tailscale activado, ingresa a:
   `http://<IP_TAILSCALE_PC>:3000` (ejemplo `http://100.115.80.20:3000`) o mediante el nombre MagicDNS de tu máquina.

---

## 6. Persistencia y Mantenimiento

* **Reinicio Automático:** Los contenedores están configurados con `restart: unless-stopped`. Si la PC se reinicia o se corta la energía temporalmente, los servicios arrancarán de nuevo automáticamente al iniciar el sistema.
* **Recuperación de Cortes de Internet:** Al recuperar conexión, el worker de mercado detecta automáticamente los gaps de velas y ejecuta la resincronización necesaria.
* **Respaldo de Base de Datos PostgreSQL:**
  ```bash
  docker compose exec -T postgres pg_dump -U pretra_user pretra_db > backup_$(date +%Y%m%d).sql
  ```
