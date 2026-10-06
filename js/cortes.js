// Arranque del visor: sesión, carga de cortes, tabla sincronizada con el
// mapa y exportación (Excel, CSV, GeoJSON).

let usuarioActual = null;
let catalogos = null;
let datosCortes = { type: "FeatureCollection", features: [] };
let idCorteSeleccionado = null;
let ordenTabla = { campo: "fecha_inicio", descendente: true };

const MINUTOS_RECARGA = 5;

const COLUMNAS_TABLA = [
    { campo: "id", titulo: "ID" },
    { campo: "carretera_nombre", titulo: "Carretera" },
    { campo: "sentido", titulo: "Sentido" },
    { campo: "carriles", titulo: "Carriles", texto: function (p) { return (p.carriles || []).join(", "); } },
    { campo: "pk_inicio", titulo: "PK inicio", texto: function (p) { return p.pk_inicio_texto; } },
    { campo: "pk_fin", titulo: "PK fin", texto: function (p) { return p.pk_fin_texto; } },
    { campo: "fecha_inicio", titulo: "Inicio", texto: function (p) { return formatearFecha(p.fecha_inicio); } },
    { campo: "fecha_fin", titulo: "Fin", texto: function (p) { return formatearFecha(p.fecha_fin); } },
    { campo: "tipo", titulo: "Tipo" },
    { campo: "motivo", titulo: "Motivo" },
    { campo: "estado", titulo: "Estado" }
];


document.addEventListener("DOMContentLoaded", function () {

    if (!obtenerToken()) {
        window.location.href = "login.html";
        return;
    }

    document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);
    document.getElementById("btnPlegarTabla").addEventListener("click", plegarTabla);
    document.getElementById("btnNuevoCorte").addEventListener("click", function () {
        mostrarFormularioCorte(null);
    });
    document.getElementById("btnExportarExcel").addEventListener("click", exportarExcel);
    document.getElementById("btnExportarCsv").addEventListener("click", exportarCsv);
    document.getElementById("btnExportarGeojson").addEventListener("click", exportarGeojson);

    pintarCabeceraTabla();

    alSeleccionarCorteEnMapa = function (id) {
        seleccionarCorte(id, "mapa");
    };

    peticionApi("/auth/yo")
        .then(function (datos) {
            usuarioActual = datos.usuario;
            mostrarSesion();
            return peticionApi("/cortes/catalogos");
        })
        .then(function (datos) {
            catalogos = datos;
            inicializarFiltros(catalogos, cargarCortes);
            return cargarCortes();
        })
        .then(function () {
            setInterval(cargarCortes, MINUTOS_RECARGA * 60 * 1000);
        })
        .catch(function (error) {
            mostrarEstadoCarga(error.message, true);
        });

});


function puedeEditar() {
    return Boolean(usuarioActual) && (usuarioActual.rol === "editor" || usuarioActual.rol === "admin");
}


function esAdmin() {
    return Boolean(usuarioActual) && usuarioActual.rol === "admin";
}


function mostrarSesion() {

    document.getElementById("textoUsuario").textContent = `${usuarioActual.nombre} · ${usuarioActual.rol}`;
    document.getElementById("enlaceAdmin").classList.toggle("oculto", !esAdmin());
    document.getElementById("bloqueEdicion").classList.toggle("oculto", !puedeEditar());

}


function mostrarEstadoCarga(texto, esError) {

    const elemento = document.getElementById("estadoCarga");
    elemento.textContent = texto;
    elemento.classList.toggle("error", Boolean(esError));

}


// ---------------------------------------------------------------------
// Carga y selección
// ---------------------------------------------------------------------

/**
 * Pide los cortes filtrados a la API y repinta mapa y tabla. Devuelve una
 * promesa para poder encadenar (p. ej. seleccionar tras guardar).
 */
function cargarCortes() {

    const parametros = parametrosFiltro();

    if (parametros === null) {
        aplicarCortes({ type: "FeatureCollection", features: [] });
        mostrarEstadoCarga("Marca al menos una carretera y un estado.");
        return Promise.resolve();
    }

    mostrarEstadoCarga("Cargando…");

    return peticionApi("/cortes" + parametros)
        .then(function (featureCollection) {
            aplicarCortes(featureCollection);
            mostrarEstadoCarga(`Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`);
        })
        .catch(function (error) {
            mostrarEstadoCarga(error.message, true);
        });

}


