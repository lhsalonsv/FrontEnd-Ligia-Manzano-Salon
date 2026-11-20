/**
 * clientesController.js — Ligia Manzano Salón
 * Pantalla Clientes: lista con búsqueda y filtros, ficha y formulario (nuevo / editar) en el panel derecho.
 * Los datos salen de clientesService; aquí solo hay DOM, eventos y validaciones de formulario
 * (el backend vuelve a validar todo).
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, iniciales, dinero, numero, fechaCorta, fechaCita, mesAnio, MESES } from '../utils/formato.js';
import { listarClientes, obtenerCliente, guardarCliente } from '../services/clientesService.js';
import { listarActividades, listarDistritos } from '../services/catalogosService.js';

const sesion = montarLayout({ accion: { id: 'btn-nuevo', texto: 'Nuevo cliente', icono: 'mas' } });

const $ = (id) => document.getElementById(id);
const lista = $('lista');
const panel = $('panel');
const fondoPanel = $('fondo-panel');

const estado = {
  buscar: '',
  filtro: 'todos',
  pagina: 0,
  idSeleccionado: null,
  peticion: 0,         // para ignorar respuestas viejas si se escribe rápido en el buscador
  formularioSucio: false,
  volverFoco: null,    // a dónde regresa el foco al cerrar el panel
};

const nombreCompleto = (c) => [c.nombre, c.apellido].filter(Boolean).join(' ');

// --- Lista -------------------------------------------------------------------

function htmlFila(c) {
  const alergia = c.tieneAlergia
    ? '<span class="ml-1.5 inline-block size-2 rounded-full bg-aviso-300 align-[2px]" title="Tiene alergia registrada"><span class="sr-only">(tiene alergia registrada)</span></span>'
    : '';
  const cita = c.proximaCita
    ? `${fechaCita(c.proximaCita.fechaHoraInicio)}<small class="block text-xs text-texto-secundario">${escapar(c.proximaCita.servicio)} · ${escapar(c.proximaCita.empleado)}</small>`
    : '<span class="text-texto-secundario">Sin cita</span>';
  const actual = c.idCliente === estado.idSeleccionado;
  return `<li>
    <button type="button" data-id="${c.idCliente}" ${actual ? 'aria-current="true"' : ''}
      class="fila-cli min-h-[52px] w-full cursor-pointer border-b border-neutro-100 py-1.5 text-left text-15 leading-tight tabular-nums hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)]">
      <span class="flex min-w-0 items-center gap-3">
        <span class="ini" aria-hidden="true">${escapar(iniciales(nombreCompleto(c)))}</span>
        <span class="min-w-0"><b class="block truncate font-semibold">${escapar(nombreCompleto(c))}${alergia}</b><small class="block text-13 text-texto-secundario">${escapar(c.telefono)}</small></span>
      </span>
      <span class="max-md:hidden">${c.ultimaVisita ? fechaCorta(c.ultimaVisita) : '<span class="text-texto-secundario">Nunca</span>'}</span>
      <span class="text-right max-md:hidden">${c.visitas12m}</span>
      <span class="text-right max-md:hidden">${dinero(c.gastado12m)}</span>
      <span class="text-sm max-sm:hidden">${cita}</span>
    </button>
  </li>`;
}

async function cargarLista({ mas = false } = {}) {
  estado.pagina = mas ? estado.pagina + 1 : 0;
  const idPeticion = ++estado.peticion;
  const estadoLista = $('lista-estado');
  lista.setAttribute('aria-busy', 'true');
  try {
    const { contenido, totalElementos, conteos } = await listarClientes({
      buscar: estado.buscar, filtro: estado.filtro, pagina: estado.pagina,
    });
    if (idPeticion !== estado.peticion) return; // llegó una respuesta más nueva

    const filas = contenido.map(htmlFila).join('');
    if (mas) lista.insertAdjacentHTML('beforeend', filas);
    else lista.innerHTML = filas;

    for (const boton of document.querySelectorAll('[data-filtro]')) {
      boton.querySelector('span').textContent = numero(conteos[boton.dataset.filtro]);
    }
    $('resumen').textContent = estado.buscar
      ? `${numero(conteos.todos)} ${conteos.todos === 1 ? 'resultado' : 'resultados'}`
      : `${numero(conteos.todos)} clientes registrados`;

    const vacia = lista.children.length === 0;
    estadoLista.classList.toggle('hidden', !vacia);
    estadoLista.textContent = estado.buscar ? `Nadie coincide con “${estado.buscar}”.` : 'No hay clientes en este filtro.';
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

function marcarSeleccion() {
  for (const boton of lista.querySelectorAll('[data-id]')) {
    if (Number(boton.dataset.id) === estado.idSeleccionado) boton.setAttribute('aria-current', 'true');
    else boton.removeAttribute('aria-current');
  }
}

// --- Panel -------------------------------------------------------------------

const enPantallaAncha = () => window.matchMedia('(min-width: 80rem)').matches; // xl

function abrirPanel() {
  panel.classList.remove('hidden');
  panel.classList.add('flex');
  fondoPanel.classList.remove('hidden');
}

function cerrarPanel() {
  if (estado.formularioSucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
  estado.formularioSucio = false;
  estado.idSeleccionado = null;
  marcarSeleccion();
  fondoPanel.classList.add('hidden');
  if (enPantallaAncha()) {
    mostrarVacio();
  } else {
    panel.classList.add('hidden');
    panel.classList.remove('flex');
  }
  estado.volverFoco?.focus();
}

function mostrarVacio() {
  panel.setAttribute('aria-label', 'Ficha del cliente');
  panel.innerHTML = `<div class="m-auto max-w-60 p-6 text-center text-texto-secundario">
    ${icono('clientes', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}
    <p>Elige un cliente de la lista para ver su ficha.</p>
  </div>`;
}

function htmlCabecera(titulo, subtitulo, conIniciales) {
  return `<div class="flex items-start gap-3 px-6 pt-6 pb-4">
    ${conIniciales ? `<span class="ini size-12 text-base" aria-hidden="true">${escapar(iniciales(titulo))}</span>` : ''}
    <div class="min-w-0"><h2 id="panel-titulo" tabindex="-1" class="text-xl leading-tight outline-none">${escapar(titulo)}</h2><p class="mt-0.5 text-sm text-texto-secundario">${subtitulo}</p></div>
    <button type="button" data-accion="cerrar" class="ml-auto grid size-8 shrink-0 place-items-center rounded-chico text-texto-secundario hover:bg-fondo-sutil" aria-label="Cerrar">${icono('cerrar')}</button>
  </div>`;
}

const formatoNit = (nit) => (nit?.length === 14 ? nit.replace(/^(\d{4})(\d{6})(\d{3})(\d)$/, '$1-$2-$3-$4') : nit?.replace(/^(\d{8})(\d)$/, '$1-$2'));
const formatoNrc = (nrc) => nrc?.replace(/^(\d+)(\d)$/, '$1-$2');

async function mostrarFicha(idCliente, aviso = '') {
  estado.idSeleccionado = Number(idCliente);
  estado.formularioSucio = false;
  marcarSeleccion();
  abrirPanel();
  panel.setAttribute('aria-label', 'Ficha del cliente');
  panel.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando ficha…</p>';

  let c;
  let actividades = [];
  let distritos = [];
  try {
    c = await obtenerCliente(idCliente);
    if (c.razonSocial) [actividades, distritos] = await Promise.all([listarActividades(), listarDistritos()]);
  } catch (error) {
    panel.innerHTML = `${htmlCabecera('Clientes', '', false)}<div class="aviso aviso-error mx-6">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
    return;
  }
  if (estado.idSeleccionado !== c.idCliente) return; // se eligió otro mientras cargaba

  const cumple = c.diaCumple && c.mesCumple ? `${c.diaCumple} de ${MESES[c.mesCumple - 1]}` : '—';
  const actividad = actividades.find((a) => a.codActividad === c.codActividad);
  const distrito = distritos.find((d) => d.idDistrito === c.idDistrito);

  panel.innerHTML = `
    ${htmlCabecera(nombreCompleto(c), `Cliente desde ${mesAnio(c.creadoEn)}`, true)}
    ${aviso ? `<div class="aviso aviso-exito mx-6 mb-4" role="status">${icono('info')}<p>${escapar(aviso)}</p></div>` : ''}
    ${c.alergias ? `<div class="aviso aviso-aviso mx-6 text-texto-principal">${icono('advertencia', 'text-estado-aviso')}<div><b class="block font-semibold">Alergia registrada</b>${escapar(c.alergias)}</div></div>` : ''}
    <div class="separa"></div>
    <dl class="datos">
      <dt>Teléfono</dt><dd><a class="underline-offset-2 hover:underline" href="tel:${escapar(c.telefono.replace(/[^\d+]/g, ''))}">${escapar(c.telefono)}</a></dd>
      <dt>Correo</dt><dd>${c.correo ? `${escapar(c.correo)}<small>Recibe aquí sus facturas</small>` : '—'}</dd>
      <dt>Cumpleaños</dt><dd>${cumple}</dd>
      ${c.numDocumento ? `<dt>DUI</dt><dd class="tabular-nums">${escapar(c.numDocumento)}</dd>` : ''}
      ${c.empleadoFrecuente ? `<dt>Prefiere</dt><dd>${escapar(c.empleadoFrecuente)}</dd>` : ''}
    </dl>
    ${c.razonSocial ? `
      <div class="separa"></div>
      <h3 class="panel-titulo px-6">Crédito fiscal</h3>
      <dl class="datos">
        <dt>Razón social</dt><dd>${escapar(c.razonSocial)}${c.nombreComercial ? `<small>${escapar(c.nombreComercial)}</small>` : ''}</dd>
        <dt>NIT</dt><dd class="tabular-nums">${escapar(formatoNit(c.nit))}</dd>
        <dt>NRC</dt><dd class="tabular-nums">${escapar(formatoNrc(c.nrc))}</dd>
        <dt>Actividad</dt><dd>${escapar(c.codActividad)}${actividad ? ` · ${escapar(actividad.descripcion)}` : ''}</dd>
        <dt>Dirección</dt><dd>${escapar(c.complemento)}${distrito ? `<small>${escapar(distrito.distrito)}, ${escapar(distrito.municipio)}, ${escapar(distrito.departamento)}</small>` : ''}</dd>
      </dl>` : ''}
    ${c.ultimaFormula ? `
      <div class="mx-6 mt-4 rounded-medio border border-borde-default px-4 py-3 text-sm">
        <h3 class="mb-1 flex items-center gap-2 font-semibold">${icono('gota', 'size-[18px]')}Fórmula de color<span class="ml-auto font-normal text-texto-secundario">${fechaCorta(c.ultimaFormula.fecha)} · ${escapar(c.ultimaFormula.empleado)}</span></h3>
        <p>${escapar(c.ultimaFormula.formula)}</p>
        ${c.ultimaFormula.observaciones ? `<small class="text-13 text-texto-secundario">${escapar(c.ultimaFormula.observaciones)}</small>` : ''}
      </div>` : ''}
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Últimas visitas <span class="font-normal">${c.visitas12m} en 12 meses · ${dinero(c.gastado12m)}</span></h3>
      ${c.ultimasVisitas.length ? `<ul>${c.ultimasVisitas.map((v) => `
        <li class="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 border-b border-neutro-100 py-2 last:border-0 tabular-nums">
          <span class="text-texto-secundario">${fechaCorta(v.fecha)}</span>
          <span>${escapar(v.descripcion)}<small class="block text-13 text-texto-secundario">${escapar(v.empleado)}</small></span>
          <b class="font-semibold">${dinero(v.total)}</b>
        </li>`).join('')}</ul>` : '<p class="text-texto-secundario">Todavía no tiene visitas.</p>'}
    </div>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      <button type="button" class="btn btn-primario h-11 w-full" disabled title="Disponible cuando se programe la Agenda">${icono('agenda')}Nueva cita</button>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secundario" data-accion="editar">Editar ficha</button>
        <button type="button" class="btn btn-secundario" disabled title="Disponible cuando se programe el Punto de venta">Nueva venta</button>
      </div>
    </div>`;
  panel.dataset.idCliente = c.idCliente;
  panel.cliente = c;
  if (!enPantallaAncha() || aviso) $('panel-titulo').focus();
}

// --- Formulario --------------------------------------------------------------

/** Campo con etiqueta, caja y mensaje de error. `columna` = nombre en tb_clientes (data-campo). */
function campo({ nombre, columna, etiqueta, obligatorio = false, ayuda = '', control }) {
  return `<div data-campo="${columna}">
    <label class="campo-etiqueta" for="f-${nombre}">${etiqueta}${obligatorio ? ' <span class="text-estado-error" aria-hidden="true">*</span>' : ' <span class="opcional">opcional</span>'}</label>
    <div class="campo-caja">${control}</div>
    ${ayuda ? `<p class="campo-ayuda" id="ayuda-${nombre}">${ayuda}</p>` : ''}
    <p class="campo-error hidden" id="error-${nombre}"></p>
  </div>`;
}

