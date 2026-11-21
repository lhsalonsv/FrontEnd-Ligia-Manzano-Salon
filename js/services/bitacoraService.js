/**
 * bitacoraService.js — Ligia Manzano Salón
 * Bitácora: solo lectura. Contrato en docs/contrato-api.md → "Bitácora".
 *
 *   GET /api/bitacora?fecha=&modulo=&idUsuario=&buscar=&pagina=0&tamano=100 → { contenido, totalElementos, conteos, personas }
 *   GET /api/bitacora/{id} → registro + datosAntes, datosDespues, equipo
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { BITACORA_PRUEBA } from '../mocks/bitacora.js';

export const TAMANO_PAGINA = 100;

export async function listarBitacora({ fecha, modulo = '', idUsuario = '', buscar = '', pagina = 0 }) {
  if (DATOS_PRUEBA.bitacora) return listarPrueba(fecha, modulo, idUsuario, buscar, pagina);
  const params = new URLSearchParams({ fecha, pagina, tamano: TAMANO_PAGINA });
  if (modulo) params.set('modulo', modulo);
  if (idUsuario) params.set('idUsuario', idUsuario);
  if (buscar) params.set('buscar', buscar);
  return authFetch(`/bitacora?${params}`);
}

export async function obtenerRegistro(idBitacora) {
  if (DATOS_PRUEBA.bitacora) {
    await esperar();
    const r = BITACORA_PRUEBA.find((x) => x.idBitacora === Number(idBitacora));
    if (!r) throw new ApiError(404, 'No se encontró el registro.');
    return structuredClone(r);
  }
  return authFetch(`/bitacora/${idBitacora}`);
}

/** Todas las páginas del día con los filtros puestos (para exportar). */
export async function todoElDia(filtros) {
  const registros = [];
  for (let pagina = 0; ; pagina++) {
    const { contenido, totalElementos } = await listarBitacora({ ...filtros, pagina });
    registros.push(...contenido);
    if (!contenido.length || registros.length >= totalElementos) return registros;
  }
}

// --- Datos de prueba ---------------------------------------------------------
const esperar = () => new Promise((r) => setTimeout(r, 250));
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function listarPrueba(fecha, modulo, idUsuario, buscar, pagina) {
  await esperar();
  const texto = sinAcentos(buscar.trim());
  const delDia = BITACORA_PRUEBA.filter((r) => r.fechaHora.startsWith(fecha));
  const filtrados = delDia
    .filter((r) => !idUsuario || (idUsuario === 'sistema' ? r.idUsuario === null : r.idUsuario === Number(idUsuario)))
    .filter((r) => !texto || sinAcentos(r.descripcion).includes(texto) || sinAcentos(r.entidadId).includes(texto))
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora) || b.idBitacora - a.idBitacora);
  const conteos = { todo: filtrados.length };
  for (const r of filtrados) conteos[r.modulo] = (conteos[r.modulo] ?? 0) + 1;
  const enModulo = modulo ? filtrados.filter((r) => r.modulo === modulo) : filtrados;
  const personas = [...new Map(delDia.filter((r) => r.idUsuario).map((r) => [r.idUsuario, { idUsuario: r.idUsuario, nombreCompleto: r.nombreUsuario }])).values()];
  return {
    contenido: enModulo.slice(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA)
      .map(({ datosAntes, datosDespues, equipo, ...resumen }) => structuredClone(resumen)),
    totalElementos: enModulo.length,
    conteos,
    personas,
  };
}
