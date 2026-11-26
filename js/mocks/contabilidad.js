/**
 * contabilidad.js (mocks) — Ligia Manzano Salón
 * Datos de prueba de Contabilidad: parámetros y las mismas reglas que pone la base (migracion_1.6.sql):
 * fn_cuenta_valida, fn_crear_ejercicio, fn_cerrar_periodo y fn_reabrir_periodo, y las de las partidas (fn_partida_valida,
 * fn_partida_detalle_valida, fn_aplicar_partida y fn_anular_partida). Funciones puras: prueba en npm test.
 * El plan de cuentas está en cuentasContables.js (generado).
 */
import { centavos } from '../utils/calculos.js';

export const TIPOS_CUENTA = {
  ACTIVO: 'Activo', PASIVO: 'Pasivo', CAPITAL: 'Capital', INGRESO: 'Ingreso', COSTO_GASTO: 'Costos y gastos',
  LIQUIDADORA: 'Liquidadora', ORDEN_DEUDORA: 'Orden deudora', ORDEN_ACREEDORA: 'Orden acreedora',
};

export const TIPOS_PARTIDA_PRUEBA = [
  ['CHE', 'Partida de cheques', false], ['COB', 'Partida de cobros', false], ['COM', 'Partida de compras', false],
  ['EGR', 'Partida de egresos', false], ['ING', 'Partida de ingresos', false], ['INV', 'Partida de inventario', false],
  ['PDA', 'Partida de diario', true], ['VTA', 'Partida de ventas', false],
].map(([codigo, nombre, predeterminado]) => ({ codigo, nombre, predeterminado, activo: true }));

/** Cuentas especiales vacías hasta que la contadora las confirme. */
export const CONFIG_PRUEBA = {
  ctaUtilidadEjercicio: null, ctaUtilidadesAnteriores: null, ctaPerdidaEjercicio: null, ctaPerdidasAnteriores: null,
  ctaPerdidasGanancias: null, ctaReservaLegal: null, ctaClientes: null, ctaProveedores: null,
  tipoPartidaVentas: 'ING', tipoPartidaCompras: 'COM', modoVentas: 'DETALLE', modoCompras: 'DETALLE',
};

// --- Cuentas (fn_cuenta_valida + checks de tb_cuentas_contables) --------------

/** Errores por campo de una cuenta nueva ({} si es válida). `d`: { codigo, nombre, tipo, naturaleza, nivel, codigoPadre, aceptaMovimiento }. */
export function validarCuentaNueva(cuentas, d) {
  const e = {};
  const padre = d.codigoPadre ? cuentas.find((c) => c.codigo === d.codigoPadre) : null;
  if (!/^[0-9]{1,12}$/.test(d.codigo)) e.codigo = 'El código son solo números, hasta 12 dígitos.';
  else if (cuentas.some((c) => c.codigo === d.codigo)) e.codigo = 'Ya existe una cuenta con ese código.';
  if (!d.nombre?.trim()) e.nombre = 'Escriba el nombre de la cuenta.';
  else if (d.nombre.trim().length > 150) e.nombre = 'El nombre llega a 150 caracteres.';
  if (d.codigoPadre && !padre) e.codigoPadre = 'No existe esa cuenta padre.';
  else if (padre?.aceptaMovimiento) e.codigoPadre = `La cuenta ${padre.codigo} acepta movimiento: no puede tener subcuentas`;
  else if (padre && !e.codigo && !(d.codigo.length > padre.codigo.length && d.codigo.startsWith(padre.codigo))) e.codigo = `El código debe empezar con ${padre.codigo} y ser más largo.`;
  if (!Number.isInteger(d.nivel) || d.nivel < 0 || d.nivel > 9) e.nivel = 'El nivel va de 0 a 9.';
  else if (!d.codigoPadre !== (d.nivel === 0)) e.nivel = d.codigoPadre ? 'Solo las cuentas sin padre son de nivel 0.' : 'Una cuenta sin padre es de nivel 0.';
  if (!TIPOS_CUENTA[d.tipo]) e.tipo = 'Elija el tipo.';
  if (!['D', 'A'].includes(d.naturaleza)) e.naturaleza = 'Elija la naturaleza.';
  return e;
}

/** Errores de editar una cuenta (el código no cambia): si ya tiene subcuentas no puede aceptar movimiento. */
export function validarEdicionCuenta(cuentas, codigo, { nombre, aceptaMovimiento }) {
  const e = {};
  if (!nombre?.trim()) e.nombre = 'Escriba el nombre de la cuenta.';
  else if (nombre.trim().length > 150) e.nombre = 'El nombre llega a 150 caracteres.';
  if (aceptaMovimiento && cuentas.some((c) => c.codigoPadre === codigo)) e.aceptaMovimiento = `La cuenta ${codigo} tiene subcuentas: no puede aceptar movimiento`;
  return e;
}

// --- Ejercicios y períodos -----------------------------------------------------

const periodo = (mes, estado, cerradoEn = null) => ({ mes, estado, cerradoEn });

