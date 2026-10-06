// /api/admin: gestión de usuarios y consulta de la auditoría (solo admin).
const express = require('express');
const db = require('./db');
const exigirAdmin = require('./middlewareAdmin');

const router = express.Router();
const ROLES = ['usuario', 'editor', 'admin'];

router.use(exigirAdmin);

function idValido(valor) {
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/usuarios', function (req, res, next) {
    db.query('SELECT id, nombre, email, rol, aprobado, creado_en FROM cortes.usuarios ORDER BY aprobado, creado_en DESC')
        .then(function (r) { res.json(r.rows); })
        .catch(next);
});

router.put('/usuarios/:id/aprobar', function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }

    db.query('UPDATE cortes.usuarios SET aprobado = true WHERE id = $1 RETURNING id, nombre, email, rol, aprobado', [id])
        .then(function (r) {
            if (!r.rows[0]) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
            res.json(r.rows[0]);
        })
        .catch(next);
});

router.put('/usuarios/:id/rol', function (req, res, next) {
    const id = idValido(req.params.id);
    const rol = String(req.body.rol || '');
    if (!id || ROLES.indexOf(rol) === -1) {
        return res.status(400).json({ error: 'Usuario o rol no válido' });
    }
    if (id === req.usuario.id && rol !== 'admin') {
        return res.status(400).json({ error: 'No puedes quitarte el rol de administrador a ti mismo' });
    }

    db.query('UPDATE cortes.usuarios SET rol = $2 WHERE id = $1 RETURNING id, nombre, email, rol, aprobado', [id, rol])
        .then(function (r) {
            if (!r.rows[0]) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
            res.json(r.rows[0]);
        })
        .catch(next);
});

// Rechazar un alta pendiente o dar de baja a un usuario.
router.delete('/usuarios/:id', function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }
    if (id === req.usuario.id) {
        return res.status(400).json({ error: 'No puedes borrar tu propia cuenta' });
    }

    db.query('DELETE FROM cortes.usuarios WHERE id = $1', [id])
        .then(function (r) {
            if (r.rowCount === 0) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
            res.status(204).end();
        })
        .catch(next);
});

// Últimos movimientos de la auditoría (opcionalmente de un corte).
router.get('/auditoria', function (req, res, next) {
    const corteId = req.query.corte_id ? idValido(req.query.corte_id) : null;
    const limite = Math.min(parseInt(req.query.limite, 10) || 200, 1000);

    db.query(
        'SELECT * FROM cortes.auditoria_cortes WHERE ($1::integer IS NULL OR corte_id = $1) ORDER BY id DESC LIMIT $2',
        [corteId, limite]
    )
        .then(function (r) { res.json(r.rows); })
        .catch(next);
});

module.exports = router;
