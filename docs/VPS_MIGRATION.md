# Guía de Migración Futura a VPS Linux

Esta guía detalla el procedimiento para migrar **PreTra** desde el entorno local de Ubuntu a un servidor privado virtual (VPS) económico sin necesidad de reescribir código ni perder datos históricos.

---

## 1. Especificaciones Recomendadas del VPS

* **Recursos de cómputo:** 2 vCPU, 2 a 4 GB RAM, 30+ GB SSD (según política de retención de velas).
* **Proveedores sugeridos:** Hetzner Cloud (ej. CX22/CPX21), DigitalOcean (Droplet Basic), Linode o similares.
* **Presupuesto orientativo:** Aprox. USD 5 - 15 / mes (verificar tarifas actuales según proveedor y región geográfica).
* **Verificación de conectividad con Binance:**
  > **IMPORTANTE:** Algunos proveedores o centros de datos ubicados en ciertas regiones (por ejemplo EE.UU.) tienen restricciones de acceso hacia la API de Binance Futures. **Verifica siempre la conectividad HTTP/WebSocket hacia `fapi.binance.com`** desde la IP del VPS antes de contratar o migrar definitivamente:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" https://fapi.binance.com/fapi/v1/ping
  # Debe responder 200
  ```

---

## 2. Preparativos Previos a la Migración

1. **Evitar doble worker activo:** Durante la migración, para no duplicar eventos ni registrar transiciones redundantes, se debe detener el worker local antes de activar el worker en el VPS.
2. **Generar respaldo completo de la base de datos en local:**
   ```bash
   docker compose exec -T postgres pg_dump -U pretra_user pretra_db > pretra_backup.sql
   ```

---

## 3. Aprovisionamiento del Servidor VPS

En el nuevo VPS con Ubuntu 24.04 / 22.04 LTS:

```bash
# 1. Instalar Docker y dependencias
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Configurar Firewall UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 4. Despliegue de la Aplicación en el VPS

```bash
# 1. Clonar el repositorio en el VPS
git clone <URL_REPOSITORIO> /opt/pretra
cd /opt/pretra

# 2. Configurar el archivo .env con contraseñas seguras de producción
cp .env.example .env
nano .env

# 3. Copiar el archivo de respaldo desde la máquina local al VPS
# (Ejecutar desde tu PC local):
scp pretra_backup.sql usuario@ip_vps:/opt/pretra/

# 4. Levantar únicamente el contenedor de PostgreSQL primero
docker compose up -d postgres

# 5. Restaurar la base de datos en el VPS
docker compose exec -T postgres psql -U pretra_user -d pretra_db < pretra_backup.sql

# 6. Levantar todos los servicios en el VPS
docker compose up -d --build
```

---

## 5. Configuración de Dominio con HTTPS (Caddy Reverse Proxy)

Para acceder de forma segura mediante HTTPS con certificado SSL automático de Let's Encrypt:

Instala Caddy en el VPS:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Edita `/etc/caddy/Caddyfile`:
```caddy
tu-dominio.com {
    reverse_proxy localhost:3000
}
```

Aplica la configuración:
```bash
sudo systemctl reload caddy
```

---

## 6. Verificación Post-Migración

1. Accede a tu dominio HTTPS o IP del VPS.
2. Comprueba que el indicador de WebSocket marque "En Vivo".
3. Verifica el historial de monedas y episodios de meseta restaurados.
4. Confirma que el worker local anterior permanezca detenido (`docker compose down` en la PC de origen).
