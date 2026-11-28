/**
 * liquidacionesController.js — Ligia Manzano Salón
 * Pantalla Liquidaciones de tarjeta (DTE 09 del banco): lista del mes con totales y formulario
 * (nueva / editar / borrar) en el panel. Editar y borrar solo si no está contabilizada.
 */
import { montarLayout } from '../utils/layout.js';
import { obtenerSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, fechaCorta, fechaIso, mesAnio } from '../utils/formato.js';
import { centavos } from '../utils/calculos.js';
import { campo, entrada, mostrarErrores } from '../utils/formulario.js';
import { crearPanel, htmlCabecera, htmlError, htmlExito } from '../utils/panel.js';
import { listarProveedores } from '../services/comprasService.js';
import { listarCuentas } from '../services/contabilidadService.js';
import { listarLiquidaciones, guardarLiquidacion, borrarLiquidacion } from '../services/liquidacionesService.js';
import { anticipoPropuesto, depositadoDe, UUID } from '../mocks/liquidaciones.js';

const EDITAN = ['ADMINISTRADOR', 'CONTADOR']; // el auditor solo ve (la API también responde 403)
const puedeEditar = EDITAN.includes(obtenerSesion()?.usuario.rol);
const sesion = montarLayout(puedeEditar ? { accion: { id: 'btn-nuevo', texto: 'Nueva liquidación', icono: 'mas' } } : {});

const $ = (id) => document.getElementById(id);
const lista = $('lista');
const panelEl = $('panel');

const MES_ACTUAL = fechaIso().slice(0, 7);
const SIN_CAMBIOS = 'Hay cambios sin guardar. ¿Salir sin guardar?';
const FILA = 'grid grid-cols-[minmax(0,1fr)_104px] items-center gap-3 px-4 @2xl:grid-cols-[56px_minmax(0,1fr)_80px_72px_72px_88px_96px]';

const estado = { periodo: MES_ACTUAL, liquidaciones: [], bancos: [], cuentas: [], idSeleccionado: null, formularioSucio: false, peticion: 0 };

const panel = crearPanel({
  panel: panelEl,
  fondo: $('fondo-panel'),
  vacio: `${icono('tarjeta', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}<p>Elige una liquidación para ver su detalle.</p>`,
  alCerrar: () => {
    if (estado.formularioSucio && !confirm(SIN_CAMBIOS)) return false;
    estado.formularioSucio = false;
    estado.idSeleccionado = null;
    pintarLista();
    return true;
  },
});

const sumarMeses = (periodo, n) => fechaIso(new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
const ultimoDia = (periodo) => fechaIso(new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0));
const suma = (campoMonto) => centavos(estado.liquidaciones.reduce((s, l) => s + l[campoMonto], 0));
const insignia = (l) => (l.contabilizada ? '<span class="insignia insignia-ok">Contabilizada</span>' : '<span class="insignia insignia-aviso">Pendiente</span>');

// --- Lista -------------------------------------------------------------------

function htmlFila(l) {
  const actual = l.idLiquidacion === estado.idSeleccionado;
  return `<button type="button" data-id="${l.idLiquidacion}" ${actual ? 'aria-current="true"' : ''}
    class="${FILA} min-h-14 w-full cursor-pointer border-b border-neutro-100 py-2 text-left text-15 tabular-nums hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)]">
    <span class="@max-2xl:hidden">${fechaCorta(l.fecha)}</span>
    <span class="min-w-0"><b class="block truncate font-semibold">${escapar(l.nombreProveedor)}</b><small class="block truncate text-13 text-texto-secundario">${escapar(l.numeroDocumento)}<span class="@2xl:hidden"> · ${fechaCorta(l.fecha)}</span></small></span>
    <span class="text-right @max-2xl:hidden">${dinero(l.montoLiquidado)}</span>
    <span class="text-right @max-2xl:hidden">${dinero(l.anticipoIva)}</span>
    <span class="text-right @max-2xl:hidden">${dinero(l.comisionTotal)}</span>
    <span class="text-right">${dinero(l.montoDepositado)}</span>
    <span class="text-right @max-2xl:hidden">${insignia(l)}</span>
  </button>`;
}

