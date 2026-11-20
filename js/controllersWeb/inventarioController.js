/**
 * inventarioController.js — Ligia Manzano Salón
 * Pantalla Inventario: productos de venta (con filtros y búsqueda en la API), detalle con lotes PEPS
 * y últimos movimientos, ajuste de existencia y formulario de producto (nuevo / editar), todo en el panel.
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, numero, fechaCorta, fechaLarga } from '../utils/formato.js';
import { sinIva } from '../utils/calculos.js';
import { salidaPeps } from '../utils/peps.js';
import { campo, entrada, mostrarErrores } from '../utils/formulario.js';
import { crearPanel, htmlCabecera, htmlError, htmlExito } from '../utils/panel.js';
import { listarUnidadesMedida } from '../services/catalogosService.js';
import {
  listarProductos, obtenerProducto, guardarProducto, ajustarExistencia, listarCategorias, listarMarcas, crearMarca,
} from '../services/inventarioService.js';

const sesion = montarLayout({ accion: { id: 'btn-nuevo', texto: 'Nuevo producto', icono: 'mas' } });

const $ = (id) => document.getElementById(id);
const lista = $('lista');
const panelEl = $('panel');
const SIN_CAMBIOS = 'Hay cambios sin guardar. ¿Salir sin guardar?';

const estado = {
  filtro: 'todos',
  buscar: '',
  idCategoria: '',
  pagina: 0,
  peticion: 0,
  categorias: [],
  marcas: [],
  unidades: [],
  parametros: { comisionProducto: 2, ivaPct: 13 },
  idSeleccionado: null,
  formularioSucio: false,
};

const panel = crearPanel({
  panel: panelEl,
  fondo: $('fondo-panel'),
  vacio: `${icono('inventario', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}<p>Elige un producto para ver sus lotes y movimientos.</p>`,
  alCerrar: () => {
    if (estado.formularioSucio && !confirm(SIN_CAMBIOS)) return false;
    estado.formularioSucio = false;
    estado.idSeleccionado = null;
    marcarSeleccionado();
    return true;
  },
});

/** Insignia de existencia: inactivo, agotado o bajo el mínimo (nada si está bien). */
function insignia({ existencia, stockMinimo, activo }) {
  if (!activo) return '<span class="insignia insignia-apagada">Inactivo</span>';
  if (existencia === 0) return '<span class="insignia insignia-error">Agotado</span>';
  if (existencia < stockMinimo) return '<span class="insignia insignia-aviso">Bajo el mínimo</span>';
  return '';
}

const TIPO_MOVIMIENTO = {
  ENTRADA_COMPRA: 'Compra', ENTRADA_AJUSTE: 'Ajuste de entrada', SALIDA_VENTA: 'Venta', SALIDA_AJUSTE: 'Ajuste',
  USO_SALON: 'Uso en el salón', DEVOLUCION_ANULACION: 'Devolución por anulación', DEVOLUCION_NC: 'Devolución con nota de crédito',
  DEVOLUCION_FACTURA: 'Devolución de factura',
};

// --- Lista -------------------------------------------------------------------

function htmlFila(r) {
  const actual = r.idProducto === estado.idSeleccionado;
  return `<button type="button" data-id="${r.idProducto}" ${actual ? 'aria-current="true"' : ''}
    class="fila-p min-h-14 w-full cursor-pointer border-b border-neutro-100 py-2 text-left text-15 tabular-nums hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)] ${r.activo ? '' : 'text-texto-secundario'}">
    <span class="min-w-0"><b class="block truncate font-semibold">${escapar(r.nombreProducto)}</b><small class="text-13 text-texto-secundario">${escapar(r.nombreCategoria)}</small></span>
    <span class="flex flex-col items-start gap-0.5"><span><b class="font-semibold">${numero(r.existencia)}</b> <small class="text-13 text-texto-secundario">mín. ${r.stockMinimo}</small></span>${insignia(r)}</span>
    <span class="text-right text-texto-secundario max-md:hidden">${r.costoPeps === null ? '—' : dinero(r.costoPeps)}</span>
    <span class="text-right max-sm:hidden">${dinero(r.precioVenta)}</span>
    <span class="text-right max-md:hidden">${dinero(r.valorCosto)}</span>
  </button>`;
}

