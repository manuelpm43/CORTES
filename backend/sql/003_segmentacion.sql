-- =====================================================================
-- 003_segmentacion.sql  ·  Cortes de carril
-- Segmentación dinámica sobre los ejes calibrados (M en km).
--
-- ÚNICO punto de acoplamiento con los datos de BIDELAN: la vista
-- cortes.v_ejes. Si cambia la tabla o la columna de geometría de los
-- ejes, se toca solo esa vista.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PK numérico (km) -> texto "12+350" (negativos: "-0+066", hay ejes cuya
-- calibración empieza unos metros antes de 0)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortes.pk_a_texto(p_pk numeric)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_pk IS NULL THEN NULL ELSE
        CASE WHEN round(p_pk, 3) < 0 THEN '-' ELSE '' END ||
        trunc(abs(round(p_pk, 3)))::bigint::text || '+' ||
        lpad(((abs(round(p_pk, 3)) - trunc(abs(round(p_pk, 3)))) * 1000)::int::text, 3, '0')
    END;
$$;

-- ---------------------------------------------------------------------
-- Ejes calibrados (solo lectura)
-- eje_nomenclatura es "CARRETERA-SENTIDO" (AP8-1) o, en carreteras con
-- varios tramos calibrados por separado, "CARRETERA-TRAMO-SENTIDO"
-- (GI20-2-1). Los tramos se unen en un único eje "CARRETERA-SENTIDO";
-- los PK entre tramos quedan como hueco.
-- ---------------------------------------------------------------------
-- Se recrean (no CREATE OR REPLACE) para poder cambiar columnas y tipos.
-- Solo dependen de ellas las funciones de este script y los GRANT del final.
DROP VIEW IF EXISTS cortes.v_ejes_rango;
DROP VIEW IF EXISTS cortes.v_ejes;

CREATE VIEW cortes.v_ejes AS
SELECT regexp_replace(e.eje_nomenclatura, '^([^-]+)-\d+-(\d+)$', '\1-\2') AS eje,
       ST_Transform(e.geom, 25830)                                        AS geom,
       e.eje_nomenclatura                                                 AS eje_origen
FROM public.ejes_tronco e
WHERE e.eje_nomenclatura IS NOT NULL
  AND e.geom IS NOT NULL;

-- Rango de PK y sentido de digitalización de cada eje. Se asume M
-- monótona dentro de cada parte, por lo que basta con sus extremos.
-- m_crece = la M aumenta en el sentido en que está digitalizada la línea.
-- tramos  = rangos de cada parte, para avisar de huecos (GI-20).
CREATE VIEW cortes.v_ejes_rango AS
WITH partes AS (
    SELECT e.eje,
           least(ST_M(ST_StartPoint(d.geom)), ST_M(ST_EndPoint(d.geom)))    AS m_inicio,
           greatest(ST_M(ST_StartPoint(d.geom)), ST_M(ST_EndPoint(d.geom))) AS m_fin,
           ST_M(ST_EndPoint(d.geom)) - ST_M(ST_StartPoint(d.geom))          AS m_avance
    FROM cortes.v_ejes e
    CROSS JOIN LATERAL ST_Dump(e.geom) d
    WHERE ST_M(ST_StartPoint(d.geom)) IS NOT NULL
)
SELECT eje,
       min(m_inicio)::numeric(8,3) AS pk_min,
       max(m_fin)::numeric(8,3)    AS pk_max,
       sum(m_avance) > 0           AS m_crece,
       count(*)                    AS partes,
       string_agg(cortes.pk_a_texto(m_inicio::numeric) || ' a ' || cortes.pk_a_texto(m_fin::numeric),
                  ', ' ORDER BY m_inicio) AS tramos
FROM partes
GROUP BY eje;

-- ---------------------------------------------------------------------
-- Número de carriles de un eje en un PK, según el punto más cercano de
-- public.geometria_pk_ejes (puntos montados sobre los ejes; m_eje en km).
-- Sin dato -> 2.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortes.numero_carriles(p_eje text, p_pk numeric)
RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT coalesce((
        SELECT g."nº_de_carriles"
        FROM public.geometria_pk_ejes g
        WHERE regexp_replace(g.eje_nomenclatura, '^([^-]+)-\d+-(\d+)$', '\1-\2') = p_eje
          AND g."nº_de_carriles" > 0
          AND g.m_eje IS NOT NULL
        ORDER BY abs(g.m_eje - p_pk)
        LIMIT 1
    ), 2);
