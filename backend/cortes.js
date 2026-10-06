// /api/cortes: consulta (GeoJSON EPSG:4326) y CRUD de cortes.
// La geometría la genera el trigger cortes_geometria en la BD; aquí solo
// se validan formatos. Los errores de rango de PK llegan como 23514.
const express = require('express');
const db = require('./db');
const exigirUsuario = require('./middlewareUsuario');
const exigirEditor = require('./middlewareEditor');
const exigirAdmin = require('./middlewareAdmin');

const router = express.Router();

const ESTADOS = ['previsto', 'activo', 'finalizado'];

const EXPRESION_ACTIVO_AHORA =
    "(c.estado <> 'finalizado' AND c.fecha_inicio <= now() AND (c.fecha_fin IS NULL OR c.fecha_fin > now()))";

const SELECT_CORTES =
    'SELECT c.id, c.carretera, ca.nombre AS carretera_nombre, c.sentido, c.eje, c.carriles,' +
    ' c.desplazamiento_m::float8 AS desplazamiento_m,' +
    ' c.pk_inicio::float8 AS pk_inicio, c.pk_fin::float8 AS pk_fin,' +
    ' cortes.pk_a_texto(c.pk_inicio) AS pk_inicio_texto, cortes.pk_a_texto(c.pk_fin) AS pk_fin_texto,' +
    ' c.fecha_inicio, c.fecha_fin, c.tipo, c.motivo, c.estado,' +
    ' ' + EXPRESION_ACTIVO_AHORA + ' AS activo_ahora,' +
    ' c.observaciones, c.origen, c.ref_externa,' +
    ' c.creado_en, uc.email AS creado_por, c.actualizado_en, ua.email AS actualizado_por,' +
    ' ST_AsGeoJSON(ST_Transform(c.geom, 4326), 7)::json AS geometria' +
    ' FROM cortes.cortes c' +
    ' JOIN cortes.carreteras ca ON ca.codigo = c.carretera' +
    ' LEFT JOIN cortes.usuarios uc ON uc.id = c.creado_por' +
    ' LEFT JOIN cortes.usuarios ua ON ua.id = c.actualizado_por';

// ---------------------------------------------------------------------
// Validación (compartida con la importación del Excel)
// ---------------------------------------------------------------------

// Acepta 12.35, "12.350", "12,350" o "12+350" (km + metros). Devuelve km.
function parsearPk(valor) {
    if (valor === null || valor === undefined || valor === '') { return null; }
    if (typeof valor === 'number') { return valor >= 0 ? valor : null; }

    const texto = String(valor).trim();
    const conMas = /^(\d+)\s*\+\s*(\d{1,3}(?:[.,]\d+)?)$/.exec(texto);
    let pk;
    if (conMas) {
        pk = parseInt(conMas[1], 10) + parseFloat(conMas[2].replace(',', '.')) / 1000;
    } else if (/^\d+(?:[.,]\d+)?$/.test(texto)) {
        pk = parseFloat(texto.replace(',', '.'));
    } else {
        return null;
    }
    return Math.round(pk * 1000) / 1000;
}

function parsearFecha(valor) {
    if (valor === null || valor === undefined || valor === '') { return null; }
    const fecha = valor instanceof Date ? valor : new Date(valor);
    return isNaN(fecha.getTime()) ? undefined : fecha;
}

function textoOpcional(valor) {
    if (valor === null || valor === undefined) { return null; }
    const texto = String(valor).trim();
    return texto === '' ? null : texto;
}

// "AP-8" -> "AP8", "gi 20" -> "GI20"
function normalizarCarretera(valor) {
    return String(valor || '').toUpperCase().replace(/[\s-]/g, '');
}

function normalizarCarriles(valor) {
    let lista = valor;
    if (lista === null || lista === undefined || lista === '') { return []; }
    if (!Array.isArray(lista)) { lista = String(lista).split(/[,;]/); }
    return lista
        .map(function (c) { return String(c).trim().toUpperCase(); })
        .filter(function (c) { return c !== ''; });
}

