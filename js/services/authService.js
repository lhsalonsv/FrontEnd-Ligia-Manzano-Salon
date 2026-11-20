/**
 * authService.js — Ligia Manzano Salón
 * Inicio y cierre de sesión, y cambio de contraseña.
 *
 * Contrato (docs/contrato-api.md):
 *   POST /api/auth/login   { nombreUsuario, contrasena }
 *     200 → { token, usuario: { idUsuario, nombreUsuario, nombreCompleto, rol, debeCambiarContrasena } }
 *     401 → { mensaje, codigo: 'CREDENCIALES_INVALIDAS' }   (igual para cualquier fallo, también cuenta bloqueada)
 *   POST /api/auth/logout                                    → 204
 *   POST /api/auth/cambiar-contrasena { contrasenaActual, contrasenaNueva } → 204 | 400 con campos
 */
import { DATOS_PRUEBA, CONTRASENA_MINIMA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { obtenerSesion, cerrarSesion } from '../utils/session.js';
import { USUARIOS_PRUEBA, INTENTOS_MAXIMOS } from '../mocks/usuarios.js';

/** @returns {Promise<{token: string, usuario: object}>} */
export async function iniciarSesion(nombreUsuario, contrasena) {
  if (DATOS_PRUEBA.auth) return iniciarSesionPrueba(nombreUsuario, contrasena);

  return authFetch('/auth/login', {
    method: 'POST',
    cuerpo: { nombreUsuario, contrasena },
    conSesion: false,
  });
}

/** Botón "Salir": avisa a la API para que el token deje de servir y vuelve al login. */
export async function salir() {
  if (!DATOS_PRUEBA.auth) {
    // Si falla (sin internet, sesión ya vencida) igual se cierra aquí; la API la vence sola a los 30 min.
    await authFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  }
  cerrarSesion();
}

/** La API revoca todas las sesiones al cambiarla: después hay que volver a entrar. */
export async function cambiarContrasena(contrasenaActual, contrasenaNueva) {
  if (DATOS_PRUEBA.auth) return cambiarPrueba(contrasenaActual, contrasenaNueva);

  return authFetch('/auth/cambiar-contrasena', {
    method: 'POST',
    cuerpo: { contrasenaActual, contrasenaNueva },
  });
}

// --- Datos de prueba ---------------------------------------------------------
const MENSAJE_FALLO = `Usuario o contraseña incorrectos. Después de ${INTENTOS_MAXIMOS} intentos seguidos la cuenta se bloquea 15 minutos.`;
// Las contraseñas cambiadas en prueba se guardan en sessionStorage para que sirvan después de volver al login.
const CLAVE_CAMBIOS = 'lms.prueba.contrasenas';
let fallosPrueba = 0;

const esperar = () => new Promise((r) => setTimeout(r, 400)); // simula la red

function cambiosPrueba() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_CAMBIOS)) ?? {};
  } catch {
    return {};
  }
}

function contrasenaPrueba(u) {
  return cambiosPrueba()[u.nombreUsuario] ?? u.contrasena;
}

async function iniciarSesionPrueba(nombreUsuario, contrasena) {
  await esperar();
  const encontrado = USUARIOS_PRUEBA.find(
    (u) => u.nombreUsuario === nombreUsuario.trim().toLowerCase() && contrasenaPrueba(u) === contrasena,
  );
  // Bloqueada al quinto fallo: responde igual que una contraseña mala, hasta recargar
  // (el backend real la libera a los 15 minutos).
  if (!encontrado || fallosPrueba >= INTENTOS_MAXIMOS) {
    fallosPrueba += 1;
    throw new ApiError(401, MENSAJE_FALLO, { mensaje: MENSAJE_FALLO, codigo: 'CREDENCIALES_INVALIDAS' });
  }
  fallosPrueba = 0;
  const { contrasena: _omitida, ...usuario } = encontrado;
  if (cambiosPrueba()[usuario.nombreUsuario]) usuario.debeCambiarContrasena = false;
  return { token: `prueba.${usuario.idUsuario}.${Date.now()}`, usuario };
}

async function cambiarPrueba(contrasenaActual, contrasenaNueva) {
  await esperar();
  const { nombreUsuario } = obtenerSesion()?.usuario ?? {};
  const u = USUARIOS_PRUEBA.find((x) => x.nombreUsuario === nombreUsuario);
  const campos = {};
  if (!u || contrasenaPrueba(u) !== contrasenaActual) campos.contrasenaActual = 'La contraseña actual no es correcta.';
  if (contrasenaNueva.length < CONTRASENA_MINIMA) campos.contrasenaNueva = `Tiene que tener al menos ${CONTRASENA_MINIMA} caracteres.`;
  else if (contrasenaNueva === contrasenaActual) campos.contrasenaNueva = 'Tiene que ser distinta de la actual.';
  else if (contrasenaNueva.toLowerCase().includes(nombreUsuario)) campos.contrasenaNueva = 'No puede contener tu usuario.';
  if (Object.keys(campos).length) {
    throw new ApiError(400, 'Revisa los datos marcados.', { mensaje: 'Revisa los datos marcados.', campos });
  }
  sessionStorage.setItem(CLAVE_CAMBIOS, JSON.stringify({ ...cambiosPrueba(), [nombreUsuario]: contrasenaNueva }));
  return null;
}
