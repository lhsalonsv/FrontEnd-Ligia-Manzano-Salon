/**
 * empleadosController.js — Ligia Manzano Salón
 * Pantalla Empleados: equipo (activas / de baja), ficha y formulario con especialidades y horario semanal.
 * La lista es corta, así que se pide una vez y se filtra aquí.
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, fechaCorta, mesAnio, MESES } from '../utils/formato.js';
import { campo, entrada, mostrarErrores } from '../utils/formulario.js';
import { crearPanel, htmlCabecera, htmlError, htmlExito } from '../utils/panel.js';
import { DIAS, validarHorario, textoDia } from '../utils/horario.js';
import { listarEmpleados, obtenerEmpleado, guardarEmpleado, darDeBaja } from '../services/empleadosService.js';
import { listarServicios, listarEspecialidades } from '../services/serviciosService.js';

const sesion = montarLayout({ accion: { id: 'btn-nuevo', texto: 'Nuevo empleado', icono: 'mas' } });

const $ = (id) => document.getElementById(id);
const lista = $('lista');
const panelEl = $('panel');
const SIN_CAMBIOS = 'Hay cambios sin guardar. ¿Salir sin guardar?';
const PUESTOS = ['Estilista', 'Manicurista', 'Recepcionista', 'Dueña'];
const AFP = { CRECER: 'AFP Crecer', CONFIA: 'AFP Confía' };
const NOMBRE_ROL = { ADMINISTRADOR: 'Administrador', RECEPCIONISTA: 'Recepcionista', CONTADOR: 'Contador', AUDITOR: 'Auditor' };

const estado = {
  empleados: [],
  especialidades: [],
  servicios: [],
  horarioSalon: [],
  quincena: null,
  filtro: 'activas',
  buscar: '',
  idSeleccionado: null,
  formularioSucio: false,
};

const panel = crearPanel({
  panel: panelEl,
  fondo: $('fondo-panel'),
  vacio: `${icono('empleados', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}<p>Elige a alguien del equipo para ver su ficha.</p>`,
  alCerrar: () => {
    if (estado.formularioSucio && !confirm(SIN_CAMBIOS)) return false;
    estado.formularioSucio = false;
    estado.idSeleccionado = null;
    pintarLista();
    return true;
  },
});

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombre = (e) => `${e.nombreEmpleado} ${e.apellido}`;
const enPlanilla = (e) => Number(e.sueldoBaseMensual) > 0 || e.recibeComision;
const fechaLarga = (f) => { const d = new Date(`${f}T00:00:00`); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// --- Equipo ------------------------------------------------------------------

function pintarFiltros() {
  const activas = estado.empleados.filter((e) => e.activo).length;
  const baja = estado.empleados.length - activas;
  $('filtros').innerHTML = [['activas', 'Activas', activas], ['baja', 'De baja', baja]]
    .map(([clave, texto, n]) => `<button type="button" class="filtro" data-filtro="${clave}" aria-pressed="${estado.filtro === clave}">${texto} <span>${n}</span></button>`).join('');
  $('resumen').textContent = `${activas} activas · planilla quincenal`;
}

function htmlFila(e) {
  const actual = e.idEmpleado === estado.idSeleccionado;
  const insignia = e.activo
    ? '<span class="insignia insignia-ok">Activa</span>'
    : `<span class="insignia insignia-apagada" title="Baja: ${fechaCorta(e.fechaBaja)}">De baja</span>`;
  return `<button type="button" data-id="${e.idEmpleado}" ${actual ? 'aria-current="true"' : ''}
    class="fila-e min-h-[52px] w-full cursor-pointer border-b border-neutro-100 py-1.5 text-left text-15 tabular-nums hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)]">
    <span class="flex min-w-0 items-center gap-3">
      <span class="ini" aria-hidden="true">${escapar(`${e.nombreEmpleado[0]}${e.apellido[0]}`.toUpperCase())}</span>
      <span class="min-w-0"><b class="block truncate font-semibold">${escapar(nombre(e))}</b><small class="block text-13 text-texto-secundario">${escapar(e.puesto)}</small></span>
    </span>
    <span class="max-md:hidden ${e.rol ? '' : 'text-texto-secundario'}">${e.rol ? NOMBRE_ROL[e.rol] ?? e.rol : 'Sin usuario'}</span>
    <span class="text-right max-sm:hidden ${Number(e.sueldoBaseMensual) > 0 ? '' : 'text-texto-secundario'}">${Number(e.sueldoBaseMensual) > 0 ? dinero(e.sueldoBaseMensual) : 'No aplica'}</span>
    <span class="text-right max-md:hidden ${e.recibeComision && e.activo ? '' : 'text-texto-secundario'}">${e.recibeComision && e.activo ? dinero(e.comisionesQuincena) : 'No aplica'}</span>
    <span class="text-right">${insignia}</span>
  </button>`;
}

function pintarLista() {
  const texto = sinAcentos(estado.buscar);
  const digitos = estado.buscar.replace(/\D/g, '');
  const visibles = estado.empleados
    .filter((e) => (estado.filtro === 'activas' ? e.activo : !e.activo))
    .filter((e) => !texto || sinAcentos(nombre(e)).includes(texto) || (digitos.length >= 3 && e.dui?.replace(/\D/g, '').includes(digitos)))
    .sort((a, b) => Number(enPlanilla(a)) - Number(enPlanilla(b)) || nombre(a).localeCompare(nombre(b), 'es'));
  lista.innerHTML = visibles.map(htmlFila).join('');
  const estadoLista = $('lista-estado');
  estadoLista.classList.toggle('hidden', visibles.length > 0);
  estadoLista.textContent = estado.buscar ? `Nadie coincide con “${estado.buscar}”.` : 'No hay nadie aquí.';
}

async function cargar() {
  try {
    const [{ empleados, horarioSalon, quincena }, especialidades, { servicios }] = await Promise.all([
      listarEmpleados(), listarEspecialidades(), listarServicios(),
    ]);
    Object.assign(estado, { empleados, horarioSalon, quincena, especialidades, servicios: servicios.filter((s) => s.activo) });
    const [i, f] = [new Date(`${quincena.inicio}T00:00:00`), new Date(`${quincena.fin}T00:00:00`)];
    $('cab-comisiones').textContent = `Comisiones ${i.getDate()}–${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)}`;
    pintarFiltros();
    pintarLista();
  } catch (error) {
    const estadoLista = $('lista-estado');
    estadoLista.classList.remove('hidden');
    estadoLista.innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  }
}

// --- Ficha -------------------------------------------------------------------

function htmlHorario(horarios) {
  if (!horarios.length) return '<p class="text-texto-secundario">Sin horario. No aparece al agendar.</p>';
  return `<dl class="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 tabular-nums">${DIAS.map((dia, i) => {
    const delDia = horarios.filter((b) => b.diaSemana === i + 1);
    return `<dt class="text-texto-secundario">${dia}</dt><dd>${delDia.length ? textoDia(delDia) : '<span class="text-texto-secundario">Libre</span>'}</dd>`;
  }).join('')}</dl>`;
}

async function mostrarFicha(idEmpleado, aviso = '') {
  estado.idSeleccionado = Number(idEmpleado);
  estado.formularioSucio = false;
  pintarLista();
  panel.abrir();
  panelEl.setAttribute('aria-label', 'Ficha del empleado');
  panelEl.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando ficha…</p>';

  let e;
  try {
    e = await obtenerEmpleado(idEmpleado);
  } catch (error) {
    panelEl.innerHTML = `${htmlCabecera('Empleados', '')}${htmlError(error.message)}`;
    return;
  }
  if (estado.idSeleccionado !== e.idEmpleado) return;

  const susEspecialidades = estado.especialidades.filter((x) => e.especialidades.includes(x.idEspecialidad));
  const puedeHacer = estado.servicios.filter((s) => e.especialidades.includes(s.idEspecialidad)).length;
  const sueldo = Number(e.sueldoBaseMensual);
  const subtitulo = e.activo
    ? `${escapar(e.puesto)} · desde ${mesAnio(e.fechaIngreso)}`
    : `${escapar(e.puesto)} · de baja desde el ${fechaLarga(e.fechaBaja)}`;

  panelEl.innerHTML = `
    ${htmlCabecera(nombre(e), subtitulo, { conIniciales: true })}
    ${aviso ? htmlExito(aviso) : ''}
    <dl class="datos">
      <dt>DUI</dt><dd class="tabular-nums">${escapar(e.dui ?? '—')}</dd>
      <dt>Teléfono</dt><dd>${e.telefono ? `<a class="underline-offset-2 hover:underline" href="tel:${escapar(e.telefono.replace(/[^\d+]/g, ''))}">${escapar(e.telefono)}</a>` : '—'}</dd>
      <dt>Correo</dt><dd>${escapar(e.correoEmpleado ?? '—')}</dd>
      <dt>Ingreso</dt><dd>${fechaLarga(e.fechaIngreso)}</dd>
      <dt>Salario</dt><dd>${sueldo > 0 ? `<b class="font-semibold">${dinero(sueldo)}</b><small>mensual · ${dinero(sueldo / 2)} por quincena${e.recibeComision ? ', más comisiones' : ''}</small>` : `No aplica${e.recibeComision ? '<small>Solo comisiones</small>' : ''}`}</dd>
      <dt>AFP · ISSS</dt><dd>${e.afpAdministradora ? `${AFP[e.afpAdministradora]}<small class="tabular-nums">NUP ${escapar(e.nupAfp)}</small>` : '<span class="text-texto-secundario">Sin AFP</span>'}${e.numeroIsss ? `<small class="tabular-nums">ISSS ${escapar(e.numeroIsss)}</small>` : '<small>Sin ISSS</small>'}</dd>
    </dl>
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Especialidades <span class="font-normal">hace ${puedeHacer} de ${estado.servicios.length} servicios</span></h3>
      ${susEspecialidades.length ? `<p class="flex flex-wrap gap-2">${susEspecialidades.map((x) => `<span class="rounded-full bg-fondo-sutil px-3 py-1 font-semibold">${escapar(x.nombreEspecialidad)}</span>`).join('')}</p>` : '<p class="text-texto-secundario">Ninguna. No aparece al agendar servicios.</p>'}
    </div>
    <div class="separa"></div>
    <div class="panel-seccion text-sm"><h3 class="panel-titulo">Horario</h3>${htmlHorario(e.horarios)}</div>
    <div class="separa"></div>
    <div class="panel-seccion text-sm">
      <h3 class="panel-titulo">Acceso al sistema</h3>
      ${e.usuario
        ? `<p><b class="font-semibold">${escapar(e.usuario.nombreUsuario)}</b> · ${NOMBRE_ROL[e.usuario.rol] ?? escapar(e.usuario.rol)}</p>`
        : '<p><b class="font-semibold">Sin usuario.</b> No entra al sistema; su agenda y sus comisiones las maneja la administración.</p>'}
    </div>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      ${e.activo ? `
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secundario" data-accion="editar">Editar</button>
        <button type="button" class="btn btn-secundario" disabled title="Disponible cuando se programe Comisiones y planilla">Ver comisiones</button>
      </div>
      <div id="zona-baja" class="flex items-center justify-between gap-3 text-sm">
        <button type="button" class="font-semibold underline decoration-borde-fuerte underline-offset-2 disabled:opacity-60" disabled title="Los usuarios se crean en Configuración → Usuarios y roles">${e.usuario ? 'Cambiar usuario' : 'Crearle un usuario'}</button>
        <button type="button" data-accion="pedir-baja" class="cursor-pointer font-semibold text-estado-error underline decoration-rojo-200 underline-offset-2">Dar de baja</button>
      </div>` : '<p class="text-13 text-texto-secundario">Dar de baja no borra: sus ventas y comisiones quedan en el historial.</p>'}
    </div>`;
  panelEl.empleado = e;
  panel.enfocarTitulo(Boolean(aviso));
}

function pedirBaja() {
  const e = panelEl.empleado;
  $('zona-baja').outerHTML = `
    <form id="form-baja" class="flex flex-col gap-3 rounded-medio bg-estado-error-fondo p-4 text-sm" novalidate>
      <p><b class="font-semibold">Dar de baja a ${escapar(e.nombreEmpleado)}.</b> Deja de aparecer en la agenda y en la planilla desde esa fecha. No se borra nada.</p>
      <div data-campo="fecha_baja">
        <label class="campo-etiqueta" for="f-fechaBaja">Último día de trabajo</label>
        <div class="campo-caja w-48"><input id="f-fechaBaja" name="fechaBaja" type="date" value="${hoyISO()}" min="${e.fechaIngreso}" max="${hoyISO()}"></div>
        <p class="campo-error hidden" id="error-fechaBaja"></p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secundario" data-accion="cancelar-baja">No, volver</button>
        <button type="submit" class="btn btn-peligro">Dar de baja</button>
      </div>
    </form>`;
  const form = $('form-baja');
  form.elements.fechaBaja.focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fechaBaja = form.elements.fechaBaja.value;
    if (!fechaBaja) return mostrarErrores(form, { fechaBaja: 'Elija la fecha.' });
    if (fechaBaja < e.fechaIngreso) return mostrarErrores(form, { fechaBaja: 'Es antes de la fecha de ingreso.' });
    // ponytail: la baja se registra el día que pasa; programar una baja a futuro necesitaría un proceso diario en el backend
    if (fechaBaja > hoyISO()) return mostrarErrores(form, { fechaBaja: 'No puede ser una fecha futura: regístrela ese día.' });
    form.querySelector('[type=submit]').disabled = true;
    try {
      await darDeBaja(e.idEmpleado, fechaBaja);
      await cargar();
      await mostrarFicha(e.idEmpleado, `${e.nombreEmpleado} quedó de baja. Su historial se conserva.`);
    } catch (error) {
      mostrarErrores(form, error.detalle?.campos ?? { fechaBaja: error.message });
      form.querySelector('[type=submit]').disabled = false;
    }
  });
}

// --- Formulario --------------------------------------------------------------

function htmlFilaHorario(dia, bloques) {
  const s = estado.horarioSalon.find((x) => x.diaSemana === dia);
  const cerrado = !s?.abierto;
  const [b1, b2] = bloques;
  const tiempo = (nombreCampo, valor, etiqueta) =>
    `<input type="time" name="${nombreCampo}" value="${valor ?? ''}" step="900" ${s?.abierto ? `min="${s.horaAbre.slice(0, 5)}" max="${s.horaCierra.slice(0, 5)}"` : ''} aria-label="${DIAS[dia - 1]}, ${etiqueta}" class="h-9 w-[88px] rounded-chico border border-borde-fuerte bg-fondo-superficie px-2 tabular-nums disabled:opacity-50">`;
  return `<div class="grid grid-cols-[96px_1fr] items-start gap-2 border-b border-neutro-100 py-2 last:border-0" data-dia="${dia}">
    <label class="flex h-9 items-center gap-2 font-semibold ${cerrado ? 'text-texto-deshabilitado' : ''}">
      <input type="checkbox" name="trabaja-${dia}" class="size-4 accent-neutro-900" ${bloques.length ? 'checked' : ''} ${cerrado ? 'disabled' : ''}>${DIAS[dia - 1].slice(0, 3)}
    </label>
    <div>
      ${cerrado ? '<p class="flex h-9 items-center text-texto-secundario">El salón cierra</p>' : `
      <div class="bloques flex flex-wrap items-center gap-x-2 gap-y-1 ${bloques.length ? '' : 'hidden'}">
        ${tiempo(`ini1-${dia}`, b1?.horaInicio, 'entrada')}<span>a</span>${tiempo(`fin1-${dia}`, b1?.horaFin, 'salida')}
        <span class="bloque2 ${b2 ? 'contents' : 'hidden'}"><span class="text-texto-secundario">y</span>${tiempo(`ini2-${dia}`, b2?.horaInicio, 'regreso')}<span>a</span>${tiempo(`fin2-${dia}`, b2?.horaFin, 'salida de la tarde')}</span>
        <button type="button" data-accion="bloque2" data-dia="${dia}" class="text-13 font-semibold underline underline-offset-2 ${b2 ? 'hidden' : ''}">+ tarde</button>
      </div>
      <p class="flex h-9 items-center text-texto-secundario libre ${bloques.length ? 'hidden' : ''}">Libre</p>`}
      <p class="campo-error hidden" id="error-horario-${dia}"></p>
    </div>
  </div>`;
}

function mostrarFormulario(empleado = null) {
  estado.formularioSucio = false;
  panel.abrir();
  const editando = Boolean(empleado);
  const e = empleado ?? { recibeComision: true, especialidades: [], horarios: [], fechaIngreso: hoyISO() };
  panelEl.setAttribute('aria-label', editando ? 'Editar empleado' : 'Nuevo empleado');
  const serviciosDe = (id) => estado.servicios.filter((s) => s.idEspecialidad === id).length;

  panelEl.innerHTML = `
    ${htmlCabecera(editando ? `Editar ${nombre(e)}` : 'Nuevo empleado', 'Los campos con * son obligatorios')}
    <form id="form-empleado" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-5 px-6">
        <fieldset class="flex flex-col gap-4">
          <legend class="panel-titulo mb-3 w-full">Datos personales</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            ${campo({ nombre: 'nombreEmpleado', columna: 'nombre_empleado', etiqueta: 'Nombres', obligatorio: true, control: entrada('nombreEmpleado', e.nombreEmpleado, 'maxlength="80" autocomplete="off"') })}
            ${campo({ nombre: 'apellido', columna: 'apellido', etiqueta: 'Apellidos', obligatorio: true, control: entrada('apellido', e.apellido, 'maxlength="80" autocomplete="off"') })}
            ${campo({ nombre: 'dui', columna: 'dui', etiqueta: 'DUI', obligatorio: true, ayuda: 'No se puede repetir.', control: entrada('dui', e.dui, 'inputmode="numeric" maxlength="10" placeholder="00000000-0" aria-describedby="ayuda-dui"') })}
            ${campo({ nombre: 'telefono', columna: 'telefono', etiqueta: 'Teléfono', obligatorio: true, control: entrada('telefono', e.telefono, 'type="tel" inputmode="tel" maxlength="30" placeholder="7000-0000"') })}
            ${campo({ nombre: 'correoEmpleado', columna: 'correo_empleado', etiqueta: 'Correo', control: entrada('correoEmpleado', e.correoEmpleado, 'type="email" maxlength="100"') })}
            ${campo({ nombre: 'fechaIngreso', columna: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', obligatorio: true, control: entrada('fechaIngreso', e.fechaIngreso, 'type="date"') })}
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-4">
          <legend class="panel-titulo mb-3 w-full">Puesto y planilla</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            ${campo({ nombre: 'puesto', columna: 'puesto', etiqueta: 'Puesto', obligatorio: true, control: `${entrada('puesto', e.puesto, 'list="lista-puestos" maxlength="40" autocomplete="off"')}<datalist id="lista-puestos">${PUESTOS.map((p) => `<option value="${p}"></option>`).join('')}</datalist>` })}
            ${campo({ nombre: 'sueldoBaseMensual', columna: 'sueldo_base_mensual', etiqueta: 'Salario base mensual', obligatorio: true, control: `<span class="text-texto-secundario">$</span>${entrada('sueldoBaseMensual', e.sueldoBaseMensual, 'type="number" inputmode="decimal" min="0" max="99999.99" step="0.01" class="tabular-nums" aria-describedby="ayuda-sueldoBaseMensual"')}` , ayuda: '<span id="sueldo-quincena">Se paga la mitad cada quincena.</span> Es la base de la Quincena 25 y del aguinaldo. 0 si no está en planilla (la dueña).' })}
          </div>
          <label class="flex items-start gap-3 rounded-medio border border-borde-default p-3 text-sm" data-campo="recibe_comision">
            <input type="checkbox" name="recibeComision" class="mt-0.5 size-4 accent-neutro-900" ${e.recibeComision ? 'checked' : ''}>
            <span><b class="block font-semibold">Recibe comisiones</b>Por cada servicio que atiende y cada producto que vende (las reglas están en Configuración).</span>
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            ${campo({ nombre: 'afpAdministradora', columna: 'afp_administradora', etiqueta: 'AFP', ayuda: 'Separa su planilla de AFP. Vacío solo si no cotiza (confirmar con el contador).', control: `<select id="f-afpAdministradora" name="afpAdministradora" aria-describedby="ayuda-afpAdministradora"><option value="">No cotiza</option>${Object.entries(AFP).map(([k, v]) => `<option value="${k}" ${e.afpAdministradora === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` })}
            ${campo({ nombre: 'nupAfp', columna: 'nup_afp', etiqueta: 'NUP de la AFP', control: entrada('nupAfp', e.nupAfp, 'inputmode="numeric" maxlength="12" placeholder="12 dígitos"') })}
            ${campo({ nombre: 'numeroIsss', columna: 'numero_isss', etiqueta: 'Número de ISSS', control: entrada('numeroIsss', e.numeroIsss, 'inputmode="numeric" maxlength="9" placeholder="9 dígitos"') })}
          </div>
        </fieldset>

        <fieldset data-campo="id_especialidad">
          <legend class="panel-titulo mb-1 w-full">Especialidades</legend>
          <p class="campo-ayuda mt-0 mb-3">Deciden qué servicios puede hacer: al agendar solo aparece en los de sus especialidades.</p>
          <div class="grid grid-cols-2 gap-2">
            ${estado.especialidades.map((x) => `
              <label class="flex cursor-pointer items-center gap-2 rounded-medio border border-borde-fuerte p-3 text-sm has-checked:border-neutro-900 has-checked:bg-fondo-sutil">
                <input type="checkbox" name="especialidades" value="${x.idEspecialidad}" class="size-4 accent-neutro-900" ${e.especialidades.includes(x.idEspecialidad) ? 'checked' : ''}>
                <span><b class="block font-semibold">${escapar(x.nombreEspecialidad)}</b><small class="text-13 text-texto-secundario">${serviciosDe(x.idEspecialidad)} servicios</small></span>
              </label>`).join('')}
          </div>
        </fieldset>

        <fieldset data-campo="horario">
          <legend class="panel-titulo mb-1 w-full">Horario</legend>
          <p class="campo-ayuda mt-0 mb-2">La agenda solo le ofrece estas horas. Agregue la tarde si sale a almorzar.</p>
          <div class="text-sm">${[1, 2, 3, 4, 5, 6, 7].map((d) => htmlFilaHorario(d, e.horarios.filter((b) => b.diaSemana === d).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)))).join('')}</div>
        </fieldset>
      </div>

      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar empleado</button>
        </div>
        <p class="text-center text-13 text-texto-secundario">El usuario para entrar al sistema se crea en Configuración.</p>
      </div>
    </form>`;

  const form = $('form-empleado');
  const pintarQuincena = () => {
    const s = Number(form.elements.sueldoBaseMensual.value);
    $('sueldo-quincena').textContent = s > 0 ? `Se paga ${dinero(s / 2)} cada quincena.` : 'Se paga la mitad cada quincena.';
  };
  pintarQuincena();
  form.addEventListener('input', (ev) => {
    estado.formularioSucio = true;
    if (ev.target.name === 'sueldoBaseMensual') pintarQuincena();
  });
  form.addEventListener('change', (ev) => {
    const m = ev.target.name?.match(/^trabaja-(\d)$/);
    if (!m) return;
    const fila = form.querySelector(`[data-dia="${m[1]}"]`);
    fila.querySelector('.bloques').classList.toggle('hidden', !ev.target.checked);
    fila.querySelector('.libre').classList.toggle('hidden', ev.target.checked);
    if (ev.target.checked) {
      const s = estado.horarioSalon.find((x) => x.diaSemana === Number(m[1]));
      const [ini, fin] = [form.elements[`ini1-${m[1]}`], form.elements[`fin1-${m[1]}`]];
      if (!ini.value) ini.value = s.horaAbre.slice(0, 5); // propone el horario del salón
      if (!fin.value) fin.value = s.horaCierra.slice(0, 5);
    }
  });
  form.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-accion="bloque2"]');
    if (!boton) return;
    const fila = form.querySelector(`[data-dia="${boton.dataset.dia}"]`);
    fila.querySelector('.bloque2').classList.replace('hidden', 'contents');
    boton.classList.add('hidden');
    form.elements[`ini2-${boton.dataset.dia}`].focus();
  });
  form.addEventListener('submit', (ev) => enviarFormulario(ev, empleado));
  $('f-nombreEmpleado').focus();
}

/** Lee y valida el formulario. Devuelve { datos, errores, erroresHorario }. */
function leerFormulario(form) {
  const v = (n) => form.elements[n].value.trim();
  const errores = {};
  const horarios = [];
  for (let d = 1; d <= 7; d++) {
    if (!form.elements[`trabaja-${d}`]?.checked) continue;
    horarios.push({ diaSemana: d, horaInicio: v(`ini1-${d}`), horaFin: v(`fin1-${d}`) });
    if (v(`ini2-${d}`) || v(`fin2-${d}`)) horarios.push({ diaSemana: d, horaInicio: v(`ini2-${d}`), horaFin: v(`fin2-${d}`) });
  }
  const datos = {
    nombreEmpleado: v('nombreEmpleado').replace(/\s+/g, ' '),
    apellido: v('apellido').replace(/\s+/g, ' '),
    dui: v('dui'),
    telefono: v('telefono'),
    correoEmpleado: v('correoEmpleado').toLowerCase() || null,
    fechaIngreso: v('fechaIngreso'),
    puesto: v('puesto'),
    sueldoBaseMensual: v('sueldoBaseMensual') === '' ? null : Number(v('sueldoBaseMensual')),
    recibeComision: form.elements.recibeComision.checked,
    afpAdministradora: v('afpAdministradora') || null,
    nupAfp: v('nupAfp').replace(/\D/g, '') || null,
    numeroIsss: v('numeroIsss').replace(/\D/g, '') || null,
    especialidades: [...form.querySelectorAll('[name="especialidades"]:checked')].map((c) => Number(c.value)),
    horarios,
  };

  if (!datos.nombreEmpleado) errores.nombreEmpleado = 'Escriba los nombres.';
  if (!datos.apellido) errores.apellido = 'Escriba los apellidos.';
  const dui = datos.dui.replace(/\D/g, '');
  if (!dui) errores.dui = 'Escriba el DUI.';
  else if (dui.length !== 9) errores.dui = 'El DUI tiene 9 dígitos: 00000000-0.';
  else datos.dui = `${dui.slice(0, 8)}-${dui.slice(8)}`;
  const tel = datos.telefono.replace(/\D/g, '');
  if (!datos.telefono) errores.telefono = 'Escriba el teléfono.';
  else if (tel.length < 8 || tel.length > 15) errores.telefono = 'Revise el teléfono: debe tener 8 dígitos.';
  else if (tel.length === 8 && !datos.telefono.startsWith('+')) datos.telefono = `${tel.slice(0, 4)}-${tel.slice(4)}`;
  if (datos.correoEmpleado && !form.elements.correoEmpleado.checkValidity()) errores.correoEmpleado = 'Revise el correo.';
  if (!datos.fechaIngreso) errores.fechaIngreso = 'Elija la fecha de ingreso.';
  if (!datos.puesto) errores.puesto = 'Escriba el puesto.';
  if (datos.sueldoBaseMensual === null) errores.sueldoBaseMensual = 'Escriba el salario (0 si no está en planilla).';
  else if (!(datos.sueldoBaseMensual >= 0) || datos.sueldoBaseMensual > 99999.99) errores.sueldoBaseMensual = 'Revise el salario.';
  else if (Math.abs(datos.sueldoBaseMensual * 100 - Math.round(datos.sueldoBaseMensual * 100)) > 1e-6) errores.sueldoBaseMensual = 'Use como máximo 2 decimales.';
  // AFP y NUP van juntos (check de tb_empleados)
  if (datos.afpAdministradora && !datos.nupAfp) errores.nupAfp = 'Escriba el NUP de la AFP.';
  else if (!datos.afpAdministradora && datos.nupAfp) errores.afpAdministradora = 'Elija la AFP de ese NUP.';
  else if (datos.nupAfp && datos.nupAfp.length !== 12) errores.nupAfp = 'El NUP tiene 12 dígitos.';
  if (datos.numeroIsss && datos.numeroIsss.length !== 9) errores.numeroIsss = 'El número de ISSS tiene 9 dígitos.';

  const erroresHorario = validarHorario(horarios, estado.horarioSalon);
  return { datos, errores, erroresHorario };
}

