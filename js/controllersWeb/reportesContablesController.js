/**
 * reportesContablesController.js — Ligia Manzano Salón
 * Contabilidad → Reportes, en 6 pestañas: Resumen, Libro diario, Libro mayor, Balance de comprobación, Balance General y Estado de Resultados.
 * Todo sale de partidas aplicadas (GET /contabilidad/reportes/saldos | mayor | diario); los estados financieros los arma el frontend con los saldos
 * (js/utils/reportesContables.js). Cada pestaña baja a Excel y, menos el Resumen, se imprime en reportes-contables-imprimir.html.
 * URL: reportes-contables.html?pestana=mayor&cuenta=1101&desde=2026-11-01&hasta=2026-11-30 (así abre el Mayor desde el Balance de comprobación).
 */
import '../utils/estilos.js'; // sangrías y barras calculadas (la CSP bloquea style="…")
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, fechaIso, MESES } from '../utils/formato.js';
import { aviso } from '../utils/formulario.js';
import { centavos } from '../utils/calculos.js';
import { crearXlsx, descargar } from '../utils/xlsx.js';
import {
  nombreMes, ultimoDia, ultimosMeses, resultadoMes, modeloResumen, modeloDiario, modeloMayor, modeloComprobacion, modeloBalanceGeneral, modeloResultados, filasExcel,
} from '../utils/reportesContables.js';
import { listarEjercicios, listarTiposPartida, listarCuentas, obtenerSaldos, obtenerMayor, obtenerDiario } from '../services/contabilidadService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);
const vista = $('vista');
const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const BOTON = 'btn h-9 px-3 text-sm';

const PESTANAS = [['resumen', 'Resumen'], ['diario', 'Libro diario'], ['mayor', 'Libro mayor'], ['comprobacion', 'Balance de comprobación'], ['balance', 'Balance General'], ['resultados', 'Estado de Resultados']];
/** Qué filtros lleva cada pestaña; son también los parámetros de la hoja para imprimir. */
const CLAVES = { diario: ['desde', 'hasta', 'tipo'], mayor: ['cuenta', 'desde', 'hasta', 'formato'], comprobacion: ['anio', 'mes', 'nivel', 'ocultar'], balance: ['anio', 'mes', 'nivel'], resultados: ['anio', 'mes', 'nivel'] };
const niveles = { comprobacion: 6, balance: 3, resultados: 3 }; // nivel de cada pestaña
const ANCHOS = { resumen: [22, 16, 18, 18], diario: [12, 10, 8, 14, 40, 44, 14, 14], mayor: [12, 14, 14, 50, 14, 14, 14], comprobacion: [14, 50, 16, 16, 16, 16], balance: [14, 56, 16], resultados: [14, 56, 16] };
/** Anchos de columna del Libro diario: todos los bloques quedan alineados. */
const COLUMNAS_DIARIO = ['w-32', 'w-[28%]', '', 'w-28', 'w-28'];

const hoy = fechaIso();
const estado = { pestana: 'resumen', cuentas: [], tipos: [], anios: [], peticion: 0, listo: null,
  f: { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)), nivel: 6, desde: `${hoy.slice(0, 7)}-01`, hasta: ultimoDia(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))),
    tipo: '', cuenta: '1101', formato: 'partida', ocultar: true } };

// --- Filtros -------------------------------------------------------------------------

