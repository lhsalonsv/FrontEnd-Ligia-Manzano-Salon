/**
 * clientesService.js — Ligia Manzano Salón
 * Clientes (tb_clientes). Contrato en docs/contrato-api.md → "Clientes".
 *
 *   GET  /api/clientes?buscar=&filtro=&pagina=   → { contenido: [resumen], totalElementos, conteos }
 *   GET  /api/clientes/{id}                      → ficha completa
 *   POST /api/clientes        | PUT /api/clientes/{id}   → ficha guardada
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { CLIENTES_PRUEBA } from '../mocks/clientes.js';

/** Filtros de la lista (el backend recibe la clave). */
export const FILTROS = ['todos', 'este-mes', 'sin-venir-60', 'cumple-mes'];
export const TAMANO_PAGINA = 50;

export async function listarClientes({ buscar = '', filtro = 'todos', pagina = 0 } = {}) {
  if (DATOS_PRUEBA.clientes) return listarPrueba(buscar, filtro, pagina);
  const params = new URLSearchParams({ filtro, pagina, tamano: TAMANO_PAGINA });
  if (buscar.trim()) params.set('buscar', buscar.trim());
  return authFetch(`/clientes?${params}`);
}

export async function obtenerCliente(idCliente) {
  if (DATOS_PRUEBA.clientes) return obtenerPrueba(idCliente);
  return authFetch(`/clientes/${idCliente}`);
}

/** Crea (sin idCliente) o actualiza. `datos` lleva solo las columnas de tb_clientes en camelCase. */
export async function guardarCliente(datos, idCliente = null) {
  if (DATOS_PRUEBA.clientes) return guardarPrueba(datos, idCliente);
  return idCliente
    ? authFetch(`/clientes/${idCliente}`, { method: 'PUT', cuerpo: datos })
    : authFetch('/clientes', { method: 'POST', cuerpo: datos });
}

// --- Datos de prueba ---------------------------------------------------------
const esperar = () => new Promise((r) => setTimeout(r, 250));
const clientes = structuredClone(CLIENTES_PRUEBA);
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');

function cumpleFiltro(c, filtro) {
  const hoy = new Date();
  const visita = c.ultimaVisita ? new Date(`${c.ultimaVisita}T00:00:00`) : null;
  switch (filtro) {
    case 'este-mes': return visita && visita.getMonth() === hoy.getMonth() && visita.getFullYear() === hoy.getFullYear();
    case 'sin-venir-60': return visita && (hoy - visita) / 86_400_000 > 60;
    case 'cumple-mes': return c.mesCumple === hoy.getMonth() + 1;
    default: return true;
  }
}

function aResumen(c) {
  return {
    idCliente: c.idCliente, nombre: c.nombre, apellido: c.apellido, telefono: c.telefono,
    tieneAlergia: Boolean(c.alergias), ultimaVisita: c.ultimaVisita,
    visitas12m: c.visitas12m, gastado12m: c.gastado12m, proximaCita: c.proximaCita,
  };
}

async function listarPrueba(buscar, filtro, pagina) {
  await esperar();
  const texto = sinAcentos(buscar.trim());
  const digitos = soloDigitos(buscar);
  const encontrados = clientes.filter((c) => c.activo && (!texto
    || sinAcentos(`${c.nombre} ${c.apellido ?? ''}`).includes(texto)
    || (digitos.length >= 3 && (soloDigitos(c.telefono).includes(digitos) || soloDigitos(c.numDocumento).includes(digitos)))));

  const conteos = Object.fromEntries(FILTROS.map((f) => [f, encontrados.filter((c) => cumpleFiltro(c, f)).length]));
  const filtrados = encontrados
    .filter((c) => cumpleFiltro(c, filtro))
    .sort((a, b) => (b.ultimaVisita ?? '').localeCompare(a.ultimaVisita ?? ''));
  return {
    contenido: filtrados.slice(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA).map(aResumen),
    totalElementos: filtrados.length,
    conteos,
  };
}

async function obtenerPrueba(idCliente) {
  await esperar();
  const c = clientes.find((x) => x.idCliente === Number(idCliente));
  if (!c) throw new ApiError(404, 'No se encontró el cliente.');
  return structuredClone(c);
}

async function guardarPrueba(datos, idCliente) {
  await esperar();
  if (idCliente) {
    const c = clientes.find((x) => x.idCliente === Number(idCliente));
    if (!c) throw new ApiError(404, 'No se encontró el cliente.');
    Object.assign(c, datos);
    return structuredClone(c);
  }
  const nuevo = {
    ...structuredClone(CLIENTES_PRUEBA[CLIENTES_PRUEBA.length - 1]), // toma la forma completa del DTO
    ...datos,
    idCliente: Math.max(...clientes.map((c) => c.idCliente)) + 1,
    activo: true, creadoEn: new Date().toISOString(), ultimaVisita: null, visitas12m: 0, gastado12m: 0,
    empleadoFrecuente: null, ultimaFormula: null, ultimasVisitas: [], proximaCita: null,
  };
  clientes.push(nuevo);
  return structuredClone(nuevo);
}
