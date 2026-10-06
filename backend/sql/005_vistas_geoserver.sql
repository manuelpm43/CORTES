-- =====================================================================
-- 005_vistas_geoserver.sql  ·  Cortes de carril
-- Vistas publicadas en GeoServer (workspace "cortes") por WMS/WFS.
-- =====================================================================

-- activo_ahora: no finalizado y now() dentro de [fecha_inicio, fecha_fin)
-- (fecha_fin NULL = sin fin previsto). Es independiente del campo
-- "estado", que se gestiona a mano; el visor usa ambos.
CREATE OR REPLACE VIEW cortes.v_cortes AS
SELECT c.id,
       c.carretera,
       ca.nombre                                   AS carretera_nombre,
       c.sentido,
       c.eje,
       array_to_string(c.carriles, ', ')           AS carriles,
       c.pk_inicio,
       c.pk_fin,
       cortes.pk_a_texto(c.pk_inicio)              AS pk_inicio_texto,
       cortes.pk_a_texto(c.pk_fin)                 AS pk_fin_texto,
       abs(c.pk_fin - c.pk_inicio)                 AS longitud_km,
       c.fecha_inicio,
       c.fecha_fin,
       c.tipo,
       c.motivo,
       c.estado,
       (c.estado <> 'finalizado'
        AND c.fecha_inicio <= now()
        AND (c.fecha_fin IS NULL OR c.fecha_fin > now()))  AS activo_ahora,
       c.observaciones,
       c.origen,
       c.actualizado_en,
       c.geom
FROM cortes.cortes c
JOIN cortes.carreteras ca ON ca.codigo = c.carretera
WHERE c.geom IS NOT NULL;

CREATE OR REPLACE VIEW cortes.v_cortes_activos AS
SELECT * FROM cortes.v_cortes WHERE activo_ahora;

GRANT SELECT ON cortes.v_cortes, cortes.v_cortes_activos TO cortes_app;

-- GeoServer: crear el almacén PostGIS con un usuario de solo lectura.
-- Si se usa cortes_app, no hace falta nada más. Si se prefiere uno
-- propio:
--   CREATE ROLE cortes_geoserver LOGIN PASSWORD '...';
--   GRANT CONNECT ON DATABASE "BIDELAN_Nube" TO cortes_geoserver;
--   GRANT USAGE ON SCHEMA cortes TO cortes_geoserver;
--   GRANT SELECT ON cortes.v_cortes, cortes.v_cortes_activos TO cortes_geoserver;
