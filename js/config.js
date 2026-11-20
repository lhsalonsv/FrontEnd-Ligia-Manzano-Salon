/**
 * config.js — Ligia Manzano Salón
 * Único lugar donde vive la URL de la API y los interruptores de datos de prueba.
 */

// Live Server a veces abre en 127.0.0.2, 127.0.0.3...: todo 127.x es esta misma computadora
const esLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.');

/** URL base del backend (Spring Boot). En local apunta al puerto 8080; en producción, a Render. */
export const API_BASE_URL = esLocal
  ? 'http://localhost:8080/api'
  : 'https://ligia-manzano-api.onrender.com/api'; // ← cambiar por la URL real cuando exista el servicio en Render

/**
 * Datos de prueba por servicio.
 * true  = el servicio responde con los datos de js/mocks/ (no llama al backend).
 * false = llama a la API real.
 * Cuando Katherine publique un endpoint, se cambia a false solo ese servicio; los controladores no cambian.
 */
export const DATOS_PRUEBA = {
  auth: true,
  clientes: true,
  catalogos: true,
};

/** Minutos sin uso antes de cerrar la sesión (lo dice la pantalla de login). */
export const MINUTOS_INACTIVIDAD = 30;

/** Página a la que se entra después de iniciar sesión. */
export const PAGINA_INICIO = 'inicio.html';
export const PAGINA_LOGIN = 'index.html';