function marcarSeleccionado() {
  for (const fila of lista.querySelectorAll('[data-id]')) {
    if (Number(fila.dataset.id) === estado.idSeleccionado) fila.setAttribute('aria-current', 'true');
    else fila.removeAttribute('aria-current');
  }
}

async function cargarLista({ mas = false } = {}) {
  estado.pagina = mas ? estado.pagina + 1 : 0;
  const idPeticion = ++estado.peticion;
  const estadoLista = $('lista-estado');
  lista.setAttribute('aria-busy', 'true');
  try {
    const respuesta = await listarProductos({
      buscar: estado.buscar, filtro: estado.filtro, idCategoria: estado.idCategoria, pagina: estado.pagina,
    });
    if (idPeticion !== estado.peticion) return; // llegó una respuesta más nueva
    const { contenido, totalElementos, conteos, valorTotal, comisionProducto, ivaPct } = respuesta;
    estado.parametros = { comisionProducto, ivaPct };

    const filas = contenido.map(htmlFila).join('');
    if (mas) lista.insertAdjacentHTML('beforeend', filas);
    else lista.innerHTML = filas;

    for (const boton of $('filtros').querySelectorAll('[data-filtro]')) {
      boton.querySelector('span').textContent = numero(conteos[boton.dataset.filtro]);
      boton.classList.toggle('hidden', boton.dataset.filtro === 'inactivos' && !conteos.inactivos && estado.filtro !== 'inactivos');
    }
    $('resumen').textContent = `${numero(conteos.todos)} ${conteos.todos === 1 ? 'producto' : 'productos'} · ${dinero(valorTotal)} al costo`;

    const vacia = lista.children.length === 0;
    estadoLista.classList.toggle('hidden', !vacia);
    estadoLista.textContent = estado.buscar ? `Ningún producto coincide con “${estado.buscar}”.` : 'No hay productos en este filtro.';
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

/** Categorías, marcas y unidades: las usan el filtro y el formulario. */
async function cargarOpciones() {
  const [categorias, marcas, unidades] = await Promise.all([listarCategorias(), listarMarcas(), listarUnidadesMedida()]);
  Object.assign(estado, { categorias, marcas, unidades });
  $('categoria').insertAdjacentHTML('beforeend', categorias.map((c) => `<option value="${c.idCategoria}">${escapar(c.nombreCategoria)}</option>`).join(''));
}

// --- Detalle -----------------------------------------------------------------

function htmlLotes(p) {
  if (!p.lotes.length) {
    return `<p class="text-texto-secundario">${p.ultimoCosto === null ? 'Todavía no se ha comprado. La existencia y el costo llegan con la primera compra.' : 'Sin existencia. El próximo lote llega con la siguiente compra.'}</p>`;
  }
  return `<ul>${p.lotes.map((l, i) => `
    <li class="grid grid-cols-[1fr_auto] gap-x-3 border-b border-neutro-100 py-2 last:border-0">
      <b class="font-semibold">${fechaLarga(l.fechaIngreso)}${i === 0 ? ' <span class="insignia insignia-ok ml-1 align-middle">Sale primero</span>' : ''}</b>
      <b class="text-right font-semibold tabular-nums">${dinero(l.costoUnitario)}</b>
      <small class="text-13 text-texto-secundario">${l.numeroCompra ? `Compra ${escapar(l.numeroCompra)}` : 'Ajuste de entrada'} · quedan ${l.cantidadDisponible} de ${l.cantidadInicial}</small>
      <small class="text-right text-13 text-texto-secundario">costo c/u</small>
    </li>`).join('')}</ul>`;
}

function htmlMovimientos(movimientos) {
  if (!movimientos.length) return '<p class="text-texto-secundario">Sin movimientos todavía.</p>';
  return `<ul>${movimientos.map((m) => `
    <li class="grid grid-cols-[64px_1fr_auto] gap-3 border-b border-neutro-100 py-1.5 last:border-0">
      <span class="text-texto-secundario">${fechaCorta(m.fechaHora)}</span>
      <span class="min-w-0">${escapar([TIPO_MOVIMIENTO[m.tipo] ?? m.tipo, m.referencia, m.motivo].filter(Boolean).join(' · '))}</span>
      <b class="text-right font-semibold tabular-nums ${m.cantidad > 0 ? 'text-estado-exito' : ''}">${m.cantidad > 0 ? '+' : '−'}${Math.abs(m.cantidad)}</b>
    </li>`).join('')}</ul>`;
}

/** "Al ritmo de venta actual, alcanza para unos N días." */
function htmlAlcanza(p) {
  if (!p.activo) return '';
  if (p.existencia === 0) return '<p class="mx-6 mt-3 text-sm text-estado-error">Agotado: no se puede vender hasta la próxima compra.</p>';
  if (!p.vendidos30d) return '';
  const dias = Math.floor(p.existencia / (p.vendidos30d / 30));
  return `<p class="mx-6 mt-3 text-sm">Al ritmo de venta actual, <b class="font-semibold">alcanza para ${dias < 1 ? 'menos de un día' : `unos ${dias} ${dias === 1 ? 'día' : 'días'}`}</b>.</p>`;
}

async function mostrarDetalle(idProducto, aviso = '') {
  estado.idSeleccionado = Number(idProducto);
  estado.formularioSucio = false;
  marcarSeleccionado();
  panel.abrir();
  panelEl.setAttribute('aria-label', 'Detalle del producto');
  panelEl.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando…</p>';

  let p;
  try {
    p = await obtenerProducto(idProducto);
  } catch (error) {
    panelEl.innerHTML = `${htmlCabecera('Inventario', '')}${htmlError(error.message)}`;
    return;
  }
  if (estado.idSeleccionado !== p.idProducto) return; // se eligió otro mientras cargaba

  const marca = insignia(p);
  panelEl.innerHTML = `
    ${htmlCabecera(p.nombreProducto, `${escapar(p.nombreCategoria)} · ${escapar(p.nombreMarca)} · Código ${escapar(p.codigo)}`, { antes: marca ? `<div class="mb-2">${marca}</div>` : '' })}
    ${aviso ? htmlExito(aviso) : ''}
    <div class="mx-6 grid grid-cols-3 divide-x divide-borde-default rounded-medio border border-borde-default text-center tabular-nums">
      <div class="p-3"><span class="block text-13 text-texto-secundario">Existencia</span><b class="block text-lg font-semibold">${numero(p.existencia)}</b><small class="text-13 text-texto-secundario">mínimo ${p.stockMinimo}</small></div>
      <div class="p-3"><span class="block text-13 text-texto-secundario">Precio</span><b class="block text-lg font-semibold">${dinero(p.precioVenta)}</b><small class="text-13 text-texto-secundario">con IVA</small></div>
      <div class="p-3"><span class="block text-13 text-texto-secundario">Vendidos</span><b class="block text-lg font-semibold">${numero(p.vendidos30d)}</b><small class="text-13 text-texto-secundario">últimos 30 días</small></div>
    </div>
    ${htmlAlcanza(p)}
    ${p.descripcion ? `<p class="mx-6 mt-3 text-sm text-texto-secundario">${escapar(p.descripcion)}</p>` : ''}
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Lotes <span class="font-normal">sale primero el más antiguo</span></h3>
      ${htmlLotes(p)}
    </div>
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Últimos movimientos</h3>
      ${htmlMovimientos(p.ultimosMovimientos)}
    </div>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      ${p.activo
        ? `<a class="btn btn-primario" href="compras.html?registrar&idProducto=${p.idProducto}">Registrar compra</a>`
        : '<button type="button" class="btn btn-primario" disabled title="Actívalo para comprarlo">Registrar compra</button>'}
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secundario" data-accion="ajustar">Ajustar existencia</button>
        <button type="button" class="btn btn-secundario" data-accion="editar">Editar producto</button>
      </div>
      <button type="button" class="btn btn-secundario" disabled title="Disponible más adelante (Reportes)">Ver kardex completo</button>
    </div>`;
  panelEl.producto = p;
  panel.enfocarTitulo(Boolean(aviso));
}

// --- Ajustar existencia ------------------------------------------------------

const TIPOS_AJUSTE = [
  { valor: 'DANADO', titulo: 'Producto dañado o vencido', texto: 'Se resta de la existencia', ejemplo: 'Ej.: frasco roto al acomodar el estante' },
  { valor: 'CONTEO', titulo: 'Conteo físico', texto: 'Escribes cuántos hay en el estante', ejemplo: 'Ej.: conteo de fin de mes' },
  { valor: 'USO_SALON', titulo: 'Uso en el salón', texto: 'Se usó en un servicio, no se vendió', ejemplo: 'Ej.: se usó en un tratamiento' },
];

function mostrarAjuste(p) {
  estado.formularioSucio = false;
  panelEl.setAttribute('aria-label', 'Ajustar existencia');
  const inicial = p.existencia === 0 ? 'CONTEO' : 'DANADO'; // sin existencia solo se puede contar

  panelEl.innerHTML = `
    ${htmlCabecera('Ajustar existencia', `${escapar(p.nombreProducto)} · hay ${numero(p.existencia)}`)}
    <form id="form-ajuste" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-4 px-6">
        <fieldset data-campo="tipo">
          <legend class="campo-etiqueta">Qué pasó</legend>
          <div class="flex flex-col gap-2">
            ${TIPOS_AJUSTE.map((t) => {
              const sinExistencia = p.existencia === 0 && t.valor !== 'CONTEO';
              return `<label class="opcion ${sinExistencia ? 'cursor-not-allowed opacity-50' : ''}"><input type="radio" name="tipo" value="${t.valor}" ${t.valor === inicial ? 'checked' : ''} ${sinExistencia ? 'disabled' : ''}><span><b>${t.titulo}</b><small>${t.texto}</small></span></label>`;
            }).join('')}
          </div>
        </fieldset>
        <div data-campo="cantidad">
          <label class="campo-etiqueta" for="f-cantidad" id="etiqueta-cantidad"></label>
          <div class="campo-caja w-40"><input id="f-cantidad" name="cantidad" type="number" inputmode="numeric" min="0" step="1" class="tabular-nums" aria-describedby="ayuda-cantidad"></div>
          <p class="campo-ayuda" id="ayuda-cantidad"></p>
          <p class="campo-error hidden" id="error-cantidad"></p>
        </div>
        ${campo({ nombre: 'motivo', columna: 'motivo', etiqueta: 'Detalle', obligatorio: true, control: '<textarea id="f-motivo" name="motivo" maxlength="150" rows="2"></textarea>' })}
      </div>
      <div class="separa"></div>
      <div id="vista-ajuste" class="mx-6 rounded-medio bg-fondo-sutil p-4 text-sm tabular-nums" aria-live="polite"></div>
      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar ajuste</button>
        </div>
        <p class="text-center text-13 text-texto-secundario">Queda en la bitácora con tu nombre y la hora.</p>
      </div>
    </form>`;

  const form = $('form-ajuste');
  const pintar = () => {
    const tipo = form.elements.tipo.value;
    const t = TIPOS_AJUSTE.find((x) => x.valor === tipo);
    const conteo = tipo === 'CONTEO';
    $('etiqueta-cantidad').innerHTML = `${conteo ? 'Cuántos hay en el estante' : 'Cantidad'} <span class="text-estado-error" aria-hidden="true">*</span>`;
    $('ayuda-cantidad').textContent = conteo ? `El sistema dice que hay ${p.existencia}.` : `de ${p.existencia} disponibles`;
    form.elements.motivo.placeholder = t.ejemplo;
    $('vista-ajuste').innerHTML = htmlVistaAjuste(p, tipo, form.elements.cantidad.value);
  };
  form.addEventListener('input', () => { estado.formularioSucio = true; pintar(); });
  form.addEventListener('change', pintar);
  form.addEventListener('submit', (e) => enviarAjuste(e, p));
  pintar();
  panel.enfocarTitulo();
  form.elements.cantidad.focus();
}

/** Cómo queda: de qué lote sale (PEPS), cuánto cuesta y la existencia después. */
function htmlVistaAjuste(p, tipo, valor) {
  const n = Number(valor);
  if (valor === '' || !Number.isInteger(n) || n < 0) return '<p class="text-texto-secundario">Escriba la cantidad para ver cómo queda.</p>';
  const fila = (etiqueta, dato) => `<dt class="text-texto-secundario">${etiqueta}</dt><dd class="text-right font-semibold">${dato}</dd>`;
  const sale = tipo === 'CONTEO' ? p.existencia - n : n;

  if (tipo !== 'CONTEO' && n === 0) return '<p class="text-texto-secundario">Escriba cuántos.</p>';
  if (sale === 0) return '<p class="text-texto-secundario">Es igual a la existencia: no hay nada que ajustar.</p>';
  if (sale < 0) {
    return p.ultimoCosto === null
      ? '<p class="text-estado-error">Este producto nunca se ha comprado: registre una compra para que tenga costo.</p>'
      : `<p class="mb-2">Hay ${-sale} de más: entran como un lote nuevo al costo de la última compra.</p>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">${fila('Costo c/u', dinero(p.ultimoCosto))}${fila('Existencia después', numero(n))}</dl>`;
  }
  if (sale > p.existencia) return `<p class="text-estado-error">Solo hay ${p.existencia}.</p>`;

  const { partes, costo } = salidaPeps(p.lotes, sale);
  return `<p class="mb-2">Sale del lote más antiguo (PEPS).</p>
    <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
      ${fila(partes.length === 1 ? 'Lote' : 'Lotes', partes.map((x) => `${fechaLarga(x.fechaIngreso)}${partes.length > 1 ? ` (${x.cantidad})` : ''}`).join('<br>'))}
      ${fila(tipo === 'USO_SALON' ? 'Costo del uso' : 'Costo de la pérdida', dinero(costo))}
      ${fila('Existencia después', numero(p.existencia - sale))}
    </dl>`;
}

async function enviarAjuste(evento, p) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');

  const tipo = form.elements.tipo.value;
  const texto = form.elements.cantidad.value;
  const cantidad = Number(texto);
  const motivo = form.elements.motivo.value.trim().replace(/\s+/g, ' ');
  const errores = {};
  if (texto === '' || !Number.isInteger(cantidad) || cantidad < 0) errores.cantidad = 'Escriba un número entero.';
  else if (tipo === 'CONTEO' && cantidad === p.existencia) errores.cantidad = 'Es igual a la existencia: no hay nada que ajustar.';
  else if (tipo === 'CONTEO' && cantidad > p.existencia && p.ultimoCosto === null) errores.cantidad = 'Sin compras, no hay costo para la entrada.';
  else if (tipo !== 'CONTEO' && cantidad === 0) errores.cantidad = 'Escriba cuántos.';
  else if (tipo !== 'CONTEO' && cantidad > p.existencia) errores.cantidad = `Solo hay ${p.existencia}.`;
  if (!motivo) errores.motivo = 'Escriba qué pasó; queda en el kardex.';
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const actualizado = await ajustarExistencia(p.idProducto, { tipo, cantidad, motivo });
    estado.formularioSucio = false;
    cargarLista();
    await mostrarDetalle(p.idProducto, `Ajuste guardado. Ahora hay ${numero(actualizado.existencia)}.`);
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar ajuste';
  }
}

