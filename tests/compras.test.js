import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisarDevolucion, aplicarDevolucion, revisarCuentas, ultimaCuenta } from '../js/mocks/compras.js';
import { armarRegistro } from '../js/mocks/registroInventario.js';
import { PRODUCTOS_PRUEBA, MARCAS_PRUEBA } from '../js/mocks/inventario.js';

// La compra C-0157 trajo 12 del producto 1 en el lote 2, del que hoy quedan 2
const relacionada = { numeroCompra: 'C-0157', lineas: [{ idProducto: 1, idLote: 2, cantidad: 12 }] };
const lote2 = (productos) => productos.find((p) => p.idProducto === 1).lotes.find((l) => l.idLote === 2);

test('una NC solo devuelve productos de la compra que corrige y no más de lo que trajo', () => {
  const productos = structuredClone(PRODUCTOS_PRUEBA);
  assert.match(revisarDevolucion(relacionada, [{ idProducto: 2, cantidad: 1 }], productos).campos.agregar, /no viene en la compra C-0157/);
  assert.match(revisarDevolucion(relacionada, [{ idProducto: 1, cantidad: 13 }], productos).campos.agregar, /trajo 12/);
  assert.deepEqual(revisarDevolucion(relacionada, [{ descripcion: 'Descuento', cantidad: 1, costoUnitario: 5 }], productos), { campos: {}, conflicto: null });
});

test('si el lote ya no tiene las unidades es un conflicto (409) y no se mueve nada', () => {
  const productos = structuredClone(PRODUCTOS_PRUEBA);
  const { campos, conflicto } = revisarDevolucion(relacionada, [{ idProducto: 1, cantidad: 3 }], productos);
  assert.deepEqual(campos, {});
  assert.match(conflicto, /^De .+ solo quedan 2 unidades del lote de esa compra: no se pueden devolver 3$/);
  assert.equal(lote2(productos).cantidadDisponible, 2);
});

test('la devolución baja el lote relacionado y queda en el kardex como DEVOLUCION_PROVEEDOR con la NC como documento', () => {
  const productos = structuredClone(PRODUCTOS_PRUEBA);
  const ahora = new Date().toISOString();
  const detalle = [{ idProducto: 1, cantidad: 2, costoUnitario: 6.8 }, { descripcion: 'Descuento', cantidad: 1, costoUnitario: 5 }];
  assert.equal(revisarDevolucion(relacionada, detalle, productos).conflicto, null);
  const lineas = aplicarDevolucion(relacionada, detalle, productos, 'C-0200', ahora);
  assert.equal(lineas[0].idLote, 2);
  assert.equal(lote2(productos).cantidadDisponible, 0);

  const nc = { numeroCompra: 'C-0200', tipoDocumentoProveedor: 'NC', numeroDocumentoProveedor: 'DTE-05-1', proveedor: { razonSocial: 'Aurora', nacionalidad: 'El Salvador' } };
  const { productos: lista } = armarRegistro({ periodo: ahora.slice(0, 7), idProducto: 1, productos, compras: [nc], marcas: MARCAS_PRUEBA, unidades: [], emisor: {} });
  const fila = lista[0].movimientos.find((m) => m.tipo === 'DEVOLUCION_PROVEEDOR');
  assert.equal(fila.descripcionOperacion, 'Devolución a proveedor');
  assert.equal(fila.idLote, 2);
  assert.equal(fila.costoUnitario, 6.8, 'al costo del lote');
  assert.equal(fila.salidaUnidades, 2);
  assert.deepEqual([fila.tipoDocumento, fila.numeroDocumento, fila.proveedor], ['NC', 'DTE-05-1', 'Aurora']);
  assert.equal(lista[0].movimientos.at(-1).saldoUnidades, 0);
});

test('la sugerencia es la última cuenta usada con el proveedor (null si nunca se usó una)', () => {
  const nueva = { lineas: [{ descripcion: 'Luz', codigoCuenta: '51010302' }] };
  const vieja = { lineas: [{ descripcion: 'Alquiler', codigoCuenta: '5101040101' }] };
  assert.equal(ultimaCuenta([nueva, vieja]), '51010302');
  assert.equal(ultimaCuenta([{ lineas: [{ idProducto: 1 }] }, vieja]), '5101040101');
  assert.equal(ultimaCuenta([{ lineas: [{ idProducto: 1 }] }]), null);
});

test('cada gasto exige su cuenta y las compras exentas también; los productos no', () => {
  const detalle = [{ clave: 'g1', descripcion: 'Luz' }, { clave: 'g2', descripcion: 'Agua', codigoCuenta: '51010302' }, { idProducto: 1, clave: 'p' }];
  assert.deepEqual(revisarCuentas(detalle, 0, null), { 'cuenta-g1': 'Elige la cuenta contable de este gasto.' });
  assert.deepEqual(Object.keys(revisarCuentas(detalle.slice(1), 10, null)), ['codigoCuentaExentas']);
  assert.deepEqual(revisarCuentas(detalle.slice(1), 10, '5101040101'), {});
});
