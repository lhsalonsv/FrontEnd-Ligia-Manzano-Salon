/**
 * authFetch.js — Ligia Manzano Salón
 * Envoltura de fetch para TODOS los servicios:
 *  - antepone API_BASE_URL a la ruta;
 *  - manda el token de Spring Security (Authorization: Bearer ...);
 *  - si el backend responde 401, cierra la sesión;
 *  - si responde 403 CAMBIO_CONTRASENA_REQUERIDO, manda a cambiar la contraseña;
 *  - convierte los errores en ApiError con el mensaje que mande el backend.
 */
import { API_BASE_URL, PAGINA_CAMBIO_CONTRASENA } from '../config.js';
import { obtenerToken, cerrarSesion, actualizarUsuario } from './session.js';

export class ApiError extends Error {
  /** @param {number} estado  @param {string} mensaje  @param {object} [detalle] cuerpo de error del backend */
  constructor(estado, mensaje, detalle) {
    super(mensaje);
    this.name = 'ApiError';
    this.estado = estado;
    this.detalle = detalle ?? null;
  }
}

/**
 * @param {string} ruta  Ruta relativa a la API, p. ej. '/clientes' o `/clientes/${id}`
 * @param {RequestInit & {cuerpo?: any, conSesion?: boolean}} opciones
 *        cuerpo: objeto que se envía como JSON.  conSesion: false para el login.
 */
export async function authFetch(ruta, { cuerpo, conSesion = true, headers, ...opciones } = {}) {
  const cabeceras = { Accept: 'application/json', ...headers };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (conSesion) {
    const token = obtenerToken();
    if (token) cabeceras.Authorization = `Bearer ${token}`;
  }

  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE_URL}${ruta}`, {
      ...opciones,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : opciones.body,
    });
  } catch (error) {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa el internet e intenta de nuevo.', { causa: error.message });
  }

  if (respuesta.status === 401 && conSesion) {
    cerrarSesion('expirada');
    throw new ApiError(401, 'La sesión expiró.');
  }

  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = { mensaje: respuesta.ok ? undefined : `Error ${respuesta.status}`, texto };
  }

  // Contraseña temporal: la API no deja hacer nada más hasta cambiarla
  if (respuesta.status === 403 && datos?.codigo === 'CAMBIO_CONTRASENA_REQUERIDO') {
    actualizarUsuario({ debeCambiarContrasena: true });
    window.location.replace(PAGINA_CAMBIO_CONTRASENA);
  }

  if (!respuesta.ok) {
    // Formato de error acordado con el backend: { "mensaje": "...", ... } (ver docs/contrato-api.md)
    throw new ApiError(respuesta.status, datos?.mensaje ?? `Error ${respuesta.status}`, datos);
  }
  return datos;
}
