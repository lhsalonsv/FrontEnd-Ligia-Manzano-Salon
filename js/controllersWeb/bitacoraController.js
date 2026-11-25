/**
 * bitacoraController.js — Ligia Manzano Salón
 * Pantalla Bitácora (solo lectura): los registros de un día, filtrados por módulo, persona o texto,
 * el detalle de cada uno (qué cambió) y exportar el día a Excel.
 *
 * URL: bitacora.html?fecha=2026-12-12
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, numero, fechaIso, fechaHora, iniciales, MESES } from '../utils/formato.js';
import { crearPanel, htmlCabecera, htmlError } from '../utils/panel.js';
import { crearXlsx, descargar } from '../utils/xlsx.js';
import { listarBitacora, obtenerRegistro, todoElDia } from '../services/bitacoraService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);
const lista = $('lista');
const panelEl = $('panel');

const estado = {
  fecha: fechaIso(),
  modulo: '',
  idUsuario: '',
  buscar: '',
  pagina: 0,
  peticion: 0,
  idSeleccionado: null,
};

/** [en la lista, en las pestañas] */
const MODULOS = {
  VENTAS: ['Venta', 'Ventas'], ANULACIONES: ['Anulación', 'Anulaciones'], HACIENDA: ['Hacienda', 'Hacienda'],
  CAJA: ['Caja', 'Caja'], AGENDA: ['Agenda', 'Agenda'], CLIENTES: ['Clientes', 'Clientes'],
  SERVICIOS: ['Servicios', 'Servicios'], EMPLEADOS: ['Empleados', 'Empleados'], PLANILLA: ['Planilla', 'Planilla'],
  INVENTARIO: ['Inventario', 'Inventario'], COMPRAS: ['Compras', 'Compras'], CONFIGURACION: ['Configuración', 'Configuración'],
  USUARIOS: ['Usuarios', 'Usuarios'], SESION: ['Sesión', 'Sesiones'], SEGURIDAD: ['Seguridad', 'Seguridad'],
};
const nombreModulo = (m, plural = false) => MODULOS[m]?.[plural ? 1 : 0] ?? m;

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 'Hoy, sábado 12 de diciembre' · 'Ayer, …' · 'jueves 10 de diciembre' (+ año si no es este). */
function tituloDia(iso) {
  const f = new Date(`${iso}T00:00:00`);
  let texto = `${DIAS_SEMANA[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
  if (f.getFullYear() !== new Date().getFullYear()) texto += ` de ${f.getFullYear()}`;
  if (iso === fechaIso()) return `Hoy, ${texto}`;
  if (iso === fechaIso(new Date(), -1)) return `Ayer, ${texto}`;
  return texto;
}

const horaDe = (fechaHoraIso) => new Date(fechaHoraIso).toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit' });

/** Rojo lo que un auditor busca primero: seguridad, anulaciones y rechazos de Hacienda. */
function insigniaModulo(r) {
  const alerta = r.modulo === 'SEGURIDAD' || r.modulo === 'ANULACIONES' || r.accion === 'RECHAZADO';
  return `<span class="insignia ${alerta ? 'insignia-error' : 'insignia-apagada'}">${nombreModulo(r.modulo)}</span>`;
}

const quien = (r) => (r.nombreUsuario
  ? `<span class="ini" aria-hidden="true">${escapar(iniciales(r.nombreUsuario))}</span><span class="truncate">${escapar(r.nombreUsuario)}</span>`
  : '<span class="ini bg-transparent text-texto-secundario" aria-hidden="true">·</span><span class="text-texto-secundario">Sistema</span>');

const panel = crearPanel({
  panel: panelEl,
  fondo: $('fondo-panel'),
  vacio: `${icono('bitacora', 'mx-auto mb-3 size-8 text-texto-deshabilitado')}<p>Elige un registro para ver qué cambió.</p>`,
  alCerrar: () => {
    estado.idSeleccionado = null;
    marcarSeleccionado();
    return true;
  },
});

// --- Lista -------------------------------------------------------------------

function htmlFila(r) {
  return `<button type="button" data-id="${r.idBitacora}" class="fila-b min-h-12 w-full cursor-pointer border-b border-neutro-100 py-2 text-left text-15 hover:bg-fondo-sutil aria-[current=true]:bg-fondo-sutil aria-[current=true]:shadow-[inset_3px_0_0_var(--color-neutro-900)]">
    <span class="text-sm whitespace-nowrap text-texto-secundario tabular-nums">${horaDe(r.fechaHora)}</span>
    <span class="flex min-w-0 items-center gap-2 text-sm @max-2xl:hidden">${quien(r)}</span>
    <span class="@max-2xl:hidden">${insigniaModulo(r)}</span>
    <span class="min-w-0"><span class="block">${escapar(r.descripcion)}</span>
      <small class="text-13 text-texto-secundario @2xl:hidden">${escapar(r.nombreUsuario ?? 'Sistema')} · ${nombreModulo(r.modulo)}</small></span>
  </button>`;
}

function marcarSeleccionado() {
  for (const fila of lista.querySelectorAll('[data-id]')) {
    if (Number(fila.dataset.id) === estado.idSeleccionado) fila.setAttribute('aria-current', 'true');
    else fila.removeAttribute('aria-current');
  }
}

function pintarFiltros(conteos) {
  const modulos = Object.keys(MODULOS).filter((m) => conteos[m] || m === estado.modulo);
  $('filtros').innerHTML = [['', 'Todo', conteos.todo], ...modulos.map((m) => [m, nombreModulo(m, true), conteos[m] ?? 0])]
    .map(([valor, texto, n]) => `<button type="button" class="filtro" data-modulo="${valor}" aria-pressed="${valor === estado.modulo}">${texto} <span>${numero(n)}</span></button>`)
    .join('');
}

function pintarPersonas(personas) {
  const select = $('persona');
  const opciones = [...personas.map((p) => [p.idUsuario, p.nombreCompleto]), ['sistema', 'Sistema']];
  // La persona elegida se queda en la lista aunque ese día no tenga registros
  if (estado.idUsuario && !opciones.some(([v]) => String(v) === estado.idUsuario)) opciones.unshift([estado.idUsuario, select.selectedOptions[0]?.textContent ?? '']);
  select.innerHTML = `<option value="">Todas</option>${opciones.map(([v, t]) => `<option value="${escapar(v)}" ${String(v) === estado.idUsuario ? 'selected' : ''}>${escapar(t)}</option>`).join('')}`;
}

async function cargar({ mas = false } = {}) {
  estado.pagina = mas ? estado.pagina + 1 : 0;
  const idPeticion = ++estado.peticion;
  const estadoLista = $('lista-estado');
  if (!mas) {
    $('titulo-dia').textContent = tituloDia(estado.fecha);
    $('fecha').value = estado.fecha;
    $('dia-siguiente').disabled = estado.fecha >= fechaIso();
    history.replaceState(null, '', estado.fecha === fechaIso() ? location.pathname : `${location.pathname}?fecha=${estado.fecha}`);
  }
  lista.setAttribute('aria-busy', 'true');
  try {
    const { contenido, totalElementos, conteos, personas } = await listarBitacora({
      fecha: estado.fecha, modulo: estado.modulo, idUsuario: estado.idUsuario, buscar: estado.buscar, pagina: estado.pagina,
    });
    if (idPeticion !== estado.peticion) return; // llegó una respuesta más nueva
    const filas = contenido.map(htmlFila).join('');
    if (mas) lista.insertAdjacentHTML('beforeend', filas);
    else lista.innerHTML = filas;
    marcarSeleccionado();
    pintarFiltros(conteos);
    pintarPersonas(personas);

    const vacia = lista.children.length === 0;
    estadoLista.classList.toggle('hidden', !vacia);
    estadoLista.textContent = estado.buscar || estado.idUsuario || estado.modulo
      ? 'Ningún registro coincide con estos filtros.'
      : 'No hay registros este día.';
    $('cargar-mas').classList.toggle('hidden', lista.children.length >= totalElementos);
    $('exportar').disabled = vacia;
  } catch (error) {
    if (idPeticion !== estado.peticion) return;
    lista.innerHTML = '';
    estadoLista.classList.remove('hidden');
    estadoLista.innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

function irA(fecha) {
  if (!fecha || fecha > fechaIso()) return;
  estado.fecha = fecha;
  estado.idSeleccionado = null;
  panel.cerrar();
  cargar();
}

// --- Detalle -----------------------------------------------------------------

const ETIQUETAS = {
  estado: 'Estado', motivo: 'Motivo', total: 'Total', formaPago: 'Forma de pago', horaInicio: 'Hora', formulaColor: 'Fórmula de color',
  existencia: 'Existencia', fondoInicial: 'Fondo inicial', esperado: 'Esperado', contado: 'Contado', productos: 'Productos',
  comisionServicioPct: 'Comisión por servicio (%)', nombreUsuario: 'Usuario', rol: 'Rol', precio: 'Precio',
  selloRecepcion: 'Sello de recepción', observacion: 'Observación',
};
const ENTIDADES = {
  DTE: 'Documento', VENTA: 'Venta', CITA: 'Cita', CLIENTE: 'Cliente', PRODUCTO: 'Producto', CAJA: 'Caja', USUARIO: 'Usuario',
  COMPRA: 'Compra', PARAMETRO: 'Parámetro', EMPLEADO: 'Empleado', PLANILLA: 'Planilla', SERVICIO: 'Servicio',
};
const DINERO = new Set(['total', 'fondoInicial', 'esperado', 'contado', 'precio', 'precioVenta', 'costoUnitario']);

const etiqueta = (clave) => ETIQUETAS[clave] ?? clave.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (c) => c.toUpperCase());

function valor(clave, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number' && DINERO.has(clave)) return dinero(v);
  if (typeof v === 'string' && /^[A-Z_]+$/.test(v)) return (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, ' '); // ACEPTADA → Aceptada
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Solo los datos que cambiaron (o que aparecen de un solo lado). */
function htmlCambios(antes, despues) {
  if (!antes && !despues) return '<p class="text-texto-secundario">Esta acción no cambia datos.</p>';
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])]
    .filter((k) => JSON.stringify(antes?.[k]) !== JSON.stringify(despues?.[k]));
  if (!claves.length) return '<p class="text-texto-secundario">Sin diferencias.</p>';
  return `<table class="w-full text-sm">
    <thead class="text-left text-13 text-texto-secundario"><tr><th scope="col" class="py-1 pr-3 font-semibold">Dato</th><th scope="col" class="py-1 pr-3 font-semibold">Antes</th><th scope="col" class="py-1 font-semibold">Después</th></tr></thead>
    <tbody>${claves.map((k) => `<tr class="border-t border-neutro-100 align-top">
      <th scope="row" class="py-1.5 pr-3 text-left font-semibold">${escapar(etiqueta(k))}</th>
      <td class="py-1.5 pr-3 text-texto-secundario">${escapar(valor(k, antes?.[k]))}</td>
      <td class="py-1.5">${escapar(valor(k, despues?.[k]))}</td></tr>`).join('')}</tbody>
  </table>`;
}

async function mostrarDetalle(idBitacora) {
  estado.idSeleccionado = Number(idBitacora);
  marcarSeleccionado();
  panel.abrir();
  panelEl.innerHTML = '<p class="m-auto p-6 text-texto-secundario">Cargando…</p>';
  let r;
  try {
    r = await obtenerRegistro(idBitacora);
  } catch (error) {
    panelEl.innerHTML = `${htmlCabecera('Bitácora', '')}${htmlError(error.message)}`;
    return;
  }
  if (estado.idSeleccionado !== r.idBitacora) return;

  const enlace = r.entidad === 'PRODUCTO' ? `<a class="btn btn-secundario" href="inventario.html?idProducto=${encodeURIComponent(r.entidadId)}">Ver el producto</a>` : '';
  panelEl.innerHTML = `
    ${htmlCabecera(r.descripcion, `${escapar(fechaHora(r.fechaHora))} · ${escapar(r.nombreUsuario ?? 'Sistema')}`, { antes: `<div class="mb-2">${insigniaModulo(r)}</div>` })}
    <dl class="datos">
      <dt>Acción</dt><dd class="font-mono text-sm">${escapar(r.accion)}</dd>
      ${r.entidadId ? `<dt>Registro</dt><dd>${escapar(ENTIDADES[r.entidad] ?? r.entidad)}<small class="font-mono break-all">${escapar(r.entidadId)}</small></dd>` : ''}
      <dt>Equipo</dt><dd>${r.equipo ? escapar(r.equipo) : '<span class="text-texto-secundario">Lo hizo el sistema</span>'}</dd>
    </dl>
    <div class="separa"></div>
    <div class="panel-seccion"><h3 class="panel-titulo">Qué cambió</h3>${htmlCambios(r.datosAntes, r.datosDespues)}</div>
    <div class="mt-auto flex flex-col gap-3 border-t border-borde-default px-6 pt-4 pb-6 max-xl:mt-6">
      ${enlace}
      <p class="flex gap-2 text-13 text-texto-secundario">${icono('candado', 'mt-0.5 size-4')}<span>La bitácora no se edita ni se borra. Nadie, ni la administradora, puede cambiar un registro.</span></p>
    </div>`;
  panel.enfocarTitulo();
}

// --- Exportar ----------------------------------------------------------------

/** Excel (.xlsx) y no CSV: un CSV se abre en una sola columna si Windows usa punto y coma como separador. */
async function exportar(boton) {
  const texto = boton.innerHTML;
  boton.disabled = true;
  boton.textContent = 'Preparando…';
  try {
    const registros = await todoElDia({ fecha: estado.fecha, modulo: estado.modulo, idUsuario: estado.idUsuario, buscar: estado.buscar });
    const filas = [['Fecha y hora', 'Quién', 'Módulo', 'Acción', 'Registro', 'Qué pasó'],
      ...registros.map((r) => [`${estado.fecha} ${horaDe(r.fechaHora)}`, r.nombreUsuario ?? 'Sistema', nombreModulo(r.modulo), r.accion, r.entidadId, r.descripcion])];
    const archivo = crearXlsx(filas, { hoja: `Bitácora ${estado.fecha}`, anchos: [20, 18, 14, 24, 34, 90] });
    descargar(`bitacora-${estado.fecha}${estado.modulo ? `-${estado.modulo.toLowerCase()}` : ''}.xlsx`, archivo);
  } catch (error) {
    alert(error.message);
  } finally {
    boton.disabled = false;
    boton.innerHTML = texto;
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion) {
  $('dia-anterior').innerHTML = icono('izquierda');
  $('dia-siguiente').innerHTML = icono('derecha');
  $('exportar').innerHTML = `${icono('descargar')}Exportar día`;
  $('fecha').max = fechaIso();

  $('dia-anterior').addEventListener('click', () => irA(fechaIso(estado.fecha, -1)));
  $('dia-siguiente').addEventListener('click', () => irA(fechaIso(estado.fecha, 1)));
  $('hoy').addEventListener('click', () => irA(fechaIso()));
  $('fecha').addEventListener('change', (e) => irA(e.target.value));

  $('persona').addEventListener('change', (e) => { estado.idUsuario = e.target.value; cargar(); });
  let espera;
  $('buscar').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.buscar = e.target.value.trim(); cargar(); }, 250);
  });
  $('filtros').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-modulo]');
    if (!boton) return;
    estado.modulo = boton.dataset.modulo;
    cargar();
  });
  $('cargar-mas').addEventListener('click', () => cargar({ mas: true }));
  $('exportar').addEventListener('click', (e) => exportar(e.currentTarget));

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila) return;
    panel.abrir(fila);
    mostrarDetalle(fila.dataset.id);
  });
  panelEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="cerrar"]')) panel.cerrar();
  });

  const fechaUrl = new URLSearchParams(location.search).get('fecha');
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaUrl ?? '') && fechaUrl <= fechaIso()) estado.fecha = fechaUrl;
  cargar();
}
