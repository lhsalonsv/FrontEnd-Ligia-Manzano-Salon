/**
 * comprasService.js — Ligia Manzano Salón
 * Proveedores y compras. Contrato en docs/contrato-api.md → "Proveedores" y "Compras".
 *
 *   GET   /api/proveedores                 → [proveedor + ultimaCompra]
 *   GET   /api/proveedores/{id}            → ficha + ultimasCompras, comprasAnio
 *   POST  /api/proveedores | PUT /api/proveedores/{id}
 *   PATCH /api/proveedores/{id}/activo     { activo }
 *   GET   /api/compras?buscar=&filtro=todas|este-mes&idProveedor=&pagina=0&tamano=50
 *         → { contenido: [resumen], totalElementos, conteos, mes }
 *   GET   /api/compras/{id}                → compra + detalle
 *   POST  /api/compras                     { idProveedor, fechaCompra, tipoDocumentoProveedor, numeroDocumentoProveedor, detalle }
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { obtenerSesion } from '../utils/session.js';
import { totalesCompra, centavos } from '../utils/calculos.js';
import { fechaIso } from '../utils/formato.js';
import { PROVEEDORES_PRUEBA, PROVEEDOR_POR_MARCA } from '../mocks/compras.js';
import { PRODUCTOS_PRUEBA, PARAMETROS_INVENTARIO_PRUEBA } from '../mocks/inventario.js';

export const TAMANO_PAGINA = 50;

export async function listarProveedores() {
  if (DATOS_PRUEBA.compras) return listarProveedoresPrueba();
  return authFetch('/proveedores');
}

export async function obtenerProveedor(idProveedor) {
  if (DATOS_PRUEBA.compras) return fichaProveedorPrueba(idProveedor);
  return authFetch(`/proveedores/${idProveedor}`);
}

export async function guardarProveedor(datos, idProveedor = null) {
  if (DATOS_PRUEBA.compras) return guardarProveedorPrueba(datos, idProveedor);
  return idProveedor
    ? authFetch(`/proveedores/${idProveedor}`, { method: 'PUT', cuerpo: datos })
    : authFetch('/proveedores', { method: 'POST', cuerpo: datos });
}

export async function cambiarActivoProveedor(idProveedor, activo) {
  if (DATOS_PRUEBA.compras) return activoPrueba(idProveedor, activo);
  return authFetch(`/proveedores/${idProveedor}/activo`, { method: 'PATCH', cuerpo: { activo } });
}

export async function listarCompras({ buscar = '', filtro = 'todas', idProveedor = '', pagina = 0 } = {}) {
  if (DATOS_PRUEBA.compras) return listarComprasPrueba(buscar, filtro, idProveedor, pagina);
  const params = new URLSearchParams({ filtro, pagina, tamano: TAMANO_PAGINA });
  if (buscar) params.set('buscar', buscar);
  if (idProveedor) params.set('idProveedor', idProveedor);
  return authFetch(`/compras?${params}`);
}

export async function obtenerCompra(idCompra) {
  if (DATOS_PRUEBA.compras) return fichaCompraPrueba(idCompra);
  return authFetch(`/compras/${idCompra}`);
}

/** La API calcula los totales, crea un lote por línea y lo deja en el kardex y la bitácora. */
export async function registrarCompra(compra) {
  if (DATOS_PRUEBA.compras) return registrarPrueba(compra);
  return authFetch('/compras', { method: 'POST', cuerpo: compra });
}

// --- Datos de prueba ---------------------------------------------------------
// Comparten los productos de prueba con inventarioService: una compra aquí sube la existencia allá.
const esperar = () => new Promise((r) => setTimeout(r, 250));
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const proveedores = structuredClone(PROVEEDORES_PRUEBA);
const { ivaPct } = PARAMETROS_INVENTARIO_PRUEBA;

function buscarProveedor(idProveedor) {
  const p = proveedores.find((x) => x.idProveedor === Number(idProveedor));
  if (!p) throw new ApiError(404, 'No se encontró el proveedor.');
  return p;
}