function aplicarCortes(featureCollection) {

    datosCortes = featureCollection;
    dibujarCortes(datosCortes);

    const seleccionado = buscarCorte(idCorteSeleccionado);

    if (!seleccionado) {
        idCorteSeleccionado = null;
    }

    resaltarCorte(seleccionado);
    pintarTabla();

}


function buscarCorte(id) {

    return datosCortes.features.find(function (feature) {
        return feature.id === id;
    }) || null;

}


/**
 * Selecciona un corte en mapa y tabla y muestra su ficha.
 *
 * @param {number} id
 * @param {string} origen - "mapa" | "tabla" | "ficha": desde la tabla se
 *   encuadra el mapa; desde el mapa se desplaza la tabla hasta la fila.
 * @param {object} [featureAlternativa] - Para mostrar la ficha de un corte
 *   que los filtros actuales no incluyen (p. ej. recién finalizado).
 */
function seleccionarCorte(id, origen, featureAlternativa) {

    const feature = buscarCorte(id) || featureAlternativa || null;

    if (!feature) {
        return;
    }

    idCorteSeleccionado = feature.id;
    resaltarCorte(buscarCorte(id) ? feature : null);
    marcarFilaSeleccionada(origen === "mapa");

    if (origen === "tabla") {
        encuadrarCorte(feature);
    }

    mostrarFichaCorte(feature);

}


// ---------------------------------------------------------------------
// Tabla
// ---------------------------------------------------------------------

function pintarCabeceraTabla() {

    const fila = document.getElementById("cabeceraTablaCortes");

    fila.innerHTML = COLUMNAS_TABLA.map(function (columna) {

        let indicador = "";

        if (columna.campo === ordenTabla.campo) {
            indicador = ordenTabla.descendente ? " ▼" : " ▲";
        }

        return `<th data-campo="${columna.campo}">${columna.titulo}${indicador}</th>`;

    }).join("");

    fila.querySelectorAll("th").forEach(function (celda) {

        celda.addEventListener("click", function () {

            const campo = celda.dataset.campo;

            ordenTabla = {
                campo: campo,
                descendente: ordenTabla.campo === campo ? !ordenTabla.descendente : false
            };

            pintarCabeceraTabla();
            pintarTabla();

        });

    });

}


function compararValores(a, b) {

    if (a === b) {
        return 0;
    }

    // Vacíos siempre al final.
    if (a === null || a === undefined || a === "") {
        return 1;
    }

    if (b === null || b === undefined || b === "") {
        return -1;
    }

    if (typeof a === "number" && typeof b === "number") {
        return a - b;
    }

    return String(a).localeCompare(String(b), "es", { numeric: true });

}


function pintarTabla() {

    const filas = datosCortes.features.slice().sort(function (fa, fb) {

        const resultado = compararValores(fa.properties[ordenTabla.campo], fb.properties[ordenTabla.campo]);
        const vacio = fa.properties[ordenTabla.campo] === null || fb.properties[ordenTabla.campo] === null;

        return ordenTabla.descendente && !vacio ? -resultado : resultado;

    });

    const cuerpo = document.getElementById("cuerpoTablaCortes");

    cuerpo.innerHTML = filas.map(function (feature) {

        const p = feature.properties;

        const celdas = COLUMNAS_TABLA.map(function (columna) {

            if (columna.campo === "estado") {
                return `<td><span class="punto-estado" style="background: ${COLORES_ESTADO[p.estado]}"></span>${escaparHtml(NOMBRES_ESTADO[p.estado] || p.estado)}</td>`;
            }

            const texto = columna.texto ? columna.texto(p) : p[columna.campo];
            return `<td>${escaparHtml(texto)}</td>`;

        }).join("");

        const clases = [];

        if (feature.id === idCorteSeleccionado) {
            clases.push("seleccionada");
        }

        if (!feature.geometry) {
            clases.push("sin-geometria");
        }

        return `<tr data-id="${feature.id}" class="${clases.join(" ")}">${celdas}</tr>`;

    }).join("");

    cuerpo.querySelectorAll("tr").forEach(function (fila) {
        fila.addEventListener("click", function () {
            seleccionarCorte(Number(fila.dataset.id), "tabla");
        });
    });

    document.getElementById("contadorCortes").textContent = filas.length;
    document.getElementById("textoSinCortes").classList.toggle("oculto", filas.length > 0);

}


