/**
 * registroInventarioService.js — Ligia Manzano Salón
 * Registro de control de inventarios (kardex por producto y mes; solo lectura).
 * Contrato en docs/contrato-api.md → "Registro de control de inventarios".
 *
 *   GET /api/inventario/registro?periodo=2026-11[&idProducto=3]
 *       → { emisor, periodo, productos: [{ idProducto, codigo, nombreProducto, marca, unidadMedida, saldoInicial, movimientos }] }
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch } from '../utils/authFetch.js';
import { centavos } from '../utils/calculos.js';
import { PRODUCTOS_PRUEBA } from '../mocks/inventario.js';
import { UNIDADES_PRUEBA } from '../mocks/catalogos.js';
import { NEGOCIO_PRUEBA } from '../mocks/configuracion.js';
import { armarRegistro } from '../mocks/registroInventario.js';
import { comprasDePrueba } from './comprasService.js';
import { listarMarcas } from './inventarioService.js';

/** @param {string} periodo 'AAAA-MM' @param {number|string} [idProducto] */
export async function obtenerRegistro(periodo, idProducto = '') {
  if (DATOS_PRUEBA.registroInventario) return registroPrueba(periodo, idProducto);
  const params = new URLSearchParams({ periodo });
  if (idProducto) params.set('idProducto', idProducto);
  return authFetch(`/inventario/registro?${params}`);
}

const esperar = () => new Promise((r) => setTimeout(r, 250));

async function registroPrueba(periodo, idProducto) {
  await esperar();
  const emisor = { nombre: NEGOCIO_PRUEBA.nombre, nit: NEGOCIO_PRUEBA.nit, nrc: NEGOCIO_PRUEBA.nrc };
  return armarRegistro({
    periodo, idProducto, productos: PRODUCTOS_PRUEBA, compras: comprasDePrueba(), marcas: await listarMarcas(), unidades: UNIDADES_PRUEBA, emisor,
  });
}

// --- Para las dos pantallas --------------------------------------------------

/** Las filas de un producto con la de "Saldo inicial" al principio (misma forma que un movimiento). */
export const filasDeProducto = (p) => [
  { esSaldoInicial: true, correlativo: '', descripcionOperacion: 'Saldo inicial', saldoUnidades: p.saldoInicial.unidades, saldoValor: p.saldoInicial.valor },
  ...p.movimientos,
];

/** Entradas y salidas del mes y el saldo final (el de la última fila, o el inicial si no hubo movimientos). */
export function totalesProducto(p) {
  const suma = (campo) => centavos(p.movimientos.reduce((s, m) => s + m[campo], 0));
  const ultima = p.movimientos.at(-1);
  return {
    entradaUnidades: suma('entradaUnidades'), salidaUnidades: suma('salidaUnidades'), entradaValor: suma('entradaValor'), salidaValor: suma('salidaValor'),
    saldoUnidades: ultima?.saldoUnidades ?? p.saldoInicial.unidades, saldoValor: ultima?.saldoValor ?? p.saldoInicial.valor,
  };
}
