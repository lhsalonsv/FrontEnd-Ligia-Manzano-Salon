/**
 * serviciosController.js — Ligia Manzano Salón
 * Pantalla Servicios: catálogo agrupado por especialidad, detalle y formulario (nuevo / editar) en el panel.
 * El catálogo es corto (decenas), así que se pide una vez y se filtra aquí.
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, iniciales, dinero, duracion } from '../utils/formato.js';
import { sinIva, comisionServicio } from '../utils/calculos.js';
import { campo, entrada, mostrarErrores } from '../utils/formulario.js';
import { crearPanel, htmlCabecera, htmlError, htmlExito } from '../utils/panel.js';
import {
  listarServicios, obtenerServicio, guardarServicio, cambiarActivo, listarEspecialidades,
} from '../services/serviciosService.js';

const sesion = montarLayout({ accion: { id: 'btn-nuevo', texto: 'Nuevo servicio', icono: 'mas' } });

const $ = (id) => document.getElementById(id);
const lista = $('lista');
const panelEl = $('panel');

const DURACIONES = [30, 45, 60, 90, 120];
const SIN_CAMBIOS = 'Hay cambios sin guardar. ¿Salir sin guardar?';

const estado = {
  servicios: [],
  especialidades: [],
  parametros: { comisionServicioPct: 10, ivaPct: 13 },
  filtro: 'todos',   // 'todos' | 'inactivos' | idEspecialidad
  buscar: '',
  idSeleccionado: null,
  formularioSucio: false,
};

const panel = crearPanel({
  panel: panelEl,
  fondo: $('fondo-panel'),
  vacio: `${icono('servicios', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}<p>Elige un servicio para ver su detalle.</p>`,
  alCerrar: () => {
    if (estado.formularioSucio && !confirm(SIN_CAMBIOS)) return false;
    estado.formularioSucio = false;
    estado.idSeleccionado = null;
    pintarLista();
    return true;
  },
});

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const especialidad = (id) => estado.especialidades.find((e) => e.idEspecialidad === id);
const comision = (precio) => comisionServicio(precio, estado.parametros.ivaPct, estado.parametros.comisionServicioPct);
const precioTexto = (s) => `${s.precioDesde ? '<span class="text-xs font-medium text-texto-secundario">desde </span>' : ''}${dinero(s.precio)}`;

// --- Catálogo ----------------------------------------------------------------

function pintarFiltros() {
  const activos = estado.servicios.filter((s) => s.activo);
  const inactivos = estado.servicios.length - activos.length;
  const pestañas = [
    ['todos', 'Todos', activos.length],
    ...estado.especialidades.map((e) => [String(e.idEspecialidad), e.nombreEspecialidad, activos.filter((s) => s.idEspecialidad === e.idEspecialidad).length]),
    ...(inactivos ? [['inactivos', 'Inactivos', inactivos]] : []),
  ];
  $('filtros').innerHTML = pestañas.map(([clave, texto, n]) =>
    `<button type="button" class="filtro" data-filtro="${clave}" aria-pressed="${estado.filtro === clave}">${escapar(texto)} <span>${n}</span></button>`).join('');
  $('resumen').textContent = `${activos.length} servicios · comisión ${estado.parametros.comisionServicioPct} % sin IVA`;
}

function htmlFila(s) {
  const quienes = especialidad(s.idEspecialidad)?.empleados ?? [];
  const actual = s.idServicio === estado.idSeleccionado;
  return `<button type="button" data-id="${s.idServicio}" ${actual ? 'aria-current="true"' : ''}
    class="fila-s min-h-12 w-full cursor-pointer border-b border-neutro-100 py-1.5 text-left text-15 tabular-nums hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)] ${s.activo ? '' : 'text-texto-secundario'}">
    <span class="min-w-0"><b class="block truncate font-semibold">${escapar(s.nombreServicio)}</b>${s.activo ? '' : '<small class="text-13">Inactivo</small>'}<small class="block text-13 text-texto-secundario md:hidden">${duracion(s.duracionMin)}</small></span>
    <span class="max-md:hidden">${duracion(s.duracionMin)}</span>
    <span class="text-right">${precioTexto(s)}</span>
    <span class="text-right text-texto-secundario max-md:hidden">${dinero(comision(s.precio))}</span>
    <span class="flex justify-end -space-x-1.5 max-md:hidden" title="${escapar(quienes.map((e) => e.nombreCompleto).join(', '))}">
      ${quienes.slice(0, 4).map((e) => `<span class="ini size-7 border-2 border-fondo-superficie text-[11px]" aria-hidden="true">${escapar(iniciales(e.nombreCompleto))}</span>`).join('')}
      <span class="sr-only">Lo hacen: ${escapar(quienes.map((e) => e.nombreCompleto).join(', ') || 'nadie')}</span>
    </span>
  </button>`;
}

function pintarLista() {
  const texto = sinAcentos(estado.buscar);
  const visibles = estado.servicios.filter((s) => {
    if (texto && !sinAcentos(s.nombreServicio).includes(texto)) return false;
    if (estado.filtro === 'inactivos') return !s.activo;
    if (!s.activo) return false;
    return estado.filtro === 'todos' || s.idEspecialidad === Number(estado.filtro);
  });

  // agrupado por especialidad, en el orden de las especialidades
  lista.innerHTML = estado.especialidades.map((e) => {
    const delGrupo = visibles.filter((s) => s.idEspecialidad === e.idEspecialidad)
      .sort((a, b) => a.nombreServicio.localeCompare(b.nombreServicio, 'es'));
    if (!delGrupo.length) return '';
    return `<section aria-label="${escapar(e.nombreEspecialidad)}">
      <h3 class="border-b border-neutro-100 bg-fondo-sutil px-4 py-1.5 text-13 font-semibold text-texto-secundario">${escapar(e.nombreEspecialidad)}</h3>
      ${delGrupo.map(htmlFila).join('')}
    </section>`;
  }).join('');

  const estadoLista = $('lista-estado');
  estadoLista.classList.toggle('hidden', visibles.length > 0);
  estadoLista.textContent = estado.buscar ? `Ningún servicio coincide con “${estado.buscar}”.` : 'No hay servicios aquí.';
}

async function cargar() {
  try {
    const [{ servicios, comisionServicioPct, ivaPct }, especialidades] = await Promise.all([listarServicios(), listarEspecialidades()]);
    Object.assign(estado, { servicios, especialidades, parametros: { comisionServicioPct, ivaPct } });
    pintarFiltros();
    pintarLista();
  } catch (error) {
    const estadoLista = $('lista-estado');
    estadoLista.classList.remove('hidden');
    estadoLista.innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  }
}

// --- Detalle -----------------------------------------------------------------

function htmlCalculo(precio, precioDesde) {
  const { ivaPct, comisionServicioPct } = estado.parametros;
  return `<dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-6 text-sm tabular-nums">
    <dt class="text-texto-secundario">Precio con IVA</dt><dd class="text-right">${dinero(precio)}</dd>
    <dt class="text-texto-secundario">Precio sin IVA</dt><dd class="text-right">${dinero(sinIva(precio, ivaPct))}</dd>
    <dt class="font-semibold">Comisión ${comisionServicioPct} %</dt><dd class="text-right font-semibold">${dinero(comision(precio))}</dd>
    ${precioDesde ? '<dd class="col-span-2 text-13 text-texto-secundario">Si se cobra más, la comisión sube con el precio cobrado.</dd>' : ''}
  </dl>`;
}

async function mostrarDetalle(idServicio, aviso = '') {
  estado.idSeleccionado = Number(idServicio);
  estado.formularioSucio = false;
  pintarLista();
  panel.abrir();
  panelEl.setAttribute('aria-label', 'Detalle del servicio');
  panelEl.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando…</p>';

  let s;
  try {
    s = await obtenerServicio(idServicio);
  } catch (error) {
    panelEl.innerHTML = `${htmlCabecera('Servicios', '')}${htmlError(error.message)}`;
    return;
  }
  if (estado.idSeleccionado !== s.idServicio) return; // se eligió otro mientras cargaba

  const esp = especialidad(s.idEspecialidad);
  const insignia = s.activo ? '<span class="insignia insignia-ok mb-2">Activo</span>' : '<span class="insignia insignia-apagada mb-2">Inactivo</span>';
  panelEl.innerHTML = `
    ${htmlCabecera(s.nombreServicio, `${escapar(esp?.nombreEspecialidad ?? '')}${s.descripcion ? ` · ${escapar(s.descripcion)}` : ''}`, { antes: insignia })}
    ${aviso ? htmlExito(aviso) : ''}
    <div class="mx-6 grid grid-cols-3 divide-x divide-borde-default rounded-medio border border-borde-default text-center tabular-nums">
      <div class="p-3"><span class="block text-13 text-texto-secundario">Precio</span><b class="block text-lg font-semibold">${precioTexto(s)}</b><small class="text-13 text-texto-secundario">con IVA</small></div>
      <div class="p-3"><span class="block text-13 text-texto-secundario">Duración</span><b class="block text-lg font-semibold">${duracion(s.duracionMin)}</b><small class="text-13 text-texto-secundario">sugerida</small></div>
      <div class="p-3"><span class="block text-13 text-texto-secundario">Este mes</span><b class="block text-lg font-semibold">${s.vecesEsteMes}</b><small class="text-13 text-texto-secundario">${s.vecesEsteMes === 1 ? 'vez' : 'veces'}</small></div>
    </div>
    <div class="separa"></div>
    <h3 class="panel-titulo px-6">Comisión por servicio <span class="font-normal">regla general del salón</span></h3>
    ${htmlCalculo(s.precio, s.precioDesde)}
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Quién lo hace <span class="font-normal">tienen la especialidad ${escapar(esp?.nombreEspecialidad ?? '')}</span></h3>
      ${s.quienes.length ? `<ul>${s.quienes.map((e) => `
        <li class="flex items-center gap-3 border-b border-neutro-100 py-2 last:border-0">
          <span class="ini" aria-hidden="true">${escapar(iniciales(e.nombreCompleto))}</span>
          <span class="min-w-0 flex-1"><b class="block font-semibold">${escapar(e.nombreCompleto)}</b><small class="text-13 text-texto-secundario">${escapar(e.puesto)}</small></span>
          <span class="text-texto-secundario tabular-nums">${e.vecesEsteMes} este mes</span>
        </li>`).join('')}</ul>` : '<p class="text-texto-secundario">Nadie tiene esta especialidad. Agrégala a alguien en Empleados.</p>'}
    </div>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secundario" data-accion="editar">Editar servicio</button>
        <button type="button" class="btn btn-secundario" disabled title="Disponible cuando se programe la Agenda">Ver en la agenda</button>
      </div>
      <div class="flex items-center justify-between gap-3 text-sm">
        <button type="button" data-accion="${s.activo ? 'desactivar' : 'activar'}"
          class="cursor-pointer font-semibold underline underline-offset-2 ${s.activo ? 'text-estado-error decoration-rojo-200' : 'decoration-borde-fuerte'}">${s.activo ? 'Desactivar servicio' : 'Activar servicio'}</button>
        <span class="text-13 text-texto-secundario">${s.activo ? (s.tieneVentas ? 'No se borra: tiene ventas' : 'Deja de salir en la agenda y el POS') : 'Vuelve a salir en la agenda y el POS'}</span>
      </div>
    </div>`;
  panelEl.servicio = s;
  panel.enfocarTitulo(Boolean(aviso));
}

// --- Formulario --------------------------------------------------------------

function htmlQuienes(idEspecialidad) {
  const esp = especialidad(Number(idEspecialidad));
  if (!esp) return '<p class="text-texto-secundario">Elija la especialidad para ver quién lo puede hacer.</p>';
  if (!esp.empleados.length) return '<p class="text-texto-secundario">Nadie tiene esta especialidad todavía.</p>';
  return `<p class="flex flex-wrap gap-2">${esp.empleados.map((e) =>
    `<span class="inline-flex items-center gap-2 rounded-full bg-fondo-sutil py-1 pr-3 pl-1"><span class="ini size-6 text-[10px]" aria-hidden="true">${escapar(iniciales(e.nombreCompleto))}</span>${escapar(e.nombreCompleto.split(' ')[0])}</span>`).join('')}</p>`;
}

function mostrarFormulario(servicio = null) {
  estado.formularioSucio = false;
  panel.abrir();
  const editando = Boolean(servicio);
  const s = servicio ?? { precioDesde: false };
  const otra = s.duracionMin && !DURACIONES.includes(s.duracionMin);
  panelEl.setAttribute('aria-label', editando ? 'Editar servicio' : 'Nuevo servicio');

  panelEl.innerHTML = `
    ${htmlCabecera(editando ? `Editar ${s.nombreServicio}` : 'Nuevo servicio', 'Los campos con * son obligatorios')}
    <form id="form-servicio" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-4 px-6">
        ${campo({ nombre: 'nombreServicio', columna: 'nombre_servicio', etiqueta: 'Nombre', obligatorio: true, control: entrada('nombreServicio', s.nombreServicio, 'maxlength="80" autocomplete="off"') })}
        ${campo({ nombre: 'idEspecialidad', columna: 'id_especialidad', etiqueta: 'Especialidad', obligatorio: true, ayuda: 'Decide quién puede hacerlo.', control: `<select id="f-idEspecialidad" name="idEspecialidad" aria-describedby="ayuda-idEspecialidad"><option value="">Elegir…</option>${estado.especialidades.map((e) => `<option value="${e.idEspecialidad}" ${s.idEspecialidad === e.idEspecialidad ? 'selected' : ''}>${escapar(e.nombreEspecialidad)}</option>`).join('')}</select>` })}
        ${campo({ nombre: 'descripcion', columna: 'descripcion', etiqueta: 'Descripción', control: `<textarea id="f-descripcion" name="descripcion" maxlength="300" rows="2" placeholder="Ej.: alisado temporal con plancha y sérum">${escapar(s.descripcion ?? '')}</textarea>` })}

        <fieldset data-campo="duracion_min">
          <legend class="campo-etiqueta">Duración sugerida <span class="opcional">opcional</span></legend>
          <div class="flex flex-wrap gap-2">
            ${DURACIONES.map((m) => `<label class="chip"><input type="radio" name="duracionOpcion" value="${m}" ${s.duracionMin === m ? 'checked' : ''}>${duracion(m)}</label>`).join('')}
            <label class="chip"><input type="radio" name="duracionOpcion" value="otra" ${otra ? 'checked' : ''}>Otra</label>
          </div>
          <div id="caja-otra" class="campo-caja mt-2 w-40 ${otra ? '' : 'hidden'}">
            <input id="f-duracionMin" name="duracionMin" type="number" inputmode="numeric" min="5" max="600" step="5" value="${otra ? s.duracionMin : ''}" aria-label="Duración en minutos"><span class="text-sm text-texto-secundario">min</span>
          </div>
          <p class="campo-ayuda" id="ayuda-duracionMin">Se propone al agendar; quien agenda escribe la duración real.</p>
          <p class="campo-error hidden" id="error-duracionMin"></p>
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <div data-campo="precio">
            <label class="campo-etiqueta" for="f-precio">Precio con IVA <span class="text-estado-error" aria-hidden="true">*</span></label>
            <div class="campo-caja"><span class="text-texto-secundario">$</span><input id="f-precio" name="precio" type="number" inputmode="decimal" min="0" max="9999.99" step="0.01" value="${s.precio ?? ''}" class="tabular-nums"></div>
            <p class="campo-error hidden" id="error-precio"></p>
          </div>
          <div>
            <span class="campo-etiqueta">Comisión</span>
            <div class="campo-caja bg-fondo-sutil tabular-nums" aria-live="polite"><span>${estado.parametros.comisionServicioPct} % sin IVA</span><b id="comision-calc" class="ml-auto font-semibold">${dinero(comision(s.precio ?? 0))}</b></div>
          </div>
        </div>
        <label class="-mt-2 flex items-start gap-2 text-sm" data-campo="precio_desde">
          <input type="checkbox" name="precioDesde" class="mt-0.5 size-4 accent-neutro-900" ${s.precioDesde ? 'checked' : ''}>
          <span>Es precio "desde": cambia según el largo del cabello u otros detalles</span>
        </label>
        <p class="campo-ayuda -mt-2">La comisión es la regla general del salón; se cambia en Configuración.</p>

        <div class="rounded-medio border border-borde-default p-4 text-sm">
          <h3 class="panel-titulo">Quién lo hace</h3>
          <div id="quienes">${htmlQuienes(s.idEspecialidad)}</div>
          <p class="mt-2 text-13 text-texto-secundario">Para que alguien más lo haga, agréguele la especialidad en Empleados.</p>
        </div>
      </div>

      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar servicio</button>
        </div>
        ${editando ? '<p class="text-center text-13 text-texto-secundario">Cambiar el precio no toca ventas pasadas.</p>' : ''}
      </div>
    </form>`;

  const form = $('form-servicio');
  form.addEventListener('input', (e) => {
    estado.formularioSucio = true;
    if (e.target.name === 'precio') $('comision-calc').textContent = dinero(comision(Number(e.target.value) || 0));
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'idEspecialidad') $('quienes').innerHTML = htmlQuienes(e.target.value);
    if (e.target.name === 'duracionOpcion') {
      const esOtra = e.target.value === 'otra';
      $('caja-otra').classList.toggle('hidden', !esOtra);
      if (esOtra) $('f-duracionMin').focus();
    }
  });
  form.addEventListener('submit', (e) => enviarFormulario(e, servicio));
  $('f-nombreServicio').focus();
}

/** Lee el formulario y lo valida. Devuelve { datos, errores }. */
function leerFormulario(form) {
  const v = (nombre) => form.elements[nombre].value.trim();
  const opcion = form.elements.duracionOpcion.value;
  const errores = {};
  const datos = {
    nombreServicio: v('nombreServicio').replace(/\s+/g, ' '),
    idEspecialidad: Number(v('idEspecialidad')) || null,
    descripcion: v('descripcion') || null,
    duracionMin: opcion === 'otra' ? Number(v('duracionMin')) || null : Number(opcion) || null,
    precio: v('precio') === '' ? null : Number(v('precio')),
    precioDesde: form.elements.precioDesde.checked,
  };

  if (!datos.nombreServicio) errores.nombreServicio = 'Escriba el nombre del servicio.';
  if (!datos.idEspecialidad) errores.idEspecialidad = 'Elija la especialidad.';
  if (opcion === 'otra' && (!Number.isInteger(datos.duracionMin) || datos.duracionMin < 5 || datos.duracionMin > 600)) {
    errores.duracionMin = 'Escriba los minutos: de 5 a 600.';
  }
  if (datos.precio === null) errores.precio = 'Escriba el precio.';
  else if (!Number.isFinite(datos.precio) || datos.precio < 0) errores.precio = 'El precio no puede ser negativo.';
  else if (datos.precio > 9999.99) errores.precio = 'Revise el precio: es demasiado alto.';
  else if (Math.abs(datos.precio * 100 - Math.round(datos.precio * 100)) > 1e-6) errores.precio = 'Use como máximo 2 decimales.';
  return { datos, errores };
}

