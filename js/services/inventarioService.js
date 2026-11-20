/**
 * inventarioService.js — Ligia Manzano Salón
 * Productos de venta, sus lotes PEPS y los ajustes de existencia. Contrato en docs/contrato-api.md → "Inventario".
 *
 *   GET  /api/productos?buscar=&filtro=&idCategoria=&pagina=0&tamano=50
 *        → { contenido: [resumen], totalElementos, conteos, valorTotal, comisionProducto, ivaPct }
 *   GET  /api/productos/{id}            → ficha: producto + existencia, lotes, ultimoCosto, vendidos30d, ultimosMovimientos
 *   POST /api/productos | PUT /api/productos/{id}
 *   POST /api/productos/{id}/ajustes    { tipo: 'DANADO' | 'USO_SALON' | 'CONTEO', cantidad, motivo } → ficha
 *   GET  /api/categorias · GET /api/marcas · POST /api/marcas { nombreMarca }
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { existencia, valorAlCosto, ordenPeps, salidaPeps, ultimoCosto } from '../utils/peps.js';
import {
  PRODUCTOS_PRUEBA, CATEGORIAS_PRUEBA, MARCAS_PRUEBA, PARAMETROS_INVENTARIO_PRUEBA,
} from '../mocks/inventario.js';

export const TAMANO_PAGINA = 50;

export async function listarProductos({ buscar = '', filtro = 'todos', idCategoria = '', pagina = 0 } = {}) {
  if (DATOS_PRUEBA.inventario) return listarPrueba(buscar, filtro, idCategoria, pagina);
  const params = new URLSearchParams({ filtro, pagina, tamano: TAMANO_PAGINA });
  if (buscar) params.set('buscar', buscar);
  if (idCategoria) params.set('idCategoria', idCategoria);
  return authFetch(`/productos?${params}`);
}

export async function obtenerProducto(idProducto) {
  if (DATOS_PRUEBA.inventario) return fichaPrueba(idProducto);
  return authFetch(`/productos/${idProducto}`);
}

/** Crea (sin idProducto) o actualiza. Un producto nuevo empieza en 0: la existencia llega con las compras. */
export async function guardarProducto(datos, idProducto = null) {
  if (DATOS_PRUEBA.inventario) return guardarPrueba(datos, idProducto);
  return idProducto
    ? authFetch(`/productos/${idProducto}`, { method: 'PUT', cuerpo: datos })
    : authFetch('/productos', { method: 'POST', cuerpo: datos });
}

/** Dañado, uso en el salón o conteo físico. La API descuenta por PEPS y lo deja en el kardex y la bitácora. */
export async function ajustarExistencia(idProducto, ajuste) {
  if (DATOS_PRUEBA.inventario) return ajustarPrueba(idProducto, ajuste);
  return authFetch(`/productos/${idProducto}/ajustes`, { method: 'POST', cuerpo: ajuste });
}

export async function listarCategorias() {
  if (DATOS_PRUEBA.inventario) return structuredClone(CATEGORIAS_PRUEBA);
  return authFetch('/categorias');
}

export async function listarMarcas() {
  if (DATOS_PRUEBA.inventario) return structuredClone(marcas);
  return authFetch('/marcas');
}

/** "Si la marca no está, se agrega aquí mismo" (mockup Nuevo producto). */
export async function crearMarca(nombreMarca) {
  if (DATOS_PRUEBA.inventario) return crearMarcaPrueba(nombreMarca);
  return authFetch('/marcas', { method: 'POST', cuerpo: { nombreMarca } });
}

// --- Datos de prueba ---------------------------------------------------------
const esperar = () => new Promise((r) => setTimeout(r, 250));
const productos = PRODUCTOS_PRUEBA; // sin copiar: comprasService le agrega lotes al registrar una compra
const marcas = structuredClone(MARCAS_PRUEBA);
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const categoria = (id) => CATEGORIAS_PRUEBA.find((c) => c.idCategoria === id)?.nombreCategoria ?? '';

function buscarProducto(idProducto) {
  const p = productos.find((x) => x.idProducto === Number(idProducto));
  if (!p) throw new ApiError(404, 'No se encontró el producto.');
  return p;
}

/** Costo PEPS: el del lote que sale primero; si está agotado, el de la última compra. */
const costoPeps = (lotes) => ordenPeps(lotes)[0]?.costoUnitario ?? ultimoCosto(lotes);

function aResumen(p) {
  return {
    idProducto: p.idProducto, codigo: p.codigo, nombreProducto: p.nombreProducto, nombreCategoria: categoria(p.idCategoria),
    existencia: existencia(p.lotes), stockMinimo: p.stockMinimo, costoPeps: costoPeps(p.lotes),
    precioVenta: p.precioVenta, valorCosto: valorAlCosto(p.lotes), activo: p.activo,
  };
}

const enFiltro = (r, filtro) => {
  if (filtro === 'inactivos') return !r.activo;
  if (!r.activo) return false;
  if (filtro === 'bajo-minimo') return r.existencia < r.stockMinimo;
  if (filtro === 'agotados') return r.existencia === 0;
  return true;
};

