-- =====================================================================
-- 002_cortes.sql  ·  Cortes de carril
-- Catálogos (carreteras, carriles) y tabla principal de cortes.
-- PK siempre en kilómetros (misma unidad que la M de los ejes).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Carreteras. "codigo" es el prefijo de eje_nomenclatura en
-- public.ejes_tronco: eje = codigo || '-' || sentido  (p. ej. AP636-1).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortes.carreteras (
    codigo  text     PRIMARY KEY,
    nombre  text     NOT NULL,
    orden   smallint NOT NULL DEFAULT 0
);

INSERT INTO cortes.carreteras (codigo, nombre, orden) VALUES
    ('AP8',   'AP-8',   1),
    ('AP1',   'AP-1',   2),
    ('GI20',  'GI-20',  3),
    ('AP636', 'AP-636', 4)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- Carriles. desplazamiento_m = distancia lateral al eje, en metros,
-- POSITIVA HACIA LA DERECHA del sentido de circulación. La función de
-- segmentación (003) traduce el signo según la digitalización del eje.
-- Valores orientativos (eje en el centro de una calzada de 2 carriles):
-- ajustar a la geometría real.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortes.carriles (
    codigo           text         PRIMARY KEY,
    nombre           text         NOT NULL,
    desplazamiento_m numeric(5,2) NOT NULL DEFAULT 0,
    orden            smallint     NOT NULL DEFAULT 0
);

INSERT INTO cortes.carriles (codigo, nombre, desplazamiento_m, orden) VALUES
    ('IZQ',   'Carril izquierdo', -1.75, 1),
    ('CEN',   'Carril central',    0.00, 2),
    ('DER',   'Carril derecho',    1.75, 3),
    ('ARCEN', 'Arcén',             4.50, 4),
    ('TODOS', 'Calzada completa',  0.00, 5)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- Cortes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortes.cortes (
    id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carretera         text         NOT NULL REFERENCES cortes.carreteras (codigo),
    sentido           smallint     NOT NULL,
    eje               text         GENERATED ALWAYS AS (carretera || '-' || sentido::text) STORED,
    carriles          text[]       NOT NULL DEFAULT '{}',
    desplazamiento_m  numeric(5,2),          -- NULL = automático según carriles
    pk_inicio         numeric(8,3) NOT NULL,
    pk_fin            numeric(8,3) NOT NULL,
    fecha_inicio      timestamptz  NOT NULL,
    fecha_fin         timestamptz,
    tipo              text,
    motivo            text,
    estado            text         NOT NULL DEFAULT 'previsto',
    observaciones     text,
    -- Importación Excel: identificador de la fila de origen para poder
    -- actualizar en lugar de duplicar al reimportar.
    origen            text         NOT NULL DEFAULT 'manual',
    ref_externa       text,
    -- Geometría generada por trigger (003). No se edita a mano.
    geom              geometry(MultiLineString, 25830),
    creado_por        integer      REFERENCES cortes.usuarios (id) ON DELETE SET NULL,
    creado_en         timestamptz  NOT NULL DEFAULT now(),
    actualizado_por   integer      REFERENCES cortes.usuarios (id) ON DELETE SET NULL,
    actualizado_en    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT cortes_sentido_ck CHECK (sentido IN (1, 2)),
    CONSTRAINT cortes_estado_ck  CHECK (estado IN ('previsto', 'activo', 'finalizado')),
    CONSTRAINT cortes_origen_ck  CHECK (origen IN ('manual', 'excel')),
    CONSTRAINT cortes_pk_ck      CHECK (pk_inicio >= 0 AND pk_fin >= 0 AND pk_inicio <> pk_fin),
    CONSTRAINT cortes_fechas_ck  CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio)
);

CREATE UNIQUE INDEX IF NOT EXISTS cortes_ref_externa_uk ON cortes.cortes (ref_externa) WHERE ref_externa IS NOT NULL;
CREATE INDEX IF NOT EXISTS cortes_eje_ix     ON cortes.cortes (eje);
CREATE INDEX IF NOT EXISTS cortes_estado_ix  ON cortes.cortes (estado);
CREATE INDEX IF NOT EXISTS cortes_fechas_ix  ON cortes.cortes (fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS cortes_geom_gix   ON cortes.cortes USING gist (geom);

GRANT SELECT ON cortes.carreteras, cortes.carriles TO cortes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cortes.cortes TO cortes_app;
