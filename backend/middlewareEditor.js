// Exige rol editor o admin (incluye la comprobación de exigirUsuario).
const exigirUsuario = require('./middlewareUsuario');

function exigirEditor(req, res, next) {
    exigirUsuario(req, res, function (err) {
        if (err) { return next(err); }
        if (req.usuario.rol !== 'editor' && req.usuario.rol !== 'admin') {
            return res.status(403).json({ error: 'Se necesita rol de editor' });
        }
        next();
    });
}

module.exports = exigirEditor;
