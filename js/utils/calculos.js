/**
 * calculos.js — Ligia Manzano Salón
 * Cálculos de dinero que el frontend muestra antes de guardar. El backend hace los mismos
 * y es el que vale; aquí se redondea igual que en la base (2 decimales en cada paso).
 * Prueba: npm test
 */

/** Redondeo a centavos sin el error de 1.005 → 1.00. */
export const centavos = (monto) => Math.round((Number(monto) + Number.EPSILON) * 100) / 100;

/** Precio con IVA → sin IVA (tb_detalle_ventas.subtotal_sin_iva). */
export const sinIva = (precioConIva, ivaPct) => centavos(precioConIva / (1 + ivaPct / 100));

/** Comisión de un servicio: % sobre el precio sin IVA (tb_comisiones.base_sin_iva × porcentaje). */
export const comisionServicio = (precioConIva, ivaPct, comisionPct) =>
  centavos(sinIva(precioConIva, ivaPct) * comisionPct / 100);

/**
 * Totales de una compra (tb_compras / tb_detalle_compras). Costos sin IVA; cada línea se redondea
 * a centavos y el IVA (crédito fiscal) se saca del subtotal. Solo el CCF lleva IVA aparte: en una
 * factura de consumidor final el IVA ya viene dentro del costo y no se acredita.
 * @param {{cantidad:number, costoUnitario:number}[]} lineas
 */
export function totalesCompra(lineas, ivaPct, tipoDocumento = 'CCF') {
  const subtotales = lineas.map((l) => centavos(l.cantidad * l.costoUnitario));
  const subtotalSinIva = centavos(subtotales.reduce((a, b) => a + b, 0));
  const iva = tipoDocumento === 'CCF' ? centavos(subtotalSinIva * ivaPct / 100) : 0;
  return { subtotales, subtotalSinIva, iva, total: centavos(subtotalSinIva + iva) };
}
