/**
 * contabilidadParametrosController.js — Ligia Manzano Salón
 * Contabilidad → Parámetros, en 4 pestañas: plan de cuentas (árbol por código), ejercicios y períodos,
 * tipos de partida y configuración contable. Administrador y contador editan; el auditor solo mira.
 */
import '../utils/estilos.js'; // sangrías del árbol (la CSP bloquea style="…")
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, fechaCorta, dinero, MESES } from '../utils/formato.js';
import { centavos } from '../utils/calculos.js';
import { resultadoMes } from '../utils/reportesContables.js';
import { campo, entrada, mostrarErrores, aviso } from '../utils/formulario.js';
import { crearXlsx, descargar } from '../utils/xlsx.js';
import {
  listarCuentas, crearCuenta, actualizarCuenta, listarEjercicios, crearEjercicio, cerrarPeriodo, reabrirPeriodo,
  listarTiposPartida, guardarTipo, obtenerConfiguracion, guardarConfiguracion, mesPorCerrar, mesPorReabrir, TIPOS_CUENTA,
  listarPartidas, obtenerSaldos, generarPartidaCierre, cerrarEjercicio,
} from '../services/contabilidadService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);
const dialogo = $('dialogo');

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const puedeEditar = Boolean(sesion && ['ADMINISTRADOR', 'CONTADOR'].includes(sesion.usuario.rol));

const estado = {
  pestana: 'cuentas', cuentas: [], filas: [], conHijas: new Set(), contraidas: new Set(), tipo: 'TODOS', buscar: '',
  ejercicios: [], confirmar: null, confirmarCierre: null, cierres: {}, avisoPeriodos: null, tipos: [], config: null,
};

const FILA_TIPO = 'grid grid-cols-[64px_minmax(0,1fr)_120px_80px_72px] items-center gap-x-3 px-4';
const BOTON_FILA = 'cursor-pointer text-sm font-semibold underline decoration-borde-fuerte underline-offset-2';
const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const casilla = (nombre, columna, texto, marcada, ayuda = '') => `<div data-campo="${columna}">
  <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="f-${nombre}" name="${nombre}" class="mt-0.5 size-4 accent-neutro-900" ${marcada ? 'checked' : ''}><span>${texto}${ayuda ? ` <span class="text-texto-secundario">${ayuda}</span>` : ''}</span></label>
  <p class="campo-error hidden" id="error-${nombre}"></p></div>`;
const selector = (nombre, opciones, valor, extra = '') => `<select id="f-${nombre}" name="${nombre}" ${extra}>${opciones.map(([v, t]) => `<option value="${escapar(v)}" ${v === valor ? 'selected' : ''}>${escapar(t)}</option>`).join('')}</select>`;

// --- Ventana (nuevo / editar) ---------------------------------------------------

function abrirDialogo({ titulo, subtitulo = '', cuerpo, guardar }) {
  dialogo.innerHTML = `
    <form class="flex max-h-[calc(100dvh-2rem)] flex-col" novalidate>
      <div class="flex items-start gap-3 px-6 pt-6 pb-2">
        <div class="min-w-0"><h2 id="dialogo-titulo" class="text-xl">${escapar(titulo)}</h2><p class="text-sm text-texto-secundario">${subtitulo}</p></div>
        <button type="button" data-accion="cerrar-dialogo" class="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-chico text-texto-secundario hover:bg-fondo-sutil" aria-label="Cerrar">${icono('cerrar')}</button>
      </div>
      <div class="flex flex-col gap-4 overflow-y-auto px-6 py-3">
        <div data-error class="aviso aviso-error hidden" role="alert"></div>
        ${cuerpo}
      </div>
      <div class="grid grid-cols-2 gap-3 border-t border-borde-default px-6 pt-4 pb-6">
        <button type="button" class="btn btn-secundario" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="btn btn-primario">Guardar</button>
      </div>
    </form>`;
  dialogo.guardar = guardar;
  dialogo.showModal();
  dialogo.querySelector('input:not([readonly]), select')?.focus();
}

const cerrarDialogo = () => { dialogo.close(); dialogo.innerHTML = ''; dialogo.guardar = null; };

