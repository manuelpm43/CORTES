# PROMPT – Aplicación web "Cortes de carril AP-8 · AP-1 · GI-20 · AP-636" (v0.3)

## 1. Objetivo
Desarrollar una aplicación web para **definir, gestionar y representar en mapa los cortes de carril** de la AP-8, AP-1, GI-20 y AP-636. Cada corte se localiza por **PK inicio – PK fin** sobre los ejes calibrados, y su geometría se genera automáticamente.

## 2. Funcionalidades
- **Alta, edición y baja de cortes:** carretera, sentido (1 creciente / 2 decreciente, como en los nombres de eje `AP636-1`), carril(es), PK inicio, PK fin, fecha y hora de inicio y fin, tipo, motivo, estado (previsto / activo / finalizado) y observaciones.
- **Geometría automática** mediante segmentación dinámica en PostGIS sobre los ejes con medida M (`ST_LocateBetween` / `ST_LineSubstring`), con desplazamiento lateral opcional por carril.
- **Importación desde Excel** (se actualiza a menudo): validación de PK fuera de rango y de fechas incoherentes, con informe de errores.
- **Mapa:** cortes coloreados por estado; filtros por carretera, sentido, fechas y estado; ficha en popup; vista "activos ahora".
- **Tabla** sincronizada con el mapa y exportación a Excel, CSV y GeoJSON.

## 3. Infraestructura (misma que BIDELAN)
- **VPS Clouding.io** (Ubuntu, 217.71.202.62) con PostgreSQL + PostGIS y GeoServer (puerto 8080 interno).
- **Dominio** `geospatiallab.xyz` (Cloudflare, en modo "DNS only"). Subdominio nuevo: `cortes.geospatiallab.xyz`. No hay que tocar `visor.` (BIDELAN) ni la raíz.
- **nginx** como proxy inverso con HTTPS (Certbot): `/` sirve el frontend estático, `/api/` va al backend (puerto 4100) y `/geoserver/` va a GeoServer. Denegar `/backend/`, `/.git/` y `/sql/`.
- **Backend** con PM2 (proceso `cortes-api`). Despliegue con `git pull` en `/opt/cortes`.
- **Base de datos:** esquema propio `cortes` (tablas de la app, usuarios y auditoría). Los ejes calibrados se leen desde donde estén publicados (solo lectura).
- **GeoServer:** workspace `cortes`, con la vista `v_cortes` por WMS/WFS.
- **Cartografía:** API-IDEE con los fondos WMTS del IGN (ortofoto, cartografía, híbrido) y las capas de GeoServer encima.

## 4. Estructura de carpetas (patrón BIDELAN)
```
cortes/
├── index.html  login.html  admin.html
├── css/        estilos.css, login.css, admin.css
├── js/         config.js, auth.js, admin.js, app.js, panel.js, cortes.js, importar.js, filtros.js
├── img/
├── backend/
│   ├── server.js  db.js  .env.example  package.json  README.md
│   ├── auth.js  admin.js  bootstrapAdmin.js
│   ├── middlewareUsuario.js  middlewareEditor.js  middlewareAdmin.js
│   ├── cortes.js        # CRUD + segmentación
│   ├── importarExcel.js
│   └── sql/  001_usuarios.sql, 002_cortes.sql, 003_segmentacion.sql, 004_auditoria.sql, 005_vistas_geoserver.sql
├── docs/
├── CLAUDE.md  CORTES.md (registro de versiones vX.Y)
```

## 5. Usuarios y permisos (modelo BIDELAN, usuarios INDEPENDIENTES)
- **Usuarios propios de esta app, sin relación con BIDELAN:** tabla `cortes.usuarios` (`id`, `nombre`, `email`, `password_hash`, `rol`, `aprobado`, `creado_en`). Contraseñas bcrypt y emails normalizados (trim + minúsculas).
- **Aislamiento respecto a BIDELAN:**
  - `JWT_SECRETO` distinto, para que un token de BIDELAN no sea válido aquí ni al revés.
  - Clave de `localStorage` propia (`cortesToken`, no `bidelanToken`).
  - Rol de base de datos propio (`cortes_app`) con permisos solo sobre el esquema `cortes` y lectura (SELECT) de los ejes calibrados. Sin acceso a `public.usuarios` de BIDELAN.
- **Roles:**

| Rol | Puede hacer |
|---|---|
| `usuario` | Consultar el mapa y la tabla, y exportar |
| `editor` | Lo anterior, más crear, editar y finalizar cortes e importar el Excel |
| `admin` | Todo, más aprobar o rechazar altas y cambiar roles |

- Restricción `CHECK (rol IN ('usuario','editor','admin'))` en la tabla.
- **Registro → pendiente → aprobación por admin.** El admin inicial se crea con `bootstrapAdmin.js` desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`.
- **JWT** (`id`, `email`, `rol`) enviado como `Authorization: Bearer`. Middlewares `exigirUsuario`, `exigirEditor` y `exigirAdmin`.
- Límite de intentos en `/api/auth` (20 cada 15 min), `trust proxy` y CORS restringido con `ORIGEN_PERMITIDO`.
- Tabla `cortes.auditoria_cortes` con quién, qué operación, cuándo y los datos de antes y después.

## 6. Convenciones y requisitos
- Frontend en HTML, CSS y JS puro, sin bundler. Backend en Node/Express con `pg`.
- Variables y funciones en **español y camelCase**, CSS en kebab-case en español, ficheros en minúsculas.
- Funciones con `function` (no arrow) y promesas con `.then/.catch`, igual que en BIDELAN.
- SRID de datos EPSG:25830 y del mapa EPSG:3857. Secretos solo en `.env` (gitignored).
- Cada entrega se registra como `vX.Y` en `CORTES.md` y con el mismo prefijo en el commit.
- **Fases:** (1) SQL y segmentación, (2) API con auth, (3) visor, (4) importación del Excel, (5) admin y despliegue.