const caja = (etiqueta, control, clases = '') => `<label class="min-w-0 ${clases}"><span class="campo-etiqueta">${etiqueta}</span><span class="campo-caja">${control}</span></label>`;
const seleccion = (nombre, etiqueta, pares, valor) => caja(etiqueta, `<select name="${nombre}" class="w-full min-w-0">${pares.map(([v, t]) =>
  `<option value="${escapar(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${escapar(t)}</option>`).join('')}</select>`);
const fecha = (nombre, etiqueta, valor) => caja(etiqueta, `<input type="date" name="${nombre}" value="${valor}" class="w-full min-w-0 tabular-nums">`);
const filtroNivel = (n) => seleccion('nivel', 'Nivel de cuentas', [0, 1, 2, 3, 4, 5, 6].map((x) => [x, `Nivel ${x}`]), n);

const textoCuenta = (codigo) => { const c = estado.cuentas.find((x) => x.codigo === codigo); return c ? `${c.codigo} — ${c.nombre}` : codigo; };

function htmlFiltros(p) {
  const f = estado.f;
  const periodo = `${seleccion('anio', 'Año', estado.anios.map((a) => [a, a]), f.anio)}${seleccion('mes', 'Mes', MESES.map((m, i) => [i + 1, m[0].toUpperCase() + m.slice(1)]), f.mes)}`;
  const campos = {
    resumen: periodo,
    diario: `${fecha('desde', 'Desde', f.desde)}${fecha('hasta', 'Hasta', f.hasta)}
      ${seleccion('tipo', 'Tipo de partida', [['', 'Todos los tipos'], ...estado.tipos.map((t) => [t.codigo, `${t.codigo} — ${t.nombre}`])], f.tipo)}`,
    mayor: `${caja('Cuenta (agrupadoras con sus subcuentas)', `<input name="cuenta" list="lista-cuentas" value="${escapar(f.cuenta ? textoCuenta(f.cuenta) : '')}" placeholder="Código o nombre" autocomplete="off" class="w-full min-w-0">
        <datalist id="lista-cuentas">${estado.cuentas.map((c) => `<option value="${escapar(`${c.codigo} — ${c.nombre}`)}"></option>`).join('')}</datalist>`, 'col-span-2 sm:w-96')}
      ${fecha('desde', 'Desde', f.desde)}${fecha('hasta', 'Hasta', f.hasta)}
      ${seleccion('formato', 'Formato', [['partida', 'Por partida'], ['dia', 'Por día']], f.formato)}`,
    comprobacion: `${periodo}${filtroNivel(f.nivel)}
      <label class="col-span-2 flex min-h-11 items-center gap-2 text-15"><input type="checkbox" name="ocultar" ${f.ocultar ? 'checked' : ''} class="size-4">Ocultar cuentas sin saldo ni movimiento</label>`,
    balance: `${periodo}${filtroNivel(f.nivel)}`,
    resultados: `${periodo}${filtroNivel(f.nivel)}`,
  };
  return `<form id="filtros" class="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" aria-label="Filtros del reporte" novalidate>${campos[p]}</form>`;
}

// --- Tablas ---------------------------------------------------------------------------

const CLASE_FILA = { enc: 'bg-fondo-sutil font-semibold', grupo: 'font-semibold', total: 'border-t border-borde-fuerte font-semibold' };

function celdaHtml(v, col, fila) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return `<span class="${v < 0 ? 'text-estado-error' : ''}">${dinero(v)}</span>`;
  const texto = escapar(typeof v === 'object' ? v.t : v);
  const interior = typeof v === 'object' && v.href ? `<a href="${escapar(v.href)}" class="underline decoration-borde-fuerte underline-offset-2 hover:decoration-current">${texto}</a>` : texto;
  return col.sangria ? `<span class="block" data-estilo="padding-left:${(fila.nivel ?? 0) * 0.75}rem">${interior}</span>` : interior;
}

function htmlFilas(m, filas) {
  return filas.map((fila) => `<tr class="border-b border-neutro-100 ${CLASE_FILA[fila.tipo] ?? ''}">${fila.v.map((v, i) =>
    `<td class="px-3 py-2 align-top ${m.columnas[i].num ? 'text-right' : ''}">${celdaHtml(v, m.columnas[i], fila)}</td>`).join('')}</tr>`).join('');
}

