import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarRegistro } from '../js/mocks/registroInventario.js';
import { PRODUCTOS_PRUEBA, MARCAS_PRUEBA } from '../js/mocks/inventario.js';
import { existencia, valorAlCosto } from '../js/utils/peps.js';
import { centavos } from '../js/utils/calculos.js';
import { repartir } from '../js/utils/hojas.js';

// Una compra por cada numeroCompra de los lotes, como la arma comprasService
const compras = [...new Set(PRODUCTOS_PRUEBA.flatMap((p) => p.lotes.map((l) => l.numeroCompra)).filter(Boolean))].map((numeroCompra) => {
  const lote = PRODUCTOS_PRUEBA.flatMap((p) => p.lotes).find((l) => l.numeroCompra === numeroCompra);
  return { numeroCompra, fechaCompra: lote.fechaIngreso.slice(0, 10), tipoDocumentoProveedor: 'CCF', numeroDocumentoProveedor: `DTE-${numeroCompra}`,
    proveedor: { razonSocial: 'Proveedor de prueba', nacionalidad: 'El Salvador' } };
});
const registro = (periodo) => armarRegistro({ periodo, productos: PRODUCTOS_PRUEBA, compras, marcas: MARCAS_PRUEBA, unidades: [{ codUnidadMedida: 59, nombre: 'Unidad' }], emisor: {} });

/** Los últimos 14 meses hasta hoy ('AAAA-MM'). */
const meses = Array.from({ length: 14 }, (_, i) => {
  const f = new Date();
  f.setDate(1);
  f.setMonth(f.getMonth() - (13 - i));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
});

test('cada fila suma entradas y resta salidas al saldo, en unidades y en valor', () => {
  for (const periodo of meses) {
    for (const p of registro(periodo).productos) {
      let unidades = p.saldoInicial.unidades;
      let valor = p.saldoInicial.valor;
      for (const m of p.movimientos) {
        unidades += m.entradaUnidades - m.salidaUnidades;
        valor = centavos(valor + m.entradaValor - m.salidaValor);
        assert.equal(m.saldoUnidades, unidades, `${p.nombreProducto} ${periodo} fila ${m.correlativo}`);
        assert.equal(m.saldoValor, valor);
        assert.ok(m.saldoUnidades >= 0);
      }
    }
  }
});

test('el saldo inicial de un mes es el saldo final del anterior', () => {
  for (const [anterior, periodo] of meses.slice(0, -1).map((m, i) => [m, meses[i + 1]])) {
    const antes = new Map(registro(anterior).productos.map((p) => [p.idProducto, p.movimientos.at(-1)?.saldoUnidades ?? p.saldoInicial.unidades]));
    for (const p of registro(periodo).productos) assert.equal(p.saldoInicial.unidades, antes.get(p.idProducto) ?? 0, `${p.nombreProducto} ${periodo}`);
  }
});

test('el saldo final de cada producto es la suma de sus lotes y su valor al costo (PEPS)', () => {
  const actual = registro(meses.at(-1)).productos;
  for (const producto of PRODUCTOS_PRUEBA) {
    const p = actual.find((x) => x.idProducto === producto.idProducto);
    const unidades = p ? (p.movimientos.at(-1)?.saldoUnidades ?? p.saldoInicial.unidades) : 0;
    const valor = p ? (p.movimientos.at(-1)?.saldoValor ?? p.saldoInicial.valor) : 0;
    assert.equal(unidades, existencia(producto.lotes), producto.nombreProducto);
    assert.equal(valor, valorAlCosto(producto.lotes), producto.nombreProducto);
  }
});

test('repartir: filas por hoja y hoja extra si no caben los totales', () => {
  const filas = (n) => Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(repartir(filas(0), 2).map((h) => h.length), [0]);
  assert.deepEqual(repartir(filas(10), 2).map((h) => h.length), [10]);
  assert.deepEqual(repartir(filas(15), 2).map((h) => h.length), [15, 0]); // 15 > 16 - 2
  assert.deepEqual(repartir(filas(20), 1, 15).map((h) => h.length), [15, 5]);
  assert.deepEqual(repartir(filas(15), 1, 15).map((h) => h.length), [15, 0]);
});