// Devuelve { corte, errores }. corte trae los campos ya normalizados.
function validarCorte(datos) {
    const errores = [];
    const corte = {
        carretera: normalizarCarretera(datos.carretera),
        sentido: Number(datos.sentido),
        carriles: normalizarCarriles(datos.carriles),
        desplazamiento_m: null,
        pk_inicio: parsearPk(datos.pk_inicio),
        pk_fin: parsearPk(datos.pk_fin),
        fecha_inicio: parsearFecha(datos.fecha_inicio),
        fecha_fin: parsearFecha(datos.fecha_fin),
        tipo: textoOpcional(datos.tipo),
        motivo: textoOpcional(datos.motivo),
        estado: textoOpcional(datos.estado) ? String(datos.estado).trim().toLowerCase() : 'previsto',
        observaciones: textoOpcional(datos.observaciones),
        ref_externa: textoOpcional(datos.ref_externa)
    };

    if (!corte.carretera) { errores.push('Falta la carretera'); }
    if (corte.sentido !== 1 && corte.sentido !== 2) { errores.push('El sentido debe ser 1 o 2'); }

    if (corte.pk_inicio === null) { errores.push('PK inicio no válido'); }
    if (corte.pk_fin === null) { errores.push('PK fin no válido'); }
    if (corte.pk_inicio !== null && corte.pk_inicio === corte.pk_fin) {
        errores.push('PK inicio y PK fin no pueden coincidir');
    }

    if (!corte.fecha_inicio) { errores.push('Fecha de inicio obligatoria o no válida'); }
    if (corte.fecha_fin === undefined) { errores.push('Fecha de fin no válida'); }
    if (corte.fecha_inicio && corte.fecha_fin && corte.fecha_fin <= corte.fecha_inicio) {
        errores.push('La fecha de fin debe ser posterior a la de inicio');
    }

    if (ESTADOS.indexOf(corte.estado) === -1) {
        errores.push('Estado no válido (' + ESTADOS.join(', ') + ')');
    }

    if (datos.desplazamiento_m !== null && datos.desplazamiento_m !== undefined && datos.desplazamiento_m !== '') {
        const desplazamiento = Number(String(datos.desplazamiento_m).replace(',', '.'));
        if (isNaN(desplazamiento) || Math.abs(desplazamiento) > 50) {
            errores.push('Desplazamiento lateral no válido');
        } else {
            corte.desplazamiento_m = desplazamiento;
        }
    }

    return { corte: corte, errores: errores };
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function aFeature(fila) {
    const propiedades = Object.assign({}, fila);
    delete propiedades.geometria;
    return { type: 'Feature', id: fila.id, geometry: fila.geometria, properties: propiedades };
}

function idValido(valor) {
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function listaParametro(valor) {
    if (!valor) { return []; }
    return String(valor).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
}

function obtenerCorte(cliente, id) {
    return cliente.query(SELECT_CORTES + ' WHERE c.id = $1', [id])
        .then(function (r) { return r.rows[0] ? aFeature(r.rows[0]) : null; });
}

// ---------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------

// Catálogos para formularios y filtros, con el rango de PK de cada eje.
router.get('/catalogos', exigirUsuario, function (req, res, next) {
    Promise.all([
        db.query('SELECT codigo, nombre FROM cortes.carreteras ORDER BY orden'),
        db.query('SELECT codigo, nombre FROM cortes.carriles ORDER BY orden'),
        db.query('SELECT eje, pk_min::float8 AS pk_min, pk_max::float8 AS pk_max, partes::integer AS partes, tramos FROM cortes.v_ejes_rango ORDER BY eje')
    ])
        .then(function (r) {
            res.json({ carreteras: r[0].rows, carriles: r[1].rows, ejes: r[2].rows, estados: ESTADOS });
        })
        .catch(next);
});

// Filtros: carretera=AP8,AP1 · sentido=1 · estado=previsto,activo ·
// desde/hasta (solape con el periodo del corte) · activos=1 ·
// bbox=minLon,minLat,maxLon,maxLat (EPSG:4326)
router.get('/', exigirUsuario, function (req, res, next) {
    const condiciones = [];
    const parametros = [];

    function anadir(sql, valor) {
        parametros.push(valor);
        condiciones.push(sql.replace('$?', '$' + parametros.length));
    }

    const carreteras = listaParametro(req.query.carretera).map(normalizarCarretera);
    if (carreteras.length) { anadir('c.carretera = ANY($?)', carreteras); }

    if (req.query.sentido === '1' || req.query.sentido === '2') {
        anadir('c.sentido = $?', Number(req.query.sentido));
    }

    const estados = listaParametro(req.query.estado).filter(function (e) { return ESTADOS.indexOf(e) !== -1; });
    if (estados.length) { anadir('c.estado = ANY($?)', estados); }

    const desde = parsearFecha(req.query.desde);
    const hasta = parsearFecha(req.query.hasta);
    if (desde === undefined || hasta === undefined) {
        return res.status(400).json({ error: 'Fecha de filtro no válida' });
    }
    if (desde) { anadir('(c.fecha_fin IS NULL OR c.fecha_fin > $?)', desde); }
    if (hasta) { anadir('c.fecha_inicio < $?', hasta); }

    if (req.query.activos === '1' || req.query.activos === 'true') {
        condiciones.push(EXPRESION_ACTIVO_AHORA);
    }

    if (req.query.bbox) {
        const bbox = String(req.query.bbox).split(',').map(Number);
        if (bbox.length !== 4 || bbox.some(isNaN)) {
            return res.status(400).json({ error: 'bbox no válido (minLon,minLat,maxLon,maxLat)' });
        }
        const n = parametros.length;
        Array.prototype.push.apply(parametros, bbox);
        condiciones.push('c.geom && ST_Transform(ST_MakeEnvelope($' + (n + 1) + ', $' + (n + 2) +
            ', $' + (n + 3) + ', $' + (n + 4) + ', 4326), 25830)');
    }

    const sql = SELECT_CORTES +
        (condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '') +
        ' ORDER BY c.fecha_inicio DESC, c.id DESC';

    db.query(sql, parametros)
        .then(function (r) {
            res.json({ type: 'FeatureCollection', features: r.rows.map(aFeature) });
        })
        .catch(next);
});

router.get('/:id', exigirUsuario, function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }

    obtenerCorte(db, id)
        .then(function (feature) {
            if (!feature) { return res.status(404).json({ error: 'Corte no encontrado' }); }
            res.json(feature);
        })
        .catch(next);
});

