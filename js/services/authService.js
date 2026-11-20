/**
 * authService.js — Ligia Manzano Salón
 * Inicio de sesión contra Spring Security.
 *
 * Contrato (docs/contrato-api.md):
 *   POST /api/auth/login   { nombreUsuario, contrasena }
 *   200 → { token, usuario: { idUsuario, nombreUsuario, nombreCompleto, rol } }
 *   401 → { mensaje, intentosRestantes }
 *   423 → { mensaje, minutosBloqueo }        (cuenta bloqueada)
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
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

// --- Datos de prueba ---------------------------------------------------------
let fallosPrueba = 0;

async function iniciarSesionPrueba(nombreUsuario, contrasena) {
  await new Promise((r) => setTimeout(r, 400)); // simula la red
  // Bloqueada: sigue así hasta recargar la página (el backend real la libera a los 15 minutos)
  if (fallosPrueba >= INTENTOS_MAXIMOS) throw new ApiError(423, 'La cuenta se bloqueó por 15 minutos.', { minutosBloqueo: 15 });
  const encontrado = USUARIOS_PRUEBA.find(
    (u) => u.nombreUsuario === nombreUsuario.trim().toLowerCase() && u.contrasena === contrasena,
  );
  if (!encontrado) {
    fallosPrueba += 1;
    const intentosRestantes = Math.max(INTENTOS_MAXIMOS - fallosPrueba, 0);
    if (intentosRestantes === 0) {
      throw new ApiError(423, 'La cuenta se bloqueó por 15 minutos.', { minutosBloqueo: 15 });
    }
    throw new ApiError(401, 'Usuario o contraseña incorrectos', { intentosRestantes });
  }
  fallosPrueba = 0;
  const { contrasena: _omitida, ...usuario } = encontrado;
  return { token: `prueba.${usuario.idUsuario}.${Date.now()}`, usuario };
}
