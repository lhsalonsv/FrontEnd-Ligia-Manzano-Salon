/**
 * reportesContables.js — Ligia Manzano Salón
 * Los reportes de Contabilidad como tablas: la pantalla (reportes-contables.html), la hoja (reportes-contables-imprimir.html) y el Excel
 * salen del mismo modelo. Sin DOM. Los datos vienen de /reportes/saldos, /mayor y /diario (contabilidadService.js). Prueba: npm test
 *
 * Modelo: { columnas: [{ h, num?, sangria? }], filas: [{ v: [...], tipo, nivel? }], totales?: [...] }
 *   v: texto, número (dinero), null (celda vacía) o { t, href } (texto con enlace en pantalla).
 *   tipo: 'normal', 'grupo' (agrupadora, en negrita), 'enc' (encabezado de partida o de sección) o 'total'.
 */
import { centavos } from './calculos.js';
import { MESES } from './formato.js';
import { fechaDMY } from './hojas.js';

export const nombreMes = (anio, mes) => `${MESES[mes - 1]} de ${anio}`;
const suma = (nums) => nums.reduce((a, n) => centavos(a + n), 0);
const o = (n) => n || null; // el cero queda en blanco

/** Último día del mes: 'AAAA-MM-DD'. */
export const ultimoDia = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;

// --- Resumen --------------------------------------------------------------------------------

/** Del balance de comprobación de nivel 0 de un mes: ingresos y costos y gastos del mes y del año hasta ese mes, y la utilidad. */
export function resultadoMes(filas) {
  const raiz = (tipo) => filas.filter((f) => f.nivel === 0 && f.tipo === tipo);
  const mes = (fs) => suma(fs.map((f) => (f.naturaleza === 'D' ? f.debe - f.haber : f.haber - f.debe)));
  const acum = (fs) => suma(fs.map((f) => f.saldoFinal));
  const [ing, cg] = [raiz('INGRESO'), raiz('COSTO_GASTO')];
  return { ingresos: mes(ing), costos: mes(cg), utilidad: centavos(mes(ing) - mes(cg)),
    ingresosAcum: acum(ing), costosAcum: acum(cg), utilidadAcum: centavos(acum(ing) - acum(cg)) };
}

/** Los 6 meses que terminan en (anio, mes), del más antiguo al más reciente. */
export function ultimosMeses(anio, mes, cuantos = 6) {
  return Array.from({ length: cuantos }, (_, i) => {
    const n = anio * 12 + (mes - 1) - (cuantos - 1 - i);
    return { anio: Math.floor(n / 12), mes: (n % 12) + 1 };
  });
}

export function modeloResumen(meses /* [{ anio, mes, ...resultadoMes }] */) {
  return { columnas: [{ h: 'Mes' }, { h: 'Ingresos', num: true }, { h: 'Costos y gastos', num: true }, { h: 'Utilidad (pérdida)', num: true }],
    filas: meses.map((m) => ({ v: [nombreMes(m.anio, m.mes), m.ingresos, m.costos, m.utilidad], tipo: 'normal' })) };
}

// --- Libro diario ---------------------------------------------------------------------------

/** d: respuesta de /reportes/diario. Cada partida: encabezado, sus líneas y "Total partida". */
export function modeloDiario(d) {
  const filas = d.partidas.flatMap((p) => [
    { v: [`${p.codigoTipo} ${p.numero}`, `${fechaDMY(p.fecha)} · ${p.tipo}`, p.concepto, null, null], tipo: 'enc' },
    ...p.lineas.map((l) => ({ v: [l.codigoCuenta, l.nombreCuenta, l.concepto, o(l.debe), o(l.haber)], tipo: 'normal' })),
    { v: ['', '', 'Total partida', p.totalDebe, p.totalHaber], tipo: 'total' },
  ]);
  const excel = [['Partida', 'Fecha', 'Tipo', 'Cuenta', 'Nombre de la cuenta', 'Concepto', 'Cargo', 'Abono'],
    ...d.partidas.flatMap((p) => p.lineas.map((l) => [`${p.codigoTipo} ${p.numero}`, fechaDMY(p.fecha), p.codigoTipo, l.codigoCuenta, l.nombreCuenta, l.concepto, l.debe, l.haber])),
    ['', '', '', '', '', 'Totales', d.totalDebe, d.totalHaber]];
  return { columnas: [{ h: 'Cuenta' }, { h: 'Nombre' }, { h: 'Concepto' }, { h: 'Cargo', num: true }, { h: 'Abono', num: true }],
    filas, totales: ['', '', 'Totales', d.totalDebe, d.totalHaber], excel };
}

