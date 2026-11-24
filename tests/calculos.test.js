// npm test  (usa el corredor de pruebas que trae Node, sin instalar nada)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centavos, sinIva, comisionServicio, totalesCompra } from '../js/utils/calculos.js';

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

test('totales de una compra: valores del mockup de Compras', () => {
  // Registrar: 12 × 7.00 + 6 × 4.50 + 8 × 3.40
  assert.deepEqual(totalesCompra([{ cantidad: 12, costoUnitario: 7 }, { cantidad: 6, costoUnitario: 4.5 }, { cantidad: 8, costoUnitario: 3.4 }], 13),
    { subtotales: [84, 27, 27.2], subtotalSinIva: 138.2, comprasExentas: 0, iva: 17.97, ivaPercibido: 0, total: 156.17 });
  // C-0157: 12 × 6.80 + 12 × 6.80 + 6 × 9.50
  const c157 = totalesCompra([{ cantidad: 12, costoUnitario: 6.8 }, { cantidad: 12, costoUnitario: 6.8 }, { cantidad: 6, costoUnitario: 9.5 }], 13);
  assert.equal(c157.iva, 28.63);
  assert.equal(c157.total, 248.83);
  // Costo con 4 decimales: la línea se redondea a centavos
  assert.equal(totalesCompra([{ cantidad: 3, costoUnitario: 2.3333 }], 13).subtotalSinIva, 7);
  // Factura de consumidor final: sin crédito fiscal
  assert.equal(totalesCompra([{ cantidad: 2, costoUnitario: 5 }], 13, 'FACTURA').iva, 0);
});

test('compra con parte exenta, percepción del 1 % y nota de crédito (libro de compras)', () => {
  // Igual que prueba_1.3.sql: 40.00 gravado + 10.00 exento + 5.20 IVA = 55.20
  assert.deepEqual(totalesCompra([{ cantidad: 1, costoUnitario: 40 }], 13, 'CCF', { exentas: 10 }),
    { subtotales: [40], subtotalSinIva: 40, comprasExentas: 10, iva: 5.2, ivaPercibido: 0, total: 55.2 });
  // Gran contribuyente: 250.00 + 32.50 IVA + 2.50 percepción
  const percibida = totalesCompra([{ cantidad: 10, costoUnitario: 25 }], 13, 'CCF', { percepcion: true });
  assert.equal(percibida.ivaPercibido, 2.5);
  assert.equal(percibida.total, 285);
  // La nota de crédito del proveedor también lleva IVA (resta crédito fiscal)
  assert.equal(totalesCompra([{ cantidad: 1, costoUnitario: 10 }], 13, 'NC').iva, 1.3);
  // Sin crédito fiscal no hay percepción que acreditar
  assert.equal(totalesCompra([{ cantidad: 1, costoUnitario: 200 }], 13, 'FACTURA', { percepcion: true }).ivaPercibido, 0);
});
