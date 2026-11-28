/**
 * liquidacionesService.js — Ligia Manzano Salón
 * Liquidaciones de tarjeta (DTE 09 del banco).
 *
 *   GET    /api/liquidaciones-tarjeta?desde&hasta → { contenido: [liquidación] }
 *   POST   /api/liquidaciones-tarjeta | PUT /api/liquidaciones-tarjeta/{id}
 *          { fecha, idProveedor, numeroDocumento, codigoGeneracion, periodoIva, montoLiquidado, anticipoIva, comisionTotal,
 *            montoDepositado, codigoCuentaBanco, idCompraComision }
 *   DELETE /api/liquidaciones-tarjeta/{id}        → 204
 *   400 con `campos` si falta algo; 409 REGLA_DE_LA_BASE si está contabilizada o el depositado no cuadra.
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { PROVEEDORES_PRUEBA } from '../mocks/compras.js';
import { liquidacionesIniciales, revisarLiquidacion, revisarEditable, nombreCuenta } from '../mocks/liquidaciones.js';

const BASE = '/liquidaciones-tarjeta';

export async function listarLiquidaciones(desde, hasta) {
  if (DATOS_PRUEBA.liquidaciones) return listarPrueba(desde, hasta);
  return authFetch(`${BASE}?${new URLSearchParams({ desde, hasta })}`);
}

export async function guardarLiquidacion(datos, idLiquidacion = null) {
  if (DATOS_PRUEBA.liquidaciones) return guardarPrueba(datos, idLiquidacion);
  return idLiquidacion
    ? authFetch(`${BASE}/${idLiquidacion}`, { method: 'PUT', cuerpo: datos })
    : authFetch(BASE, { method: 'POST', cuerpo: datos });
}

export async function borrarLiquidacion(idLiquidacion) {
  if (DATOS_PRUEBA.liquidaciones) return borrarPrueba(idLiquidacion);
  return authFetch(`${BASE}/${idLiquidacion}`, { method: 'DELETE' });
}

// --- Datos de prueba ---------------------------------------------------------
const esperar = () => new Promise((r) => setTimeout(r, 250));
const liquidaciones = liquidacionesIniciales();

const regla = (mensaje) => new ApiError(409, mensaje, { codigo: 'REGLA_DE_LA_BASE', mensaje });
const conNombre = (l) => ({ ...structuredClone(l), nombreProveedor: PROVEEDORES_PRUEBA.find((p) => p.idProveedor === Number(l.idProveedor))?.nombreComercial ?? '' });

function buscar(id) {
  const l = liquidaciones.find((x) => x.idLiquidacion === Number(id));
  if (!l) throw new ApiError(404, 'No se encontró la liquidación.');
  return l;
}

async function listarPrueba(desde, hasta) {
  await esperar();
  const contenido = liquidaciones.filter((l) => l.fecha >= desde && l.fecha <= hasta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.idLiquidacion - a.idLiquidacion);
  return { contenido: contenido.map(conNombre) };
}

async function guardarPrueba(d, id) {
  await esperar();
  const actual = id ? buscar(id) : null;
  const bloqueo = actual && revisarEditable(actual);
  if (bloqueo) throw regla(bloqueo);
  const { campos, conflicto } = revisarLiquidacion(d);
  if (Object.keys(campos).length) throw new ApiError(400, 'Revise los datos de la liquidación.', { campos });
  if (conflicto) throw regla(conflicto);
  const repetida = d.codigoGeneracion && liquidaciones.find((l) => l !== actual && l.codigoGeneracion?.toLowerCase() === d.codigoGeneracion.toLowerCase());
  if (repetida) throw new ApiError(409, `Ese código de generación ya está en la liquidación ${repetida.numeroDocumento}.`, { campos: { codigoGeneracion: 'Ya está registrado.' } });
  const datos = {
    ...d, numeroDocumento: d.numeroDocumento.trim(), codigoGeneracion: d.codigoGeneracion?.toLowerCase() || null,
    idCompraComision: d.idCompraComision ?? null, nombreCuentaBanco: nombreCuenta(d.codigoCuentaBanco),
  };
  if (actual) return conNombre(Object.assign(actual, datos));
  const nueva = { idLiquidacion: Math.max(0, ...liquidaciones.map((l) => l.idLiquidacion)) + 1, ...datos, contabilizada: false };
  liquidaciones.push(nueva);
  return conNombre(nueva);
}

async function borrarPrueba(id) {
  await esperar();
  const l = buscar(id);
  const bloqueo = revisarEditable(l);
  if (bloqueo) throw regla(bloqueo);
  liquidaciones.splice(liquidaciones.indexOf(l), 1);
}