// --- Libro mayor ----------------------------------------------------------------------------

/** d: respuesta de /reportes/mayor. formato: 'partida' (cada movimiento) o 'dia' (agrupado por fecha). */
export function modeloMayor(d, formato = 'partida') {
  const [anterior, ...movs] = d.filas;
  const filas = [{ v: ['', '', '', 'Saldo anterior', null, null, anterior.saldo], tipo: 'enc' }];
  if (formato === 'dia') {
    const dias = new Map();
    for (const m of movs) {
      const x = dias.get(m.fecha) ?? { fecha: m.fecha, n: 0, debe: 0, haber: 0 };
      Object.assign(x, { n: x.n + 1, debe: centavos(x.debe + m.debe), haber: centavos(x.haber + m.haber), saldo: m.saldo });
      dias.set(m.fecha, x);
    }
    for (const x of dias.values()) filas.push({ v: [fechaDMY(x.fecha), '', '', `Movimientos del día (${x.n})`, x.debe, x.haber, x.saldo], tipo: 'normal' });
  } else {
    for (const m of movs) filas.push({ v: [fechaDMY(m.fecha), `${m.codigoTipo} ${m.numero}`, m.codigoCuenta, m.concepto, m.debe, m.haber, m.saldo], tipo: 'normal' });
  }
  const saldoFinal = d.filas.at(-1).saldo;
  return { columnas: [{ h: 'Fecha' }, { h: 'Partida' }, { h: 'Cuenta' }, { h: 'Concepto' }, { h: 'Cargo', num: true }, { h: 'Abono', num: true }, { h: 'Saldo', num: true }],
    filas, totales: ['', '', '', 'Totales del período', suma(movs.map((m) => m.debe)), suma(movs.map((m) => m.haber)), saldoFinal] };
}

// --- Balance de comprobación ----------------------------------------------------------------

/** filas: respuesta de /reportes/saldos. `enlace(fila)` da el href del código (pantalla). El cuadre mira las cuentas de nivel 0. */
export function modeloComprobacion(filas, { ocultar = false, enlace = null } = {}) {
  const visibles = ocultar ? filas.filter((f) => f.saldoInicial || f.debe || f.haber || f.saldoFinal) : filas;
  const raices = filas.filter((f) => f.nivel === 0);
  const [debe, haber] = [suma(raices.map((f) => f.debe)), suma(raices.map((f) => f.haber))];
  return {
    columnas: [{ h: 'Código' }, { h: 'Cuenta', sangria: true }, { h: 'Saldo inicial', num: true }, { h: 'Debe', num: true }, { h: 'Haber', num: true }, { h: 'Saldo final', num: true }],
    filas: visibles.map((f) => ({ v: [enlace ? { t: f.codigo, href: enlace(f) } : f.codigo, f.nombre, f.saldoInicial, o(f.debe), o(f.haber), f.saldoFinal],
      tipo: f.aceptaMovimiento ? 'normal' : 'grupo', nivel: f.nivel })),
    totales: ['', 'Totales (nivel 0)', null, debe, haber, null],
    cuadre: { debe, haber, diferencia: centavos(debe - haber) },
  };
}

// --- Balance General y Estado de Resultados -------------------------------------------------

const raiz = (filas, tipo) => suma(filas.filter((f) => f.nivel === 0 && f.tipo === tipo).map((f) => f.saldoFinal));
const utilidadEjercicio = (filas) => centavos(raiz(filas, 'INGRESO') - raiz(filas, 'COSTO_GASTO'));