async function listarPrueba(buscar, filtro, idCategoria, pagina) {
  await esperar();
  const texto = sinAcentos(buscar.trim());
  const resumenes = productos.map(aResumen)
    .filter((r) => !texto || sinAcentos(r.nombreProducto).includes(texto) || r.codigo.includes(texto))
    .filter((r) => !idCategoria || productos.find((p) => p.idProducto === r.idProducto).idCategoria === Number(idCategoria))
    .sort((a, b) => a.nombreProducto.localeCompare(b.nombreProducto, 'es'));
  const filtrados = resumenes.filter((r) => enFiltro(r, filtro));
  const conteos = Object.fromEntries(['todos', 'bajo-minimo', 'agotados', 'inactivos'].map((f) => [f, resumenes.filter((r) => enFiltro(r, f)).length]));
  return {
    contenido: filtrados.slice(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA),
    totalElementos: filtrados.length,
    conteos,
    valorTotal: valorAlCosto(productos.flatMap((p) => p.lotes)),
    ...PARAMETROS_INVENTARIO_PRUEBA,
  };
}

async function fichaPrueba(idProducto) {
  await esperar();
  const p = structuredClone(buscarProducto(idProducto));
  const { lotes, movimientos, ...datos } = p;
  return {
    ...datos,
    nombreCategoria: categoria(p.idCategoria),
    nombreMarca: marcas.find((m) => m.idMarca === p.idMarca)?.nombreMarca ?? '',
    existencia: existencia(lotes),
    costoPeps: costoPeps(lotes),
    ultimoCosto: ultimoCosto(lotes),
    lotes: ordenPeps(lotes),
    ultimosMovimientos: movimientos.sort((a, b) => b.fechaHora.localeCompare(a.fechaHora)).slice(0, 5),
  };
}

async function guardarPrueba(datos, idProducto) {
  await esperar();
  const repetido = productos.find((x) => x.codigo === datos.codigo && x.idProducto !== Number(idProducto));
  if (repetido) {
    throw new ApiError(409, `Ese código ya es de “${repetido.nombreProducto}”.`, {
      codigo: 'PRODUCTO_DUPLICADO', campos: { codigo: 'Ya hay un producto con este código.' }, idProductoExistente: repetido.idProducto,
    });
  }
  if (idProducto) {
    Object.assign(buscarProducto(idProducto), datos);
    return fichaPrueba(idProducto);
  }
  const nuevo = { ...datos, idProducto: Math.max(...productos.map((x) => x.idProducto)) + 1, vendidos30d: 0, lotes: [], movimientos: [] };
  productos.push(nuevo);
  return fichaPrueba(nuevo.idProducto);
}

async function ajustarPrueba(idProducto, { tipo, cantidad, motivo }) {
  await esperar();
  const p = buscarProducto(idProducto);
  const hay = existencia(p.lotes);
  const ahora = new Date().toISOString();
  const salida = (n, tipoMovimiento) => {
    if (n > hay) {
      throw new ApiError(409, `Solo hay ${hay} en existencia.`, { codigo: 'STOCK_INSUFICIENTE', campos: { cantidad: `Solo hay ${hay}.` } });
    }
    // Una fila del kardex por cada lote que toca, como en tb_movimientos_inventario
    for (const parte of salidaPeps(p.lotes, n).partes) {
      p.lotes.find((l) => l.idLote === parte.idLote).cantidadDisponible -= parte.cantidad;
      p.movimientos.push({ fechaHora: ahora, tipo: tipoMovimiento, cantidad: -parte.cantidad, referencia: null, motivo });
    }
  };

  if (tipo === 'CONTEO') {
    const diferencia = cantidad - hay;
    if (diferencia === 0) throw new ApiError(400, 'El conteo es igual a la existencia: no hay nada que ajustar.', { campos: { cantidad: 'Es igual a la existencia.' } });
    if (diferencia < 0) salida(-diferencia, 'SALIDA_AJUSTE');
    else {
      const costo = ultimoCosto(p.lotes);
      if (costo === null) {
        throw new ApiError(400, 'Este producto nunca se ha comprado: registre una compra para que tenga costo.', { campos: { cantidad: 'Sin compras, no hay costo para la entrada.' } });
      }
      p.lotes.push({ idLote: Math.max(0, ...p.lotes.map((l) => l.idLote)) + 1000, fechaIngreso: ahora, costoUnitario: costo, cantidadInicial: diferencia, cantidadDisponible: diferencia, numeroCompra: null });
      p.movimientos.push({ fechaHora: ahora, tipo: 'ENTRADA_AJUSTE', cantidad: diferencia, referencia: null, motivo });
    }
  } else {
    salida(cantidad, tipo === 'USO_SALON' ? 'USO_SALON' : 'SALIDA_AJUSTE');
  }
  return fichaPrueba(idProducto);
}

async function crearMarcaPrueba(nombreMarca) {
  await esperar();
  if (marcas.some((m) => sinAcentos(m.nombreMarca) === sinAcentos(nombreMarca))) {
    throw new ApiError(409, 'Esa marca ya existe.', { campos: { nombreMarca: 'Esa marca ya existe.' } });
  }
  const nueva = { idMarca: Math.max(...marcas.map((m) => m.idMarca)) + 1, nombreMarca };
  marcas.push(nueva);
  return nueva;
}
