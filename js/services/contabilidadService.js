/**
 * contabilidadService.js — Ligia Manzano Salón
 * Contabilidad: parámetros (plan de cuentas, ejercicios y períodos, tipos de partida y configuración) partidas contables y reportes.
 * Contrato en docs/contrato-api.md → "Contabilidad: parámetros" y "Contabilidad: partidas" y "Contabilidad: reportes".
 *
 *   GET/POST /api/contabilidad/cuentas · PUT /api/contabilidad/cuentas/{codigo}
 *   GET/POST /api/contabilidad/ejercicios · POST /api/contabilidad/periodos/{anio}/{mes}/cerrar | reabrir
 *   POST /api/contabilidad/ejercicios/{anio}/partida-cierre | cerrar
 *   GET/POST /api/contabilidad/tipos-partida · PUT /api/contabilidad/tipos-partida/{codigo}
 *   GET/PUT  /api/contabilidad/configuracion
 *   GET/POST /api/contabilidad/partidas · GET/PUT/DELETE /api/contabilidad/partidas/{id} · POST /partidas/{id}/aplicar | anular
 *   GET /api/contabilidad/reportes/saldos | mayor | diario
 *   GET/POST /api/contabilidad/contabilizar/{origen}?desde&hasta · POST /api/contabilidad/impuestos/{anio}/{mes}
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { obtenerSesion } from '../utils/session.js';
import { NEGOCIO_PRUEBA } from '../mocks/configuracion.js';
import { resumenF07 } from './librosIvaService.js';
import { CUENTAS_PRUEBA } from '../mocks/cuentasContables.js';
import {
  TIPOS_PARTIDA_PRUEBA, CONFIG_PRUEBA, ejerciciosIniciales, validarCuentaNueva, validarEdicionCuenta,
  crearEjercicio as crearEjercicioPrueba, cerrarPeriodo as cerrarPeriodoPrueba, reabrirPeriodo as reabrirPeriodoPrueba,
  guardarTipoPartida, validarConfiguracion, sembrarPartidas, validarPartida, crearBorrador, editarBorrador, eliminarBorrador,
  aplicarPartida as aplicarPartidaPrueba, anularPartida as anularPartidaPrueba, borradoresPorMes, filtrarPartidas, vistaPartida,
  saldosCuentas, mayorCuenta, libroDiario, generarPartidaCierre as generarPartidaCierrePrueba, cerrarEjercicio as cerrarEjercicioPrueba,
  sembrarPendientes, vistaContabilizar as vistaContabilizarPrueba, contabilizar as contabilizarPrueba, generarImpuestosMes as generarImpuestosMesPrueba,
} from '../mocks/contabilidad.js';

/** Para las pantallas: qué mes se puede cerrar y cuál reabrir (se calcula sobre lo que devuelve GET /ejercicios). */
export { mesPorCerrar, mesPorReabrir, mesesAbiertos, mesAbierto, totalesLineas, resumirLineas, TIPOS_CUENTA } from '../mocks/contabilidad.js';

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
/** fn_generar_partida_cierre: crea el borrador del 31 de diciembre y lo devuelve (con líneas). 409 con el mensaje de la función si no se puede. */
export const generarPartidaCierre = (anio) => (D() ? prueba((p) => reglaPrueba(() => vistaPartida(p, generarPartidaCierrePrueba(p, anio, usuarioPrueba()), true))) : authFetch(`${BASE}/ejercicios/${anio}/partida-cierre`, { method: 'POST' }));
/** fn_cerrar_ejercicio: marca el año CERRADO. @returns {Promise<{idPartidaTraslado:number|null}>} borrador del traslado a ejercicios anteriores (null si no se pudo crear) */
export const cerrarEjercicio = (anio) => (D() ? prueba((p) => reglaPrueba(() => ({ idPartidaTraslado: cerrarEjercicioPrueba(p, anio, usuarioPrueba())?.idPartida ?? null }))) : authFetch(`${BASE}/ejercicios/${anio}/cerrar`, { method: 'POST' }));

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