async function enviarFormulario(evento, servicio) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');

  const { datos, errores } = leerFormulario(form);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const guardado = await guardarServicio(datos, servicio?.idServicio);
    estado.formularioSucio = false;
    await cargar();
    await mostrarDetalle(guardado.idServicio, servicio ? 'Cambios guardados.' : 'Servicio guardado.');
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar servicio';
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  const sePuedeSalir = () => !estado.formularioSucio || confirm(SIN_CAMBIOS);

  $('buscar').addEventListener('input', (e) => {
    estado.buscar = e.target.value.trim();
    pintarLista();
  });

  $('filtros').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-filtro]');
    if (!boton) return;
    estado.filtro = boton.dataset.filtro;
    pintarFiltros();
    pintarLista();
  });

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila || !sePuedeSalir()) return;
    panel.abrir(fila);
    mostrarDetalle(fila.dataset.id);
  });

  $('btn-nuevo').addEventListener('click', (e) => {
    if (!sePuedeSalir()) return;
    estado.idSeleccionado = null;
    pintarLista();
    panel.abrir(e.currentTarget);
    mostrarFormulario();
  });

  panelEl.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-accion]');
    switch (boton?.dataset.accion) {
      case 'cerrar': panel.cerrar(); break;
      case 'editar': mostrarFormulario(panelEl.servicio); break;
      case 'cancelar':
        if (!sePuedeSalir()) return;
        estado.formularioSucio = false;
        if (estado.idSeleccionado) mostrarDetalle(estado.idSeleccionado);
        else panel.cerrar();
        break;
      case 'desactivar':
      case 'activar': {
        const activo = boton.dataset.accion === 'activar';
        boton.disabled = true;
        try {
          await cambiarActivo(estado.idSeleccionado, activo);
          await cargar();
          await mostrarDetalle(estado.idSeleccionado, activo ? 'Servicio activado.' : 'Servicio desactivado. Ya no sale en la agenda ni en el POS.');
        } catch (error) {
          boton.disabled = false;
          boton.insertAdjacentHTML('afterend', `<span class="text-13 text-estado-error">${escapar(error.message)}</span>`);
        }
        break;
      }
      default:
    }
  });

  cargar();
}