$$;

-- ---------------------------------------------------------------------
-- Desplazamiento lateral (m, + = derecha del sentido de circulación) del
-- centro de los carriles afectados, en el PK indicado. El eje va por el
-- borde interior de la calzada; carriles de 3,5 m hacia la derecha.
--   IZQ   = 1.ª franja (junto a la mediana)   1,75
--   CEN   = centro de la calzada              n·3,5/2
--   DER   = último carril                     (n−0,5)·3,5
--   ARCEN = arcén derecho                     n·3,5 + 1,25
--   TODOS / vacío = centro de la calzada
-- Varios carriles -> media.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS cortes.desplazamiento_carriles(text[]);

CREATE OR REPLACE FUNCTION cortes.desplazamiento_carriles(p_eje text, p_pk numeric, p_carriles text[])
RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
    c_ancho_carril CONSTANT numeric := 3.5;
    v_n            integer := cortes.numero_carriles(p_eje, p_pk);
    v_media        numeric;
BEGIN
    IF p_carriles IS NULL OR cardinality(p_carriles) = 0 OR 'TODOS' = ANY (p_carriles) THEN
        RETURN v_n * c_ancho_carril / 2;
    END IF;

    SELECT avg(CASE c
                   WHEN 'IZQ'   THEN c_ancho_carril / 2
                   WHEN 'CEN'   THEN v_n * c_ancho_carril / 2
                   WHEN 'DER'   THEN (v_n - 0.5) * c_ancho_carril
                   WHEN 'ARCEN' THEN v_n * c_ancho_carril + 1.25
               END)
    INTO v_media
    FROM unnest(p_carriles) c;

    RETURN round(coalesce(v_media, v_n * c_ancho_carril / 2), 2);
END
$$;

-- ---------------------------------------------------------------------
-- Segmentación: tramo del eje entre dos PK, desplazado lateralmente.
--   p_desplazamiento_m > 0 = a la derecha del sentido de circulación.
-- Sentido de circulación: eje "-1" PK crecientes, eje "-2" decrecientes.
-- ST_LocateBetween desplaza a la IZQUIERDA de la digitalización con
-- offset positivo, así que se ajusta el signo según m_crece.
-- Devuelve NULL si el tramo cae fuera del eje o en un hueco.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortes.segmentar(
    p_eje               text,
    p_pk_inicio         numeric,
    p_pk_fin            numeric,
    p_desplazamiento_m  numeric DEFAULT 0
)
RETURNS geometry(MultiLineString, 25830)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_geom      geometry;
    v_m_crece   boolean;
    v_sentido   integer;
    v_offset    float8;
    v_resultado geometry;
BEGIN
    SELECT ST_Collect(d.geom) INTO v_geom
    FROM cortes.v_ejes e
    CROSS JOIN LATERAL ST_Dump(e.geom) d
    WHERE e.eje = p_eje;

    IF v_geom IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT r.m_crece INTO v_m_crece FROM cortes.v_ejes_rango r WHERE r.eje = p_eje;
    v_sentido := coalesce(substring(p_eje FROM '-(\d+)$')::integer, 1);

    v_offset := coalesce(p_desplazamiento_m, 0);
    -- Digitalizado a favor del tráfico: derecha = offset negativo.
    IF v_m_crece = (v_sentido = 1) THEN
        v_offset := -v_offset;
    END IF;

    v_resultado := ST_LocateBetween(
        v_geom,
        least(p_pk_inicio, p_pk_fin)::float8,
        greatest(p_pk_inicio, p_pk_fin)::float8,
        v_offset
    );
    v_resultado := ST_CollectionExtract(v_resultado, 2);

    IF v_resultado IS NULL OR ST_IsEmpty(v_resultado) THEN
        RETURN NULL;
    END IF;

    RETURN ST_SetSRID(ST_Multi(ST_Force2D(v_resultado)), 25830);
END
$$;

-- ---------------------------------------------------------------------
-- Trigger: valida PK/carriles y genera la geometría al insertar o al
-- cambiar los campos de localización. Errores con SQLSTATE 23514
-- (check_violation) para que la API los devuelva como 400.
--
-- El backend identifica al usuario en la transacción con
--   SELECT set_config('cortes.usuario_id', '<id>', true);
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortes.tg_cortes_geometria()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_eje        text;
    v_rango      record;
    v_usuario_id integer;
    v_invalidos  text;
