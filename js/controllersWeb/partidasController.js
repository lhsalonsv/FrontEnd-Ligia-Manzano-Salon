/**
 * partidasController.js — Ligia Manzano Salón
 * Contabilidad → Partidas contables. Una sola página con tres vistas según la URL:
 *   partidas.html                 la lista (año, mes, tipo, estado y búsqueda)
 *   partidas.html?id=5            el detalle: borrador (editar, aplicar, eliminar) o aplicada (anular, imprimir, Excel)
 *   partidas.html?nueva=1         el formulario de una partida nueva    ·    partidas.html?id=5&editar=1  de un borrador
 * Administrador y contador escriben; el auditor solo mira. Una partida aplicada no se cambia (art. 139 del Código Tributario).
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, fechaHora, fechaIso, MESES } from '../utils/formato.js';
import { campo, entrada, mostrarErrores, aviso } from '../utils/formulario.js';
import { crearXlsx, descargar } from '../utils/xlsx.js';
import { fechaDMY } from '../utils/hojas.js';
import {
  listarPartidas, obtenerPartida, crearPartida, actualizarPartida, eliminarPartida, aplicarPartida, anularPartida, listarEjercicios,
  listarTiposPartida, listarCuentas, mesesAbiertos, mesAbierto, totalesLineas,
} from '../services/contabilidadService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);
const vista = $('vista');

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const puedeEditar = Boolean(sesion && ['ADMINISTRADOR', 'CONTADOR'].includes(sesion.usuario.rol));
const params = new URLSearchParams(location.search);

const nombreMes = (anio, mes) => `${MESES[mes - 1]} de ${anio}`;
const BOTON = 'btn h-9 px-3 text-sm';
const volver = `<a href="partidas.html" class="${BOTON} btn-secundario">${icono('izquierda')}Partidas</a>`;
const sinAcceso = (texto) => { vista.innerHTML = aviso('aviso-error', 'alerta', texto) + volver; };

/** Borrador, Aplicada, "Anulada por 110002" o "Anulación de 110001" (la inversa). */
const insigniaEstado = (p) => (p.estado === 'BORRADOR' ? '<span class="insignia insignia-aviso">Borrador</span>'
  : p.numeroAnuladaPor ? `<span class="insignia insignia-error">Anulada por ${escapar(p.numeroAnuladaPor)}</span>`
    : p.numeroAnula ? `<span class="insignia insignia-apagada">Anulación de ${escapar(p.numeroAnula)}</span>` : '<span class="insignia insignia-ok">Aplicada</span>');

/** Los meses abiertos son seguidos: un rango para el campo de fecha (min, max, la fecha por defecto y el texto de ayuda). null si no hay. */
function rangoAbierto(ejercicios) {
  const abiertos = mesesAbiertos(ejercicios);
  if (!abiertos.length) return null;
  const [a, z] = [abiertos[0], abiertos.at(-1)];
  const min = `${a.anio}-${String(a.mes).padStart(2, '0')}-01`;
  const max = fechaIso(new Date(z.anio, z.mes, 0));
  const hoy = fechaIso();
  const texto = a === z ? nombreMes(a.anio, a.mes) : `${nombreMes(a.anio, a.mes)} a ${nombreMes(z.anio, z.mes)}`;
  return { min, max, texto, defecto: hoy < min ? min : hoy > max ? max : hoy };
}
const SIN_MESES = 'No hay meses abiertos: cree el ejercicio en Parámetros → Ejercicios y períodos.';

/** Por qué no se puede aplicar ('' si se puede): lo mismo que exige fn_aplicar_partida. `lineas` = las que tienen monto. */
function razonNoAplicable(lineas, anio, mes, ejercicios) {
  const t = totalesLineas(lineas);
  if (!mesAbierto(ejercicios, anio, mes)) return `El mes ${mes}/${anio} está cerrado.`;
  if (lineas.length < 2) return 'Se necesitan al menos 2 líneas.';
  if (t.diferencia !== 0) return `No cuadra: el debe y el haber difieren en ${dinero(Math.abs(t.diferencia))}.`;
  if (t.debe === 0) return 'La partida está en cero.';
  return '';
}

// --- Lista ---------------------------------------------------------------------------