router.get('/:id/auditoria', exigirEditor, function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }

    db.query('SELECT * FROM cortes.auditoria_cortes WHERE corte_id = $1 ORDER BY id DESC', [id])
        .then(function (r) { res.json(r.rows); })
        .catch(next);
});

// ---------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------

router.post('/', exigirEditor, function (req, res, next) {
    const validacion = validarCorte(req.body || {});
    if (validacion.errores.length) {
        return res.status(400).json({ error: validacion.errores.join('. '), errores: validacion.errores });
    }
    const c = validacion.corte;

    db.transaccionUsuario(req.usuario.id, 'manual', function (cliente) {
        return cliente.query(
            'INSERT INTO cortes.cortes (carretera, sentido, carriles, desplazamiento_m, pk_inicio, pk_fin,' +
            ' fecha_inicio, fecha_fin, tipo, motivo, estado, observaciones, origen, ref_externa)' +
            " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', $13) RETURNING id",
            [c.carretera, c.sentido, c.carriles, c.desplazamiento_m, c.pk_inicio, c.pk_fin,
                c.fecha_inicio, c.fecha_fin, c.tipo, c.motivo, c.estado, c.observaciones, c.ref_externa]
        ).then(function (r) {
            return obtenerCorte(cliente, r.rows[0].id);
        });
    })
        .then(function (feature) { res.status(201).json(feature); })
        .catch(next);
});

router.put('/:id', exigirEditor, function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }

    const validacion = validarCorte(req.body || {});
    if (validacion.errores.length) {
        return res.status(400).json({ error: validacion.errores.join('. '), errores: validacion.errores });
    }
    const c = validacion.corte;

    db.transaccionUsuario(req.usuario.id, 'manual', function (cliente) {
        return cliente.query(
            'UPDATE cortes.cortes SET carretera = $2, sentido = $3, carriles = $4, desplazamiento_m = $5,' +
            ' pk_inicio = $6, pk_fin = $7, fecha_inicio = $8, fecha_fin = $9, tipo = $10, motivo = $11,' +
            ' estado = $12, observaciones = $13, ref_externa = $14 WHERE id = $1 RETURNING id',
            [id, c.carretera, c.sentido, c.carriles, c.desplazamiento_m, c.pk_inicio, c.pk_fin,
                c.fecha_inicio, c.fecha_fin, c.tipo, c.motivo, c.estado, c.observaciones, c.ref_externa]
        ).then(function (r) {
            return r.rows[0] ? obtenerCorte(cliente, id) : null;
        });
    })
        .then(function (feature) {
            if (!feature) { return res.status(404).json({ error: 'Corte no encontrado' }); }
            res.json(feature);
        })
        .catch(next);
});

// Finalizar: estado 'finalizado' y, si ya había empezado, fecha_fin = ahora
// (salvo que la prevista ya hubiera pasado).
router.post('/:id/finalizar', exigirEditor, function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }

    db.transaccionUsuario(req.usuario.id, 'manual', function (cliente) {
        return cliente.query(
            "UPDATE cortes.cortes SET estado = 'finalizado'," +
            ' fecha_fin = CASE WHEN fecha_inicio < now() THEN least(coalesce(fecha_fin, now()), now()) ELSE fecha_fin END' +
            ' WHERE id = $1 RETURNING id',
            [id]
        ).then(function (r) {
            return r.rows[0] ? obtenerCorte(cliente, id) : null;
        });
    })
        .then(function (feature) {
            if (!feature) { return res.status(404).json({ error: 'Corte no encontrado' }); }
            res.json(feature);
        })
        .catch(next);
});

// Baja definitiva: solo admin (los editores finalizan). Queda en la auditoría.
router.delete('/:id', exigirAdmin, function (req, res, next) {
    const id = idValido(req.params.id);
    if (!id) { return res.status(400).json({ error: 'Identificador no válido' }); }

    db.transaccionUsuario(req.usuario.id, 'manual', function (cliente) {
        return cliente.query('DELETE FROM cortes.cortes WHERE id = $1', [id]);
    })
        .then(function (r) {
            if (r.rowCount === 0) { return res.status(404).json({ error: 'Corte no encontrado' }); }
            res.status(204).end();
        })
        .catch(next);
});

module.exports = {
    router: router,
    validarCorte: validarCorte,
    parsearPk: parsearPk
};
