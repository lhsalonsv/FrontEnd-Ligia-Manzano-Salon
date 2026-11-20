/**
 * catalogosService.js — Ligia Manzano Salón
 * Catálogos de Hacienda que usan los formularios (crédito fiscal, proveedores, empleados).
 *
 *   GET /api/catalogos/actividades → [{ codActividad, descripcion }]
 *   GET /api/catalogos/distritos   → [{ idDistrito, distrito, municipio, departamento }]
 *
 * Casi nunca cambian, así que se piden una vez por página.
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch } from '../utils/authFetch.js';
import { ACTIVIDADES_PRUEBA, DISTRITOS_PRUEBA } from '../mocks/catalogos.js';

const guardados = {};

function pedir(nombre, prueba) {
  guardados[nombre] ??= DATOS_PRUEBA.catalogos
    ? Promise.resolve(prueba)
    : authFetch(`/catalogos/${nombre}`).catch((error) => {
      delete guardados[nombre]; // que el siguiente intento vuelva a pedirlo
      throw error;
    });
  return guardados[nombre];
}

export const listarActividades = () => pedir('actividades', ACTIVIDADES_PRUEBA);
export const listarDistritos = () => pedir('distritos', DISTRITOS_PRUEBA);
