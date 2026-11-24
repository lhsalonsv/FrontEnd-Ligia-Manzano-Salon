/**
 * librosIvaController.js — Ligia Manzano Salón
 * Pantalla Libros de IVA (solo lectura): los 4 anexos del F-07 de un mes (ventas a contribuyentes,
 * consumidor final, compras y anulados), el débito y crédito fiscal del mes, y las descargas:
 * el CSV que se sube a Hacienda y el libro en Excel para la contadora.
 *
 * URL: libros-iva.html?periodo=2026-11&libro=compras
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, numero, fechaCorta, fechaIso, mesAnio } from '../utils/formato.js';
import { centavos } from '../utils/calculos.js';
import { crearXlsx, TIPO_XLSX } from '../utils/xlsx.js';
import { obtenerLibros } from '../services/librosIvaService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);

/** Quién entra (la API también responde 403). Recepción no ve los libros. */
const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const MES_ACTUAL = fechaIso().slice(0, 7);

const estado = { periodo: MES_ACTUAL, libro: 'contribuyentes', datos: null, peticion: 0 };

const TIPO = { '01': 'Factura', '03': 'CCF', '05': 'NC', '06': 'ND' };
const TIPO_LARGO = { '01': 'Factura', '03': 'Crédito fiscal', '05': 'Nota de crédito', '06': 'Nota de débito' };
const corto = (texto, n = 4) => `…${String(texto ?? '').slice(-n)}`;
const conSigno = (r, monto) => (r.signo === -1 ? `−${dinero(monto)}` : dinero(monto));
const suma = (filas, campo, conSignoDe = true) => centavos(filas.reduce((s, r) => s + (conSignoDe ? (r.signo ?? 1) : 1) * (r[campo] ?? 0), 0));

/**
 * Cada libro: de dónde salen sus filas, cómo se ven en la lista y cómo van en el Excel.
 * archivo: nombre corto (el manual pide hasta 25 caracteres).
 */