/** Manda el formulario; si el backend rechaza, deja el mensaje (y los campos) en la ventana. */
async function enviarDialogo(form) {
  const error = form.querySelector('[data-error]');
  const boton = form.querySelector('[type="submit"]');
  error.classList.add('hidden');
  mostrarErrores(form, {});
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const despues = await dialogo.guardar(form);
    cerrarDialogo();
    await despues();
  } catch (e) {
    if (e.detalle?.campos) mostrarErrores(form, e.detalle.campos);
    error.innerHTML = `${icono('alerta')}<p>${escapar(e.message)}</p>`;
    error.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

const texto = (form, nombre) => form.elements[nombre].value.trim().replace(/\s+/g, ' ');

// --- Pestaña 1: plan de cuentas -------------------------------------------------

const CHIPS = [['TODOS', 'Todos'], ['ACTIVO', 'Activo'], ['PASIVO', 'Pasivo'], ['CAPITAL', 'Capital'], ['INGRESO', 'Ingreso'], ['COSTO_GASTO', 'Costos y gastos'], ['LIQUIDADORA', 'Liquidadora']];
const CABECERA_CUENTAS = ['Código', 'Nombre', 'Tipo', 'Naturaleza', 'Movimiento', 'Activa', ''];

function prepararCuentas(cuentas) {
  // Orden de árbol: por código como texto, cada hija queda debajo de su padre (1, 11, 1101, 110101, 12, 2…),
  // venga como venga de la API (el catálogo se cargó por nivel)
  estado.cuentas = cuentas.toSorted((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  estado.filas = estado.cuentas.map((c) => ({ c, texto: sinTildes(`${c.codigo} ${c.nombre}`) }));
  estado.conHijas = new Set(estado.cuentas.map((c) => c.codigoPadre).filter(Boolean));
}

/** Sin filtro: el árbol con los grupos contraídos escondiendo a sus descendientes. Con filtro: solo las que coinciden. */
function cuentasVisibles() {
  const q = sinTildes(estado.buscar.trim());
  if (q || estado.tipo !== 'TODOS') return { filtrando: true, filas: estado.filas.filter((f) => (estado.tipo === 'TODOS' || f.c.tipo === estado.tipo) && f.texto.includes(q)) };
  const filas = [];
  const escondidas = new Set(); // grupos contraídos y lo que cuelga de ellos (el plan viene por código: el padre va antes que sus hijas)
  for (const f of estado.filas) {
    if (escondidas.has(f.c.codigoPadre)) { escondidas.add(f.c.codigo); continue; }
    filas.push(f);
    if (estado.contraidas.has(f.c.codigo)) escondidas.add(f.c.codigo);
  }
  return { filtrando: false, filas };
}

function htmlCuenta(c, filtrando) {
  const grupo = estado.conHijas.has(c.codigo);
  const contraida = estado.contraidas.has(c.codigo);
  const flecha = grupo && !filtrando
    ? `<button type="button" data-alternar="${c.codigo}" class="grid size-6 shrink-0 cursor-pointer place-items-center rounded-chico hover:bg-fondo-sutil" aria-expanded="${!contraida}" aria-label="${contraida ? 'Expandir' : 'Contraer'} ${escapar(c.nombre)}">${icono(contraida ? 'derecha' : 'abajo', 'size-4')}</button>`
    : '<span class="size-6 shrink-0"></span>';
  return `<div class="fila-cta min-h-10 border-b border-neutro-100 py-1 text-15 ${c.activa ? '' : 'text-texto-secundario'}">
    <span class="font-mono text-sm tabular-nums">${c.codigo}</span>
    <span class="flex min-w-0 items-center gap-1" data-estilo="padding-left:${c.nivel * 14}px">${flecha}<span class="line-clamp-2 min-w-0 break-words ${c.aceptaMovimiento ? '' : 'font-semibold'}" title="${escapar(c.nombre)}">${escapar(c.nombre)}</span></span>
    <span class="text-13">${TIPOS_CUENTA[c.tipo]}</span>
    <span class="text-13">${c.naturaleza === 'D' ? 'Deudora' : 'Acreedora'}</span>
    <span>${c.aceptaMovimiento ? 'Sí' : '—'}</span>
    <span>${c.activa ? 'Sí' : '<span class="insignia insignia-apagada">No</span>'}</span>
    <span class="text-right">${puedeEditar ? `<button type="button" data-editar="${c.codigo}" class="${BOTON_FILA}" aria-label="Editar ${escapar(c.nombre)}">Editar</button>` : ''}</span>
  </div>`;
}

function pintarCuentas() {
  const { filtrando, filas } = cuentasVisibles();
  $('cuentas-lista').innerHTML = filas.map((f) => htmlCuenta(f.c, filtrando)).join('');
  $('cuentas-estado').classList.toggle('hidden', filas.length > 0);
  $('cuentas-estado').textContent = 'Ninguna cuenta coincide con la búsqueda.';
  $('cuentas-resumen').textContent = filtrando
    ? `${filas.length} de ${estado.cuentas.length} cuentas`
    : `${estado.cuentas.length} cuentas. Las que están en negrita son agrupadoras: suman a sus subcuentas y no reciben partidas.`;
}

const contraerTodo = () => { estado.contraidas = new Set(estado.cuentas.filter((c) => c.nivel >= 1 && estado.conHijas.has(c.codigo)).map((c) => c.codigo)); };

function descargarCuentas() {
  const filas = estado.cuentas.map((c) => [c.codigo, c.nombre, TIPOS_CUENTA[c.tipo], c.naturaleza === 'D' ? 'Deudora' : 'Acreedora', c.nivel, c.codigoPadre ?? '', c.aceptaMovimiento ? 'Sí' : 'No', c.activa ? 'Sí' : 'No']);
  const archivo = crearXlsx([['Código', 'Nombre', 'Tipo', 'Naturaleza', 'Nivel', 'Cuenta padre', 'Acepta movimiento', 'Activa'], ...filas], { hoja: 'Plan de cuentas', anchos: [14, 56, 16, 12, 8, 14, 18, 8] });
  descargar('plan-de-cuentas.xlsx', archivo);
}

function abrirCuentaNueva() {
  const agrupadoras = estado.cuentas.filter((c) => !c.aceptaMovimiento);
  abrirDialogo({
    titulo: 'Nueva cuenta', subtitulo: 'Los campos con * son obligatorios',
    cuerpo: `
      <datalist id="lista-padres">${agrupadoras.map((c) => `<option value="${c.codigo}">${escapar(c.nombre)}</option>`).join('')}</datalist>
      ${campo({ nombre: 'codigoPadre', columna: 'codigo_padre', etiqueta: 'Cuenta padre', ayuda: 'Solo las agrupadoras (que no aceptan movimiento). Déjela vacía para una cuenta de nivel 0.', control: entrada('codigoPadre', '', 'list="lista-padres" inputmode="numeric" autocomplete="off" aria-describedby="ayuda-codigoPadre"') })}
      ${campo({ nombre: 'codigo', columna: 'codigo', etiqueta: 'Código', obligatorio: true, ayuda: 'Debe empezar con el código del padre y ser más largo. No se cambia después.', control: entrada('codigo', '', 'maxlength="12" inputmode="numeric" autocomplete="off" class="font-mono" aria-describedby="ayuda-codigo"') })}
      ${campo({ nombre: 'nombre', columna: 'nombre', etiqueta: 'Nombre', obligatorio: true, control: entrada('nombre', '', 'maxlength="150" autocomplete="off"') })}
      <div class="grid gap-4 sm:grid-cols-3">
        ${campo({ nombre: 'tipo', columna: 'tipo', etiqueta: 'Tipo', obligatorio: true, control: selector('tipo', Object.entries(TIPOS_CUENTA), 'ACTIVO') })}
        ${campo({ nombre: 'naturaleza', columna: 'naturaleza', etiqueta: 'Naturaleza', obligatorio: true, control: selector('naturaleza', [['D', 'Deudora'], ['A', 'Acreedora']], 'D') })}
        ${campo({ nombre: 'nivel', columna: 'nivel', etiqueta: 'Nivel', obligatorio: true, control: entrada('nivel', '0', 'type="number" min="0" max="9" step="1" class="tabular-nums"') })}
      </div>
      ${casilla('aceptaMovimiento', 'acepta_movimiento', 'Acepta movimiento', true, '(cuenta de detalle: recibe partidas)')}`,
    guardar: async (form) => {
      const datos = { codigoPadre: texto(form, 'codigoPadre') || null, codigo: texto(form, 'codigo'), nombre: texto(form, 'nombre'), tipo: form.elements.tipo.value,
        naturaleza: form.elements.naturaleza.value, nivel: Number(form.elements.nivel.value), aceptaMovimiento: form.elements.aceptaMovimiento.checked };
      await crearCuenta(datos);
      return () => cargarCuentas(`Cuenta ${datos.codigo} creada.`);
    },
  });
  const form = dialogo.querySelector('form');
  // Al elegir el padre se sugieren el tipo, la naturaleza, el nivel y el comienzo del código
  form.elements.codigoPadre.addEventListener('input', (e) => {
    const padre = estado.cuentas.find((c) => c.codigo === e.target.value.trim());
    if (!padre) return;
    form.elements.tipo.value = padre.tipo;
    form.elements.naturaleza.value = padre.naturaleza;
    form.elements.nivel.value = padre.nivel + 1;
    if (!form.elements.codigo.value.startsWith(padre.codigo)) form.elements.codigo.value = padre.codigo;
  });
}

function abrirCuentaEditar(codigo) {
  const c = estado.cuentas.find((x) => x.codigo === codigo);
  abrirDialogo({
    titulo: c.nombre, subtitulo: `<span class="font-mono">${c.codigo}</span> · ${TIPOS_CUENTA[c.tipo]} · ${c.naturaleza === 'D' ? 'deudora' : 'acreedora'}. El código no se cambia.`,
    cuerpo: `
      ${campo({ nombre: 'nombre', columna: 'nombre', etiqueta: 'Nombre', obligatorio: true, control: entrada('nombre', c.nombre, 'maxlength="150" autocomplete="off"') })}
      ${casilla('aceptaMovimiento', 'acepta_movimiento', 'Acepta movimiento', c.aceptaMovimiento, estado.conHijas.has(c.codigo) ? '(tiene subcuentas: no puede aceptar movimiento)' : '')}
      ${casilla('activa', 'activa', 'Activa', c.activa, '(una cuenta inactiva no se borra: sus partidas quedan)')}`,
    guardar: async (form) => {
      await actualizarCuenta(codigo, { nombre: texto(form, 'nombre'), aceptaMovimiento: form.elements.aceptaMovimiento.checked, activa: form.elements.activa.checked });
      return () => cargarCuentas('Cuenta guardada.');
    },
  });
}

async function cargarCuentas(mensaje) {
  try {
    prepararCuentas(await listarCuentas());
    if (!cargadas.has('cuentas')) { contraerTodo(); cargadas.add('cuentas'); } // solo la primera vez: después se respeta lo que la persona expandió
    pintarCuentas();
    if (mensaje) $('cuentas-resumen').textContent = mensaje;
  } catch (e) {
    $('cuentas-lista').innerHTML = '';
    $('cuentas-estado').classList.remove('hidden');
    $('cuentas-estado').innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(e.message)}</p></div>`;
  }
}

// --- Pestaña 2: ejercicios y períodos -------------------------------------------

const nombreMes = (mes) => MESES[mes - 1];

function htmlMes(e, p, { cerrar, reabrir }) {
  const boton = !puedeEditar ? ''
    : p.mes === cerrar?.mes && e.anio === cerrar.anio ? `<button type="button" class="btn btn-primario h-8 px-3 text-sm" data-periodo="cerrar" data-anio="${e.anio}" data-mes="${p.mes}">Cerrar</button>`
      : p.mes === reabrir?.mes && e.anio === reabrir.anio ? `<button type="button" class="btn btn-secundario h-8 px-3 text-sm" data-periodo="reabrir" data-anio="${e.anio}" data-mes="${p.mes}">Reabrir</button>` : '';
  return `<li class="flex min-w-0 flex-col items-start gap-1.5 rounded-medio border border-borde-default p-3">
    <b class="font-semibold first-letter:uppercase">${nombreMes(p.mes)}</b>
    <span class="insignia ${p.estado === 'ABIERTO' ? 'insignia-ok' : 'insignia-apagada'}">${p.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}</span>
    <small class="text-13 text-texto-secundario">${p.cerradoEn ? `Cerrado el ${fechaCorta(p.cerradoEn)}` : '&nbsp;'}</small>
    ${boton}
  </li>`;
}

function htmlConfirmacion(c) {
  const que = c.accion === 'cerrar'
    ? `¿Cerrar ${nombreMes(c.mes)} de ${c.anio}? Ya no se podrán aplicar partidas en ese mes. Solo se reabre mientras sea el último mes cerrado.`
    : `¿Reabrir ${nombreMes(c.mes)} de ${c.anio}? Quedará registrado en la bitácora.`;
  return `<div class="aviso aviso-aviso mt-4 flex-wrap items-center" role="alertdialog" aria-label="Confirmar">${icono('advertencia')}<p class="min-w-0 flex-1">${escapar(que)}</p>
    <span class="flex gap-2"><button type="button" class="btn btn-primario h-9 px-3 text-sm" data-periodo="confirmar">${c.accion === 'cerrar' ? 'Cerrar mes' : 'Reabrir mes'}</button>
    <button type="button" class="btn btn-secundario h-9 px-3 text-sm" data-periodo="cancelar">Cancelar</button></span></div>`;
}

const RESERVA_LEGAL = 0.07; // art. 123 del Código de Comercio: solo de referencia, el sistema no la calcula

/** Panel "Cierre del ejercicio" de un ejercicio abierto: los 4 pasos de migracion_1.8.sql como lista con su estado. */
function htmlCierre(e) {
  const c = estado.cierres[e.anio];
  const cerrados = e.periodos.filter((p) => p.estado === 'CERRADO').length;
  const partida = c?.partida;
  const aplicada = partida?.estado === 'APLICADA';
  const listo = aplicada && cerrados === 12;
  const paso = (n, titulo, hecho, cuerpo) => `<li class="flex min-w-0 flex-col gap-1.5 border-t border-neutro-100 pt-3 first:border-0 first:pt-0">
      <div class="flex flex-wrap items-center gap-2"><b class="font-semibold">${n}. ${titulo}</b>${hecho === null ? '' : `<span class="insignia ${hecho ? 'insignia-ok' : 'insignia-apagada'}">${hecho ? 'Hecho' : 'Pendiente'}</span>`}</div>
      <div class="flex min-w-0 flex-col items-start gap-2 break-words text-sm text-texto-secundario">${cuerpo}</div></li>`;
  const reserva = c && !aplicada ? `<p>Utilidad antes del cierre: <b class="font-semibold tabular-nums">${dinero(c.utilidad)}</b> · 7 % = <b class="font-semibold tabular-nums">${dinero(centavos(Math.max(0, c.utilidad) * RESERVA_LEGAL))}</b> (referencia, no es la reserva calculada).</p>` : '';
  const pregunta = estado.confirmarCierre?.anio === e.anio ? estado.confirmarCierre.accion : null;
  const confirmacion = !pregunta ? '' : `<div class="aviso aviso-aviso mt-3 flex-wrap items-center" role="alertdialog" aria-label="Confirmar">${icono('advertencia')}<p class="min-w-0 flex-1">${escapar(pregunta === 'generar'
    ? `¿Generar la partida de cierre del ejercicio ${e.anio}? Queda en borrador al 31 de diciembre para que la contadora la revise y la aplique.`
    : `¿Cerrar el ejercicio ${e.anio}? Ya no se podrá reabrir ningún mes. Queda en borrador el traslado del resultado a ejercicios anteriores.`)}</p>
    <span class="flex gap-2"><button type="button" class="btn btn-primario h-9 px-3 text-sm" data-cierre="confirmar">${pregunta === 'generar' ? 'Generar partida' : 'Cerrar ejercicio'}</button>
    <button type="button" class="btn btn-secundario h-9 px-3 text-sm" data-cierre="cancelar">Cancelar</button></span></div>`;
  const cuerpo2 = !c ? '<p>No se pudo leer el estado del cierre.</p>' : partida
    ? `<p>${aplicada ? `Aplicada (${escapar(partida.codigoTipo)} ${escapar(partida.numero)}).` : 'Creada en borrador: revísela y aplíquela.'} <a href="partidas.html?id=${partida.idPartida}" class="${BOTON_FILA}">Abrir la partida</a></p>`
    : `<p>Deja en cero las cuentas de resultado y lleva el resultado a utilidad o pérdida del ejercicio. Ya no debe haber partidas en borrador.</p>${puedeEditar ? `<button type="button" class="btn btn-secundario h-9 px-3 text-sm" data-cierre="generar" data-anio="${e.anio}">Generar partida de cierre</button>` : ''}`;
  return `<section class="mt-5 rounded-medio border border-borde-default p-3 sm:p-4" aria-labelledby="cierre-${e.anio}">
    <h3 id="cierre-${e.anio}" class="text-lg">Cierre del ejercicio ${e.anio}</h3>
    <ol class="mt-3 flex flex-col gap-3">
      ${paso(1, 'Ajustes de la contadora', null, `<p>Registre y aplique en diciembre la depreciación, provisiones, el impuesto sobre la renta y la reserva legal (7 % de la utilidad neta hasta la quinta parte del capital social, arts. 123 y 295 del Código de Comercio). El sistema no los calcula.</p>${reserva}`)}
      ${paso(2, 'Partida de cierre', aplicada, cuerpo2)}
      ${paso(3, 'Meses cerrados', cerrados === 12, `<p>${cerrados} de 12. Se cierran en orden, arriba, hasta diciembre.</p>`)}
      ${paso(4, 'Cerrar el ejercicio', false, `${listo ? '' : '<p>Se habilita cuando la partida de cierre esté aplicada y los 12 meses cerrados.</p>'}${puedeEditar ? `<button type="button" class="btn btn-primario h-9 px-3 text-sm" data-cierre="cerrar" data-anio="${e.anio}" ${listo ? '' : 'disabled'}>Cerrar ejercicio</button>` : ''}`)}
    </ol>
    ${confirmacion}
  </section>`;
}

function pintarPeriodos() {
  const dif = { cerrar: mesPorCerrar(estado.ejercicios), reabrir: mesPorReabrir(estado.ejercicios) };
  const siguiente = Math.max(new Date().getFullYear(), ...estado.ejercicios.map((e) => e.anio + 1));
  const tarjetas = [...estado.ejercicios].reverse().map((e) => `<article class="tarjeta rounded-grande p-4 sm:p-5">
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 class="text-xl">Ejercicio ${e.anio}</h2>
        <span class="insignia ${e.estado === 'ABIERTO' ? 'insignia-ok' : 'insignia-apagada'}">${e.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}</span>
        <small class="text-13 text-texto-secundario">${fechaCorta(e.fechaInicio)} – ${fechaCorta(e.fechaFin)}</small></header>
      ${estado.confirmar?.anio === e.anio ? htmlConfirmacion(estado.confirmar) : ''}
      <ul class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">${e.periodos.map((p) => htmlMes(e, p, dif)).join('')}</ul>
      ${e.estado === 'ABIERTO' ? htmlCierre(e) : ''}
    </article>`).join('');
  $('pestana-periodos').innerHTML = `<div class="flex flex-col gap-4">
    ${estado.avisoPeriodos ? aviso(estado.avisoPeriodos.error ? 'aviso-error' : 'aviso-exito', estado.avisoPeriodos.error ? 'alerta' : 'info', estado.avisoPeriodos.texto) : ''}
    ${estado.avisoPeriodos?.enlace ? `<a href="${estado.avisoPeriodos.enlace.href}" class="${BOTON_FILA} self-start">${escapar(estado.avisoPeriodos.enlace.texto)}</a>` : ''}
    <p class="text-13 text-texto-secundario">Se cierra el mes abierto más antiguo y se reabre solo el último mes cerrado. Un mes con partidas en borrador no se cierra.</p>
    ${puedeEditar ? `<form id="form-ejercicio" class="flex flex-wrap items-end gap-3" novalidate>
      <label><span class="campo-etiqueta">Año del ejercicio</span><span class="campo-caja w-32"><input name="anio" type="number" min="2000" max="2100" step="1" value="${siguiente}" class="w-full tabular-nums"></span></label>
      <button type="submit" class="btn btn-primario">${icono('mas')}Nuevo ejercicio</button></form>` : ''}
    ${tarjetas}</div>`;
}

/** Por ejercicio abierto: su partida de cierre vigente (sin anulación) y la utilidad antes del cierre. Si falla, el panel lo avisa. */
async function cargarCierres() {
  await Promise.all(estado.ejercicios.filter((e) => e.estado === 'ABIERTO').map(async (e) => {
    try {
      const [{ contenido }, { filas }] = await Promise.all([listarPartidas({ anio: e.anio, buscar: 'Cierre del ejercicio' }), obtenerSaldos({ anio: e.anio, mes: 12, nivel: 0 })]);
      estado.cierres[e.anio] = { partida: contenido.find((x) => x.origen === 'CIERRE' && !x.idPartidaAnuladaPor) ?? null, utilidad: resultadoMes(filas).utilidadAcum };
    } catch { estado.cierres[e.anio] = null; }
  }));
}

const recargarEjercicios = async () => { estado.ejercicios = await listarEjercicios(); await cargarCierres(); };

async function cargarPeriodos() {
  try {
    await recargarEjercicios();
  } catch (e) {
    estado.avisoPeriodos = { error: true, texto: e.message };
  }
  pintarPeriodos();
}

/**
 * Corre la acción del servicio y vuelve a pintar con su mensaje (el de la función de la base si la rechaza).
 * `borradores` ({ anio, mes? }): si la base la rechaza por partidas en borrador (también cuenta un borrador vacío),
 * el aviso enlaza a la lista filtrada por esos borradores.
 */
async function accionPeriodos(textoOk, accion, borradores = null) {
  estado.confirmar = null;
  estado.confirmarCierre = null;
  try {
    const r = await accion(); // opcional: { enlace: { href, texto } }; textoOk puede ser una función del resultado
    estado.avisoPeriodos = { texto: typeof textoOk === 'function' ? textoOk(r) : textoOk, enlace: r?.enlace };
    await recargarEjercicios();
  } catch (e) {
    const enlace = borradores && /tiene partidas en borrador/.test(e.message)
      ? { href: `partidas.html?${new URLSearchParams({ ...borradores, estado: 'BORRADOR' })}`, texto: 'Ver los borradores' } : null;
    estado.avisoPeriodos = { error: true, texto: e.message, enlace };
  }
  pintarPeriodos();
}

// --- Pestaña 3: tipos de partida --------------------------------------------------

function pintarTipos(mensaje) {
  const filas = estado.tipos.map((t) => `<div class="${FILA_TIPO} min-h-11 border-b border-neutro-100 py-1 text-15">
      <b class="font-mono font-semibold">${t.codigo}</b><span class="truncate">${escapar(t.nombre)}</span>
      <span>${t.predeterminado ? '<span class="insignia insignia-ok">Predeterminado</span>' : ''}</span>
      <span>${t.activo ? 'Sí' : '<span class="insignia insignia-apagada">No</span>'}</span>
      <span class="text-right">${puedeEditar ? `<button type="button" data-tipo="${t.codigo}" class="${BOTON_FILA}" aria-label="Editar ${escapar(t.nombre)}">Editar</button>` : ''}</span></div>`).join('');
  $('pestana-tipos').innerHTML = `<div class="flex flex-col gap-4">
    ${mensaje ? aviso('aviso-exito', 'info', mensaje) : ''}
    <div class="flex flex-wrap items-center gap-3"><p class="text-13 text-texto-secundario">Exactamente un tipo es el predeterminado: es el que trae una partida nueva.</p>
      ${puedeEditar ? `<button type="button" id="nuevo-tipo" class="btn btn-primario ml-auto h-9 px-3 text-sm">${icono('mas')}Nuevo tipo</button>` : ''}</div>
    <div class="tarjeta overflow-x-auto rounded-grande"><div class="min-w-[560px]">
      <div class="${FILA_TIPO} h-9 border-b border-borde-default bg-fondo-sutil text-13 font-semibold text-texto-secundario" aria-hidden="true"><span>Código</span><span>Nombre</span><span>Predeterminado</span><span>Activo</span><span></span></div>
      ${filas}</div></div></div>`;
}

function abrirTipo(codigo) {
  const nuevo = !codigo;
  const t = estado.tipos.find((x) => x.codigo === codigo) ?? { codigo: '', nombre: '', predeterminado: false, activo: true };
  abrirDialogo({
    titulo: nuevo ? 'Nuevo tipo de partida' : t.nombre, subtitulo: nuevo ? 'Los campos con * son obligatorios' : `<span class="font-mono">${t.codigo}</span>. El código no se cambia.`,
    cuerpo: `
      ${campo({ nombre: 'codigo', columna: 'codigo', etiqueta: 'Código', obligatorio: true, ayuda: nuevo ? '3 letras mayúsculas, por ejemplo PDA.' : '', control: entrada('codigo', t.codigo, `maxlength="3" autocomplete="off" spellcheck="false" class="font-mono uppercase" ${nuevo ? '' : 'readonly'}`) })}
      ${campo({ nombre: 'nombre', columna: 'nombre', etiqueta: 'Nombre', obligatorio: true, control: entrada('nombre', t.nombre, 'maxlength="60" autocomplete="off"') })}
      ${casilla('predeterminado', 'predeterminado', 'Es el tipo predeterminado', t.predeterminado, '(se lo quita al actual)')}
      ${casilla('activo', 'activo', 'Activo', t.activo)}`,
    guardar: async (form) => {
      await guardarTipo({ codigo: texto(form, 'codigo').toUpperCase(), nombre: texto(form, 'nombre'), predeterminado: form.elements.predeterminado.checked, activo: form.elements.activo.checked }, nuevo);
      return async () => { estado.tipos = await listarTiposPartida(); pintarTipos('Tipo de partida guardado.'); };
    },
  });
}

// --- Pestaña 4: configuración --------------------------------------------------------

const CUENTAS_CONFIG = [
  ['ctaUtilidadEjercicio', 'cta_utilidad_ejercicio', 'Utilidad del ejercicio'],
  ['ctaUtilidadesAnteriores', 'cta_utilidades_anteriores', 'Utilidades de ejercicios anteriores'],
  ['ctaPerdidaEjercicio', 'cta_perdida_ejercicio', 'Pérdida del ejercicio'],
  ['ctaPerdidasAnteriores', 'cta_perdidas_anteriores', 'Pérdidas de ejercicios anteriores'],
  ['ctaPerdidasGanancias', 'cta_perdidas_ganancias', 'Pérdidas y ganancias (liquidadora del cierre)'],
  ['ctaReservaLegal', 'cta_reserva_legal', 'Reserva legal'],
  ['ctaClientes', 'cta_clientes', 'Clientes (por cobrar, por defecto)'],
  ['ctaProveedores', 'cta_proveedores', 'Proveedores (por pagar, por defecto)'],
];
// Partidas automáticas (fase 3): [nombre, columna, etiqueta, ayuda]. Las dos últimas aceptan cuentas agrupadoras (3101, 53).
const GRUPOS_CONFIG = [
  ['Ventas y compras', [
    ['ctaCaja', 'cta_caja', 'Caja (toda venta al contado)'],
    ['ctaIngresoVentas', 'cta_ingreso_ventas', 'Ingresos por ventas'],
    ['ctaComprasProductos', 'cta_compras_productos', 'Compras de productos'],
  ]],
  ['IVA', [
    ['ctaIvaDebitoCcf', 'cta_iva_debito_ccf', 'IVA débito de créditos fiscales'],
    ['ctaIvaDebitoCf', 'cta_iva_debito_cf', 'IVA débito de facturas'],
    ['ctaIvaCredito', 'cta_iva_credito', 'IVA crédito fiscal'],
    ['ctaIvaPercibido', 'cta_iva_percibido', 'IVA percibido (1 %)'],
    ['ctaIvaRetenido', 'cta_iva_retenido', 'IVA retenido (1 %)'],
    ['ctaAnticipoIva', 'cta_anticipo_iva', 'Anticipo de IVA (2 %)'],
    ['ctaRemanenteIva', 'cta_remanente_iva', 'Remanente de IVA'],
    ['ctaIvaPorPagar', 'cta_iva_por_pagar', 'IVA por pagar'],
  ]],
  ['Pago a cuenta', [
    ['ctaPagoCuenta', 'cta_pago_cuenta', 'Pago a cuenta (lo pagado por adelantado)'],
    ['ctaPagoCuentaPorPagar', 'cta_pago_cuenta_por_pagar', 'Pago a cuenta por pagar'],
  ]],
  ['Planilla', [
    ['ctaSueldos', 'cta_sueldos', 'Sueldos'],
    ['ctaComisiones', 'cta_comisiones', 'Comisiones'],
    ['ctaIsssLaboral', 'cta_isss_laboral', 'ISSS laboral'],
    ['ctaAfpLaboral', 'cta_afp_laboral', 'AFP laboral'],
    ['ctaRentaRetenida', 'cta_renta_retenida', 'Renta retenida'],
    ['ctaOtrosDescuentos', 'cta_otros_descuentos', 'Otros descuentos'],
    ['ctaSalariosPorPagar', 'cta_salarios_por_pagar', 'Salarios por pagar'],
  ]],
  ['Cierre y reserva legal', [
    ['ctaCapitalSocial', 'cta_capital_social', 'Capital social', 'Puede ser la cuenta agrupadora (3101).'],
    ['ctaGastoIsr', 'cta_gasto_isr', 'Gasto por impuesto sobre la renta', 'Puede ser la cuenta agrupadora (53).'],
  ]],
];
const CUENTAS_FASE3 = GRUPOS_CONFIG.flatMap(([, campos]) => campos);
const MODOS = [['DETALLE', 'Detalle'], ['RESUMEN', 'Resumen']];

function pintarConfig(mensaje) {
  const c = estado.config;
  const lectura = puedeEditar ? '' : 'disabled';
  // Las 8 listas llevan las mismas ~450 cuentas: se arma el HTML una vez y el valor se pone después
  const cuentas = `<option value="">Sin elegir</option>${estado.cuentas.filter((x) => x.aceptaMovimiento).map((x) => `<option value="${x.codigo}">${x.codigo} — ${escapar(x.nombre)}</option>`).join('')}`;
  const tipos = (valor) => estado.tipos.filter((t) => t.activo || t.codigo === valor).map((t) => [t.codigo, `${t.codigo} — ${t.nombre}`]);
  const conAgrupadoras = `<option value="">Sin elegir</option>${estado.cuentas.map((x) => `<option value="${x.codigo}">${x.codigo} — ${escapar(x.nombre)}</option>`).join('')}`;
  const AGRUPADORAS = ['ctaCapitalSocial', 'ctaGastoIsr'];
  const pendientes = CUENTAS_CONFIG.some(([n]) => !c[n]);
  $('pestana-config').innerHTML = `<form id="form-config" class="flex max-w-3xl flex-col gap-4" novalidate>
    <div data-error class="aviso aviso-error hidden" role="alert"></div>
    ${mensaje ? aviso('aviso-exito', 'info', mensaje) : ''}
    ${pendientes ? aviso('aviso-aviso', 'advertencia', 'Por confirmar con la contadora: las cuentas sin elegir se llenan con ella. Hasta entonces el cierre del ejercicio y las partidas automáticas no pueden usarlas.') : ''}
    <fieldset class="tarjeta flex flex-col gap-4 rounded-grande p-4 sm:p-5" ${lectura}><legend class="sr-only">Cuentas especiales</legend>
      <h2 class="text-lg">Cuentas especiales</h2><p class="-mt-3 text-13 text-texto-secundario">Solo cuentas que aceptan movimiento.</p>
      ${CUENTAS_CONFIG.map(([n, col, et]) => campo({ nombre: n, columna: col, etiqueta: et, control: `<select id="f-${n}" name="${n}">${cuentas}</select>` })).join('')}
    </fieldset>
    <fieldset class="tarjeta flex flex-col gap-4 rounded-grande p-4 sm:p-5" ${lectura}><legend class="sr-only">Inicio de la contabilidad</legend>
      <h2 class="text-lg">Inicio</h2>
      ${campo({ nombre: 'fechaInicio', columna: 'fecha_inicio', etiqueta: 'Fecha de inicio de la contabilidad', ayuda: 'No se contabiliza nada anterior a esta fecha. Sin ella no se pueden generar partidas automáticas.', control: entrada('fechaInicio', c.fechaInicio, 'type="date"') })}
    </fieldset>
    ${GRUPOS_CONFIG.map(([titulo, campos]) => `<fieldset class="tarjeta flex flex-col gap-4 rounded-grande p-4 sm:p-5" ${lectura}><legend class="sr-only">${titulo}</legend>
      <h2 class="text-lg">${titulo}</h2>
      ${campos.map(([n, col, et, ayuda]) => campo({ nombre: n, columna: col, etiqueta: et, ayuda, control: `<select id="f-${n}" name="${n}">${AGRUPADORAS.includes(n) ? conAgrupadoras : cuentas}</select>` })).join('')}
    </fieldset>`).join('')}
    <fieldset class="tarjeta flex flex-col gap-4 rounded-grande p-4 sm:p-5" ${lectura}><legend class="sr-only">Partidas automáticas</legend>
      <h2 class="text-lg">Partidas automáticas</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        ${campo({ nombre: 'tipoPartidaVentas', columna: 'tipo_partida_ventas', etiqueta: 'Tipo de partida de ventas', obligatorio: true, control: selector('tipoPartidaVentas', tipos(c.tipoPartidaVentas), c.tipoPartidaVentas) })}
        ${campo({ nombre: 'modoVentas', columna: 'modo_ventas', etiqueta: 'Ventas', obligatorio: true, ayuda: 'Detalle: una línea por documento. Resumen: una por día.', control: selector('modoVentas', MODOS, c.modoVentas, 'aria-describedby="ayuda-modoVentas"') })}
        ${campo({ nombre: 'tipoPartidaCompras', columna: 'tipo_partida_compras', etiqueta: 'Tipo de partida de compras', obligatorio: true, control: selector('tipoPartidaCompras', tipos(c.tipoPartidaCompras), c.tipoPartidaCompras) })}
        ${campo({ nombre: 'modoCompras', columna: 'modo_compras', etiqueta: 'Compras', obligatorio: true, ayuda: 'Detalle: una línea por documento. Resumen: una por día.', control: selector('modoCompras', MODOS, c.modoCompras, 'aria-describedby="ayuda-modoCompras"') })}
      </div>
    </fieldset>
    ${puedeEditar ? '<div><button type="submit" class="btn btn-primario">Guardar</button></div>' : ''}
  </form>`;
  for (const [n] of [...CUENTAS_CONFIG, ...CUENTAS_FASE3]) $('f-' + n).value = c[n] ?? '';
}

async function enviarConfig(form) {
  const error = form.querySelector('[data-error]');
  const boton = form.querySelector('[type="submit"]');
  error.classList.add('hidden');
  mostrarErrores(form, {});
  const datos = {};
  for (const [n] of [...CUENTAS_CONFIG, ...CUENTAS_FASE3]) datos[n] = form.elements[n].value || null;
  datos.fechaInicio = form.elements.fechaInicio.value || null;
  for (const n of ['tipoPartidaVentas', 'modoVentas', 'tipoPartidaCompras', 'modoCompras']) datos[n] = form.elements[n].value;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    estado.config = await guardarConfiguracion(datos);
    pintarConfig('Configuración guardada.');
  } catch (e) {
    if (e.detalle?.campos) mostrarErrores(form, e.detalle.campos);
    error.innerHTML = `${icono('alerta')}<p>${escapar(e.message)}</p>`;
    error.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

// --- Pestañas y eventos ------------------------------------------------------------

const cargadas = new Set();
async function cambiarPestana(nombre) {
  estado.pestana = nombre;
  for (const b of $('pestanas').querySelectorAll('[data-pestana]')) b.setAttribute('aria-pressed', String(b.dataset.pestana === nombre));
  for (const n of ['cuentas', 'periodos', 'tipos', 'config']) $(`pestana-${n}`).classList.toggle('hidden', n !== nombre);
  if (cargadas.has(nombre)) return;
  cargadas.add(nombre);
  try {
    if (nombre === 'periodos') await cargarPeriodos();
    if (nombre === 'tipos') { estado.tipos = await listarTiposPartida(); pintarTipos(); }
    if (nombre === 'config') {
      [estado.config, estado.tipos] = await Promise.all([obtenerConfiguracion(), listarTiposPartida()]);
      if (!estado.cuentas.length) prepararCuentas(await listarCuentas());
      pintarConfig();
    }
  } catch (e) {
    cargadas.delete(nombre);
    $(`pestana-${nombre}`).innerHTML = aviso('aviso-error', 'alerta', e.message);
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">La contabilidad es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  $('icono-buscar').innerHTML = icono('buscar');
  $('descargar-excel').innerHTML = `${icono('descargar')}Descargar Excel`;
  $('nueva-cuenta').innerHTML = `${icono('mas')}Nueva cuenta`;
  $('nueva-cuenta').classList.toggle('hidden', !puedeEditar);
  if (!puedeEditar) {
    $('aviso-solo-lectura').classList.remove('hidden');
    $('aviso-solo-lectura').classList.add('flex');
    $('aviso-solo-lectura').innerHTML = `${icono('candado')}<p>Estás como auditor: puedes ver todo, pero no cambiar nada.</p>`;
  }
  $('chips').innerHTML = CHIPS.map(([v, t]) => `<label class="chip"><input type="radio" name="tipo" value="${v}" ${v === 'TODOS' ? 'checked' : ''}>${t}</label>`).join('');

  $('pestanas').addEventListener('click', (e) => { const b = e.target.closest('[data-pestana]'); if (b) cambiarPestana(b.dataset.pestana); });
  $('chips').addEventListener('change', (e) => { estado.tipo = e.target.value; pintarCuentas(); });
  $('cuentas-cabecera').innerHTML = CABECERA_CUENTAS.map((t) => `<span>${t}</span>`).join('');
  $('buscar').addEventListener('input', (e) => { estado.buscar = e.target.value; pintarCuentas(); });
  $('expandir').addEventListener('click', () => { estado.contraidas = new Set(); pintarCuentas(); });
  $('contraer').addEventListener('click', () => { contraerTodo(); pintarCuentas(); });
  $('descargar-excel').addEventListener('click', descargarCuentas);
  $('nueva-cuenta').addEventListener('click', abrirCuentaNueva);
  $('cuentas-lista').addEventListener('click', (e) => {
    const alternar = e.target.closest('[data-alternar]')?.dataset.alternar;
    if (alternar) {
      estado.contraidas.has(alternar) ? estado.contraidas.delete(alternar) : estado.contraidas.add(alternar);
      pintarCuentas();
      $('cuentas-lista').querySelector(`[data-alternar="${alternar}"]`)?.focus();
    }
    const editar = e.target.closest('[data-editar]')?.dataset.editar;
    if (editar) abrirCuentaEditar(editar);
  });

  $('pestana-periodos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-periodo]');
    if (!b) return;
    const { periodo, anio, mes } = b.dataset;
    if (periodo === 'cancelar') estado.confirmar = null;
    else if (periodo === 'confirmar') {
      const { accion, anio: a, mes: m } = estado.confirmar;
      accionPeriodos(accion === 'cerrar' ? `${nombreMes(m)} de ${a} cerrado.` : `${nombreMes(m)} de ${a} reabierto.`, () => (accion === 'cerrar' ? cerrarPeriodo(a, m) : reabrirPeriodo(a, m)), { anio: a, mes: m });
      return;
    } else estado.confirmar = { accion: periodo, anio: Number(anio), mes: Number(mes) };
    estado.avisoPeriodos = null;
    pintarPeriodos();
  });
  $('pestana-periodos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cierre]');
    if (!b) return;
    const { cierre, anio } = b.dataset;
    if (cierre === 'confirmar') {
      const { accion, anio: a } = estado.confirmarCierre;
      if (accion === 'generar') accionPeriodos(`Partida de cierre del ejercicio ${a} creada en borrador.`, async () => ({ enlace: { href: `partidas.html?id=${(await generarPartidaCierre(a)).idPartida}`, texto: 'Abrir la partida de cierre' } }), { anio: a });
      else accionPeriodos((r) => `Ejercicio ${a} cerrado.${r.enlace ? ' Queda en borrador el traslado a ejercicios anteriores.' : ' No se creó el traslado a ejercicios anteriores: enero del año siguiente no está abierto o falta la cuenta en Configuración.'}`,
        async () => { const { idPartidaTraslado } = await cerrarEjercicio(a); return { enlace: idPartidaTraslado ? { href: `partidas.html?id=${idPartidaTraslado}`, texto: 'Abrir el traslado en borrador' } : null }; });
      return;
    }
    estado.confirmarCierre = cierre === 'cancelar' ? null : { accion: cierre, anio: Number(anio) };
    estado.avisoPeriodos = null;
    pintarPeriodos();
  });
  $('pestana-periodos').addEventListener('submit', (e) => {
    e.preventDefault();
    const anio = Number(e.target.elements.anio.value);
    accionPeriodos(`Ejercicio ${anio} creado con sus 12 meses abiertos.`, () => crearEjercicio(anio));
  });

  $('pestana-tipos').addEventListener('click', (e) => {
    if (e.target.closest('#nuevo-tipo')) abrirTipo(null);
    const codigo = e.target.closest('[data-tipo]')?.dataset.tipo;
    if (codigo) abrirTipo(codigo);
  });
  $('pestana-config').addEventListener('submit', (e) => { e.preventDefault(); enviarConfig(e.target); });

  dialogo.addEventListener('click', (e) => { if (e.target.closest('[data-accion="cerrar-dialogo"]')) cerrarDialogo(); });
  dialogo.addEventListener('submit', (e) => { e.preventDefault(); enviarDialogo(e.target); });
  dialogo.addEventListener('input', (e) => { if (e.target.name === 'codigo' && e.target.classList.contains('uppercase')) e.target.value = e.target.value.toUpperCase(); });

  cargarCuentas();
}
