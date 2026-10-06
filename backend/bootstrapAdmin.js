// Crea (o promueve) el administrador inicial a partir de .env:
//   ADMIN_NOMBRE, ADMIN_EMAIL, ADMIN_PASSWORD
// Uso: node bootstrapAdmin.js            -> crea si no existe; si existe, lo hace admin aprobado
//      node bootstrapAdmin.js --password -> además restablece su contraseña
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const db = require('./db');
const auth = require('./auth');

const nombre = (process.env.ADMIN_NOMBRE || 'Administrador').trim();
const email = auth.normalizarEmail(process.env.ADMIN_EMAIL);
const password = process.env.ADMIN_PASSWORD || '';
const restablecerPassword = process.argv.indexOf('--password') !== -1;

if (!email || password.length < 8) {
    console.error('Define ADMIN_EMAIL y ADMIN_PASSWORD (mín. 8 caracteres) en backend/.env');
    process.exit(1);
}

bcrypt.hash(password, auth.RONDAS_BCRYPT)
    .then(function (hash) {
        return db.query(
            'INSERT INTO cortes.usuarios (nombre, email, password_hash, rol, aprobado)' +
            " VALUES ($1, $2, $3, 'admin', true)" +
            " ON CONFLICT (email) DO UPDATE SET rol = 'admin', aprobado = true" +
            (restablecerPassword ? ', password_hash = EXCLUDED.password_hash' : '') +
            ' RETURNING id, (xmax = 0) AS creado',
            [nombre, email, hash]
        );
    })
    .then(function (r) {
        const fila = r.rows[0];
        console.log((fila.creado ? 'Admin creado' : 'Admin actualizado') + ': ' + email + ' (id ' + fila.id + ')');
        return db.pool.end();
    })
    .catch(function (err) {
        console.error('Error creando el admin:', err.message);
        db.pool.end().then(function () { process.exit(1); });
    });