const entrada = (nombre, valor, extra = '') =>
  `<input id="f-${nombre}" name="${nombre}" value="${escapar(valor ?? '')}" ${extra}>`;

async function mostrarFormulario(cliente = null) {
  estado.formularioSucio = false;
  abrirPanel();
  const editando = Boolean(cliente);
  panel.setAttribute('aria-label', editando ? 'Editar cliente' : 'Nuevo cliente');

  let actividades = [];
  let distritos = [];
  try {
    [actividades, distritos] = await Promise.all([listarActividades(), listarDistritos()]);
  } catch {
    // Sin catálogos se puede guardar igual un cliente sin crédito fiscal
  }

  const c = cliente ?? {};
  const actividad = actividades.find((a) => a.codActividad === c.codActividad);
  const departamentos = Object.groupBy?.(distritos, (d) => d.departamento)
    ?? distritos.reduce((g, d) => ((g[d.departamento] ??= []).push(d), g), {});

  panel.innerHTML = `
    ${htmlCabecera(editando ? `Editar ${nombreCompleto(c)}` : 'Nuevo cliente', 'Solo el nombre y el teléfono son obligatorios', false)}
    <form id="form-cliente" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-4 px-6">
        <div class="grid gap-4 sm:grid-cols-2">
          ${campo({ nombre: 'nombre', columna: 'nombre', etiqueta: 'Nombre', obligatorio: true, control: entrada('nombre', c.nombre, 'maxlength="80" autocomplete="off" required') })}
          ${campo({ nombre: 'apellido', columna: 'apellido', etiqueta: 'Apellido', control: entrada('apellido', c.apellido, 'maxlength="80" autocomplete="off"') })}
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          ${campo({ nombre: 'telefono', columna: 'telefono', etiqueta: 'Teléfono', obligatorio: true, control: entrada('telefono', c.telefono, 'type="tel" inputmode="tel" maxlength="30" placeholder="7000-0000" required') })}
          <div data-campo="dia_cumple">
            <span class="campo-etiqueta" id="et-cumple">Cumpleaños <span class="opcional">opcional</span></span>
            <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-2" role="group" aria-labelledby="et-cumple">
              <div class="campo-caja px-2"><select id="f-diaCumple" name="diaCumple" aria-label="Día" aria-describedby="error-diaCumple"><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => `<option ${c.diaCumple === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
              <div class="campo-caja px-2" data-campo="mes_cumple"><select id="f-mesCumple" name="mesCumple" aria-label="Mes" aria-describedby="error-diaCumple"><option value="">Mes</option>${MESES.map((m, i) => `<option value="${i + 1}" ${c.mesCumple === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
            </div>
            <p class="campo-error hidden" id="error-diaCumple"></p>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          ${campo({ nombre: 'correo', columna: 'correo', etiqueta: 'Correo', control: entrada('correo', c.correo, 'type="email" maxlength="100" placeholder="Para enviarle sus facturas"') })}
          ${campo({ nombre: 'numDocumento', columna: 'num_documento', etiqueta: 'DUI', control: entrada('numDocumento', c.numDocumento, 'inputmode="numeric" maxlength="10" placeholder="00000000-0"') })}
        </div>
        ${campo({ nombre: 'alergias', columna: 'alergias', etiqueta: 'Alergias o cuidados', ayuda: 'Se muestra en la agenda cada vez que tenga cita.', control: `<textarea id="f-alergias" name="alergias" maxlength="300" rows="2" placeholder="Ej.: sensible al amoníaco, cuero cabelludo sensible" aria-describedby="ayuda-alergias">${escapar(c.alergias ?? '')}</textarea>` })}

        <details id="fiscal" class="group rounded-medio border border-borde-default" ${c.razonSocial ? 'open' : ''}>
          <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-15 font-semibold">
            Datos para crédito fiscal <span class="opcional">para emitirle CCF</span>
            ${icono('abajo', 'ml-auto size-[18px] transition-transform group-open:rotate-180')}
          </summary>
          <div class="flex flex-col gap-4 border-t border-borde-default p-4">
            <p class="campo-ayuda mt-0">Si llena uno de estos datos, se piden todos.</p>
            ${campo({ nombre: 'razonSocial', columna: 'razon_social', etiqueta: 'Razón social', obligatorio: true, control: entrada('razonSocial', c.razonSocial, 'maxlength="250"') })}
            ${campo({ nombre: 'nombreComercial', columna: 'nombre_comercial', etiqueta: 'Nombre comercial', control: entrada('nombreComercial', c.nombreComercial, 'maxlength="150"') })}
            <div class="grid gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              ${campo({ nombre: 'nit', columna: 'nit', etiqueta: 'NIT', obligatorio: true, control: entrada('nit', formatoNit(c.nit), 'inputmode="numeric" maxlength="17" placeholder="0000-000000-000-0"') })}
              ${campo({ nombre: 'nrc', columna: 'nrc', etiqueta: 'NRC', obligatorio: true, control: entrada('nrc', formatoNrc(c.nrc), 'inputmode="numeric" maxlength="9" placeholder="000000-0"') })}
            </div>
            ${campo({ nombre: 'codActividad', columna: 'cod_actividad', etiqueta: 'Actividad económica', obligatorio: true, control: `${entrada('codActividad', actividad ? `${actividad.codActividad} · ${actividad.descripcion}` : c.codActividad, 'list="lista-actividades" placeholder="Escriba el código o el nombre"')}<datalist id="lista-actividades">${actividades.map((a) => `<option value="${escapar(`${a.codActividad} · ${a.descripcion}`)}"></option>`).join('')}</datalist>` })}
            ${campo({ nombre: 'idDistrito', columna: 'id_distrito', etiqueta: 'Distrito', obligatorio: true, control: `<select id="f-idDistrito" name="idDistrito"><option value="">Elegir…</option>${Object.entries(departamentos).map(([dep, ds]) => `<optgroup label="${escapar(dep)}">${ds.map((d) => `<option value="${d.idDistrito}" ${c.idDistrito === d.idDistrito ? 'selected' : ''}>${escapar(d.distrito)} · ${escapar(d.municipio)}</option>`).join('')}</optgroup>`).join('')}</select>` })}
            ${campo({ nombre: 'complemento', columna: 'complemento', etiqueta: 'Dirección', obligatorio: true, control: entrada('complemento', c.complemento, 'maxlength="200" placeholder="Colonia, calle, número"') })}
          </div>
        </details>
      </div>

      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        ${editando ? '' : `<div class="aviso aviso-info">${icono('info')}<p>No se puede exigir DUI ni correo para facturarle a un consumidor final.</p></div>`}
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar cliente</button>
        </div>
      </div>
    </form>`;

  const form = $('form-cliente');
  form.addEventListener('input', () => { estado.formularioSucio = true; });
  form.addEventListener('submit', (e) => enviarFormulario(e, cliente, actividades));
  $('f-nombre').focus();
}

/** Lee el formulario y lo valida. Devuelve { datos, errores }. */
function leerFormulario(form, actividades) {
  const v = (nombre) => form.elements[nombre].value.trim();
  const errores = {};
  const datos = {
    nombre: v('nombre'),
    apellido: v('apellido') || null,
    telefono: v('telefono'),
    correo: v('correo').toLowerCase() || null,
    diaCumple: Number(v('diaCumple')) || null,
    mesCumple: Number(v('mesCumple')) || null,
    alergias: v('alergias') || null,
    numDocumento: v('numDocumento') || null,
    razonSocial: v('razonSocial') || null,
    nombreComercial: v('nombreComercial') || null,
    nit: v('nit').replace(/\D/g, '') || null,
    nrc: v('nrc').replace(/\D/g, '') || null,
    codActividad: v('codActividad').match(/^\d+/)?.[0] ?? (v('codActividad') || null),
    idDistrito: Number(v('idDistrito')) || null,
    complemento: v('complemento') || null,
  };

  if (!datos.nombre) errores.nombre = 'Escriba el nombre.';

  const digitosTel = datos.telefono.replace(/\D/g, '');
  if (!datos.telefono) errores.telefono = 'Escriba el teléfono.';
  else if (digitosTel.length < 8 || digitosTel.length > 15) errores.telefono = 'Revise el teléfono: debe tener 8 dígitos (o el código de país si es de fuera).';
  else if (digitosTel.length === 8 && !datos.telefono.startsWith('+')) datos.telefono = digitosTel.replace(/(\d{4})(\d{4})/, '$1-$2');

  if (datos.correo && !form.elements.correo.checkValidity()) errores.correo = 'Revise el correo, por ejemplo nombre@gmail.com.';

  if (Boolean(datos.diaCumple) !== Boolean(datos.mesCumple)) errores.diaCumple = 'Elija el día y el mes, o deje los dos vacíos.';
  else if (datos.diaCumple && datos.diaCumple > new Date(2024, datos.mesCumple, 0).getDate()) {
    const mes = MESES[datos.mesCumple - 1];
    errores.diaCumple = `${mes[0].toUpperCase()}${mes.slice(1)} no tiene ${datos.diaCumple} días.`;
  }

  if (datos.numDocumento) {
    const dui = datos.numDocumento.replace(/\D/g, '');
    if (dui.length !== 9) errores.numDocumento = 'El DUI tiene 9 dígitos: 00000000-0.';
    else datos.numDocumento = `${dui.slice(0, 8)}-${dui.slice(8)}`;
  }
  datos.tipoDocumento = datos.numDocumento ? '13' : null; // CAT-022: 13 = DUI

  // Crédito fiscal: todo o nada (nombre comercial siempre es opcional)
  const fiscales = ['razonSocial', 'nit', 'nrc', 'codActividad', 'idDistrito', 'complemento'];
  if (fiscales.some((k) => datos[k])) {
    if (!datos.razonSocial) errores.razonSocial = 'Escriba la razón social.';
    if (!datos.nit) errores.nit = 'Escriba el NIT.';
    else if (![9, 14].includes(datos.nit.length)) errores.nit = 'El NIT tiene 14 dígitos (o 9 si es el DUI).';
    if (!datos.nrc) errores.nrc = 'Escriba el NRC.';
    else if (datos.nrc.length < 2 || datos.nrc.length > 8) errores.nrc = 'Revise el NRC: de 2 a 8 dígitos.';
    if (!datos.codActividad) errores.codActividad = 'Elija la actividad económica.';
    else if (actividades.length && !actividades.some((a) => a.codActividad === datos.codActividad)) errores.codActividad = 'Elija una actividad de la lista.';
    if (!datos.idDistrito) errores.idDistrito = 'Elija el distrito.';
    if (!datos.complemento) errores.complemento = 'Escriba la dirección.';
  }
  return { datos, errores };
}

function mostrarErrores(form, errores) {
  for (const p of form.querySelectorAll('.campo-error')) {
    p.classList.add('hidden');
    p.textContent = '';
  }
  for (const control of form.querySelectorAll('[aria-invalid]')) control.removeAttribute('aria-invalid');

  for (const [nombre, mensaje] of Object.entries(errores)) {
    const p = $(`error-${nombre}`);
    const control = form.elements[nombre];
    if (!p || !control) continue;
    p.textContent = mensaje;
    p.classList.remove('hidden');
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [`error-${nombre}`, control.id === 'f-alergias' ? 'ayuda-alergias' : ''].join(' ').trim());
  }
  if (form.querySelector('#fiscal [aria-invalid="true"]')) $('fiscal').open = true;
  Object.keys(errores).map((n) => form.elements[n]).find(Boolean)?.focus();
}

async function enviarFormulario(evento, cliente, actividades) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');

  const { datos, errores } = leerFormulario(form, actividades);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const guardado = await guardarCliente(datos, cliente?.idCliente);
    estado.formularioSucio = false;
    await cargarLista();
    await mostrarFicha(guardado.idCliente, cliente ? 'Cambios guardados.' : 'Cliente guardado.');
  } catch (error) {
    // 400 con { campos: { telefono: "..." } } → se marcan los campos (docs/contrato-api.md)
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar cliente';
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  const mesNombre = MESES[new Date().getMonth()];
  $('etiqueta-cumple').textContent = `Cumpleaños en ${mesNombre}`;

  let espera;
  $('buscar').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.buscar = e.target.value.trim();
      cargarLista();
    }, 250);
  });

  for (const boton of document.querySelectorAll('[data-filtro]')) {
    boton.addEventListener('click', () => {
      document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
      estado.filtro = boton.dataset.filtro;
      cargarLista();
    });
  }

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila) return;
    if (estado.formularioSucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
    estado.volverFoco = fila;
    mostrarFicha(fila.dataset.id);
  });

  $('cargar-mas').querySelector('button').addEventListener('click', () => cargarLista({ mas: true }));

  $('btn-nuevo').addEventListener('click', (e) => {
    if (estado.formularioSucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
    estado.volverFoco = e.currentTarget;
    estado.idSeleccionado = null;
    marcarSeleccion();
    mostrarFormulario();
  });

  panel.addEventListener('click', (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'cerrar') cerrarPanel();
    if (accion === 'editar') mostrarFormulario(panel.cliente);
    if (accion === 'cancelar') {
      if (estado.formularioSucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
      estado.formularioSucio = false;
      if (estado.idSeleccionado) mostrarFicha(estado.idSeleccionado);
      else cerrarPanel();
    }
  });
  fondoPanel.addEventListener('click', cerrarPanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden') && !enPantallaAncha()) cerrarPanel();
  });

  mostrarVacio();
  cargarLista();
}
