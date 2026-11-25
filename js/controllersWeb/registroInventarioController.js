/**
 * registroInventarioController.js — Ligia Manzano Salón
 * Pantalla Registro de control de inventarios (solo lectura; art. 142-A del Código Tributario y art. 81 de su Reglamento):
 * por producto y mes, el saldo inicial, cada movimiento del kardex con unidades y costos PEPS, los totales y el saldo final.
 * Se descarga en Excel o se imprime foliado (registro-inventario-imprimir.html).
 *
 * URL: registro-inventario.html?periodo=2026-11[&idProducto=3]
 */
import { montarLayout } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, numero, fechaCorta, fechaIso, mesAnio } from '../utils/formato.js';
import { centavos } from '../utils/calculos.js';
import { crearXlsx, descargar } from '../utils/xlsx.js';
import { obtenerRegistro, filasDeProducto, totalesProducto } from '../services/registroInventarioService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);

/** Quién entra (la API también responde 403). Recepción no ve el registro. */
const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const MES_ACTUAL = fechaIso().slice(0, 7);

const estado = { periodo: MES_ACTUAL, idProducto: '', datos: null, opciones: [], peticion: 0 };

const tituloMes = (periodo) => mesAnio(`${periodo}-01`);
const sumarMeses = (periodo, n) => fechaIso(new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
const unidades = (n) => (n ? numero(n) : '');
const valor = (n) => (n ? dinero(n) : '');

// --- Tabla de cada producto --------------------------------------------------

const COLUMNAS = [
  ['N.º', ''], ['Fecha', ''], ['Operación', ''], ['Documento', ''], ['Proveedor', ''], ['Ref. del costo', ''], ['Costo unitario', 'text-right'],
  ['Entradas u', 'text-right'], ['Salidas u', 'text-right'], ['Saldo u', 'text-right'], ['Entradas $', 'text-right'], ['Salidas $', 'text-right'], ['Saldo $', 'text-right'],
];
const dos = (a, b) => `<b class="block font-semibold">${escapar(a ?? '')}</b><small class="block text-13 text-texto-secundario">${escapar(b ?? '')}</small>`;
const td = (contenido, clase = '') => `<td class="px-3 py-2 align-top ${clase}">${contenido}</td>`;

function htmlFila(m) {
  if (m.esSaldoInicial) {
    return `<tr class="border-b border-neutro-100 bg-fondo-sutil font-semibold">${td('')}${td('')}${td('Saldo inicial')}${td('')}${td('')}${td('')}${td('')}${td('')}${td('')}${td(numero(m.saldoUnidades), 'text-right')}${td('')}${td('')}${td(dinero(m.saldoValor), 'text-right')}</tr>`;
  }
  return `<tr class="border-b border-neutro-100">
    ${td(m.correlativo)}${td(fechaCorta(m.fecha), 'whitespace-nowrap')}${td(escapar(m.descripcionOperacion))}
    ${td(dos(m.tipoDocumento, m.numeroDocumento))}${td(m.proveedor ? dos(m.proveedor, m.nacionalidadProveedor) : '')}${td(escapar(m.referenciaCosto ?? ''))}
    ${td(dinero(m.costoUnitario), 'text-right')}${td(unidades(m.entradaUnidades), 'text-right')}${td(unidades(m.salidaUnidades), 'text-right')}${td(numero(m.saldoUnidades), 'text-right')}
    ${td(valor(m.entradaValor), 'text-right')}${td(valor(m.salidaValor), 'text-right')}${td(dinero(m.saldoValor), 'text-right')}
  </tr>`;
}

function htmlProducto(p) {
  const t = totalesProducto(p);
  return `<article class="tarjeta overflow-hidden rounded-grande">
    <header class="border-b border-borde-default px-4 py-3">
      <h3 class="font-semibold">${escapar(p.nombreProducto)}</h3>
      <p class="text-13 text-texto-secundario">Código ${escapar(p.codigo)} · ${escapar(p.marca)} · ${escapar(p.unidadMedida)}</p>
    </header>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[1200px] text-sm tabular-nums">
        <thead class="bg-fondo-sutil text-13 text-texto-secundario"><tr class="border-b border-borde-default">${COLUMNAS.map(([h, clase]) => `<th scope="col" class="px-3 py-2 font-semibold ${clase || 'text-left'}">${h}</th>`).join('')}</tr></thead>
        <tbody>${filasDeProducto(p).map(htmlFila).join('')}</tbody>
        <tfoot><tr class="bg-fondo-sutil font-semibold">
          ${td('')}${td('')}${td('Totales del mes y saldo final')}${td('')}${td('')}${td('')}${td('')}
          ${td(numero(t.entradaUnidades), 'text-right')}${td(numero(t.salidaUnidades), 'text-right')}${td(numero(t.saldoUnidades), 'text-right')}
          ${td(dinero(t.entradaValor), 'text-right')}${td(dinero(t.salidaValor), 'text-right')}${td(dinero(t.saldoValor), 'text-right')}
        </tr></tfoot>
      </table>
    </div>
  </article>`;
}

function pintarOpciones() {
  $('producto').innerHTML = `<option value="">Todos los productos</option>${estado.opciones
    .map((p) => `<option value="${p.idProducto}">${escapar(p.nombreProducto)} · ${escapar(p.codigo)}</option>`).join('')}`;
  $('producto').value = estado.idProducto;
}

function pintar() {
  const productos = estado.datos.productos;
  $('productos').innerHTML = productos.map(htmlProducto).join('');
  $('lista-estado').classList.toggle('hidden', productos.length > 0);
  $('lista-estado').textContent = `No hay movimientos ni existencias${estado.idProducto ? ' de ese producto' : ''} en ${tituloMes(estado.periodo)}.`;
  $('descargar-excel').disabled = productos.length === 0;
  $('imprimir').disabled = productos.length === 0;
  history.replaceState(null, '', `${location.pathname}?${parametros()}`);
}

const parametros = () => {
  const params = new URLSearchParams({ periodo: estado.periodo });
  if (estado.idProducto) params.set('idProducto', estado.idProducto);
  return params;
};

async function cargar() {
  const id = ++estado.peticion;
  $('titulo-mes').textContent = tituloMes(estado.periodo);
  $('mes').value = estado.periodo;
  $('mes-siguiente').disabled = estado.periodo >= MES_ACTUAL;
  $('productos').setAttribute('aria-busy', 'true');
  try {
    const datos = await obtenerRegistro(estado.periodo, estado.idProducto);
    if (id !== estado.peticion) return;
    estado.datos = datos;
    if (!estado.idProducto) { // la lista del filtro sale de la respuesta sin filtrar
      estado.opciones = datos.productos;
      pintarOpciones();
    }
    pintar();
  } catch (error) {
    if (id !== estado.peticion) return;
    estado.datos = null;
    $('productos').innerHTML = '';
    $('descargar-excel').disabled = true;
    $('imprimir').disabled = true;
    $('lista-estado').classList.remove('hidden');
    $('lista-estado').innerHTML = `<div class="aviso aviso-error mx-auto max-w-md text-left">${icono('alerta')}<p>${escapar(error.message)}</p></div>`;
  } finally {
    $('productos').removeAttribute('aria-busy');
  }
}

// --- Excel -------------------------------------------------------------------

/** Una sola hoja con todas las filas (saldo inicial incluido), montos como número y una fila de totales. */
function descargarExcel() {
  const columnas = ['Código', 'Producto', 'Marca', 'Unidad', 'N.º', 'Fecha', 'Operación', 'Documento', 'Proveedor', 'Nacionalidad', 'Ref. del costo', 'Costo unitario',
    'Entradas u', 'Salidas u', 'Saldo u', 'Entradas $', 'Salidas $', 'Saldo $'];
  const filas = estado.datos.productos.flatMap((p) => filasDeProducto(p).map((m) => [
    p.codigo, p.nombreProducto, p.marca, p.unidadMedida, m.correlativo, m.fecha ?? '', m.descripcionOperacion,
    [m.tipoDocumento, m.numeroDocumento].filter(Boolean).join(' '), m.proveedor ?? '', m.nacionalidadProveedor ?? '', m.referenciaCosto ?? '',
    m.costoUnitario ?? '', m.entradaUnidades ?? '', m.salidaUnidades ?? '', m.saldoUnidades, m.entradaValor ?? '', m.salidaValor ?? '', m.saldoValor,
  ]));
  const sumar = [12, 13, 15, 16]; // el saldo no se suma entre productos
  const totales = columnas.map((_, i) => (i === 0 ? 'Totales' : sumar.includes(i) ? centavos(filas.reduce((s, f) => s + (f[i] || 0), 0)) : ''));
  const archivo = crearXlsx([columnas, ...filas, totales], {
    hoja: `Registro ${estado.periodo}`, anchos: [16, 32, 14, 10, 6, 12, 28, 40, 38, 14, 40, 12, 11, 11, 10, 12, 12, 12], totales: true,
  });
  descargar(`registro-inventarios-${estado.periodo}${estado.idProducto ? `-producto-${estado.idProducto}` : ''}.xlsx`, archivo);
}

// --- Eventos -----------------------------------------------------------------

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('principal').innerHTML = `<div class="p-4 sm:px-8 sm:py-6"><div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">El registro de inventarios es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.</p></div></div>`;
} else if (sesion) {
  const params = new URLSearchParams(location.search);
  if (/^\d{4}-\d{2}$/.test(params.get('periodo') ?? '') && params.get('periodo') <= MES_ACTUAL) estado.periodo = params.get('periodo');
  if (/^\d+$/.test(params.get('idProducto') ?? '')) estado.idProducto = params.get('idProducto');

  $('mes-anterior').innerHTML = icono('izquierda');
  $('mes-siguiente').innerHTML = icono('derecha');
  $('mes').max = MES_ACTUAL;
  $('descargar-excel').innerHTML = `${icono('descargar')}Descargar Excel`;
  $('imprimir').innerHTML = `${icono('imprimir')}Imprimir registro`;
  $('nota').textContent = 'Registro de control de inventarios (art. 142-A del Código Tributario y art. 81 de su Reglamento). Los costos salen por PEPS: una fila por cada lote que toca la salida.';

  $('mes-anterior').addEventListener('click', () => { estado.periodo = sumarMeses(estado.periodo, -1); cargar(); });
  $('mes-siguiente').addEventListener('click', () => { estado.periodo = sumarMeses(estado.periodo, 1); cargar(); });
  $('mes').addEventListener('change', (e) => {
    if (!e.target.value || e.target.value > MES_ACTUAL) return;
    estado.periodo = e.target.value;
    cargar();
  });
  $('producto').addEventListener('change', (e) => { estado.idProducto = e.target.value; cargar(); });
  $('descargar-excel').addEventListener('click', descargarExcel);
  $('imprimir').addEventListener('click', () => window.open(`registro-inventario-imprimir.html?${parametros()}`, '_blank'));

  pintarOpciones();
  cargar();
}