// --- Formulario de producto --------------------------------------------------

const opciones = (items, clave, texto, elegido) => items
  .map((x) => `<option value="${x[clave]}" ${x[clave] === elegido ? 'selected' : ''}>${escapar(x[texto])}</option>`).join('');

const ayudaPrecio = (precio) => `Con IVA. Sin IVA: ${dinero(sinIva(Number(precio) || 0, estado.parametros.ivaPct))}`;
const ayudaMinimo = (n) => (Number(n) > 0 ? `Avisa cuando queden menos de ${Number(n)}.` : 'Con 0 nunca avisa.');

function mostrarFormulario(producto = null) {
  estado.formularioSucio = false;
  panel.abrir();
  const editando = Boolean(producto);
  const p = producto ?? { comisionFija: estado.parametros.comisionProducto, stockMinimo: 0, activo: true, codUnidadMedida: estado.unidades.find((u) => u.codUnidadMedida === 59)?.codUnidadMedida };
  panelEl.setAttribute('aria-label', editando ? 'Editar producto' : 'Nuevo producto');

  panelEl.innerHTML = `
    ${htmlCabecera(editando ? `Editar ${p.nombreProducto}` : 'Nuevo producto', 'Los campos con * son obligatorios')}
    <form id="form-producto" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-4 px-6">
        ${campo({ nombre: 'nombreProducto', columna: 'nombre_producto', etiqueta: 'Nombre', obligatorio: true, ayuda: 'Incluye el tamaño, así se distingue en el punto de venta.', control: entrada('nombreProducto', p.nombreProducto, 'maxlength="100" autocomplete="off" placeholder="Ej.: Shampoo matizador 400 ml" aria-describedby="ayuda-nombreProducto"') })}
        ${campo({ nombre: 'codigo', columna: 'codigo', etiqueta: 'Código de barras', obligatorio: true, ayuda: 'Escanéalo con el lector o escríbelo.', control: entrada('codigo', p.codigo, 'maxlength="25" autocomplete="off" spellcheck="false" class="font-mono" aria-describedby="ayuda-codigo"') })}
        ${campo({ nombre: 'descripcion', columna: 'descripcion', etiqueta: 'Descripción', control: `<textarea id="f-descripcion" name="descripcion" maxlength="300" rows="2">${escapar(p.descripcion ?? '')}</textarea>` })}

        <div data-campo="id_marca">
          <label class="campo-etiqueta" for="f-idMarca">Marca <span class="text-estado-error" aria-hidden="true">*</span></label>
          <div class="campo-caja"><select id="f-idMarca" name="idMarca"><option value="">Elegir…</option>${opciones(estado.marcas, 'idMarca', 'nombreMarca', p.idMarca)}</select></div>
          <p class="campo-error hidden" id="error-idMarca"></p>
          <button type="button" class="mt-1 cursor-pointer text-sm font-semibold underline underline-offset-2" data-accion="marca-nueva">+ Agregar una marca que no está</button>
          <div id="caja-marca" class="mt-2 hidden">
            <div class="flex gap-2">
              <div class="campo-caja flex-1"><input id="f-nombreMarca" name="nombreMarca" maxlength="60" autocomplete="off" aria-label="Nombre de la marca nueva" placeholder="Nombre de la marca"></div>
              <button type="button" class="btn btn-secundario" data-accion="agregar-marca">Agregar</button>
            </div>
            <p class="campo-error hidden" id="error-nombreMarca"></p>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          ${campo({ nombre: 'idCategoria', columna: 'id_categoria', etiqueta: 'Categoría', obligatorio: true, control: `<select id="f-idCategoria" name="idCategoria"><option value="">Elegir…</option>${opciones(estado.categorias, 'idCategoria', 'nombreCategoria', p.idCategoria)}</select>` })}
          ${campo({ nombre: 'codUnidadMedida', columna: 'cod_unidad_medida', etiqueta: 'Unidad de medida', obligatorio: true, ayuda: 'Cómo se cuenta en el inventario.', control: `<select id="f-codUnidadMedida" name="codUnidadMedida" aria-describedby="ayuda-codUnidadMedida"><option value="">Elegir…</option>${opciones(estado.unidades, 'codUnidadMedida', 'nombre', p.codUnidadMedida)}</select>` })}
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          ${campo({ nombre: 'precioVenta', columna: 'precio_venta', etiqueta: 'Precio de venta', obligatorio: true, ayuda: ayudaPrecio(p.precioVenta), control: `<span class="text-texto-secundario">$</span>${entrada('precioVenta', p.precioVenta, 'type="number" inputmode="decimal" min="0" max="9999.99" step="0.01" class="tabular-nums" aria-describedby="ayuda-precioVenta"')}` })}
          ${campo({ nombre: 'comisionFija', columna: 'comision_fija', etiqueta: 'Comisión por venta', obligatorio: true, ayuda: 'Para quien lo venda.', control: `<span class="text-texto-secundario">$</span>${entrada('comisionFija', p.comisionFija, 'type="number" inputmode="decimal" min="0" step="0.01" class="tabular-nums" aria-describedby="ayuda-comisionFija"')}` })}
        </div>
        ${campo({ nombre: 'stockMinimo', columna: 'stock_minimo', etiqueta: 'Existencia mínima', obligatorio: true, ayuda: ayudaMinimo(p.stockMinimo), control: entrada('stockMinimo', p.stockMinimo, 'type="number" inputmode="numeric" min="0" step="1" class="tabular-nums" aria-describedby="ayuda-stockMinimo"') })}

        <label class="flex items-start gap-2 text-sm" data-campo="activo">
          <input type="checkbox" name="activo" class="mt-0.5 size-4 accent-neutro-900" ${p.activo ? 'checked' : ''}>
          <span><b class="block font-semibold">Disponible para vender</b><span class="text-13 text-texto-secundario">Si lo apagas, deja de salir en el punto de venta. No se borra.</span></span>
        </label>

        ${editando ? '' : `<div class="aviso aviso-info">${icono('info')}<p><b class="font-semibold">Empieza en 0.</b> La existencia y el costo llegan con la primera compra: cada compra crea un lote (PEPS).</p></div>`}
      </div>

      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar producto</button>
        </div>
        ${editando ? '<p class="text-center text-13 text-texto-secundario">Cambiar el precio no toca ventas pasadas. Los cambios quedan en la bitácora.</p>' : ''}
      </div>
    </form>`;

  const form = $('form-producto');
  form.addEventListener('input', (e) => {
    if (e.target.name === 'nombreMarca') return; // la marca nueva se guarda aparte
    estado.formularioSucio = true;
    if (e.target.name === 'precioVenta') $('ayuda-precioVenta').textContent = ayudaPrecio(e.target.value);
    if (e.target.name === 'stockMinimo') $('ayuda-stockMinimo').textContent = ayudaMinimo(e.target.value);
  });
  // Enter en "marca nueva" agrega la marca en vez de enviar el formulario
  form.elements.nombreMarca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregarMarca(form); }
  });
  form.addEventListener('submit', (e) => enviarProducto(e, producto));
  panel.enfocarTitulo();
  form.elements.nombreProducto.focus();
}

