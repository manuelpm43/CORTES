// Conexión a PostgreSQL (rol cortes_app) y transacciones con usuario
// identificado para los triggers de geometría y auditoría.
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 10
});

pool.on('error', function (err) {
    console.error('Error en el pool de PostgreSQL:', err.message);
});

// Ejecuta trabajo(cliente) dentro de una transacción en la que los
// triggers saben quién escribe (cortes.usuario_id) y desde dónde
// (cortes.origen: 'manual' | 'excel'). trabajo debe devolver una promesa.
function transaccionUsuario(usuarioId, origen, trabajo) {
    return pool.connect().then(function (cliente) {
        let resultado;
        return cliente.query('BEGIN')
            .then(function () {
                return cliente.query(
                    "SELECT set_config('cortes.usuario_id', $1, true), set_config('cortes.origen', $2, true)",
                    [String(usuarioId), origen]
                );
            })
            .then(function () {
                return trabajo(cliente);
            })
            .then(function (r) {
                resultado = r;
                return cliente.query('COMMIT');
            })
            .then(function () {
                cliente.release();
                return resultado;
            })
            .catch(function (err) {
                return cliente.query('ROLLBACK')
                    .then(function () {
                        cliente.release();
                    }, function (errRollback) {
                        cliente.release(errRollback);  // conexión rota: se descarta del pool
                    })
                    .then(function () {
                        throw err;
                    });
            });
    });
}

module.exports = {
    pool: pool,
    query: function (texto, parametros) { return pool.query(texto, parametros); },
    transaccionUsuario: transaccionUsuario
};
