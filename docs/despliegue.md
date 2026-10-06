# Despliegue en el VPS (217.71.202.62)

Se hace una sola vez. Las actualizaciones posteriores están al final. No se toca nada de BIDELAN (`visor.`) ni de la raíz.

## 1. DNS (Cloudflare)
Registro **A** `cortes` → `217.71.202.62`, en modo **DNS only** (nube gris) para que Certbot funcione. Para comprobarlo:
```bash
dig +short cortes.geospatiallab.xyz     # → 217.71.202.62
```

## 2. Código
```bash
sudo git clone https://github.com/manuelpm43/CORTES.git /opt/cortes
```

## 3. Base de datos
Averigua en qué BD está `public.ejes_tronco`:
```bash
sudo -u postgres psql -l
sudo -u postgres psql -d <bd> -c "\dt public.ejes_tronco"
```
Antes de seguir, ejecuta la consulta 0 de `docs/verificacion_fase1.sql`, que comprueba la columna `geom`, el tipo con M y el SRID. Después:
```bash
cd /opt/cortes
for f in backend/sql/00*.sql; do sudo -u postgres psql -d <bd> -v ON_ERROR_STOP=1 -f "$f" || break; done
sudo -u postgres psql -d <bd> -c "ALTER ROLE cortes_app PASSWORD '<contraseña_larga>'"
sudo -u postgres psql -d <bd> -c "SELECT * FROM cortes.v_ejes_rango"   # debe listar los ejes
```

## 4. Backend
```bash
cd /opt/cortes/backend
npm ci --omit=dev
cp .env.example .env && nano .env
#   PGDATABASE=<bd>   PGUSER=cortes_app   PGPASSWORD=<contraseña_larga>
#   JWT_SECRETO=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")   (NUEVO, no el de BIDELAN)
#   ADMIN_NOMBRE / ADMIN_EMAIL / ADMIN_PASSWORD  -> tu cuenta de admin
chmod 600 .env
node bootstrapAdmin.js
pm2 start server.js --name cortes-api && pm2 save
curl http://127.0.0.1:4100/api/salud    # {"ok":true}
```
Si `/api/salud` da error de autenticación con PostgreSQL, revisa que `pg_hba.conf` acepte contraseña (`scram-sha-256`) desde `127.0.0.1` para el rol `cortes_app`.

## 5. nginx + HTTPS
```bash
sudo cp /opt/cortes/docs/nginx-cortes.conf /etc/nginx/sites-available/cortes
sudo ln -s /etc/nginx/sites-available/cortes /etc/nginx/sites-enabled/cortes
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cortes.geospatiallab.xyz
curl https://cortes.geospatiallab.xyz/api/salud
```

## 6. Probar
Abrir `https://cortes.geospatiallab.xyz/login.html` e iniciar sesión con la cuenta `ADMIN_EMAIL`.

## Actualizaciones
```bash
cd /opt/cortes && git pull
# si cambia el backend:
cd backend && npm ci --omit=dev && pm2 restart cortes-api
# si hay SQL nuevo: ejecutar solo los scripts nuevos o modificados (son idempotentes)
```
