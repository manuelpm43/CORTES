-- =====================================================================
-- 004_auditoria.sql  ·  Cortes de carril
-- Registro de cambios en cortes.cortes mediante trigger.
-- cortes_app solo puede LEER la auditoría: la escritura la hace una
-- función SECURITY DEFINER, así que la app no puede alterarla.
--
-- El backend identifica al usuario en cada transacción con
--   SELECT set_config('cortes.usuario_id', '<id>', true);
--   SELECT set_config('cortes.origen', 'manual' | 'excel', true);
-- =====================================================================

CREATE TABLE IF NOT EXISTS cortes.auditoria_cortes (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    corte_id       integer     NOT NULL,          -- sin FK: se conserva tras borrar el corte
    operacion      text        NOT NULL,
    usuario_id     integer,
    usuario_email  text,                          -- copia, por si se borra el usuario
    origen         text,
    cuando         timestamptz NOT NULL DEFAULT now(),
    datos_antes    jsonb,
    datos_despues  jsonb,
    CONSTRAINT auditoria_operacion_ck CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS auditoria_corte_ix  ON cortes.auditoria_cortes (corte_id, cuando);
CREATE INDEX IF NOT EXISTS auditoria_cuando_ix ON cortes.auditoria_cortes (cuando);

CREATE OR REPLACE FUNCTION cortes.tg_auditoria_cortes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortes, pg_temp
AS $$
DECLARE
    v_usuario_id integer;
    v_corte_id   integer;
    v_antes      jsonb;
    v_despues    jsonb;
BEGIN
    v_usuario_id := nullif(current_setting('cortes.usuario_id', true), '')::integer;

    -- La geometría se omite: es derivada de los PK y ocuparía mucho.
    IF TG_OP <> 'INSERT' THEN
        v_antes := to_jsonb(OLD) - 'geom';
        v_corte_id := OLD.id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        v_despues := to_jsonb(NEW) - 'geom';
        v_corte_id := NEW.id;
    END IF;

    -- Un UPDATE que solo toca la geometría o la marca de tiempo no se registra.
    IF TG_OP = 'UPDATE'
       AND (v_antes - 'actualizado_en' - 'actualizado_por') = (v_despues - 'actualizado_en' - 'actualizado_por') THEN
        RETURN NULL;
    END IF;

    INSERT INTO cortes.auditoria_cortes
        (corte_id, operacion, usuario_id, usuario_email, origen, datos_antes, datos_despues)
    VALUES (
        v_corte_id,
        TG_OP,
        v_usuario_id,
        (SELECT u.email FROM cortes.usuarios u WHERE u.id = v_usuario_id),
        nullif(current_setting('cortes.origen', true), ''),
        v_antes,
        v_despues
    );

    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS cortes_auditoria ON cortes.cortes;
CREATE TRIGGER cortes_auditoria
    AFTER INSERT OR UPDATE OR DELETE ON cortes.cortes
    FOR EACH ROW EXECUTE FUNCTION cortes.tg_auditoria_cortes();

REVOKE ALL ON cortes.auditoria_cortes FROM cortes_app;
GRANT SELECT ON cortes.auditoria_cortes TO cortes_app;
