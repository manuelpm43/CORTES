-- =====================================================================
-- 001_usuarios.sql  ·  Cortes de carril
-- Esquema propio, rol de aplicación y tabla de usuarios (independiente
-- de BIDELAN). Ejecutar con un rol con permisos de creación de roles
-- (p. ej. postgres) sobre la base de datos BIDELAN_Nube.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS cortes;

-- Rol de la aplicación. La contraseña NO se guarda aquí: asignarla a mano
--   ALTER ROLE cortes_app PASSWORD '...';
-- y copiarla a backend/.env (PGPASSWORD).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortes_app') THEN
        CREATE ROLE cortes_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE "BIDELAN_Nube" TO cortes_app;
GRANT USAGE ON SCHEMA cortes TO cortes_app;

-- Aislamiento: cortes_app no debe ver los usuarios de BIDELAN.
DO $$
BEGIN
    IF to_regclass('public.usuarios') IS NOT NULL THEN
        REVOKE ALL ON public.usuarios FROM cortes_app;
    END IF;
END
$$;

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortes.usuarios (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre         text        NOT NULL,
    email          text        NOT NULL,
    password_hash  text        NOT NULL,
    rol            text        NOT NULL DEFAULT 'usuario',
    aprobado       boolean     NOT NULL DEFAULT false,
    creado_en      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_rol_ck   CHECK (rol IN ('usuario', 'editor', 'admin')),
    CONSTRAINT usuarios_email_ck CHECK (email = lower(btrim(email)) AND email <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uk ON cortes.usuarios (email);

GRANT SELECT, INSERT, UPDATE, DELETE ON cortes.usuarios TO cortes_app;
