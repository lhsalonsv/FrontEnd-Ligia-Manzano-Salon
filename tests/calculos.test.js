// npm test  (usa el corredor de pruebas que trae Node, sin instalar nada)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centavos, sinIva, comisionServicio } from '../js/utils/calculos.js';

test('centavos redondea hacia arriba en .5', () => {
  assert.equal(centavos(1.005), 1.01);
  assert.equal(centavos(3.097), 3.1);
});

test('precio sin IVA (13 %)', () => {
  assert.equal(sinIva(60, 13), 53.1);
  assert.equal(sinIva(35, 13), 30.97);
  assert.equal(sinIva(0, 13), 0);
});

test('comisión 10 % sin IVA: valores del mockup de Servicios', () => {
  assert.equal(comisionServicio(60, 13, 10), 5.31);
  assert.equal(comisionServicio(12, 13, 10), 1.06);
  assert.equal(comisionServicio(35, 13, 10), 3.1);
  assert.equal(comisionServicio(45, 13, 10), 3.98);
  assert.equal(comisionServicio(18, 13, 10), 1.59);
});

test('se redondea primero la base sin IVA, como en tb_comisiones', () => {
  // $10.00 → base 8.85 → 0.885 → 0.89. El mockup dice $0.88 porque calculó sin redondear la base
  // (10 / 1.13 × 10 % = 0.88495). La regla buena es la de la base: base_sin_iva × porcentaje = monto.
  assert.equal(sinIva(10, 13), 8.85);
  assert.equal(comisionServicio(10, 13, 10), 0.89);
});