function pintarLista() {
  lista.innerHTML = estado.liquidaciones.map(htmlFila).join('');
  const vacia = estado.liquidaciones.length === 0;
  $('lista-estado').classList.toggle('hidden', !vacia);
  $('lista-estado').textContent = `No hay liquidaciones en ${mesAnio(`${estado.periodo}-01`)}.`;
  const totales = $('totales');
  totales.classList.toggle('hidden', vacia);
  if (!vacia) {
    totales.innerHTML = `<div class="${FILA} min-h-12 py-2"><span class="@max-2xl:hidden"></span><span>Total del mes</span>
      <span class="text-right @max-2xl:hidden">${dinero(suma('montoLiquidado'))}</span><span class="text-right @max-2xl:hidden">${dinero(suma('anticipoIva'))}</span>
      <span class="text-right @max-2xl:hidden">${dinero(suma('comisionTotal'))}</span><span class="text-right">${dinero(suma('montoDepositado'))}</span><span class="@max-2xl:hidden"></span></div>`;
  }
}

async function cargar() {
  const id = ++estado.peticion;
  $('titulo-mes').textContent = mesAnio(`${estado.periodo}-01`);
  $('mes').value = estado.periodo;
  $('mes-siguiente').disabled = estado.periodo >= MES_ACTUAL;
  lista.setAttribute('aria-busy', 'true');
  try {
    const { contenido } = await listarLiquidaciones(`${estado.periodo}-01`, ultimoDia(estado.periodo));
    if (id !== estado.peticion) return;
    estado.liquidaciones = contenido;
    pintarLista();
  } catch (error) {
    if (id !== estado.peticion) return;
    estado.liquidaciones = [];
    lista.innerHTML = '';
    $('totales').classList.add('hidden');
    $('lista-estado').classList.remove('hidden');
    $('lista-estado').innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

// --- Detalle -----------------------------------------------------------------

function mostrarDetalle(idLiquidacion, aviso = '') {
  const l = estado.liquidaciones.find((x) => x.idLiquidacion === Number(idLiquidacion));
  if (!l) { panel.cerrar(); return; }
  estado.idSeleccionado = l.idLiquidacion;
  estado.formularioSucio = false;
  pintarLista();
  panel.abrir();
  panelEl.setAttribute('aria-label', 'Detalle de la liquidación');
  const fila = (texto, valor, fuerte = false) => `<dt class="${fuerte ? 'font-semibold' : 'text-texto-secundario'}">${texto}</dt><dd class="text-right ${fuerte ? 'font-semibold' : ''}">${valor}</dd>`;
  panelEl.innerHTML = `
    ${htmlCabecera(l.numeroDocumento, `${escapar(l.nombreProveedor)} · ${fechaCorta(l.fecha)}`, { antes: `<span class="mb-2 inline-flex">${insignia(l)}</span>` })}
    ${aviso ? htmlExito(aviso) : ''}
    <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-6 text-sm tabular-nums">
      ${fila('Cobrado con tarjeta', dinero(l.montoLiquidado))}
      ${fila('Anticipo 2 %', `−${dinero(l.anticipoIva)}`)}
      ${fila('Comisión con IVA', `−${dinero(l.comisionTotal)}`)}
      ${fila('Depositado', dinero(l.montoDepositado), true)}
    </dl>
    <div class="separa"></div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-6 text-sm">
      <dt class="text-texto-secundario">Cuenta del banco</dt><dd class="text-right">${escapar(l.codigoCuentaBanco)} · ${escapar(l.nombreCuentaBanco)}</dd>
      <dt class="text-texto-secundario">Período de IVA</dt><dd class="text-right first-letter:uppercase">${mesAnio(l.periodoIva)}</dd>
      <dt class="text-texto-secundario">Código de generación</dt><dd class="break-all text-right font-mono text-xs">${escapar(l.codigoGeneracion ?? '—')}</dd>
    </dl>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      <div id="detalle-error" class="aviso aviso-error hidden" role="alert"></div>
      ${l.contabilizada ? `<p class="text-13 text-texto-secundario">Ya está contabilizada: para cambiarla, borre el borrador o anule la partida en Contabilidad.</p>`
        : puedeEditar ? `<div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="editar">Editar</button>
          <button type="button" class="btn btn-secundario" data-accion="borrar">Borrar</button></div>` : ''}
    </div>`;
  panelEl.liquidacion = l;
  panel.enfocarTitulo(Boolean(aviso));
}

function mostrarErrorDetalle(mensaje) {
  const caja = $('detalle-error');
  caja.innerHTML = `${icono('alerta')}<p>${escapar(mensaje)}</p>`;
  caja.classList.remove('hidden');
}

async function borrar(l) {
  if (!confirm(`¿Borrar la liquidación ${l.numeroDocumento}?`)) return;
  try {
    await borrarLiquidacion(l.idLiquidacion);
    estado.idSeleccionado = null;
    await cargar();
    panel.cerrar();
  } catch (error) {
    mostrarErrorDetalle(error.message);
  }
}

// --- Formulario --------------------------------------------------------------

const opciones = (items, valor, texto, elegido) =>
  items.map((x) => `<option value="${escapar(x[valor])}" ${String(x[valor]) === String(elegido) ? 'selected' : ''}>${escapar(texto(x))}</option>`).join('');
const monto = (nombre, columna, etiqueta, valor, extra = '') => campo({
  nombre, columna, etiqueta, obligatorio: true,
  control: `<span class="text-texto-secundario">$</span><input id="f-${nombre}" name="${nombre}" type="number" inputmode="decimal" min="0" step="0.01" value="${valor ?? ''}" class="tabular-nums" ${extra}>`,
});

function mostrarFormulario(liq = null) {
  estado.formularioSucio = false;
  panel.abrir();
  const editando = Boolean(liq);
  const l = liq ?? { fecha: fechaIso(), anticipoIva: 0, comisionTotal: 0 };
  const periodo = (l.periodoIva ?? `${l.fecha.slice(0, 7)}-01`).slice(0, 7);
  panelEl.setAttribute('aria-label', editando ? 'Editar liquidación' : 'Nueva liquidación');

  panelEl.innerHTML = `
    ${htmlCabecera(editando ? `Editar ${l.numeroDocumento}` : 'Nueva liquidación', 'Los campos con * son obligatorios')}
    <form id="form-liquidacion" class="flex flex-1 flex-col" novalidate>
      <div id="form-error" class="aviso aviso-error mx-6 mb-4 hidden" role="alert"></div>
      <div class="flex flex-col gap-4 px-6">
        <div class="aviso aviso-info">${icono('info')}<p>Lo cobrado con tarjeta entró a Caja; esta liquidación lo pasa al banco. La comisión registra su CCF como compra de gasto.</p></div>
        ${campo({ nombre: 'fecha', columna: 'fecha', etiqueta: 'Fecha', obligatorio: true, control: entrada('fecha', l.fecha, 'type="date"') })}
        ${campo({ nombre: 'idProveedor', columna: 'id_proveedor', etiqueta: 'Banco', obligatorio: true, control: `<select id="f-idProveedor" name="idProveedor"><option value="">Elegir…</option>${opciones(estado.bancos, 'idProveedor', (b) => b.nombreComercial, l.idProveedor)}</select>` })}
        ${campo({ nombre: 'numeroDocumento', columna: 'numero_documento', etiqueta: 'Número del documento', obligatorio: true, control: entrada('numeroDocumento', l.numeroDocumento, 'maxlength="40" autocomplete="off"') })}
        ${campo({ nombre: 'codigoGeneracion', columna: 'codigo_generacion', etiqueta: 'Código de generación', ayuda: 'Del DTE 09: 36 caracteres.', control: entrada('codigoGeneracion', l.codigoGeneracion, 'maxlength="36" autocomplete="off" spellcheck="false" aria-describedby="ayuda-codigoGeneracion"') })}
        ${campo({ nombre: 'periodoIva', columna: 'periodo_iva', etiqueta: 'Período de IVA', obligatorio: true, ayuda: 'El mes en que se declara el anticipo.', control: entrada('periodoIva', periodo, 'type="month"') })}
        ${monto('montoLiquidado', 'monto_liquidado', 'Cobrado con tarjeta', l.montoLiquidado)}
        ${monto('anticipoIva', 'anticipo_iva', 'Anticipo 2 %', l.anticipoIva)}
        <p id="ayuda-anticipo" class="campo-ayuda -mt-3">Propuesto: 2 % de lo cobrado sin IVA. Puede cambiarlo.</p>
        ${monto('comisionTotal', 'comision_total', 'Comisión con IVA', l.comisionTotal)}
        ${campo({ nombre: 'codigoCuentaBanco', columna: 'codigo_cuenta_banco', etiqueta: 'Cuenta del banco', obligatorio: true, control: `<select id="f-codigoCuentaBanco" name="codigoCuentaBanco"><option value="">Elegir…</option>${opciones(estado.cuentas, 'codigo', (c) => `${c.codigo} · ${c.nombre}`, l.codigoCuentaBanco)}</select>` })}
        ${monto('montoDepositado', 'monto_depositado', 'Depositado por el banco', editando ? l.montoDepositado : 0, 'readonly tabindex="-1" aria-describedby="ayuda-depositado"')}
        <p id="ayuda-depositado" class="campo-ayuda -mt-3">Se calcula: cobrado − anticipo − comisión.</p>
      </div>
      <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primario" id="btn-guardar">Guardar liquidación</button>
        </div>
      </div>
    </form>`;

  const form = $('form-liquidacion');
  const num = (n) => Number(form.elements[n].value) || 0;
  let anticipoEditado = editando;  // al crear, el anticipo sigue a lo cobrado hasta que se escribe uno
  let periodoEditado = editando;   // y el período sigue a la fecha
  const recalcular = () => { form.elements.montoDepositado.value = depositadoDe({ montoLiquidado: num('montoLiquidado'), anticipoIva: num('anticipoIva'), comisionTotal: num('comisionTotal') }).toFixed(2); };
  form.addEventListener('input', (e) => {
    estado.formularioSucio = true;
    if (e.target.name === 'anticipoIva') anticipoEditado = true;
    if (e.target.name === 'periodoIva') periodoEditado = true;
    if (e.target.name === 'montoLiquidado' && !anticipoEditado) form.elements.anticipoIva.value = anticipoPropuesto(num('montoLiquidado')).toFixed(2);
    if (e.target.name === 'fecha' && !periodoEditado && e.target.value) form.elements.periodoIva.value = e.target.value.slice(0, 7);
    recalcular();
  });
  form.addEventListener('submit', (e) => enviarFormulario(e, liq));
  if (editando) recalcular();
  else form.elements.montoDepositado.value = '0.00';
  form.elements.fecha.focus();
}

/** Lee el formulario y lo valida (lo mismo que revisa la API). Devuelve { datos, errores }. */
function leerFormulario(form, liq) {
  const v = (n) => form.elements[n].value.trim();
  const n = (nombre) => (v(nombre) === '' ? null : Number(v(nombre)));
  const datos = {
    fecha: v('fecha'),
    idProveedor: Number(v('idProveedor')) || null,
    numeroDocumento: v('numeroDocumento').replace(/\s+/g, ' '),
    codigoGeneracion: v('codigoGeneracion') || null,
    periodoIva: v('periodoIva') ? `${v('periodoIva')}-01` : '',
    montoLiquidado: n('montoLiquidado'),
    anticipoIva: n('anticipoIva'),
    comisionTotal: n('comisionTotal'),
    montoDepositado: n('montoDepositado'),
    codigoCuentaBanco: v('codigoCuentaBanco'),
    idCompraComision: liq?.idCompraComision ?? null,
  };
  const errores = {};
  if (!datos.fecha) errores.fecha = 'Elija la fecha.';
  if (!datos.idProveedor) errores.idProveedor = 'Elija el banco.';
  if (!datos.numeroDocumento) errores.numeroDocumento = 'Escriba el número del documento.';
  if (datos.codigoGeneracion && !UUID.test(datos.codigoGeneracion)) errores.codigoGeneracion = 'El código tiene 36 caracteres, con guiones.';
  if (!datos.periodoIva) errores.periodoIva = 'Elija el mes del IVA.';
  if (!datos.codigoCuentaBanco) errores.codigoCuentaBanco = 'Elija la cuenta del banco.';
  for (const [clave, vacio] of [['montoLiquidado', 'Escriba lo cobrado.'], ['anticipoIva', 'Escriba el anticipo (0 si no hubo).'], ['comisionTotal', 'Escriba la comisión (0 si no hubo).']]) {
    const m = datos[clave];
    if (m === null) errores[clave] = vacio;
    else if (!Number.isFinite(m) || m < 0) errores[clave] = 'No puede ser negativo.';
    else if (Math.abs(m * 100 - Math.round(m * 100)) > 1e-6) errores[clave] = 'Use como máximo 2 decimales.';
  }
  if (!errores.montoLiquidado && datos.montoLiquidado <= 0) errores.montoLiquidado = 'Debe ser mayor que cero.';
  if (datos.montoDepositado < 0) errores.montoDepositado = 'El anticipo y la comisión no pueden pasar de lo cobrado.';
  return { datos, errores };
}

async function enviarFormulario(evento, liq) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const errorGeneral = $('form-error');
  errorGeneral.classList.add('hidden');

  const { datos, errores } = leerFormulario(form, liq);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const guardada = await guardarLiquidacion(datos, liq?.idLiquidacion);
    estado.formularioSucio = false;
    const mes = guardada.fecha.slice(0, 7);
    if (mes !== estado.periodo) estado.periodo = mes; // que se vea la que se acaba de guardar
    await cargar();
    mostrarDetalle(guardada.idLiquidacion, liq ? 'Cambios guardados.' : 'Liquidación guardada.');
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar liquidación';
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  const sePuedeSalir = () => !estado.formularioSucio || confirm(SIN_CAMBIOS);
  const irAlMes = (periodo) => {
    if (!sePuedeSalir()) return;
    estado.formularioSucio = false;
    estado.periodo = periodo;
    estado.idSeleccionado = null;
    panel.cerrar();
    cargar();
  };

  $('mes-anterior').innerHTML = icono('izquierda');
  $('mes-siguiente').innerHTML = icono('derecha');
  $('mes').max = MES_ACTUAL;
  $('mes-anterior').addEventListener('click', () => irAlMes(sumarMeses(estado.periodo, -1)));
  $('mes-siguiente').addEventListener('click', () => irAlMes(sumarMeses(estado.periodo, 1)));
  $('mes').addEventListener('change', (e) => {
    if (e.target.value && e.target.value <= MES_ACTUAL) irAlMes(e.target.value);
  });

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila || !sePuedeSalir()) return;
    panel.abrir(fila);
    mostrarDetalle(fila.dataset.id);
  });

  $('btn-nuevo')?.addEventListener('click', (e) => {
    if (!sePuedeSalir()) return;
    estado.idSeleccionado = null;
    pintarLista();
    panel.abrir(e.currentTarget);
    mostrarFormulario();
  });

  panelEl.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    switch (boton?.dataset.accion) {
      case 'cerrar': panel.cerrar(); break;
      case 'editar': mostrarFormulario(panelEl.liquidacion); break;
      case 'borrar': borrar(panelEl.liquidacion); break;
      case 'cancelar':
        if (!sePuedeSalir()) return;
        estado.formularioSucio = false;
        if (estado.idSeleccionado) mostrarDetalle(estado.idSeleccionado);
        else panel.cerrar();
        break;
      default:
    }
  });

  // Bancos y cuentas para el formulario; si fallan, el formulario queda sin opciones
  Promise.all([listarProveedores(), listarCuentas()]).then(([proveedores, cuentas]) => {
    estado.bancos = proveedores.filter((p) => p.activo);
    estado.cuentas = cuentas.filter((c) => c.codigo.startsWith('110103') && c.aceptaMovimiento && c.activa);
  }).catch(() => {});
  cargar();
}
