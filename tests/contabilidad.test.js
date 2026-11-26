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
  assert.deepEqual(p.partidas.filter((x) => x.estado === 'APLICADA').map((x) => `${x.codigoTipo} ${x.numero}`), ['ING 110001', 'ING 110002', 'PDA 110001', 'PDA 110002', 'PDA 110003']);
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
  assert.equal(filtrarPartidas(p.partidas, {}).length, 6);
  assert.equal(filtrarPartidas(p.partidas, { anio: 2026, mes: 12 }).length, 0);
  assert.equal(filtrarPartidas(p.partidas, { tipo: 'ING' }).length, 3);
  assert.equal(filtrarPartidas(p.partidas, { estado: 'BORRADOR' }).length, 1);
  assert.equal(filtrarPartidas(p.partidas, { buscar: 'PLANILLA' })[0].numero, '110003');
  assert.deepEqual(filtrarPartidas(p.partidas, { buscar: '110002' }).map((x) => x.codigoTipo).sort(), ['ING', 'PDA']);
  assert.equal(filtrarPartidas(p.partidas, {})[0].fecha, '2026-11-24'); // la más reciente primero
});
