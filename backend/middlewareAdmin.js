// Exige rol admin (incluye la comprobación de exigirUsuario).
const exigirUsuario = require('./middlewareUsuario');

function exigirAdmin(req, res, next) {
    exigirUsuario(req, res, function (err) {
        if (err) { return next(err); }
        if (req.usuario.rol !== 'admin') {
            return res.status(403).json({ error: 'Se necesita rol de administrador' });
        }
        next();
    });
}

module.exports = exigirAdmin;
