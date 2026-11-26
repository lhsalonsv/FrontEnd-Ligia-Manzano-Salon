/**
 * contabilidadService.js — Ligia Manzano Salón
 * Contabilidad: parámetros (plan de cuentas, ejercicios y períodos, tipos de partida y configuración) y partidas contables.
 * Contrato en docs/contrato-api.md → "Contabilidad: parámetros" y "Contabilidad: partidas".
 *
 *   GET/POST /api/contabilidad/cuentas · PUT /api/contabilidad/cuentas/{codigo}
 *   GET/POST /api/contabilidad/ejercicios · POST /api/contabilidad/periodos/{anio}/{mes}/cerrar | reabrir
 *   GET/POST /api/contabilidad/tipos-partida · PUT /api/contabilidad/tipos-partida/{codigo}
 *   GET/PUT  /api/contabilidad/configuracion
 *   GET/POST /api/contabilidad/partidas · GET/PUT/DELETE /api/contabilidad/partidas/{id} · POST /partidas/{id}/aplicar | anular
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { obtenerSesion } from '../utils/session.js';
import { NEGOCIO_PRUEBA } from '../mocks/configuracion.js';
import { CUENTAS_PRUEBA } from '../mocks/cuentasContables.js';
import {
  TIPOS_PARTIDA_PRUEBA, CONFIG_PRUEBA, ejerciciosIniciales, validarCuentaNueva, validarEdicionCuenta,
  crearEjercicio as crearEjercicioPrueba, cerrarPeriodo as cerrarPeriodoPrueba, reabrirPeriodo as reabrirPeriodoPrueba,
  guardarTipoPartida, validarConfiguracion, sembrarPartidas, validarPartida, crearBorrador, editarBorrador, eliminarBorrador,
  aplicarPartida as aplicarPartidaPrueba, anularPartida as anularPartidaPrueba, borradoresPorMes, filtrarPartidas, vistaPartida,
} from '../mocks/contabilidad.js';

/** Para las pantallas: qué mes se puede cerrar y cuál reabrir (se calcula sobre lo que devuelve GET /ejercicios). */
export { mesPorCerrar, mesPorReabrir, mesesAbiertos, mesAbierto, totalesLineas, TIPOS_CUENTA } from '../mocks/contabilidad.js';

export const TAMANO_PAGINA = 50;

const BASE = '/contabilidad';
const D = () => DATOS_PRUEBA.contabilidad;

export const listarCuentas = () => (D() ? prueba((p) => p.cuentas) : authFetch(`${BASE}/cuentas`));
export const crearCuenta = (datos) => (D() ? prueba((p) => crearCuentaPrueba(p, datos)) : authFetch(`${BASE}/cuentas`, { method: 'POST', cuerpo: datos }));
/** @param {{nombre:string, aceptaMovimiento:boolean, activa:boolean}} datos  El código no cambia. */
export const actualizarCuenta = (codigo, datos) => (D() ? prueba((p) => actualizarCuentaPrueba(p, codigo, datos)) : authFetch(`${BASE}/cuentas/${codigo}`, { method: 'PUT', cuerpo: datos }));

export const listarEjercicios = () => (D() ? prueba((p) => p.ejercicios) : authFetch(`${BASE}/ejercicios`));
export const crearEjercicio = (anio) => (D() ? prueba((p) => reglaPrueba(() => crearEjercicioPrueba(p.ejercicios, anio))) : authFetch(`${BASE}/ejercicios`, { method: 'POST', cuerpo: { anio } }));
export const cerrarPeriodo = (anio, mes) => (D() ? prueba((p) => reglaPrueba(() => cerrarPeriodoPrueba(p.ejercicios, anio, mes, borradoresPorMes(p.partidas)))) : authFetch(`${BASE}/periodos/${anio}/${mes}/cerrar`, { method: 'POST' }));
export const reabrirPeriodo = (anio, mes) => (D() ? prueba((p) => reglaPrueba(() => reabrirPeriodoPrueba(p.ejercicios, anio, mes))) : authFetch(`${BASE}/periodos/${anio}/${mes}/reabrir`, { method: 'POST' }));