BEGIN
    v_usuario_id := nullif(current_setting('cortes.usuario_id', true), '')::integer;

    IF TG_OP = 'INSERT' THEN
        NEW.creado_por := coalesce(NEW.creado_por, v_usuario_id);
        NEW.actualizado_por := coalesce(NEW.actualizado_por, v_usuario_id);
    ELSE
        NEW.actualizado_en := now();
        NEW.actualizado_por := coalesce(v_usuario_id, NEW.actualizado_por);
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.carretera        IS NOT DISTINCT FROM OLD.carretera
       AND NEW.sentido          IS NOT DISTINCT FROM OLD.sentido
       AND NEW.pk_inicio        IS NOT DISTINCT FROM OLD.pk_inicio
       AND NEW.pk_fin           IS NOT DISTINCT FROM OLD.pk_fin
       AND NEW.carriles         IS NOT DISTINCT FROM OLD.carriles
       AND NEW.desplazamiento_m IS NOT DISTINCT FROM OLD.desplazamiento_m THEN
        RETURN NEW;  -- sin cambios de localización (regenerar_geometrias pasa por aquí)
    END IF;

    SELECT string_agg(c, ', ') INTO v_invalidos
    FROM unnest(NEW.carriles) c
    WHERE c NOT IN (SELECT codigo FROM cortes.carriles);
    IF v_invalidos IS NOT NULL THEN
        RAISE EXCEPTION 'Carril(es) no válido(s): %', v_invalidos
            USING ERRCODE = 'check_violation';
    END IF;

    -- La columna generada "eje" aún no está calculada en un BEFORE trigger.
    v_eje := NEW.carretera || '-' || NEW.sentido::text;

    SELECT * INTO v_rango FROM cortes.v_ejes_rango WHERE eje = v_eje;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el eje calibrado %', v_eje
            USING ERRCODE = 'check_violation';
    END IF;

    IF least(NEW.pk_inicio, NEW.pk_fin) < v_rango.pk_min - 0.001
       OR greatest(NEW.pk_inicio, NEW.pk_fin) > v_rango.pk_max + 0.001 THEN
        RAISE EXCEPTION 'PK fuera de rango en %: % – % (el eje va de % a %)',
            v_eje,
            cortes.pk_a_texto(NEW.pk_inicio), cortes.pk_a_texto(NEW.pk_fin),
            cortes.pk_a_texto(v_rango.pk_min), cortes.pk_a_texto(v_rango.pk_max)
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.geom := cortes.segmentar(
        v_eje, NEW.pk_inicio, NEW.pk_fin,
        coalesce(NEW.desplazamiento_m,
                 cortes.desplazamiento_carriles(v_eje, (NEW.pk_inicio + NEW.pk_fin) / 2, NEW.carriles))
    );

    IF NEW.geom IS NULL THEN
        RAISE EXCEPTION 'No hay eje calibrado en % entre % y %. Tramos calibrados: %',
            v_eje, cortes.pk_a_texto(NEW.pk_inicio), cortes.pk_a_texto(NEW.pk_fin), v_rango.tramos
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cortes_geometria ON cortes.cortes;
CREATE TRIGGER cortes_geometria
    BEFORE INSERT OR UPDATE ON cortes.cortes
    FOR EACH ROW EXECUTE FUNCTION cortes.tg_cortes_geometria();

-- ---------------------------------------------------------------------
-- Regenerar todas las geometrías (tras recalibrar los ejes o cambiar
-- desplazamientos de carriles). Los cortes que ya no encajan quedan con
-- geom NULL y se cuentan en "sin_geometria".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortes.regenerar_geometrias(
    OUT actualizados  integer,
    OUT sin_geometria integer
)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE cortes.cortes c
    SET geom = cortes.segmentar(
        c.eje, c.pk_inicio, c.pk_fin,
        coalesce(c.desplazamiento_m,
                 cortes.desplazamiento_carriles(c.eje, (c.pk_inicio + c.pk_fin) / 2, c.carriles))
    );
    GET DIAGNOSTICS actualizados = ROW_COUNT;

    SELECT count(*) INTO sin_geometria FROM cortes.cortes WHERE geom IS NULL;
END
$$;

GRANT SELECT ON public.ejes_tronco, public.geometria_pk_ejes TO cortes_app;
GRANT SELECT ON cortes.v_ejes, cortes.v_ejes_rango TO cortes_app;
