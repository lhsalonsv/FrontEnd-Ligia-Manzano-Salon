/**
 * contabilizarController.js — Ligia Manzano Salón
 * Contabilidad → Contabilizar. Con lo que todavía no está en la contabilidad (ventas, compras, planillas y liquidaciones de tarjeta)
 * muestra la vista previa de cada partida y, con "Generar borradores", las crea en Partidas para que la contadora las revise y las aplique.
 * Administrador y contador generan; el auditor solo ve la vista previa. Nada se aplica solo.
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, fechaIso } from '../utils/formato.js';
import { fechaDMY } from '../utils/hojas.js';
import { centavos } from '../utils/calculos.js';
import { vistaContabilizar, contabilizar, resumirLineas } from '../services/contabilidadService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);
const vista = $('vista');

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const puedeEditar = Boolean(sesion && ['ADMINISTRADOR', 'CONTADOR'].includes(sesion.usuario.rol));

const ORIGENES = [['VENTAS', 'Ventas'], ['COMPRAS', 'Compras'], ['PLANILLA', 'Planilla'], ['TARJETAS', 'Tarjetas']];
const AYUDA = {
  VENTAS: 'Facturas y créditos fiscales emitidos: una partida por cada día.',
  COMPRAS: 'Compras registradas: una partida por cada día.',
  PLANILLA: 'Planillas cerradas: una partida por cada planilla.',
  TARJETAS: 'Liquidaciones de tarjeta que depositó el banco: una partida por cada liquidación.',
};

const hoy = new Date();
const estado = {
  origen: 'VENTAS', desde: fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: fechaIso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  lineas: [], mensaje: '', peticion: 0,
};

const BOTON = 'btn h-9 px-3 text-sm';
const FILA = 'grid grid-cols-[112px_minmax(0,1fr)_104px_104px] items-center gap-x-3 px-4';

/** Las líneas de la vista previa agrupadas por partida que se creará (el orden de la API se conserva). */
function agrupar(lineas) {
  const grupos = new Map();
  for (const l of lineas) {
    if (!grupos.has(l.grupo)) grupos.set(l.grupo, []);
    grupos.get(l.grupo).push(l);
  }
  return [...grupos.values()];
}

function htmlBloque(lineas) {
  const { fecha } = lineas[0];
  const documentos = [...new Map(lineas.map((l) => [`${l.tipoDocumento}:${l.idDocumento}`, l])).values()];
  // Las líneas sin cuenta también se ven (y suman): así el bloque cuadra y se nota qué falta
  const filas = resumirLineas(lineas);
  const totalDebe = filas.reduce((a, l) => centavos(a + l.debe), 0);
  const totalHaber = filas.reduce((a, l) => centavos(a + l.haber), 0);
  const titulo = ['VENTAS', 'COMPRAS'].includes(estado.origen)
    ? `${estado.origen === 'VENTAS' ? 'Ventas' : 'Compras'} del ${fechaDMY(fecha)}` : documentos[0].documento;
  const detalle = documentos.map((d) => escapar(d.documento)).join(' · ');
  return `<article class="tarjeta overflow-x-auto rounded-grande">
    <header class="flex flex-col gap-1 border-b border-borde-default px-4 py-3">
      <h2 class="text-base">${escapar(titulo)} <span class="font-normal text-texto-secundario">· fecha de la partida ${fechaDMY(fecha)}</span></h2>
      <p class="text-13 text-texto-secundario">${documentos.length} ${documentos.length === 1 ? 'documento' : 'documentos'}: ${detalle}</p>
    </header>
    <div class="min-w-[560px]">
      <div class="${FILA} h-9 border-b border-borde-default bg-fondo-sutil text-13 font-semibold text-texto-secundario" aria-hidden="true">
        <span>Cuenta</span><span>Nombre</span><span class="text-right">Debe</span><span class="text-right">Haber</span></div>
      ${filas.map((l) => `<div class="${FILA} min-h-10 border-b border-neutro-100 py-1.5 text-15">
        ${l.codigoCuenta
          ? `<span class="font-mono text-sm">${escapar(l.codigoCuenta)}</span><span class="truncate" title="${escapar(l.nombreCuenta ?? '')}">${escapar(l.nombreCuenta ?? '')}</span>`
          : '<span class="font-mono text-sm text-estado-error">—</span><span class="font-semibold text-estado-error">Falta la cuenta</span>'}
        <span class="text-right tabular-nums">${l.debe ? dinero(l.debe) : ''}</span><span class="text-right tabular-nums">${l.haber ? dinero(l.haber) : ''}</span></div>`).join('')}
      <div class="${FILA} min-h-10 py-1.5 text-15 font-semibold"><span></span><span>Total</span>
        <span class="text-right tabular-nums">${dinero(totalDebe)}</span><span class="text-right tabular-nums">${dinero(totalHaber)}</span></div>
    </div>
  </article>`;
}

