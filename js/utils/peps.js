/**
 * peps.js — Ligia Manzano Salón
 * Inventario PEPS (primero en entrar, primero en salir) con los lotes de un producto (tb_lotes).
 * El frontend lo usa para mostrar el costo antes de guardar un ajuste; el backend hace lo mismo
 * al vender o ajustar y es el que vale. Prueba: npm test
 *
 * Lote: { idLote, fechaIngreso, costoUnitario, cantidadInicial, cantidadDisponible }
 */
import { centavos } from './calculos.js';

/** Lotes con existencia, del más antiguo al más nuevo (el orden en que salen). */
export const ordenPeps = (lotes) => lotes
  .filter((l) => l.cantidadDisponible > 0)
  .sort((a, b) => String(a.fechaIngreso).localeCompare(String(b.fechaIngreso)) || a.idLote - b.idLote);

export const existencia = (lotes) => lotes.reduce((suma, l) => suma + l.cantidadDisponible, 0);

/** Valor del inventario al costo: cada lote a su costo. */
export const valorAlCosto = (lotes) => centavos(lotes.reduce((suma, l) => suma + l.cantidadDisponible * l.costoUnitario, 0));

/**
 * Qué lotes toca una salida de `cantidad` unidades.
 * @returns {{ partes: {idLote:number, fechaIngreso:string, cantidad:number, costoUnitario:number}[], costo:number }}
 * @throws {RangeError} si no alcanza la existencia
 */
export function salidaPeps(lotes, cantidad) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new RangeError('La cantidad tiene que ser un entero mayor que 0.');
  if (cantidad > existencia(lotes)) throw new RangeError('No hay suficiente existencia.');
  const partes = [];
  let falta = cantidad;
  for (const lote of ordenPeps(lotes)) {
    const sale = Math.min(falta, lote.cantidadDisponible);
    partes.push({ idLote: lote.idLote, fechaIngreso: lote.fechaIngreso, cantidad: sale, costoUnitario: lote.costoUnitario });
    falta -= sale;
    if (!falta) break;
  }
  return { partes, costo: centavos(partes.reduce((suma, p) => suma + p.cantidad * p.costoUnitario, 0)) };
}

/** Costo de la última compra (el lote más nuevo, tenga o no existencia). Es el costo de un ajuste de entrada. */
export const ultimoCosto = (lotes) => [...lotes]
  .sort((a, b) => String(b.fechaIngreso).localeCompare(String(a.fechaIngreso)) || b.idLote - a.idLote)[0]?.costoUnitario ?? null;
