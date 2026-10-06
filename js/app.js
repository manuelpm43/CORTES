// Mapa API-IDEE: fondos del IGN, ejes de contexto (WMS) y cortes de carril
// (GeoJSON de la API, coloreados por estado).

IDEE.config("backgroundlayers", [
    {
        id: "ortofoto",
        title: "Ortofoto",
        layers: [
            "WMTS*https://www.ign.es/wmts/pnoa-ma?*OI.OrthoimageCoverage*GoogleMapsCompatible*imagen*false*image/jpeg*false*false*true"
        ]
    },
    {
        id: "cartografia",
        title: "Carto",
        layers: [
            "WMTS*https://www.ign.es/wmts/ign-base?*IGNBaseTodo*GoogleMapsCompatible*Callejero*false*image/png*false*false*true"
        ]
    },
    {
        id: "hibrido",
        title: "Híbrido",
        layers: [
            "WMTS*https://www.ign.es/wmts/pnoa-ma?*OI.OrthoimageCoverage*GoogleMapsCompatible*imagen*true*image/jpeg*false*false*true",
            "WMTS*https://www.ign.es/wmts/ign-base?*IGNBaseOrto*GoogleMapsCompatible*Callejero*true*image/png*false*false*true"
        ]
    }
]);

const mapa = IDEE.map({
    container: "mapa",
    controls: ["panzoom", "scale*true", "scaleline", "rotate", "location", "backgroundlayers"],
    zoom: 10,
    center: [-233766, 5343000]
});

// Gipuzkoa (lon/lat): encuadre inicial de las cuatro carreteras.
const EXTENSION_INICIAL = [-2.62, 42.98, -1.72, 43.40];

mapa.setBbox(extensionAMercator(EXTENSION_INICIAL));


// Ejes de carretera (contexto). Se añade antes que los cortes para quedar
// debajo. En modo local no se pide: GeoServer está en el dominio de
// producción, que el filtro corporativo bloquea.
const capaEjes = esModoLocal ? null : new IDEE.layer.WMS({
    url: geoserverWmsUrl,
    name: capaEjesWmsNombre,
    legend: "Ejes de carretera",
    useCapabilities: false
}, {
    crossOrigin: null
});

if (capaEjes) {
    mapa.addLayers(capaEjes);
} else {
    document.getElementById("checkEjes").closest(".fila-capa").classList.add("oculto");
}


// Capas de cortes y de selección resaltada: se crean una vez y se les
// cambian los datos con setSource (recrearlas deja en mal estado el
// gestor de selección de API-IDEE).
// setSource descarta el estilo y carga en diferido: el estilo (un objeto
// nuevo) se vuelve a aplicar cuando la capa avisa de que ha cargado.
const COLECCION_VACIA = { type: "FeatureCollection", features: [] };

function crearEstiloCortes() {

    const estilosPorEstado = {};

    Object.keys(COLORES_ESTADO).forEach(function (estado) {
        estilosPorEstado[estado] = new IDEE.style.Line({
            stroke: { color: COLORES_ESTADO[estado], width: 6, linecap: "round" }
        });
    });

    return new IDEE.style.Category("estado", estilosPorEstado);

}

function crearEstiloSeleccion() {

    return new IDEE.style.Line({
        stroke: { color: "rgba(0, 229, 255, 0.8)", width: 16, linecap: "round" }
    });

}

// La selección va debajo de los cortes, como un halo.
const capaSeleccion = new IDEE.layer.GeoJSON({
    name: "seleccion",
    legend: "Corte seleccionado",
    source: COLECCION_VACIA,
    extract: false
});
mapa.addLayers(capaSeleccion);
capaSeleccion.setStyle(crearEstiloSeleccion());
capaSeleccion.setZIndex(900);

const capaCortes = new IDEE.layer.GeoJSON({
    name: "cortes",
    legend: "Cortes de carril",
    source: COLECCION_VACIA,
    extract: false
});
mapa.addLayers(capaCortes);
capaCortes.setStyle(crearEstiloCortes());
capaCortes.setZIndex(1000);

