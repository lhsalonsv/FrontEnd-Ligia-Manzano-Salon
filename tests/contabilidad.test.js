import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUENTAS_PRUEBA } from '../js/mocks/cuentasContables.js';
import {
  ejerciciosIniciales, crearEjercicio, cerrarPeriodo, reabrirPeriodo, mesPorCerrar, mesPorReabrir,
  validarCuentaNueva, validarEdicionCuenta, guardarTipoPartida, TIPOS_PARTIDA_PRUEBA, CONFIG_PRUEBA, validarConfiguracion,
} from '../js/mocks/contabilidad.js';

const cuentas = () => CUENTAS_PRUEBA.map((c) => ({ ...c }));
const hija = { codigo: '1101990', nombre: 'Prueba', tipo: 'ACTIVO', naturaleza: 'D', nivel: 3, codigoPadre: '1101', aceptaMovimiento: true };
const detalle = CUENTAS_PRUEBA.find((c) => c.aceptaMovimiento);

// --- Ejercicios y períodos ----------------------------------------------------------

test('la semilla: 2025 cerrado, 2026 con enero a octubre cerrados', () => {
  const e = ejerciciosIniciales();
  assert.deepEqual(e.map((x) => [x.anio, x.estado]), [[2025, 'CERRADO'], [2026, 'ABIERTO']]);
  assert.ok(e[0].periodos.every((p) => p.estado === 'CERRADO'));
  const porCerrar = mesPorCerrar(e);
  assert.deepEqual([porCerrar.anio, porCerrar.mes], [2026, 11]);
  assert.equal(mesPorReabrir(e).mes, 10);
});

test('solo se cierra el mes abierto más antiguo, y se reabre solo el último cerrado', () => {
  const e = ejerciciosIniciales();
  assert.throws(() => cerrarPeriodo(e, 2026, 12), /Solo se puede cerrar el mes abierto más antiguo \(11\/2026\)/);
  assert.throws(() => reabrirPeriodo(e, 2026, 9), /Solo se puede reabrir el último mes cerrado \(10\/2026\)/);
  cerrarPeriodo(e, 2026, 11);
  assert.equal(e[1].periodos[10].estado, 'CERRADO');
  assert.ok(e[1].periodos[10].cerradoEn);
  assert.equal(mesPorReabrir(e).mes, 11);
  reabrirPeriodo(e, 2026, 11);
  assert.deepEqual(e[1].periodos[10], { mes: 11, estado: 'ABIERTO', cerradoEn: null });
});

test('un mes con partidas en borrador no se cierra', () => {
  const e = ejerciciosIniciales();
  assert.throws(() => cerrarPeriodo(e, 2026, 11, { '2026-11': 2 }), /El mes 11\/2026 tiene partidas en borrador/);
  assert.equal(e[1].periodos[10].estado, 'ABIERTO');
  cerrarPeriodo(e, 2026, 11, { '2026-10': 5 });
  assert.equal(e[1].periodos[10].estado, 'CERRADO');
});

test('no se reabre un mes de un ejercicio cerrado', () => {
  const e = ejerciciosIniciales();
  for (const p of e[1].periodos) Object.assign(p, { estado: 'CERRADO', cerradoEn: 'x' });
  e[1].estado = 'CERRADO';
  assert.throws(() => reabrirPeriodo(e, 2026, 12), /El ejercicio 2026 está cerrado/);
});

test('crear ejercicio: 12 meses abiertos, sin repetir año y entre 2000 y 2100', () => {
  const e = ejerciciosIniciales();
  const nuevo = crearEjercicio(e, 2027);
  assert.equal(nuevo.periodos.length, 12);
  assert.ok(nuevo.periodos.every((p) => p.estado === 'ABIERTO'));
  assert.deepEqual([nuevo.fechaInicio, nuevo.fechaFin], ['2027-01-01', '2027-12-31']);
  assert.throws(() => crearEjercicio(e, 2027), /Ya existe el ejercicio 2027/);
  assert.throws(() => crearEjercicio(e, 1999));
  assert.equal(mesPorCerrar(e).mes, 11); // el mes más antiguo sigue siendo noviembre de 2026
});

// --- Cuentas -----------------------------------------------------------------------

test('una cuenta hija válida cuelga de una agrupadora y su código empieza con el del padre', () => {
  const lista = cuentas();
  assert.equal(lista.find((c) => c.codigo === '1101').aceptaMovimiento, false);
  assert.deepEqual(validarCuentaNueva(lista, hija), {});
  assert.match(validarCuentaNueva(lista, { ...hija, codigo: '1201990' }).codigo, /debe empezar con 1101/);
  assert.match(validarCuentaNueva(lista, { ...hija, codigo: '1101' }).codigo, /Ya existe/);
  assert.match(validarCuentaNueva(lista, { ...hija, codigo: '11019x' }).codigo, /solo números/);
});

test('el padre no puede aceptar movimiento ni faltar', () => {
  const lista = cuentas();
  assert.match(validarCuentaNueva(lista, { ...hija, codigo: `${detalle.codigo}99`, codigoPadre: detalle.codigo }).codigoPadre, /acepta movimiento: no puede tener subcuentas/);
  assert.match(validarCuentaNueva(lista, { ...hija, codigoPadre: '9999' }).codigoPadre, /No existe/);
});

test('nivel: 0 solo sin padre; nombre, tipo y naturaleza obligatorios', () => {
  const lista = cuentas();
  assert.ok(validarCuentaNueva(lista, { ...hija, nivel: 0 }).nivel);
  assert.ok(validarCuentaNueva(lista, { ...hija, codigoPadre: null, nivel: 1, codigo: '8' }).nivel);
  assert.deepEqual(validarCuentaNueva(lista, { ...hija, codigoPadre: null, nivel: 0, codigo: '8' }), {});
  const e = validarCuentaNueva(lista, { ...hija, nombre: ' ', tipo: 'X', naturaleza: '' });
  assert.deepEqual(Object.keys(e).sort(), ['naturaleza', 'nombre', 'tipo']);
});