async function agregarMarca(form) {
  const nombreMarca = form.elements.nombreMarca.value.trim().replace(/\s+/g, ' ');
  const error = $('error-nombreMarca');
  const mostrar = (mensaje) => {
    error.textContent = mensaje;
    error.classList.toggle('hidden', !mensaje);
    form.elements.nombreMarca.toggleAttribute('aria-invalid', Boolean(mensaje));
  };
  if (!nombreMarca) { mostrar('Escriba el nombre de la marca.'); return; }
  try {
    const nueva = await crearMarca(nombreMarca);
    estado.marcas = [...estado.marcas, nueva].sort((a, b) => a.nombreMarca.localeCompare(b.nombreMarca, 'es'));
    const select = form.elements.idMarca;
    select.innerHTML = `<option value="">Elegir…</option>${opciones(estado.marcas, 'idMarca', 'nombreMarca', nueva.idMarca)}`;
    form.elements.nombreMarca.value = '';
    mostrar('');
    $('caja-marca').classList.add('hidden');
    estado.formularioSucio = true;
    select.focus();
  } catch (e) {
    mostrar(e.detalle?.campos?.nombreMarca ?? e.message);
  }
}

/** Lee el formulario y lo valida. Devuelve { datos, errores }. */
function leerProducto(form) {
  const v = (nombre) => form.elements[nombre].value.trim();
  const numeroONulo = (nombre) => (v(nombre) === '' ? null : Number(v(nombre)));
  const datos = {
    nombreProducto: v('nombreProducto').replace(/\s+/g, ' '),
    codigo: v('codigo').replace(/\s+/g, ''),
    descripcion: v('descripcion') || null,
    idMarca: Number(v('idMarca')) || null,
    idCategoria: Number(v('idCategoria')) || null,
    codUnidadMedida: Number(v('codUnidadMedida')) || null,
    precioVenta: numeroONulo('precioVenta'),
    comisionFija: numeroONulo('comisionFija'),
    stockMinimo: numeroONulo('stockMinimo'),
    activo: form.elements.activo.checked,
  };
  const dosDecimales = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  const errores = {};
  if (!datos.nombreProducto) errores.nombreProducto = 'Escriba el nombre del producto.';
  if (!datos.codigo) errores.codigo = 'Escriba o escanee el código.';
  else if (!/^[A-Za-z0-9-]+$/.test(datos.codigo)) errores.codigo = 'Solo letras, números y guiones.';
  if (!datos.idMarca) errores.idMarca = 'Elija la marca.';
  if (!datos.idCategoria) errores.idCategoria = 'Elija la categoría.';
  if (!datos.codUnidadMedida) errores.codUnidadMedida = 'Elija la unidad.';
  if (datos.precioVenta === null) errores.precioVenta = 'Escriba el precio.';
  else if (!(datos.precioVenta >= 0) || datos.precioVenta > 9999.99) errores.precioVenta = 'Revise el precio.';
  else if (!dosDecimales(datos.precioVenta)) errores.precioVenta = 'Use como máximo 2 decimales.';
  if (datos.comisionFija === null) errores.comisionFija = 'Escriba la comisión (puede ser 0).';
  else if (!(datos.comisionFija >= 0)) errores.comisionFija = 'No puede ser negativa.';
  else if (!dosDecimales(datos.comisionFija)) errores.comisionFija = 'Use como máximo 2 decimales.';
  else if (datos.precioVenta !== null && datos.comisionFija > sinIva(datos.precioVenta, estado.parametros.ivaPct)) {
    errores.comisionFija = 'No puede ser mayor que el precio sin IVA.';
  }
  if (datos.stockMinimo === null || !Number.isInteger(datos.stockMinimo) || datos.stockMinimo < 0) errores.stockMinimo = 'Escriba un número entero (0 o más).';
  return { datos, errores };
}

