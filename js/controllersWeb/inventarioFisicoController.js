/**
 * inventarioFisicoController.js — Ligia Manzano Salón
 * Pantalla Inventario físico (art. 142 del Código Tributario: conteo al inicio del negocio y al cierre de cada ejercicio, 31 de diciembre,
 * con acta firmada; art. 81 del Reglamento: confrontar el registro con el conteo). Tres estados:
 *   lista de conteos · borrador (contar, guardar avance y cerrar) · cerrado (comparativo y acta, Excel e impresión).
 * Administrador y contador cuentan y cierran; el auditor solo lee.
 *
 * URL: inventario-fisico.html[?id=2]
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, numero, fechaIso, fechaHora } from '../utils/formato.js';
import { fechaDMY } from '../utils/hojas.js';
import { centavos } from '../utils/calculos.js';
import { crearXlsx, descargar } from '../utils/xlsx.js';
import {
  listarInventariosFisicos, obtenerInventarioFisico, crearInventarioFisico, guardarConteo, cerrarInventarioFisico, agruparActa,
} from '../services/inventarioFisicoService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const puedeEditar = sesion?.usuario.rol !== 'AUDITOR';

/** conteo: la respuesta de GET /{id}; filas: lo que se está escribiendo (idProducto → { cantidadContada, nota }); invalidos: ids con cantidad mal escrita. */
const estado = { conteo: null, filas: new Map(), invalidos: new Set(), cerrando: false };

const aviso = (clase, icon, html) => `<div class="aviso ${clase}" role="${clase === 'aviso-error' ? 'alert' : 'status'}">${icono(icon)}<p>${html}</p></div>`;
const avisoError = (error) => aviso('aviso-error', 'alerta', escapar(error.message));
const signo = (n) => (n > 0 ? `+${numero(n)}` : n < 0 ? `−${numero(-n)}` : '0');
const colorDif = (n) => (n > 0 ? 'text-estado-exito' : n < 0 ? 'text-estado-error' : 'text-texto-secundario');
const dineroDif = (n) => (n > 0 ? `+${dinero(n)}` : n < 0 ? `−${dinero(-n)}` : dinero(0));
const th = (texto, clase = 'text-left') => `<th scope="col" class="px-3 py-2 font-semibold ${clase}">${texto}</th>`;
const td = (contenido, clase = '') => `<td class="px-3 py-2 align-top ${clase}">${contenido}</td>`;
const tabla = (min, cabecera, cuerpo, pie = '') => `<div class="overflow-x-auto"><table class="w-full ${min} text-sm tabular-nums">
  <thead class="bg-fondo-sutil text-13 text-texto-secundario"><tr class="border-b border-borde-default">${cabecera}</tr></thead>
  <tbody>${cuerpo}</tbody>${pie ? `<tfoot>${pie}</tfoot>` : ''}</table></div>`;
const productoCelda = (p) => `<b class="block font-semibold">${escapar(p.nombreProducto)}</b><small class="block text-13 text-texto-secundario">${escapar(p.codigo)} · ${escapar(p.marca)}</small>`;
const insignia = (e) => (e === 'CERRADO' ? '<span class="insignia insignia-ok">Cerrado</span>' : '<span class="insignia insignia-aviso">Borrador</span>');
// Sin Object.groupBy: la computadora del salón puede tener un navegador anterior a 2024
const agrupar = (conteo) => [...conteo.reduce((m, p) => m.set(p.categoria, [...(m.get(p.categoria) ?? []), p]), new Map())];

// --- Lista -------------------------------------------------------------------

/** 31 de diciembre de este año; si todavía no llega (no se permite fecha futura), el del año pasado; si ya existe, hoy. */
function fechaSugerida(lista) {
  const hoy = fechaIso();
  const anio = Number(hoy.slice(0, 4));
  const diciembre = `${anio}-12-31` <= hoy ? `${anio}-12-31` : `${anio - 1}-12-31`;
  return lista.some((c) => c.fechaCorte === diciembre) ? hoy : diciembre;
}