test('una cuenta con subcuentas no puede aceptar movimiento', () => {
  const lista = cuentas();
  assert.match(validarEdicionCuenta(lista, '1101', { nombre: 'Caja', aceptaMovimiento: true }).aceptaMovimiento, /tiene subcuentas/);
  assert.deepEqual(validarEdicionCuenta(lista, detalle.codigo, { nombre: 'Otro nombre', aceptaMovimiento: true }), {});
  assert.ok(validarEdicionCuenta(lista, detalle.codigo, { nombre: '', aceptaMovimiento: true }).nombre);
});

// --- Tipos de partida y configuración -------------------------------------------------

test('tipos de partida: código de 3 letras y siempre un solo predeterminado', () => {
  const tipos = TIPOS_PARTIDA_PRUEBA.map((t) => ({ ...t }));
  assert.ok(guardarTipoPartida(tipos, { codigo: 'ab', nombre: 'X', activo: true }, true).codigo);
  assert.match(guardarTipoPartida(tipos, { codigo: 'PDA', nombre: 'X', activo: true }, true).codigo, /Ya existe/);
  assert.deepEqual(guardarTipoPartida(tipos, { codigo: 'AJU', nombre: 'Partida de ajustes', predeterminado: true, activo: true }, true), {});
  assert.deepEqual(tipos.filter((t) => t.predeterminado).map((t) => t.codigo), ['AJU']);
  assert.match(guardarTipoPartida(tipos, { codigo: 'AJU', nombre: 'x', predeterminado: false, activo: true }, false).predeterminado, /Debe haber un tipo predeterminado/);
  assert.ok(guardarTipoPartida(tipos, { codigo: 'AJU', nombre: 'x', predeterminado: true, activo: false }, false).activo);
});

test('configuración: solo cuentas que aceptan movimiento y tipos de partida activos', () => {
  const lista = cuentas();
  assert.deepEqual(validarConfiguracion(CONFIG_PRUEBA, lista, TIPOS_PARTIDA_PRUEBA), {});
  assert.deepEqual(validarConfiguracion({ ...CONFIG_PRUEBA, ctaClientes: detalle.codigo }, lista, TIPOS_PARTIDA_PRUEBA), {});
  assert.match(validarConfiguracion({ ...CONFIG_PRUEBA, ctaClientes: '1101' }, lista, TIPOS_PARTIDA_PRUEBA).ctaClientes, /no acepta movimiento/);
  assert.ok(validarConfiguracion({ ...CONFIG_PRUEBA, tipoPartidaVentas: 'ZZZ', modoCompras: 'X' }, lista, TIPOS_PARTIDA_PRUEBA).tipoPartidaVentas);
});

// --- Partidas ------------------------------------------------------------------------

import {
  sembrarPartidas, crearBorrador, editarBorrador, eliminarBorrador, aplicarPartida, anularPartida, validarPartida, totalesLineas,
  borradoresPorMes, filtrarPartidas, vistaPartida, mesAbierto, mesesAbiertos,
} from '../js/mocks/contabilidad.js';

const estadoPartidas = () => ({ cuentas: cuentas(), ejercicios: ejerciciosIniciales(), tipos: TIPOS_PARTIDA_PRUEBA.map((t) => ({ ...t })), partidas: [] });
const datosPartida = (extra = {}) => ({ fecha: '2026-11-05', codigoTipo: 'PDA', concepto: 'Prueba', lineas: [{ codigoCuenta: '110101', debe: 10 }, { codigoCuenta: '61010107', haber: 10 }], ...extra });

test('la semilla: ventas con IVA incluido, planilla, una anulada y un borrador, todo cuadrado y numerado', () => {
  const p = estadoPartidas();
  sembrarPartidas(p);
  const venta = p.partidas[0];
  assert.deepEqual(venta.lineas.map((l) => [l.codigoCuenta, l.debe, l.haber]), [['110101', 113, 0], ['61010107', 0, 100], ['210702', 0, 13]]);
  assert.deepEqual(p.partidas.filter((x) => x.estado === 'APLICADA' && x.mes === 11).map((x) => `${x.codigoTipo} ${x.numero}`), ['ING 110001', 'ING 110002', 'PDA 110001', 'PDA 110002', 'PDA 110003']);
  assert.equal(p.partidas.filter((x) => x.estado === 'BORRADOR').length, 1);
  for (const x of p.partidas.filter((y) => y.estado === 'APLICADA')) assert.equal(totalesLineas(x.lineas).diferencia, 0);
  const original = vistaPartida(p, p.partidas.find((x) => x.numero === '110001' && x.codigoTipo === 'PDA'), false);
  assert.equal(original.numeroAnuladaPor, '110002');
  assert.equal(vistaPartida(p, p.partidas.find((x) => x.origen === 'ANULACION'), false).numeroAnula, '110001');
});

test('el número es MM + correlativo de 4 dígitos por tipo y mes, y se asigna al aplicar', () => {
  const p = estadoPartidas();
  const a = crearBorrador(p, datosPartida(), 'Ana');
  const b = crearBorrador(p, datosPartida(), 'Ana');
  const otroTipo = crearBorrador(p, datosPartida({ codigoTipo: 'EGR' }), 'Ana');
  const diciembre = crearBorrador(p, datosPartida({ fecha: '2026-12-01' }), 'Ana');
  assert.equal(a.numero, null);
  assert.equal(aplicarPartida(p, b.idPartida, 'Ana'), '110001'); // se numera al aplicar, en el orden en que se aplican
  assert.equal(aplicarPartida(p, a.idPartida, 'Ana'), '110002');
  assert.equal(aplicarPartida(p, otroTipo.idPartida, 'Ana'), '110001');
  assert.equal(aplicarPartida(p, diciembre.idPartida, 'Ana'), '120001');
  assert.throws(() => aplicarPartida(p, a.idPartida, 'Ana'), /no existe o ya está aplicada/);
});

