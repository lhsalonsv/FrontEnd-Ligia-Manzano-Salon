/**
 * Inventario de prueba. Solo se usa con DATOS_PRUEBA.inventario = true (js/config.js).
 * Productos, precios, existencias y costos del mockup diseno/pantallas/inventario.html;
 * marcas y códigos de barras ficticios. Las fechas son relativas a hoy.
 */

const hace = (dias) => {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  // fecha local con la zona de El Salvador (toISOString daría la de UTC)
  const dia = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  return `${dia}T10:00:00-06:00`;
};

export const CATEGORIAS_PRUEBA = [
  { idCategoria: 1, nombreCategoria: 'Cabello' },
  { idCategoria: 2, nombreCategoria: 'Tratamientos' },
  { idCategoria: 3, nombreCategoria: 'Uñas' },
  { idCategoria: 4, nombreCategoria: 'Accesorios' },
];

export const MARCAS_PRUEBA = [
  { idMarca: 1, nombreMarca: 'Aurora Pro' },
  { idMarca: 2, nombreMarca: 'Bella Raíz' },
  { idMarca: 3, nombreMarca: 'Nácar' },
  { idMarca: 4, nombreMarca: 'Estilo Pro' },
];

/** tb_parametros que usa el formulario: COMISION_PRODUCTO e IVA_PCT. */
export const PARAMETROS_INVENTARIO_PRUEBA = { comisionProducto: 2.0, ivaPct: 13 };

// [nombre, categoría, marca, precio, costo, existencia, mínimo, vendidos en 30 días]
const FILAS = [
  ['Acondicionador hidratante 400 ml', 1, 1, 13, 6.8, 8, 6, 9],
  ['Mascarilla reparadora 250 ml', 2, 2, 18, 9.5, 14, 5, 6],
  ['Aceite de argán 60 ml', 2, 2, 20, 10.4, 9, 4, 5],
  ['Sérum anti-frizz 50 ml', 2, 1, 16, 8.2, 5, 4, 7],
  ['Protector térmico 200 ml', 1, 4, 14, 7.1, 11, 5, 4],
  ['Ampolla reparadora 10 ml', 2, 2, 5, 2.3, 24, 12, 18],
  ['Esmalte gel rojo 15 ml', 3, 3, 7, 3.4, 0, 4, 10],
  ['Esmalte gel nude 15 ml', 3, 3, 7, 3.4, 6, 4, 8],
  ['Cepillo térmico redondo', 4, 4, 9, 4.5, 3, 4, 2],
  ['Spray fijador 300 ml', 1, 4, 11, 5.6, 7, 4, 3],
  ['Kit de limas y pulidor', 4, 3, 6, 2.8, 12, 6, 5],
  ['Crema para peinar 250 ml', 1, 1, 12, 6.1, 10, 5, 4],
  ['Gel fijador 250 g', 1, 4, 8, 3.9, 8, 4, 6],
];

let idLote = 100;

/** Un lote comprado hace 40 días (una compra por marca: C-0151 a C-0154) y sus ventas repartidas en el último mes. */
function productoSimple([nombre, idCategoria, idMarca, precio, costo, existencia, minimo, vendidos], i) {
  const inicial = existencia + vendidos;
  const lote = { idLote: ++idLote, fechaIngreso: hace(40), costoUnitario: costo, cantidadInicial: inicial, cantidadDisponible: existencia, numeroCompra: `C-015${idMarca}` };
  const ventas = Array.from({ length: vendidos }, (_, n) => ({
    fechaHora: hace(Math.round((n * 30) / vendidos)), tipo: 'SALIDA_VENTA', cantidad: -1, referencia: null, motivo: null,
  }));
  return {
    idProducto: i + 2, codigo: `74100000002${String(i + 10).padStart(2, '0')}`, nombreProducto: nombre, descripcion: null,
    idMarca, idCategoria, codUnidadMedida: 59, precioVenta: precio, comisionFija: 2, stockMinimo: minimo, activo: true,
    vendidos30d: vendidos,
    lotes: [lote],
    movimientos: [...ventas, { fechaHora: lote.fechaIngreso, tipo: 'ENTRADA_COMPRA', cantidad: inicial, referencia: lote.numeroCompra, motivo: null }],
  };
}

export const PRODUCTOS_PRUEBA = [
  // El del mockup: dos lotes con 1 cada uno, bajo el mínimo
  {
    idProducto: 1, codigo: '7410000000123', nombreProducto: 'Shampoo hidratante 400 ml', descripcion: 'Para cabello seco o maltratado.',
    idMarca: 1, idCategoria: 1, codUnidadMedida: 59, precioVenta: 13, comisionFija: 2, stockMinimo: 6, activo: true,
    vendidos30d: 15,
    lotes: [
      { idLote: 1, fechaIngreso: hace(63), costoUnitario: 6.5, cantidadInicial: 12, cantidadDisponible: 1, numeroCompra: 'C-0142' },
      { idLote: 2, fechaIngreso: hace(30), costoUnitario: 6.8, cantidadInicial: 12, cantidadDisponible: 1, numeroCompra: 'C-0157' },
    ],
    movimientos: [
      { fechaHora: hace(0), tipo: 'SALIDA_VENTA', cantidad: -1, referencia: 'DTE-01-…0412', motivo: null },
      { fechaHora: hace(2), tipo: 'SALIDA_VENTA', cantidad: -1, referencia: 'DTE-01-…0371', motivo: null },
      { fechaHora: hace(7), tipo: 'SALIDA_AJUSTE', cantidad: -1, referencia: null, motivo: 'Producto dañado: frasco roto' },
      { fechaHora: hace(30), tipo: 'ENTRADA_COMPRA', cantidad: 12, referencia: 'C-0157', motivo: null },
      { fechaHora: hace(63), tipo: 'ENTRADA_COMPRA', cantidad: 12, referencia: 'C-0142', motivo: null },
    ],
  },
  ...FILAS.map(productoSimple),
  // Desactivado: ya no se vende, pero conserva su historial
  {
    idProducto: 40, codigo: '7410000000999', nombreProducto: 'Tinte en crema 6.1 (descontinuado)', descripcion: null,
    idMarca: 2, idCategoria: 1, codUnidadMedida: 59, precioVenta: 9, comisionFija: 1, stockMinimo: 0, activo: false,
    vendidos30d: 0,
    lotes: [{ idLote: 90, fechaIngreso: hace(200), costoUnitario: 4.2, cantidadInicial: 6, cantidadDisponible: 0, numeroCompra: 'C-0098' }],
    movimientos: [{ fechaHora: hace(200), tipo: 'ENTRADA_COMPRA', cantidad: 6, referencia: 'C-0098', motivo: null }],
  },
];