// Lo fija cortes.js: recibe el id del corte pinchado en el mapa.
let alSeleccionarCorteEnMapa = null;

capaCortes.on(IDEE.evt.SELECT_FEATURES, function (featuresPinchadas) {

    if (alSeleccionarCorteEnMapa && featuresPinchadas && featuresPinchadas.length > 0) {
        alSeleccionarCorteEnMapa(featuresPinchadas[0].getAttributes().id);
    }

});


/**
 * Sustituye los cortes dibujados.
 *
 * @param {object} featureCollection - GeoJSON EPSG:4326 devuelto por /api/cortes.
 */
function dibujarCortes(featureCollection) {

    cambiarDatosCapa(capaCortes, {
        type: "FeatureCollection",
        features: featureCollection.features.filter(function (feature) {
            return feature.geometry;
        })
    }, crearEstiloCortes);

}


/**
 * Resalta un corte (o quita el resaltado si feature es null).
 */
function resaltarCorte(feature) {

    cambiarDatosCapa(capaSeleccion, feature && feature.geometry
        ? { type: "FeatureCollection", features: [feature] }
        : COLECCION_VACIA, crearEstiloSeleccion);

}


function cambiarDatosCapa(capa, featureCollection, crearEstilo) {

    capa.once(IDEE.evt.LOAD, function () {
        capa.setStyle(crearEstilo());
    });

    capa.setSource(featureCollection);

}


/**
 * Encuadra el mapa en la geometría de un corte (GeoJSON EPSG:4326).
 */
function encuadrarCorte(feature) {

    if (!feature || !feature.geometry) {
        return;
    }

    const lineas = feature.geometry.type === "MultiLineString"
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];

    const lon = [];
    const lat = [];

    lineas.forEach(function (linea) {
        linea.forEach(function (punto) {
            lon.push(punto[0]);
            lat.push(punto[1]);
        });
    });

    const bbox = extensionAMercator([
        Math.min.apply(null, lon), Math.min.apply(null, lat),
        Math.max.apply(null, lon), Math.max.apply(null, lat)
    ]);

    // Margen del 30 % (y al menos 300 m) para ver el entorno.
    const margen = Math.max((bbox[2] - bbox[0]) * 0.3, (bbox[3] - bbox[1]) * 0.3, 300);

    mapa.setBbox([bbox[0] - margen, bbox[1] - margen, bbox[2] + margen, bbox[3] + margen]);

}


function aMercator(lon, lat) {

    const radio = 6378137;
    const x = radio * lon * Math.PI / 180;
    const y = radio * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));

    return [x, y];

}


function extensionAMercator(extension) {

    const minimo = aMercator(extension[0], extension[1]);
    const maximo = aMercator(extension[2], extension[3]);

    return [minimo[0], minimo[1], maximo[0], maximo[1]];

}


/**
 * Activa o desactiva una capa API-IDEE.
 */
function cambiarVisibilidadCapa(capa, visible) {

    const capaOpenLayers = capa.getImpl().getOL3Layer();

    if (capaOpenLayers) {
        capaOpenLayers.setVisible(visible);
    }

}


/**
 * Recalcula el tamaño del mapa tras cambiar el alto de su contenedor
 * (al plegar o desplegar la tabla).
 */
function actualizarTamanoMapa() {

    const mapaOpenLayers = typeof mapa.getMapImpl === "function" ? mapa.getMapImpl() : null;

    if (mapaOpenLayers && typeof mapaOpenLayers.updateSize === "function") {
        mapaOpenLayers.updateSize();
    }

}


document.getElementById("checkCortes").addEventListener("change", function (evento) {
    cambiarVisibilidadCapa(capaCortes, evento.target.checked);
    cambiarVisibilidadCapa(capaSeleccion, evento.target.checked);
});

document.getElementById("checkEjes").addEventListener("change", function (evento) {
    if (capaEjes) {
        cambiarVisibilidadCapa(capaEjes, evento.target.checked);
    }
});
