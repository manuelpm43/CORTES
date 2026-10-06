// Exige un JWT válido de ESTA aplicación (Authorization: Bearer).
// Además comprueba en BD que el usuario sigue existiendo y aprobado, y
// toma el rol de la BD: un cambio de rol o una baja tienen efecto al
// momento, sin esperar a que caduque el token.
const jwt = require('jsonwebtoken');
const db = require('./db');

function exigirUsuario(req, res, next) {
    const cabecera = req.headers.authorization || '';
    const partes = cabecera.split(' ');
    if (partes.length !== 2 || partes[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Falta el token de sesión' });
    }

    let datos;
    try {
        datos = jwt.verify(partes[1], process.env.JWT_SECRETO, { algorithms: ['HS256'] });
    } catch (err) {
        return res.status(401).json({ error: 'Sesión no válida o caducada' });
    }

    db.query('SELECT id, nombre, email, rol, aprobado FROM cortes.usuarios WHERE id = $1', [datos.id])
        .then(function (r) {
            const usuario = r.rows[0];
            if (!usuario || !usuario.aprobado) {
                return res.status(401).json({ error: 'Usuario no autorizado' });
            }
            req.usuario = { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
            next();
        })
        .catch(next);
}

module.exports = exigirUsuario;
