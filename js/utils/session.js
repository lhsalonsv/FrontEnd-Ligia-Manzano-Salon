/**
 * session.js — Ligia Manzano Salón
 * Guarda y lee la sesión (token + usuario) y la cierra tras un tiempo sin uso.
 *
 * Se usa sessionStorage: la sesión muere al cerrar la pestaña, que es lo esperado en una
 * computadora de caja compartida.
 */
import { MINUTOS_INACTIVIDAD, PAGINA_LOGIN } from '../config.js';

const CLAVE = 'lms.sesion';

/** @param {{token: string, usuario: {idUsuario:number, nombreUsuario:string, nombreCompleto:string, rol:string}}} sesion */
export function guardarSesion(sesion) {
  sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
}

/** @returns {{token: string, usuario: object} | null} */
export function obtenerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE));
  } catch {
    return null;
  }
}

export function obtenerToken() {
  return obtenerSesion()?.token ?? null;
}

/** Cierra la sesión y vuelve al login. `motivo` se muestra en el login (p. ej. 'inactividad'). */
export function cerrarSesion(motivo) {
  sessionStorage.removeItem(CLAVE);
  const destino = motivo ? `${PAGINA_LOGIN}?motivo=${encodeURIComponent(motivo)}` : PAGINA_LOGIN;
  window.location.replace(destino);
}

/** Para páginas internas: si no hay sesión, manda al login. Devuelve la sesión. */
export function exigirSesion() {
  const sesion = obtenerSesion();
  if (!sesion?.token) {
    window.location.replace(PAGINA_LOGIN);
    return null;
  }
  return sesion;
}

/** Cierra la sesión tras MINUTOS_INACTIVIDAD sin teclado, clics ni movimiento. */
export function vigilarInactividad() {
  const limite = MINUTOS_INACTIVIDAD * 60 * 1000;
  let temporizador;
  const reiniciar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cerrarSesion('inactividad'), limite);
  };
  ['click', 'keydown', 'pointermove', 'scroll', 'touchstart'].forEach((evento) =>
    window.addEventListener(evento, reiniciar, { passive: true }),
  );
  reiniciar();
}