/** fn_crear_ejercicio: el año calendario con sus 12 meses abiertos. */
export function crearEjercicio(ejercicios, anio) {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('El año va de 2000 a 2100');
  if (ejercicios.some((x) => x.anio === anio)) throw new Error(`Ya existe el ejercicio ${anio}`);
  const nuevo = { anio, fechaInicio: `${anio}-01-01`, fechaFin: `${anio}-12-31`, estado: 'ABIERTO', periodos: Array.from({ length: 12 }, (_, i) => periodo(i + 1, 'ABIERTO')) };
  ejercicios.push(nuevo);
  ejercicios.sort((a, b) => a.anio - b.anio);
  return nuevo;
}

/** Todos los meses de todos los ejercicios, en orden. */
const meses = (ejercicios) => ejercicios.flatMap((x) => x.periodos.map((p) => ({ anio: x.anio, ...p })));
/** Los meses abiertos, en orden (quedan seguidos: solo se cierra el más antiguo y se reabre el último cerrado). */
export const mesesAbiertos = (ejercicios) => meses(ejercicios).filter((p) => p.estado === 'ABIERTO');
export const mesAbierto = (ejercicios, anio, mes) => ejercicios.find((x) => x.anio === anio)?.periodos.find((p) => p.mes === mes)?.estado === 'ABIERTO';
/** El mes abierto más antiguo (el único que se puede cerrar) o undefined. */
export const mesPorCerrar = (ejercicios) => meses(ejercicios).find((p) => p.estado === 'ABIERTO');
/** El último mes cerrado (el único que se puede reabrir) o undefined. */
export const mesPorReabrir = (ejercicios) => meses(ejercicios).reverse().find((p) => p.estado === 'CERRADO');
const buscarMes = (ejercicios, anio, mes) => ejercicios.find((x) => x.anio === anio)?.periodos.find((p) => p.mes === mes);

/**
 * fn_cerrar_periodo. `borradores`: { 'AAAA-M': cantidad } de partidas en borrador por mes (0 si no está).
 * Lanza Error con el mensaje de la base.
 */
export function cerrarPeriodo(ejercicios, anio, mes, borradores = {}, ahora = new Date().toISOString()) {
  const primero = mesPorCerrar(ejercicios);
  if (!primero || primero.anio !== anio || primero.mes !== mes) throw new Error(`Solo se puede cerrar el mes abierto más antiguo (${primero?.mes}/${primero?.anio})`);
  if (borradores[`${anio}-${mes}`] > 0) throw new Error(`El mes ${mes}/${anio} tiene partidas en borrador: aplíquelas o bórrelas antes de cerrarlo`);
  Object.assign(buscarMes(ejercicios, anio, mes), { estado: 'CERRADO', cerradoEn: ahora });
}

/** fn_reabrir_periodo. Lanza Error con el mensaje de la base. */
export function reabrirPeriodo(ejercicios, anio, mes) {
  const ultimo = mesPorReabrir(ejercicios);
  if (!ultimo || ultimo.anio !== anio || ultimo.mes !== mes) throw new Error(`Solo se puede reabrir el último mes cerrado (${ultimo?.mes}/${ultimo?.anio})`);
  if (ejercicios.find((x) => x.anio === anio).estado === 'CERRADO') throw new Error(`El ejercicio ${anio} está cerrado`);
  Object.assign(buscarMes(ejercicios, anio, mes), { estado: 'ABIERTO', cerradoEn: null });
}

/** 2025 todo cerrado; 2026 con enero a octubre cerrados y noviembre y diciembre abiertos. */
export function ejerciciosIniciales() {
  const ejercicios = [];
  for (const [anio, cerrados, estado] of [[2025, 12, 'CERRADO'], [2026, 10, 'ABIERTO']]) {
    const e = crearEjercicio(ejercicios, anio);
    e.estado = estado;
    for (const p of e.periodos.slice(0, cerrados)) Object.assign(p, { estado: 'CERRADO', cerradoEn: new Date(Date.UTC(anio, p.mes, 5, 15)).toISOString() });
  }
  return ejercicios;
}

// --- Tipos de partida ----------------------------------------------------------

/**
 * Crea (`nuevo`) o actualiza un tipo y deja exactamente un predeterminado. Devuelve errores por campo ({} si quedó guardado).
 * Marcar uno como predeterminado le quita la marca al anterior; no se puede quitar la marca ni desactivar el predeterminado.
 */
export function guardarTipoPartida(tipos, datos, nuevo) {
  const e = {};
  const codigo = String(datos.codigo ?? '').trim();
  const actual = tipos.find((t) => t.codigo === codigo);
  if (!/^[A-Z]{3}$/.test(codigo)) e.codigo = 'Son 3 letras mayúsculas, por ejemplo PDA.';
  else if (nuevo && actual) e.codigo = 'Ya existe un tipo con ese código.';
  else if (!nuevo && !actual) e.codigo = 'No existe ese tipo de partida.';
  const nombre = String(datos.nombre ?? '').trim();
  if (!nombre) e.nombre = 'Escriba el nombre del tipo.';
  else if (nombre.length > 60) e.nombre = 'El nombre llega a 60 caracteres.';
  if (datos.predeterminado && !datos.activo) e.activo = 'El tipo predeterminado no se puede desactivar.';
  if (actual?.predeterminado && !datos.predeterminado) e.predeterminado = 'Debe haber un tipo predeterminado: marque otro como predeterminado.';
  if (Object.keys(e).length) return e;
  if (datos.predeterminado) for (const t of tipos) t.predeterminado = false;
  if (actual) Object.assign(actual, { nombre, predeterminado: Boolean(datos.predeterminado), activo: Boolean(datos.activo) });
  else tipos.push({ codigo, nombre, predeterminado: Boolean(datos.predeterminado), activo: Boolean(datos.activo) });
  tipos.sort((a, b) => (a.codigo < b.codigo ? -1 : 1));
  return e;
}

