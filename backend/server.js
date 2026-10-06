// API de cortes de carril. Detrás de nginx: /api/ -> 127.0.0.1:4100
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

if (!process.env.JWT_SECRETO || process.env.JWT_SECRETO.length < 32) {
    console.error('JWT_SECRETO no definido o demasiado corto (mín. 32 caracteres). Revisa backend/.env');
    process.exit(1);
}

const db = require('./db');
const auth = require('./auth');
const admin = require('./admin');
const cortes = require('./cortes');

const app = express();
const PUERTO = parseInt(process.env.PUERTO || '4100', 10);
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.set('trust proxy', 1);

const origenesPermitidos = String(process.env.ORIGEN_PERMITIDO || '')
    .split(',')
    .map(function (o) { return o.trim(); })
    .filter(Boolean);

app.use(cors({
    origin: function (origen, callback) {
        // Sin cabecera Origin (mismo origen vía nginx, curl): se permite.
        if (!origen || origenesPermitidos.indexOf(origen) !== -1) { return callback(null, true); }
        callback(null, false);
    }
}));

app.use(express.json({ limit: '1mb' }));

const limiteAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // /api/auth/yo se consulta en cada carga de página: no cuenta.
    skip: function (req) { return req.method === 'GET'; },
    message: { error: 'Demasiados intentos. Vuelve a probar en unos minutos.' }
});

app.use('/api/auth', limiteAuth, auth.router);
app.use('/api/admin', admin);
app.use('/api/cortes', cortes.router);

app.get('/api/salud', function (req, res, next) {
    db.query('SELECT 1')
        .then(function () { res.json({ ok: true }); })
        .catch(next);
});

app.use('/api', function (req, res) {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Modo local (MODO_LOCAL=1): sirve el frontend desde el propio backend para
// trabajar sin nginx. Solo las carpetas y páginas públicas, nunca backend/.
if (process.env.MODO_LOCAL === '1') {
    const raiz = path.join(__dirname, '..');
    ['css', 'js', 'img'].forEach(function (carpeta) {
        app.use('/' + carpeta, express.static(path.join(raiz, carpeta)));
    });
    ['index.html', 'login.html', 'admin.html'].forEach(function (pagina) {
        app.get('/' + pagina, function (req, res) { res.sendFile(path.join(raiz, pagina)); });
    });
    app.get('/', function (req, res) { res.redirect('/index.html'); });
}

// Errores: los de validación de la BD se devuelven al cliente; el resto, 500.
app.use(function (err, req, res, next) {
    if (res.headersSent) { return next(err); }

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON no válido' });
    }
    switch (err.code) {
        case '23514': // check_violation (PK fuera de rango, carriles, fechas...)
            return res.status(400).json({ error: err.message });
        case '23503': // foreign_key_violation
            return res.status(400).json({ error: 'Carretera no válida' });
        case '23505': // unique_violation
            return res.status(409).json({ error: 'Registro duplicado (¿ref_externa repetida?)' });
        case '22P02': // invalid_text_representation
        case '22008': // datetime_field_overflow
            return res.status(400).json({ error: 'Dato con formato no válido' });
    }

    console.error(new Date().toISOString(), req.method, req.originalUrl, err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PUERTO, HOST, function () {
    console.log('cortes-api escuchando en http://' + HOST + ':' + PUERTO);
    if (process.env.MODO_LOCAL === '1') {
        console.log('Modo local: abre http://localhost:' + PUERTO + '/login.html');
    }
});