function pintarLista(lista) {
  const filas = lista.map((c) => `<tr class="border-b border-neutro-100">
    ${td(`<a class="font-semibold underline" href="inventario-fisico.html?id=${c.idInventarioFisico}">${escapar(fechaDMY(c.fechaCorte))}</a>`, 'whitespace-nowrap')}
    ${td(insignia(c.estado))}${td(numero(c.productosContados), 'text-right')}${td(c.cerradoEn ? escapar(fechaHora(c.cerradoEn)) : '—', 'whitespace-nowrap')}
  </tr>`).join('');
  const nuevo = puedeEditar ? `<button type="button" id="nuevo" class="btn btn-primario h-9 px-3 text-sm">${icono('mas')}Nuevo conteo</button>` : '';
  $('vista').innerHTML = `
    <div class="flex flex-wrap items-center gap-3"><h2 class="text-xl">Conteos de inventario físico</h2><div class="ml-auto">${nuevo}</div></div>
    <form id="form-nuevo" class="tarjeta hidden flex-col gap-3 rounded-grande p-4" novalidate>
      <label><span class="campo-etiqueta">Fecha de corte</span><span class="campo-caja h-9 min-h-0 w-auto text-sm"><input id="fecha-corte" type="date" max="${fechaIso()}" value="${fechaSugerida(lista)}" class="tabular-nums"></span></label>
      <p class="text-13 text-texto-secundario">Se cuenta lo que hay en el salón ese día. Normalmente es el 31 de diciembre; no puede ser una fecha futura.</p>
      <p id="error-fecha" class="campo-error hidden" role="alert"></p>
      <div class="flex gap-2"><button type="submit" class="btn btn-primario h-9 px-3 text-sm">Crear conteo</button><button type="button" id="cancelar-nuevo" class="btn btn-secundario h-9 px-3 text-sm">Cancelar</button></div>
    </form>
    ${lista.length
    ? `<div class="tarjeta overflow-hidden rounded-grande">${tabla('min-w-[420px]', `${th('Fecha de corte')}${th('Estado')}${th('Productos contados', 'text-right')}${th('Cerrado')}`, filas)}</div>`
    : '<div class="px-4 py-10 text-center text-texto-secundario">Todavía no hay conteos. Crea el primero con «Nuevo conteo».</div>'}
    <p class="px-1 text-13 text-texto-secundario">Inventario físico al inicio del negocio y al cierre de cada ejercicio (art. 142 del Código Tributario). Al cerrarlo, las diferencias pasan al registro de inventarios como ajustes.</p>`;

  if (!puedeEditar) return;
  const form = $('form-nuevo');
  $('nuevo').addEventListener('click', () => { form.classList.replace('hidden', 'flex'); $('fecha-corte').focus(); });
  $('cancelar-nuevo').addEventListener('click', () => form.classList.replace('flex', 'hidden'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('[type="submit"]');
    boton.disabled = true;
    $('error-fecha').classList.add('hidden');
    try {
      const c = await crearInventarioFisico($('fecha-corte').value);
      location.href = `inventario-fisico.html?id=${c.idInventarioFisico}`;
    } catch (error) {
      $('error-fecha').textContent = error.detalle?.campos?.fechaCorte ?? error.message;
      $('error-fecha').classList.remove('hidden');
      boton.disabled = false;
    }
  });
}

// --- Encabezado de un conteo -------------------------------------------------

const encabezado = (c, botones = '') => `
  <div class="flex flex-wrap items-center gap-3">
    <a href="inventario-fisico.html" class="btn btn-secundario size-9 p-0" aria-label="Volver a la lista">${icono('izquierda')}</a>
    <h2 class="text-xl">Inventario físico al ${escapar(fechaDMY(c.fechaCorte))}</h2>${insignia(c.estado)}
    <div class="ml-auto flex flex-wrap gap-2">${botones}</div>
  </div>`;

// --- Borrador ----------------------------------------------------------------

function filaConteo(p) {
  const f = estado.filas.get(p.idProducto);
  const lectura = puedeEditar ? '' : 'disabled';
  return `<tr class="border-b border-neutro-100" data-id="${p.idProducto}" data-sistema="${p.existenciaSistema}" data-texto="${escapar(`${p.nombreProducto} ${p.codigo} ${p.marca}`.toLowerCase())}">
    ${td(productoCelda(p))}${td(escapar(p.unidadMedida))}${td(numero(p.existenciaSistema), 'text-right')}
    ${td(`<label class="campo-caja ml-auto h-9 min-h-0 w-24 text-sm"><span class="sr-only">Cantidad contada de ${escapar(p.nombreProducto)}</span>
      <input data-contada type="number" min="0" step="1" inputmode="numeric" value="${f.cantidadContada ?? ''}" ${lectura} class="w-full text-right"></label>`, 'text-right')}
    ${td('', 'text-right font-semibold whitespace-nowrap')}
    ${td(`<label class="campo-caja h-9 min-h-0 w-full min-w-40 text-sm"><span class="sr-only">Nota de ${escapar(p.nombreProducto)}</span>
      <input data-nota type="text" maxlength="250" value="${escapar(f.nota ?? '')}" placeholder="¿Por qué hay diferencia?" ${lectura} class="w-full"></label>`)}
  </tr>`;
}