// --- Configuración ---------------------------------------------------------------

export const CAMPOS_CUENTA_CONFIG = ['ctaUtilidadEjercicio', 'ctaUtilidadesAnteriores', 'ctaPerdidaEjercicio', 'ctaPerdidasAnteriores',
  'ctaPerdidasGanancias', 'ctaReservaLegal', 'ctaClientes', 'ctaProveedores'];

/** Errores por campo de la configuración: cuentas que existan y acepten movimiento, tipos activos, modos válidos. */
export function validarConfiguracion(config, cuentas, tipos) {
  const e = {};
  for (const campo of CAMPOS_CUENTA_CONFIG) {
    if (config[campo] === null || config[campo] === '') continue;
    const c = cuentas.find((x) => x.codigo === config[campo]);
    if (!c) e[campo] = 'No existe esa cuenta.';
    else if (!c.aceptaMovimiento) e[campo] = `La cuenta ${c.codigo} no acepta movimiento.`;
  }
  for (const campo of ['tipoPartidaVentas', 'tipoPartidaCompras']) {
    if (!tipos.some((t) => t.codigo === config[campo] && t.activo)) e[campo] = 'Elija un tipo de partida activo.';
  }
  for (const campo of ['modoVentas', 'modoCompras']) {
    if (!['DETALLE', 'RESUMEN'].includes(config[campo])) e[campo] = 'Elija Detalle o Resumen.';
  }
  return e;
}

// --- Partidas contables (tb_partidas / tb_partida_detalle) ---------------------------
// Una partida del mock: { idPartida, anio, mes, numero, fecha, codigoTipo, concepto, estado, origen, idPartidaAnula, creadoPor,
// creadoEn, aplicadaPor, aplicadaEn, lineas: [{ linea, codigoCuenta, concepto, debe, haber }] }. `p` = { partidas, ejercicios, cuentas, tipos }.
// Las funciones lanzan Error con el mensaje de la base (trigger o función); validarPartida devuelve los errores por campo (400).

const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f;
const dos = (n) => n.toFixed(2);

/** Suma del debe y del haber (a centavos) y su diferencia. */
export function totalesLineas(lineas) {
  const debe = lineas.reduce((a, l) => centavos(a + centavos(l.debe || 0)), 0);
  const haber = lineas.reduce((a, l) => centavos(a + centavos(l.haber || 0)), 0);
  return { debe, haber, diferencia: centavos(debe - haber) };
}

/** Errores por campo de un borrador: { fecha, codigoTipo, concepto, lineas } ({} si es válido). Guardar no exige que cuadre. */
export function validarPartida(datos, cuentas, tipos) {
  const e = {};
  if (!fechaValida(datos.fecha)) e.fecha = 'Elija la fecha de la partida.';
  if (!tipos.some((t) => t.codigo === datos.codigoTipo && t.activo)) e.codigoTipo = 'Elija un tipo de partida activo.';
  const concepto = String(datos.concepto ?? '').trim();
  if (!concepto) e.concepto = 'Escriba el concepto de la partida.';
  else if (concepto.length > 300) e.concepto = 'El concepto llega a 300 caracteres.';
  for (const [i, l] of (datos.lineas ?? []).entries()) {
    const debe = Number(l.debe) || 0, haber = Number(l.haber) || 0;
    const n = `Línea ${i + 1}: `;
    if (!cuentas.some((c) => c.codigo === String(l.codigoCuenta ?? '').trim())) e.lineas ??= `${n}elija una cuenta del plan.`;
    else if (debe < 0 || haber < 0 || (debe > 0) === (haber > 0)) e.lineas ??= `${n}ponga el monto en el debe o en el haber, no en los dos ni en cero.`;
    else if (String(l.concepto ?? '').length > 300) e.lineas ??= `${n}el concepto llega a 300 caracteres.`;
  }
  return e;
}

const exigirMesAbierto = (ejercicios, anio, mes) => {
  if (!mesAbierto(ejercicios, anio, mes)) throw new Error(`El mes ${mes}/${anio} está cerrado o no existe`);
};
const exigirCuentaConMovimiento = (cuentas, codigo) => {
  if (!cuentas.some((c) => c.codigo === codigo && c.aceptaMovimiento && c.activa)) throw new Error(`La cuenta ${codigo} no acepta movimiento o está inactiva`);
};
const buscarPartida = (p, id) => p.partidas.find((x) => x.idPartida === id);
const lineasDe = (lineas) => lineas.map((l, i) => ({ linea: i + 1, codigoCuenta: String(l.codigoCuenta).trim(), concepto: String(l.concepto ?? '').trim() || null, debe: centavos(l.debe || 0), haber: centavos(l.haber || 0) }));

