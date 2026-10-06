# CORTES · Registro de versiones

## v0.2 · 2026-10-06 · Fase 2: API con autenticación
- Backend Express (`server.js`): `trust proxy`, CORS limitado a `ORIGEN_PERMITIDO`, límite de 20 intentos cada 15 min en `/api/auth`, y los errores de la BD (23514, 23503…) se traducen a 400 o 409.
- `auth.js`: registro (pendiente de aprobación), login con bcrypt y JWT propio (`{id, email, rol}`), y `/yo`.
- Middlewares `exigirUsuario`, `exigirEditor` y `exigirAdmin`. Comprueban en la BD que el usuario sigue aprobado y toman su rol actual.
- `cortes.js`: listado en GeoJSON con filtros (carretera, sentido, estado, fechas, activos, bbox), catálogos, alta, edición, finalizar, baja (solo admin) e historial. `validarCorte` y `parsearPk` se exportan para la importación del Excel.
- `admin.js`: usuarios (aprobar, cambiar rol, rechazar o dar de baja) y auditoría.
- `db.js`: `transaccionUsuario()` fija `cortes.usuario_id` y `cortes.origen` para los triggers.
- `bootstrapAdmin.js`, `.env.example` y `README.md` con todas las rutas.

## v0.1 · 2026-10-06 · Fase 1: SQL y segmentación
- `001_usuarios.sql`: esquema `cortes`, rol `cortes_app` (sin acceso a `public.usuarios`) y tabla `cortes.usuarios` con CHECK de rol y email normalizado.
- `002_cortes.sql`: catálogos `carreteras` y `carriles` (con desplazamiento lateral) y tabla `cortes.cortes` (PK en km, `eje` generado y `ref_externa` para reimportar el Excel).
- `003_segmentacion.sql`: vistas `v_ejes` (sobre `public.ejes_tronco`) y `v_ejes_rango`, `segmentar()` con `ST_LocateBetween` y desplazamiento según el sentido de circulación, trigger de validación y geometría, `regenerar_geometrias()` y `pk_a_texto()`.
- `004_auditoria.sql`: `auditoria_cortes` rellenada por un trigger `SECURITY DEFINER`, de solo lectura para la app.
- `005_vistas_geoserver.sql`: `v_cortes` y `v_cortes_activos`, con el campo `activo_ahora`.
- Documentación: `CLAUDE.md`, `docs/especificacion.md` (v0.3) y `docs/verificacion_fase1.sql`.
