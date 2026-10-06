// Configuración común y acceso al backend de CORTES.
// En producción, nginx hace proxy de /api y /geoserver en el mismo
// subdominio. En modo local (npm run local, http://localhost:4100) el
// backend sirve también el frontend y la API va al mismo origen.
const urlProduccion = 'https://cortes.geospatiallab.xyz';
const esModoLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const apiUrl = (esModoLocal ? location.origin : urlProduccion) + '/api';
const geoserverWmsUrl = urlProduccion + '/geoserver/bidelan/wms';

// Capa WMS de ejes de contexto (solo visual; la segmentación usa la BD).
const capaEjesWmsNombre = 'bidelan:tramos_calibrados_prueba';

// Clave PROPIA de localStorage: no compartir sesión con BIDELAN (bidelanToken).
const claveTokenAuth = 'cortesToken';

const COLORES_ESTADO = {
    previsto: '#e8a317',
    activo: '#d62828',
    finalizado: '#7a858d'
};

const NOMBRES_ESTADO = {
    previsto: 'Previsto',
    activo: 'Activo',
    finalizado: 'Finalizado'
};

const NOMBRES_SENTIDO = {
    1: '1 · Creciente',
    2: '2 · Decreciente'
};


function obtenerToken() {
    return localStorage.getItem(claveTokenAuth);
}


function cerrarSesion() {
    localStorage.removeItem(claveTokenAuth);
    window.location.href = 'login.html';
}


/**
 * Petición al backend con el token de sesión. Devuelve el JSON de la
 * respuesta o lanza un Error con el mensaje del servidor. Un 401 cierra la
 * sesión y lleva al login.
 *
 * @param {string} ruta - Ruta bajo /api (p. ej. "/cortes?estado=activo").
 * @param {string} [metodo="GET"]
 * @param {object} [cuerpo] - Se envía como JSON.
 */
function peticionApi(ruta, metodo, cuerpo) {

    const opciones = {
        method: metodo || 'GET',
        headers: {}
    };

    const token = obtenerToken();

    if (token) {
        opciones.headers.Authorization = 'Bearer ' + token;
    }

    if (cuerpo) {
        opciones.headers['Content-Type'] = 'application/json';
        opciones.body = JSON.stringify(cuerpo);
    }

    return fetch(apiUrl + ruta, opciones)
        .then(function (respuesta) {

            if (respuesta.status === 204) {
                return null;
            }

            return respuesta.json()
                .catch(function () {
                    return {};
                })
                .then(function (datos) {

                    if (respuesta.status === 401 && token) {
                        cerrarSesion();
                    }

                    if (!respuesta.ok) {
                        throw new Error(datos.error || 'No se ha podido completar la operación.');
                    }

                    return datos;
                });
        })
        .catch(function (error) {

            if (error instanceof TypeError) {
                throw new Error('No se ha podido conectar con el servidor.');
            }

            throw error;
        });

}


function escaparHtml(valor) {

    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

}


function formatearFecha(valor) {

    if (!valor) {
        return '';
    }

    return new Date(valor).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

}