/** Los dos triggers de escritura: mes abierto y cuentas que aceptan movimiento. Luego guarda encabezado y líneas. */
function escribirBorrador(p, existente, datos, usuario, ahora) {
  const anio = Number(datos.fecha.slice(0, 4)), mes = Number(datos.fecha.slice(5, 7));
  exigirMesAbierto(p.ejercicios, anio, mes);
  for (const l of datos.lineas) exigirCuentaConMovimiento(p.cuentas, String(l.codigoCuenta).trim());
  const campos = { anio, mes, fecha: datos.fecha, codigoTipo: datos.codigoTipo, concepto: datos.concepto.trim(), lineas: lineasDe(datos.lineas) };
  if (existente) return Object.assign(existente, campos);
  p.sigId ??= Math.max(0, ...p.partidas.map((x) => x.idPartida)) + 1;
  const nueva = { idPartida: p.sigId++, numero: null, estado: 'BORRADOR', origen: 'MANUAL', idPartidaAnula: null, creadoPor: usuario, creadoEn: ahora, aplicadaPor: null, aplicadaEn: null, ...campos };
  p.partidas.push(nueva);
  return nueva;
}

/** INSERT de un borrador. `datos`: { fecha, codigoTipo, concepto, lineas: [{ codigoCuenta, concepto, debe, haber }] }. */
export const crearBorrador = (p, datos, usuario, ahora = new Date().toISOString()) => escribirBorrador(p, null, datos, usuario, ahora);

/** UPDATE del borrador (reemplaza las líneas). Una APLICADA no se toca (art. 139 del Código Tributario). */
export function editarBorrador(p, id, datos) {
  const x = buscarPartida(p, id);
  if (!x) throw new Error(`La partida ${id} no existe`);
  if (x.estado === 'APLICADA') throw new Error(`La partida ${x.numero} está aplicada: no se modifica (art. 139 del Código Tributario)`);
  return escribirBorrador(p, x, datos);
}

/** DELETE: solo un borrador. */
export function eliminarBorrador(p, id) {
  const x = buscarPartida(p, id);
  if (!x) throw new Error(`La partida ${id} no existe`);
  if (x.estado === 'APLICADA') throw new Error(`La partida ${x.numero} está aplicada: no se borra (art. 139 del Código Tributario). Anúlela con una partida inversa`);
  p.partidas.splice(p.partidas.indexOf(x), 1);
}

/** fn_aplicar_partida: mes abierto, ≥ 2 líneas y debe = haber al centavo; el número es MM + correlativo de 4 dígitos por tipo y mes. Devuelve el número. */
export function aplicarPartida(p, id, usuario, ahora = new Date().toISOString()) {
  const x = buscarPartida(p, id);
  if (!x || x.estado !== 'BORRADOR') throw new Error(`La partida ${id} no existe o ya está aplicada`);
  exigirMesAbierto(p.ejercicios, x.anio, x.mes);
  const { debe, haber } = totalesLineas(x.lineas);
  if (x.lineas.length < 2 || debe !== haber || debe === 0) throw new Error(`La partida no cuadra: debe ${dos(debe)}, haber ${dos(haber)} (${x.lineas.length} líneas)`);
  const siguiente = 1 + Math.max(0, ...p.partidas.filter((y) => y.numero && y.codigoTipo === x.codigoTipo && y.anio === x.anio && y.mes === x.mes).map((y) => Number(y.numero.slice(2))));
  if (siguiente > 9999) throw new Error(`El tipo ${x.codigoTipo} ya tiene 9999 partidas en ${x.mes}/${x.anio}`);
  Object.assign(x, { numero: String(x.mes).padStart(2, '0') + String(siguiente).padStart(4, '0'), estado: 'APLICADA', aplicadaPor: usuario, aplicadaEn: ahora });
  return x.numero;
}

/** fn_anular_partida: crea la inversa (debe y haber cambiados), fechada `fecha` en un mes abierto y ya aplicada. La original no cambia. Devuelve la inversa. */
export function anularPartida(p, id, usuario, motivo, fecha, ahora = new Date().toISOString()) {
  const orig = buscarPartida(p, id);
  if (orig?.estado !== 'APLICADA') throw new Error('Solo se anulan partidas aplicadas; un borrador se borra');
  if (orig.origen === 'ANULACION') throw new Error(`La partida ${orig.numero} ya es una anulación`);
  if (p.partidas.some((y) => y.idPartidaAnula === id)) throw new Error(`La partida ${orig.numero} ya fue anulada`);
  if (!String(motivo ?? '').trim()) throw new Error('Escriba el motivo de la anulación');
  if (!fechaValida(fecha)) throw new Error('Elija la fecha de la anulación');
  const anio = Number(fecha.slice(0, 4)), mes = Number(fecha.slice(5, 7));
  exigirMesAbierto(p.ejercicios, anio, mes);
  for (const l of orig.lineas) exigirCuentaConMovimiento(p.cuentas, l.codigoCuenta);
  p.sigId ??= Math.max(0, ...p.partidas.map((x) => x.idPartida)) + 1;
  const nueva = {
    idPartida: p.sigId++, anio, mes, numero: null, fecha, codigoTipo: orig.codigoTipo, estado: 'BORRADOR', origen: 'ANULACION', idPartidaAnula: id,
    concepto: `Anulación de la partida ${orig.codigoTipo} ${orig.numero}: ${motivo.trim()}`.slice(0, 300), creadoPor: usuario, creadoEn: ahora, aplicadaPor: null, aplicadaEn: null,
    lineas: orig.lineas.map((l) => ({ ...l, debe: l.haber, haber: l.debe })),
  };
  p.partidas.push(nueva);
  try { aplicarPartida(p, nueva.idPartida, usuario, ahora); } catch (e) { p.partidas.pop(); throw e; }
  return nueva;
}