/** Diferencia y nota de una fila según lo escrito; la nota solo se ve si hay diferencia. */
function actualizarFila(tr) {
  const id = Number(tr.dataset.id);
  const contada = estado.filas.get(id).cantidadContada;
  const dif = contada === null ? null : contada - Number(tr.dataset.sistema);
  const celda = tr.children[4];
  celda.textContent = dif === null ? '—' : signo(dif);
  celda.className = `px-3 py-2 align-top text-right font-semibold whitespace-nowrap ${dif === null ? 'text-texto-deshabilitado' : colorDif(dif)}`;
  tr.children[5].firstElementChild.classList.toggle('invisible', !dif);
  tr.querySelector('[data-contada]').closest('label').setAttribute('aria-invalid', String(estado.invalidos.has(id)));
}

function actualizarAvance() {
  const total = estado.conteo.conteo.length;
  const contados = [...estado.filas.values()].filter((f) => f.cantidadContada !== null).length;
  $('avance').textContent = `${numero(contados)} de ${numero(total)} productos contados`;
}

function aplicarBusqueda() {
  const q = $('buscar').value.trim().toLowerCase();
  let ninguno = true;
  for (const seccion of $('categorias').children) {
    let visibles = 0;
    for (const tr of seccion.querySelectorAll('tbody tr')) {
      const ver = !q || tr.dataset.texto.includes(q);
      tr.hidden = !ver;
      if (ver) visibles++;
    }
    seccion.hidden = visibles === 0;
    if (visibles) ninguno = false;
  }
  $('sin-resultados').classList.toggle('hidden', !ninguno);
}

function pintarBorrador() {
  const c = estado.conteo;
  const botones = puedeEditar
    ? `<button type="button" id="guardar" class="btn btn-secundario h-9 px-3 text-sm">Guardar avance</button><button type="button" id="cerrar" class="btn btn-primario h-9 px-3 text-sm">Cerrar inventario</button>`
    : '';
  const cabecera = `${th('Producto')}${th('Unidad')}${th('En sistema', 'text-right')}${th('Contado', 'text-right')}${th('Diferencia', 'text-right')}${th('Nota')}`;
  $('vista').innerHTML = `${encabezado(c, botones)}
    ${puedeEditar ? '' : aviso('aviso-info', 'candado', '<b class="block font-semibold">Estás viendo el conteo en modo lectura.</b>Solo la administradora y la contadora lo llenan y lo cierran.')}
    <div class="flex flex-wrap items-center gap-3">
      <label class="campo-caja h-9 min-h-0 w-full max-w-sm text-sm">${icono('buscar')}<span class="sr-only">Buscar producto</span><input id="buscar" type="search" placeholder="Buscar por nombre, código o marca" autocomplete="off"></label>
      <p id="avance" class="text-sm text-texto-secundario tabular-nums"></p><p id="guardado" class="text-sm text-estado-exito" role="status"></p>
    </div>
    <div id="mensaje" class="empty:hidden"></div>
    <div id="categorias" class="flex flex-col gap-4">${agrupar(c.conteo).map(([categoria, productos]) => `<section class="tarjeta overflow-hidden rounded-grande">
      <h3 class="border-b border-borde-default px-4 py-3 font-semibold">${escapar(categoria)}</h3>
      ${tabla('min-w-[760px]', cabecera, productos.map(filaConteo).join(''))}</section>`).join('')}</div>
    <div id="sin-resultados" class="hidden px-4 py-10 text-center text-texto-secundario">Ningún producto coincide con la búsqueda.</div>
    <div id="panel-cierre" class="hidden"></div>
    <p class="px-1 text-13 text-texto-secundario">«En sistema» es la existencia de hoy y se congela al cerrar. Cuenta todos los productos activos; si no hay ninguno, escribe 0.</p>`;
  $('categorias').querySelectorAll('tbody tr').forEach(actualizarFila);
  actualizarAvance();

  $('buscar').addEventListener('input', aplicarBusqueda);
  $('categorias').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    const f = estado.filas.get(id);
    if (e.target.matches('[data-contada]')) {
      const n = e.target.value === '' ? null : Number(e.target.value);
      if (n !== null && !(Number.isInteger(n) && n >= 0)) estado.invalidos.add(id); else estado.invalidos.delete(id);
      f.cantidadContada = n !== null && Number.isInteger(n) && n >= 0 ? n : null;
    } else {
      f.nota = e.target.value;
    }
    $('guardado').textContent = '';
    actualizarFila(tr);
    actualizarAvance();
  });
  if (!puedeEditar) return;
  $('guardar').addEventListener('click', async () => { if (await guardar()) $('guardado').textContent = 'Avance guardado.'; });
  $('cerrar').addEventListener('click', pedirCierre);
}

