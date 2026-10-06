// Login y registro (login.html). apiUrl, claveTokenAuth y peticionApi
// se definen en js/config.js

const LONGITUD_MINIMA_PASSWORD = 8;

document.addEventListener('DOMContentLoaded', function () {
    inicializarPestanasAuth();
    inicializarFormularioLogin();
    inicializarFormularioRegistro();
});

function inicializarPestanasAuth() {
    document.getElementById('btnPestanaLogin').addEventListener('click', function () {
        cambiarPestanaAuth('login');
    });

    document.getElementById('btnPestanaRegistro').addEventListener('click', function () {
        cambiarPestanaAuth('registro');
    });
}

function cambiarPestanaAuth(pestana) {
    const esLogin = pestana === 'login';

    document.getElementById('btnPestanaLogin').classList.toggle('activa', esLogin);
    document.getElementById('btnPestanaRegistro').classList.toggle('activa', !esLogin);
    document.getElementById('formularioLogin').classList.toggle('oculto', !esLogin);
    document.getElementById('formularioRegistro').classList.toggle('oculto', esLogin);
}

function inicializarFormularioLogin() {
    document.getElementById('formularioLogin').addEventListener('submit', function (evento) {
        evento.preventDefault();
        iniciarSesion();
    });
}

function inicializarFormularioRegistro() {
    document.getElementById('formularioRegistro').addEventListener('submit', function (evento) {
        evento.preventDefault();
        registrarUsuario();
    });
}

function iniciarSesion() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btnSubmit = document.getElementById('btnSubmitLogin');

    limpiarMensajeAuth('mensajeLogin');

    if (!email || !password) {
        mostrarMensajeAuth('mensajeLogin', 'Introduce correo electrónico y contraseña.', 'error');
        return;
    }

    btnSubmit.disabled = true;

    peticionApi('/auth/login', 'POST', { email: email, password: password })
        .then(function (datos) {
            if (!datos.token) {
                throw new Error('El servidor no ha devuelto un token de acceso.');
            }
            localStorage.setItem(claveTokenAuth, datos.token);
            window.location.href = 'index.html';
        })
        .catch(function (error) {
            mostrarMensajeAuth('mensajeLogin', error.message, 'error');
        })
        .finally(function () {
            btnSubmit.disabled = false;
        });
}

function registrarUsuario() {
    const nombre = document.getElementById('registroNombre').value.trim();
    const email = document.getElementById('registroEmail').value.trim();
    const password = document.getElementById('registroPassword').value;
    const passwordConfirmar = document.getElementById('registroPasswordConfirmar').value;
    const btnSubmit = document.getElementById('btnSubmitRegistro');

    limpiarMensajeAuth('mensajeRegistro');

    if (!nombre || !email || !password || !passwordConfirmar) {
        mostrarMensajeAuth('mensajeRegistro', 'Rellena todos los campos.', 'error');
        return;
    }

    if (password.length < LONGITUD_MINIMA_PASSWORD) {
        mostrarMensajeAuth('mensajeRegistro', 'La contraseña debe tener al menos ' + LONGITUD_MINIMA_PASSWORD + ' caracteres.', 'error');
        return;
    }

    if (password !== passwordConfirmar) {
        mostrarMensajeAuth('mensajeRegistro', 'Las contraseñas no coinciden.', 'error');
        return;
    }

    btnSubmit.disabled = true;

    peticionApi('/auth/registro', 'POST', { nombre: nombre, email: email, password: password })
        .then(function (datos) {
            mostrarMensajeAuth('mensajeRegistro', datos.mensaje || 'Registro recibido, pendiente de aprobación.', 'exito');
            document.getElementById('formularioRegistro').reset();
        })
        .catch(function (error) {
            mostrarMensajeAuth('mensajeRegistro', error.message, 'error');
        })
        .finally(function () {
            btnSubmit.disabled = false;
        });
}

function mostrarMensajeAuth(idMensaje, texto, tipo) {
    const elementoMensaje = document.getElementById(idMensaje);
    elementoMensaje.textContent = texto;
    elementoMensaje.classList.remove('error', 'exito');
    elementoMensaje.classList.add(tipo);
}

function limpiarMensajeAuth(idMensaje) {
    const elementoMensaje = document.getElementById(idMensaje);
    elementoMensaje.textContent = '';
    elementoMensaje.classList.remove('error', 'exito');
}