/**
 * Reportes (solo lectura sobre partidas aplicadas). Todos devuelven el emisor para el encabezado de la hoja.
 * Saldos: ?anio&mes&nivel(0-6) → { emisor, filas } de fn_saldos_cuentas. Con ellos el frontend arma el Resumen, el Balance de comprobación,
 * el Balance General y el Estado de Resultados.
 * @param {{anio:number, mes:number, nivel?:number}} f
 */
export const obtenerSaldos = ({ anio, mes, nivel = 6 }) => (D()
  ? prueba((p) => ({ emisor: emisorPrueba(), filas: saldosCuentas(p.partidas, p.cuentas, Number(anio), Number(mes), Number(nivel)) }))
  : authFetch(`${BASE}/reportes/saldos?${new URLSearchParams({ anio, mes, nivel })}`));
/** Mayor: ?cuenta&desde&hasta → { emisor, cuenta: { codigo, nombre, naturaleza }, filas } de fn_mayor_cuenta (fila 0 = saldo anterior). */
export const obtenerMayor = ({ cuenta, desde, hasta }) => (D()
  ? prueba((p) => reglaPrueba(() => ({ emisor: emisorPrueba(), cuenta: p.cuentas.find((c) => c.codigo === cuenta) ?? null, filas: mayorCuenta(p.partidas, p.cuentas, cuenta, desde, hasta) })))
  : authFetch(`${BASE}/reportes/mayor?${new URLSearchParams({ cuenta, desde, hasta })}`));
/** Diario: ?desde&hasta&tipo → { emisor, partidas: [{ ..., lineas }], totalDebe, totalHaber }. */
export const obtenerDiario = ({ desde, hasta, tipo = '' }) => (D()
  ? prueba((p) => reglaPrueba(() => ({ emisor: emisorPrueba(), ...libroDiario(p.partidas, p.cuentas, p.tipos, desde, hasta, tipo) })))
  : authFetch(`${BASE}/reportes/diario?${new URLSearchParams({ desde, hasta, tipo })}`));

/**
 * Contabilizar (fase 3). `origen`: VENTAS, COMPRAS, PLANILLA o TARJETAS.
 * Vista previa: GET /contabilizar/{origen}?desde&hasta → { lineas: [{ grupo, fecha, tipoDocumento, idDocumento, documento, codigoCuenta, nombreCuenta, falta, monto }] }
 * (monto: + Debe, − Haber; codigoCuenta null con `falta` = qué falta configurar; `grupo` = una partida).
 * @param {{desde:string, hasta:string}} rango
 */
export const vistaContabilizar = (origen, { desde, hasta }) => (D()
  ? prueba((p) => reglaPrueba(() => ({ lineas: vistaContabilizarPrueba(p, origen, desde, hasta) })))
  : authFetch(`${BASE}/contabilizar/${origen}?${new URLSearchParams({ desde, hasta })}`));
/** Crea los borradores del rango. 409 con el texto de la base si falta una cuenta. @returns {Promise<{ids:number[]}>} */
export const contabilizar = (origen, { desde, hasta }) => (D()
  ? prueba((p) => reglaPrueba(() => ({ ids: contabilizarPrueba(p, origen, desde, hasta, usuarioPrueba()) })))
  : authFetch(`${BASE}/contabilizar/${origen}`, { method: 'POST', cuerpo: { desde, hasta } }));
/** Borrador de la liquidación de IVA y el pago a cuenta del mes. 409 si el mes ya tiene una vigente. @returns {Promise<{idPartida:number}>} */
export async function generarImpuestosMes(anio, mes) {
  if (!D()) return authFetch(`${BASE}/impuestos/${anio}/${mes}`, { method: 'POST' });
  const resumen = await resumenF07(`${anio}-${String(mes).padStart(2, '0')}`);
  return prueba((p) => reglaPrueba(() => ({ idPartida: generarImpuestosMesPrueba(p, Number(anio), Number(mes), resumen, usuarioPrueba()) })));
}

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
  if (!estadoPrueba.pendientes) sembrarPendientes(estadoPrueba);
  estadoPrueba.config = { ...CONFIG_PRUEBA, ...estadoPrueba.config }; // campos nuevos de la fase 3 si lo guardado es anterior
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

const emisorPrueba = () => ({ nombre: NEGOCIO_PRUEBA.nombre, nit: NEGOCIO_PRUEBA.nit, nrc: NEGOCIO_PRUEBA.nrc });
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
