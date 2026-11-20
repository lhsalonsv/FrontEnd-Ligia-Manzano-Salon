/**
 * cambiarContrasenaController.js — Ligia Manzano Salón
 * Cambiar la contraseña (cambiar-contrasena.html). Se llega de dos formas:
 *  - obligada: la contraseña es temporal (debeCambiarContrasena), no se puede ir a otra página;
 *  - por gusto: desde el candado de la barra superior.
 * Al terminar, la API cierra todas las sesiones, así que se vuelve al login.
 */
import { cambiarContrasena, salir } from '../services/authService.js';
import { exigirSesion, cerrarSesion, vigilarInactividad } from '../utils/session.js';
import { mostrarErrores } from '../utils/formulario.js';
import { icono } from '../utils/icons.js';
import { escapar } from '../utils/formato.js';
import { CONTRASENA_MINIMA } from '../config.js';

const sesion = exigirSesion();
if (sesion) iniciar(sesion);

function iniciar({ usuario }) {
  const form = document.getElementById('form-cambio');
  const aviso = document.getElementById('cambio-aviso');
  const btnGuardar = document.getElementById('btn-guardar');
  const obligada = !!usuario.debeCambiarContrasena;

  document.getElementById('intro').textContent = obligada
    ? 'Tu contraseña es temporal. Elige una nueva para poder usar el sistema.'
    : `Usuario: ${usuario.nombreUsuario}`;
  document.getElementById('ayuda-contrasenaNueva').textContent =
    `Al menos ${CONTRASENA_MINIMA} caracteres. Una frase corta es fácil de recordar y difícil de adivinar.`;
  // Con contraseña temporal no hay a dónde volver: solo cambiarla o salir
  document.getElementById('btn-volver').classList.toggle('hidden', obligada);
  const btnSalir = document.getElementById('btn-salir');
  btnSalir.classList.toggle('hidden', !obligada);
  btnSalir.addEventListener('click', salir);

  document.getElementById('ver').addEventListener('change', (e) => {
    for (const input of form.querySelectorAll('input[name]')) input.type = e.target.checked ? 'text' : 'password';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    aviso.className = 'aviso hidden';
    const { contrasenaActual, contrasenaNueva, confirmar } = Object.fromEntries(new FormData(form));

    const errores = {};
    if (!contrasenaActual) errores.contrasenaActual = 'Escribe tu contraseña actual.';
    if (contrasenaNueva.length < CONTRASENA_MINIMA) errores.contrasenaNueva = `Tiene que tener al menos ${CONTRASENA_MINIMA} caracteres.`;
    else if (contrasenaNueva === contrasenaActual) errores.contrasenaNueva = 'Tiene que ser distinta de la actual.';
    if (!errores.contrasenaNueva && confirmar !== contrasenaNueva) errores.confirmar = 'No es igual a la contraseña nueva.';
    mostrarErrores(form, errores);
    if (Object.keys(errores).length) return;

    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando…';
    try {
      await cambiarContrasena(contrasenaActual, contrasenaNueva);
      cerrarSesion('contrasena-cambiada');
    } catch (error) {
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Cambiar contraseña';
      if (error.detalle?.campos) {
        mostrarErrores(form, error.detalle.campos);
      } else {
        aviso.className = 'aviso aviso-error';
        aviso.innerHTML = `${icono('alerta')}<div><b class="block">No se pudo cambiar</b>${escapar(error.message)}</div>`;
      }
    }
  });

  form.elements.contrasenaActual.focus();
  vigilarInactividad();
}