/** Una sección: la cuenta de nivel 0 de ese prefijo como encabezado, sus cuentas con saldo (sangría por nivel) y el total. `extra`: filas antes del total. */
function seccion(filas, prefijo, titulo, extra = [], sumaExtra = 0) {
  const cuentas = filas.filter((f) => f.codigo.startsWith(prefijo));
  const total = centavos((cuentas.find((f) => f.nivel === 0)?.saldoFinal ?? 0) + sumaExtra);
  const encabezado = cuentas.find((f) => f.nivel === 0);
  return { total, filas: [
    { v: [prefijo, encabezado?.nombre ?? titulo, null], tipo: 'enc', nivel: 0 },
    ...cuentas.filter((f) => f.nivel > 0 && f.saldoFinal !== 0).map((f) => ({ v: [f.codigo, f.nombre, f.saldoFinal], tipo: f.aceptaMovimiento ? 'normal' : 'grupo', nivel: f.nivel })),
    ...extra,
    { v: ['', `Total ${titulo.toLowerCase()}`, total], tipo: 'total' },
  ] };
}
const COLUMNAS_SALDO = [{ h: 'Código' }, { h: 'Cuenta', sangria: true }, { h: 'Saldo', num: true }];

/** filas: /reportes/saldos (nivel 0 a 6). Activo contra pasivo + capital, con la utilidad del ejercicio dentro del capital. */
export function modeloBalanceGeneral(filas) {
  const utilidad = utilidadEjercicio(filas);
  const activo = seccion(filas, '1', 'Activo');
  const pasivo = seccion(filas, '2', 'Pasivo');
  const capital = seccion(filas, '3', 'Capital', [{ v: ['', 'Utilidad (pérdida) del ejercicio', utilidad], tipo: 'normal', nivel: 1 }], utilidad);
  const pasivoCapital = centavos(pasivo.total + capital.total);
  return { columnas: COLUMNAS_SALDO, utilidad,
    filas: [...activo.filas, ...pasivo.filas, ...capital.filas, { v: ['', 'Total pasivo + capital', pasivoCapital], tipo: 'total' }],
    cuadre: { activo: activo.total, pasivoCapital, diferencia: centavos(activo.total - pasivoCapital) } };
}

/** El impuesto sobre la renta: la cuenta '53' (GASTOS POR IMPUESTOS SOBRE LA RENTA) del catálogo, que sale de los gastos. */
const PREFIJO_IMPUESTO = '53';

/**
 * filas: /reportes/saldos (año hasta el mes, nivel 1 o más). Ingresos, costos y gastos (sin el impuesto) por grupo, la utilidad (pérdida) antes de impuesto,
 * el impuesto sobre la renta y la utilidad (pérdida) neta del ejercicio. `utilidad` es la neta (la misma que lleva el Balance General).
 */
export function modeloResultados(filas) {
  const impuesto = filas.find((f) => f.codigo === PREFIJO_IMPUESTO)?.saldoFinal ?? 0;
  const [ingresos, costos] = [seccion(filas, '6', 'Ingresos'), seccion(filas, '4', 'Costos')];
  const gastos = seccion(filas.filter((f) => !f.codigo.startsWith(PREFIJO_IMPUESTO)), '5', 'Gastos', [], -impuesto);
  const antes = centavos(ingresos.total - costos.total - gastos.total);
  const utilidad = centavos(antes - impuesto);
  return { columnas: COLUMNAS_SALDO, utilidad, utilidadAntes: antes, impuesto,
    filas: [...ingresos.filas, ...costos.filas, ...gastos.filas, { v: ['', 'Utilidad (pérdida) antes de impuesto', antes], tipo: 'total' },
      { v: [PREFIJO_IMPUESTO, 'Impuesto sobre la renta', impuesto], tipo: 'normal' },
      { v: ['', 'Utilidad (pérdida) neta del ejercicio', utilidad], tipo: 'total' }] };
}

// --- Excel ------------------------------------------------------------------------------------

/** Filas de Excel de un modelo: cabecera, filas (los encabezados de sección también) y totales al final; los números quedan como número. */
export function filasExcel(m) {
  if (m.excel) return m.excel;
  const celda = (v, f, i) => {
    if (v == null) return '';
    const t = typeof v === 'object' ? v.t : v;
    return m.columnas[i].sangria && typeof t === 'string' ? '  '.repeat(f.nivel ?? 0) + t : t;
  };
  return [m.columnas.map((c) => c.h), ...m.filas.map((f) => f.v.map((v, i) => celda(v, f, i))), ...(m.totales ? [m.totales.map((v) => v ?? '')] : [])];
}