const mensaje = (html) => { $('mensaje').innerHTML = html; };

/** Guarda lo contado hasta ahora. Devuelve true si salió bien. */
async function guardar() {
  mensaje('');
  if (estado.invalidos.size) { mensaje(aviso('aviso-error', 'alerta', 'Hay cantidades mal escritas (marcadas en rojo): tienen que ser números enteros desde 0.')); return false; }
  const filas = [...estado.filas].filter(([, f]) => f.cantidadContada !== null)
    .map(([idProducto, f]) => ({ idProducto, cantidadContada: f.cantidadContada, nota: f.nota?.trim() || null }));
  $('guardar').disabled = true;
  try {
    await guardarConteo(estado.conteo.idInventarioFisico, filas);
    return true;
  } catch (error) {
    mensaje(avisoError(error));
    return false;
  } finally {
    $('guardar').disabled = false;
  }
}

/** Antes de cerrar: todo contado y guardado; luego el panel de confirmación dentro de la página. */
async function pedirCierre() {
  const faltan = estado.conteo.conteo.filter((p) => estado.filas.get(p.idProducto).cantidadContada === null);
  if (faltan.length) {
    const lista = faltan.slice(0, 5).map((p) => escapar(p.nombreProducto)).join(', ');
    mensaje(aviso('aviso-error', 'alerta', `<b class="block font-semibold">Faltan ${numero(faltan.length)} productos por contar.</b>${lista}${faltan.length > 5 ? '…' : ''}`));
    $('buscar').value = '';
    aplicarBusqueda();
    $('categorias').querySelector(`tr[data-id="${faltan[0].idProducto}"] input`)?.focus();
    return;
  }
  if (!(await guardar())) return;
  const diferencias = estado.conteo.conteo.filter((p) => estado.filas.get(p.idProducto).cantidadContada !== p.existenciaSistema).length;
  $('panel-cierre').innerHTML = `<section class="tarjeta flex flex-col gap-3 rounded-grande border-neutro-900 p-4" aria-labelledby="cierre-titulo">
    <h3 id="cierre-titulo" class="text-lg">¿Cerrar el inventario al ${escapar(fechaDMY(estado.conteo.fechaCorte))}?</h3>
    ${aviso('aviso-aviso', 'advertencia', `${diferencias ? `${diferencias === 1 ? "La <b>1</b> diferencia se registra como ajuste" : `Las <b>${numero(diferencias)}</b> diferencias se registran como ajustes`} en el kardex (PEPS) con fecha ${escapar(fechaDMY(estado.conteo.fechaCorte))}, 23:59:59.` : 'No hay diferencias: no se registra ningún ajuste.'} <b>Un inventario cerrado no se puede cambiar ni deshacer.</b>`)}
    <label><span class="campo-etiqueta">Observaciones <span class="opcional">opcional</span></span><span class="campo-caja"><textarea id="observaciones" maxlength="500" rows="3" placeholder="Quién contó, qué pasó con las diferencias…"></textarea></span></label>
    <div id="error-cierre" class="empty:hidden"></div>
    <div class="flex flex-wrap gap-2"><button type="button" id="confirmar-cierre" class="btn btn-primario h-9 px-3 text-sm">Sí, cerrar inventario</button><button type="button" id="cancelar-cierre" class="btn btn-secundario h-9 px-3 text-sm">Cancelar</button></div>
  </section>`;
  $('panel-cierre').classList.remove('hidden');
  $('observaciones').focus();
  $('cancelar-cierre').addEventListener('click', () => { $('panel-cierre').classList.add('hidden'); $('cerrar').focus(); });
  $('confirmar-cierre').addEventListener('click', async () => {
    $('confirmar-cierre').disabled = true;
    try {
      estado.conteo = await cerrarInventarioFisico(estado.conteo.idInventarioFisico, $('observaciones').value);
      pintar();
    } catch (error) {
      $('error-cierre').innerHTML = avisoError(error);
      $('confirmar-cierre').disabled = false;
    }
  });
}

