-- =====================================================================
-- Comprobaciones de la fase 1 (ejecutar en BIDELAN_Nube)
-- =====================================================================

-- 0. ANTES de ejecutar 003: confirmar nombre/tipo/SRID de la geometría
--    de los ejes. Esperado: columna "geom", tipo ...M, coord_dimension 3.
SELECT f_table_schema, f_table_name, f_geometry_column, type, srid, coord_dimension
FROM geometry_columns
WHERE f_table_schema = 'public' AND f_table_name = 'ejes_tronco';

-- 0b. Formato de eje_nomenclatura (esperado AP8-1, AP8-2, AP636-1, ...)
SELECT eje_nomenclatura, count(*) FROM public.ejes_tronco GROUP BY 1 ORDER BY 1;

-- 1. Rango de PK por eje y sentido de digitalización
SELECT * FROM cortes.v_ejes_rango ORDER BY eje;

-- 2. Segmentación de prueba (ajustar eje y PK a un tramo real)
SELECT ST_AsText(cortes.segmentar('AP636-1', 2.000, 2.500, 0)),
       ST_Length(cortes.segmentar('AP636-1', 2.000, 2.500, 0)) AS metros;  -- ~500

-- 3. Desplazamiento: la línea con +1.75 debe quedar a la DERECHA del
--    sentido de circulación (comprobar en QGIS cargando ambas).
SELECT 'eje' AS caso, cortes.segmentar('AP636-1', 2.000, 2.500, 0) AS geom
UNION ALL
SELECT 'derecha', cortes.segmentar('AP636-1', 2.000, 2.500, 1.75);

-- 4. Alta de prueba en transacción (no deja rastro)
BEGIN;
SELECT set_config('cortes.origen', 'manual', true);
INSERT INTO cortes.cortes (carretera, sentido, carriles, pk_inicio, pk_fin, fecha_inicio, fecha_fin, tipo, motivo)
VALUES ('AP636', 1, '{DER}', 2.000, 2.500, now(), now() + interval '4 hours', 'Prueba', 'Prueba fase 1')
RETURNING id, eje, ST_Length(geom) AS metros;
SELECT * FROM cortes.v_cortes;
SELECT * FROM cortes.auditoria_cortes ORDER BY id DESC LIMIT 1;
-- PK fuera de rango: debe fallar con "PK fuera de rango ..."
-- INSERT INTO cortes.cortes (carretera, sentido, pk_inicio, pk_fin, fecha_inicio)
-- VALUES ('AP636', 1, 0, 9999, now());
ROLLBACK;