const LIBROS = {
  contribuyentes: {
    pestana: 'Contribuyentes', titulo: 'Ventas a contribuyentes', clave: 'ventasContribuyentes', archivo: 'ventas-ccf',
    cabecera: ['Fecha', 'Documento', 'Gravado', 'IVA', 'Total'],
    fila: (r) => [fechaCorta(r.fecha),
      `<b class="block truncate font-semibold">${escapar(r.nombre)}</b><small class="text-13 text-texto-secundario">${TIPO[r.tipoDocumento]} · ${corto(r.numeroResolucion)}</small>`,
      conSigno(r, r.ventasGravadas), conSigno(r, r.debitoFiscal), conSigno(r, r.totalVentas)],
    totales: (f) => [suma(f, 'ventasGravadas'), suma(f, 'debitoFiscal'), suma(f, 'totalVentas')],
    excel: {
      columnas: ['N.º', 'Fecha', 'Tipo', 'N.º de control', 'Código de generación', 'Sello de recepción', 'NIT o NRC', 'DUI', 'Cliente',
        'Exentas', 'No sujetas', 'Gravadas', 'Débito fiscal', 'IVA retenido', 'Total'],
      anchos: [6, 12, 16, 34, 34, 42, 16, 11, 34, 11, 11, 12, 12, 12, 12],
      fila: (r) => [r.correlativo, r.fecha, TIPO_LARGO[r.tipoDocumento], r.numeroResolucion, r.numeroDocumento, r.serie, r.nitNrc, r.dui, r.nombre,
        r.signo * r.ventasExentas, r.signo * r.ventasNoSujetas, r.signo * r.ventasGravadas, r.signo * r.debitoFiscal, r.signo * r.ivaRetenido, r.signo * r.totalVentas],
      sumar: [9, 10, 11, 12, 13, 14],
    },
  },
  consumidor: {
    pestana: 'Consumidor final', titulo: 'Ventas a consumidor final', clave: 'consumidorFinal', archivo: 'ventas-cf',
    cabecera: ['Día', 'Facturas', 'Gravado con IVA', 'IVA incluido', 'Total'],
    fila: (r) => [fechaCorta(r.fecha),
      `<b class="block font-semibold">${numero(r.documentos)} ${r.documentos === 1 ? 'factura' : 'facturas'}</b><small class="block truncate font-mono text-xs text-texto-secundario">${corto(r.delDocumento, 6)} a ${corto(r.alDocumento, 6)}</small>`,
      dinero(r.ventasGravadas), dinero(r.ivaIncluido), dinero(r.totalVentas)],
    totales: (f) => [suma(f, 'ventasGravadas'), suma(f, 'ivaIncluido'), suma(f, 'totalVentas')],
    excel: {
      columnas: ['N.º', 'Fecha', 'Facturas', 'Del (código de generación)', 'Al (código de generación)', 'Exentas', 'No sujetas', 'Gravadas (con IVA)', 'IVA incluido', 'Total'],
      anchos: [6, 12, 10, 34, 34, 11, 11, 16, 12, 12],
      fila: (r) => [r.correlativo, r.fecha, r.documentos, r.delDocumento, r.alDocumento, r.ventasExentas, r.ventasNoSujetas, r.ventasGravadas, r.ivaIncluido, r.totalVentas],
      sumar: [2, 5, 6, 7, 8, 9],
    },
  },
  compras: {
    pestana: 'Compras', titulo: 'Compras', clave: 'compras', archivo: 'compras',
    cabecera: ['Fecha', 'Proveedor', 'Gravado', 'Crédito fiscal', 'Total'],
    fila: (r) => [fechaCorta(r.fecha),
      `<b class="block truncate font-semibold">${escapar(r.nombre)}</b><small class="text-13 text-texto-secundario">${TIPO[r.tipoDocumento]} · ${corto(r.numeroDocumento, 6)}</small>`,
      conSigno(r, r.comprasGravadas), conSigno(r, r.creditoFiscal), conSigno(r, r.totalDocumento)],
    totales: (f) => [suma(f, 'comprasGravadas'), suma(f, 'creditoFiscal'), suma(f, 'totalDocumento')],
    excel: {
      columnas: ['N.º', 'Fecha', 'Tipo', 'Documento', 'NIT o NRC', 'DUI', 'Proveedor', 'Exentas', 'Gravadas', 'Crédito fiscal', 'Percepción 1 %', 'Total'],
      anchos: [6, 12, 16, 34, 16, 11, 34, 11, 12, 13, 14, 12],
      fila: (r) => [r.correlativo, r.fecha, TIPO_LARGO[r.tipoDocumento], r.numeroDocumento, r.nitNrc, r.dui, r.nombre,
        r.signo * r.comprasExentas, r.signo * r.comprasGravadas, r.signo * r.creditoFiscal, r.signo * r.ivaPercibido, r.signo * r.totalDocumento],
      sumar: [7, 8, 9, 10, 11],
    },
  },
  anulados: {
    pestana: 'Anulados', titulo: 'Documentos anulados', clave: 'anulados', archivo: 'anulados',
    cabecera: ['Fecha', 'Documento', '', '', 'Estado'],
    fila: (r) => [fechaCorta(r.fecha),
      `<b class="block font-semibold">${TIPO_LARGO[r.tipoDocumento]} ${corto(r.numeroResolucion)}</b><small class="text-13 text-texto-secundario">emitida el ${fechaCorta(r.fechaDocumento)}</small>`,
      '', '', '<span class="insignia insignia-apagada">Invalidado</span>'],
    totales: null,
    excel: {
      columnas: ['N.º', 'Fecha de invalidación', 'Fecha del documento', 'Tipo', 'N.º de control', 'Código de generación', 'Sello de recepción'],
      anchos: [6, 20, 19, 16, 34, 38, 42],
      fila: (r) => [r.correlativo, r.fecha, r.fechaDocumento, TIPO_LARGO[r.tipoDocumento], r.numeroResolucion, r.codigoGeneracion, r.serie],
      sumar: [],
    },
  },
};

const tituloMes = (periodo) => mesAnio(`${periodo}-01`);
const sumarMeses = (periodo, n) => fechaIso(new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1 + n, 1)).slice(0, 7);

