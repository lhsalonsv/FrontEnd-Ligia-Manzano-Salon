/**
 * comprasController.js — Ligia Manzano Salón
 * Pantalla Compras: historial de compras (con su detalle), proveedores (ficha y formulario en el panel)
 * y registrar una compra: productos (cada uno crea un lote PEPS) y gastos del local (alquiler, luz…),
 * con los datos que pide el libro de compras de IVA (migración 1.3).
 *
 * URL: compras.html?vista=proveedores · compras.html?registrar[&idProducto=1][&idProveedor=2]
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, numero, fechaCorta, fechaLarga, fechaHora, fechaIso, mesAnio, MESES, nitConGuiones, nrcConGuion } from '../utils/formato.js';
import { centavos, totalesCompra, DOCUMENTOS_CON_IVA, PERCEPCION_PCT } from '../utils/calculos.js';
import { campo, entrada, mostrarErrores } from '../utils/formulario.js';
import { crearPanel, htmlCabecera, htmlError, htmlExito } from '../utils/panel.js';
import { listarProductos, obtenerProducto } from '../services/inventarioService.js';
import {
  listarProveedores, obtenerProveedor, guardarProveedor, cambiarActivoProveedor, listarCompras, obtenerCompra, registrarCompra,
  mesDe, RENTA_PRODUCTOS, RENTA_GASTOS,
} from '../services/comprasService.js';

const sesion = montarLayout({ accion: { id: 'btn-registrar', texto: 'Registrar compra', icono: 'mas' } });

const $ = (id) => document.getElementById(id);
const panelEl = $('panel');
const SIN_CAMBIOS = 'Hay cambios sin guardar. ¿Salir sin guardar?';

const estado = {
  vista: 'compras',
  buscar: '',
  filtro: 'todas',
  idProveedorFiltro: '',
  pagina: 0,
  peticion: 0,
  filtroProveedores: 'activos',
  proveedores: [],
  ivaPct: 13,
  seleccion: null, // { tipo: 'compra' | 'proveedor', id }
  sucio: false,
  lineas: [], // registrar: { producto (ficha de inventario), cantidad, costo } — cantidad y costo como texto del input
  gastos: [], // registrar: { clave: 'g1', descripcion, monto } — sin producto: no tocan el inventario
  siguienteGasto: 1,
  rentaTocada: false, // si la usuaria cambió la clasificación para renta, ya no se propone sola
  comprasProveedor: [], // para elegir la compra que corrige una nota
  idLineaActual: null,
};

const panel = crearPanel({
  panel: panelEl,
  fondo: $('fondo-panel'),
  vacio: `${icono('compras', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}<p>Elige una compra o un proveedor para ver el detalle.</p>`,
  alCerrar: () => {
    if (!sePuedeSalir()) return false;
    estado.seleccion = null;
    marcarSeleccionado();
    return true;
  },
});

function sePuedeSalir() {
  if (estado.sucio && !confirm(SIN_CAMBIOS)) return false;
  estado.sucio = false;
  return true;
}

// --- Formatos ----------------------------------------------------------------

const TIPO_DOCUMENTO = { CCF: 'Crédito fiscal', FACTURA: 'Factura', NC: 'Nota de crédito', ND: 'Nota de débito', OTRO: 'Otro documento' };
const TIPO_CORTO = { CCF: 'CCF', FACTURA: 'Factura', NC: 'NC', ND: 'ND', OTRO: 'Otro' };
const esNota = (tipo) => tipo === 'NC' || tipo === 'ND';
const conIva = (tipo) => DOCUMENTOS_CON_IVA.includes(tipo);

// Clasificación para renta: columnas Q a T del anexo de compras (códigos de Hacienda).
const OPERACION_RENTA = { 1: 'Gravada', 2: 'No gravada', 3: 'Excluida o no constituye renta', 4: 'Mixta' };
const CLASIFICACION_RENTA = { 1: 'Costo', 2: 'Gasto' };
const TIPOS_COSTO_GASTO = {
  1: [[5, 'Artículos comprados en el país'], [4, 'Importaciones o internaciones'], [6, 'Costos indirectos de fabricación'], [7, 'Mano de obra']],
  2: [[2, 'De administración'], [1, 'De venta'], [3, 'Financieros']],
};
const SECTOR_RENTA = { 1: 'Industria', 2: 'Comercio', 3: 'Agropecuaria', 4: 'Servicios, profesiones, artes y oficios' };
const nombreCostoGasto = (codigo) => Object.values(TIPOS_COSTO_GASTO).flat().find(([c]) => c === Number(codigo))?.[1] ?? '';
const textoRenta = (r) => `${CLASIFICACION_RENTA[r.clasificacionRenta]} · ${nombreCostoGasto(r.tipoCostoGasto).toLowerCase()}`;

/** 'CCF · …2291' */
const documentoCorto = (tipo, numeroDoc) => `${TIPO_CORTO[tipo] ?? tipo}${numeroDoc ? ` · …${numeroDoc.slice(-4)}` : ''}`;
const credito = (dias) => (dias ? `${dias} días` : 'Contado');
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;


function marcarSeleccionado() {
  for (const fila of document.querySelectorAll('#lista-compras [data-id], #lista-proveedores [data-id]')) {
    const tipo = fila.closest('#lista-compras') ? 'compra' : 'proveedor';
    const actual = estado.seleccion?.tipo === tipo && estado.seleccion.id === Number(fila.dataset.id);
    if (actual) fila.setAttribute('aria-current', 'true');
    else fila.removeAttribute('aria-current');
  }
}

const CLASE_FILA = 'min-h-14 w-full cursor-pointer border-b border-neutro-100 py-2 text-left text-15 tabular-nums hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)]';

// --- Vistas ------------------------------------------------------------------

function cambiarVista(vista) {
  estado.vista = vista;
  const registrar = vista === 'registrar';
  // El atributo hidden (no la clase): la clase "hidden" pierde contra xl:grid y la lista seguía ocupando espacio
  $('vista-listas').hidden = registrar;
  $('vista-registrar').hidden = !registrar;
  window.scrollTo(0, 0);
  $('btn-registrar').classList.toggle('hidden', registrar);
  if (registrar) {
    history.replaceState(null, '', `${location.pathname}?registrar`);
    return;
  }
  history.replaceState(null, '', vista === 'proveedores' ? `${location.pathname}?vista=proveedores` : location.pathname);
  $('vista-registrar').innerHTML = '';
  for (const b of $('vistas').querySelectorAll('[data-vista]')) b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
  const compras = vista === 'compras';
  $('seccion-compras').classList.toggle('hidden', !compras);
  $('seccion-proveedores').classList.toggle('hidden', compras);
  $('seccion-proveedores').classList.toggle('flex', !compras);
  $('etiqueta-buscar').textContent = compras ? 'Buscar compra' : 'Buscar proveedor';
  $('buscar').placeholder = compras ? 'Proveedor o n.º de compra' : 'Nombre, NIT o NRC';
  $('buscar').value = '';
  estado.buscar = '';
  if (compras) cargarCompras();
  else pintarProveedores();
}

// --- Lista de compras --------------------------------------------------------

/** "3 productos · 24 u", "Gasto · Energía eléctrica…" o "Concepto · Descuento…". */
function htmlContenido(c) {
  if (c.productos) return `<b class="block font-normal">${plural(c.productos, 'producto', 'productos')}</b><small class="text-13 text-texto-secundario">${numero(c.unidades)} u${c.gastos ? ` · ${plural(c.gastos, 'gasto', 'gastos')}` : ''}</small>`;
  const tipo = esNota(c.tipoDocumentoProveedor) ? 'Concepto' : 'Gasto';
  return `<b class="block font-normal">${c.gastos > 1 ? plural(c.gastos, tipo.toLowerCase(), `${tipo.toLowerCase()}s`) : tipo}</b><small class="block truncate text-13 text-texto-secundario">${escapar(c.primerGasto ?? '')}</small>`;
}

function htmlFilaCompra(c) {
  const resta = c.tipoDocumentoProveedor === 'NC';
  return `<button type="button" data-id="${c.idCompra}" class="fila-co ${CLASE_FILA}">
    <span><b class="block font-semibold">${escapar(c.numeroCompra)}</b><small class="text-13 text-texto-secundario">${fechaCorta(c.fechaCompra)}</small></span>
    <span class="min-w-0"><b class="block truncate font-semibold">${escapar(c.nombreProveedor)}</b><small class="text-13 text-texto-secundario">${escapar(documentoCorto(c.tipoDocumentoProveedor, c.numeroDocumentoProveedor))}</small></span>
    <span class="min-w-0 @max-lg:hidden">${htmlContenido(c)}</span>
    <span class="text-right font-semibold" ${resta ? 'title="Nota de crédito: resta"' : ''}>${resta ? '−' : ''}${dinero(c.total)}</span>
  </button>`;
}