const FILA_LISTA = 'grid grid-cols-[84px_84px_56px_minmax(0,1fr)_104px_104px_176px] items-center gap-x-3 px-4';
const lista = { filtros: { anio: '', mes: '', tipo: '', estado: '', buscar: '' }, pagina: 0, peticion: 0, temporizador: 0 };

const opciones = (pares, valor) => pares.map(([v, t]) => `<option value="${escapar(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${escapar(t)}</option>`).join('');
const filtro = (nombre, etiqueta, pares, valor) => `<label class="campo-caja h-9 min-h-0 text-sm"><span class="sr-only">${etiqueta}</span><select name="${nombre}" aria-label="${etiqueta}">${opciones(pares, valor)}</select></label>`;

function htmlFilaLista(p) {
  return `<a href="partidas.html?id=${p.idPartida}" class="${FILA_LISTA} min-h-12 border-b border-neutro-100 py-2 text-15 hover:bg-fondo-sutil">
    <span class="font-mono text-sm tabular-nums">${p.numero ? escapar(p.numero) : '—'}</span>
    <span class="tabular-nums">${fechaDMY(p.fecha)}</span>
    <span class="font-mono text-sm">${escapar(p.codigoTipo)}</span>
    <span class="truncate" title="${escapar(p.concepto)}">${escapar(p.concepto)}</span>
    <span class="text-right tabular-nums">${dinero(p.totalDebe)}</span>
    <span class="text-right tabular-nums">${dinero(p.totalHaber)}</span>
    <span>${insigniaEstado(p)}</span></a>`;
}