// --- Resumen del mes ---------------------------------------------------------

/** Débito y crédito fiscal del mes. Las notas de crédito restan. Remanente y anticipos los pone la contadora en el F-07. */
function pintarResumen(d) {
  const debito = centavos(suma(d.ventasContribuyentes, 'debitoFiscal') + suma(d.consumidorFinal, 'ivaIncluido', false));
  const credito = suma(d.compras, 'creditoFiscal');
  const percibido = suma(d.compras, 'ivaPercibido');
  const diferencia = centavos(debito - credito);
  const tarjeta = (titulo, monto, detalle) => `<div class="tarjeta rounded-grande px-4 py-3">
      <p class="text-13 text-texto-secundario">${titulo}</p>
      <p class="text-xl font-semibold tabular-nums">${dinero(monto)}</p>
      <p class="text-13 text-texto-secundario">${detalle}</p>
    </div>`;
  $('resumen').innerHTML = [
    tarjeta('Débito fiscal', debito, 'IVA de las ventas'),
    tarjeta('Crédito fiscal', credito, percibido ? `IVA de las compras · más ${dinero(percibido)} de percepción` : 'IVA de las compras'),
    tarjeta(diferencia >= 0 ? 'Diferencia a pagar' : 'Diferencia a favor', Math.abs(diferencia), 'Antes de remanente y anticipos'),
  ].join('');

  const aviso = $('aviso');
  aviso.classList.toggle('hidden', !d.pendientes.sinSello);
  aviso.classList.toggle('flex', Boolean(d.pendientes.sinSello));
  aviso.innerHTML = `${icono('advertencia')}<p>${d.pendientes.sinSello === 1 ? '1 documento del mes no tiene' : `${numero(d.pendientes.sinSello)} documentos del mes no tienen`} el sello de Hacienda. No salen en los libros hasta que Hacienda los acepte.</p>`;
}

// --- Lista del libro elegido -------------------------------------------------

const celdas = (valores) => valores.map((v, i) => {
  const clase = ['', 'min-w-0', 'text-right @max-lg:hidden', 'text-right @max-lg:hidden', 'text-right'][i];
  return `<span class="${clase}">${v}</span>`;
}).join('');

function pintarLibro() {
  const libro = LIBROS[estado.libro];
  const filas = estado.datos?.[libro.clave] ?? [];
  for (const b of $('libros').querySelectorAll('[data-libro]')) b.setAttribute('aria-pressed', String(b.dataset.libro === estado.libro));
  $('cabecera').innerHTML = celdas(libro.cabecera);
  $('lista').innerHTML = filas.map((r) => `<div class="fila-iva min-h-14 border-b border-neutro-100 py-2 text-15 tabular-nums">${celdas(libro.fila(r))}</div>`).join('');
  const vacia = filas.length === 0;
  $('lista-estado').classList.toggle('hidden', !vacia);
  $('lista-estado').textContent = `No hay documentos en ${libro.titulo.toLowerCase()} de ${tituloMes(estado.periodo)}.`;
  const totales = $('totales');
  totales.classList.toggle('hidden', vacia || !libro.totales);
  if (!vacia && libro.totales) {
    const [a, b, c] = libro.totales(filas).map(dinero);
    totales.innerHTML = celdas(['Total', `${numero(filas.length)} ${filas.length === 1 ? 'fila' : 'filas'}`, a, b, c]);
  }
  $('descargar-csv').disabled = vacia;
  $('descargar-excel').disabled = vacia;
  history.replaceState(null, '', `${location.pathname}?periodo=${estado.periodo}&libro=${estado.libro}`);
}

function pintarPestanas() {
  $('libros').innerHTML = Object.entries(LIBROS).map(([clave, l]) => {
    const n = estado.datos?.[l.clave]?.length;
    return `<button type="button" data-libro="${clave}" aria-pressed="${clave === estado.libro}" class="whitespace-nowrap">${l.pestana}${n === undefined ? '' : ` <span class="font-normal tabular-nums">${numero(n)}</span>`}</button>`;
  }).join('');
}

