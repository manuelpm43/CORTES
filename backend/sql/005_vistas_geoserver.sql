-- =====================================================================
-- 005_vistas_geoserver.sql  ·  Cortes de carril
-- Vistas publicadas en GeoServer (workspace "cortes") por WMS/WFS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estado de un corte, calculado con la hora actual:
--   finalizado  si se finalizó a mano (cortes.estado = 'finalizado') o ya
--               pasó fecha_fin
--   activo      si ya empezó (fecha_fin NULL = sin fin previsto)
--   previsto    si aún no ha empezado
-- La columna cortes.estado solo guarda la finalización manual; cualquier
-- otro valor significa "automático según fechas".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortes.estado_corte(p_estado text, p_inicio timestamptz, p_fin timestamptz)
RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p_estado = 'finalizado' OR (p_fin IS NOT NULL AND p_fin <= now()) THEN 'finalizado'
        WHEN p_inicio <= now() THEN 'activo'
        ELSE 'previsto'
    END;
$$;

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
       cortes.estado_corte(c.estado, c.fecha_inicio, c.fecha_fin)               AS estado,
       cortes.estado_corte(c.estado, c.fecha_inicio, c.fecha_fin) = 'activo'    AS activo_ahora,
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
--   GRANT CONNECT ON DATABASE <base_de_datos> TO cortes_geoserver;
--   GRANT USAGE ON SCHEMA cortes TO cortes_geoserver;
--   GRANT SELECT ON cortes.v_cortes, cortes.v_cortes_activos TO cortes_geoserver;
