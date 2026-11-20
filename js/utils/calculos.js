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