export const listarTiposPartida = () => (D() ? prueba((p) => p.tipos) : authFetch(`${BASE}/tipos-partida`));
/** @param {{codigo:string, nombre:string, predeterminado:boolean, activo:boolean}} datos @param {boolean} nuevo */
export const guardarTipo = (datos, nuevo) => (D()
  ? prueba((p) => guardarTipoPrueba(p, datos, nuevo))
  : authFetch(nuevo ? `${BASE}/tipos-partida` : `${BASE}/tipos-partida/${datos.codigo}`, { method: nuevo ? 'POST' : 'PUT', cuerpo: datos }));

export const obtenerConfiguracion = () => (D() ? prueba((p) => p.config) : authFetch(`${BASE}/configuracion`));
export const guardarConfiguracion = (datos) => (D() ? prueba((p) => guardarConfiguracionPrueba(p, datos)) : authFetch(`${BASE}/configuracion`, { method: 'PUT', cuerpo: datos }));

/**
 * Partidas. Lista: ?anio&mes&tipo&estado(BORRADOR|APLICADA)&buscar&pagina → { contenido, totalElementos } (sin líneas, con totalDebe/totalHaber).
 * @param {{anio?:number, mes?:number|'', tipo?:string, estado?:string, buscar?:string, pagina?:number}} filtros
 */
export const listarPartidas = ({ pagina = 0, ...filtros } = {}) => {
  if (!D()) return authFetch(`${BASE}/partidas?${new URLSearchParams({ ...filtros, pagina, tamano: TAMANO_PAGINA })}`);
  return prueba((p) => {
    const todas = filtrarPartidas(p.partidas, filtros);
    return { contenido: todas.slice(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA).map((x) => vistaPartida(p, x, false)), totalElementos: todas.length };
  });
};
/** Con líneas y el emisor (para imprimir). */
export const obtenerPartida = (id) => (D() ? prueba((p) => ({ ...vistaPartida(p, encontrar(p, id), true), emisor: { nombre: NEGOCIO_PRUEBA.nombre, nit: NEGOCIO_PRUEBA.nit, nrc: NEGOCIO_PRUEBA.nrc } })) : authFetch(`${BASE}/partidas/${id}`));
/** @param {{fecha:string, codigoTipo:string, concepto:string, lineas:{codigoCuenta:string, concepto?:string, debe:number, haber:number}[]}} datos */
export const crearPartida = (datos) => (D() ? prueba((p) => { conCampos(validarPartida(datos, p.cuentas, p.tipos)); return reglaPrueba(() => vistaPartida(p, crearBorrador(p, datos, usuarioPrueba()), true)); }) : authFetch(`${BASE}/partidas`, { method: 'POST', cuerpo: datos }));
export const actualizarPartida = (id, datos) => (D() ? prueba((p) => { encontrar(p, id); conCampos(validarPartida(datos, p.cuentas, p.tipos)); return reglaPrueba(() => vistaPartida(p, editarBorrador(p, Number(id), datos), true)); }) : authFetch(`${BASE}/partidas/${id}`, { method: 'PUT', cuerpo: datos }));
export const eliminarPartida = (id) => (D() ? prueba((p) => { encontrar(p, id); reglaPrueba(() => eliminarBorrador(p, Number(id))); }) : authFetch(`${BASE}/partidas/${id}`, { method: 'DELETE' }));
/** @returns {Promise<{numero:string}>} */
export const aplicarPartida = (id) => (D() ? prueba((p) => { encontrar(p, id); return reglaPrueba(() => ({ numero: aplicarPartidaPrueba(p, Number(id), usuarioPrueba()) })); }) : authFetch(`${BASE}/partidas/${id}/aplicar`, { method: 'POST' }));
/** Crea la partida inversa ya aplicada y la devuelve. @param {{motivo:string, fecha:string}} datos */
export const anularPartida = (id, datos) => (D() ? prueba((p) => { encontrar(p, id); return reglaPrueba(() => vistaPartida(p, anularPartidaPrueba(p, Number(id), usuarioPrueba(), datos.motivo, datos.fecha), true)); }) : authFetch(`${BASE}/partidas/${id}/anular`, { method: 'POST', cuerpo: datos }));