async function cargarLista({ mas = false } = {}) {
  lista.pagina = mas ? lista.pagina + 1 : 0;
  const idPeticion = ++lista.peticion;
  const f = lista.filtros;
  try {
    const { contenido, totalElementos } = await listarPartidas({ ...f, pagina: lista.pagina });
    if (idPeticion !== lista.peticion) return; // llegó una respuesta más nueva
    const filas = $('partidas-filas');
    if (mas) filas.insertAdjacentHTML('beforeend', contenido.map(htmlFilaLista).join(''));
    else filas.innerHTML = contenido.map(htmlFilaLista).join('');
    const vacia = filas.children.length === 0;
    $('partidas-estado').classList.toggle('hidden', !vacia);
    $('partidas-estado').textContent = f.buscar || f.mes || f.tipo || f.estado ? 'Ninguna partida coincide con estos filtros.' : 'No hay partidas en este año.';
    $('partidas-resumen').textContent = `${filas.children.length} de ${totalElementos} partidas`;
    $('cargar-mas').classList.toggle('hidden', filas.children.length >= totalElementos);
  } catch (e) {
    if (idPeticion !== lista.peticion) return;
    $('partidas-estado').classList.remove('hidden');
    $('partidas-estado').innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(e.message)}</p></div>`;
  }
}

async function verLista() {
  const [ejercicios, tipos] = await Promise.all([listarEjercicios(), listarTiposPartida()]);
  const anios = ejercicios.map((e) => e.anio).reverse();
  const actual = new Date().getFullYear();
  lista.filtros.anio = String(anios.includes(actual) ? actual : anios[0] ?? actual);
  const f = lista.filtros;
  const mensaje = { eliminada: 'Borrador eliminado.' }[params.get('aviso')];
  vista.innerHTML = `
    ${mensaje ? aviso('aviso-exito', 'info', mensaje) : ''}
    <form id="filtros" class="flex flex-col gap-3" role="search" aria-label="Filtrar partidas" novalidate>
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        ${filtro('anio', 'Año', anios.map((a) => [a, a]), f.anio)}
        ${filtro('mes', 'Mes', [['', 'Todos los meses'], ...MESES.map((m, i) => [i + 1, m[0].toUpperCase() + m.slice(1)])], f.mes)}
        ${filtro('tipo', 'Tipo', [['', 'Todos los tipos'], ...tipos.map((t) => [t.codigo, `${t.codigo} — ${t.nombre}`])], f.tipo)}
        ${filtro('estado', 'Estado', [['', 'Todos los estados'], ['BORRADOR', 'Borrador'], ['APLICADA', 'Aplicada']], f.estado)}
        ${puedeEditar ? `<a href="partidas.html?nueva=1" class="${BOTON} btn-primario col-span-2 sm:ml-auto">${icono('mas')}Nueva partida</a>` : ''}
      </div>
      <label class="campo-caja h-9 min-h-0 w-full text-sm sm:w-96">
        <span class="sr-only">Buscar por número o concepto</span>${icono('buscar')}
        <input name="buscar" type="search" placeholder="Buscar por número o concepto" autocomplete="off">
      </label>
    </form>
    <p id="partidas-resumen" class="text-13 text-texto-secundario tabular-nums" aria-live="polite"></p>
    <div class="tarjeta overflow-x-auto rounded-grande">
      <div class="min-w-[820px]">
        <div class="${FILA_LISTA} h-9 border-b border-borde-default bg-fondo-sutil text-13 font-semibold text-texto-secundario" aria-hidden="true">
          <span>No. partida</span><span>Fecha</span><span>Tipo</span><span>Concepto</span><span class="text-right">Debe</span><span class="text-right">Haber</span><span>Estado</span></div>
        <div id="partidas-filas"></div>
      </div>
      <div id="partidas-estado" class="hidden px-4 py-10 text-center text-texto-secundario"></div>
      <div id="cargar-mas" class="hidden border-t border-borde-default p-3 text-center"><button type="button" class="${BOTON} btn-secundario">Mostrar más</button></div>
    </div>`;
  const form = $('filtros');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', (e) => { if (e.target.name === 'buscar') return; lista.filtros[e.target.name] = e.target.value; cargarLista(); });
  form.addEventListener('input', (e) => {
    if (e.target.name !== 'buscar') return;
    clearTimeout(lista.temporizador);
    lista.temporizador = setTimeout(() => { lista.filtros.buscar = e.target.value.trim(); cargarLista(); }, 250);
  });
  $('cargar-mas').addEventListener('click', () => cargarLista({ mas: true }));
  cargarLista();
}

// --- Detalle ---------------------------------------------------------------------------

const FILA_LINEA = 'grid grid-cols-[36px_104px_minmax(0,1fr)_minmax(0,1fr)_112px_112px] items-center gap-x-3 px-4';
const dato = (etiqueta, valor) => `<div class="min-w-0"><dt class="text-13 text-texto-secundario">${etiqueta}</dt><dd class="font-medium">${valor}</dd></div>`;
const enlacePartida = (id, numero, texto) => `<a href="partidas.html?id=${id}" class="font-semibold underline decoration-borde-fuerte underline-offset-2">${texto} ${escapar(numero)}</a>`;
const AVISOS = {
  guardada: () => 'Borrador guardado.',
  aplicada: (p) => `Partida ${p.numero} aplicada.`,
  anulada: (p) => `Partida ${p.numero} creada y aplicada: anula la partida ${p.numeroAnula}.`,
};

function descargarExcel(p) {
  const filas = p.lineas.map((l) => [p.numero ?? 'Borrador', fechaDMY(p.fecha), p.codigoTipo, l.linea, l.codigoCuenta, l.nombreCuenta, l.concepto ?? p.concepto, l.debe, l.haber]);
  const archivo = crearXlsx([['Partida', 'Fecha', 'Tipo', 'Línea', 'Cuenta', 'Nombre de la cuenta', 'Concepto', 'Debe', 'Haber'], ...filas,
    ['', '', '', '', '', '', 'Totales', p.totalDebe, p.totalHaber]], { hoja: `Partida ${p.numero ?? 'borrador'}`, anchos: [12, 12, 8, 8, 14, 40, 44, 14, 14], totales: true });
  descargar(`partida-${p.codigoTipo}-${p.numero ?? p.idPartida}.xlsx`, archivo);
}

function htmlLineasDetalle(p) {
  const filas = p.lineas.map((l) => `<div class="${FILA_LINEA} min-h-11 border-b border-neutro-100 py-1 text-15">
    <span class="tabular-nums text-texto-secundario">${l.linea}</span><span class="font-mono text-sm">${escapar(l.codigoCuenta)}</span>
    <span class="truncate" title="${escapar(l.nombreCuenta)}">${escapar(l.nombreCuenta)}</span><span class="truncate" title="${escapar(l.concepto ?? '')}">${escapar(l.concepto ?? '')}</span>
    <span class="text-right tabular-nums">${l.debe ? dinero(l.debe) : ''}</span><span class="text-right tabular-nums">${l.haber ? dinero(l.haber) : ''}</span></div>`).join('');
  return `<div class="tarjeta overflow-x-auto rounded-grande"><div class="min-w-[720px]">
    <div class="${FILA_LINEA} h-9 border-b border-borde-default bg-fondo-sutil text-13 font-semibold text-texto-secundario" aria-hidden="true">
      <span>#</span><span>Cuenta</span><span>Nombre</span><span>Concepto</span><span class="text-right">Debe</span><span class="text-right">Haber</span></div>
    ${filas || '<p class="px-4 py-6 text-center text-texto-secundario">Todavía no tiene líneas.</p>'}
    <div class="${FILA_LINEA} h-11 font-semibold tabular-nums"><span></span><span></span><span></span><span class="text-right">Totales</span>
      <span class="text-right">${dinero(p.totalDebe)}</span><span class="text-right">${dinero(p.totalHaber)}</span></div>
  </div></div>`;
}

const panelEliminar = `<div class="aviso aviso-aviso flex-wrap items-center" role="alertdialog" aria-label="Confirmar">${icono('advertencia')}
  <p class="min-w-0 flex-1">¿Eliminar este borrador? Se borra con sus líneas y no se puede recuperar.</p>
  <span class="flex gap-2"><button type="button" class="${BOTON} btn-peligro" data-accion="eliminar-si">Eliminar borrador</button>
  <button type="button" class="${BOTON} btn-secundario" data-accion="panel-cerrar">Cancelar</button></span></div>`;

function panelAnular(p, rango) {
  return `<form id="form-anular" class="tarjeta flex max-w-xl flex-col gap-3 rounded-grande p-4 sm:p-5" novalidate>
    <h2 class="text-lg">Anular la partida ${escapar(p.codigoTipo)} ${escapar(p.numero)}</h2>
    <p class="text-13 text-texto-secundario">Se crea una partida inversa (debe y haber cambiados), ya aplicada y enlazada a esta. La original no se modifica (art. 139 del Código Tributario).</p>
    <div data-error class="aviso aviso-error hidden" role="alert"></div>
    ${campo({ nombre: 'motivo', columna: 'motivo', etiqueta: 'Motivo', obligatorio: true, control: entrada('motivo', '', 'maxlength="200" autocomplete="off"') })}
    ${campo({ nombre: 'fecha', columna: 'fecha', etiqueta: 'Fecha de la anulación', obligatorio: true, ayuda: `Debe estar en un mes abierto: ${rango.texto}.`, control: entrada('fecha', rango.defecto, `type="date" min="${rango.min}" max="${rango.max}" aria-describedby="ayuda-fecha"`) })}
    <div class="flex flex-wrap gap-2"><button type="submit" class="${BOTON} btn-peligro">Anular partida</button>
      <button type="button" class="${BOTON} btn-secundario" data-accion="panel-cerrar">Cancelar</button></div></form>`;
}

async function verDetalle(id) {
  let p, ejercicios;
  try {
    [p, ejercicios] = await Promise.all([obtenerPartida(id), listarEjercicios()]);
  } catch (e) { sinAcceso(e.message); return; }
  const rango = rangoAbierto(ejercicios);
  const aplicada = p.estado === 'APLICADA';
  const anulable = aplicada && !p.numeroAnuladaPor && !p.numeroAnula;
  const razon = !aplicada ? razonNoAplicable(p.lineas.filter((l) => l.debe || l.haber), p.anio, p.mes, ejercicios) : '';
  let panel = null; // 'eliminar' | 'anular'
  const mensaje = AVISOS[params.get('aviso')]?.(p);

  const pintar = () => {
    vista.innerHTML = `
      <div class="flex flex-wrap items-center gap-3">${volver}
        <h2 class="text-xl">${p.numero ? `Partida ${escapar(p.codigoTipo)} ${escapar(p.numero)}` : 'Partida en borrador'}</h2>${insigniaEstado(p)}</div>
      <div id="mensaje">${mensaje ? aviso('aviso-exito', 'info', mensaje) : ''}</div>
      <div class="flex flex-wrap items-center gap-2">
        ${!aplicada && puedeEditar ? `<a href="partidas.html?id=${p.idPartida}&editar=1" class="${BOTON} btn-secundario">Editar</a>
          <button type="button" class="${BOTON} btn-primario" data-accion="aplicar" ${razon ? 'disabled aria-describedby="razon-aplicar"' : ''}>Aplicar</button>
          <button type="button" class="${BOTON} btn-secundario" data-accion="panel-eliminar">Eliminar</button>` : ''}
        ${anulable && puedeEditar ? `<button type="button" class="${BOTON} btn-secundario" data-accion="panel-anular">Anular</button>` : ''}
        ${aplicada ? `<a href="partida-imprimir.html?id=${p.idPartida}" class="${BOTON} btn-secundario">${icono('imprimir')}Imprimir</a>
          <button type="button" class="${BOTON} btn-secundario" data-accion="excel">${icono('descargar')}Excel</button>` : ''}
        ${razon && puedeEditar ? `<p id="razon-aplicar" class="text-13 text-texto-secundario">No se puede aplicar. ${escapar(razon)}</p>` : ''}
      </div>
      ${panel === 'eliminar' ? panelEliminar : ''}${panel === 'anular' ? (rango ? panelAnular(p, rango) : aviso('aviso-aviso', 'advertencia', SIN_MESES)) : ''}
      <section class="tarjeta rounded-grande p-4 sm:p-5" aria-label="Encabezado de la partida"><dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        ${dato('Número', p.numero ? `<span class="font-mono">${escapar(p.numero)}</span>` : 'Borrador')}
        ${dato('Fecha', fechaDMY(p.fecha))}
        ${dato('Período', `<span class="first-letter:uppercase">${nombreMes(p.anio, p.mes)}</span>`)}
        ${dato('Tipo', `${escapar(p.codigoTipo)} — ${escapar(p.nombreTipo)}`)}
        ${dato('Estado', insigniaEstado(p))}
        ${dato('Creada por', `${escapar(p.creadoPor)}<span class="block text-13 font-normal text-texto-secundario">${fechaHora(p.creadoEn)}</span>`)}
        ${aplicada ? dato('Aplicada por', `${escapar(p.aplicadaPor)}<span class="block text-13 font-normal text-texto-secundario">${fechaHora(p.aplicadaEn)}</span>`) : ''}
        ${p.numeroAnuladaPor ? dato('Anulada por', enlacePartida(p.idPartidaAnuladaPor, p.numeroAnuladaPor, 'Partida')) : ''}
        ${p.numeroAnula ? dato('Anula', enlacePartida(p.idPartidaAnula, p.numeroAnula, 'Partida')) : ''}
        <div class="min-w-0 sm:col-span-2 lg:col-span-4"><dt class="text-13 text-texto-secundario">Concepto</dt><dd class="font-medium">${escapar(p.concepto)}</dd></div>
      </dl></section>
      ${htmlLineasDetalle(p)}`;
  };

  const error = (e) => { $('mensaje').innerHTML = aviso('aviso-error', 'alerta', e.message); };
  vista.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (!accion) return;
    if (accion === 'excel') descargarExcel(p);
    else if (accion.startsWith('panel')) { panel = accion === 'panel-eliminar' ? 'eliminar' : accion === 'panel-anular' ? 'anular' : null; pintar(); }
    else if (accion === 'aplicar' || accion === 'eliminar-si') {
      e.target.closest('button').disabled = true;
      try {
        if (accion === 'aplicar') { await aplicarPartida(p.idPartida); location.href = `partidas.html?id=${p.idPartida}&aviso=aplicada`; }
        else { await eliminarPartida(p.idPartida); location.href = 'partidas.html?aviso=eliminada'; }
      } catch (err) { error(err); e.target.closest('button').disabled = false; }
    }
  });
  vista.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const banner = form.querySelector('[data-error]');
    const datos = { motivo: form.elements.motivo.value.trim().replace(/\s+/g, ' '), fecha: form.elements.fecha.value };
    banner.classList.add('hidden');
    mostrarErrores(form, { ...(datos.motivo ? {} : { motivo: 'Escriba el motivo de la anulación.' }), ...(datos.fecha ? {} : { fecha: 'Elija la fecha de la anulación.' }) });
    if (!datos.motivo || !datos.fecha) return;
    const boton = form.querySelector('[type="submit"]');
    boton.disabled = true;
    try {
      const inversa = await anularPartida(p.idPartida, datos);
      location.href = `partidas.html?id=${inversa.idPartida}&aviso=anulada`;
    } catch (err) {
      if (err.detalle?.campos) mostrarErrores(form, err.detalle.campos);
      banner.innerHTML = `${icono('alerta')}<p>${escapar(err.message)}</p>`;
      banner.classList.remove('hidden');
      boton.disabled = false;
    }
  });
  pintar();
}

// --- Formulario (nueva / editar borrador) ------------------------------------------------

const CAMPO_LINEA = 'min-w-0';
function htmlLineaForm(l = {}) {
  const monto = (n) => (n ? String(n) : '');
  return `<div class="grid gap-2 rounded-chico border border-borde-default p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_112px_112px_36px] md:items-start md:rounded-none md:border-0 md:p-0" data-linea>
    <div class="${CAMPO_LINEA}" data-campo="codigo_cuenta"><label class="campo-etiqueta md:hidden">Cuenta</label>
      <span class="campo-caja"><input name="codigoCuenta" list="lista-cuentas" value="${escapar(l.codigoCuenta ?? '')}" inputmode="numeric" autocomplete="off" class="font-mono" aria-label="Cuenta"></span>
      <small data-nombre class="mt-0.5 block truncate text-13 text-texto-secundario"></small></div>
    <div class="${CAMPO_LINEA}" data-campo="concepto"><label class="campo-etiqueta md:hidden">Concepto de la línea</label>
      <span class="campo-caja"><input name="conceptoLinea" value="${escapar(l.concepto ?? '')}" maxlength="300" autocomplete="off" aria-label="Concepto de la línea"></span></div>
    <div class="${CAMPO_LINEA}" data-campo="debe"><label class="campo-etiqueta md:hidden">Debe</label>
      <span class="campo-caja"><input name="debe" type="number" min="0" step="0.01" inputmode="decimal" value="${monto(l.debe)}" class="text-right tabular-nums" aria-label="Debe"></span></div>
    <div class="${CAMPO_LINEA}" data-campo="haber"><label class="campo-etiqueta md:hidden">Haber</label>
      <span class="campo-caja"><input name="haber" type="number" min="0" step="0.01" inputmode="decimal" value="${monto(l.haber)}" class="text-right tabular-nums" aria-label="Haber"></span></div>
    <button type="button" data-accion="quitar" class="btn btn-secundario h-9 w-full px-0 md:size-9" aria-label="Quitar línea">${icono('cerrar')}</button>
  </div>`;
}

async function verFormulario(id) {
  let existente = null;
  const [cuentas, tipos, ejercicios] = await Promise.all([listarCuentas(), listarTiposPartida(), listarEjercicios()]);
  if (id) {
    existente = await obtenerPartida(id);
    if (existente.estado !== 'BORRADOR') {
      vista.innerHTML = `${aviso('aviso-error', 'alerta', `La partida ${existente.numero} está aplicada: no se modifica (art. 139 del Código Tributario). Anúlela con una partida inversa.`)}${volver}`;
      return;
    }
  }
  const rango = rangoAbierto(ejercicios);
  if (!rango) { sinAcceso(SIN_MESES); return; }
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
  const movimiento = cuentas.filter((c) => c.aceptaMovimiento && c.activa);
  const predeterminado = tipos.find((t) => t.predeterminado)?.codigo ?? '';
  const codigoTipo = existente?.codigoTipo ?? predeterminado;
  const lineas = existente?.lineas.length ? existente.lineas : [{}, {}];
  const estado = { id: existente?.idPartida ?? null };
  const tipoOpciones = tipos.filter((t) => t.activo || t.codigo === codigoTipo).map((t) => [t.codigo, `${t.codigo} — ${t.nombre}`]);

  vista.innerHTML = `
    <div class="flex flex-wrap items-center gap-3">${volver}<h2 class="text-xl">${existente ? 'Editar borrador' : 'Nueva partida'}</h2></div>
    <form id="form-partida" class="flex flex-col gap-4" novalidate>
      <div data-error class="aviso aviso-error hidden" role="alert"></div>
      <div class="tarjeta grid gap-4 rounded-grande p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[200px_240px_minmax(0,1fr)]">
        ${campo({ nombre: 'fecha', columna: 'fecha', etiqueta: 'Fecha', obligatorio: true, ayuda: `Meses abiertos: ${rango.texto}.`, control: entrada('fecha', existente?.fecha ?? rango.defecto, `type="date" min="${rango.min}" max="${rango.max}" aria-describedby="ayuda-fecha"`) })}
        ${campo({ nombre: 'codigoTipo', columna: 'codigo_tipo', etiqueta: 'Tipo', obligatorio: true, control: `<select id="f-codigoTipo" name="codigoTipo">${opciones(tipoOpciones, codigoTipo)}</select>` })}
        <div class="sm:col-span-2 lg:col-span-1">${campo({ nombre: 'concepto', columna: 'concepto', etiqueta: 'Concepto', obligatorio: true, control: entrada('concepto', existente?.concepto ?? '', 'maxlength="300" autocomplete="off"') })}</div>
      </div>
      <div id="aviso-atraso" class="aviso aviso-aviso hidden" role="status"></div>
      <section class="tarjeta flex flex-col gap-3 rounded-grande p-4 sm:p-5" aria-label="Líneas de la partida">
        <div class="flex items-center gap-3"><h2 class="text-lg">Líneas</h2>
          <button type="button" class="${BOTON} btn-secundario ml-auto" data-accion="agregar">${icono('mas')}Agregar línea</button></div>
        <datalist id="lista-cuentas">${movimiento.map((c) => `<option value="${escapar(c.codigo)}">${escapar(c.nombre)}</option>`).join('')}</datalist>
        <div class="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_112px_112px_36px] gap-2 text-13 font-semibold text-texto-secundario md:grid" aria-hidden="true">
          <span>Cuenta (código o nombre)</span><span>Concepto de la línea</span><span class="text-right">Debe</span><span class="text-right">Haber</span><span></span></div>
        <div id="lineas" class="flex flex-col gap-3 md:gap-2">${lineas.map(htmlLineaForm).join('')}</div>
        <p class="campo-error hidden" id="error-lineas"></p>
      </section>
      <div id="totales" class="flex flex-wrap items-center gap-x-8 gap-y-1 rounded-chico border px-4 py-3 tabular-nums" aria-live="polite"></div>
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" value="guardar" class="btn btn-secundario">Guardar borrador</button>
        <button type="submit" value="aplicar" id="aplicar" class="btn btn-primario" aria-describedby="razon-aplicar">Guardar y aplicar</button>
        <a href="${existente ? `partidas.html?id=${existente.idPartida}` : 'partidas.html'}" class="btn btn-secundario">Cancelar</a>
        <p id="razon-aplicar" class="min-w-0 text-13 text-texto-secundario"></p>
      </div>
    </form>`;

  const form = $('form-partida');
  const filas = () => [...form.querySelectorAll('[data-linea]')];
  const leer = (fila) => ({
    codigoCuenta: fila.querySelector('[name="codigoCuenta"]').value.trim(), concepto: fila.querySelector('[name="conceptoLinea"]').value.trim(),
    debe: Number(fila.querySelector('[name="debe"]').value) || 0, haber: Number(fila.querySelector('[name="haber"]').value) || 0,
  });
  const leerLineas = () => filas().map(leer).filter((l) => l.codigoCuenta || l.concepto || l.debe || l.haber);

  function refrescar() {
    for (const fila of filas()) {
      const codigo = fila.querySelector('[name="codigoCuenta"]').value.trim();
      const c = porCodigo.get(codigo);
      const texto = !codigo ? '' : !c ? 'No existe una cuenta con ese código.' : !c.aceptaMovimiento || !c.activa ? `La cuenta ${codigo} no acepta movimiento o está inactiva.` : c.nombre;
      const nombre = fila.querySelector('[data-nombre]');
      nombre.textContent = texto;
      nombre.classList.toggle('text-estado-error', Boolean(codigo) && !(c?.aceptaMovimiento && c.activa));
    }
    const conMonto = leerLineas().filter((l) => l.debe || l.haber);
    const t = totalesLineas(conMonto);
    const totales = $('totales');
    totales.className = `flex flex-wrap items-center gap-x-8 gap-y-1 rounded-chico border px-4 py-3 tabular-nums ${t.diferencia ? 'border-estado-error bg-estado-error-fondo text-estado-error' : 'border-borde-default'}`;
    totales.innerHTML = `<span>Debe <b class="font-semibold">${dinero(t.debe)}</b></span><span>Haber <b class="font-semibold">${dinero(t.haber)}</b></span>
      <span>Diferencia <b class="font-semibold">${dinero(t.diferencia)}</b></span>${t.diferencia ? '<span class="font-semibold">No cuadra</span>' : conMonto.length ? '<span>Cuadra</span>' : ''}`;

    const fecha = form.elements.fecha.value;
    const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
    const [anio, mes] = valida ? [Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7))] : [0, 0];
    const cerrado = valida && !mesAbierto(ejercicios, anio, mes);
    const errorFecha = $('error-fecha');
    errorFecha.textContent = cerrado ? `El mes ${mes}/${anio} está cerrado o no existe.` : '';
    errorFecha.classList.toggle('hidden', !cerrado);
    // El art. 139 del Código Tributario deja registrar hasta 2 meses después: se avisa, no se bloquea
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 2);
    const atraso = valida && fecha < fechaIso(limite);
    $('aviso-atraso').classList.toggle('hidden', !atraso);
    $('aviso-atraso').classList.toggle('flex', atraso);
    if (atraso) $('aviso-atraso').innerHTML = `${icono('advertencia')}<p>El art. 139 del Código Tributario permite hasta 2 meses de atraso.</p>`;

    const razon = valida ? razonNoAplicable(conMonto, anio, mes, ejercicios) : 'Elija la fecha.';
    $('aplicar').disabled = Boolean(razon);
    $('razon-aplicar').textContent = razon ? `No se puede aplicar todavía. ${razon}` : '';
  }

  form.addEventListener('input', (e) => {
    const fila = e.target.closest('[data-linea]');
    if (fila && ['debe', 'haber'].includes(e.target.name) && Number(e.target.value) > 0) fila.querySelector(`[name="${e.target.name === 'debe' ? 'haber' : 'debe'}"]`).value = '';
    refrescar();
  });
  form.addEventListener('click', (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'agregar') {
      $('lineas').insertAdjacentHTML('beforeend', htmlLineaForm());
      $('lineas').lastElementChild.querySelector('input').focus();
    } else if (accion === 'quitar') {
      e.target.closest('[data-linea]').remove();
      if (!filas().length) $('lineas').insertAdjacentHTML('beforeend', htmlLineaForm());
    } else return;
    refrescar();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const aplicar = e.submitter?.value === 'aplicar';
    const banner = form.querySelector('[data-error]');
    const botones = form.querySelectorAll('[type="submit"]');
    banner.classList.add('hidden');
    mostrarErrores(form, {});
    $('error-lineas').classList.add('hidden');
    for (const b of botones) b.disabled = true;
    let guardada = false;
    try {
      const datos = { fecha: form.elements.fecha.value, codigoTipo: form.elements.codigoTipo.value, concepto: form.elements.concepto.value.trim().replace(/\s+/g, ' '),
        lineas: leerLineas() };
      const resultado = estado.id ? await actualizarPartida(estado.id, datos) : await crearPartida(datos);
      estado.id = resultado.idPartida;
      guardada = true;
      if (aplicar) await aplicarPartida(estado.id);
      location.href = `partidas.html?id=${estado.id}&aviso=${aplicar ? 'aplicada' : 'guardada'}`;
    } catch (err) {
      const { lineas: errorLineas, ...campos } = err.detalle?.campos ?? {};
      mostrarErrores(form, campos);
      if (errorLineas) { $('error-lineas').textContent = errorLineas; $('error-lineas').classList.remove('hidden'); }
      banner.innerHTML = `${icono('alerta')}<p>${escapar(err.message)}${guardada ? ' El borrador quedó guardado.' : ''}</p>`;
      banner.classList.remove('hidden');
      for (const b of botones) b.disabled = false;
      refrescar();
    }
  });
  refrescar();
}

// --- Arranque -----------------------------------------------------------------------------

async function iniciar() {
  const id = params.get('id');
  try {
    if (params.has('nueva') || (id && params.has('editar'))) {
      if (!puedeEditar) sinAcceso('El auditor puede ver las partidas, pero no crearlas ni cambiarlas.');
      else await verFormulario(id && /^\d+$/.test(id) ? id : null);
    } else if (id) await verDetalle(id);
    else await verLista();
  } catch (e) {
    sinAcceso(e.message);
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">La contabilidad es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  if (!puedeEditar) {
    $('aviso-solo-lectura').classList.remove('hidden');
    $('aviso-solo-lectura').classList.add('flex');
    $('aviso-solo-lectura').innerHTML = `${icono('candado')}<p>Estás como auditor: puedes ver todo, pero no cambiar nada.</p>`;
  }
  iniciar();
}
