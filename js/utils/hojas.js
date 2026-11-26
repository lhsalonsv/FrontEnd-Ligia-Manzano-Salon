/**
 * hojas.js — Ligia Manzano Salón
 * Hojas carta horizontales y foliadas para imprimir (libros de IVA y registro de control de inventarios):
 * reparto de filas por hoja, HTML de cada folio (clases .hoja* de css/input.css) y la barra de impresión.
 * Prueba del reparto: npm test
 */
import './estilos.js'; // aplica la grilla de cada hoja (la CSP bloquea style="…")
import { icono } from './icons.js';
import { escapar, nitConGuiones, nrcConGuion } from './formato.js';
import { centavos } from './calculos.js';

/** Filas de 2 líneas de 10 mm en una hoja carta horizontal con 10 mm de margen: caben 16 con el encabezado. */
export const FILAS_POR_HOJA = 16;

/** Nombre del contador que se recuerda entre libros. */
export const CLAVE_CONTADOR = 'lms.libro-contador';

export const leerLocal = (clave) => { try { return localStorage.getItem(clave); } catch { return null; } };
export const guardarLocal = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: se pierde el recordatorio */ } };

/** Primer folio recordado de un libro (entero >= 1; 1 si no hay). */
export function folioGuardado(clave) {
  const folio = Number(leerLocal(clave));
  return Number.isInteger(folio) && folio >= 1 ? folio : 1;
}

export const fechaDMY = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const montoHoja = (n) => (centavos(n) + 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // +0: evita "-0.00"

/** Reparte las filas en hojas. Si en la última no caben los totales y la firma (`reserva` filas), van en una hoja extra. */
export function repartir(filas, reserva, porHoja = FILAS_POR_HOJA) {
  const hojas = [];
  for (let i = 0; i < filas.length; i += porHoja) hojas.push(filas.slice(i, i + porHoja));
  if (!hojas.length || hojas.at(-1).length > porHoja - reserva) hojas.push([]);
  return hojas;
}

/** Las celdas de una fila; `valores` ya es HTML. Las columnas con `num` van a la derecha. */
export const celdas = (columnas, valores, clases = '') => valores.map((v, i) => `<span class="${columnas[i].num ? 'text-right' : ''} ${clases}">${v}</span>`).join('');

/**
 * Un folio. columnas: [{ h, num?, c: (fila) => html }]. `subtitulo`, `totales` (un html por columna) y `pie` son HTML ya escapado;
 * `totales` y `pie` se pasan solo en la última hoja. `folio` es opcional (una partida suelta no se folia). `derecha` es texto (ej. "Mes: noviembre de 2026").
 */
export function htmlHoja({ emisor, titulo, derecha, folio, subtitulo = '', grilla, columnas, filas, totales = null, pie = '' }) {
  const primeraNum = columnas.findIndex((c) => c.num);
  return `<section class="hoja" data-estilo="--grilla: ${grilla}">
    <header class="hoja-encabezado">
      <p><b class="block font-semibold">${escapar(emisor.nombre)}</b>NIT ${escapar(nitConGuiones(emisor.nit))} · NRC ${escapar(nrcConGuion(emisor.nrc))}</p>
      <h1 class="text-center text-base">${escapar(titulo)}</h1>
      <p class="text-right">${escapar(derecha)}${folio ? `<b class="block font-semibold">Folio ${folio}</b>` : ''}</p>
    </header>
    ${subtitulo ? `<p class="mb-1 truncate text-sm">${subtitulo}</p>` : ''}
    <div class="hoja-fila hoja-cabecera">${celdas(columnas, columnas.map((c) => escapar(c.h)))}</div>
    ${filas.map((r) => `<div class="hoja-fila">${celdas(columnas, columnas.map((c) => c.c(r)))}</div>`).join('')}
    ${totales ? `<div class="hoja-fila hoja-total">${columnas.map((c, i) => `<span class="${c.num || i === primeraNum - 1 ? 'text-right' : ''}">${totales[i]}</span>`).join('')}</div>` : ''}
    ${pie}
  </section>`;
}

/**
 * La barra de arriba (no sale al imprimir): volver, primer folio, nombre del contador e imprimir.
 * `estado` es { folio, contador }; los cambios lo actualizan y llaman a `alCambiar`. `alImprimir` guarda los recordatorios.
 * Deja un <p id="siguiente"> para que la pantalla escriba el siguiente folio.
 */
export function montarBarra(barra, { volverHref, volverTexto, estado, alCambiar, alImprimir }) {
  barra.innerHTML = `
    <a href="${volverHref}" class="btn btn-secundario">${icono('izquierda')}${escapar(volverTexto)}</a>
    <label><span class="campo-etiqueta">Primer folio</span><span class="campo-caja w-32"><input id="folio" type="number" min="1" step="1" value="${estado.folio}" class="w-full tabular-nums"></span></label>
    <label><span class="campo-etiqueta">Nombre del contador</span><span class="campo-caja w-72"><input id="contador" type="text" value="${escapar(estado.contador)}" autocomplete="off" class="w-full"></span></label>
    <button type="button" id="imprimir" class="btn btn-primario">${icono('imprimir')}Imprimir</button>
    <p id="siguiente" class="py-2.5 text-15 text-texto-secundario tabular-nums"></p>`;

  document.getElementById('folio').addEventListener('input', (e) => {
    const n = Number(e.target.value);
    estado.folio = Number.isInteger(n) && n >= 1 ? n : 1;
    alCambiar();
  });
  document.getElementById('contador').addEventListener('input', (e) => { estado.contador = e.target.value.trim(); alCambiar(); });
  document.getElementById('imprimir').addEventListener('click', () => { alImprimir(); window.print(); });
}

/** "Nombre y firma del contador" para el pie de la última hoja. */
export const pieFirma = (contador) => `<p class="mt-auto flex items-end gap-2 text-sm">Nombre y firma del contador: <span class="inline-block w-64 border-b border-texto-principal"></span> Nombre: <b class="font-semibold">${escapar(contador)}</b></p>`;

/** Varias firmas en el pie de la última hoja (p. ej. el acta de inventario físico). firmas: [{ rotulo, nombre? }]; `nombre` es texto; `ancho`: clase de ancho de cada firma (w-64 para tres). */
export const pieFirmas = (firmas, ancho = 'w-96') => `<div class="mt-auto flex items-end justify-around gap-8 text-sm">${firmas.map((f) => `<p class="${ancho} text-center"><span class="block border-b border-texto-principal pt-8"></span>${escapar(f.rotulo)}${f.nombre ? `<b class="block font-semibold">${escapar(f.nombre)}</b>` : ''}</p>`).join('')}</div>`;
