// Ventana emergente: ficha de un corte, formulario de alta/edición e
// historial. Usa usuarioActual, catalogos, datosCortes, cargarCortes y
// seleccionarCorte definidos en cortes.js.

const overlayFicha = document.getElementById("overlayFicha");
const popupFicha = document.getElementById("popupFicha");
const cabeceraFicha = document.getElementById("cabeceraFicha");
const contenidoFicha = document.getElementById("contenidoFicha");
const tituloCabeceraFicha = document.getElementById("tituloCabeceraFicha");

const NOMBRES_CAMPOS_HISTORIAL = {
    carretera: "Carretera", sentido: "Sentido", carriles: "Carriles", desplazamiento_m: "Desplazamiento",
    pk_inicio: "PK inicio", pk_fin: "PK fin", fecha_inicio: "Inicio", fecha_fin: "Fin",
    tipo: "Tipo", motivo: "Motivo", estado: "Estado", observaciones: "Observaciones", ref_externa: "Ref. externa"
};


// ---------------------------------------------------------------------
// Ficha (solo lectura)
// ---------------------------------------------------------------------

function htmlEstado(propiedades) {

    const estado = propiedades.estado;
    let html = `<span class="etiqueta-estado" style="background: ${COLORES_ESTADO[estado]}">${escaparHtml(NOMBRES_ESTADO[estado] || estado)}</span>`;

    if (propiedades.activo_ahora) {
        html += ` <span class="etiqueta-activo-ahora">En vigor ahora</span>`;
    }

    return html;

}


function textoCarriles(carriles) {

    if (!carriles || carriles.length === 0) {
        return "—";
    }

    return carriles.map(function (codigo) {
        const carril = catalogos.carriles.find(function (c) { return c.codigo === codigo; });
        return carril ? carril.nombre : codigo;
    }).join(", ");

}


function mostrarFichaCorte(feature) {

    const p = feature.properties;
    const longitud = Math.abs(p.pk_fin - p.pk_inicio).toFixed(3).replace(".", ",");

    const fila = function (etiqueta, valorHtml) {
        return `<p><b>${etiqueta}:</b> ${valorHtml}</p>`;
    };

    const botones = [`<button type="button" class="btn-ficha" id="btnZoomFicha">🔍 Zoom</button>`];

    if (puedeEditar()) {
        botones.push(`<button type="button" class="btn-ficha btn-principal" id="btnEditarFicha">Editar</button>`);

        if (p.estado !== "finalizado") {
            botones.push(`<button type="button" class="btn-ficha" id="btnFinalizarFicha">Finalizar</button>`);
        }

        botones.push(`<button type="button" class="btn-ficha" id="btnHistorialFicha">Historial</button>`);
    }

    if (esAdmin()) {
        botones.push(`<button type="button" class="btn-ficha btn-peligro" id="btnEliminarFicha">Eliminar</button>`);
    }

    tituloCabeceraFicha.textContent = `Corte #${p.id} · ${p.carretera_nombre}`;
    popupFicha.classList.remove("popup-ancho");

    contenidoFicha.innerHTML = `
        <div class="ficha-panel">
            ${fila("Estado", htmlEstado(p))}
            ${fila("Carretera", `${escaparHtml(p.carretera_nombre)} · sentido ${escaparHtml(NOMBRES_SENTIDO[p.sentido] || p.sentido)}`)}
            ${fila("Carriles", escaparHtml(textoCarriles(p.carriles)))}
            ${fila("PK", `${escaparHtml(p.pk_inicio_texto)} → ${escaparHtml(p.pk_fin_texto)} <span class="texto-ayuda">(${longitud} km)</span>`)}
            ${fila("Inicio", escaparHtml(formatearFecha(p.fecha_inicio)))}
            ${fila("Fin", escaparHtml(formatearFecha(p.fecha_fin)) || "Sin fecha prevista")}
            ${fila("Tipo", escaparHtml(p.tipo) || "—")}
            ${fila("Motivo", escaparHtml(p.motivo) || "—")}
            ${p.observaciones ? fila("Observaciones", escaparHtml(p.observaciones)) : ""}
            ${feature.geometry ? "" : `<p class="mensaje-formulario error">Sin geometría: revisa los PK o la calibración del eje.</p>`}
            <p class="pie-ficha">
                Origen: ${escaparHtml(p.origen)}${p.ref_externa ? " · ref. " + escaparHtml(p.ref_externa) : ""}<br>
                Creado ${escaparHtml(formatearFecha(p.creado_en))}${p.creado_por ? " por " + escaparHtml(p.creado_por) : ""}<br>
                Modificado ${escaparHtml(formatearFecha(p.actualizado_en))}${p.actualizado_por ? " por " + escaparHtml(p.actualizado_por) : ""}
            </p>
            <p class="mensaje-formulario" id="mensajeFicha"></p>
            <div class="acciones-ficha">${botones.join("")}</div>
        </div>
    `;

    document.getElementById("btnZoomFicha").addEventListener("click", function () {
        encuadrarCorte(feature);
    });

    enlazarBoton("btnEditarFicha", function () {
        mostrarFormularioCorte(feature);
    });

    enlazarBoton("btnFinalizarFicha", function () {
        finalizarCorte(feature);
    });

    enlazarBoton("btnHistorialFicha", function () {
        mostrarHistorialCorte(feature);
    });

    enlazarBoton("btnEliminarFicha", function () {
        eliminarCorte(feature);
    });

    mostrarFicha();

}