// --- Datos de prueba (guardados en sessionStorage para que las recargas conserven los cambios) -----------------

const esperar = () => new Promise((r) => setTimeout(r, 150));
const CLAVE_PRUEBA = 'lms.prueba-contabilidad';
let estadoPrueba = null; // { cuentas, ejercicios, tipos, config, partidas }

function leerPrueba() {
  if (estadoPrueba) return estadoPrueba;
  try { estadoPrueba = JSON.parse(sessionStorage.getItem(CLAVE_PRUEBA)); } catch { estadoPrueba = null; }
  estadoPrueba ??= {
    cuentas: CUENTAS_PRUEBA.map((c) => ({ ...c })), ejercicios: ejerciciosIniciales(), tipos: TIPOS_PARTIDA_PRUEBA.map((t) => ({ ...t })),
    config: { ...CONFIG_PRUEBA },
  };
  if (!estadoPrueba.partidas) sembrarPartidas(estadoPrueba); // también si lo guardado es de antes de las partidas
  return estadoPrueba;
}

/** Corre `fn` sobre el estado de prueba, lo guarda y devuelve una copia (la pantalla no toca el estado). */
async function prueba(fn) {
  await esperar();
  const p = leerPrueba();
  const resultado = fn(p);
  try { sessionStorage.setItem(CLAVE_PRUEBA, JSON.stringify(p)); } catch { /* sin almacenamiento: los cambios duran lo que dure la página */ }
  return structuredClone(resultado);
}

const usuarioPrueba = () => obtenerSesion()?.usuario.nombreCompleto ?? 'Sistema';
const encontrar = (p, id) => {
  const x = p.partidas.find((y) => y.idPartida === Number(id));
  if (!x) throw new ApiError(404, 'No se encontró la partida.');
  return x;
};

/** Las reglas de la base lanzan Error: la API las devuelve como 409 con el mensaje de la función. */
function reglaPrueba(fn) {
  try { return fn(); } catch (e) { throw new ApiError(409, e.message, { mensaje: e.message }); }
}

function conCampos(errores, mensaje = 'Revise los campos marcados.') {
  if (Object.keys(errores).length) throw new ApiError(400, mensaje, { mensaje, campos: errores });
}

function crearCuentaPrueba(p, datos) {
  conCampos(validarCuentaNueva(p.cuentas, datos));
  const cuenta = {
    codigo: datos.codigo, nombre: datos.nombre.trim(), tipo: datos.tipo, naturaleza: datos.naturaleza, nivel: datos.nivel,
    codigoPadre: datos.codigoPadre || null, aceptaMovimiento: Boolean(datos.aceptaMovimiento), activa: true,
  };
  p.cuentas.push(cuenta);
  p.cuentas.sort((a, b) => (a.codigo < b.codigo ? -1 : 1)); // por código: la hija queda justo después del padre
  return cuenta;
}

function actualizarCuentaPrueba(p, codigo, datos) {
  const cuenta = p.cuentas.find((c) => c.codigo === codigo);
  if (!cuenta) throw new ApiError(404, 'No se encontró la cuenta.');
  conCampos(validarEdicionCuenta(p.cuentas, codigo, datos));
  Object.assign(cuenta, { nombre: datos.nombre.trim(), aceptaMovimiento: Boolean(datos.aceptaMovimiento), activa: Boolean(datos.activa) });
  return cuenta;
}

function guardarTipoPrueba(p, datos, nuevo) {
  conCampos(guardarTipoPartida(p.tipos, datos, nuevo));
  return p.tipos.find((t) => t.codigo === datos.codigo.trim());
}

function guardarConfiguracionPrueba(p, datos) {
  const config = { ...p.config, ...datos };
  conCampos(validarConfiguracion(config, p.cuentas, p.tipos));
  p.config = config;
  return config;
}