test('aplicar exige 2 líneas y debe = haber al centavo', () => {
  const p = estadoPartidas();
  const sola = crearBorrador(p, datosPartida({ lineas: [{ codigoCuenta: '110101', debe: 10 }] }), 'Ana');
  assert.throws(() => aplicarPartida(p, sola.idPartida, 'Ana'), /La partida no cuadra: debe 10.00, haber 0.00 \(1 líneas\)/);
  const descuadre = crearBorrador(p, datosPartida({ lineas: [{ codigoCuenta: '110101', debe: 0.1 }, { codigoCuenta: '110102', debe: 0.2 }, { codigoCuenta: '61010107', haber: 0.31 }] }), 'Ana');
  assert.throws(() => aplicarPartida(p, descuadre.idPartida, 'Ana'), /debe 0.30, haber 0.31/);
  editarBorrador(p, descuadre.idPartida, datosPartida({ lineas: [{ codigoCuenta: '110101', debe: 0.1 }, { codigoCuenta: '110102', debe: 0.2 }, { codigoCuenta: '61010107', haber: 0.3 }] }));
  assert.equal(aplicarPartida(p, descuadre.idPartida, 'Ana'), '110001'); // 0.1 + 0.2 no es 0.30000000000000004
  assert.deepEqual(totalesLineas([{ debe: 0.1 }, { debe: 0.2 }]), { debe: 0.3, haber: 0, diferencia: 0.3 });
});