/** Una tabla en su tarjeta: las anchas se desplazan dentro de la tarjeta, no la página. `anchos`: una clase de ancho por columna. */
function htmlTabla(m, filas = m.filas, { anchos = [], pie = true, etiqueta = '' } = {}) {
  const cabecera = m.columnas.map((c, i) => `<th scope="col" class="px-3 py-2 ${c.num ? 'text-right' : 'text-left'} ${anchos[i] ?? ''}">${escapar(c.h)}</th>`).join('');
  return `<div class="tarjeta overflow-x-auto rounded-grande"><table class="w-full min-w-[720px] ${anchos.length ? 'table-fixed' : ''} text-15 tabular-nums" aria-label="${escapar(etiqueta)}">
    <thead class="border-b border-borde-default bg-fondo-sutil text-13 font-semibold text-texto-secundario"><tr>${cabecera}</tr></thead>
    <tbody>${htmlFilas(m, filas)}</tbody>
    ${pie && m.totales ? `<tfoot><tr class="border-t border-borde-fuerte font-semibold">${m.totales.map((v, i) => `<td class="px-3 py-2 ${m.columnas[i].num ? 'text-right' : ''}">${celdaHtml(v, m.columnas[i], {})}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div>`;
}

const insigniaCuadre = (diferencia) => (diferencia === 0 ? '<span class="insignia insignia-ok">Cuadra</span>' : `<span class="insignia insignia-error">Descuadre de ${dinero(diferencia)}</span>`);
const verificacion = (texto, diferencia) => `<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-15 tabular-nums">${texto} ${insigniaCuadre(diferencia)}</p>`;

// --- Contenido de cada pestaña --------------------------------------------------------------

function htmlResumen(meses) {
  const m = meses.at(-1);
  const tarjeta = (titulo, mes, acum, negativoMalo = false) => `<div class="tarjeta rounded-grande p-4">
    <h3 class="text-13 font-semibold text-texto-secundario">${titulo}</h3>
    <p class="mt-1 text-2xl font-semibold tabular-nums ${negativoMalo && mes < 0 ? 'text-estado-error' : ''}">${dinero(mes)}</p>
    <p class="text-13 text-texto-secundario">${escapar(nombreMes(m.anio, m.mes))}</p>
    <p class="mt-2 border-t border-neutro-100 pt-2 text-15 tabular-nums ${negativoMalo && acum < 0 ? 'text-estado-error' : ''}">${dinero(acum)} <span class="text-13 text-texto-secundario">en el año</span></p></div>`;
  const maximo = Math.max(1, ...meses.flatMap((x) => [x.ingresos, x.costos]));
  const barra = (valor, color, rotulo, x) => `<span class="w-1/3 max-w-8 rounded-t ${color}" data-estilo="height:${Math.max(0, valor) / maximo * 100}%" title="${escapar(`${rotulo} de ${nombreMes(x.anio, x.mes)}: ${dinero(valor)}`)}"></span>`;
  const grafica = `<section class="tarjeta rounded-grande p-4" aria-label="Gráfica de ingresos contra costos y gastos">
    <h3 class="text-15 font-semibold">Ingresos vs costos y gastos, últimos 6 meses</h3>
    <p class="mb-3 flex gap-4 text-13 text-texto-secundario"><span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-exito-600"></span>Ingresos</span><span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-rojo-500"></span>Costos y gastos</span></p>
    <div class="flex gap-1 sm:gap-3" role="img" aria-label="${escapar(meses.map((x) => `${nombreMes(x.anio, x.mes)}: ingresos ${dinero(x.ingresos)}, costos y gastos ${dinero(x.costos)}`).join('; '))}">
      ${meses.map((x) => `<div class="flex min-w-0 flex-1 flex-col items-center gap-1"><div class="flex h-36 w-full items-end justify-center gap-0.5 border-b border-borde-fuerte">
        ${barra(x.ingresos, 'bg-exito-600', 'Ingresos', x)}${barra(x.costos, 'bg-rojo-500', 'Costos y gastos', x)}</div>
        <span class="text-xs text-texto-secundario">${MESES[x.mes - 1].slice(0, 3)}</span></div>`).join('')}
    </div></section>`;
  return `<div class="grid gap-3 sm:grid-cols-3">${tarjeta('Ingresos', m.ingresos, m.ingresosAcum)}${tarjeta('Costos y gastos', m.costos, m.costosAcum)}${tarjeta('Utilidad (pérdida)', m.utilidad, m.utilidadAcum, true)}</div>
    ${grafica}${htmlTabla(modeloResumen(meses), undefined, { etiqueta: 'Resultado de los últimos 6 meses' })}`;
}

function htmlDiario(d, m) {
  if (!d.partidas.length) return aviso('aviso-info', 'info', 'No hay partidas aplicadas en este período.');
  const bloques = [];
  let actual = [];
  for (const fila of m.filas) { actual.push(fila); if (fila.tipo === 'total') { bloques.push(actual); actual = []; } }
  return `<p class="text-13 text-texto-secundario">${d.partidas.length} partidas aplicadas</p>
    ${bloques.map((filas) => htmlTabla(m, filas, { anchos: COLUMNAS_DIARIO, pie: false, etiqueta: 'Partida' })).join('')}
    <div class="tarjeta rounded-grande p-4">${verificacion(`<b class="font-semibold">Totales:</b> cargo ${dinero(d.totalDebe)} · abono ${dinero(d.totalHaber)}`, centavos(d.totalDebe - d.totalHaber))}</div>`;
}

const CONTENIDO = {
  async resumen(f) {
    const meses = ultimosMeses(f.anio, f.mes);
    const datos = await Promise.all(meses.map((x) => obtenerSaldos({ ...x, nivel: 0 })));
    const filas = meses.map((x, i) => ({ ...x, ...resultadoMes(datos[i].filas) }));
    return { html: htmlResumen(filas), excel: filasExcel(modeloResumen(filas)), imprimir: false };
  },
  async diario(f) {
    const d = await obtenerDiario(f);
    const m = modeloDiario(d);
    return { html: htmlDiario(d, m), excel: filasExcel(m), totales: true };
  },
  async mayor(f) {
    if (!estado.cuentas.some((c) => c.codigo === f.cuenta)) return { html: aviso('aviso-info', 'info', 'Elija una cuenta del plan: escriba su código o su nombre y escoja de la lista.'), vacio: true };
    const d = await obtenerMayor(f);
    const m = modeloMayor(d, f.formato);
    const c = d.cuenta;
    return { html: `<p class="text-15"><b class="font-semibold">${escapar(c.codigo)} — ${escapar(c.nombre)}</b> <span class="text-texto-secundario">· naturaleza ${c.naturaleza === 'D' ? 'deudora' : 'acreedora'}${c.aceptaMovimiento ? '' : ' · incluye sus subcuentas'}</span></p>
      ${htmlTabla(m, undefined, { etiqueta: 'Libro mayor' })}`, excel: filasExcel(m), totales: true };
  },
  async comprobacion(f) {
    const { filas } = await obtenerSaldos(f);
    const desde = `${f.anio}-${String(f.mes).padStart(2, '0')}-01`;
    const m = modeloComprobacion(filas, { ocultar: f.ocultar, enlace: (x) => `reportes-contables.html?${new URLSearchParams({ pestana: 'mayor', cuenta: x.codigo, desde, hasta: ultimoDia(f.anio, f.mes) })}` });
    return { html: `${htmlTabla(m, undefined, { etiqueta: 'Balance de comprobación' })}
      <div class="tarjeta rounded-grande p-4">${verificacion(`<b class="font-semibold">Σ debe</b> ${dinero(m.cuadre.debe)} · <b class="font-semibold">Σ haber</b> ${dinero(m.cuadre.haber)} (cuentas de nivel 0)`, m.cuadre.diferencia)}</div>`,
    excel: filasExcel(m), totales: true };
  },
  async balance(f) {
    const m = modeloBalanceGeneral((await obtenerSaldos(f)).filas);
    return { html: `${htmlTabla(m, undefined, { etiqueta: 'Balance General' })}
      <div class="tarjeta rounded-grande p-4">${verificacion(`<b class="font-semibold">Activo</b> ${dinero(m.cuadre.activo)} = <b class="font-semibold">Pasivo + Capital</b> ${dinero(m.cuadre.pasivoCapital)}`, m.cuadre.diferencia)}
      <p class="mt-1 text-13 text-texto-secundario">El capital incluye la utilidad (pérdida) del ejercicio, de enero al mes elegido.</p></div>`, excel: filasExcel(m) };
  },
  async resultados(f) {
    const m = modeloResultados((await obtenerSaldos(f)).filas);
    return { html: htmlTabla(m, undefined, { etiqueta: 'Estado de Resultados' }), excel: filasExcel(m) };
  },
};

// --- Pantalla ------------------------------------------------------------------------------

function enlaceImprimir() {
  const q = new URLSearchParams({ pestana: estado.pestana });
  for (const k of CLAVES[estado.pestana]) if (k !== 'ocultar' || estado.f.ocultar) q.set(k, k === 'ocultar' ? '1' : estado.f[k]);
  return `reportes-contables-imprimir.html?${q}`;
}

function descargarExcel() {
  const { excel, totales } = estado.listo;
  const nombre = PESTANAS.find(([id]) => id === estado.pestana)[1];
  const f = estado.f;
  const periodo = ['diario', 'mayor'].includes(estado.pestana) ? `${f.desde}_${f.hasta}` : `${f.anio}-${String(f.mes).padStart(2, '0')}`;
  descargar(`${estado.pestana}-${periodo}.xlsx`, crearXlsx(excel, { hoja: nombre, anchos: ANCHOS[estado.pestana], totales: Boolean(totales) }));
}

async function cargar() {
  const id = ++estado.peticion;
  const p = estado.pestana;
  estado.listo = null;
  $('resultado').innerHTML = '<p class="py-8 text-center text-texto-secundario">Cargando…</p>';
  try {
    const r = await CONTENIDO[p](estado.f);
    if (id !== estado.peticion) return; // llegó una respuesta más nueva
    estado.listo = r;
    const acciones = r.vacio ? '' : `<div class="flex flex-wrap gap-2">
      ${r.imprimir === false ? '' : `<a href="${escapar(enlaceImprimir())}" class="${BOTON} btn-secundario">${icono('imprimir')}Imprimir</a>`}
      <button type="button" class="${BOTON} btn-secundario" data-accion="excel">${icono('descargar')}Excel</button></div>`;
    $('resultado').innerHTML = acciones + r.html;
  } catch (e) {
    if (id === estado.peticion) $('resultado').innerHTML = aviso('aviso-error', 'alerta', e.message);
  }
}

function mostrar(pestana) {
  estado.pestana = pestana;
  estado.f.nivel = niveles[pestana] ?? estado.f.nivel;
  for (const b of $('pestanas').querySelectorAll('[data-pestana]')) b.setAttribute('aria-pressed', String(b.dataset.pestana === pestana));
  vista.innerHTML = `${htmlFiltros(pestana)}<div id="resultado" class="flex min-w-0 flex-col gap-4"></div>`;
  cargar();
}

function alCambiarFiltro(e) {
  const c = e.target;
  const f = estado.f;
  if (c.name === 'ocultar') f.ocultar = c.checked;
  else if (c.name === 'cuenta') f.cuenta = estado.cuentas.find((x) => x.codigo === c.value.split(' — ')[0].trim())?.codigo ?? '';
  else if (c.value === '' && c.type === 'date') return;
  else f[c.name] = ['anio', 'mes', 'nivel'].includes(c.name) ? Number(c.value) : c.value;
  if (c.name === 'nivel') niveles[estado.pestana] = f.nivel;
  cargar();
}

async function iniciar() {
  try {
    const [ejercicios, tipos, cuentas] = await Promise.all([listarEjercicios(), listarTiposPartida(), listarCuentas()]);
    estado.anios = ejercicios.map((e) => e.anio).reverse();
    estado.tipos = tipos;
    estado.cuentas = cuentas;
    const f = estado.f;
    if (!estado.anios.includes(f.anio)) f.anio = estado.anios[0] ?? f.anio;
    const q = new URLSearchParams(location.search);
    for (const k of ['cuenta', 'desde', 'hasta', 'tipo', 'formato']) if (q.get(k)) f[k] = q.get(k);
    for (const k of ['anio', 'mes']) if (Number(q.get(k))) f[k] = Number(q.get(k));
    if (q.has('nivel') && q.get('pestana') in niveles) niveles[q.get('pestana')] = Number(q.get('nivel')) || 0;
    $('pestanas').innerHTML = PESTANAS.map(([id, texto]) => `<button type="button" class="filtro" data-pestana="${id}" aria-pressed="false">${texto}</button>`).join('');
    $('pestanas').addEventListener('click', (e) => { const b = e.target.closest('[data-pestana]'); if (b) mostrar(b.dataset.pestana); });
    vista.addEventListener('change', (e) => { if (e.target.closest('#filtros')) alCambiarFiltro(e); });
    vista.addEventListener('submit', (e) => e.preventDefault());
    vista.addEventListener('click', (e) => { if (e.target.closest('[data-accion="excel"]') && estado.listo) descargarExcel(); });
    mostrar(PESTANAS.some(([id]) => id === q.get('pestana')) ? q.get('pestana') : 'resumen');
  } catch (e) {
    vista.innerHTML = aviso('aviso-error', 'alerta', e.message);
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">La contabilidad es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  iniciar();
}
