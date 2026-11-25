/**
 * inventarioFisicoService.js — Ligia Manzano Salón
 * Inventario físico al 31 de diciembre y su acta (art. 142 del Código Tributario). Contrato en docs/contrato-api.md → "Inventario físico".
 *
 *   GET  /api/inventario-fisico                     → [{ idInventarioFisico, fechaCorte, estado, productosContados, creadoEn, cerradoEn }]
 *   POST /api/inventario-fisico {fechaCorte}        → 201 conteo nuevo (BORRADOR)
 *   GET  /api/inventario-fisico/{id}                → { ..., emisor, conteo, acta?, ajustes? }
 *   PUT  /api/inventario-fisico/{id}/conteo         → [{ idProducto, cantidadContada, nota }]
 *   POST /api/inventario-fisico/{id}/cerrar         → { observaciones }
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { centavos } from '../utils/calculos.js';
import { fechaIso } from '../utils/formato.js';
import { PRODUCTOS_PRUEBA } from '../mocks/inventario.js';
import { UNIDADES_PRUEBA } from '../mocks/catalogos.js';
import { NEGOCIO_PRUEBA } from '../mocks/configuracion.js';
import { clonarLotes, aplicarConteo, armarActa, armarConteo } from '../mocks/inventarioFisico.js';
import { comprasDePrueba } from './comprasService.js';
import { listarCategorias, listarMarcas } from './inventarioService.js';

const ruta = (id) => `/inventario-fisico/${id}`;

export const listarInventariosFisicos = () => (DATOS_PRUEBA.inventarioFisico ? listaPrueba() : authFetch('/inventario-fisico'));
export const obtenerInventarioFisico = (id) => (DATOS_PRUEBA.inventarioFisico ? detallePrueba(id) : authFetch(ruta(id)));
/** @param {string} fechaCorte 'AAAA-MM-DD' */
export const crearInventarioFisico = (fechaCorte) => (DATOS_PRUEBA.inventarioFisico ? crearPrueba(fechaCorte) : authFetch('/inventario-fisico', { method: 'POST', cuerpo: { fechaCorte } }));
/** @param {{idProducto:number, cantidadContada:number, nota:string|null}[]} filas */
export const guardarConteo = (id, filas) => (DATOS_PRUEBA.inventarioFisico ? guardarPrueba(id, filas) : authFetch(`${ruta(id)}/conteo`, { method: 'PUT', cuerpo: filas }));
export const cerrarInventarioFisico = (id, observaciones) => (DATOS_PRUEBA.inventarioFisico ? cerrarPrueba(id, observaciones) : authFetch(`${ruta(id)}/cerrar`, { method: 'POST', cuerpo: { observaciones } }));

// --- Para las pantallas ---------------------------------------------------

/** El acta por categoría, con el subtotal de cada una y el total general (lo usan la pantalla y la hoja impresa). */
export function agruparActa(acta) {
  const grupos = [];
  for (const fila of acta) {
    let grupo = grupos.find((g) => g.categoria === fila.categoria);
    if (!grupo) grupos.push(grupo = { categoria: fila.categoria, filas: [], subtotal: 0 });
    grupo.filas.push(fila);
    grupo.subtotal = centavos(grupo.subtotal + fila.valor);
  }
  return { grupos, total: centavos(grupos.reduce((suma, g) => suma + g.subtotal, 0)) };
}

// --- Datos de prueba (viven mientras la pestaña esté abierta) ----------------

const esperar = () => new Promise((r) => setTimeout(r, 250));
const error = (estado, mensaje, campos) => new ApiError(estado, mensaje, { mensaje, ...(campos && { campos }) });

let prueba = null; // { catalogos, lotes, siguienteIdLote, conteos[] }

// Los conteos de prueba se guardan en sessionStorage: crear o abrir un conteo recarga la página y el acta se imprime en otra.
const CLAVE_PRUEBA = 'lms.prueba-inventario-fisico';
function guardarSesion() {
  const { lotes, siguienteIdLote, conteos } = prueba;
  try {
    sessionStorage.setItem(CLAVE_PRUEBA, JSON.stringify({
      lotes: [...lotes], siguienteIdLote, conteos: conteos.map((c) => ({ ...c, filas: [...c.filas], congelado: c.congelado && [...c.congelado] })),
    }));
  } catch { /* sin almacenamiento: los conteos nuevos duran lo que dure la página */ }
}
function leerSesion() {
  try {
    const d = JSON.parse(sessionStorage.getItem(CLAVE_PRUEBA));
    return d && { lotes: new Map(d.lotes), siguienteIdLote: d.siguienteIdLote, conteos: d.conteos.map((c) => ({ ...c, filas: new Map(c.filas), congelado: c.congelado && new Map(c.congelado) })) };
  } catch { return null; }
}

/** Cierra un conteo con las cantidades contadas: aplica los ajustes a los lotes de la sesión y guarda el acta. */
function cerrar(conteo, observaciones) {
  const { catalogos } = prueba;
  const contadas = new Map([...conteo.filas].map(([id, f]) => [id, f.cantidadContada]));
  const r = aplicarConteo({ productos: catalogos.productos, lotes: prueba.lotes, contadas, fechaCorte: conteo.fechaCorte, idLoteInicial: prueba.siguienteIdLote });
  prueba.lotes = r.lotes;
  prueba.siguienteIdLote = r.siguienteIdLote;
  Object.assign(conteo, { estado: 'CERRADO', observaciones, congelado: r.sistema, ajustes: r.ajustes, acta: armarActa({ ...catalogos, lotes: r.lotes }) });
}