/** { 'AAAA-M': cantidad } de partidas en borrador por mes: lo que mira cerrarPeriodo. */
export function borradoresPorMes(partidas) {
  const r = {};
  for (const x of partidas) if (x.estado === 'BORRADOR') r[`${x.anio}-${x.mes}`] = (r[`${x.anio}-${x.mes}`] ?? 0) + 1;
  return r;
}

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtros del listado (todos opcionales), de la fecha más reciente a la más antigua. `estado`: BORRADOR o APLICADA. */
export function filtrarPartidas(partidas, { anio, mes, tipo, estado, buscar } = {}) {
  const q = sinTildes(buscar).trim();
  return partidas
    .filter((x) => (!anio || x.anio === Number(anio)) && (!mes || x.mes === Number(mes)) && (!tipo || x.codigoTipo === tipo) && (!estado || x.estado === estado)
      && (!q || (x.numero ?? '').includes(q) || sinTildes(x.concepto).includes(q)))
    .sort((a, b) => (a.fecha === b.fecha ? b.idPartida - a.idPartida : a.fecha < b.fecha ? 1 : -1));
}

/** La partida como la devuelve la API: con totales, el enlace a su anulación y los nombres; `conLineas` agrega las líneas. */
export function vistaPartida(p, x, conLineas) {
  const { debe, haber } = totalesLineas(x.lineas);
  const anuladaPor = p.partidas.find((y) => y.idPartidaAnula === x.idPartida);
  const anula = x.idPartidaAnula ? buscarPartida(p, x.idPartidaAnula) : null;
  const { lineas, ...encabezado } = x;
  const vista = { ...encabezado, totalDebe: debe, totalHaber: haber, idPartidaAnuladaPor: anuladaPor?.idPartida ?? null, numeroAnuladaPor: anuladaPor?.numero ?? null, numeroAnula: anula?.numero ?? null };
  if (!conLineas) return vista;
  return { ...vista, nombreTipo: p.tipos.find((t) => t.codigo === x.codigoTipo)?.nombre ?? '',
    lineas: lineas.map((l) => ({ ...l, nombreCuenta: p.cuentas.find((c) => c.codigo === l.codigoCuenta)?.nombre ?? '' })) };
}

/** Siembra noviembre de 2026 con las mismas reglas: 2 días de ventas, una compra anulada, la planilla y un borrador. */
export function sembrarPartidas(p) {
  p.partidas = [];
  const u = 'Mario Pérez';
  const dia = (d) => `2026-11-${d}T18:00:00-06:00`;
  const venta = (fecha, total) => {
    const iva = centavos(total - centavos(total / 1.13));
    const x = crearBorrador(p, { fecha, codigoTipo: 'ING', concepto: `Ventas del día ${fecha.slice(8)}/11/2026`, lineas: [
      { codigoCuenta: '110101', debe: total }, { codigoCuenta: '61010107', concepto: 'Servicios de salón sin IVA', haber: centavos(total - iva) },
      { codigoCuenta: '210702', concepto: 'IVA 13 % de las ventas', haber: iva }] }, u, dia(fecha.slice(8)));
    aplicarPartida(p, x.idPartida, u, dia(fecha.slice(8)));
  };
  venta('2026-11-03', 113);
  venta('2026-11-10', 226);
  const gasto = crearBorrador(p, { fecha: '2026-11-12', codigoTipo: 'PDA', concepto: 'Compra de papelería pagada de caja chica', lineas: [
    { codigoCuenta: '51010201', debe: 25 }, { codigoCuenta: '110102', haber: 25 }] }, u, dia('12'));
  aplicarPartida(p, gasto.idPartida, u, dia('12'));
  anularPartida(p, gasto.idPartida, u, 'Registrada por error: el gasto ya estaba en la partida de compras', '2026-11-13', dia('13'));
  const planilla = crearBorrador(p, { fecha: '2026-11-15', codigoTipo: 'PDA', concepto: 'Provisión de planilla', lineas: [
    { codigoCuenta: '51010101', concepto: 'Sueldos de noviembre', debe: 800 }, { codigoCuenta: '210301', concepto: 'Salarios por pagar', haber: 800 }] }, u, dia('15'));
  aplicarPartida(p, planilla.idPartida, u, dia('15'));
  crearBorrador(p, { fecha: '2026-11-24', codigoTipo: 'ING', concepto: 'Ventas del día 24/11/2026 (falta registrar el IVA)', lineas: [
    { codigoCuenta: '110101', debe: 56.5 }, { codigoCuenta: '61010107', haber: 50 }] }, u, dia('24'));
  sembrarHistorico(p);
}

