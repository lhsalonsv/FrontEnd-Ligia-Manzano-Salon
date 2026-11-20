/**
 * loginController.js — Ligia Manzano Salón
 * Pantalla de inicio de sesión (index.html).
 */
import { iniciarSesion } from '../services/authService.js';
import { guardarSesion, obtenerSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { PAGINA_INICIO } from '../config.js';

// 1. Si ya hay sesión, no tiene sentido mostrar el login
if (obtenerSesion()?.token) window.location.replace(PAGINA_INICIO);

// 2. Elementos del DOM
const form = document.getElementById('form-login');
const inputUsuario = document.getElementById('nombre-usuario');
const inputContrasena = document.getElementById('contrasena');
const btnEntrar = document.getElementById('btn-entrar');
const btnVer = document.getElementById('btn-ver-contrasena');
const verIcono = document.getElementById('ver-icono');
const verTexto = document.getElementById('ver-texto');
const aviso = document.getElementById('login-aviso');
const avisoMayus = document.getElementById('aviso-mayus');
const cajaContrasena = inputContrasena.closest('.campo-caja');

// 3. Mensajes que llegan por la URL (sesión cerrada por inactividad o expirada)
const MOTIVOS = {
  inactividad: { tipo: 'info', titulo: 'Se cerró la sesión', texto: 'Pasaron 30 minutos sin uso. Vuelve a entrar para continuar.' },
  expirada: { tipo: 'info', titulo: 'La sesión expiró', texto: 'Vuelve a entrar para continuar.' },
};

function mostrarAviso(tipo, titulo, texto) {
  aviso.className = `aviso aviso-${tipo}`;
  aviso.innerHTML = `${icono(tipo === 'error' ? 'alerta' : 'info')}<div><b class="block">${titulo}</b>${texto ?? ''}</div>`;
}

function ocultarAviso() {
  aviso.className = 'aviso hidden';
  aviso.textContent = '';
  cajaContrasena.removeAttribute('aria-invalid');
}

const motivo = MOTIVOS[new URLSearchParams(window.location.search).get('motivo')];
if (motivo) mostrarAviso(motivo.tipo, motivo.titulo, motivo.texto);

// 4. Mostrar / ocultar contraseña
function pintarBotonVer(visible) {
  verIcono.innerHTML = icono(visible ? 'ojoTachado' : 'ojo', 'size-[18px]');
  verTexto.textContent = visible ? 'Ocultar' : 'Mostrar';
  btnVer.setAttribute('aria-pressed', String(visible));
}
btnVer.addEventListener('click', () => {
  const visible = inputContrasena.type === 'password';
  inputContrasena.type = visible ? 'text' : 'password';
  pintarBotonVer(visible);
  inputContrasena.focus();
});
pintarBotonVer(false);

// 5. Aviso de Bloq Mayús
inputContrasena.addEventListener('keyup', (e) => {
  const activo = e.getModifierState?.('CapsLock');
  avisoMayus.classList.toggle('hidden', !activo);
  avisoMayus.classList.toggle('flex', !!activo);
});

// 6. Enviar
function ocupado(si) {
  btnEntrar.disabled = si;
  btnEntrar.textContent = si ? 'Entrando…' : 'Entrar';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  ocultarAviso();

  const nombreUsuario = inputUsuario.value.trim();
  const contrasena = inputContrasena.value;
  if (!nombreUsuario || !contrasena) {
    mostrarAviso('error', 'Faltan datos', 'Escribe tu usuario y tu contraseña.');
    (nombreUsuario ? inputContrasena : inputUsuario).focus();
    return;
  }

  ocupado(true);
  try {
    const sesion = await iniciarSesion(nombreUsuario, contrasena);
    guardarSesion(sesion);
    window.location.replace(PAGINA_INICIO);
  } catch (error) {
    ocupado(false);
    inputContrasena.value = '';
    if (error.estado === 401) {
      const restantes = error.detalle?.intentosRestantes;
      const texto = restantes != null
        ? `Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}. Después, la cuenta se bloquea 15 minutos.`
        : '';
      mostrarAviso('error', 'Usuario o contraseña incorrectos', texto);
      cajaContrasena.setAttribute('aria-invalid', 'true');
      inputContrasena.focus();
    } else if (error.estado === 423) {
      const minutos = error.detalle?.minutosBloqueo ?? 15;
      mostrarAviso('error', 'Cuenta bloqueada', `Por seguridad, espera ${minutos} minutos o pide a la administradora que la desbloquee.`);
    } else {
      mostrarAviso('error', 'No se pudo iniciar sesión', error.message);
    }
  }
});

inputUsuario.focus();