// --- Cerrado -----------------------------------------------------------------

/** Cuánto vale la diferencia de cada producto (los ajustes que armó el cierre); 0 si no hubo. */
const valorDif = (c, id) => c.ajustes.find((a) => a.idProducto === id)?.valor ?? 0;

function htmlResumen(c, total) {
  const sistema = centavos(c.conteo.reduce((s, p) => s + p.valorSistema, 0));
  const dif = centavos(c.ajustes.reduce((s, a) => s + a.valor, 0));
  const dato = (titulo, valor, clase = '') => `<div class="tarjeta rounded-medio px-4 py-3"><p class="text-13 text-texto-secundario">${titulo}</p><p class="text-xl font-semibold tabular-nums ${clase}">${valor}</p></div>`;
  return `<div class="grid gap-3 @lg:grid-cols-3">${dato('Valor según el sistema (PEPS)', dinero(sistema))}${dato('Valor contado (acta)', dinero(total))}${dato('Diferencia', dineroDif(dif), colorDif(dif))}</div>`;
}

function htmlComparativo(c) {
  const cuerpo = agrupar(c.conteo).map(([categoria, productos]) => `<tr class="bg-fondo-sutil"><th colspan="6" scope="colgroup" class="px-3 py-1.5 text-left text-13 font-semibold text-texto-secundario">${escapar(categoria)}</th></tr>${productos.map((p) => {
    const dif = p.cantidadContada - p.existenciaSistema;
    return `<tr class="border-b border-neutro-100">${td(productoCelda(p))}${td(numero(p.existenciaSistema), 'text-right')}${td(numero(p.cantidadContada), 'text-right')}
      ${td(signo(dif), `text-right font-semibold ${colorDif(dif)}`)}${td(dif ? dineroDif(valorDif(c, p.idProducto)) : '—', `text-right ${colorDif(dif)}`)}${td(escapar(p.nota ?? ''))}</tr>`;
  }).join('')}`).join('');
  return `<article class="tarjeta overflow-hidden rounded-grande"><header class="border-b border-borde-default px-4 py-3"><h3 class="font-semibold">Comparativo: registro de inventarios contra conteo físico</h3>
    <p class="text-13 text-texto-secundario">Art. 81 del Reglamento. Las diferencias se ajustaron en el kardex al ${escapar(fechaDMY(c.fechaCorte))}.</p></header>
    ${tabla('min-w-[720px]', `${th('Producto')}${th('Sistema', 'text-right')}${th('Contado', 'text-right')}${th('Diferencia', 'text-right')}${th('Valor de la diferencia', 'text-right')}${th('Nota')}`, cuerpo)}</article>`;
}

function htmlActa(c, { grupos, total }) {
  const cuerpo = grupos.map((g) => `<tr class="bg-fondo-sutil"><th colspan="6" scope="colgroup" class="px-3 py-1.5 text-left text-13 font-semibold text-texto-secundario">${escapar(g.categoria)}</th></tr>
    ${g.filas.map((f) => `<tr class="border-b border-neutro-100">${td(numero(f.cantidad), 'text-right')}${td(escapar(f.unidadMedida))}
      ${td(`<b class="block font-semibold">${escapar(f.nombreProducto)}</b><small class="block text-13 text-texto-secundario">${escapar(f.nombreMarca)}</small>`)}
      ${td(dinero(f.costoUnitario), 'text-right')}${td(dinero(f.valor), 'text-right')}${td(escapar(f.referenciaCosto))}</tr>`).join('')}
    <tr class="border-b border-borde-default font-semibold"><td colspan="4" class="px-3 py-2 text-right">Subtotal ${escapar(g.categoria)}</td>${td(dinero(g.subtotal), 'text-right')}<td></td></tr>`).join('');
  return `<article class="tarjeta overflow-hidden rounded-grande"><header class="border-b border-borde-default px-4 py-3"><h3 class="font-semibold">Acta de inventario físico al ${escapar(fechaDMY(c.fechaCorte))}</h3>
    <p class="text-13 text-texto-secundario">Lo que quedó en existencia, por lote y a su costo sin IVA.</p></header>
    ${tabla('min-w-[860px]', `${th('Cantidad', 'text-right')}${th('Unidad')}${th('Denominación y marca')}${th('Precio unitario', 'text-right')}${th('Valor total', 'text-right')}${th('Referencia del costo')}`, cuerpo,
    `<tr class="bg-fondo-sutil font-semibold"><td colspan="4" class="px-3 py-2 text-right">Total general</td>${td(dinero(total), 'text-right')}<td></td></tr>`)}</article>`;
}