async function cargar() {
  const id = ++estado.peticion;
  $('titulo-mes').textContent = tituloMes(estado.periodo);
  $('mes').value = estado.periodo;
  $('mes-siguiente').disabled = estado.periodo >= MES_ACTUAL;
  $('lista').setAttribute('aria-busy', 'true');
  try {
    const datos = await obtenerLibros(estado.periodo);
    if (id !== estado.peticion) return;
    estado.datos = datos;
    pintarResumen(datos);
    pintarPestanas();
    pintarLibro();
  } catch (error) {
    if (id !== estado.peticion) return;
    estado.datos = null;
    $('resumen').innerHTML = '';
    $('lista').innerHTML = '';
    $('totales').classList.add('hidden');
    $('lista-estado').classList.remove('hidden');
    $('lista-estado').innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  } finally {
    $('lista').removeAttribute('aria-busy');
  }
}

// --- Descargas ---------------------------------------------------------------

function descargar(contenido, tipo, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** El archivo para "Subir detalle" del F-07: las líneas que arma la base, sin encabezados, separadas por punto y coma. */
function descargarCsv() {
  const libro = LIBROS[estado.libro];
  const lineas = estado.datos[libro.clave].map((r) => r.lineaCsv);
  // ponytail: UTF-8 sin BOM. Si el portal de Hacienda rechaza tildes, cambiar a Windows-1252 (pendiente de la primera carga real).
  descargar(`${lineas.join('\r\n')}\r\n`, 'text/csv;charset=utf-8', `${libro.archivo}-${estado.periodo}.csv`);
}

/** El libro para la contadora: todas las columnas, montos como número (las notas de crédito en negativo) y totales. */
function descargarExcel() {
  const libro = LIBROS[estado.libro];
  const { columnas, anchos, fila, sumar } = libro.excel;
  const filas = estado.datos[libro.clave].map(fila);
  const totales = columnas.map((_, i) => (i === 0 ? 'Totales' : sumar.includes(i) ? centavos(filas.reduce((s, f) => s + f[i], 0)) : ''));
  const archivo = crearXlsx([columnas, ...filas, ...(sumar.length ? [totales] : [])], {
    hoja: `${libro.titulo} ${estado.periodo}`, anchos, totales: sumar.length > 0,
  });
  descargar(archivo, TIPO_XLSX, `libro-${libro.archivo}-${estado.periodo}.xlsx`);
}

// --- Eventos -----------------------------------------------------------------

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">Los libros de IVA son de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  const params = new URLSearchParams(location.search);
  if (/^\d{4}-\d{2}$/.test(params.get('periodo') ?? '') && params.get('periodo') <= MES_ACTUAL) estado.periodo = params.get('periodo');
  if (LIBROS[params.get('libro')]) estado.libro = params.get('libro');

  $('mes-anterior').innerHTML = icono('izquierda');
  $('mes-siguiente').innerHTML = icono('derecha');
  $('mes').max = MES_ACTUAL;
  $('descargar-csv').innerHTML = `${icono('descargar')}Archivo para Hacienda`;
  $('descargar-excel').innerHTML = `${icono('descargar')}Libro en Excel`;
  $('nota').textContent = 'Hecho según el manual de anexos del F-07 de Hacienda. Las notas de crédito restan. Antes de subir un archivo, revísalo con la contadora.';

  $('mes-anterior').addEventListener('click', () => { estado.periodo = sumarMeses(estado.periodo, -1); cargar(); });
  $('mes-siguiente').addEventListener('click', () => { estado.periodo = sumarMeses(estado.periodo, 1); cargar(); });
  $('mes').addEventListener('change', (e) => {
    if (!e.target.value || e.target.value > MES_ACTUAL) return;
    estado.periodo = e.target.value;
    cargar();
  });
  $('libros').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-libro]');
    if (!boton) return;
    estado.libro = boton.dataset.libro;
    pintarLibro();
  });
  $('descargar-csv').addEventListener('click', descargarCsv);
  $('descargar-excel').addEventListener('click', descargarExcel);

  pintarPestanas();
  cargar();
}
