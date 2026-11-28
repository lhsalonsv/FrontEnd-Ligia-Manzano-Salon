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
 *   POST  /api/compras                     { idProveedor, fechaCompra, tipoDocumentoProveedor, numeroDocumentoProveedor,
 *                                            claseDocumento, codigoGeneracionProveedor, idCompraRelacionada, periodoIva,
 *                                            comprasExentas, percepcion, tipoOperacionRenta, clasificacionRenta, sectorRenta,
 *                                            tipoCostoGasto, codigoCuentaExentas, detalle: [{ idProducto, cantidad, costoUnitario } | { descripcion, cantidad, costoUnitario, codigoCuenta }] }
 *   GET   /api/proveedores/{id}/ultima-cuenta → { codigoCuenta } (null si no hay)
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { obtenerSesion } from '../utils/session.js';
import { totalesCompra, centavos, DOCUMENTOS_CON_IVA } from '../utils/calculos.js';
import { fechaIso } from '../utils/formato.js';
import { PROVEEDORES_PRUEBA, PROVEEDOR_POR_MARCA, revisarDevolucion, aplicarDevolucion, ultimaCuenta, revisarCuentas } from '../mocks/compras.js';
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

/** La última cuenta contable que se usó en un gasto con este proveedor, para proponerla. @returns {Promise<{codigoCuenta: string|null}>} */
export async function ultimaCuentaProveedor(idProveedor) {
  if (DATOS_PRUEBA.compras) return { codigoCuenta: ultimaCuenta(comprasDe(Number(idProveedor))) };
  return authFetch(`/proveedores/${idProveedor}/ultima-cuenta`);
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

/**
 * La API calcula los totales, crea un lote por línea y lo deja en el kardex y la bitácora.
 * Una NC con líneas de producto saca esas unidades del lote de la compra relacionada (409 STOCK_INSUFICIENTE si ya no están).
 */
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

/** Primer día del mes de una fecha ISO: el mes del crédito fiscal (tb_compras.periodo_iva). */
export const mesDe = (fechaIsoTexto) => `${fechaIsoTexto.slice(0, 7)}-01`;
/** Código de generación de prueba, siempre el mismo para el mismo número. */
const codigoPrueba = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Clasificación para renta que el backend propone: productos para vender = costo; lo demás = gasto de administración. */
export const RENTA_PRODUCTOS = { tipoOperacionRenta: 1, clasificacionRenta: 1, sectorRenta: 4, tipoCostoGasto: 5 };
export const RENTA_GASTOS = { tipoOperacionRenta: 1, clasificacionRenta: 2, sectorRenta: 4, tipoCostoGasto: 2 };

/** Las compras de productos salen de los lotes del inventario: cada lote con numeroCompra es una línea. */
function armarCompras() {
  const porNumero = new Map();
  for (const producto of PRODUCTOS_PRUEBA) {
    for (const lote of producto.lotes.filter((l) => l.numeroCompra)) {
      if (!porNumero.has(lote.numeroCompra)) {
        const n = Number(lote.numeroCompra.slice(2));
        porNumero.set(lote.numeroCompra, {
          idCompra: n, numeroCompra: lote.numeroCompra,
          idProveedor: PROVEEDOR_POR_MARCA[producto.idMarca], fechaCompra: lote.fechaIngreso.slice(0, 10),
          tipoDocumentoProveedor: 'CCF', numeroDocumentoProveedor: `DTE-03-M001P001-00000000000${lote.numeroCompra.slice(2)}`,
          claseDocumento: 4, codigoGeneracionProveedor: codigoPrueba(n), idCompraRelacionada: null,
          periodoIva: mesDe(lote.fechaIngreso), comprasExentas: 0, percepcion: false, ...RENTA_PRODUCTOS,
          estado: 'REGISTRADA', nombreUsuario: 'Ligia Manzano', creadoEn: lote.fechaIngreso, lineas: [],
        });
      }
      porNumero.get(lote.numeroCompra).lineas.push({ idProducto: producto.idProducto, idLote: lote.idLote, cantidad: lote.cantidadInicial, costoUnitario: lote.costoUnitario });
    }
  }
  const productos = [...porNumero.values()];

  // Gastos del local y una nota de crédito, en este mes (para que salgan en el libro de compras)
  const hoy = fechaIso();
  const enElMes = (dia) => (hoy.slice(8) >= dia ? `${hoy.slice(0, 8)}${dia}` : hoy);
  let n = Math.max(...productos.map((c) => c.idCompra));
  const gasto = (idProveedor, fecha, descripcion, monto, codigoCuenta = null, extra = {}) => {
    n += 1;
    return {
      idCompra: n, numeroCompra: `C-${String(n).padStart(4, '0')}`, idProveedor, fechaCompra: fecha,
      tipoDocumentoProveedor: 'CCF', numeroDocumentoProveedor: `DTE-03-M001P001-0000000000${String(n).padStart(5, '0')}`,
      claseDocumento: 4, codigoGeneracionProveedor: codigoPrueba(n), idCompraRelacionada: null,
      periodoIva: mesDe(fecha), comprasExentas: 0, percepcion: false, ...RENTA_GASTOS,
      estado: 'REGISTRADA', nombreUsuario: 'Ligia Manzano', creadoEn: `${fecha}T15:00:00.000Z`,
      lineas: [{ descripcion, cantidad: 1, costoUnitario: monto, codigoCuenta }], ...extra,
    };
  };
  const ultima = productos.sort((a, b) => b.fechaCompra.localeCompare(a.fechaCompra))[0];
  return [
    ...productos,
    gasto(6, enElMes('05'), 'Energía eléctrica del local', 85.4, '51010302'),
    gasto(7, enElMes('10'), 'Mantenimiento de secadores y planchas', 40, '5101040101'),
    gasto(ultima.idProveedor, hoy, 'Descuento por pronto pago', 5, null, {
      tipoDocumentoProveedor: 'NC', numeroDocumentoProveedor: `DTE-05-M001P001-0000000000${String(n + 1).padStart(5, '0')}`,
      idCompraRelacionada: ultima.idCompra, ...RENTA_PRODUCTOS,
    }),
  ];
}
const compras = armarCompras();

const totales = (c) => totalesCompra(c.lineas, ivaPct, c.tipoDocumentoProveedor, { exentas: c.comprasExentas, percepcion: c.percepcion });
/** La nota de crédito resta: en el total del mes y en los libros. */
const signo = (c) => (c.tipoDocumentoProveedor === 'NC' ? -1 : 1);
const nombreProveedor = (id) => buscarProveedor(id).nombreComercial;
const masNuevaPrimero = (a, b) => b.fechaCompra.localeCompare(a.fechaCompra) || b.idCompra - a.idCompra;
const vence = (c) => {
  const dias = buscarProveedor(c.idProveedor).diasCredito;
  return dias ? fechaIso(c.fechaCompra, dias) : null;
};

const deProducto = (c) => c.lineas.filter((l) => l.idProducto);

function aResumen(c) {
  return {
    idCompra: c.idCompra, numeroCompra: c.numeroCompra, fechaCompra: c.fechaCompra, idProveedor: c.idProveedor,
    nombreProveedor: nombreProveedor(c.idProveedor), tipoDocumentoProveedor: c.tipoDocumentoProveedor,
    numeroDocumentoProveedor: c.numeroDocumentoProveedor, productos: deProducto(c).length,
    unidades: deProducto(c).reduce((s, l) => s + l.cantidad, 0), gastos: c.lineas.length - deProducto(c).length,
    primerGasto: c.lineas.find((l) => !l.idProducto)?.descripcion ?? null, total: totales(c).total, estado: c.estado,
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
    mes: { cantidad: deEsteMes.length, total: centavos(deEsteMes.reduce((s, r) => s + signo(r) * r.total, 0)) },
  };
}

async function fichaCompraPrueba(idCompra) {
  await esperar();
  const c = compras.find((x) => x.idCompra === Number(idCompra));
  if (!c) throw new ApiError(404, 'No se encontró la compra.');
  const { subtotales, subtotalSinIva, comprasExentas, iva, ivaPercibido, total } = totales(c);
  const { lineas, percepcion, ...datos } = c;
  const relacionada = compras.find((x) => x.idCompra === c.idCompraRelacionada);
  return {
    ...structuredClone(datos), nombreProveedor: nombreProveedor(c.idProveedor), subtotalSinIva, comprasExentas, iva, ivaPercibido, total,
    numeroCompraRelacionada: relacionada?.numeroCompra ?? null, fechaVencimientoPago: vence(c),
    detalle: lineas.map((l, i) => {
      if (!l.idProducto) return { idProducto: null, descripcion: l.descripcion, cantidad: l.cantidad, costoUnitario: l.costoUnitario, subtotal: subtotales[i], codigoCuenta: l.codigoCuenta ?? null };
      const producto = PRODUCTOS_PRUEBA.find((p) => p.idProducto === l.idProducto);
      return {
        idProducto: l.idProducto, nombreProducto: producto.nombreProducto, cantidad: l.cantidad, costoUnitario: l.costoUnitario,
        subtotal: subtotales[i], cantidadDisponible: producto.lotes.find((x) => x.idLote === l.idLote).cantidadDisponible, // en una NC: lo que queda del lote del que salieron
      };
    }),
  };
}

/** Las mismas reglas que los checks de tb_compras (migración 1.3): la API responde 400 con el campo. */
function revisarDocumento(d) {
  const campos = {};
  const conIva = DOCUMENTOS_CON_IVA.includes(d.tipoDocumentoProveedor);
  if (conIva && !d.numeroDocumentoProveedor) campos.numeroDocumentoProveedor = 'Escriba el número de control del documento.';
  if (conIva && d.claseDocumento === 4 && !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(d.codigoGeneracionProveedor ?? '')) {
    campos.codigoGeneracionProveedor = 'El código de generación tiene 36 caracteres.';
  }
  if (['NC', 'ND'].includes(d.tipoDocumentoProveedor) !== Boolean(d.idCompraRelacionada)) campos.idCompraRelacionada = 'Elija la compra que corrige.';
  if (d.tipoDocumentoProveedor === 'ND' && d.detalle.some((l) => l.idProducto)) campos.agregar = 'Una nota de débito no lleva productos.';
  const relacionada = compras.find((c) => c.idCompra === Number(d.idCompraRelacionada));
  if (d.tipoDocumentoProveedor === 'NC' && relacionada) Object.assign(campos, revisarDevolucion(relacionada, d.detalle, PRODUCTOS_PRUEBA).campos);
  const minimo = mesDe(d.fechaCompra);
  const tope = new Date(`${minimo}T00:00:00`);
  tope.setMonth(tope.getMonth() + 3);
  if (!d.periodoIva?.endsWith('-01') || d.periodoIva < minimo || d.periodoIva > fechaIso(tope)) {
    campos.periodoIva = 'El crédito fiscal se declara en el mes del documento o hasta 3 meses después.';
  }
  return campos;
}

async function registrarPrueba(d) {
  await esperar();
  const proveedor = buscarProveedor(d.idProveedor);
  if (!proveedor.activo) throw new ApiError(400, 'Ese proveedor está inactivo.', { campos: { idProveedor: 'Está inactivo.' } });
  const campos = { ...revisarDocumento(d), ...revisarCuentas(d.detalle.map((l, i) => ({ ...l, clave: i })), d.comprasExentas, d.codigoCuentaExentas) };
  if (Object.keys(campos).length) throw new ApiError(400, 'Revise los datos del documento.', { campos });
  const viva = (c) => c.estado !== 'ANULADA';
  const repetida = compras.filter(viva).find((c) => (d.numeroDocumentoProveedor && c.idProveedor === proveedor.idProveedor && c.numeroDocumentoProveedor === d.numeroDocumentoProveedor)
    || (d.codigoGeneracionProveedor && c.codigoGeneracionProveedor?.toUpperCase() === d.codigoGeneracionProveedor.toUpperCase()));
  if (repetida) {
    throw new ApiError(409, `Ese documento ya se registró en la compra ${repetida.numeroCompra}.`, {
      codigo: 'COMPRA_DUPLICADA', campos: { numeroDocumentoProveedor: 'Ya está registrado.' }, idCompraExistente: repetida.idCompra,
    });
  }
  const esNC = d.tipoDocumentoProveedor === 'NC';
  const relacionada = esNC && compras.find((c) => c.idCompra === Number(d.idCompraRelacionada));
  const { conflicto } = relacionada ? revisarDevolucion(relacionada, d.detalle, PRODUCTOS_PRUEBA) : {};
  if (conflicto) throw new ApiError(409, conflicto, { codigo: 'STOCK_INSUFICIENTE', mensaje: conflicto });
  const idCompra = Math.max(...compras.map((c) => c.idCompra)) + 1;
  const numeroCompra = `C-${String(idCompra).padStart(4, '0')}`;
  const ahora = new Date().toISOString();
  let idLote = Math.max(...PRODUCTOS_PRUEBA.flatMap((p) => p.lotes.map((l) => l.idLote)));
  // Solo las líneas de producto crean lote y movimiento de kardex; un gasto no toca el inventario
  const detalle = relacionada ? aplicarDevolucion(relacionada, d.detalle, PRODUCTOS_PRUEBA, numeroCompra, ahora) : d.detalle;
  const lineas = detalle.map(({ idProducto, idLote: loteDevuelto, descripcion, cantidad, costoUnitario, codigoCuenta }) => {
    if (!idProducto) return { descripcion, cantidad, costoUnitario, codigoCuenta: codigoCuenta ?? null };
    if (relacionada) return { idProducto, idLote: loteDevuelto, cantidad, costoUnitario }; // una devolución no crea lote
    const producto = PRODUCTOS_PRUEBA.find((p) => p.idProducto === idProducto);
    producto.lotes.push({ idLote: ++idLote, fechaIngreso: ahora, costoUnitario, cantidadInicial: cantidad, cantidadDisponible: cantidad, numeroCompra });
    producto.movimientos.push({ fechaHora: ahora, tipo: 'ENTRADA_COMPRA', cantidad, referencia: numeroCompra, motivo: null });
    return { idProducto, idLote, cantidad, costoUnitario };
  });
  compras.push({
    idCompra, numeroCompra, idProveedor: proveedor.idProveedor, fechaCompra: d.fechaCompra, tipoDocumentoProveedor: d.tipoDocumentoProveedor,
    numeroDocumentoProveedor: d.numeroDocumentoProveedor || null, claseDocumento: d.claseDocumento,
    codigoGeneracionProveedor: d.codigoGeneracionProveedor?.toUpperCase() || null, idCompraRelacionada: d.idCompraRelacionada || null,
    periodoIva: d.periodoIva, comprasExentas: d.comprasExentas || 0, percepcion: Boolean(d.percepcion), codigoCuentaExentas: d.codigoCuentaExentas ?? null,
    tipoOperacionRenta: d.tipoOperacionRenta, clasificacionRenta: d.clasificacionRenta, sectorRenta: d.sectorRenta, tipoCostoGasto: d.tipoCostoGasto,
    estado: 'REGISTRADA', nombreUsuario: obtenerSesion()?.usuario.nombreCompleto ?? '', creadoEn: ahora, lineas,
  });
  return fichaCompraPrueba(idCompra);
}

/** Para el libro de compras de prueba (librosIvaService): las compras con su proveedor y sus totales. */
export function comprasDePrueba() {
  return compras.map((c) => ({ ...c, proveedor: buscarProveedor(c.idProveedor), ...totales(c) }));
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
      idCompra: c.idCompra, numeroCompra: c.numeroCompra, fechaCompra: c.fechaCompra, productos: deProducto(c).length,
      gastos: c.lineas.length - deProducto(c).length, tipoDocumentoProveedor: c.tipoDocumentoProveedor,
      total: totales(c).total, fechaVencimientoPago: vence(c),
    })),
    comprasAnio: { cantidad: anio.length, total: centavos(anio.reduce((s, c) => s + signo(c) * totales(c).total, 0)) }, // la NC resta, como en el total del mes
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
