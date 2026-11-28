import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anticipoPropuesto, depositadoDe, revisarLiquidacion, revisarEditable, liquidacionesIniciales } from '../js/mocks/liquidaciones.js';

const valida = {
  fecha: '2026-11-10', idProveedor: 5, numeroDocumento: 'LIQ-1', codigoGeneracion: null, periodoIva: '2026-11-01',
  montoLiquidado: 100, anticipoIva: 1.77, comisionTotal: 2, montoDepositado: 96.23, codigoCuentaBanco: '1101030101',
};

test('anticipo propuesto: 2 % de lo cobrado sin IVA', () => {
  assert.equal(anticipoPropuesto(113), 2);
  assert.equal(anticipoPropuesto(100), 1.77);
  assert.equal(anticipoPropuesto(842.5), 14.91);
});

test('el depositado es cobrado menos anticipo y comisión', () => {
  assert.equal(depositadoDe(valida), 96.23);
  assert.equal(depositadoDe({ montoLiquidado: 615, anticipoIva: 10.89, comisionTotal: 9.9 }), 594.21);
});

test('si el depositado no cuadra es un conflicto (409); si cuadra, no', () => {
  assert.deepEqual(revisarLiquidacion(valida), { campos: {}, conflicto: null });
  assert.match(revisarLiquidacion({ ...valida, montoDepositado: 97 }).conflicto, /no cuadra/);
});

test('validaciones con las mismas claves del JSON', () => {
  const { campos } = revisarLiquidacion({ ...valida, montoLiquidado: 0, comisionTotal: -1, codigoGeneracion: 'abc', periodoIva: '2026-11-05', codigoCuentaBanco: '' });
  assert.deepEqual(Object.keys(campos).sort(), ['codigoCuentaBanco', 'codigoGeneracion', 'comisionTotal', 'montoLiquidado', 'periodoIva']);
  assert.match(revisarLiquidacion({ ...valida, anticipoIva: 1.234 }).campos.anticipoIva, /2 decimales/);
});

test('una liquidación contabilizada no se edita ni se borra', () => {
  const [contabilizada, pendiente] = liquidacionesIniciales('2026-11-27');
  assert.equal(contabilizada.contabilizada, true);
  assert.match(revisarEditable(contabilizada), /^La liquidación LIQ-.+ ya está contabilizada: borre el borrador o anule la partida primero$/);
  assert.equal(revisarEditable(pendiente), null);
});

test('los datos de prueba cuadran y hay una contabilizada', () => {
  const todas = liquidacionesIniciales('2026-11-27');
  assert.equal(todas.length, 3);
  for (const l of todas) assert.equal(l.montoDepositado, depositadoDe(l));
});