/** Un conteo cerrado el 31 de diciembre pasado, con un sobrante y un faltante, para que la pantalla no arranque vacía. */
async function iniciarPrueba() {
  if (prueba) return prueba;
  const catalogos = { productos: PRODUCTOS_PRUEBA, compras: comprasDePrueba(), marcas: await listarMarcas(), categorias: await listarCategorias(), unidades: UNIDADES_PRUEBA };
  if (prueba) return prueba; // otra llamada lo armó mientras esperaba los catálogos
  const guardado = leerSesion();
  if (guardado) return (prueba = { catalogos, ...guardado });
  prueba = { catalogos, lotes: clonarLotes(PRODUCTOS_PRUEBA), siguienteIdLote: 1000, conteos: [] };
  const fechaCorte = `${new Date().getFullYear() - 1}-12-31`;
  const diferencias = { 3: [2, 'Dos frascos estaban en la bodega'], 5: [-1, 'Producto dañado: frasco roto'] }; // idProducto → [diferencia, nota]
  const filas = new Map(armarConteo({ ...catalogos, lotes: prueba.lotes, filas: new Map(), congelado: null }).map((c) => {
    const [dif = 0, nota = null] = diferencias[c.idProducto] ?? [];
    return [c.idProducto, { cantidadContada: c.existenciaSistema + dif, nota }];
  }));
  const conteo = { idInventarioFisico: 1, fechaCorte, estado: 'BORRADOR', creadoEn: `${fechaCorte}T18:00:00-06:00`, cerradoEn: `${fechaCorte}T20:30:00-06:00`, filas };
  cerrar(conteo, 'Conteo hecho con la contadora. Las diferencias quedaron como ajustes en el registro de inventarios.');
  prueba.conteos.push(conteo);
  guardarSesion();
  return prueba;
}

async function buscar(id) {
  const { conteos } = await iniciarPrueba();
  const c = conteos.find((x) => x.idInventarioFisico === Number(id));
  if (!c) throw error(404, 'No se encontró el inventario físico.');
  return c;
}

const contados = (c) => [...c.filas.values()].filter((f) => f.cantidadContada !== null).length;

async function listaPrueba() {
  await esperar();
  const { conteos } = await iniciarPrueba();
  return [...conteos].sort((a, b) => b.fechaCorte.localeCompare(a.fechaCorte)).map((c) => ({
    idInventarioFisico: c.idInventarioFisico, fechaCorte: c.fechaCorte, estado: c.estado, productosContados: contados(c), creadoEn: c.creadoEn, cerradoEn: c.estado === 'CERRADO' ? c.cerradoEn : null,
  }));
}

function detalle(c) {
  const { catalogos, lotes } = prueba;
  return {
    idInventarioFisico: c.idInventarioFisico, fechaCorte: c.fechaCorte, estado: c.estado, observaciones: c.observaciones ?? null,
    cerradoEn: c.estado === 'CERRADO' ? c.cerradoEn : null,
    emisor: { nombre: NEGOCIO_PRUEBA.nombre, nit: NEGOCIO_PRUEBA.nit, nrc: NEGOCIO_PRUEBA.nrc },
    conteo: armarConteo({ ...catalogos, lotes, filas: c.filas, congelado: c.congelado ?? null }),
    ...(c.estado === 'CERRADO' && { acta: c.acta, ajustes: c.ajustes }),
  };
}

async function detallePrueba(id) {
  await esperar();
  return structuredClone(detalle(await buscar(id)));
}

async function crearPrueba(fechaCorte) {
  await esperar();
  const { conteos } = await iniciarPrueba();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte ?? '') || fechaCorte > fechaIso()) throw error(400, 'Revisa los datos marcados.', { fechaCorte: 'La fecha de corte no puede ser futura.' });
  if (conteos.some((c) => c.fechaCorte === fechaCorte)) throw error(409, 'Ya hay un inventario físico con esa fecha de corte.');
  if (conteos.some((c) => c.estado === 'BORRADOR')) throw error(400, 'Revisa los datos marcados.', { fechaCorte: 'Ya hay un conteo abierto: ciérralo antes de empezar otro.' });
  const c = { idInventarioFisico: Math.max(...conteos.map((x) => x.idInventarioFisico)) + 1, fechaCorte, estado: 'BORRADOR', creadoEn: new Date().toISOString(), cerradoEn: null, filas: new Map() };
  conteos.push(c);
  guardarSesion();
  return structuredClone(detalle(c));
}

async function guardarPrueba(id, filas) {
  await esperar();
  const c = await buscar(id);
  if (c.estado === 'CERRADO') throw error(409, 'El inventario ya está cerrado y no se puede cambiar.');
  const validos = new Set(prueba.catalogos.productos.filter((p) => p.activo).map((p) => p.idProducto));
  if (filas.some((f) => !validos.has(f.idProducto) || !Number.isInteger(f.cantidadContada) || f.cantidadContada < 0)) {
    throw error(400, 'Revisa los datos marcados.', { conteo: 'Hay cantidades inválidas: tienen que ser enteros desde 0.' });
  }
  for (const f of filas) c.filas.set(f.idProducto, { cantidadContada: f.cantidadContada, nota: f.nota?.trim() || null });
  guardarSesion();
  return structuredClone(detalle(c));
}

async function cerrarPrueba(id, observaciones) {
  await esperar();
  const c = await buscar(id);
  if (c.estado === 'CERRADO') throw error(409, 'El inventario ya está cerrado.');
  const faltan = prueba.catalogos.productos.filter((p) => p.activo && c.filas.get(p.idProducto)?.cantidadContada == null);
  if (faltan.length) throw error(400, 'Faltan productos por contar.', { conteo: faltan.map((p) => ({ idProducto: p.idProducto, nombreProducto: p.nombreProducto })) });
  cerrar(c, observaciones?.trim() || null);
  c.cerradoEn = new Date().toISOString();
  guardarSesion();
  return structuredClone(detalle(c));
}
