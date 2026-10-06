# CLAUDE.md · Cortes de carril AP-8 · AP-1 · GI-20 · AP-636

Aplicación web para definir, gestionar y mostrar en mapa cortes de carril localizados por PK inicio–PK fin sobre los ejes calibrados. La especificación completa (v0.3) está en [docs/especificacion.md](docs/especificacion.md). Sigue el patrón de BIDELAN, pero **con usuarios independientes**.

## Datos
- BD: la misma en la que está `public.ejes_tronco` (PostgreSQL + PostGIS, VPS 217.71.202.62; en QGIS la conexión se llama «BIDELAN_Nube», pero ese no es necesariamente el nombre de la base de datos). Ningún script lleva el nombre escrito. Todo lo de la app va en el esquema `cortes`.
- Ejes calibrados: `public.ejes_tronco`, de solo lectura. El código de eje está en `eje_nomenclatura` (`AP636-1`: carretera + sentido) y la **M en km**.
- El acoplamiento con los ejes se hace **solo** a través de la vista `cortes.v_ejes` (003). Si cambia la tabla o la columna, se toca esa vista y se ejecuta `SELECT * FROM cortes.regenerar_geometrias();`.
- PK guardados como `numeric(8,3)` en km y mostrados como `12+350` (`cortes.pk_a_texto`).
- Sentido 1 = PK crecientes y sentido 2 = PK decrecientes. `desplazamiento_m > 0` va a la derecha del sentido de circulación. `segmentar()` corrige el signo según la digitalización del eje (`v_ejes_rango.m_crece`). Todos los ejes reales tienen `m_crece = t`, así que los de sentido 2 están digitalizados contra el tráfico.
- El eje calibrado va por el **borde interior** de cada calzada (junto a la mediana) y los carriles, de 3,5 m, quedan a su derecha. El desplazamiento por carril se calcula con `cortes.desplazamiento_carriles(eje, pk, carriles)`, a partir de `nº_de_carriles` del punto de `public.geometria_pk_ejes` más cercano al PK medio del corte (`m_eje`, en km). Si no hay dato, se toman 2 carriles. `desplazamiento_m` en `cortes.cortes` solo se usa como ajuste manual.
- `eje_nomenclatura` puede ser `CARRETERA-SENTIDO` o `CARRETERA-TRAMO-SENTIDO` (GI-20). `v_ejes` lo normaliza a `CARRETERA-SENTIDO`.
- La geometría de `cortes.cortes` la genera el trigger `cortes_geometria`; no se escribe a mano. Los errores de validación salen con SQLSTATE `23514`, y la API los devuelve como 400.
- La auditoría va por trigger (`SECURITY DEFINER`) y cortes_app solo puede leerla. En cada transacción de escritura, el backend debe ejecutar `set_config('cortes.usuario_id', id, true)` y `set_config('cortes.origen', 'manual'|'excel', true)`.

## SQL
Scripts en `backend/sql/`, idempotentes y ejecutados en orden 001→005 con un rol administrador:
```
psql -d <bd_ejes> -f backend/sql/001_usuarios.sql      # ... hasta 005
ALTER ROLE cortes_app PASSWORD '...';                   # a mano, nunca en git
```
Comprobaciones en [docs/verificacion_fase1.sql](docs/verificacion_fase1.sql).

## Frontend (`index.html`, `login.html`)
- Scripts globales sin módulos, que se cargan en este orden: `config.js` (URLs, `peticionApi`, sesión, colores y utilidades), `app.js` (mapa API-IDEE y capas), `panel.js` (ficha, formulario e historial), `filtros.js` y `cortes.js` (arranque, carga, tabla y exportación).
- Los cortes se pintan desde la API (GeoJSON 4326) con `IDEE.layer.GeoJSON`, y no desde el WMS de GeoServer. Así el mapa y la tabla usan exactamente los mismos filtros y los datos solo se ven con sesión.
- **API-IDEE:** las capas de cortes y de selección se crean **una sola vez** y se actualizan con `setSource`. Si se recrean, el gestor de selección falla (`prevSelectedFeatures_ … is not iterable`). `setSource` descarta el estilo y carga en diferido, así que el estilo se vuelve a aplicar con un objeto nuevo en el evento `IDEE.evt.LOAD` (`cambiarDatosCapa`).
- El WMS de GeoServer solo se usa para los ejes de contexto (`capaEjesWmsNombre` en `config.js`).

## Convenciones
- Frontend en HTML, CSS y JS puro, sin bundler. Backend en Node/Express con `pg`.
- Nombres en español: camelCase en JS, kebab-case en CSS, snake_case en SQL y ficheros en minúsculas.
- `function` (no arrow) y `.then/.catch`.
- EPSG:25830 para datos y EPSG:3857 para el mapa. Secretos solo en `backend/.env`.
- `JWT_SECRETO` distinto del de BIDELAN y token en `localStorage` con la clave `cortesToken`.
- Cada entrega se registra como `vX.Y` en [CORTES.md](CORTES.md) y con el mismo prefijo en el commit.

## Fases
1. SQL y segmentación ✔ (v0.1)
2. API con auth ✔ (v0.2, rutas en [backend/README.md](backend/README.md))
3. Visor ✔ (v0.3)
4. Importación del Excel
5. Admin y despliegue (`cortes.geospatiallab.xyz`, nginx, PM2 `cortes-api` en el puerto 4100, `/opt/cortes`)