function pintarCerrado() {
  const c = estado.conteo;
  const acta = agruparActa(c.acta);
  const botones = `<button type="button" id="excel" class="btn btn-secundario h-9 px-3 text-sm">${icono('descargar')}Descargar Excel</button>
    <button type="button" id="imprimir" class="btn btn-secundario h-9 px-3 text-sm">${icono('imprimir')}Imprimir acta</button>`;
  $('vista').innerHTML = `${encabezado(c, botones)}
    <p class="text-sm text-texto-secundario">Cerrado el ${escapar(fechaHora(c.cerradoEn ?? c.fechaCorte))}${c.observaciones ? ` · ${escapar(c.observaciones)}` : ''}</p>
    ${htmlResumen(c, acta.total)}${htmlComparativo(c)}${htmlActa(c, acta)}`;
  $('excel').addEventListener('click', () => descargarExcel(c, acta));
  $('imprimir').addEventListener('click', () => window.open(`inventario-fisico-imprimir.html?id=${c.idInventarioFisico}`, '_blank'));
}

// --- Excel -------------------------------------------------------------------

/** xlsx.js arma una sola hoja: el acta y, debajo de una fila en blanco, el comparativo (mismas 9 columnas), con montos como número. */
function descargarExcel(c, { grupos, total }) {
  const acta = grupos.flatMap((g) => g.filas).map((f) => [f.categoria, f.codigo, f.nombreProducto, f.nombreMarca, f.unidadMedida, f.cantidad, f.costoUnitario, f.valor, f.referenciaCosto]);
  const comparativo = c.conteo.map((p) => {
    const dif = p.cantidadContada - p.existenciaSistema;
    return [p.categoria, p.codigo, p.nombreProducto, p.marca, p.unidadMedida, p.existenciaSistema, p.cantidadContada, dif, dif ? valorDif(c, p.idProducto) : 0];
  });
  const sumaDif = centavos(c.ajustes.reduce((s, a) => s + a.valor, 0));
  const archivo = crearXlsx([
    ['Categoría', 'Código', 'Producto', 'Marca', 'Unidad', 'Cantidad', 'Precio unitario', 'Valor total', 'Referencia del costo'],
    ...acta, ['Total general', '', '', '', '', '', '', total, ''], [],
    ['Comparativo', 'Código', 'Producto', 'Marca', 'Unidad', 'En sistema', 'Contado', 'Diferencia', 'Valor de la diferencia'],
    ...comparativo, ['Total de las diferencias', '', '', '', '', '', '', '', sumaDif],
  ], { hoja: `Inventario físico ${c.fechaCorte}`.slice(0, 31), anchos: [24, 16, 34, 16, 10, 11, 14, 12, 40] });
  descargar(`inventario-fisico-${c.fechaCorte}.xlsx`, archivo);
}

// --- Arranque ----------------------------------------------------------------

function pintar() {
  if (estado.conteo.estado === 'CERRADO') { pintarCerrado(); return; }
  estado.filas = new Map(estado.conteo.conteo.map((p) => [p.idProducto, { cantidadContada: p.cantidadContada, nota: p.nota }]));
  pintarBorrador();
}

async function iniciar() {
  const id = new URLSearchParams(location.search).get('id');
  $('vista').setAttribute('aria-busy', 'true');
  try {
    if (/^\d+$/.test(id ?? '')) { estado.conteo = await obtenerInventarioFisico(id); pintar(); } else pintarLista(await listarInventariosFisicos());
  } catch (error) {
    $('vista').innerHTML = `<div class="mx-auto max-w-md">${avisoError(error)}</div><a href="inventario-fisico.html" class="btn btn-secundario mx-auto">Volver a la lista</a>`;
  } finally {
    $('vista').removeAttribute('aria-busy');
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">El inventario físico es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  iniciar();
}
