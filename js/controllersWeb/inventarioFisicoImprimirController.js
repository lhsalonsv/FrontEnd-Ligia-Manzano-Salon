/**
 * inventarioFisicoImprimirController.js — Ligia Manzano Salón
 * Acta de inventario físico para imprimir en hojas carta horizontales y foliadas (art. 142 del Código Tributario): encabezado con
 * contribuyente, NIT y NRC en cada folio, los lotes por categoría con su subtotal, el total general, las observaciones y, al final,
 * las firmas del sujeto pasivo (o su representante o apoderado) y del contador.
 *
 * URL: inventario-fisico-imprimir.html?id=2 (solo un conteo cerrado). Se abre desde inventario-fisico.html ("Imprimir acta").
 */
import { exigirSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { escapar } from '../utils/formato.js';
import { CLAVE_CONTADOR, repartir, htmlHoja, montarBarra, pieFirmas, folioGuardado, leerLocal, guardarLocal, fechaDMY, montoHoja } from '../utils/hojas.js';
import { obtenerInventarioFisico, agruparActa } from '../services/inventarioFisicoService.js';

const sesion = exigirSesion();
const $ = (id) => document.getElementById(id);

const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];
/** En la última hoja caben, además de las filas, el total general (1), las observaciones y las dos firmas (3). */
const RESERVA = 4;
const CLAVE_FOLIO = 'lms.libro-folio.inventario-fisico';

const estado = { conteo: null, acta: null, folio: 1, contador: '' };

// --- Columnas ----------------------------------------------------------------

const GRILLA = '20mm 22mm 1fr 28mm 28mm 1.2fr';
const COLUMNAS = [
  { h: 'Cantidad', num: true, c: (r) => r.tipo === 'lote' ? r.cantidad : '' },
  { h: 'Unidad', c: (r) => r.tipo === 'lote' ? escapar(r.unidadMedida) : '' },
  { h: 'Denominación y marca', c: (r) => {
    if (r.tipo === 'categoria') return `<b class="font-semibold">${escapar(r.categoria)}</b>`;
    if (r.tipo === 'subtotal') return `<b class="font-semibold">Subtotal ${escapar(r.categoria)}</b>`;
    return `<b class="block truncate font-medium">${escapar(r.nombreProducto)}</b><small class="hoja-linea2">${escapar(r.nombreMarca)}</small>`;
  } },
  { h: 'Precio unit.', num: true, c: (r) => r.tipo === 'lote' ? montoHoja(r.costoUnitario) : '' },
  { h: 'Valor total', num: true, c: (r) => r.tipo === 'lote' ? montoHoja(r.valor) : r.tipo === 'subtotal' ? `<b class="font-semibold">${montoHoja(r.subtotal)}</b>` : '' },
  { h: 'Referencia del costo', c: (r) => r.tipo === 'lote' ? `<span class="hoja-linea2">${escapar(r.referenciaCosto)}</span>` : '' },
];

// --- Hojas -------------------------------------------------------------------

/** Una fila por categoría, por lote y por subtotal, en el orden en que se leen. */
const filas = () => estado.acta.grupos.flatMap((g) => [
  { tipo: 'categoria', categoria: g.categoria }, ...g.filas.map((f) => ({ tipo: 'lote', ...f })), { tipo: 'subtotal', categoria: g.categoria, subtotal: g.subtotal },
]);

function htmlFolio(grupo, i, cantidad, folio) {
  const ultima = i === cantidad - 1;
  const { conteo } = estado;
  const observaciones = conteo.observaciones ? `<p class="mt-2 line-clamp-2 text-sm"><b class="font-semibold">Observaciones:</b> ${escapar(conteo.observaciones)}</p>` : '';
  return htmlHoja({
    emisor: conteo.emisor, titulo: `Acta de inventario físico al ${fechaDMY(conteo.fechaCorte)}`, derecha: `Fecha de corte: ${fechaDMY(conteo.fechaCorte)}`, folio,
    grilla: GRILLA, columnas: COLUMNAS, filas: grupo,
    totales: ultima ? ['', '', 'Total general', '', montoHoja(estado.acta.total), ''] : null,
    pie: ultima ? observaciones + pieFirmas([{ rotulo: 'El sujeto pasivo, su representante o apoderado', nombre: conteo.emisor.nombre }, { rotulo: 'El contador', nombre: estado.contador }]) : '',
  });
}

const hojas = () => repartir(filas(), RESERVA);

function pintar() {
  if (!estado.conteo) return;
  const lista = hojas();
  $('hojas').innerHTML = lista.map((g, i) => htmlFolio(g, i, lista.length, estado.folio + i)).join('');
  $('siguiente').textContent = `Siguiente folio: ${estado.folio + lista.length}`;
}

const aviso = (icon, clase, html) => { $('hojas').innerHTML = `<div class="aviso ${clase} mx-auto max-w-xl">${icono(icon)}<p>${html}</p></div>`; };

async function iniciar() {
  const id = new URLSearchParams(location.search).get('id');
  estado.folio = folioGuardado(CLAVE_FOLIO);
  estado.contador = leerLocal(CLAVE_CONTADOR) ?? '';

  montarBarra($('barra'), {
    volverHref: `inventario-fisico.html${/^\d+$/.test(id ?? '') ? `?id=${id}` : ''}`, volverTexto: 'Inventario físico',
    estado, alCambiar: pintar,
    alImprimir: () => {
      guardarLocal(CLAVE_CONTADOR, estado.contador);
      guardarLocal(CLAVE_FOLIO, String(estado.folio + hojas().length)); // último folio usado + 1
    },
  });
  if (!/^\d+$/.test(id ?? '')) { aviso('advertencia', 'aviso-aviso', 'Abre el acta desde «Inventario físico» con el botón «Imprimir acta».'); return; }
  try {
    estado.conteo = await obtenerInventarioFisico(id);
    if (estado.conteo.estado !== 'CERRADO') { aviso('advertencia', 'aviso-aviso', 'El acta se imprime cuando el inventario está cerrado.'); return; }
    estado.acta = agruparActa(estado.conteo.acta);
    pintar();
  } catch (error) {
    aviso('alerta', 'aviso-error', escapar(error.message));
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('barra').remove();
  aviso('candado', 'aviso-info', '<b class="block font-semibold">El inventario físico es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.');
} else if (sesion) {
  iniciar();
}