async function cargarCompras({ mas = false } = {}) {
  estado.pagina = mas ? estado.pagina + 1 : 0;
  const idPeticion = ++estado.peticion;
  const lista = $('lista-compras');
  const estadoLista = $('compras-estado');
  lista.setAttribute('aria-busy', 'true');
  try {
    const { contenido, totalElementos, conteos, mes } = await listarCompras({
      buscar: estado.buscar, filtro: estado.filtro, idProveedor: estado.idProveedorFiltro, pagina: estado.pagina,
    });
    if (idPeticion !== estado.peticion) return;
    const filas = contenido.map(htmlFilaCompra).join('');
    if (mas) lista.insertAdjacentHTML('beforeend', filas);
    else lista.innerHTML = filas;
    marcarSeleccionado();

    for (const b of $('filtros').querySelectorAll('[data-filtro]')) b.querySelector('span').textContent = numero(conteos[b.dataset.filtro]);
    const nombreMes = MESES[new Date().getMonth()];
    $('resumen').textContent = `${nombreMes[0].toUpperCase()}${nombreMes.slice(1)}: ${plural(mes.cantidad, 'compra', 'compras')} · ${dinero(mes.total)}`;

    const vacia = lista.children.length === 0;
    estadoLista.classList.toggle('hidden', !vacia);
    estadoLista.textContent = estado.buscar ? `Ninguna compra coincide con “${estado.buscar}”.` : 'No hay compras en este filtro.';
    $('cargar-mas').classList.toggle('hidden', lista.children.length >= totalElementos);
  } catch (error) {
    if (idPeticion !== estado.peticion) return;
    lista.innerHTML = '';
    estadoLista.classList.remove('hidden');
    estadoLista.innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

/** "3 productos están bajo el mínimo o agotados. Armar una compra con ellos." */
async function cargarAvisoBajoMinimo() {
  const { contenido, totalElementos, ivaPct } = await listarProductos({ filtro: 'bajo-minimo' });
  estado.ivaPct = ivaPct;
  estado.bajoMinimo = contenido.map((p) => p.idProducto);
  const aviso = $('aviso-bajo');
  aviso.classList.toggle('hidden', !totalElementos);
  aviso.classList.toggle('flex', Boolean(totalElementos));
  aviso.innerHTML = `${icono('advertencia')}<p class="min-w-48 flex-1">${totalElementos === 1 ? '1 producto está' : `${numero(totalElementos)} productos están`} bajo el mínimo o agotados.</p>
    <button type="button" class="cursor-pointer font-semibold whitespace-nowrap underline underline-offset-2" data-accion="armar">Armar una compra con ${totalElementos === 1 ? 'él' : 'ellos'}</button>`;
}

// --- Detalle de compra -------------------------------------------------------

async function mostrarCompra(idCompra, aviso = '') {
  estado.seleccion = { tipo: 'compra', id: Number(idCompra) };
  marcarSeleccionado();
  panel.abrir();
  panelEl.setAttribute('aria-label', 'Detalle de la compra');
  panelEl.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando…</p>';

  let c;
  try {
    c = await obtenerCompra(idCompra);
  } catch (error) {
    panelEl.innerHTML = `${htmlCabecera('Compra', '')}${htmlError(error.message)}`;
    return;
  }
  if (estado.seleccion?.tipo !== 'compra' || estado.seleccion.id !== c.idCompra) return;

  const anulada = c.estado === 'ANULADA';
  const nota = esNota(c.tipoDocumentoProveedor);
  const fila = (etiqueta, valor, clase = '') => `<li class="flex justify-between gap-3 py-1 ${clase}"><span>${etiqueta}</span><span>${valor}</span></li>`;
  const productos = c.detalle.filter((d) => d.idProducto).length;
  let titulo = nota ? 'Conceptos' : 'Gastos <span class="font-normal">no entran al inventario</span>';
  if (productos) titulo = productos === c.detalle.length ? 'Productos <span class="font-normal">cada uno creó un lote</span>' : 'Detalle <span class="font-normal">cada producto creó un lote</span>';
  const htmlDetalle = (d) => (d.idProducto ? `
        <li class="grid grid-cols-[1fr_auto] gap-x-3 border-b border-neutro-100 py-2 tabular-nums">
          <a class="font-semibold underline decoration-borde-fuerte underline-offset-2" href="inventario.html?idProducto=${d.idProducto}">${escapar(d.nombreProducto)}</a>
          <b class="text-right font-semibold">${dinero(d.subtotal)}</b>
          <small class="text-13 text-texto-secundario">${numero(d.cantidad)} × ${dinero(d.costoUnitario)}</small>
          <small class="text-right text-13 text-texto-secundario">quedan <b class="font-semibold text-texto-principal">${numero(d.cantidadDisponible)}</b> de ${numero(d.cantidad)}</small>
        </li>` : `
        <li class="grid grid-cols-[1fr_auto] gap-x-3 border-b border-neutro-100 py-2 tabular-nums">
          <b class="min-w-0 font-semibold" data-campo="descripcion">${escapar(d.descripcion)}</b><b class="text-right font-semibold">${dinero(d.subtotal)}</b>
          <small class="text-13 text-texto-secundario">${nota ? 'concepto de la nota' : 'gasto del local'}</small>
        </li>`);
  panelEl.innerHTML = `
    ${htmlCabecera(`Compra ${c.numeroCompra}`, `${escapar(c.nombreProveedor)} · ${fechaLarga(c.fechaCompra)}`, {
      antes: `<div class="mb-2"><span class="insignia ${anulada ? 'insignia-apagada' : 'insignia-ok'}">${anulada ? 'Anulada' : 'Recibida'}</span></div>`,
    })}
    ${aviso ? htmlExito(aviso) : ''}
    <dl class="datos">
      <dt>Documento</dt><dd><b class="font-semibold">${TIPO_DOCUMENTO[c.tipoDocumentoProveedor]}${c.claseDocumento === 1 ? ' impreso' : ''}</b><small class="break-all">${escapar(c.numeroDocumentoProveedor ?? 'Sin número')}</small>${c.codigoGeneracionProveedor ? `<small class="font-mono text-xs break-all" data-campo="codigo_generacion_proveedor" title="Código de generación">${escapar(c.codigoGeneracionProveedor)}</small>` : ''}</dd>
      ${c.idCompraRelacionada ? `<dt>Corrige</dt><dd data-campo="id_compra_relacionada"><button type="button" class="cursor-pointer font-semibold underline decoration-borde-fuerte underline-offset-2" data-accion="ver-compra" data-id="${c.idCompraRelacionada}">Compra ${escapar(c.numeroCompraRelacionada)}</button></dd>` : ''}
      ${conIva(c.tipoDocumentoProveedor) ? `<dt>Crédito fiscal</dt><dd data-campo="periodo_iva">Se declara en ${mesAnio(`${c.periodoIva}T00:00:00`)}</dd>` : ''}
      <dt>Para renta</dt><dd>${textoRenta(c)}</dd>
      <dt>Pago</dt><dd>${c.fechaVencimientoPago ? `Vence el ${fechaLarga(c.fechaVencimientoPago)}` : 'De contado'}</dd>
      <dt>Registró</dt><dd>${escapar(c.nombreUsuario)}<small>${fechaHora(c.creadoEn)}</small></dd>
    </dl>
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">${titulo}</h3>
      <ul>${c.detalle.map(htmlDetalle).join('')}
      </ul>
      <ul class="mt-2 tabular-nums">
        ${fila(c.comprasExentas ? 'Gravado' : 'Subtotal', dinero(c.subtotalSinIva), 'text-texto-secundario')}
        ${c.comprasExentas ? fila('Exento o no sujeto', dinero(c.comprasExentas), 'text-texto-secundario') : ''}
        ${conIva(c.tipoDocumentoProveedor) ? fila(`IVA ${estado.ivaPct} % (crédito fiscal)`, dinero(c.iva), 'text-texto-secundario') : ''}
        ${c.ivaPercibido ? fila(`Percepción ${PERCEPCION_PCT} % (anticipo de IVA)`, dinero(c.ivaPercibido), 'text-texto-secundario') : ''}
        ${fila(c.tipoDocumentoProveedor === 'NC' ? 'Total que resta' : 'Total', dinero(c.total), 'text-base font-semibold')}
      </ul>
    </div>
    <div class="mx-6 mt-4 flex gap-2 rounded-medio border border-borde-default bg-fondo-sutil p-3 text-sm text-texto-secundario">
      ${icono('candado', 'mt-0.5 size-[18px]')}
      <p><b class="block font-semibold text-texto-principal">Las compras no se editan</b>Si algo llegó mal, corrígelo con un ajuste en Inventario o con la nota de crédito del proveedor.</p>
    </div>
    <div class="h-6 shrink-0"></div>`;
  panel.enfocarTitulo(Boolean(aviso));
}

// --- Proveedores -------------------------------------------------------------

async function cargarProveedores() {
  estado.proveedores = await listarProveedores();
  const select = $('filtro-proveedor');
  select.innerHTML = `<option value="">Todos</option>${estado.proveedores
    .map((p) => `<option value="${p.idProveedor}">${escapar(p.nombreComercial)}${p.activo ? '' : ' (inactivo)'}</option>`).join('')}`;
  select.value = estado.idProveedorFiltro;
}

const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function htmlFilaProveedor(p) {
  return `<button type="button" data-id="${p.idProveedor}" class="fila-pr ${CLASE_FILA} ${p.activo ? '' : 'text-texto-secundario'}">
    <span class="min-w-0"><b class="block truncate font-semibold">${escapar(p.nombreComercial)}</b><small class="block truncate text-13 text-texto-secundario">${escapar(p.razonSocial)}</small></span>
    <span class="min-w-0 @max-2xl:hidden"><b class="block truncate font-normal">${escapar(p.contactoNombre ?? '—')}</b><small class="text-13 text-texto-secundario">${escapar(p.telefono ?? '')}</small></span>
    <span class="@max-md:hidden">${credito(p.diasCredito)}</span>
    <span class="text-right">${p.ultimaCompra
      ? `<b class="block font-normal">${fechaCorta(p.ultimaCompra.fechaCompra)}</b><small class="text-13 text-texto-secundario">${dinero(p.ultimaCompra.total)}</small>`
      : '<small class="text-13 text-texto-secundario">Sin compras</small>'}</span>
  </button>`;
}

function pintarProveedores() {
  const texto = sinAcentos(estado.buscar);
  const digitos = soloDigitos(estado.buscar);
  const coincide = (p) => !texto
    || sinAcentos(`${p.nombreComercial} ${p.razonSocial}`).includes(texto)
    || (digitos.length >= 3 && (p.nit?.includes(digitos) || p.nrc?.includes(digitos)));
  const encontrados = estado.proveedores.filter(coincide);
  const activos = encontrados.filter((p) => p.activo);
  const inactivos = encontrados.filter((p) => !p.activo);
  const visibles = estado.filtroProveedores === 'activos' ? activos : inactivos;

  $('lista-proveedores').innerHTML = visibles.map(htmlFilaProveedor).join('');
  marcarSeleccionado();
  for (const b of $('filtros-proveedor').querySelectorAll('[data-filtro]')) {
    b.querySelector('span').textContent = numero(b.dataset.filtro === 'activos' ? activos.length : inactivos.length);
  }
  const totalActivos = estado.proveedores.filter((p) => p.activo).length;
  $('resumen').textContent = plural(totalActivos, 'activo', 'activos');
  const estadoLista = $('proveedores-estado');
  estadoLista.classList.toggle('hidden', visibles.length > 0);
  estadoLista.textContent = estado.buscar ? `Ningún proveedor coincide con “${estado.buscar}”.` : 'No hay proveedores aquí.';
}

async function recargarProveedores() {
  try {
    await cargarProveedores();
    if (estado.vista === 'proveedores') pintarProveedores();
  } catch (error) {
    $('proveedores-estado').classList.remove('hidden');
    $('proveedores-estado').innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  }
}

async function mostrarProveedor(idProveedor, aviso = '') {
  estado.seleccion = { tipo: 'proveedor', id: Number(idProveedor) };
  marcarSeleccionado();
  panel.abrir();
  panelEl.setAttribute('aria-label', 'Detalle del proveedor');
  panelEl.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando…</p>';

  let p;
  try {
    p = await obtenerProveedor(idProveedor);
  } catch (error) {
    panelEl.innerHTML = `${htmlCabecera('Proveedor', '')}${htmlError(error.message)}`;
    return;
  }
  if (estado.seleccion?.tipo !== 'proveedor' || estado.seleccion.id !== p.idProveedor) return;

  const ultima = p.ultimasCompras[0];
  const contacto = [
    p.contactoNombre && `<b class="font-semibold">${escapar(p.contactoNombre)}</b>`,
    p.telefono && `<small>${escapar(p.telefono)}</small>`,
    p.correo && `<small class="break-all">${escapar(p.correo)}</small>`,
  ].filter(Boolean).join('');
  panelEl.innerHTML = `
    ${htmlCabecera(p.nombreComercial, escapar(p.razonSocial), { antes: p.activo ? '' : '<div class="mb-2"><span class="insignia insignia-apagada">Inactivo</span></div>' })}
    ${aviso ? htmlExito(aviso) : ''}
    <dl class="datos">
      <dt>NIT</dt><dd class="tabular-nums" data-campo="nit">${escapar(nitConGuiones(p.nit))}</dd>
      <dt>NRC</dt><dd class="tabular-nums" data-campo="nrc">${escapar(nrcConGuion(p.nrc))}</dd>
      <dt>Contacto</dt><dd>${contacto || '—'}</dd>
      ${p.direccion ? `<dt>Dirección</dt><dd data-campo="direccion">${escapar(p.direccion)}</dd>` : ''}
      <dt>Crédito</dt><dd data-campo="dias_credito">${credito(p.diasCredito)}${ultima?.fechaVencimientoPago ? `<small>La compra del ${fechaLarga(ultima.fechaCompra)} vence el ${fechaLarga(ultima.fechaVencimientoPago)}</small>` : ''}</dd>
      ${p.notas ? `<dt>Notas</dt><dd data-campo="notas">${escapar(p.notas)}</dd>` : ''}
    </dl>
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Últimas compras <span class="font-normal tabular-nums">${numero(p.comprasAnio.cantidad)} este año · ${dinero(p.comprasAnio.total)}</span></h3>
      ${p.ultimasCompras.length ? `<ul>${p.ultimasCompras.map((c) => `
        <li><button type="button" data-accion="ver-compra" data-id="${c.idCompra}" class="flex w-full cursor-pointer justify-between gap-3 border-b border-neutro-100 py-1.5 text-left tabular-nums hover:bg-fondo-sutil">
          <span><span class="text-texto-secundario">${fechaCorta(c.fechaCompra)}</span> · ${escapar(c.numeroCompra)} · ${c.productos ? plural(c.productos, 'producto', 'productos') : esNota(c.tipoDocumentoProveedor) ? TIPO_CORTO[c.tipoDocumentoProveedor] : 'gasto'}</span><b class="font-semibold">${c.tipoDocumentoProveedor === 'NC' ? '−' : ''}${dinero(c.total)}</b>
        </button></li>`).join('')}</ul>` : '<p class="text-texto-secundario">Todavía no se le ha comprado.</p>'}
    </div>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secundario" data-accion="editar-proveedor">Editar</button>
        <button type="button" class="btn btn-primario" data-accion="comprarle" ${p.activo ? '' : 'disabled title="Actívalo para registrarle compras"'}>Registrar compra</button>
      </div>
      <div class="flex items-center justify-between gap-3 text-sm">
        <button type="button" class="cursor-pointer font-semibold underline underline-offset-2 ${p.activo ? 'text-estado-error decoration-rojo-100' : 'decoration-borde-fuerte'}" data-accion="activo">${p.activo ? 'Desactivar proveedor' : 'Activar proveedor'}</button>
        <span class="text-13 text-texto-secundario">No se borra: sus compras quedan.</span>
      </div>
    </div>`;
  panelEl.proveedor = p;
  panel.enfocarTitulo(Boolean(aviso));
}

async function cambiarActivo(p) {
  if (p.activo && !confirm(`¿Desactivar a ${p.nombreComercial}? Ya no saldrá al registrar compras; sus compras quedan.`)) return;
  try {
    await cambiarActivoProveedor(p.idProveedor, !p.activo);
    await recargarProveedores();
    await mostrarProveedor(p.idProveedor, p.activo ? 'Proveedor desactivado.' : 'Proveedor activado.');
  } catch (error) {
    alert(error.message);
  }
}

const DIAS_CREDITO = [0, 15, 30, 60];

function mostrarFormularioProveedor(proveedor = null) {
  estado.sucio = false;
  panel.abrir();
  const editando = Boolean(proveedor);
  const p = proveedor ?? { diasCredito: 30 };
  const dias = DIAS_CREDITO.includes(p.diasCredito) ? DIAS_CREDITO : [...DIAS_CREDITO, p.diasCredito].sort((a, b) => a - b);
  panelEl.setAttribute('aria-label', editando ? 'Editar proveedor' : 'Nuevo proveedor');

  panelEl.innerHTML = `
    ${htmlCabecera(editando ? `Editar ${p.nombreComercial}` : 'Nuevo proveedor', 'Los campos con * son obligatorios')}
    <form id="form-proveedor" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-4 px-6">
        <p class="panel-titulo mb-0">Datos fiscales <span class="font-normal">vienen en el crédito fiscal del proveedor</span></p>
        ${campo({ nombre: 'nombreComercial', columna: 'nombre_comercial', etiqueta: 'Nombre comercial', obligatorio: true, control: entrada('nombreComercial', p.nombreComercial, 'maxlength="150" autocomplete="off"') })}
        ${campo({ nombre: 'razonSocial', columna: 'razon_social', etiqueta: 'Razón social', obligatorio: true, control: entrada('razonSocial', p.razonSocial, 'maxlength="250" autocomplete="off" placeholder="Ej.: Belleza Profesional, S.A. de C.V."') })}
        <div class="grid gap-4 sm:grid-cols-2">
          ${campo({ nombre: 'nit', columna: 'nit', etiqueta: 'NIT', obligatorio: true, control: entrada('nit', p.nit && nitConGuiones(p.nit), 'maxlength="17" inputmode="numeric" autocomplete="off" class="tabular-nums" placeholder="0000-000000-000-0"') })}
          ${campo({ nombre: 'nrc', columna: 'nrc', etiqueta: 'NRC', obligatorio: true, control: entrada('nrc', p.nrc && nrcConGuion(p.nrc), 'maxlength="9" inputmode="numeric" autocomplete="off" class="tabular-nums" placeholder="000000-0" aria-describedby="ayuda-nrc"') })}
        </div>
        <p class="campo-ayuda -mt-3" id="ayuda-nrc">Sin el NRC no se puede tomar el IVA como crédito fiscal.</p>

        <p class="panel-titulo mt-2 mb-0">Contacto</p>
        ${campo({ nombre: 'contactoNombre', columna: 'contacto_nombre', etiqueta: 'Persona de contacto', control: entrada('contactoNombre', p.contactoNombre, 'maxlength="100" autocomplete="off"') })}
        <div class="grid gap-4 sm:grid-cols-2">
          ${campo({ nombre: 'telefono', columna: 'telefono', etiqueta: 'Teléfono', control: entrada('telefono', p.telefono, 'type="tel" maxlength="30" autocomplete="off"') })}
          ${campo({ nombre: 'correo', columna: 'correo', etiqueta: 'Correo', control: entrada('correo', p.correo, 'type="email" maxlength="100" autocomplete="off"') })}
        </div>
        ${campo({ nombre: 'direccion', columna: 'direccion', etiqueta: 'Dirección', control: entrada('direccion', p.direccion, 'maxlength="200" autocomplete="off"') })}

        <fieldset data-campo="dias_credito">
          <legend class="campo-etiqueta">Días de crédito</legend>
          <div class="flex flex-wrap gap-2">
            ${dias.map((d) => `<label class="chip"><input type="radio" name="diasCredito" value="${d}" ${d === p.diasCredito ? 'checked' : ''}>${credito(d)}</label>`).join('')}
          </div>
          <p class="campo-ayuda">Cada compra mostrará cuándo vence su pago.</p>
        </fieldset>
        ${campo({ nombre: 'notas', columna: 'notas', etiqueta: 'Notas', control: `<textarea id="f-notas" name="notas" maxlength="300" rows="2" placeholder="Ej.: días de entrega, pedido mínimo">${escapar(p.notas ?? '')}</textarea>` })}
      </div>
      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar proveedor</button>
        </div>
        <p class="text-center text-13 text-texto-secundario">No se repite el NIT ni el NRC. Los cambios quedan en la bitácora.</p>
      </div>
    </form>`;

  const form = $('form-proveedor');
  form.addEventListener('input', () => { estado.sucio = true; });
  form.addEventListener('submit', (e) => enviarProveedor(e, proveedor));
  panel.enfocarTitulo();
  form.elements.nombreComercial.focus();
}

function leerProveedor(form) {
  const v = (nombre) => form.elements[nombre].value.trim().replace(/\s+/g, ' ');
  const datos = {
    nombreComercial: v('nombreComercial'),
    razonSocial: v('razonSocial'),
    nit: soloDigitos(v('nit')),
    nrc: soloDigitos(v('nrc')),
    contactoNombre: v('contactoNombre') || null,
    telefono: v('telefono') || null,
    correo: v('correo') || null,
    direccion: v('direccion') || null,
    diasCredito: Number(form.elements.diasCredito.value),
    notas: v('notas') || null,
  };
  const errores = {};
  if (!datos.nombreComercial) errores.nombreComercial = 'Escriba el nombre con que lo conocen.';
  if (!datos.razonSocial) errores.razonSocial = 'Escriba la razón social (está en su crédito fiscal).';
  if (!datos.nit) errores.nit = 'Escriba el NIT.';
  else if (![9, 14].includes(datos.nit.length)) errores.nit = 'El NIT tiene 14 dígitos (o 9 si es un DUI).';
  if (!datos.nrc) errores.nrc = 'Escriba el NRC.';
  else if (datos.nrc.length < 2 || datos.nrc.length > 8) errores.nrc = 'El NRC tiene de 2 a 8 dígitos.';
  if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) errores.correo = 'Revise el correo.';
  return { datos, errores };
}

async function enviarProveedor(evento, proveedor) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');
  const { datos, errores } = leerProveedor(form);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const guardado = await guardarProveedor(datos, proveedor?.idProveedor);
    estado.sucio = false;
    await recargarProveedores();
    await mostrarProveedor(guardado.idProveedor, proveedor ? 'Cambios guardados.' : 'Proveedor guardado. Ya sale al registrar compras.');
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    const existente = error.detalle?.idProveedorExistente;
    errorGeneral.innerHTML = `${icono('alerta')}<div><p>${escapar(error.message)}</p>${existente ? `<button type="button" class="mt-1 cursor-pointer font-semibold underline underline-offset-2" data-accion="ver-proveedor" data-id="${existente}">Ver ese proveedor</button>` : ''}</div>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar proveedor';
  }
}

// --- Registrar compra --------------------------------------------------------

/** Texto del input → número válido o null. */
const comoNumero = (texto) => (texto === '' || texto == null || Number.isNaN(Number(texto)) ? null : Number(texto));
/** Costo para el input: 6.8 → '6.80'; con más decimales (6.8333) se deja igual. */
const textoCosto = (n) => (Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n.toFixed(2) : String(n));
const cantidadValida = (n) => Number.isInteger(n) && n >= 1 && n <= 9999;
const costoValido = (n) => n !== null && n >= 0 && Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-6;

/** Líneas con cantidad y costo válidos, para el resumen. */
const lineasListas = () => estado.lineas
  .map((l) => ({ ...l, n: comoNumero(l.cantidad), c: comoNumero(l.costo) }))
  .filter((l) => cantidadValida(l.n) && costoValido(l.c));

function htmlExistencia(p) {
  if (p.existencia === 0) return `<small class="text-13 font-semibold text-estado-error">agotado · mínimo ${p.stockMinimo}</small>`;
  const bajo = p.existencia < p.stockMinimo;
  return `<small class="text-13 ${bajo ? 'font-semibold text-estado-aviso' : 'text-texto-secundario'}">hay ${numero(p.existencia)} · mínimo ${p.stockMinimo}</small>`;
}

/** "subió $0.20" debajo del costo, si es distinto del de la última compra. */
function cambioCosto(producto, costo) {
  if (producto.ultimoCosto === null || costo === null) return null;
  const diferencia = centavos(costo - producto.ultimoCosto);
  return diferencia === 0 ? null : diferencia;
}

function htmlLinea({ producto: p, cantidad, costo }) {
  const id = p.idProducto;
  return `<li class="fila-linea" data-linea="${id}">
    <div class="col-span-2 min-w-0 md:col-span-1"><b class="block truncate font-semibold">${escapar(p.nombreProducto)}</b>${htmlExistencia(p)}</div>
    <label class="block"><span class="mb-1 block text-13 text-texto-secundario md:sr-only">Cantidad</span>
      <div class="campo-caja h-10 min-h-0"><input name="cantidad-${id}" id="f-cantidad-${id}" value="${escapar(cantidad)}" type="number" inputmode="numeric" min="1" max="9999" step="1" class="text-right tabular-nums" aria-label="Cantidad de ${escapar(p.nombreProducto)}"></div></label>
    <label class="block"><span class="mb-1 block text-13 text-texto-secundario md:sr-only">Costo c/u sin IVA</span>
      <div class="campo-caja h-10 min-h-0"><span class="text-texto-secundario">$</span><input name="costo-${id}" id="f-costo-${id}" value="${escapar(costo)}" type="number" inputmode="decimal" min="0" step="0.0001" class="text-right tabular-nums" aria-label="Costo de ${escapar(p.nombreProducto)} sin IVA"></div>
      <small class="mt-1 block text-right text-xs font-semibold text-estado-aviso" data-cambio></small></label>
    <span class="text-right tabular-nums md:pt-2.5"><span class="mb-1 block text-13 text-texto-secundario md:sr-only">Subtotal</span><b class="font-semibold max-md:leading-10" data-subtotal></b></span>
    <button type="button" class="grid size-8 cursor-pointer place-items-center rounded-chico text-texto-secundario hover:bg-fondo-sutil max-md:col-start-3 max-md:row-start-1 md:mt-1" data-accion="quitar" data-id="${id}" aria-label="Quitar ${escapar(p.nombreProducto)}">${icono('cerrar', 'size-[18px]')}</button>
    <div class="col-span-full hidden has-[.campo-error:not(.hidden)]:block"><p class="campo-error mt-0 hidden" id="error-cantidad-${id}"></p><p class="campo-error mt-0 hidden" id="error-costo-${id}"></p></div>
  </li>`;
}

function pintarLineas() {
  $('lineas').innerHTML = estado.lineas.map(htmlLinea).join('');
  $('lineas-vacio').classList.toggle('hidden', estado.lineas.length > 0);
  $('cabecera-lineas').classList.toggle('md:grid', estado.lineas.length > 0);
  for (const l of estado.lineas) actualizarLinea(l);
  pintarResumen();
}

/** Subtotal y aviso de costo de una línea (sin volver a dibujar los inputs, para no perder el foco). */
function actualizarLinea(linea) {
  const li = document.querySelector(`[data-linea="${linea.producto.idProducto}"]`);
  const n = comoNumero(linea.cantidad);
  const c = comoNumero(linea.costo);
  li.querySelector('[data-subtotal]').textContent = cantidadValida(n) && costoValido(c) ? dinero(centavos(n * c)) : '—';
  const cambio = costoValido(c) ? cambioCosto(linea.producto, c) : null;
  li.querySelector('[data-cambio]').textContent = cambio === null ? '' : `${cambio > 0 ? 'subió' : 'bajó'} ${dinero(Math.abs(cambio))}`;
}

// --- Gastos del local (líneas sin producto) ---------------------------------

const montoValido = (n) => n !== null && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const gastosListos = () => estado.gastos
  .map((g) => ({ ...g, m: comoNumero(g.monto) }))
  .filter((g) => g.descripcion.trim() && montoValido(g.m) && g.m > 0);

function htmlGasto({ clave, descripcion, monto }) {
  return `<li class="fila-gasto" data-gasto="${clave}">
    <label class="block min-w-0"><span class="mb-1 block text-13 text-texto-secundario md:sr-only">Descripción</span>
      <div class="campo-caja h-10 min-h-0"><input name="descripcion-${clave}" id="f-descripcion-${clave}" value="${escapar(descripcion)}" maxlength="200" autocomplete="off" placeholder="Ej.: Energía eléctrica del local" aria-label="Qué se pagó"></div></label>
    <label class="block"><span class="mb-1 block text-13 text-texto-secundario md:sr-only">Monto sin IVA</span>
      <div class="campo-caja h-10 min-h-0"><span class="text-texto-secundario">$</span><input name="monto-${clave}" id="f-monto-${clave}" value="${escapar(monto)}" type="number" inputmode="decimal" min="0.01" step="0.01" class="text-right tabular-nums" aria-label="Monto sin IVA"></div></label>
    <button type="button" class="mt-1 grid size-8 cursor-pointer place-items-center self-end rounded-chico text-texto-secundario hover:bg-fondo-sutil md:self-start" data-accion="quitar-gasto" data-id="${clave}" aria-label="Quitar este gasto">${icono('cerrar', 'size-[18px]')}</button>
    <div class="col-span-full hidden has-[.campo-error:not(.hidden)]:block"><p class="campo-error mt-0 hidden" id="error-descripcion-${clave}"></p><p class="campo-error mt-0 hidden" id="error-monto-${clave}"></p></div>
  </li>`;
}

function pintarGastos() {
  $('gastos').innerHTML = estado.gastos.map(htmlGasto).join('');
  $('gastos-vacio').classList.toggle('hidden', estado.gastos.length > 0);
  $('cabecera-gastos').classList.toggle('md:grid', estado.gastos.length > 0);
  pintarResumen();
}

function agregarGasto() {
  const clave = `g${estado.siguienteGasto++}`;
  estado.gastos.push({ clave, descripcion: '', monto: '' });
  estado.sucio = true;
  pintarGastos();
  $(`f-descripcion-${clave}`).focus();
}

// --- Clasificación para renta (anexo de compras) ----------------------------

const opciones = (pares, actual) => pares.map(([v, t]) => `<option value="${v}" ${Number(v) === Number(actual) ? 'selected' : ''}>${t}</option>`).join('');

/** Lo que se propone mientras la usuaria no la cambie: productos para vender = costo; una nota, lo de su compra; lo demás = gasto. */
function rentaPropuesta() {
  if (esNota($('form-compra').elements.tipoDocumentoProveedor.value)) return estado.rentaRelacionada ?? RENTA_GASTOS;
  return estado.lineas.length ? RENTA_PRODUCTOS : RENTA_GASTOS;
}

function leerRenta() {
  const e = $('form-compra').elements;
  return {
    tipoOperacionRenta: Number(e.tipoOperacionRenta.value), clasificacionRenta: Number(e.clasificacionRenta.value),
    sectorRenta: Number(e.sectorRenta.value), tipoCostoGasto: Number(e.tipoCostoGasto.value),
  };
}

function ponerRenta(r) {
  const e = $('form-compra').elements;
  e.tipoOperacionRenta.value = r.tipoOperacionRenta;
  e.clasificacionRenta.value = r.clasificacionRenta;
  e.sectorRenta.value = r.sectorRenta;
  e.tipoCostoGasto.innerHTML = opciones(TIPOS_COSTO_GASTO[r.clasificacionRenta], r.tipoCostoGasto);
}

function pintarRenta() {
  if (!estado.rentaTocada) {
    const propuesta = rentaPropuesta();
    if (JSON.stringify(propuesta) !== JSON.stringify(leerRenta())) ponerRenta(propuesta);
  }
  const r = leerRenta();
  $('resumen-renta').textContent = `${OPERACION_RENTA[r.tipoOperacionRenta]} · ${textoRenta(r)}`;
}

/** Totales como los guardará la base: gravado (productos + gastos), exento, IVA, percepción y total. */
function totalesFormulario() {
  const form = $('form-compra');
  const tipo = form.elements.tipoDocumentoProveedor.value;
  const productos = esNota(tipo) ? [] : lineasListas().map((l) => ({ cantidad: l.n, costoUnitario: l.c }));
  const gastos = gastosListos().map((g) => ({ cantidad: 1, costoUnitario: g.m }));
  const exentas = comoNumero(form.elements.comprasExentas.value);
  return totalesCompra([...productos, ...gastos], estado.ivaPct, tipo, {
    exentas: montoValido(exentas) ? exentas : 0, percepcion: form.elements.percepcion.checked,
  });
}

function pintarResumen() {
  const tipo = $('form-compra').elements.tipoDocumentoProveedor.value;
  const nota = esNota(tipo);
  const unidades = nota ? 0 : lineasListas().reduce((s, l) => s + l.n, 0);
  const { subtotalSinIva, comprasExentas, iva, ivaPercibido, total } = totalesFormulario();
  const fila = (etiqueta, valor, clase = 'text-texto-secundario') => `<li class="flex justify-between gap-3 py-1 ${clase}"><span>${etiqueta}</span><span>${valor}</span></li>`;
  const cuenta = [];
  if (!nota && (estado.lineas.length || !estado.gastos.length)) cuenta.push(`${plural(estado.lineas.length, 'producto', 'productos')} · ${plural(unidades, 'unidad', 'unidades')}`);
  if (nota || estado.gastos.length) cuenta.push(nota ? plural(estado.gastos.length, 'concepto', 'conceptos') : plural(estado.gastos.length, 'gasto', 'gastos'));
  $('resumen-compra').innerHTML = `
    <p class="mb-2 text-texto-secundario">${cuenta.join(' · ')}</p>
    <ul class="tabular-nums">
      ${fila(comprasExentas ? 'Gravado' : 'Subtotal', dinero(subtotalSinIva))}
      ${comprasExentas ? fila('Exento o no sujeto', dinero(comprasExentas)) : ''}
      ${fila(conIva(tipo) ? `IVA ${estado.ivaPct} % (crédito fiscal)` : 'IVA (no se acredita: va dentro del costo)', dinero(iva))}
      ${ivaPercibido ? fila(`Percepción ${PERCEPCION_PCT} % (anticipo de IVA)`, dinero(ivaPercibido)) : ''}
      ${fila(tipo === 'NC' ? 'Total que resta' : 'Total a pagar', dinero(total), 'text-base font-semibold border-t border-borde-default mt-1 pt-2')}
    </ul>`;
  pintarRenta();
  pintarLotes();
}

/** "Así quedan los lotes" del producto de la línea en la que se está escribiendo. */
function pintarLotes() {
  const caja = $('lotes-compra');
  const linea = estado.lineas.find((l) => l.producto.idProducto === estado.idLineaActual) ?? estado.lineas.at(-1);
  if (esNota($('form-compra').elements.tipoDocumentoProveedor.value)) {
    caja.innerHTML = '<p class="text-texto-secundario">Una nota del proveedor no mueve el inventario.</p>';
    return;
  }
  if (!linea) {
    caja.innerHTML = `<p class="text-texto-secundario">${estado.gastos.length ? 'Los gastos no entran al inventario.' : 'Agregue un producto para ver cómo quedan sus lotes.'}</p>`;
    return;
  }
  const p = linea.producto;
  const n = comoNumero(linea.cantidad);
  const c = comoNumero(linea.costo);
  const lote = (titulo, etiqueta, costo, detalle, nuevo = false) => `
    <li class="grid grid-cols-[1fr_auto] gap-x-3 rounded-chico border px-3 py-2 tabular-nums ${nuevo ? 'border-dashed border-estado-info bg-estado-info-fondo' : 'border-borde-default'}">
      <b class="font-semibold">${titulo}${etiqueta}</b><b class="text-right font-semibold">${costo}</b>
      <small class="text-13 text-texto-secundario">${detalle}</small><small class="text-right text-13 text-texto-secundario">costo c/u</small>
    </li>`;
  const existentes = p.lotes.map((l, i) => lote(
    fechaLarga(l.fechaIngreso), i === 0 ? ' <span class="insignia insignia-ok ml-1 align-middle">Sale primero</span>' : '',
    dinero(l.costoUnitario), `${l.numeroCompra ? `Compra ${escapar(l.numeroCompra)}` : 'Ajuste de entrada'} · quedan ${numero(l.cantidadDisponible)}`,
  ));
  const listo = cantidadValida(n) && costoValido(c);
  const nuevo = lote('Hoy', ' <span class="insignia insignia-apagada ml-1 align-middle">Nuevo</span>', costoValido(c) ? dinero(c) : '—',
    `Esta compra · ${listo ? plural(n, 'unidad', 'unidades') : 'falta la cantidad'}`, true);
  const cambio = costoValido(c) ? cambioCosto(p, c) : null;
  caja.innerHTML = `
    <h3 class="panel-titulo">Así quedan los lotes <span class="truncate pl-2 font-normal">${escapar(p.nombreProducto)}</span></h3>
    <ul class="flex flex-col gap-2">${existentes.join('')}${nuevo}</ul>
    <p class="mt-3 flex justify-between text-texto-secundario"><span>Existencia</span><b class="font-semibold text-texto-principal tabular-nums">${numero(p.existencia)} → ${listo ? numero(p.existencia + n) : '…'}</b></p>
    ${cambio === null ? '' : `<div class="aviso aviso-aviso mt-3">${icono('advertencia')}<p><b class="block font-semibold">El costo ${cambio > 0 ? 'subió' : 'bajó'} ${dinero(Math.abs(cambio))}</b>El precio de venta sigue en ${dinero(p.precioVenta)}. Si quieres cambiarlo, edítalo en Inventario.</p></div>`}`;
}

function ayudaProveedor(form) {
  const p = estado.proveedores.find((x) => x.idProveedor === Number(form.elements.idProveedor.value));
  if (!p) return 'Solo salen los activos.';
  const fecha = form.elements.fechaCompra.value;
  const vence = p.diasCredito && fecha ? `: vence el ${fechaCorta(fechaIso(fecha, p.diasCredito))}` : '';
  return `NRC ${escapar(nrcConGuion(p.nrc))} · ${p.diasCredito ? `crédito ${p.diasCredito} días${vence}` : 'de contado'}`;
}

const etiquetaDocumento = (tipo, impreso) => {
  if (tipo === 'OTRO' || impreso) return 'N.º del documento';
  return { CCF: 'N.º de control del CCF', FACTURA: 'N.º de control de la factura', NC: 'N.º de control de la nota', ND: 'N.º de control de la nota' }[tipo];
};

/** Los 4 meses en que se puede declarar el crédito fiscal: el del documento y los 3 siguientes (art. 63 Ley de IVA). */
function pintarPeriodos() {
  const form = $('form-compra');
  const select = form.elements.periodoIva;
  const base = new Date(`${mesDe(form.elements.fechaCompra.value || fechaIso())}T00:00:00`);
  const meses = [0, 1, 2, 3].map((n) => fechaIso(new Date(base.getFullYear(), base.getMonth() + n, 1)));
  const actual = meses.includes(select.value) ? select.value : meses[0];
  select.innerHTML = meses.map((m, i) => `<option value="${m}" ${m === actual ? 'selected' : ''}>${mesAnio(`${m}T00:00:00`)}${i === 0 ? ' (el del documento)' : ''}</option>`).join('');
}

let peticionRelacionadas = 0;
/** Las compras con crédito fiscal del proveedor, para elegir cuál corrige la nota. */
async function cargarRelacionadas() {
  const form = $('form-compra');
  const select = form.elements.idCompraRelacionada;
  const idProveedor = form.elements.idProveedor.value;
  const id = ++peticionRelacionadas;
  if (!idProveedor) {
    select.innerHTML = '<option value="">Primero elija el proveedor</option>';
    return;
  }
  const { contenido } = await listarCompras({ idProveedor });
  if (id !== peticionRelacionadas) return;
  const ccf = contenido.filter((c) => c.tipoDocumentoProveedor === 'CCF' && c.estado !== 'ANULADA');
  const elegida = select.value;
  select.innerHTML = ccf.length
    ? `<option value="">Elegir…</option>${ccf.map((c) => `<option value="${c.idCompra}" ${String(c.idCompra) === elegida ? 'selected' : ''}>${escapar(c.numeroCompra)} · ${fechaCorta(c.fechaCompra)} · ${dinero(c.total)}</option>`).join('')}`
    : '<option value="">Este proveedor no tiene créditos fiscales</option>';
}

/** La nota toma la clasificación para renta de la compra que corrige. */
async function rentaDeRelacionada(idCompra) {
  estado.rentaRelacionada = null;
  if (idCompra) {
    const c = await obtenerCompra(idCompra);
    estado.rentaRelacionada = {
      tipoOperacionRenta: c.tipoOperacionRenta, clasificacionRenta: c.clasificacionRenta, sectorRenta: c.sectorRenta, tipoCostoGasto: c.tipoCostoGasto,
    };
  }
  pintarRenta();
}

/** Muestra solo los campos que pide el tipo de documento elegido. */
function pintarDocumento() {
  const form = $('form-compra');
  const tipo = form.elements.tipoDocumentoProveedor.value;
  const impreso = form.elements.claseImpreso.checked;
  const caja = (columna) => form.querySelector(`[data-campo="${columna}"]`);
  caja('clase_documento').hidden = !conIva(tipo);
  caja('codigo_generacion_proveedor').hidden = !conIva(tipo) || impreso;
  caja('id_compra_relacionada').hidden = !esNota(tipo);
  caja('periodo_iva').hidden = !conIva(tipo);
  caja('iva_percibido').hidden = !conIva(tipo);
  $('etiqueta-documento').innerHTML = `${etiquetaDocumento(tipo, impreso)} ${tipo === 'OTRO' ? '<span class="opcional">opcional</span>' : '<span class="text-estado-error" aria-hidden="true">*</span>'}`;
  $('ayuda-idProveedor').innerHTML = ayudaProveedor(form);
  $('tarjeta-productos').hidden = esNota(tipo);
  $('titulo-gastos').textContent = esNota(tipo) ? 'Conceptos de la nota' : 'Gastos del local';
  $('ayuda-gastos').textContent = esNota(tipo)
    ? 'Una nota no mueve el inventario: si se devolvió producto, regístralo con un ajuste en Inventario.'
    : 'Alquiler, luz, agua, mantenimiento: no entran al inventario.';
  form.elements.agregarGasto.lastChild.textContent = esNota(tipo) ? 'Agregar concepto' : 'Agregar gasto';
  pintarPeriodos();
  if (esNota(tipo)) cargarRelacionadas().catch(() => {});
  pintarResumen();
}

async function abrirRegistrar({ idProveedor = null, idProductos = [] } = {}) {
  if (!sePuedeSalir()) return;
  estado.lineas = [];
  estado.gastos = [];
  estado.siguienteGasto = 1;
  estado.rentaTocada = false;
  estado.rentaRelacionada = null;
  estado.idLineaActual = null;
  estado.seleccion = null;
  panel.cerrar();
  cambiarVista('registrar');
  const hoy = fechaIso();
  const activos = estado.proveedores.filter((p) => p.activo);
  const r = RENTA_GASTOS;

  $('vista-registrar').innerHTML = `
    <form id="form-compra" class="contents" novalidate>
      <section class="flex min-w-0 flex-col gap-4 p-4 sm:px-8 sm:py-6" aria-labelledby="titulo-registrar">
        <div>
          <button type="button" class="mb-1 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-texto-secundario hover:text-texto-principal" data-accion="cancelar-compra">← Compras</button>
          <h2 id="titulo-registrar" class="text-xl outline-none" tabindex="-1">Registrar compra</h2>
        </div>
        <div id="form-error" class="aviso aviso-error hidden" role="alert"></div>

        <div class="tarjeta rounded-grande p-4 sm:px-6">
          <h3 class="mb-3 font-semibold">Documento del proveedor</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            ${campo({ nombre: 'idProveedor', columna: 'id_proveedor', etiqueta: 'Proveedor', obligatorio: true, ayuda: 'Solo salen los activos.', control: `<select id="f-idProveedor" name="idProveedor" aria-describedby="ayuda-idProveedor"><option value="">Elegir…</option>${activos.map((p) => `<option value="${p.idProveedor}" ${p.idProveedor === Number(idProveedor) ? 'selected' : ''}>${escapar(p.nombreComercial)}</option>`).join('')}</select>` })}
            ${campo({ nombre: 'fechaCompra', columna: 'fecha_compra', etiqueta: 'Fecha de la compra', obligatorio: true, control: entrada('fechaCompra', hoy, `type="date" max="${hoy}"`) })}
            ${campo({ nombre: 'tipoDocumentoProveedor', columna: 'tipo_documento_proveedor', etiqueta: 'Documento', obligatorio: true, control: `<select id="f-tipoDocumentoProveedor" name="tipoDocumentoProveedor">${Object.entries(TIPO_DOCUMENTO).map(([v, t]) => `<option value="${v}">${t}${v === 'CCF' ? ' (CCF)' : ''}</option>`).join('')}</select>` })}
            <div data-campo="clase_documento" class="sm:self-end sm:pb-2.5">
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="claseImpreso" class="size-4 accent-neutro-900"> Es un documento impreso (no electrónico)</label>
            </div>
            <div data-campo="numero_documento_proveedor">
              <label class="campo-etiqueta" for="f-numeroDocumentoProveedor" id="etiqueta-documento"></label>
              <div class="campo-caja"><input id="f-numeroDocumentoProveedor" name="numeroDocumentoProveedor" maxlength="40" autocomplete="off" spellcheck="false" class="font-mono text-sm" placeholder="DTE-03-…"></div>
              <p class="campo-error hidden" id="error-numeroDocumentoProveedor"></p>
            </div>
            ${campo({ nombre: 'codigoGeneracionProveedor', columna: 'codigo_generacion_proveedor', etiqueta: 'Código de generación', obligatorio: true, ayuda: 'Viene en el documento, con guiones. Es lo que pide el libro de compras.', control: entrada('codigoGeneracionProveedor', '', 'maxlength="36" autocomplete="off" spellcheck="false" class="font-mono text-sm uppercase" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" aria-describedby="ayuda-codigoGeneracionProveedor"') })}
            <div class="sm:col-span-2" data-campo="id_compra_relacionada">
              ${campo({ nombre: 'idCompraRelacionada', columna: 'id_compra_relacionada', etiqueta: 'Compra que corrige', obligatorio: true, control: '<select id="f-idCompraRelacionada" name="idCompraRelacionada"><option value="">Primero elija el proveedor</option></select>' }).replace(' data-campo="id_compra_relacionada"', '')}
            </div>
            ${campo({ nombre: 'periodoIva', columna: 'periodo_iva', etiqueta: 'Mes del crédito fiscal', obligatorio: true, ayuda: 'El del documento o hasta 3 meses después.', control: '<select id="f-periodoIva" name="periodoIva" aria-describedby="ayuda-periodoIva"></select>' })}
            ${campo({ nombre: 'comprasExentas', columna: 'compras_exentas', etiqueta: 'Exento o no sujeto', control: `<span class="text-texto-secundario">$</span>${entrada('comprasExentas', '', 'type="number" inputmode="decimal" min="0" step="0.01" class="text-right tabular-nums" placeholder="0.00" aria-describedby="ayuda-comprasExentas"')}`, ayuda: 'Solo si el documento trae montos sin IVA.' })}
            <div class="sm:col-span-2" data-campo="iva_percibido">
              <label class="flex items-start gap-2 text-sm"><input type="checkbox" name="percepcion" class="mt-0.5 size-4 accent-neutro-900"> <span>El proveedor cobró percepción de IVA del ${PERCEPCION_PCT} % <span class="text-texto-secundario">(lo cobran los grandes contribuyentes en compras de $100 o más)</span></span></label>
            </div>
          </div>
        </div>

        <div class="tarjeta rounded-grande p-4 sm:px-6" id="tarjeta-productos">
          <h3 class="mb-3 font-semibold">Productos que llegaron</h3>
          <div id="cabecera-lineas" class="hidden grid-cols-[minmax(0,1fr)_88px_136px_96px_32px] gap-x-3 border-b border-borde-default pb-2 text-13 font-semibold text-texto-secundario" aria-hidden="true">
            <span>Producto</span><span>Cantidad</span><span>Costo c/u sin IVA</span><span class="text-right">Subtotal</span><span></span>
          </div>
          <ul id="lineas"></ul>
          <p id="lineas-vacio" class="py-2 text-sm text-texto-secundario">Todavía no hay productos. Búsquelos o escanee el código.</p>
          <div class="relative mt-3 sm:max-w-sm" data-campo="detalle">
            <label class="campo-caja h-10 min-h-0">
              ${icono('buscar')}
              <span class="sr-only">Agregar producto</span>
              <input id="f-agregar" name="agregar" type="search" placeholder="Agregar producto o escanear código" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="sugerencias" aria-autocomplete="list">
            </label>
            <ul id="sugerencias" role="listbox" class="absolute inset-x-0 top-full z-10 mt-1 hidden overflow-hidden rounded-chico border border-borde-default bg-fondo-superficie shadow-lg"></ul>
            <p class="campo-error hidden" id="error-agregar"></p>
          </div>
          <p class="mt-4 flex gap-2 text-sm text-texto-secundario">${icono('info', 'mt-0.5 size-[18px] text-estado-info')}<span>Cada producto entra como un lote nuevo con su propio costo. Se vende después de los lotes que ya hay (PEPS), así el costo de cada venta es el real.</span></p>
        </div>

        <div class="tarjeta rounded-grande p-4 sm:px-6" data-campo="descripcion">
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 class="font-semibold" id="titulo-gastos">Gastos del local</h3>
            <span class="text-13 text-texto-secundario" id="ayuda-gastos"></span>
          </div>
          <div id="cabecera-gastos" class="hidden grid-cols-[minmax(0,1fr)_136px_32px] gap-x-3 border-b border-borde-default pb-2 text-13 font-semibold text-texto-secundario" aria-hidden="true">
            <span>Qué se pagó</span><span>Monto sin IVA</span><span></span>
          </div>
          <ul id="gastos"></ul>
          <p id="gastos-vacio" class="py-2 text-sm text-texto-secundario">Sin gastos en este documento.</p>
          <button type="button" name="agregarGasto" class="btn btn-secundario mt-3 h-9 px-3 text-sm" data-accion="agregar-gasto">${icono('mas')}<span>Agregar gasto</span></button>
          <p class="campo-error hidden" id="error-agregarGasto"></p>
        </div>

        <details class="tarjeta group rounded-grande p-4 sm:px-6">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span class="min-w-0"><b class="block font-semibold">Para el anexo de Hacienda</b><small class="block text-13 text-texto-secundario" id="resumen-renta"></small></span>
            ${icono('abajo', 'size-5 shrink-0 text-texto-secundario transition-transform group-open:rotate-180')}
          </summary>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            ${campo({ nombre: 'clasificacionRenta', columna: 'clasificacion_renta', etiqueta: 'Es un', obligatorio: true, control: `<select id="f-clasificacionRenta" name="clasificacionRenta">${opciones(Object.entries(CLASIFICACION_RENTA), r.clasificacionRenta)}</select>` })}
            ${campo({ nombre: 'tipoCostoGasto', columna: 'tipo_costo_gasto', etiqueta: 'Tipo', obligatorio: true, control: `<select id="f-tipoCostoGasto" name="tipoCostoGasto">${opciones(TIPOS_COSTO_GASTO[r.clasificacionRenta], r.tipoCostoGasto)}</select>` })}
            ${campo({ nombre: 'tipoOperacionRenta', columna: 'tipo_operacion_renta', etiqueta: 'Operación', obligatorio: true, control: `<select id="f-tipoOperacionRenta" name="tipoOperacionRenta">${opciones(Object.entries(OPERACION_RENTA), r.tipoOperacionRenta)}</select>` })}
            ${campo({ nombre: 'sectorRenta', columna: 'sector_renta', etiqueta: 'Sector', obligatorio: true, control: `<select id="f-sectorRenta" name="sectorRenta">${opciones(Object.entries(SECTOR_RENTA), r.sectorRenta)}</select>` })}
          </div>
          <p class="mt-3 text-13 text-texto-secundario">Se proponen solas: productos para vender = costo; lo demás = gasto. Pendiente de confirmar con la contadora.</p>
        </details>
      </section>

      <aside class="flex flex-col border-borde-default bg-fondo-superficie max-xl:border-t xl:sticky xl:top-16 xl:h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:border-l" aria-label="Resumen de la compra">
        <div class="px-6 pt-6 pb-2"><h2 class="text-xl">Resumen</h2></div>
        <div id="resumen-compra" class="px-6 text-sm" aria-live="polite"></div>
        <div class="separa"></div>
        <div id="lotes-compra" class="px-6 text-sm"></div>
        <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
          <div class="grid grid-cols-2 gap-3">
            <button type="button" class="btn btn-secundario" data-accion="cancelar-compra">Cancelar</button>
            <button type="submit" class="btn btn-primario" id="btn-guardar-compra">Guardar compra</button>
          </div>
          <p class="text-center text-13 text-texto-secundario">Los productos suben la existencia al guardar. Todo queda en la bitácora.</p>
        </div>
      </aside>
    </form>`;

  pintarLineas();
  pintarGastos();
  pintarDocumento();
  $('titulo-registrar').focus();
  for (const id of idProductos) await agregarLinea(id, { enfocar: false });
  estado.sucio = false; // lo que llegó por la URL o el aviso no cuenta como cambio
}

async function agregarLinea(idProducto, { enfocar = true } = {}) {
  const existente = estado.lineas.find((l) => l.producto.idProducto === Number(idProducto));
  if (existente) {
    $(`f-cantidad-${existente.producto.idProducto}`)?.focus();
    return;
  }
  try {
    const producto = await obtenerProducto(idProducto);
    if (!producto.activo || estado.lineas.some((l) => l.producto.idProducto === producto.idProducto)) return;
    estado.lineas.push({ producto, cantidad: '', costo: producto.ultimoCosto === null ? '' : textoCosto(producto.ultimoCosto) });
    estado.idLineaActual = producto.idProducto;
    estado.sucio = true;
    pintarLineas();
    if (enfocar) $(`f-cantidad-${producto.idProducto}`).focus();
  } catch (error) {
    mostrarErrores($('form-compra'), { agregar: error.message });
  }
}

let esperaSugerencias;
let peticionSugerencias = 0;

function cerrarSugerencias() {
  $('sugerencias').classList.add('hidden');
  $('f-agregar').setAttribute('aria-expanded', 'false');
}

async function buscarSugerencias(texto) {
  const id = ++peticionSugerencias;
  if (!texto) { cerrarSugerencias(); return []; }
  const { contenido } = await listarProductos({ buscar: texto });
  if (id !== peticionSugerencias) return null;
  const ya = new Set(estado.lineas.map((l) => l.producto.idProducto));
  const encontrados = contenido.filter((p) => !ya.has(p.idProducto)).slice(0, 6);
  const lista = $('sugerencias');
  lista.innerHTML = encontrados.length
    ? encontrados.map((p) => `<li role="option"><button type="button" tabindex="-1" data-accion="sugerencia" data-id="${p.idProducto}" class="flex w-full cursor-pointer justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-fondo-sutil">
        <span class="min-w-0"><b class="block truncate font-semibold">${escapar(p.nombreProducto)}</b><small class="font-mono text-xs text-texto-secundario">${escapar(p.codigo)}</small></span>
        <small class="shrink-0 text-texto-secundario tabular-nums">hay ${numero(p.existencia)}</small></button></li>`).join('')
    : `<li class="px-3 py-2 text-sm text-texto-secundario">Ningún producto activo coincide. ¿Es nuevo? Créalo primero en Inventario.</li>`;
  lista.classList.remove('hidden');
  $('f-agregar').setAttribute('aria-expanded', 'true');
  return { encontrados, contenido };
}

/** Enter en el buscador: si es un código exacto (lector de barras) o hay un solo resultado, lo agrega. */
async function agregarDesdeBuscador(input) {
  clearTimeout(esperaSugerencias);
  const texto = input.value.trim();
  const r = await buscarSugerencias(texto);
  if (!r) return;
  const exacto = r.contenido.find((p) => p.codigo === texto);
  const elegido = exacto ?? (r.encontrados.length === 1 ? r.encontrados[0] : null);
  if (!elegido) return;
  input.value = '';
  cerrarSugerencias();
  await agregarLinea(elegido.idProducto);
}

/** Código de generación con guiones y en mayúsculas; acepta los 32 caracteres sin guiones. Null si no tiene forma de código. */
function normalizarCodigo(texto) {
  const limpio = texto.replace(/\s+/g, '').toUpperCase();
  const sinGuiones = limpio.replace(/-/g, '');
  if (!/^[0-9A-F]{32}$/.test(sinGuiones) || (limpio.includes('-') && !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(limpio))) return null;
  return sinGuiones.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function leerCompra(form) {
  const v = (nombre) => form.elements[nombre].value.trim();
  const tipo = v('tipoDocumentoProveedor');
  const nota = esNota(tipo);
  const impreso = conIva(tipo) && form.elements.claseImpreso.checked;
  const pideCodigo = conIva(tipo) && !impreso;
  const exentas = comoNumero(v('comprasExentas'));
  const datos = {
    idProveedor: Number(v('idProveedor')) || null,
    fechaCompra: v('fechaCompra'),
    tipoDocumentoProveedor: tipo,
    numeroDocumentoProveedor: v('numeroDocumentoProveedor').replace(/\s+/g, '') || null,
    claseDocumento: impreso ? 1 : 4,
    codigoGeneracionProveedor: pideCodigo ? normalizarCodigo(v('codigoGeneracionProveedor')) : null,
    idCompraRelacionada: nota ? Number(v('idCompraRelacionada')) || null : null,
    periodoIva: conIva(tipo) ? v('periodoIva') : mesDe(v('fechaCompra') || fechaIso()),
    comprasExentas: exentas ?? 0,
    percepcion: conIva(tipo) && form.elements.percepcion.checked,
    ...leerRenta(),
    detalle: [
      // Una nota no lleva productos: aunque haya quedado alguno en la lista, no se manda
      ...(nota ? [] : estado.lineas.map((l) => ({ idProducto: l.producto.idProducto, cantidad: comoNumero(l.cantidad), costoUnitario: comoNumero(l.costo) }))),
      ...estado.gastos.map((g) => ({ clave: g.clave, descripcion: g.descripcion.trim().replace(/\s+/g, ' '), cantidad: 1, costoUnitario: comoNumero(g.monto) })),
    ],
  };
  const errores = {};
  if (!datos.idProveedor) errores.idProveedor = 'Elija el proveedor.';
  if (!datos.fechaCompra) errores.fechaCompra = 'Escriba la fecha del documento.';
  else if (datos.fechaCompra > fechaIso()) errores.fechaCompra = 'No puede ser una fecha futura.';
  if (!datos.numeroDocumentoProveedor && tipo !== 'OTRO') errores.numeroDocumentoProveedor = 'Escriba el número que viene en el documento.';
  if (pideCodigo && !datos.codigoGeneracionProveedor) {
    errores.codigoGeneracionProveedor = v('codigoGeneracionProveedor') ? 'Revise el código: son 32 letras y números (A a F, 0 a 9) con 4 guiones.' : 'Copie el código de generación del documento.';
  }
  if (nota && !datos.idCompraRelacionada) errores.idCompraRelacionada = 'Elija el crédito fiscal que corrige esta nota.';
  if (v('comprasExentas') && !montoValido(exentas)) errores.comprasExentas = 'Escriba un monto de hasta 2 decimales.';
  if (!datos.detalle.length) {
    if (nota) errores.agregarGasto = 'Agregue al menos un concepto.';
    else errores.agregar = 'Agregue al menos un producto o un gasto.';
  }
  for (const d of datos.detalle) {
    if (d.idProducto) {
      if (!cantidadValida(d.cantidad)) errores[`cantidad-${d.idProducto}`] = 'La cantidad es un entero de 1 a 9999.';
      if (!costoValido(d.costoUnitario)) errores[`costo-${d.idProducto}`] = 'Escriba el costo sin IVA (hasta 4 decimales).';
    } else {
      if (!d.descripcion) errores[`descripcion-${d.clave}`] = 'Escriba qué se pagó.';
      if (!montoValido(d.costoUnitario) || !d.costoUnitario) errores[`monto-${d.clave}`] = 'Escriba el monto sin IVA (hasta 2 decimales).';
    }
  }
  datos.detalle = datos.detalle.map(({ clave, ...d }) => d);
  return { datos, errores };
}

async function enviarCompra(evento) {
  evento.preventDefault();
  const form = $('form-compra');
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');
  const { datos, errores } = leerCompra(form);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar-compra');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const compra = await registrarCompra(datos);
    estado.sucio = false;
    estado.lineas = [];
    estado.gastos = [];
    cambiarVista('compras');
    cargarAvisoBajoMinimo().catch(() => {});
    recargarProveedores();
    const subio = compra.detalle.some((d) => d.idProducto) ? ' La existencia ya subió.' : '';
    await mostrarCompra(compra.idCompra, `Compra ${compra.numeroCompra} guardada.${subio}`);
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    const existente = error.detalle?.idCompraExistente;
    errorGeneral.innerHTML = `${icono('alerta')}<div><p>${escapar(error.message)}</p>${existente ? `<button type="button" class="mt-1 cursor-pointer font-semibold underline underline-offset-2" data-accion="ver-compra-existente" data-id="${existente}">Ver esa compra</button>` : ''}</div>`;
    errorGeneral.classList.remove('hidden');
    errorGeneral.scrollIntoView({ block: 'nearest' });
    boton.disabled = false;
    boton.textContent = 'Guardar compra';
  }
}

function eventosRegistrar() {
  const vista = $('vista-registrar');
  vista.addEventListener('input', (e) => {
    const form = $('form-compra');
    const [campoLinea, id] = e.target.name?.split('-') ?? [];
    if (e.target.name === 'agregar') {
      clearTimeout(esperaSugerencias);
      esperaSugerencias = setTimeout(() => buscarSugerencias(e.target.value.trim()).catch(() => {}), 200);
      return;
    }
    estado.sucio = true;
    const nombre = e.target.name;
    if ((campoLinea === 'cantidad' || campoLinea === 'costo') && id) {
      const linea = estado.lineas.find((l) => l.producto.idProducto === Number(id));
      linea[campoLinea] = e.target.value;
      estado.idLineaActual = linea.producto.idProducto;
      actualizarLinea(linea);
    }
    if ((campoLinea === 'descripcion' || campoLinea === 'monto') && id) {
      estado.gastos.find((g) => g.clave === id)[campoLinea] = e.target.value;
    }
    if (['clasificacionRenta', 'tipoCostoGasto', 'tipoOperacionRenta', 'sectorRenta'].includes(nombre)) {
      estado.rentaTocada = true;
      // Al pasar de costo a gasto cambian los tipos que se pueden elegir
      if (nombre === 'clasificacionRenta') form.elements.tipoCostoGasto.innerHTML = opciones(TIPOS_COSTO_GASTO[e.target.value], null);
    }
    if (nombre === 'idCompraRelacionada') rentaDeRelacionada(e.target.value).catch(() => {});
    if (['idProveedor', 'fechaCompra', 'tipoDocumentoProveedor', 'claseImpreso'].includes(nombre)) {
      if (nombre === 'idProveedor' || nombre === 'tipoDocumentoProveedor') estado.rentaRelacionada = null;
      pintarDocumento();
      return;
    }
    pintarResumen();
  });
  vista.addEventListener('focusin', (e) => {
    const li = e.target.closest('[data-linea]');
    if (li && Number(li.dataset.linea) !== estado.idLineaActual) {
      estado.idLineaActual = Number(li.dataset.linea);
      pintarLotes();
    }
  });
  vista.addEventListener('keydown', (e) => {
    if (e.target.name === 'agregar') {
      if (e.key === 'Enter') { e.preventDefault(); agregarDesdeBuscador(e.target); }
      if (e.key === 'Escape') cerrarSugerencias();
      if (e.key === 'ArrowDown') { e.preventDefault(); $('sugerencias').querySelector('button')?.focus(); }
    }
  });
  vista.addEventListener('submit', enviarCompra);
  vista.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!e.target.closest('[data-campo="detalle"]')) cerrarSugerencias();
    switch (boton?.dataset.accion) {
      case 'sugerencia':
        $('f-agregar').value = '';
        cerrarSugerencias();
        agregarLinea(boton.dataset.id);
        break;
      case 'quitar':
        estado.lineas = estado.lineas.filter((l) => l.producto.idProducto !== Number(boton.dataset.id));
        estado.sucio = true;
        pintarLineas();
        $('f-agregar').focus();
        break;
      case 'agregar-gasto':
        agregarGasto();
        break;
      case 'quitar-gasto':
        estado.gastos = estado.gastos.filter((g) => g.clave !== boton.dataset.id);
        estado.sucio = true;
        pintarGastos();
        break;
      case 'cancelar-compra':
        if (!sePuedeSalir()) return;
        estado.lineas = [];
        cambiarVista('compras');
        break;
      case 'ver-compra-existente':
        if (!sePuedeSalir()) return;
        estado.lineas = [];
        cambiarVista('compras');
        mostrarCompra(boton.dataset.id);
        break;
      default:
    }
  });
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  $('vistas').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-vista]');
    if (!boton || boton.dataset.vista === estado.vista || !sePuedeSalir()) return;
    estado.seleccion = null;
    panel.cerrar();
    cambiarVista(boton.dataset.vista);
  });

  let espera;
  $('buscar').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.buscar = e.target.value.trim();
      if (estado.vista === 'compras') cargarCompras();
      else pintarProveedores();
    }, 250);
  });

  $('filtros').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-filtro]');
    if (!boton) return;
    estado.filtro = boton.dataset.filtro;
    for (const b of $('filtros').querySelectorAll('[data-filtro]')) b.setAttribute('aria-pressed', String(b === boton));
    cargarCompras();
  });

  $('filtros-proveedor').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-filtro]');
    if (!boton) return;
    estado.filtroProveedores = boton.dataset.filtro;
    for (const b of $('filtros-proveedor').querySelectorAll('[data-filtro]')) b.setAttribute('aria-pressed', String(b === boton));
    pintarProveedores();
  });

  $('filtro-proveedor').addEventListener('change', (e) => {
    estado.idProveedorFiltro = e.target.value;
    cargarCompras();
  });

  $('cargar-mas').addEventListener('click', () => cargarCompras({ mas: true }));

  $('lista-compras').addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila || !sePuedeSalir()) return;
    panel.abrir(fila);
    mostrarCompra(fila.dataset.id);
  });

  $('lista-proveedores').addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila || !sePuedeSalir()) return;
    panel.abrir(fila);
    mostrarProveedor(fila.dataset.id);
  });

  $('btn-nuevo-proveedor').addEventListener('click', (e) => {
    if (!sePuedeSalir()) return;
    estado.seleccion = null;
    marcarSeleccionado();
    panel.abrir(e.currentTarget);
    mostrarFormularioProveedor();
  });

  $('btn-registrar').addEventListener('click', () => abrirRegistrar());

  $('aviso-bajo').addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="armar"]')) abrirRegistrar({ idProductos: estado.bajoMinimo });
  });

  panelEl.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    switch (boton?.dataset.accion) {
      case 'cerrar': panel.cerrar(); break;
      case 'editar-proveedor': mostrarFormularioProveedor(panelEl.proveedor); break;
      case 'comprarle': abrirRegistrar({ idProveedor: panelEl.proveedor.idProveedor }); break;
      case 'activo': cambiarActivo(panelEl.proveedor); break;
      case 'ver-compra':
        cambiarVista('compras');
        mostrarCompra(boton.dataset.id);
        break;
      case 'ver-proveedor':
        if (sePuedeSalir()) mostrarProveedor(boton.dataset.id);
        break;
      case 'cancelar':
        if (!sePuedeSalir()) return;
        if (estado.seleccion?.tipo === 'proveedor') mostrarProveedor(estado.seleccion.id);
        else panel.cerrar();
        break;
      default:
    }
  });

  // Una compra a medio escribir no se pierde por cerrar la pestaña sin querer
  window.addEventListener('beforeunload', (e) => { if (estado.sucio) e.preventDefault(); });

  eventosRegistrar();

  const params = new URLSearchParams(location.search);
  const inicio = cargarProveedores().catch(() => {});
  cargarAvisoBajoMinimo().catch(() => {});
  if (params.has('registrar')) {
    // El aviso de "bajo el mínimo" trae el IVA; si no ha llegado, se usa 13 hasta que llegue
    inicio.then(() => abrirRegistrar({ idProveedor: params.get('idProveedor'), idProductos: params.getAll('idProducto') }));
  } else if (params.get('vista') === 'proveedores') {
    inicio.then(() => cambiarVista('proveedores'));
  } else {
    cambiarVista('compras');
  }
}