function pintarResultado() {
  const { lineas } = estado;
  const faltas = [...new Set(lineas.filter((l) => l.falta).map((l) => l.falta))];
  const grupos = agrupar(lineas);
  const avisoCreados = estado.mensaje ? `<div class="aviso aviso-exito" role="status">${icono('info')}<p>${estado.mensaje}</p></div>` : '';
  if (!lineas.length) {
    $('resultado').innerHTML = `${avisoCreados}<div class="tarjeta rounded-grande px-4 py-10 text-center text-texto-secundario">No hay documentos pendientes de contabilizar en ese rango.</div>`;
    return;
  }
  const documentos = new Set(lineas.map((l) => `${l.tipoDocumento}:${l.idDocumento}`)).size;
  $('resultado').innerHTML = `${avisoCreados}
    ${faltas.length ? `<div class="aviso aviso-error" role="alert">${icono('alerta')}<div>
      <p><b class="block font-semibold">Falta configurar algo antes de generar los borradores</b></p>
      <ul class="list-disc pl-5">${faltas.map((f) => `<li>${escapar(f)}</li>`).join('')}</ul>
      ${faltas.some((f) => f.includes('de la compra')) ? '<p class="mt-1 text-13">La cuenta de un gasto se completa en <a class="font-semibold underline" href="compras.html">Compras</a>: abre la compra y usa "Cuentas contables".</p>' : ''}
      ${faltas.some((f) => f.includes('Configuración')) ? '<p class="mt-1 text-13">Las cuentas generales se eligen en <a class="font-semibold underline" href="contabilidad-parametros.html">Parámetros → Configuración</a>.</p>' : ''}</div></div>` : ''}
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-sm text-texto-secundario">Se crearán <b>${grupos.length}</b> ${grupos.length === 1 ? 'borrador' : 'borradores'} con ${documentos} ${documentos === 1 ? 'documento' : 'documentos'}.</p>
      ${puedeEditar ? `<button type="button" id="generar" class="${BOTON} btn-primario ml-auto" ${faltas.length ? 'disabled' : ''}>Generar borradores</button>`
        : '<p class="ml-auto text-sm text-texto-secundario">Como auditor puedes ver la vista previa, pero no generar borradores.</p>'}
    </div>
    <div id="error-generar" class="aviso aviso-error hidden" role="alert"></div>
    ${grupos.map(htmlBloque).join('')}`;
}

async function cargar() {
  const id = ++estado.peticion;
  $('resultado').innerHTML = '<p class="py-6 text-center text-texto-secundario">Buscando documentos pendientes…</p>';
  try {
    const { lineas } = await vistaContabilizar(estado.origen, { desde: estado.desde, hasta: estado.hasta });
    if (id !== estado.peticion) return;
    estado.lineas = lineas;
    pintarResultado();
  } catch (e) {
    if (id !== estado.peticion) return;
    $('resultado').innerHTML = `<div class="aviso aviso-error" role="alert">${icono('alerta')}<p>${escapar(e.message)}</p></div>`;
  }
  estado.mensaje = '';
}

async function generar(boton) {
  const error = $('error-generar');
  error.classList.add('hidden');
  boton.disabled = true;
  boton.textContent = 'Generando…';
  try {
    const { ids } = await contabilizar(estado.origen, { desde: estado.desde, hasta: estado.hasta });
    estado.mensaje = `${ids.length} ${ids.length === 1 ? 'borrador creado' : 'borradores creados'}. <a class="font-semibold underline" href="partidas.html?estado=BORRADOR">Revisarlos en Partidas</a>`;
    await cargar();
  } catch (e) {
    error.innerHTML = `${icono('alerta')}<p>${escapar(e.message)}</p>`;
    error.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Generar borradores';
  }
}

function pintarPagina() {
  vista.innerHTML = `
    <p class="text-sm text-texto-secundario">Aquí se arma, con lo que todavía no está en la contabilidad, el borrador de cada partida. Revísela y aplíquela después en Partidas: nada se aplica solo.</p>
    <div id="origenes" class="filtros" role="group" aria-label="Qué contabilizar">
      ${ORIGENES.map(([v, t]) => `<button type="button" class="filtro" data-origen="${v}" aria-pressed="${v === estado.origen}">${t}</button>`).join('')}
    </div>
    <p id="ayuda-origen" class="-mt-2 text-13 text-texto-secundario">${AYUDA[estado.origen]}</p>
    <form id="rango" class="flex flex-wrap items-end gap-3" novalidate>
      <label class="flex flex-col gap-1 text-13 text-texto-secundario">Desde<span class="campo-caja h-9 min-h-0 text-sm"><input type="date" name="desde" value="${estado.desde}" required></span></label>
      <label class="flex flex-col gap-1 text-13 text-texto-secundario">Hasta<span class="campo-caja h-9 min-h-0 text-sm"><input type="date" name="hasta" value="${estado.hasta}" required></span></label>
      <button type="submit" class="${BOTON} btn-secundario">Ver pendientes</button>
    </form>
    <p id="error-rango" class="campo-error hidden"></p>
    <div id="resultado" class="flex min-w-0 flex-col gap-4" aria-live="polite"></div>`;

  $('origenes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-origen]');
    if (!b) return;
    estado.origen = b.dataset.origen;
    for (const x of $('origenes').querySelectorAll('[data-origen]')) x.setAttribute('aria-pressed', String(x === b));
    $('ayuda-origen').textContent = AYUDA[estado.origen];
    cargar();
  });
  $('rango').addEventListener('submit', (e) => {
    e.preventDefault();
    const { desde, hasta } = e.target.elements;
    const error = $('error-rango');
    error.classList.toggle('hidden', Boolean(desde.value && hasta.value && desde.value <= hasta.value));
    if (!error.classList.contains('hidden')) { error.textContent = 'Elija las dos fechas; la inicial no puede ser posterior a la final.'; return; }
    estado.desde = desde.value;
    estado.hasta = hasta.value;
    cargar();
  });
  $('resultado').addEventListener('click', (e) => {
    const b = e.target.closest('#generar');
    if (b) generar(b);
  });
  cargar();
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">La contabilidad es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  pintarPagina();
}
