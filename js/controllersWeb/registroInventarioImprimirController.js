/**
 * registroInventarioImprimirController.js — Ligia Manzano Salón
 * Registro de control de inventarios para imprimir en hojas carta horizontales y foliadas (art. 142-A del Código Tributario
 * y art. 81 de su Reglamento): encabezado con contribuyente, NIT y NRC en cada folio, el producto como subtítulo, cada producto
 * en folios propios, y al final el nombre y la firma del contador.
 *
 * URL: registro-inventario-imprimir.html?periodo=2026-11[&idProducto=3]
 * Se abre desde registro-inventario.html ("Imprimir registro").
 */
import { exigirSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { escapar, fechaIso, mesAnio } from '../utils/formato.js';
import { CLAVE_CONTADOR, repartir, htmlHoja, montarBarra, pieFirma, folioGuardado, leerLocal, guardarLocal, fechaDMY, montoHoja } from '../utils/hojas.js';
import { obtenerRegistro, filasDeProducto, totalesProducto } from '../services/registroInventarioService.js';

const sesion = exigirSesion();
const $ = (id) => document.getElementById(id);

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const MES_ACTUAL = fechaIso().slice(0, 7);

/** El subtítulo del producto le quita una fila a la hoja (15 de 16). Reserva: totales (1) y, en el último producto, también la firma (2). */
const FILAS_POR_HOJA = 15;
const CLAVE_FOLIO = 'lms.libro-folio.inventario';

const estado = { datos: null, periodo: MES_ACTUAL, idProducto: '', folio: 1, contador: '' };

// --- Columnas ----------------------------------------------------------------

const unidades = (n) => (n ? String(n) : '');
const valor = (n) => (n ? montoHoja(n) : '');
const dos = (a, b) => `<b class="block truncate font-medium">${escapar(a)}</b><small class="hoja-linea2">${escapar(b)}</small>`;

const GRILLA = '8mm 17mm 1fr 1.1fr 1.2fr 1fr 16mm repeat(3, 15mm) repeat(3, 17mm)';
const COLUMNAS = [
  { h: 'N.º', c: (r) => r.correlativo },
  { h: 'Fecha', c: (r) => (r.fecha ? fechaDMY(r.fecha) : '') },
  { h: 'Operación', c: (r) => escapar(r.descripcionOperacion) },
  { h: 'Documento', c: (r) => (r.tipoDocumento ? dos(r.tipoDocumento, r.numeroDocumento ?? '') : '') },
  { h: 'Proveedor', c: (r) => (r.proveedor ? dos(r.proveedor, r.nacionalidadProveedor ?? '') : '') },
  // "Libro de compras 11/2026, compra C-0157" o "Lote 103 (compra C-0152)": en dos líneas
  { h: 'Ref. del costo', c: (r) => { const [a, b = ''] = (r.referenciaCosto ?? '').replace(/\)$/, '').split(/, | \(/); return a ? dos(a, b) : ''; } },
  { h: 'Costo unit.', num: true, c: (r) => (r.costoUnitario === undefined ? '' : montoHoja(r.costoUnitario)) },
  { h: 'Entr. u', num: true, c: (r) => unidades(r.entradaUnidades) },
  { h: 'Sal. u', num: true, c: (r) => unidades(r.salidaUnidades) },
  { h: 'Saldo u', num: true, c: (r) => r.saldoUnidades },
  { h: 'Entr. $', num: true, c: (r) => valor(r.entradaValor) },
  { h: 'Sal. $', num: true, c: (r) => valor(r.salidaValor) },
  { h: 'Saldo $', num: true, c: (r) => montoHoja(r.saldoValor) },
];

// --- Hojas -------------------------------------------------------------------

/** Cada producto empieza en un folio nuevo; los totales y saldo final van en su última hoja y la firma, al final de todo. */
function folios() {
  const productos = estado.datos.productos;
  return productos.flatMap((p, k) => {
    const ultimoProducto = k === productos.length - 1;
    const grupos = repartir(filasDeProducto(p), ultimoProducto ? 2 : 1, FILAS_POR_HOJA);
    return grupos.map((filas, i) => ({ p, filas, ultima: i === grupos.length - 1, final: ultimoProducto && i === grupos.length - 1 }));
  });
}

function htmlFolio({ p, filas, ultima, final }, folio) {
  const t = totalesProducto(p);
  const totales = ['', '', '', '', '', 'Totales', '', unidades(t.entradaUnidades) || '0', unidades(t.salidaUnidades) || '0', t.saldoUnidades,
    montoHoja(t.entradaValor), montoHoja(t.salidaValor), montoHoja(t.saldoValor)];
  return htmlHoja({
    emisor: estado.datos.emisor, titulo: 'Registro de control de inventarios', derecha: `Mes: ${mesAnio(`${estado.datos.periodo}-01`)}`, folio,
    subtitulo: `Producto: <b class="font-semibold">${escapar(p.nombreProducto)}</b> · Código ${escapar(p.codigo)} · Marca ${escapar(p.marca)} · Unidad de medida ${escapar(p.unidadMedida)}`,
    grilla: GRILLA, columnas: COLUMNAS, filas, totales: ultima ? totales : null, pie: final ? pieFirma(estado.contador) : '',
  });
}

function pintar() {
  if (!estado.datos) return;
  const lista = folios();
  $('hojas').innerHTML = lista.map((f, i) => htmlFolio(f, estado.folio + i)).join('');
  $('siguiente').textContent = `Siguiente folio: ${estado.folio + lista.length}`;
}

const aviso = (icon, clase, html) => { $('hojas').innerHTML = `<div class="aviso ${clase} mx-auto max-w-xl">${icono(icon)}<p>${html}</p></div>`; };

async function iniciar() {
  const params = new URLSearchParams(location.search);
  if (/^\d{4}-\d{2}$/.test(params.get('periodo') ?? '') && params.get('periodo') <= MES_ACTUAL) estado.periodo = params.get('periodo');
  if (/^\d+$/.test(params.get('idProducto') ?? '')) estado.idProducto = params.get('idProducto');
  estado.folio = folioGuardado(CLAVE_FOLIO);
  estado.contador = leerLocal(CLAVE_CONTADOR) ?? '';

  montarBarra($('barra'), {
    volverHref: `registro-inventario.html?periodo=${estado.periodo}${estado.idProducto ? `&idProducto=${estado.idProducto}` : ''}`, volverTexto: 'Registro de inventarios',
    estado, alCambiar: pintar,
    alImprimir: () => {
      guardarLocal(CLAVE_CONTADOR, estado.contador);
      guardarLocal(CLAVE_FOLIO, String(estado.folio + folios().length)); // último folio usado + 1
    },
  });
  try {
    estado.datos = await obtenerRegistro(estado.periodo, estado.idProducto);
    if (!estado.datos.productos.length) aviso('advertencia', 'aviso-aviso', 'No hay movimientos ni existencias en este mes: no hay nada que imprimir.');
    else pintar();
  } catch (error) {
    aviso('alerta', 'aviso-error', escapar(error.message));
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('barra').remove();
  aviso('candado', 'aviso-info', '<b class="block font-semibold">El registro de inventarios es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.');
} else if (sesion) {
  iniciar();
}