async function enviarProducto(evento, producto) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');

  const { datos, errores } = leerProducto(form);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const guardado = await guardarProducto(datos, producto?.idProducto);
    estado.formularioSucio = false;
    cargarLista();
    await mostrarDetalle(guardado.idProducto, producto ? 'Cambios guardados.' : 'Producto guardado. Registre una compra para darle existencia.');
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    // "El código no se repite. Si ya existe, el sistema te lleva a ese producto."
    const existente = error.detalle?.idProductoExistente;
    errorGeneral.innerHTML = `${icono('alerta')}<div><p>${escapar(error.message)}</p>${existente ? `<button type="button" class="mt-1 cursor-pointer font-semibold underline underline-offset-2" data-accion="ver-existente" data-id="${existente}">Ver ese producto</button>` : ''}</div>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar producto';
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  const sePuedeSalir = () => !estado.formularioSucio || confirm(SIN_CAMBIOS);

  let espera;
  $('buscar').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.buscar = e.target.value.trim();
      cargarLista();
    }, 250);
  });

  $('filtros').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-filtro]');
    if (!boton) return;
    estado.filtro = boton.dataset.filtro;
    for (const b of $('filtros').querySelectorAll('[data-filtro]')) b.setAttribute('aria-pressed', String(b === boton));
    cargarLista();
  });

  $('categoria').addEventListener('change', (e) => {
    estado.idCategoria = e.target.value;
    cargarLista();
  });

  $('cargar-mas').addEventListener('click', () => cargarLista({ mas: true }));

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila || !sePuedeSalir()) return;
    panel.abrir(fila);
    mostrarDetalle(fila.dataset.id);
  });

  $('btn-nuevo').addEventListener('click', (e) => {
    if (!sePuedeSalir()) return;
    estado.idSeleccionado = null;
    marcarSeleccionado();
    panel.abrir(e.currentTarget);
    mostrarFormulario();
  });

  panelEl.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    switch (boton?.dataset.accion) {
      case 'cerrar': panel.cerrar(); break;
      case 'ajustar': mostrarAjuste(panelEl.producto); break;
      case 'editar': mostrarFormulario(panelEl.producto); break;
      case 'cancelar':
        if (!sePuedeSalir()) return;
        estado.formularioSucio = false;
        if (estado.idSeleccionado) mostrarDetalle(estado.idSeleccionado);
        else panel.cerrar();
        break;
      case 'marca-nueva':
        $('caja-marca').classList.remove('hidden');
        $('f-nombreMarca').focus();
        break;
      case 'agregar-marca': agregarMarca($('form-producto')); break;
      case 'ver-existente':
        if (!sePuedeSalir()) return;
        mostrarDetalle(boton.dataset.id);
        break;
      default:
    }
  });

  // Si fallan las opciones, la lista igual carga; el formulario pide elegir marca y categoría y no deja guardar.
  cargarOpciones().catch(() => {});
  cargarLista();
  // Desde Compras: inventario.html?idProducto=1 abre ese producto
  const idInicial = new URLSearchParams(location.search).get('idProducto');
  if (idInicial) mostrarDetalle(idInicial);
}