function enlazarBoton(id, accion) {

    const boton = document.getElementById(id);

    if (boton) {
        boton.addEventListener("click", accion);
    }

}


function mostrarMensajeFicha(idMensaje, texto, tipo) {

    const elemento = document.getElementById(idMensaje);

    if (!elemento) {
        return;
    }

    elemento.textContent = texto;
    elemento.classList.remove("error", "exito");

    if (tipo) {
        elemento.classList.add(tipo);
    }

}


function finalizarCorte(feature) {

    if (!window.confirm(`¿Finalizar el corte #${feature.id}? Si ya había empezado, su fecha de fin pasa a ser ahora.`)) {
        return;
    }

    peticionApi(`/cortes/${feature.id}/finalizar`, "POST")
        .then(function (actualizado) {
            return cargarCortes().then(function () {
                seleccionarCorte(actualizado.id, "ficha", actualizado);
            });
        })
        .catch(function (error) {
            mostrarMensajeFicha("mensajeFicha", error.message, "error");
        });

}


function eliminarCorte(feature) {

    if (!window.confirm(`¿Eliminar definitivamente el corte #${feature.id}? Quedará registrado en la auditoría, pero no se puede deshacer.`)) {
        return;
    }

    peticionApi(`/cortes/${feature.id}`, "DELETE")
        .then(function () {
            ocultarFicha();
            return cargarCortes();
        })
        .catch(function (error) {
            mostrarMensajeFicha("mensajeFicha", error.message, "error");
        });

}


// ---------------------------------------------------------------------
// Historial (auditoría)
// ---------------------------------------------------------------------

function valorHistorial(campo, valor) {

    if (valor === null || valor === undefined || valor === "") {
        return "—";
    }

    if (campo === "fecha_inicio" || campo === "fecha_fin") {
        return formatearFecha(valor);
    }

    if (Array.isArray(valor)) {
        return valor.join(", ");
    }

    return String(valor);

}


function htmlCambios(registro) {

    if (registro.operacion === "INSERT") {
        return "<li>Alta del corte</li>";
    }

    if (registro.operacion === "DELETE") {
        return "<li>Baja del corte</li>";
    }

    const antes = registro.datos_antes || {};
    const despues = registro.datos_despues || {};

    const cambios = Object.keys(NOMBRES_CAMPOS_HISTORIAL).filter(function (campo) {
        return JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo]);
    });

    if (cambios.length === 0) {
        return "<li>Sin cambios de datos</li>";
    }

    return cambios.map(function (campo) {
        return `<li><b>${NOMBRES_CAMPOS_HISTORIAL[campo]}:</b> ${escaparHtml(valorHistorial(campo, antes[campo]))} → ${escaparHtml(valorHistorial(campo, despues[campo]))}</li>`;
    }).join("");

}