/** Las compras de prueba salen de los lotes del inventario: cada lote con numeroCompra es una línea. */
function armarCompras() {
  const porNumero = new Map();
  for (const producto of PRODUCTOS_PRUEBA) {
    for (const lote of producto.lotes.filter((l) => l.numeroCompra)) {
      if (!porNumero.has(lote.numeroCompra)) {
        porNumero.set(lote.numeroCompra, {
          idCompra: Number(lote.numeroCompra.slice(2)), numeroCompra: lote.numeroCompra,
          idProveedor: PROVEEDOR_POR_MARCA[producto.idMarca], fechaCompra: lote.fechaIngreso.slice(0, 10),
          tipoDocumentoProveedor: 'CCF', numeroDocumentoProveedor: `DTE-03-M001P001-00000000000${lote.numeroCompra.slice(2)}`,
          estado: 'REGISTRADA', nombreUsuario: 'Ligia Manzano', creadoEn: lote.fechaIngreso, lineas: [],
        });
      }
      porNumero.get(lote.numeroCompra).lineas.push({ idProducto: producto.idProducto, idLote: lote.idLote, cantidad: lote.cantidadInicial, costoUnitario: lote.costoUnitario });
    }
  }
  return [...porNumero.values()];
}
const compras = armarCompras();

const totales = (c) => totalesCompra(c.lineas, ivaPct, c.tipoDocumentoProveedor);
const nombreProveedor = (id) => buscarProveedor(id).nombreComercial;
const masNuevaPrimero = (a, b) => b.fechaCompra.localeCompare(a.fechaCompra) || b.idCompra - a.idCompra;
const vence = (c) => {
  const dias = buscarProveedor(c.idProveedor).diasCredito;
  return dias ? fechaIso(c.fechaCompra, dias) : null;
};

function aResumen(c) {
  return {
    idCompra: c.idCompra, numeroCompra: c.numeroCompra, fechaCompra: c.fechaCompra, idProveedor: c.idProveedor,
    nombreProveedor: nombreProveedor(c.idProveedor), tipoDocumentoProveedor: c.tipoDocumentoProveedor,
    numeroDocumentoProveedor: c.numeroDocumentoProveedor, productos: c.lineas.length,
    unidades: c.lineas.reduce((s, l) => s + l.cantidad, 0), total: totales(c).total, estado: c.estado,
  };
}

async function listarComprasPrueba(buscar, filtro, idProveedor, pagina) {
  await esperar();
  const texto = sinAcentos(buscar.trim());
  const mes = fechaIso().slice(0, 7);
  const delMes = (r) => r.fechaCompra.startsWith(mes);
  const resumenes = compras.map(aResumen).sort(masNuevaPrimero)
    .filter((r) => !texto || sinAcentos(r.nombreProveedor).includes(texto) || sinAcentos(r.numeroCompra).includes(texto))
    .filter((r) => !idProveedor || r.idProveedor === Number(idProveedor));
  const filtradas = filtro === 'este-mes' ? resumenes.filter(delMes) : resumenes;
  const deEsteMes = compras.map(aResumen).filter(delMes);
  return {
    contenido: filtradas.slice(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA),
    totalElementos: filtradas.length,
    conteos: { todas: resumenes.length, 'este-mes': resumenes.filter(delMes).length },
    mes: { cantidad: deEsteMes.length, total: centavos(deEsteMes.reduce((s, r) => s + r.total, 0)) },
  };
}

async function fichaCompraPrueba(idCompra) {
  await esperar();
  const c = compras.find((x) => x.idCompra === Number(idCompra));
  if (!c) throw new ApiError(404, 'No se encontró la compra.');
  const { subtotales, subtotalSinIva, iva, total } = totales(c);
  const { lineas, ...datos } = c;
  return {
    ...structuredClone(datos), nombreProveedor: nombreProveedor(c.idProveedor), subtotalSinIva, iva, total, fechaVencimientoPago: vence(c),
    detalle: lineas.map((l, i) => {
      const producto = PRODUCTOS_PRUEBA.find((p) => p.idProducto === l.idProducto);
      return {
        idProducto: l.idProducto, nombreProducto: producto.nombreProducto, cantidad: l.cantidad, costoUnitario: l.costoUnitario,
        subtotal: subtotales[i], cantidadDisponible: producto.lotes.find((x) => x.idLote === l.idLote).cantidadDisponible,
      };
    }),
  };
}