function marcarFilaSeleccionada(desplazar) {

    document.querySelectorAll("#cuerpoTablaCortes tr").forEach(function (fila) {

        const seleccionada = Number(fila.dataset.id) === idCorteSeleccionado;
        fila.classList.toggle("seleccionada", seleccionada);

        if (seleccionada && desplazar) {
            fila.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }

    });

}


function plegarTabla() {

    const panel = document.getElementById("panelTabla");
    const plegada = panel.classList.toggle("plegada");

    document.getElementById("btnPlegarTabla").textContent = plegada ? "▴" : "▾";

    // Esperar al cambio de alto antes de recalcular el mapa.
    setTimeout(actualizarTamanoMapa, 50);

}


// ---------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------

function filasExportacion() {

    return datosCortes.features.map(function (feature) {

        const p = feature.properties;

        return {
            "ID": p.id,
            "Carretera": p.carretera_nombre,
            "Sentido": p.sentido,
            "Eje": p.eje,
            "Carriles": (p.carriles || []).join(", "),
            "PK inicio": p.pk_inicio_texto,
            "PK fin": p.pk_fin_texto,
            "Longitud (km)": Math.abs(p.pk_fin - p.pk_inicio),
            "Inicio": formatearFecha(p.fecha_inicio),
            "Fin": formatearFecha(p.fecha_fin),
            "Tipo": p.tipo || "",
            "Motivo": p.motivo || "",
            "Estado": NOMBRES_ESTADO[p.estado] || p.estado,
            "Finalizado a mano": p.finalizado_manual ? "Sí" : "No",
            "Observaciones": p.observaciones || "",
            "Origen": p.origen,
            "Ref. externa": p.ref_externa || "",
            "Actualizado": formatearFecha(p.actualizado_en),
            "Actualizado por": p.actualizado_por || ""
        };

    });

}


function nombreArchivoExportacion(extension) {

    const ahora = new Date();
    const dosCifras = function (n) { return String(n).padStart(2, "0"); };

    return `cortes_${ahora.getFullYear()}${dosCifras(ahora.getMonth() + 1)}${dosCifras(ahora.getDate())}` +
        `_${dosCifras(ahora.getHours())}${dosCifras(ahora.getMinutes())}.${extension}`;

}


function descargarArchivo(contenido, tipo, nombre) {

    const blob = new Blob([contenido], { type: tipo });
    const enlace = document.createElement("a");

    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(function () {
        URL.revokeObjectURL(enlace.href);
    }, 1000);

}


function exportarExcel() {

    if (typeof XLSX === "undefined") {
        window.alert("No se ha podido cargar la librería de Excel.");
        return;
    }

    const hoja = XLSX.utils.json_to_sheet(filasExportacion());
    const libro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libro, hoja, "Cortes");
    XLSX.writeFile(libro, nombreArchivoExportacion("xlsx"));

}


// CSV con ";" y BOM para que Excel en español lo abra bien.
function exportarCsv() {

    const filas = filasExportacion();

    if (filas.length === 0) {
        window.alert("No hay cortes que exportar.");
        return;
    }

    const columnas = Object.keys(filas[0]);

    const escaparCsv = function (valor) {
        const texto = typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
        return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const lineas = [columnas.join(";")].concat(filas.map(function (fila) {
        return columnas.map(function (columna) { return escaparCsv(fila[columna]); }).join(";");
    }));

    descargarArchivo("﻿" + lineas.join("\r\n"), "text/csv;charset=utf-8", nombreArchivoExportacion("csv"));

}


function exportarGeojson() {

    descargarArchivo(
        JSON.stringify(datosCortes, null, 2),
        "application/geo+json",
        nombreArchivoExportacion("geojson")
    );

}
