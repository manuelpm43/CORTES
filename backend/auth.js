// /api/auth: registro (queda pendiente de aprobación), login y sesión.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const exigirUsuario = require('./middlewareUsuario');

const router = express.Router();

const RONDAS_BCRYPT = 12;
const LONGITUD_MINIMA_PASSWORD = 8;
// Hash ficticio para que un email inexistente tarde lo mismo que uno real.
const HASH_FICTICIO = bcrypt.hashSync('cortes-hash-ficticio', RONDAS_BCRYPT);

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function firmarToken(usuario) {
    return jwt.sign(
        { id: usuario.id, email: usuario.email, rol: usuario.rol },
        process.env.JWT_SECRETO,
        { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRACION || '8h' }
    );
}

router.post('/registro', function (req, res, next) {
    const nombre = String(req.body.nombre || '').trim();
    const email = normalizarEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!nombre || !emailValido(email)) {
        return res.status(400).json({ error: 'Nombre y email válidos son obligatorios' });
    }
    if (password.length < LONGITUD_MINIMA_PASSWORD) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos ' + LONGITUD_MINIMA_PASSWORD + ' caracteres' });
    }

    bcrypt.hash(password, RONDAS_BCRYPT)
        .then(function (hash) {
            return db.query(
                'INSERT INTO cortes.usuarios (nombre, email, password_hash) VALUES ($1, $2, $3)',
                [nombre, email, hash]
            );
        })
        .then(function () {
            res.status(201).json({ mensaje: 'Registro recibido. Un administrador debe aprobar la cuenta.' });
        })
        .catch(function (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
            }
            next(err);
        });
});

router.post('/login', function (req, res, next) {
    const email = normalizarEmail(req.body.email);
    const password = String(req.body.password || '');
    let usuario;

    db.query('SELECT id, nombre, email, password_hash, rol, aprobado FROM cortes.usuarios WHERE email = $1', [email])
        .then(function (r) {
            usuario = r.rows[0];
            return bcrypt.compare(password, usuario ? usuario.password_hash : HASH_FICTICIO);
        })
        .then(function (coincide) {
            if (!usuario || !coincide) {
                return res.status(401).json({ error: 'Email o contraseña incorrectos' });
            }
            if (!usuario.aprobado) {
                return res.status(403).json({ error: 'La cuenta está pendiente de aprobación' });
            }
            res.json({
                token: firmarToken(usuario),
                usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
            });
        })
        .catch(next);
});

router.get('/yo', exigirUsuario, function (req, res) {
    res.json({ usuario: req.usuario });
});

module.exports = {
    router: router,
    normalizarEmail: normalizarEmail,
    RONDAS_BCRYPT: RONDAS_BCRYPT
};