async function registrarPrueba({ idProveedor, fechaCompra, tipoDocumentoProveedor, numeroDocumentoProveedor, detalle }) {
  await esperar();
  const proveedor = buscarProveedor(idProveedor);
  if (!proveedor.activo) throw new ApiError(400, 'Ese proveedor está inactivo.', { campos: { idProveedor: 'Está inactivo.' } });
  const repetida = numeroDocumentoProveedor && compras.find((c) => c.idProveedor === proveedor.idProveedor && c.numeroDocumentoProveedor === numeroDocumentoProveedor);
  if (repetida) {
    throw new ApiError(409, `Ese documento ya se registró en la compra ${repetida.numeroCompra}.`, {
      codigo: 'COMPRA_DUPLICADA', campos: { numeroDocumentoProveedor: 'Ya está registrado.' }, idCompraExistente: repetida.idCompra,
    });
  }
  const idCompra = Math.max(...compras.map((c) => c.idCompra)) + 1;
  const numeroCompra = `C-${String(idCompra).padStart(4, '0')}`;
  const ahora = new Date().toISOString();
  let idLote = Math.max(...PRODUCTOS_PRUEBA.flatMap((p) => p.lotes.map((l) => l.idLote)));
  const lineas = detalle.map(({ idProducto, cantidad, costoUnitario }) => {
    const producto = PRODUCTOS_PRUEBA.find((p) => p.idProducto === idProducto);
    producto.lotes.push({ idLote: ++idLote, fechaIngreso: ahora, costoUnitario, cantidadInicial: cantidad, cantidadDisponible: cantidad, numeroCompra });
    producto.movimientos.push({ fechaHora: ahora, tipo: 'ENTRADA_COMPRA', cantidad, referencia: numeroCompra, motivo: null });
    return { idProducto, idLote, cantidad, costoUnitario };
  });
  compras.push({
    idCompra, numeroCompra, idProveedor: proveedor.idProveedor, fechaCompra, tipoDocumentoProveedor,
    numeroDocumentoProveedor: numeroDocumentoProveedor || null, estado: 'REGISTRADA',
    nombreUsuario: obtenerSesion()?.usuario.nombreCompleto ?? '', creadoEn: ahora, lineas,
  });
  return fichaCompraPrueba(idCompra);
}

function comprasDe(idProveedor) {
  return compras.filter((c) => c.idProveedor === idProveedor).sort(masNuevaPrimero);
}

async function listarProveedoresPrueba() {
  await esperar();
  return proveedores
    .map((p) => {
      const ultima = comprasDe(p.idProveedor)[0];
      return { ...structuredClone(p), ultimaCompra: ultima ? { fechaCompra: ultima.fechaCompra, total: totales(ultima).total } : null };
    })
    .sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial, 'es'));
}

async function fichaProveedorPrueba(idProveedor) {
  await esperar();
  const p = buscarProveedor(idProveedor);
  const suyas = comprasDe(p.idProveedor);
  const anio = suyas.filter((c) => c.fechaCompra.startsWith(String(new Date().getFullYear())));
  return {
    ...structuredClone(p),
    ultimasCompras: suyas.slice(0, 3).map((c) => ({
      idCompra: c.idCompra, numeroCompra: c.numeroCompra, fechaCompra: c.fechaCompra, productos: c.lineas.length,
      total: totales(c).total, fechaVencimientoPago: vence(c),
    })),
    comprasAnio: { cantidad: anio.length, total: centavos(anio.reduce((s, c) => s + totales(c).total, 0)) },
  };
}

async function guardarProveedorPrueba(datos, idProveedor) {
  await esperar();
  for (const campo of ['nit', 'nrc']) {
    const otro = proveedores.find((x) => x[campo] === datos[campo] && x.idProveedor !== Number(idProveedor));
    if (otro) {
      throw new ApiError(409, `Ese ${campo.toUpperCase()} ya es de “${otro.nombreComercial}”.`, {
        codigo: 'PROVEEDOR_DUPLICADO', campos: { [campo]: `Ya hay un proveedor con este ${campo.toUpperCase()}.` }, idProveedorExistente: otro.idProveedor,
      });
    }
  }
  if (idProveedor) {
    Object.assign(buscarProveedor(idProveedor), datos);
    return fichaProveedorPrueba(idProveedor);
  }
  const nuevo = { ...datos, idProveedor: Math.max(...proveedores.map((x) => x.idProveedor)) + 1, activo: true };
  proveedores.push(nuevo);
  return fichaProveedorPrueba(nuevo.idProveedor);
}

async function activoPrueba(idProveedor, activo) {
  await esperar();
  buscarProveedor(idProveedor).activo = activo;
  return fichaProveedorPrueba(idProveedor);
}