/**
 * Enero a octubre de 2026 (meses cerrados): la partida de apertura y, de junio a octubre, una venta (ING) y la planilla (PDA) por mes,
 * para que el balance y la gráfica de 6 meses tengan datos. Son datos sembrados: no pasan por la regla del mes abierto, pero cuadran.
 */
function sembrarHistorico(p) {
  const u = 'Mario Pérez';
  const aplicada = (fecha, codigoTipo, concepto, origen, lineas) => {
    const anio = Number(fecha.slice(0, 4)), mes = Number(fecha.slice(5, 7));
    p.sigId ??= Math.max(0, ...p.partidas.map((x) => x.idPartida)) + 1;
    const siguiente = 1 + Math.max(0, ...p.partidas.filter((y) => y.numero && y.codigoTipo === codigoTipo && y.anio === anio && y.mes === mes).map((y) => Number(y.numero.slice(2))));
    const cuando = `${fecha}T18:00:00-06:00`;
    p.partidas.push({ idPartida: p.sigId++, anio, mes, numero: String(mes).padStart(2, '0') + String(siguiente).padStart(4, '0'), fecha, codigoTipo, concepto, estado: 'APLICADA', origen,
      idPartidaAnula: null, creadoPor: u, creadoEn: cuando, aplicadaPor: u, aplicadaEn: cuando, lineas: lineasDe(lineas) });
  };
  aplicada('2026-01-02', 'PDA', 'Apertura del ejercicio 2026', 'APERTURA', [
    { codigoCuenta: '110101', debe: 500 }, { codigoCuenta: '1101030101', debe: 3500 }, { codigoCuenta: '120102', debe: 2400 },
    { codigoCuenta: '120202', haber: 300 }, { codigoCuenta: '21020101', haber: 600 }, { codigoCuenta: '31010101', haber: 2000 },
    { codigoCuenta: '31010102', haber: 1000 }, { codigoCuenta: '32010102', haber: 500 }, { codigoCuenta: '330102', haber: 2000 }]);
  const ventas = [1130, 1243, 1356, 1017, 1469]; // con IVA, de junio a octubre
  const sueldos = [800, 800, 850, 800, 900];
  ventas.forEach((total, i) => {
    const mes = String(i + 6).padStart(2, '0');
    const iva = centavos(total - centavos(total / 1.13));
    aplicada(`2026-${mes}-28`, 'ING', `Ventas del mes ${mes}/2026`, 'MANUAL', [
      { codigoCuenta: '110101', debe: total }, { codigoCuenta: '61010107', concepto: 'Servicios de salón sin IVA', haber: centavos(total - iva) },
      { codigoCuenta: '210702', concepto: 'IVA 13 % de las ventas', haber: iva }]);
    aplicada(`2026-${mes}-15`, 'PDA', `Planilla del mes ${mes}/2026`, 'MANUAL', [
      { codigoCuenta: '51010101', concepto: `Sueldos del mes ${mes}`, debe: sueldos[i] }, { codigoCuenta: '210301', concepto: 'Salarios por pagar', haber: sueldos[i] }]);
  });
}

// --- Cierre del ejercicio (migracion_1.8.sql: fn_generar_partida_cierre y fn_cerrar_ejercicio) --------------------
// `p` = { partidas, ejercicios, cuentas, tipos, config }. Lanzan Error con el mensaje de la base.

const cuentasResultadoConSaldo = (p, anio) => saldosCuentas(p.partidas, p.cuentas, anio, 12)
  .filter((s) => s.aceptaMovimiento && ['INGRESO', 'COSTO_GASTO'].includes(s.tipo) && s.saldoFinal !== 0);
/** La partida de cierre vigente de un año (origen CIERRE y sin anulación), la que sea su estado. */
export const partidaCierre = (partidas, anio) => partidas.find((x) => x.anio === anio && x.origen === 'CIERRE' && !partidas.some((a) => a.idPartidaAnula === x.idPartida));

/**
 * fn_generar_partida_cierre: en BORRADOR al 31 de diciembre, deja en cero cada cuenta de resultado contra Pérdidas y Ganancias
 * y lleva el resultado a la cuenta de utilidad (haber) o de pérdida (debe) del ejercicio. Devuelve la partida.
 */
