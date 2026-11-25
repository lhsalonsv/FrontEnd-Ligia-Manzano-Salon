import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { clonarLotes, ajustarLotes, aplicarConteo, armarActa } from '../js/mocks/inventarioFisico.js';
import { PRODUCTOS_PRUEBA, MARCAS_PRUEBA, CATEGORIAS_PRUEBA } from '../js/mocks/inventario.js';
import { existencia, valorAlCosto } from '../js/utils/peps.js';
import { centavos } from '../js/utils/calculos.js';

const compras = [{ numeroCompra: 'C-0157', periodoIva: '2026-12-01', fechaCompra: '2026-12-03' }];
const catalogos = { productos: PRODUCTOS_PRUEBA, compras, marcas: MARCAS_PRUEBA, categorias: CATEGORIAS_PRUEBA, unidades: [{ codUnidadMedida: 59, nombre: 'Unidad' }] };
const activos = PRODUCTOS_PRUEBA.filter((p) => p.activo);

/** Cierra un conteo donde `diferencias` (idProducto → unidades) se suma a la existencia del sistema. */
function cerrar(diferencias) {
  const antes = clonarLotes(PRODUCTOS_PRUEBA);
  const contadas = new Map(activos.map((p) => [p.idProducto, existencia(antes.get(p.idProducto)) + (diferencias[p.idProducto] ?? 0)]));
  const r = aplicarConteo({ productos: PRODUCTOS_PRUEBA, lotes: antes, contadas, fechaCorte: '2026-12-31', idLoteInicial: 1000 });
  return { contadas, ...r, acta: armarActa({ ...catalogos, lotes: r.lotes }) };
}

test('tras cerrar, el acta trae por producto lo contado y el valor PEPS de los lotes que quedan', () => {
  const { contadas, lotes, acta } = cerrar({ 1: 3, 2: -2, 3: 4, 7: -1 });
  for (const p of activos) {
    const filas = acta.filter((f) => f.codigo === p.codigo);
    assert.equal(filas.reduce((s, f) => s + f.cantidad, 0), contadas.get(p.idProducto), p.nombreProducto);
    assert.equal(centavos(filas.reduce((s, f) => s + f.valor, 0)), valorAlCosto(lotes.get(p.idProducto)), p.nombreProducto);
  }
});

test('lo que sale se toma de los lotes más viejos y lo que entra nace al último costo', () => {
  const lotes = [
    { idLote: 1, fechaIngreso: '2026-01-01T10:00:00-06:00', costoUnitario: 5, cantidadInicial: 3, cantidadDisponible: 3 },
    { idLote: 2, fechaIngreso: '2026-02-01T10:00:00-06:00', costoUnitario: 6, cantidadInicial: 4, cantidadDisponible: 4 },
  ];
  const sale = ajustarLotes(lotes, -4, 9, '2026-12-31T23:59:59-06:00');
  assert.deepEqual(sale.lotes.map((l) => l.cantidadDisponible), [0, 3]);
  assert.equal(sale.valor, -21); // 3 × 5 + 1 × 6
  assert.equal(lotes[0].cantidadDisponible, 3, 'no toca los lotes de entrada');
  const entra = ajustarLotes(lotes, 2, 9, '2026-12-31T23:59:59-06:00');
  assert.deepEqual(entra.lotes.at(-1), { idLote: 9, fechaIngreso: '2026-12-31T23:59:59-06:00', costoUnitario: 6, cantidadInicial: 2, cantidadDisponible: 2, numeroCompra: null });
  assert.equal(entra.valor, 12);
});

test('el cierre congela el sistema y registra solo las diferencias, con su valor firmado', () => {
  const { sistema, ajustes } = cerrar({ 1: 1, 2: -1 });
  assert.equal(sistema.get(1).existenciaSistema, 2);
  assert.equal(sistema.get(1).valorSistema, 13.6);
  assert.deepEqual(ajustes.map((a) => [a.idProducto, a.cantidad]), [[1, 1], [2, -1]]);
  assert.equal(ajustes[0].valor, 6.8); // entra al último costo (lote 2)
  assert.ok(ajustes[1].valor < 0);
});

test('las filas del acta traen la referencia del libro de compras o "(ajuste)" y salen por categoría', () => {
  const { acta } = cerrar({ 1: 2 });
  assert.ok(acta.some((f) => f.referenciaCosto === 'Libro de compras 12/2026, compra C-0157'));
  assert.ok(acta.some((f) => f.referenciaCosto === 'Lote 1000 (ajuste)'));
  const categorias = acta.map((f) => f.categoria);
  assert.deepEqual(categorias, [...categorias].sort((a, b) => a.localeCompare(b, 'es')));
});

test('las descargas usan descargar() de xlsx.js: nadie más arma el Blob', () => {
  const dir = new URL('../js/controllersWeb/', import.meta.url);
  for (const nombre of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    assert.ok(!readFileSync(new URL(nombre, dir), 'utf8').includes('createObjectURL'), nombre);
  }
});