test('una aplicada no se modifica ni se borra; un borrador sí', () => {
  const p = estadoPartidas();
  const x = crearBorrador(p, datosPartida(), 'Ana');
  editarBorrador(p, x.idPartida, datosPartida({ concepto: 'Otro' }));
  assert.equal(x.concepto, 'Otro');
  aplicarPartida(p, x.idPartida, 'Ana');
  assert.throws(() => editarBorrador(p, x.idPartida, datosPartida()), /La partida 110001 está aplicada: no se modifica \(art\. 139/);
  assert.throws(() => eliminarBorrador(p, x.idPartida), /no se borra \(art\. 139 del Código Tributario\)\. Anúlela con una partida inversa/);
  const y = crearBorrador(p, datosPartida(), 'Ana');
  eliminarBorrador(p, y.idPartida);
  assert.equal(p.partidas.length, 1);
});

test('solo se escribe en meses abiertos y con cuentas activas que aceptan movimiento', () => {
  const p = estadoPartidas();
  assert.throws(() => crearBorrador(p, datosPartida({ fecha: '2026-10-15' }), 'Ana'), /El mes 10\/2026 está cerrado o no existe/);
  assert.throws(() => crearBorrador(p, datosPartida({ fecha: '2027-01-15' }), 'Ana'), /El mes 1\/2027 está cerrado o no existe/);
  const agrupadora = CUENTAS_PRUEBA.find((c) => !c.aceptaMovimiento).codigo;
  assert.throws(() => crearBorrador(p, datosPartida({ lineas: [{ codigoCuenta: agrupadora, debe: 1 }, { codigoCuenta: '110101', haber: 1 }] }), 'Ana'), new RegExp(`La cuenta ${agrupadora} no acepta movimiento o está inactiva`));
  p.cuentas.find((c) => c.codigo === '110101').activa = false;
  assert.throws(() => crearBorrador(p, datosPartida(), 'Ana'), /La cuenta 110101 no acepta movimiento o está inactiva/);
  assert.equal(p.partidas.length, 0);
  assert.deepEqual(mesesAbiertos(p.ejercicios).map((m) => `${m.mes}/${m.anio}`), ['11/2026', '12/2026']);
  assert.equal(mesAbierto(p.ejercicios, 2026, 11), true);
});

test('validarPartida: concepto, tipo, fecha y líneas con el monto en un solo lado', () => {
  const { cuentas: c, tipos } = estadoPartidas();
  assert.deepEqual(validarPartida(datosPartida(), c, tipos), {});
  assert.deepEqual(Object.keys(validarPartida({ fecha: '2026-02-30', codigoTipo: 'XXX', concepto: ' ', lineas: [] }, c, tipos)), ['fecha', 'codigoTipo', 'concepto']);
  assert.match(validarPartida(datosPartida({ concepto: 'x'.repeat(301) }), c, tipos).concepto, /300/);
  assert.match(validarPartida(datosPartida({ lineas: [{ codigoCuenta: '110101', debe: 1, haber: 1 }] }), c, tipos).lineas, /Línea 1: ponga el monto en el debe o en el haber/);
  assert.match(validarPartida(datosPartida({ lineas: [{ codigoCuenta: '110101', debe: 0, haber: 0 }] }), c, tipos).lineas, /Línea 1/);
  assert.match(validarPartida(datosPartida({ lineas: [{ codigoCuenta: '999999', debe: 1 }] }), c, tipos).lineas, /elija una cuenta/);
});

test('anular crea la inversa aplicada, enlazada, y la original queda igual; solo una vez', () => {
  const p = estadoPartidas();
  const x = crearBorrador(p, datosPartida({ lineas: [{ codigoCuenta: '110101', concepto: 'a', debe: 10 }, { codigoCuenta: '61010107', haber: 10 }] }), 'Ana');
  assert.throws(() => anularPartida(p, x.idPartida, 'Ana', 'error', '2026-11-06'), /Solo se anulan partidas aplicadas; un borrador se borra/);
  aplicarPartida(p, x.idPartida, 'Ana');
  const antes = structuredClone(x);
  assert.throws(() => anularPartida(p, x.idPartida, 'Ana', '  ', '2026-11-06'), /Escriba el motivo de la anulación/);
  assert.throws(() => anularPartida(p, x.idPartida, 'Ana', 'error', '2026-10-06'), /El mes 10\/2026 está cerrado o no existe/);
  assert.equal(p.partidas.length, 1);
  const inversa = anularPartida(p, x.idPartida, 'Ana', 'error de captura', '2026-12-02');
  assert.deepEqual(x, antes);
  assert.equal(inversa.estado, 'APLICADA');
  assert.equal(inversa.origen, 'ANULACION');
  assert.equal(inversa.idPartidaAnula, x.idPartida);
  assert.equal(inversa.numero, '120001');
  assert.equal(inversa.concepto, 'Anulación de la partida PDA 110001: error de captura');
  assert.deepEqual(inversa.lineas.map((l) => [l.codigoCuenta, l.concepto, l.debe, l.haber]), [['110101', 'a', 0, 10], ['61010107', null, 10, 0]]);
  assert.throws(() => anularPartida(p, x.idPartida, 'Ana', 'otra vez', '2026-12-02'), /La partida 110001 ya fue anulada/);
  assert.throws(() => anularPartida(p, inversa.idPartida, 'Ana', 'otra vez', '2026-12-02'), /La partida 120001 ya es una anulación/);
});

test('un mes con partidas en borrador no se cierra; al aplicar o borrar sí', () => {
  const p = estadoPartidas();
  p.ejercicios = ejerciciosIniciales();
  const x = crearBorrador(p, datosPartida(), 'Ana');
  assert.deepEqual(borradoresPorMes(p.partidas), { '2026-11': 1 });
  assert.throws(() => cerrarPeriodo(p.ejercicios, 2026, 11, borradoresPorMes(p.partidas)), /El mes 11\/2026 tiene partidas en borrador/);
  aplicarPartida(p, x.idPartida, 'Ana');
  cerrarPeriodo(p.ejercicios, 2026, 11, borradoresPorMes(p.partidas));
  assert.throws(() => crearBorrador(p, datosPartida(), 'Ana'), /El mes 11\/2026 está cerrado/);
  assert.throws(() => anularPartida(p, x.idPartida, 'Ana', 'error', '2026-11-20'), /El mes 11\/2026 está cerrado/);
});

test('filtrar el listado: año, mes, tipo, estado y búsqueda por número o concepto', () => {
  const p = estadoPartidas();
  sembrarPartidas(p);
  assert.equal(filtrarPartidas(p.partidas, {}).length, 17); // 6 de noviembre + apertura + 10 de junio a octubre
  assert.equal(filtrarPartidas(p.partidas, { anio: 2026, mes: 12 }).length, 0);
  assert.equal(filtrarPartidas(p.partidas, { tipo: 'ING' }).length, 8);
  assert.equal(filtrarPartidas(p.partidas, { estado: 'BORRADOR' }).length, 1);
  assert.equal(filtrarPartidas(p.partidas, { buscar: 'PLANILLA', mes: 11 })[0].numero, '110003');
  assert.deepEqual(filtrarPartidas(p.partidas, { buscar: '110002', mes: 11 }).map((x) => x.codigoTipo).sort(), ['ING', 'PDA']);
  assert.equal(filtrarPartidas(p.partidas, {})[0].fecha, '2026-11-24'); // la más reciente primero
});

// --- Reportes (migracion_1.7.sql / prueba_1.7.sql) -----------------------------------------

import { saldosCuentas, mayorCuenta, libroDiario } from '../js/mocks/contabilidad.js';
import { resultadoMes, ultimosMeses, modeloBalanceGeneral, modeloResultados, modeloComprobacion, modeloMayor, modeloDiario, filasExcel } from '../js/utils/reportesContables.js';

/** El escenario de prueba_1.7.sql: apertura, venta, alquiler, venta del año siguiente y un borrador que no cuenta. */
function escenarioReportes() {
  const p = estadoPartidas();
  crearEjercicio(p.ejercicios, 2099);
  crearEjercicio(p.ejercicios, 2100);
  const hacer = (fecha, tipo, concepto, lineas, aplicar = true) => {
    const x = crearBorrador(p, { fecha, codigoTipo: tipo, concepto, lineas }, 'Ana');
    if (aplicar) aplicarPartida(p, x.idPartida, 'Ana');
  };
  const venta = [{ codigoCuenta: '110101', debe: 113 }, { codigoCuenta: '61010107', haber: 100 }, { codigoCuenta: '210702', haber: 13 }];
  hacer('2099-01-02', 'PDA', 'Apertura', [{ codigoCuenta: '110101', debe: 1000 }, { codigoCuenta: '31010101', haber: 1000 }]);
  hacer('2099-01-15', 'ING', 'Venta', venta);
  hacer('2099-02-10', 'PDA', 'Alquiler', [{ codigoCuenta: '5101040101', debe: 50 }, { codigoCuenta: '110101', haber: 50 }]);
  hacer('2100-01-05', 'ING', 'Venta', venta);
  hacer('2099-02-20', 'PDA', 'Borrador', [{ codigoCuenta: '110101', debe: 9999 }, { codigoCuenta: '61010107', haber: 9999 }], false);
  return p;
}
const f2 = (n) => (typeof n === 'number' ? n.toFixed(2) : n);
const unir = (filas, campos) => filas.map((r) => campos.filter((c) => r[c] != null).map((c) => (c === 'fila' ? r[c] : f2(r[c]))).join(' ')).join(' | ');
const saldos = (p, anio, mes, nivel) => saldosCuentas(p.partidas, p.cuentas, anio, mes, nivel);

test('saldos: balance de comprobación de febrero de 2099 (los mismos números de prueba_1.7.sql)', () => {
  const p = escenarioReportes();
  const filas = saldos(p, 2099, 2).filter((r) => ['1', '1101', '110101', '210702', '31010101', '5101040101', '61010107'].includes(r.codigo));
  assert.equal(unir(filas, ['codigo', 'saldoInicial', 'debe', 'haber', 'saldoFinal']),
    '1 1113.00 0.00 50.00 1063.00 | 1101 1113.00 0.00 50.00 1063.00 | 110101 1113.00 0.00 50.00 1063.00 | '
    + '210702 13.00 0.00 0.00 13.00 | 31010101 1000.00 0.00 0.00 1000.00 | 5101040101 0.00 50.00 0.00 50.00 | 61010107 100.00 0.00 0.00 100.00');
});

test('saldos: el balance general cuadra y el debe y el haber de nivel 0 también', () => {
  const p = escenarioReportes();
  const s = (filas, ...codigos) => filas.filter((r) => codigos.includes(r.codigo)).reduce((a, r) => a + r.saldoFinal, 0);
  const n0 = saldos(p, 2099, 2, 0);
  assert.deepEqual([s(n0, '1'), s(n0, '2', '3') + s(n0, '6') - s(n0, '4', '5')].map(f2), ['1063.00', '1063.00']);
  const enero = saldos(p, 2099, 1, 0);
  assert.deepEqual([enero.reduce((a, r) => a + r.debe, 0), enero.reduce((a, r) => a + r.haber, 0)].map(f2), ['1113.00', '1113.00']);
  assert.ok(saldos(p, 2099, 2, 1).every((r) => r.nivel <= 1));
});

test('saldos: en enero de 2100 las cuentas de resultado vuelven a cero y las de balance arrastran su saldo', () => {
  const p = escenarioReportes();
  const filas = saldos(p, 2100, 1).filter((r) => ['110101', '210702', '5101040101', '61010107'].includes(r.codigo));
  assert.equal(unir(filas, ['codigo', 'saldoInicial', 'saldoFinal']), '110101 1063.00 1176.00 | 210702 13.00 26.00 | 5101040101 0.00 0.00 | 61010107 0.00 100.00');
});

test('mayor: saldo anterior, movimientos de la cuenta mayor con saldo corrido y error si no existe', () => {
  const p = escenarioReportes();
  const mayor = (...a) => mayorCuenta(p.partidas, p.cuentas, ...a);
  assert.equal(unir(mayor('1101', '2099-01-10', '2099-12-31'), ['fila', 'fecha', 'codigoTipo', 'debe', 'haber', 'saldo']),
    '0 1000.00 | 1 2099-01-15 ING 113.00 0.00 1113.00 | 2 2099-02-10 PDA 0.00 50.00 1063.00');
  assert.equal(unir(mayor('61010107', '2100-01-01', '2100-01-31'), ['fila', 'saldo']), '0 0.00 | 1 100.00');
  assert.throws(() => mayor('999', '2099-01-01', '2099-01-31'), /La cuenta 999 no existe/);
  assert.throws(() => mayor('1101', '2099-02-01', '2099-01-31'), /La fecha final es anterior/);
});

test('libro diario: partidas aplicadas del rango con totales; el filtro por tipo y el borrador fuera', () => {
  const p = escenarioReportes();
  const d = libroDiario(p.partidas, p.cuentas, p.tipos, '2099-01-01', '2099-12-31');
  assert.deepEqual(d.partidas.map((x) => `${x.codigoTipo} ${x.numero}`), ['PDA 010001', 'ING 010001', 'PDA 020001']);
  assert.equal(d.totalDebe, 1163);
  assert.equal(d.totalDebe, d.totalHaber);
  assert.equal(libroDiario(p.partidas, p.cuentas, p.tipos, '2099-01-01', '2099-12-31', 'ING').partidas.length, 1);
});

test('los modelos: balance general (con la utilidad del ejercicio), resultados, comprobación, mayor y diario', () => {
  const p = escenarioReportes();
  const bg = modeloBalanceGeneral(saldos(p, 2099, 2, 3));
  assert.deepEqual(bg.cuadre, { activo: 1063, pasivoCapital: 1063, diferencia: 0 });
  assert.equal(bg.utilidad, 50); // 100 de ingresos − 50 de alquiler
  assert.ok(bg.filas.some((f) => f.v[1] === 'Utilidad (pérdida) del ejercicio' && f.v[2] === 50));
  const er = modeloResultados(saldos(p, 2099, 2, 3));
  assert.equal(er.filas.at(-1).v[2], 50);
  const cp = modeloComprobacion(saldos(p, 2099, 2), { ocultar: true });
  assert.equal(cp.cuadre.diferencia, 0);
  assert.ok(cp.filas.length < 40 && cp.filas.every((f) => f.v[2] || f.v[3] || f.v[4] || f.v[5]));
  const d = { filas: mayorCuenta(p.partidas, p.cuentas, '1101', '2099-01-01', '2099-12-31') };
  assert.equal(modeloMayor(d, 'partida').filas.length, 4);
  assert.equal(modeloMayor(d, 'dia').totales[6], 1063);
  const dia = libroDiario(p.partidas, p.cuentas, p.tipos, '2099-01-01', '2099-12-31');
  assert.equal(filasExcel(modeloDiario(dia)).length, 1 + 7 + 1); // cabecera, 2 + 3 + 2 líneas y totales
});

test('resumen: resultado de un mes y del año; los 6 meses cruzan el año', () => {
  const p = escenarioReportes();
  const r = resultadoMes(saldos(p, 2099, 2, 0));
  assert.deepEqual([r.ingresos, r.costos, r.utilidad, r.ingresosAcum, r.costosAcum, r.utilidadAcum], [0, 50, -50, 100, 50, 50]);
  assert.deepEqual(ultimosMeses(2026, 2).map((m) => `${m.anio}-${m.mes}`), ['2025-9', '2025-10', '2025-11', '2025-12', '2026-1', '2026-2']);
});

test('la semilla: la apertura cuadra y el balance general de octubre de 2026 también', () => {
  const p = estadoPartidas();
  sembrarPartidas(p);
  const apertura = p.partidas.find((x) => x.origen === 'APERTURA');
  assert.equal(apertura.fecha, '2026-01-02');
  for (const x of p.partidas.filter((y) => y.estado === 'APLICADA')) assert.equal(totalesLineas(x.lineas).diferencia, 0, `${x.codigoTipo} ${x.numero}`);
  assert.equal(modeloBalanceGeneral(saldosCuentas(p.partidas, p.cuentas, 2026, 10, 6)).cuadre.diferencia, 0);
  const meses = ultimosMeses(2026, 11).map((m) => resultadoMes(saldosCuentas(p.partidas, p.cuentas, m.anio, m.mes, 0)));
  assert.ok(meses.slice(0, 5).every((m) => m.ingresos > 0 && m.costos > 0));
});

// --- Cierre del ejercicio (migracion_1.8.sql / prueba_1.8.sql) -----------------------------

import { generarPartidaCierre, cerrarEjercicio } from '../js/mocks/contabilidad.js';

test('cierre del ejercicio: las mismas líneas, saldos y errores de prueba_1.8.sql (utilidad de 50 en 2099, pérdida de 80 en 2100)', () => {
  const p = { ...estadoPartidas(), config: { ...CONFIG_PRUEBA } };
  crearEjercicio(p.ejercicios, 2099);
  crearEjercicio(p.ejercicios, 2100);
  const hacer = (fecha, tipo, concepto, lineas) => aplicarPartida(p, crearBorrador(p, { fecha, codigoTipo: tipo, concepto, lineas }, 'Ana').idPartida, 'Ana');
  const lineasDe = (x) => unir(x.lineas, ['codigoCuenta', 'debe', 'haber']);
  const s = (anio, ...codigos) => unir(saldos(p, anio, 12).filter((r) => codigos.includes(r.codigo)), ['codigo', 'saldoFinal']);
  hacer('2099-01-02', 'PDA', 'Apertura', [{ codigoCuenta: '110101', debe: 1000 }, { codigoCuenta: '31010101', haber: 1000 }]);
  hacer('2099-03-15', 'ING', 'Venta', [{ codigoCuenta: '110101', debe: 113 }, { codigoCuenta: '61010107', haber: 100 }, { codigoCuenta: '210702', haber: 13 }]);
  hacer('2099-06-10', 'PDA', 'Alquiler', [{ codigoCuenta: '5101040101', debe: 50 }, { codigoCuenta: '110101', haber: 50 }]);

  assert.throws(() => generarPartidaCierre(p, 2099, 'Ana'), /Configure en Contabilidad > Parámetros las cuentas de Pérdidas y Ganancias/);
  Object.assign(p.config, { ctaPerdidasGanancias: '710101', ctaUtilidadEjercicio: '330101', ctaPerdidaEjercicio: '330201', ctaUtilidadesAnteriores: '330102', ctaPerdidasAnteriores: '330202' });
  const pendiente = crearBorrador(p, { fecha: '2099-07-01', codigoTipo: 'PDA', concepto: 'Pendiente', lineas: [] }, 'Ana');
  assert.throws(() => generarPartidaCierre(p, 2099, 'Ana'), /El ejercicio 2099 tiene partidas en borrador/);
  eliminarBorrador(p, pendiente.idPartida);

  const cierre = generarPartidaCierre(p, 2099, 'Ana');
  assert.deepEqual([cierre.fecha, cierre.estado, cierre.codigoTipo, cierre.origen], ['2099-12-31', 'BORRADOR', 'PDA', 'CIERRE']);
  assert.equal(lineasDe(cierre), '5101040101 0.00 50.00 | 61010107 100.00 0.00 | 710101 0.00 50.00 | 710101 50.00 0.00 | 330101 0.00 50.00');
  assert.throws(() => cerrarEjercicio(p, 2099, 'Ana'), /Cierre primero los 12 meses del ejercicio 2099/);
  aplicarPartida(p, cierre.idPartida, 'Ana');
  assert.equal(s(2099, '1', '2', '3', '5', '6', '7', '330101'), '1 1063.00 | 2 13.00 | 3 1050.00 | 330101 50.00 | 5 0.00 | 6 0.00 | 7 0.00');
  assert.throws(() => generarPartidaCierre(p, 2099, 'Ana'), /El ejercicio 2099 ya tiene su partida de cierre/);

  for (let m = mesPorCerrar(p.ejercicios); m && m.anio <= 2099; m = mesPorCerrar(p.ejercicios)) cerrarPeriodo(p.ejercicios, m.anio, m.mes);
  const traslado = cerrarEjercicio(p, 2099, 'Ana');
  assert.equal(p.ejercicios.find((e) => e.anio === 2099).estado, 'CERRADO');
  assert.equal(`${traslado.fecha} ${traslado.estado} ${lineasDe(traslado)}`, '2100-01-01 BORRADOR 330101 50.00 0.00 | 330102 0.00 50.00');
  assert.throws(() => cerrarEjercicio(p, 2099, 'Ana'), /no existe o ya está cerrado/);
  assert.throws(() => reabrirPeriodo(p.ejercicios, 2099, 12), /Solo se puede reabrir el último mes cerrado|está cerrado/);
  aplicarPartida(p, traslado.idPartida, 'Ana');

  hacer('2100-02-10', 'PDA', 'Alquiler', [{ codigoCuenta: '5101040101', debe: 80 }, { codigoCuenta: '110101', haber: 80 }]);
  const perdida = generarPartidaCierre(p, 2100, 'Ana');
  assert.equal(lineasDe(perdida), '5101040101 0.00 80.00 | 710101 80.00 0.00 | 710101 0.00 80.00 | 330201 80.00 0.00');
  aplicarPartida(p, perdida.idPartida, 'Ana');
  assert.equal(s(2100, '1', '330102', '330201'), '1 983.00 | 330102 50.00 | 330201 -80.00'); // 330201 es acreedora en su catálogo
});

test('cierre del ejercicio: sin enero siguiente abierto o sin cuenta de anteriores no hay traslado, y un ejercicio cerrado no reabre meses', () => {
  const p = { ...estadoPartidas(), config: { ...CONFIG_PRUEBA, ctaPerdidasGanancias: '710101', ctaUtilidadEjercicio: '330101', ctaPerdidaEjercicio: '330201' } };
  crearEjercicio(p.ejercicios, 2099);
  aplicarPartida(p, crearBorrador(p, { fecha: '2099-06-10', codigoTipo: 'PDA', concepto: 'Venta', lineas: [{ codigoCuenta: '110101', debe: 5 }, { codigoCuenta: '61010107', haber: 5 }] }, 'Ana').idPartida, 'Ana');
  aplicarPartida(p, generarPartidaCierre(p, 2099, 'Ana').idPartida, 'Ana');
  for (let m = mesPorCerrar(p.ejercicios); m; m = mesPorCerrar(p.ejercicios)) cerrarPeriodo(p.ejercicios, m.anio, m.mes);
  assert.equal(cerrarEjercicio(p, 2099, 'Ana'), null); // no existe 2100
  assert.throws(() => reabrirPeriodo(p.ejercicios, 2099, 12), /El ejercicio 2099 está cerrado/);
});

test('estado de resultados: el impuesto sobre la renta (53) sale de los gastos y la utilidad neta cuadra con el balance general', () => {
  const p = escenarioReportes();
  hacerImpuesto(p);
  const filas = saldos(p, 2099, 2, 3);
  const er = modeloResultados(filas);
  assert.deepEqual([er.utilidadAntes, er.impuesto, er.utilidad], [50, 10, 40]);
  assert.deepEqual(er.filas.slice(-3).map((f) => f.v[1] + ' ' + f.v[2]), ['Utilidad (pérdida) antes de impuesto 50', 'Impuesto sobre la renta 10', 'Utilidad (pérdida) neta del ejercicio 40']);
  assert.ok(er.filas.some((f) => f.v[1] === 'Total gastos' && f.v[2] === 50) && !er.filas.some((f) => f.v[0] === '530101'));
  assert.equal(modeloBalanceGeneral(filas).utilidad, er.utilidad);
});

function hacerImpuesto(p) {
  aplicarPartida(p, crearBorrador(p, { fecha: '2099-02-25', codigoTipo: 'PDA', concepto: 'Impuesto', lineas: [{ codigoCuenta: '530101', debe: 10 }, { codigoCuenta: '110101', haber: 10 }] }, 'Ana').idPartida, 'Ana');
}

// --- Contabilizar y partidas de impuestos (fase 3) -----------------------------------

import { sembrarPendientes, vistaContabilizar, contabilizar, generarImpuestosMes, resumirLineas } from '../js/mocks/contabilidad.js';

const estadoContabilizar = () => {
  const p = { cuentas: cuentas(), ejercicios: ejerciciosIniciales(), tipos: TIPOS_PARTIDA_PRUEBA.map((t) => ({ ...t })), config: { ...CONFIG_PRUEBA } };
  sembrarPartidas(p);
  sembrarPendientes(p, new Date(2026, 10, 27));
  return p;
};
const RANGO = ['2026-11-01', '2026-11-30'];

test('configuración: la fecha de inicio es válida y capital e ISR aceptan agrupadoras, las demás no', () => {
  const lista = cuentas();
  assert.deepEqual(validarConfiguracion({ ...CONFIG_PRUEBA, ctaCapitalSocial: '3101', ctaGastoIsr: '53' }, lista, TIPOS_PARTIDA_PRUEBA), {});
  assert.match(validarConfiguracion({ ...CONFIG_PRUEBA, ctaCaja: '1101' }, lista, TIPOS_PARTIDA_PRUEBA).ctaCaja, /no acepta movimiento/);
  assert.ok(validarConfiguracion({ ...CONFIG_PRUEBA, fechaInicio: '2026-13-40' }, lista, TIPOS_PARTIDA_PRUEBA).fechaInicio);
});

test('contabilizar ventas: un borrador por día, las líneas sumadas por cuenta y todos cuadran', () => {
  const p = estadoContabilizar();
  const antes = p.partidas.length;
  const vista = vistaContabilizar(p, 'VENTAS', ...RANGO);
  assert.deepEqual([...new Set(vista.map((l) => l.grupo))], ['2026-11-04', '2026-11-06', '2026-11-11']);
  const ids = contabilizar(p, 'VENTAS', ...RANGO, 'Prueba');
  assert.equal(ids.length, 3);
  assert.equal(p.partidas.length, antes + 3);
  for (const id of ids) {
    const x = p.partidas.find((y) => y.idPartida === id);
    const t = totalesLineas(x.lineas);
    assert.equal(x.estado, 'BORRADOR');
    assert.equal(x.origen, 'VENTAS');
    assert.equal(t.diferencia, 0);
    assert.ok(t.debe > 0);
    assert.equal(new Set(x.lineas.map((l) => l.codigoCuenta)).size, x.lineas.length); // una línea por cuenta
  }
  const dia4 = p.partidas.find((y) => y.idPartida === ids[0]);
  assert.equal(dia4.lineas.find((l) => l.codigoCuenta === '110101').debe, 337);
  assert.equal(dia4.lineas.find((l) => l.codigoCuenta === '61010107').haber, 300);
});

test('un documento no se contabiliza dos veces, y borrar el borrador lo libera', () => {
  const p = estadoContabilizar();
  const ids = contabilizar(p, 'VENTAS', ...RANGO, 'Prueba');
  assert.deepEqual(vistaContabilizar(p, 'VENTAS', ...RANGO), []);
  assert.deepEqual(contabilizar(p, 'VENTAS', ...RANGO, 'Prueba'), []);
  eliminarBorrador(p, ids[0]);
  assert.deepEqual([...new Set(vistaContabilizar(p, 'VENTAS', ...RANGO).map((l) => l.grupo))], ['2026-11-04']);
});

test('planilla y tarjetas: una partida por documento, de tipo PDA y cuadrada', () => {
  const p = estadoContabilizar();
  for (const origen of ['PLANILLA', 'TARJETAS']) {
    const [id] = contabilizar(p, origen, ...RANGO, 'Prueba');
    const x = p.partidas.find((y) => y.idPartida === id);
    assert.equal(x.codigoTipo, 'PDA');
    assert.equal(totalesLineas(x.lineas).diferencia, 0);
  }
});

test('una línea sin cuenta bloquea las compras con el texto de lo que falta y no crea nada', () => {
  const p = estadoContabilizar();
  const antes = p.partidas.length;
  assert.ok(vistaContabilizar(p, 'COMPRAS', ...RANGO).some((l) => l.codigoCuenta === null && /"Varios" de la compra C-0170/.test(l.falta)));
  assert.throws(() => contabilizar(p, 'COMPRAS', ...RANGO, 'Prueba'), /Falta la cuenta contable de la línea "Varios" de la compra C-0170/);
  assert.equal(p.partidas.length, antes);
  // Un rango que no incluye esa compra sí se contabiliza
  assert.equal(contabilizar(p, 'COMPRAS', '2026-11-10', '2026-11-30', 'Prueba').length, 1);
});

test('contabilizar respeta la fecha de inicio y la exige', () => {
  const p = estadoContabilizar();
  p.config.fechaInicio = '2026-11-06';
  assert.deepEqual([...new Set(vistaContabilizar(p, 'VENTAS', ...RANGO).map((l) => l.grupo))], ['2026-11-06', '2026-11-11']);
  p.config.fechaInicio = null;
  assert.throws(() => contabilizar(p, 'VENTAS', ...RANGO, 'Prueba'), /fecha de inicio/);
  assert.throws(() => vistaContabilizar(p, 'OTRO', ...RANGO), /No se contabiliza el origen OTRO/);
});

test('resumirLineas suma por cuenta y quita lo que se compensa', () => {
  const l = (codigoCuenta, monto) => ({ codigoCuenta, nombreCuenta: codigoCuenta, monto });
  assert.deepEqual(resumirLineas([l('A', 10.1), l('B', -10.1), l('A', 0.2), l('C', 5), l('C', -5)]),
    [{ codigoCuenta: 'A', nombreCuenta: 'A', debe: 10.3, haber: 0 }, { codigoCuenta: 'B', nombreCuenta: 'B', debe: 0, haber: 10.1 }]);
});

test('impuestos del mes: IVA por pagar y pago a cuenta cuadran, y solo una vigente por mes', () => {
  const p = estadoContabilizar();
  const r = { debitoCcf: 26, debitoCf: 78, creditoFiscal: 18.2, ivaPercibido: 0, ivaRetenido: 2, anticipoIva: 10, remanenteAnterior: 0, ingresosBrutos: 800, pagoACuenta: 14 };
  const id = generarImpuestosMes(p, 2026, 11, r, 'Prueba');
  const x = p.partidas.find((y) => y.idPartida === id);
  assert.equal(x.fecha, '2026-11-30');
  assert.equal(x.estado, 'BORRADOR');
  assert.equal(totalesLineas(x.lineas).diferencia, 0);
  assert.equal(x.lineas.find((l) => l.codigoCuenta === '211002').haber, 73.8); // 26 + 78 − 18.2 − 2 − 10
  assert.equal(x.lineas.find((l) => l.codigoCuenta === '11080101').debe, 14);
  assert.throws(() => generarImpuestosMes(p, 2026, 11, r, 'Prueba'), /El mes 11\/2026 ya tiene su partida de impuestos/);
  eliminarBorrador(p, id); // borrarla libera el mes
  assert.ok(generarImpuestosMes(p, 2026, 11, r, 'Prueba'));
});

test('impuestos del mes: con más crédito que débito queda remanente, y sin cuentas o sin movimiento se detiene', () => {
  const p = estadoContabilizar();
  const cero = { debitoCcf: 0, debitoCf: 0, creditoFiscal: 0, ivaPercibido: 0, ivaRetenido: 0, anticipoIva: 0, remanenteAnterior: 0, ingresosBrutos: 0, pagoACuenta: 0 };
  assert.throws(() => generarImpuestosMes(p, 2026, 11, cero, 'Prueba'), /no tiene IVA ni ingresos que liquidar/);
  const id = generarImpuestosMes(p, 2026, 11, { ...cero, debitoCf: 13, creditoFiscal: 30 }, 'Prueba');
  const x = p.partidas.find((y) => y.idPartida === id);
  assert.equal(totalesLineas(x.lineas).diferencia, 0);
  assert.equal(x.lineas.find((l) => l.codigoCuenta === '110407').debe, 17); // remanente para el mes siguiente
  p.config.ctaPagoCuenta = null;
  assert.throws(() => generarImpuestosMes(p, 2026, 12, cero, 'Prueba'), /Configure en Contabilidad > Parámetros las cuentas del IVA/);
});