function mostrarHistorialCorte(feature) {

    tituloCabeceraFicha.textContent = `Historial · corte #${feature.id}`;
    contenidoFicha.innerHTML = `<p class="texto-ayuda">Cargando…</p>`;

    peticionApi(`/cortes/${feature.id}/auditoria`)
        .then(function (registros) {

            const elementos = registros.map(function (registro) {
                return `
                    <div class="registro-historial">
                        <div class="cabecera-registro">
                            ${escaparHtml(formatearFecha(registro.cuando))} ·
                            ${escaparHtml(registro.usuario_email || "sistema")}
                            ${registro.origen ? "· " + escaparHtml(registro.origen) : ""}
                        </div>
                        <ul>${htmlCambios(registro)}</ul>
                    </div>
                `;
            }).join("");

            contenidoFicha.innerHTML = `
                <div class="ficha-panel">
                    ${elementos || `<p class="texto-ayuda">Sin registros.</p>`}
                    <div class="acciones-ficha">
                        <button type="button" class="btn-ficha" id="btnVolverFicha">← Volver</button>
                    </div>
                </div>
            `;

            document.getElementById("btnVolverFicha").addEventListener("click", function () {
                mostrarFichaCorte(feature);
            });

        })
        .catch(function (error) {
            contenidoFicha.innerHTML = `<p class="mensaje-formulario error">${escaparHtml(error.message)}</p>`;
        });

}


// ---------------------------------------------------------------------
// Formulario de alta / edición
// ---------------------------------------------------------------------

// ISO → valor de <input type="datetime-local"> en hora local.
function aFechaLocalInput(valor) {

    if (!valor) {
        return "";
    }

    const fecha = new Date(valor);
    const dosCifras = function (n) { return String(n).padStart(2, "0"); };

    return `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}` +
        `T${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`;

}


function textoRangoEje(carretera, sentido) {

    const eje = catalogos.ejes.find(function (e) {
        return e.eje === `${carretera}-${sentido}`;
    });

    if (!eje) {
        return `No hay eje calibrado ${carretera}-${sentido}.`;
    }

    // Carreteras calibradas por tramos (GI-20): se listan para ver los huecos.
    if (eje.partes > 1) {
        return `Eje ${eje.eje}: tramos ${eje.tramos}`;
    }

    return `Eje ${eje.eje}: PK ${eje.tramos}`;

}


/**
 * @param {object|null} feature - Corte a editar, o null para un alta.
 */
