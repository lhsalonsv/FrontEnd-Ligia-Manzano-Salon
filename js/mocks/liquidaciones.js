/**
 * liquidaciones.js — Ligia Manzano Salón
 * Datos y reglas de prueba de las liquidaciones de tarjeta (tb_liquidaciones_tarjeta, migración 1.10).
 * Son funciones puras: liquidacionesService las usa y convierte los errores en ApiError.
 */
import { centavos } from '../utils/calculos.js';
import { fechaIso } from '../utils/formato.js';
import { CUENTAS_PRUEBA } from './cuentasContables.js';

export const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** Anticipo del 2 % (art. 162-A): 2 % de lo cobrado sin IVA, redondeado a centavos. */
export const anticipoPropuesto = (montoLiquidado, ivaPct = 13) => centavos(Number(montoLiquidado) / (1 + ivaPct / 100) * 0.02);

/** Lo que deposita el banco: lo cobrado menos el anticipo y la comisión con IVA. */
export const depositadoDe = ({ montoLiquidado, anticipoIva, comisionTotal }) =>
  centavos((Number(montoLiquidado) || 0) - (Number(anticipoIva) || 0) - (Number(comisionTotal) || 0));

export const nombreCuenta = (codigo) => CUENTAS_PRUEBA.find((c) => c[0] === codigo)?.[1] ?? '';
const CUENTAS_BANCO_PRUEBA = ['1101030101', '1101030102'];

const dosDecimales = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/**
 * Los checks de la tabla: { campos } para el 400 y { conflicto } para el 409 (el depositado no cuadra).
 * Las claves de `campos` son las del JSON.
 */
export function revisarLiquidacion(d) {
  const campos = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha ?? '')) campos.fecha = 'Elija la fecha de la liquidación.';
  if (!d.idProveedor) campos.idProveedor = 'Elija el banco.';
  if (!String(d.numeroDocumento ?? '').trim()) campos.numeroDocumento = 'Escriba el número del documento.';
  if (d.codigoGeneracion && !UUID.test(d.codigoGeneracion)) campos.codigoGeneracion = 'El código de generación tiene 36 caracteres (formato uuid).';
  if (!/^\d{4}-\d{2}-01$/.test(d.periodoIva ?? '')) campos.periodoIva = 'Elija el mes del IVA.';
  if (!d.codigoCuentaBanco) campos.codigoCuentaBanco = 'Elija la cuenta del banco.';
  const montos = [
    ['montoLiquidado', 'Escriba lo cobrado con tarjeta.', true],
    ['anticipoIva', 'Escriba el anticipo (0 si no hubo).', false],
    ['comisionTotal', 'Escriba la comisión (0 si no hubo).', false],
    ['montoDepositado', 'Escriba lo depositado.', false],
  ];
  for (const [clave, vacio, positivo] of montos) {
    const n = d[clave];
    if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) campos[clave] = vacio;
    else if (positivo ? Number(n) <= 0 : Number(n) < 0) campos[clave] = positivo ? 'Debe ser mayor que cero.' : 'No puede ser negativo.';
    else if (!dosDecimales(Number(n))) campos[clave] = 'Use como máximo 2 decimales.';
  }
  const conflicto = !Object.keys(campos).length && centavos(d.montoDepositado) !== depositadoDe(d)
    ? 'El depositado no cuadra: debe ser lo cobrado menos el anticipo y la comisión.' : null;
  return { campos, conflicto };
}

/** Mensaje del trigger tg_liquidacion_editable si no se puede editar ni borrar; null si sí. */
export const revisarEditable = (liq) => (liq.contabilizada
  ? `La liquidación ${liq.numeroDocumento} ya está contabilizada: borre el borrador o anule la partida primero` : null);

/** Tres liquidaciones de este mes: la primera ya contabilizada. */
export function liquidacionesIniciales(hoy = fechaIso()) {
  const mes = hoy.slice(0, 7);
  const dia = (d) => (hoy.slice(8) >= d ? `${mes}-${d}` : hoy);
  const base = (id, fecha, doc, uuid, liquidado, comision, cuenta, contabilizada) => ({
    idLiquidacion: id, fecha, idProveedor: 8, numeroDocumento: doc, codigoGeneracion: uuid, periodoIva: `${fecha.slice(0, 7)}-01`,
    montoLiquidado: liquidado, anticipoIva: anticipoPropuesto(liquidado), comisionTotal: comision,
    montoDepositado: centavos(liquidado - anticipoPropuesto(liquidado) - comision),
    codigoCuentaBanco: cuenta, nombreCuentaBanco: nombreCuenta(cuenta), idCompraComision: null, contabilizada,
  });
  return [
    base(1, dia('03'), 'LIQ-2026-000118', 'a1b2c3d4-0000-4000-8000-000000000118', 842.5, 13.56, CUENTAS_BANCO_PRUEBA[0], true),
    base(2, dia('10'), 'LIQ-2026-000131', 'a1b2c3d4-0000-4000-8000-000000000131', 615, 9.9, CUENTAS_BANCO_PRUEBA[0], false),
    base(3, dia('17'), 'LIQ-2026-000147', null, 230.4, 3.71, CUENTAS_BANCO_PRUEBA[1], false),
  ];
}