async function enviarFormulario(evento, empleado) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');

  const { datos, errores, erroresHorario } = leerFormulario(form);
  mostrarErrores(form, errores);
  for (let d = 1; d <= 7; d++) {
    const p = $(`error-horario-${d}`);
    p.textContent = erroresHorario[d] ?? '';
    p.classList.toggle('hidden', !erroresHorario[d]);
  }
  if (Object.keys(errores).length) return;
  const primerDia = Object.keys(erroresHorario)[0];
  if (primerDia) {
    form.elements[`ini1-${primerDia}`]?.focus();
    return;
  }

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const guardado = await guardarEmpleado(datos, empleado?.idEmpleado);
    estado.formularioSucio = false;
    await cargar();
    await mostrarFicha(guardado.idEmpleado, empleado ? 'Cambios guardados.' : 'Empleado guardado.');
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar empleado';
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  const sePuedeSalir = () => !estado.formularioSucio || confirm(SIN_CAMBIOS);

  $('buscar').addEventListener('input', (ev) => {
    estado.buscar = ev.target.value.trim();
    pintarLista();
  });

  $('filtros').addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-filtro]');
    if (!boton) return;
    estado.filtro = boton.dataset.filtro;
    pintarFiltros();
    pintarLista();
  });

  lista.addEventListener('click', (ev) => {
    const fila = ev.target.closest('[data-id]');
    if (!fila || !sePuedeSalir()) return;
    panel.abrir(fila);
    mostrarFicha(fila.dataset.id);
  });

  $('btn-nuevo').addEventListener('click', (ev) => {
    if (!sePuedeSalir()) return;
    estado.idSeleccionado = null;
    pintarLista();
    panel.abrir(ev.currentTarget);
    mostrarFormulario();
  });

  panelEl.addEventListener('click', (ev) => {
    switch (ev.target.closest('[data-accion]')?.dataset.accion) {
      case 'cerrar': panel.cerrar(); break;
      case 'editar': mostrarFormulario(panelEl.empleado); break;
      case 'pedir-baja': pedirBaja(); break;
      case 'cancelar-baja': mostrarFicha(estado.idSeleccionado); break;
      case 'cancelar':
        if (!sePuedeSalir()) return;
        estado.formularioSucio = false;
        if (estado.idSeleccionado) mostrarFicha(estado.idSeleccionado);
        else panel.cerrar();
        break;
      default:
    }
  });

  cargar();
}