export function generarPartidaCierre(p, anio, usuario, ahora = new Date().toISOString()) {
  const c = p.config;
  if (!c.ctaPerdidasGanancias || !c.ctaUtilidadEjercicio || !c.ctaPerdidaEjercicio) throw new Error('Configure en Contabilidad > Parámetros las cuentas de Pérdidas y Ganancias, utilidad del ejercicio y pérdida del ejercicio');
  if (partidaCierre(p.partidas, anio)) throw new Error(`El ejercicio ${anio} ya tiene su partida de cierre (bórrela si está en borrador, o anúlela)`);
  if (p.partidas.some((x) => x.anio === anio && x.estado === 'BORRADOR')) throw new Error(`El ejercicio ${anio} tiene partidas en borrador: aplíquelas o bórrelas antes del cierre`);
  const lineas = cuentasResultadoConSaldo(p, anio).map((s) => {
    const alDebe = (s.naturaleza === 'A') === (s.saldoFinal > 0);
    return { codigoCuenta: s.codigo, debe: alDebe ? Math.abs(s.saldoFinal) : 0, haber: alDebe ? 0 : Math.abs(s.saldoFinal) };
  });
  if (!lineas.length) throw new Error(`El ejercicio ${anio} no tiene saldos en cuentas de resultado`);
  const neto = totalesLineas(lineas).diferencia; // ingresos − costos y gastos: positivo = utilidad
  if (neto > 0) {
    lineas.push({ codigoCuenta: c.ctaPerdidasGanancias, concepto: 'Utilidad del ejercicio', haber: neto }, { codigoCuenta: c.ctaPerdidasGanancias, concepto: 'Traslado de la utilidad', debe: neto },
      { codigoCuenta: c.ctaUtilidadEjercicio, concepto: `Utilidad del ejercicio ${anio}`, haber: neto });
  } else if (neto < 0) {
    lineas.push({ codigoCuenta: c.ctaPerdidasGanancias, concepto: 'Pérdida del ejercicio', debe: -neto }, { codigoCuenta: c.ctaPerdidasGanancias, concepto: 'Traslado de la pérdida', haber: -neto },
      { codigoCuenta: c.ctaPerdidaEjercicio, concepto: `Pérdida del ejercicio ${anio}`, debe: -neto });
  }
  const x = crearBorrador(p, { fecha: `${anio}-12-31`, codigoTipo: 'PDA', concepto: `Cierre del ejercicio ${anio}: liquidación de cuentas de resultado`, lineas }, usuario, ahora);
  x.origen = 'CIERRE';
  return x;
}

/**
 * fn_cerrar_ejercicio: marca el año CERRADO y, si enero siguiente está abierto y hay cuenta de ejercicios anteriores, deja en BORRADOR el traslado
 * de la utilidad (o pérdida) del ejercicio. Devuelve la partida del traslado o null si no se pudo crear.
 */
export function cerrarEjercicio(p, anio, usuario, ahora = new Date().toISOString()) {
  const ejercicio = p.ejercicios.find((e) => e.anio === anio);
  if (ejercicio?.estado !== 'ABIERTO') throw new Error(`El ejercicio ${anio} no existe o ya está cerrado`);
  if (ejercicio.periodos.some((m) => m.estado === 'ABIERTO')) throw new Error(`Cierre primero los 12 meses del ejercicio ${anio}`);
  const cierre = partidaCierre(p.partidas, anio);
  if (cierre?.estado !== 'APLICADA') throw new Error(`Falta aplicar la partida de cierre del ejercicio ${anio}`);
  if (cuentasResultadoConSaldo(p, anio).length) throw new Error(`Quedan cuentas de resultado con saldo en el ejercicio ${anio}: revise la partida de cierre`);
  ejercicio.estado = 'CERRADO';
  const c = p.config;
  const suma = (cuenta, a, b) => cierre.lineas.filter((l) => l.codigoCuenta === cuenta).reduce((s, l) => centavos(s + l[a] - l[b]), 0);
  const utilidad = c.ctaUtilidadEjercicio ? suma(c.ctaUtilidadEjercicio, 'haber', 'debe') : 0;
  const perdida = c.ctaPerdidaEjercicio ? suma(c.ctaPerdidaEjercicio, 'debe', 'haber') : 0;
  if (!mesAbierto(p.ejercicios, anio + 1, 1) || !((utilidad > 0 && c.ctaUtilidadesAnteriores) || (perdida > 0 && c.ctaPerdidasAnteriores))) return null;
  const lineas = utilidad > 0
    ? [{ codigoCuenta: c.ctaUtilidadEjercicio, debe: utilidad }, { codigoCuenta: c.ctaUtilidadesAnteriores, haber: utilidad }]
    : [{ codigoCuenta: c.ctaPerdidasAnteriores, debe: perdida }, { codigoCuenta: c.ctaPerdidaEjercicio, haber: perdida }];
  const x = crearBorrador(p, { fecha: `${anio + 1}-01-01`, codigoTipo: 'PDA', concepto: `Traslado del resultado del ejercicio ${anio} a ejercicios anteriores`, lineas }, usuario, ahora);
  x.origen = 'APERTURA';
  return x;
}

// --- Reportes (migracion_1.7.sql: fn_saldos_cuentas, fn_mayor_cuenta y v_libro_diario) -------------------------
// Solo cuentan las partidas APLICADAS (las anulaciones también: están aplicadas).

const TIPOS_ACUMULAN = ['ACTIVO', 'PASIVO', 'CAPITAL', 'ORDEN_DEUDORA', 'ORDEN_ACREEDORA']; // el resto solo desde el 1 de enero
const monto = (n) => centavos(n) || 0; // `|| 0`: evita -0
const firmaNaturaleza = (c, debe, haber) => (c.naturaleza === 'D' ? debe - haber : haber - debe);
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** v_libro_diario: una fila por línea de partida aplicada, en el orden del libro (fecha, tipo, número, línea). */
export function filasLibroDiario(partidas) {
  return partidas.filter((x) => x.estado === 'APLICADA')
    .flatMap((x) => x.lineas.map((l) => ({ idPartida: x.idPartida, numero: x.numero, fecha: x.fecha, codigoTipo: x.codigoTipo, concepto: x.concepto, linea: l.linea,
      codigoCuenta: l.codigoCuenta, conceptoLinea: l.concepto ?? x.concepto, debe: l.debe, haber: l.haber })))
    .sort((a, b) => comparar(a.fecha, b.fecha) || comparar(a.codigoTipo, b.codigoTipo) || comparar(a.numero, b.numero) || a.linea - b.linea);
}

