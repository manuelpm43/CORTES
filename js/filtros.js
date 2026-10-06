// Filtros del panel lateral → parámetros de /api/cortes.

// Por defecto no se muestran los finalizados.
const ESTADOS_POR_DEFECTO = ["previsto", "activo"];


/**
 * Construye las casillas de carreteras y estados a partir de los catálogos
 * y llama a alCambiar cada vez que se modifica cualquier filtro.
 */
function inicializarFiltros(catalogos, alCambiar) {

    document.getElementById("filtroCarreteras").innerHTML = catalogos.carreteras.map(function (carretera) {
        return `
            <label class="fila-capa casilla-compacta">
                <input type="checkbox" name="filtroCarretera" value="${escaparHtml(carretera.codigo)}" checked>
                ${escaparHtml(carretera.nombre)}
            </label>
        `;
    }).join("");

    document.getElementById("filtroEstados").innerHTML = catalogos.estados.map(function (estado) {
        return `
            <label class="fila-capa">
                <input type="checkbox" name="filtroEstado" value="${escaparHtml(estado)}"
                    ${ESTADOS_POR_DEFECTO.includes(estado) ? "checked" : ""}>
                <span class="simbolo-capa simbolo-linea" style="border-top-color: ${COLORES_ESTADO[estado]}"></span>
                ${escaparHtml(NOMBRES_ESTADO[estado] || estado)}
            </label>
        `;
    }).join("");

    document.querySelectorAll(
        "#filtroCarreteras input, #filtroEstados input, #filtroSentido, #filtroDesde, #filtroHasta, #filtroActivosAhora"
    ).forEach(function (elemento) {
        elemento.addEventListener("change", alCambiar);
    });

    document.getElementById("btnLimpiarFiltros").addEventListener("click", function () {
        limpiarFiltros();
        alCambiar();
    });

}


function limpiarFiltros() {

    document.querySelectorAll('input[name="filtroCarretera"]').forEach(function (casilla) {
        casilla.checked = true;
    });

    document.querySelectorAll('input[name="filtroEstado"]').forEach(function (casilla) {
        casilla.checked = ESTADOS_POR_DEFECTO.includes(casilla.value);
    });

    document.getElementById("filtroSentido").value = "";
    document.getElementById("filtroDesde").value = "";
    document.getElementById("filtroHasta").value = "";
    document.getElementById("filtroActivosAhora").checked = false;

}


function valoresMarcados(nombre) {

    return Array.from(document.querySelectorAll(`input[name="${nombre}"]:checked`)).map(function (casilla) {
        return casilla.value;
    });

}


/**
 * Query string para /api/cortes, o null si los filtros no pueden devolver
 * nada (ninguna carretera o ningún estado marcado).
 */
function parametrosFiltro() {

    const parametros = new URLSearchParams();

    const carreteras = valoresMarcados("filtroCarretera");
    const estados = valoresMarcados("filtroEstado");

    if (carreteras.length === 0 || estados.length === 0) {
        return null;
    }

    if (carreteras.length < document.querySelectorAll('input[name="filtroCarretera"]').length) {
        parametros.set("carretera", carreteras.join(","));
    }

    parametros.set("estado", estados.join(","));

    const sentido = document.getElementById("filtroSentido").value;

    if (sentido) {
        parametros.set("sentido", sentido);
    }

    // Días completos en hora local: desde las 00:00 del primero hasta las
    // 00:00 del día siguiente al último.
    const desde = document.getElementById("filtroDesde").value;
    const hasta = document.getElementById("filtroHasta").value;

    if (desde) {
        parametros.set("desde", new Date(desde + "T00:00").toISOString());
    }

    if (hasta) {
        const finDia = new Date(hasta + "T00:00");
        finDia.setDate(finDia.getDate() + 1);
        parametros.set("hasta", finDia.toISOString());
    }

    if (document.getElementById("filtroActivosAhora").checked) {
        parametros.set("activos", "1");
    }

    return "?" + parametros.toString();

}
