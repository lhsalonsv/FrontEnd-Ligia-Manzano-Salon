/**
 * libroImpresoController.js — Ligia Manzano Salón
 * Libro de IVA para imprimir en hojas carta horizontales y foliadas (arts. 82, 83, 85, 86 y 88 del Reglamento
 * del Código Tributario): encabezado con contribuyente, NIT y NRC en cada folio, filas, totales, resumen y firma del contador.
 *
 * URL: libro-iva-imprimir.html?periodo=2026-11&libro=contribuyentes|consumidor|compras
 * Se abre desde libros-iva.html ("Imprimir libro").
 */
import { exigirSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { escapar, fechaIso, mesAnio, nrcConGuion } from '../utils/formato.js';
import { centavos } from '../utils/calculos.js';
import { CLAVE_CONTADOR, repartir, htmlHoja, montarBarra, pieFirma, folioGuardado, leerLocal, guardarLocal, fechaDMY as fecha, montoHoja as monto } from '../utils/hojas.js';
import { obtenerLibros } from '../services/librosIvaService.js';

const sesion = exigirSesion();
const $ = (id) => document.getElementById(id);

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
const MES_ACTUAL = fechaIso().slice(0, 7);

const claveFolio = (libro) => `lms.libro-folio.${libro}`;

// --- Formatos ----------------------------------------------------------------

const TIPO = { '01': 'Factura', '03': 'CCF', '05': 'NC', '06': 'ND' };

/** Suma de un campo con el signo de la fila (las notas de crédito restan; las anulaciones ya vienen en negativo). */
const suma = (filas, campo) => centavos(filas.reduce((s, r) => s + (r.signo ?? 1) * (r[campo] ?? 0), 0));
const sumaDe = (campo) => (filas) => suma(filas, campo);
const dinero = (campo) => ({ num: true, c: (r) => monto((r.signo ?? 1) * (r[campo] ?? 0)), suma: sumaDe(campo) });
const dos = (a, b) => `<b class="block truncate font-medium">${escapar(a)}</b><small class="hoja-linea2">${escapar(b)}</small>`;

// --- Los 3 libros ------------------------------------------------------------

const LIBROS = {
  contribuyentes: {
    clave: 'ventasContribuyentes', titulo: 'Libro de ventas a contribuyentes (art. 85)', reserva: 5,
    grilla: '8mm 18mm 1.4fr 1fr 18mm repeat(5, 19mm)',
    columnas: [
      { h: 'N.º', c: (r) => r.correlativo },
      { h: 'Fecha', c: (r) => fecha(r.fecha) },
      { h: 'Documento', c: (r) => dos(`${TIPO[r.tipoDocumento]} ${r.numeroResolucion}`, r.numeroDocumento) },
      { h: 'Cliente', c: (r) => escapar(r.nombre) },
      { h: 'NRC', c: (r) => escapar(nrcConGuion(r.nrc)) },
      { h: 'Exentas', ...dinero('ventasExentas') },
      { h: 'Gravadas', ...dinero('ventasGravadas') },
      { h: 'Débito fiscal', ...dinero('debitoFiscal') },
      { h: 'IVA percibido', ...dinero('ivaPercibido') },
      { h: 'Total', ...dinero('totalVentas') },
    ],
    resumen: (d) => {
      const v = d.ventasContribuyentes;
      const cf = d.consumidorFinal;
      const cfIva = suma(cf, 'ivaIncluido');
      const a = [suma(v, 'ventasExentas'), suma(v, 'ventasGravadas'), suma(v, 'debitoFiscal')];
      const b = [suma(cf, 'ventasExentas'), centavos(suma(cf, 'ventasGravadas') - cfIva), cfIva];
      return {
        cabecera: ['', 'Exentas', 'Gravadas', 'Débito fiscal'],
        filas: [['Ventas a contribuyentes', ...a], ['Ventas a consumidores finales', ...b], ['Total', ...a.map((n, i) => centavos(n + b[i]))]],
      };
    },
  },
  consumidor: {
    clave: 'consumidorFinal', titulo: 'Libro de ventas a consumidores finales (art. 83)', reserva: 5,
    grilla: '18mm 20mm 1.3fr 1.3fr repeat(4, 20mm)',
    columnas: [
      { h: 'Fecha', c: (r) => fecha(r.fecha) },
      { h: 'Estab.', c: (r) => escapar(r.establecimiento) },  // código de establecimiento y punto de venta (M001P001)
      { h: 'Del', c: (r) => dos(r.esAnulacion ? `Anulación de factura del ${fecha(r.fechaDocumento)}` : r.numeroControlDel, r.delDocumento) },
      { h: 'Al', c: (r) => dos(r.numeroControlAl, r.alDocumento) },
      { h: 'Exentas', ...dinero('ventasExentas') },
      { h: 'Gravadas (con IVA)', ...dinero('ventasGravadas') },
      { h: 'Exportaciones', num: true, c: () => monto(0), suma: () => 0 },
      { h: 'Total del día', ...dinero('totalVentas') },
    ],
    resumen: (d) => {
      const grav = suma(d.consumidorFinal, 'ventasGravadas');
      const iva = suma(d.consumidorFinal, 'ivaIncluido');
      return {
        cabecera: ['Resumen del débito fiscal (art. 83)', 'Monto'],
        filas: [['Ventas gravadas con IVA', grav], ['IVA incluido (débito fiscal)', iva], ['Ventas netas', centavos(grav - iva)]],
        nota: 'Este débito fiscal pasa al libro de ventas a contribuyentes.',
      };
    },
  },
  compras: {
    clave: 'compras', titulo: 'Libro de compras (art. 86)', reserva: 3,
    grilla: '8mm 18mm 1.2fr 18mm 1fr repeat(5, 19mm)',
    columnas: [
      { h: 'N.º', c: (r) => r.correlativo },
      { h: 'Fecha', c: (r) => fecha(r.fecha) },
      { h: 'Documento', c: (r) => dos(TIPO[r.tipoDocumento], r.numeroDocumento) },
      { h: 'NRC', c: (r) => escapar(nrcConGuion(r.nrc)) },
      { h: 'Proveedor', c: (r) => escapar(r.nombre) },
      { h: 'Exentas', ...dinero('comprasExentas') },
      { h: 'Gravadas', ...dinero('comprasGravadas') },
      { h: 'Crédito fiscal', ...dinero('creditoFiscal') },
      { h: 'IVA percibido', ...dinero('ivaPercibido') },
      { h: 'Total', ...dinero('totalDocumento') },
    ],
    resumen: null,
  },
};

const estado = { datos: null, periodo: MES_ACTUAL, libro: 'contribuyentes', folio: 1, contador: '' };

// --- Hojas -------------------------------------------------------------------

function htmlResumen(resumen) {
  const [primera, ...otras] = resumen.cabecera;
  return `<table class="hoja-resumen">
    <thead><tr><th>${escapar(primera)}</th>${otras.map((t) => `<th>${escapar(t)}</th>`).join('')}</tr></thead>
    <tbody>${resumen.filas.map(([nombre, ...montos]) => `<tr><td>${escapar(nombre)}</td>${montos.map((n) => `<td>${monto(n)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>${resumen.nota ? `<p class="mt-1 text-xs text-texto-secundario">${escapar(resumen.nota)}</p>` : ''}`;
}

function htmlHojaLibro(libro, filas, ultima, folio) {
  const { emisor, periodo } = estado.datos;
  const columnas = libro.columnas;
  const primeraSuma = columnas.findIndex((c) => c.suma);
  const totales = columnas.map((c, i) => (c.suma ? monto(c.suma(estado.datos[libro.clave])) : i === primeraSuma - 1 ? 'Totales' : ''));
  return htmlHoja({
    emisor, titulo: libro.titulo, derecha: `Mes: ${mesAnio(`${periodo}-01`)}`, folio, grilla: libro.grilla, columnas, filas,
    totales: ultima ? totales : null,
    pie: ultima ? `${libro.resumen ? `<div class="mt-3">${htmlResumen(libro.resumen(estado.datos))}</div>` : ''}
    ${pieFirma(estado.contador)}` : '',
  });
}

/** Hojas del libro con el primer folio de la barra. */
function hojas() {
  const libro = LIBROS[estado.libro];
  const grupos = repartir(estado.datos[libro.clave], libro.reserva);
  return { libro, grupos };
}

function pintar() {
  if (!estado.datos) return;
  const { libro, grupos } = hojas();
  $('hojas').innerHTML = grupos.map((filas, i) => htmlHojaLibro(libro, filas, i === grupos.length - 1, estado.folio + i)).join('');
  $('siguiente').textContent = `Siguiente folio: ${estado.folio + grupos.length}`;
}

function pintarBarra() {
  montarBarra($('barra'), {
    volverHref: `libros-iva.html?periodo=${estado.periodo}&libro=${estado.libro}`, volverTexto: 'Libros de IVA', estado, alCambiar: pintar,
    alImprimir: () => {
      guardarLocal(CLAVE_CONTADOR, estado.contador);
      guardarLocal(claveFolio(estado.libro), String(estado.folio + hojas().grupos.length)); // último folio usado + 1
    },
  });
}

const aviso = (icon, clase, html) => { $('hojas').innerHTML = `<div class="aviso ${clase} mx-auto max-w-xl">${icono(icon)}<p>${html}</p></div>`; };

async function iniciar() {
  const params = new URLSearchParams(location.search);
  if (/^\d{4}-\d{2}$/.test(params.get('periodo') ?? '') && params.get('periodo') <= MES_ACTUAL) estado.periodo = params.get('periodo');
  if (LIBROS[params.get('libro')]) estado.libro = params.get('libro');
  estado.folio = folioGuardado(claveFolio(estado.libro));
  estado.contador = leerLocal(CLAVE_CONTADOR) ?? '';

  pintarBarra();
  try {
    estado.datos = await obtenerLibros(estado.periodo);
    pintar();
  } catch (error) {
    aviso('alerta', 'aviso-error', escapar(error.message));
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('barra').remove();
  aviso('candado', 'aviso-info', '<b class="block font-semibold">Los libros de IVA son de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.');
} else if (sesion) {
  iniciar();
}