function mostrarFormularioCorte(feature) {

    const esAlta = !feature;
    const p = esAlta
        ? { carretera: catalogos.carreteras[0].codigo, sentido: 1, carriles: [], estado: "previsto" }
        : feature.properties;

    const opcionesCarretera = catalogos.carreteras.map(function (c) {
        return `<option value="${escaparHtml(c.codigo)}" ${c.codigo === p.carretera ? "selected" : ""}>${escaparHtml(c.nombre)}</option>`;
    }).join("");

    const opcionesSentido = [1, 2].map(function (s) {
        return `<option value="${s}" ${Number(p.sentido) === s ? "selected" : ""}>${NOMBRES_SENTIDO[s]}</option>`;
    }).join("");

    const casillasCarriles = catalogos.carriles.map(function (c) {
        return `
            <label class="casilla-carril">
                <input type="checkbox" name="carriles" value="${escaparHtml(c.codigo)}"
                    ${(p.carriles || []).includes(c.codigo) ? "checked" : ""}>
                ${escaparHtml(c.nombre)}
            </label>
        `;
    }).join("");

    const opcionesEstado = catalogos.estados.map(function (e) {
        return `<option value="${e}" ${e === p.estado ? "selected" : ""}>${NOMBRES_ESTADO[e] || e}</option>`;
    }).join("");

    // Sugerencias de tipo a partir de los ya usados.
    const tiposUsados = Array.from(new Set(datosCortes.features
        .map(function (f) { return f.properties.tipo; })
        .filter(Boolean)));

    tituloCabeceraFicha.textContent = esAlta ? "Nuevo corte" : `Editar corte #${p.id}`;
    popupFicha.classList.add("popup-ancho");

    contenidoFicha.innerHTML = `
        <form id="formularioCorte" class="formulario-corte" novalidate>

            <div class="fila-formulario">
                <label class="campo-formulario">Carretera
                    <select name="carretera">${opcionesCarretera}</select>
                </label>
                <label class="campo-formulario">Sentido
                    <select name="sentido">${opcionesSentido}</select>
                </label>
            </div>

            <div class="fila-formulario">
                <label class="campo-formulario">PK inicio
                    <input type="text" name="pk_inicio" value="${escaparHtml(p.pk_inicio_texto || "")}" placeholder="12+350" required>
                </label>
                <label class="campo-formulario">PK fin
                    <input type="text" name="pk_fin" value="${escaparHtml(p.pk_fin_texto || "")}" placeholder="13+000" required>
                </label>
            </div>
            <p class="texto-ayuda" id="textoRangoEje"></p>

            <div class="campo-formulario">Carriles
                <div class="grupo-carriles">${casillasCarriles}</div>
            </div>

            <div class="fila-formulario">
                <label class="campo-formulario">Inicio
                    <input type="datetime-local" name="fecha_inicio" value="${aFechaLocalInput(p.fecha_inicio)}" required>
                </label>
                <label class="campo-formulario">Fin
                    <input type="datetime-local" name="fecha_fin" value="${aFechaLocalInput(p.fecha_fin)}">
                </label>
            </div>

            <div class="fila-formulario">
                <label class="campo-formulario">Tipo
                    <input type="text" name="tipo" value="${escaparHtml(p.tipo || "")}" list="listaTiposCorte">
                    <datalist id="listaTiposCorte">
                        ${tiposUsados.map(function (t) { return `<option value="${escaparHtml(t)}">`; }).join("")}
                    </datalist>
                </label>
                <label class="campo-formulario">Estado
                    <select name="estado">${opcionesEstado}</select>
                </label>
            </div>

            <label class="campo-formulario">Motivo
                <input type="text" name="motivo" value="${escaparHtml(p.motivo || "")}">
            </label>

            <label class="campo-formulario">Observaciones
                <textarea name="observaciones" rows="3">${escaparHtml(p.observaciones || "")}</textarea>
            </label>

            <details class="opciones-avanzadas" ${p.desplazamiento_m !== null && p.desplazamiento_m !== undefined ? "open" : ""}>
                <summary>Opciones avanzadas</summary>
                <label class="campo-formulario">Distancia a la derecha del eje (m)
                    <input type="number" name="desplazamiento_m" step="0.25"
                        value="${p.desplazamiento_m !== null && p.desplazamiento_m !== undefined ? p.desplazamiento_m : ""}"
                        placeholder="Automático según carriles">
                </label>
                <label class="campo-formulario">Referencia externa
                    <input type="text" name="ref_externa" value="${escaparHtml(p.ref_externa || "")}">
                </label>
            </details>

            <p class="mensaje-formulario" id="mensajeFormulario"></p>

            <div class="acciones-ficha">
                <button type="submit" class="btn-ficha btn-principal" id="btnGuardarCorte">Guardar</button>
                <button type="button" class="btn-ficha" id="btnCancelarCorte">Cancelar</button>
            </div>

        </form>
    `;

    const formulario = document.getElementById("formularioCorte");

    const actualizarRango = function () {
        document.getElementById("textoRangoEje").textContent =
            textoRangoEje(formulario.elements.carretera.value, formulario.elements.sentido.value);
    };

    formulario.elements.carretera.addEventListener("change", actualizarRango);
    formulario.elements.sentido.addEventListener("change", actualizarRango);
    actualizarRango();

    document.getElementById("btnCancelarCorte").addEventListener("click", function () {

        if (esAlta) {
            ocultarFicha();
            return;
        }

        mostrarFichaCorte(feature);

    });

    formulario.addEventListener("submit", function (evento) {
        evento.preventDefault();
        guardarCorte(formulario, esAlta ? null : p.id);
    });

    mostrarFicha();

}