/**
 * fn_saldos_cuentas: saldo inicial, debe y haber del mes y saldo final de cada cuenta de nivel <= `nivel`. Cada cuenta suma las de detalle
 * cuyo código empieza con el suyo; el saldo va según su naturaleza; ingresos, costos y gastos y la liquidadora acumulan solo desde el 1 de enero.
 */
export function saldosCuentas(partidas, cuentas, anio, mes, nivel = 9) {
  const desdeMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const inicioAnio = `${anio}-01-01`;
  const mov = filasLibroDiario(partidas).filter((m) => m.fecha < hasta);
  return cuentas.filter((c) => c.nivel <= nivel).sort((a, b) => comparar(a.codigo, b.codigo)).map((c) => {
    const acumula = TIPOS_ACUMULAN.includes(c.tipo);
    let dIni = 0, hIni = 0, dMes = 0, hMes = 0;
    for (const m of mov) {
      if (!m.codigoCuenta.startsWith(c.codigo)) continue;
      if (m.fecha >= desdeMes) { dMes = centavos(dMes + m.debe); hMes = centavos(hMes + m.haber); }
      else if (acumula || m.fecha >= inicioAnio) { dIni = centavos(dIni + m.debe); hIni = centavos(hIni + m.haber); }
    }
    return { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza, nivel: c.nivel, aceptaMovimiento: c.aceptaMovimiento,
      saldoInicial: monto(firmaNaturaleza(c, dIni, hIni)), debe: dMes, haber: hMes, saldoFinal: monto(firmaNaturaleza(c, dIni + dMes, hIni + hMes)) };
  });
}

/**
 * fn_mayor_cuenta: movimientos de la cuenta (con todas sus subcuentas) entre dos fechas con el saldo corrido en su naturaleza.
 * La fila 0 es el saldo anterior (las cuentas de resultado lo cuentan solo desde el 1 de enero del año de `desde`). Lanza Error como la base.
 */
export function mayorCuenta(partidas, cuentas, codigo, desde, hasta) {
  const c = cuentas.find((x) => x.codigo === codigo);
  if (!c) throw new Error(`La cuenta ${codigo} no existe`);
  if (hasta < desde) throw new Error('La fecha final es anterior a la inicial');
  const inicio = TIPOS_ACUMULAN.includes(c.tipo) ? '' : `${desde.slice(0, 4)}-01-01`;
  const delaCuenta = filasLibroDiario(partidas).filter((m) => m.codigoCuenta.startsWith(codigo));
  let saldo = monto(delaCuenta.filter((m) => m.fecha < desde && m.fecha >= inicio).reduce((s, m) => s + firmaNaturaleza(c, m.debe, m.haber), 0));
  const filas = [{ fila: 0, fecha: null, idPartida: null, numero: null, codigoTipo: null, codigoCuenta: null, concepto: 'Saldo anterior', debe: null, haber: null, saldo }];
  for (const m of delaCuenta.filter((x) => x.fecha >= desde && x.fecha <= hasta)) {
    saldo = centavos(saldo + firmaNaturaleza(c, m.debe, m.haber));
    filas.push({ fila: filas.length, fecha: m.fecha, idPartida: m.idPartida, numero: m.numero, codigoTipo: m.codigoTipo, codigoCuenta: m.codigoCuenta,
      concepto: m.conceptoLinea, debe: m.debe, haber: m.haber, saldo: monto(saldo) });
  }
  return filas;
}

/** Libro diario: las partidas aplicadas entre dos fechas (y de un tipo si se pide) con sus líneas y totales, como las devuelve la API. */
export function libroDiario(partidas, cuentas, tipos, desde, hasta, tipo = '') {
  if (hasta < desde) throw new Error('La fecha final es anterior a la inicial');
  const porId = new Map();
  for (const m of filasLibroDiario(partidas)) {
    if (m.fecha < desde || m.fecha > hasta || (tipo && m.codigoTipo !== tipo)) continue;
    if (!porId.has(m.idPartida)) porId.set(m.idPartida, { idPartida: m.idPartida, numero: m.numero, fecha: m.fecha, codigoTipo: m.codigoTipo,
      tipo: tipos.find((t) => t.codigo === m.codigoTipo)?.nombre ?? '', concepto: m.concepto, lineas: [] });
    porId.get(m.idPartida).lineas.push({ linea: m.linea, codigoCuenta: m.codigoCuenta, nombreCuenta: cuentas.find((c) => c.codigo === m.codigoCuenta)?.nombre ?? '',
      concepto: m.conceptoLinea, debe: m.debe, haber: m.haber });
  }
  const lista = [...porId.values()].map((x) => { const t = totalesLineas(x.lineas); return { ...x, totalDebe: t.debe, totalHaber: t.haber }; });
  const total = totalesLineas(lista.map((x) => ({ debe: x.totalDebe, haber: x.totalHaber })));
  return { partidas: lista, totalDebe: total.debe, totalHaber: total.haber };
}
