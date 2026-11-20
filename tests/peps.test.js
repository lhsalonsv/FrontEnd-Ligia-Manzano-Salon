import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenPeps, existencia, valorAlCosto, salidaPeps, ultimoCosto } from '../js/utils/peps.js';

// Shampoo hidratante del mockup: dos lotes, queda 1 de cada uno
const shampoo = [
  { idLote: 7, fechaIngreso: '2026-10-21T10:00:00-06:00', costoUnitario: 6.8, cantidadInicial: 12, cantidadDisponible: 1 },
  { idLote: 3, fechaIngreso: '2026-09-18T10:00:00-06:00', costoUnitario: 6.5, cantidadInicial: 12, cantidadDisponible: 1 },
  { idLote: 1, fechaIngreso: '2026-08-02T10:00:00-06:00', costoUnitario: 6.2, cantidadInicial: 12, cantidadDisponible: 0 },
];

test('sale primero el lote más antiguo con existencia', () => {
  assert.deepEqual(ordenPeps(shampoo).map((l) => l.idLote), [3, 7]);
});

test('existencia y valor al costo (mockup: 2 unidades, $13.30)', () => {
  assert.equal(existencia(shampoo), 2);
  assert.equal(valorAlCosto(shampoo), 13.3);
});

test('una salida de 1 toca solo el lote más antiguo', () => {
  const { partes, costo } = salidaPeps(shampoo, 1);
  assert.deepEqual(partes.map((p) => [p.idLote, p.cantidad]), [[3, 1]]);
  assert.equal(costo, 6.5);
});

test('una salida que pasa de un lote sigue con el siguiente', () => {
  const { partes, costo } = salidaPeps(shampoo, 2);
  assert.deepEqual(partes.map((p) => [p.idLote, p.cantidad]), [[3, 1], [7, 1]]);
  assert.equal(costo, 13.3);
});

test('no deja sacar más de lo que hay ni cantidades raras', () => {
  assert.throws(() => salidaPeps(shampoo, 3), RangeError);
  assert.throws(() => salidaPeps(shampoo, 0), RangeError);
  assert.throws(() => salidaPeps(shampoo, 1.5), RangeError);
});

test('costo de un ajuste de entrada: el de la última compra, aunque esté agotada', () => {
  assert.equal(ultimoCosto(shampoo), 6.8);
  assert.equal(ultimoCosto([{ ...shampoo[0], cantidadDisponible: 0 }]), 6.8);
  assert.equal(ultimoCosto([]), null);
});