function guardarCorte(formulario, id) {

    const campos = formulario.elements;
    const fechaInicio = campos.fecha_inicio.value;
    const fechaFin = campos.fecha_fin.value;

    mostrarMensajeFicha("mensajeFormulario", "");

    if (!campos.pk_inicio.value.trim() || !campos.pk_fin.value.trim() || !fechaInicio) {
        mostrarMensajeFicha("mensajeFormulario", "PK inicio, PK fin y fecha de inicio son obligatorios.", "error");
        return;
    }

    if (fechaFin && new Date(fechaFin) <= new Date(fechaInicio)) {
        mostrarMensajeFicha("mensajeFormulario", "La fecha de fin debe ser posterior a la de inicio.", "error");
        return;
    }

    const cuerpo = {
        carretera: campos.carretera.value,
        sentido: Number(campos.sentido.value),
        carriles: Array.from(formulario.querySelectorAll('input[name="carriles"]:checked')).map(function (c) {
            return c.value;
        }),
        pk_inicio: campos.pk_inicio.value.trim(),
        pk_fin: campos.pk_fin.value.trim(),
        // datetime-local va en hora local: se envía en ISO (UTC) sin ambigüedad.
        fecha_inicio: new Date(fechaInicio).toISOString(),
        fecha_fin: fechaFin ? new Date(fechaFin).toISOString() : null,
        tipo: campos.tipo.value,
        motivo: campos.motivo.value,
        estado: campos.estado.value,
        observaciones: campos.observaciones.value,
        desplazamiento_m: campos.desplazamiento_m.value === "" ? null : campos.desplazamiento_m.value,
        ref_externa: campos.ref_externa.value
    };

    const btnGuardar = document.getElementById("btnGuardarCorte");
    btnGuardar.disabled = true;

    const peticion = id === null
        ? peticionApi("/cortes", "POST", cuerpo)
        : peticionApi(`/cortes/${id}`, "PUT", cuerpo);

    peticion
        .then(function (guardado) {
            return cargarCortes().then(function () {
                seleccionarCorte(guardado.id, "tabla", guardado);
            });
        })
        .catch(function (error) {
            mostrarMensajeFicha("mensajeFormulario", error.message, "error");
            btnGuardar.disabled = false;
        });

}


// ---------------------------------------------------------------------
// Mostrar / ocultar / arrastrar
// ---------------------------------------------------------------------

function mostrarFicha() {

    popupFicha.style.left = "";
    popupFicha.style.top = "";
    popupFicha.style.transform = "";

    overlayFicha.classList.add("active");

}


function ocultarFicha() {
    overlayFicha.classList.remove("active");
}


function fichaVisible() {
    return overlayFicha.classList.contains("active");
}


document.getElementById("btnCerrarFicha").addEventListener("click", ocultarFicha);

document.addEventListener("keydown", function (evento) {

    if (evento.key === "Escape") {
        ocultarFicha();
    }

});


let arrastrandoFicha = false;
let offsetArrastreX = 0;
let offsetArrastreY = 0;

cabeceraFicha.addEventListener("mousedown", function (evento) {

    if (evento.target.closest(".btn-cerrar-ficha")) {
        return;
    }

    const rect = popupFicha.getBoundingClientRect();

    offsetArrastreX = evento.clientX - rect.left;
    offsetArrastreY = evento.clientY - rect.top;

    popupFicha.style.left = `${rect.left}px`;
    popupFicha.style.top = `${rect.top}px`;
    popupFicha.style.transform = "none";

    arrastrandoFicha = true;
    popupFicha.classList.add("arrastrando");

});

document.addEventListener("mousemove", function (evento) {

    if (!arrastrandoFicha) {
        return;
    }

    popupFicha.style.left = `${evento.clientX - offsetArrastreX}px`;
    popupFicha.style.top = `${evento.clientY - offsetArrastreY}px`;

});

document.addEventListener("mouseup", function () {

    arrastrandoFicha = false;
    popupFicha.classList.remove("arrastrando");

});
