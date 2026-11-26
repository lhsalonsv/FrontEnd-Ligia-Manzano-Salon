/**
 * partidaImprimirController.js — Ligia Manzano Salón
 * Una partida contable en hoja carta: encabezado con contribuyente, NIT y NRC, líneas con sus totales, el concepto y las firmas
 * de quien la hizo, la revisó y la autorizó. Si las líneas no caben en una hoja siguen en otra (sin folio: es un documento suelto).
 *
 * URL: partida-imprimir.html?id=5   Se abre desde partidas.html?id=5 ("Imprimir").
 */
import { exigirSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { escapar } from '../utils/formato.js';
import { repartir, htmlHoja, pieFirmas, fechaDMY, montoHoja } from '../utils/hojas.js';
import { obtenerPartida } from '../services/contabilidadService.js';

const sesion = exigirSesion();
const $ = (id) => document.getElementById(id);
const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];

/** El subtítulo le quita una fila a la hoja (15 de 16). En la última hoja van además los totales, el concepto y las firmas (3 filas). */
const FILAS_POR_HOJA = 15;
const RESERVA = 3;
const GRILLA = '9mm 28mm 1.2fr 1.4fr 30mm 30mm';
const monto = (n) => (n ? montoHoja(n) : '');
const COLUMNAS = [
  { h: 'N.º', c: (l) => l.linea },
  { h: 'Cuenta', c: (l) => `<span class="font-mono">${escapar(l.codigoCuenta)}</span>` },
  { h: 'Nombre', c: (l) => escapar(l.nombreCuenta) },
  { h: 'Concepto', c: (l) => escapar(l.concepto ?? '') },
  { h: 'Debe', num: true, c: (l) => monto(l.debe) },
  { h: 'Haber', num: true, c: (l) => monto(l.haber) },
];

function htmlPartida(p) {
  const grupos = repartir(p.lineas, RESERVA, FILAS_POR_HOJA);
  const titulo = p.numero ? `Partida contable ${p.codigoTipo} ${p.numero}` : 'Partida contable (borrador, sin aplicar)';
  const subtitulo = `${escapar(p.codigoTipo)} · ${escapar(p.nombreTipo)}${p.numeroAnula ? ` · Anula la partida ${escapar(p.numeroAnula)}` : ''}${p.numeroAnuladaPor ? ` · Anulada por la partida ${escapar(p.numeroAnuladaPor)}` : ''}`;
  const concepto = `<p class="mb-3 text-xs"><b class="font-semibold">Concepto:</b> ${escapar(p.concepto)}</p>`;
  return grupos.map((filas, i) => {
    const ultima = i === grupos.length - 1;
    return htmlHoja({
      emisor: p.emisor, titulo, derecha: `Fecha: ${fechaDMY(p.fecha)}`, subtitulo, grilla: GRILLA, columnas: COLUMNAS, filas,
      totales: ultima ? ['', '', '', 'Totales', montoHoja(p.totalDebe), montoHoja(p.totalHaber)] : null,
      pie: ultima ? concepto + pieFirmas([{ rotulo: 'Hecho por', nombre: p.creadoPor }, { rotulo: 'Revisado por' }, { rotulo: 'Autorizado por' }], 'w-64') : '',
    });
  }).join('');
}

const aviso = (icon, clase, html) => { $('hojas').innerHTML = `<div class="aviso ${clase} mx-auto max-w-xl">${icono(icon)}<p>${html}</p></div>`; };

async function iniciar() {
  const id = new URLSearchParams(location.search).get('id') ?? '';
  $('barra').innerHTML = `
    <a href="partidas.html${/^\d+$/.test(id) ? `?id=${id}` : ''}" class="btn btn-secundario">${icono('izquierda')}Partida</a>
    <button type="button" id="imprimir" class="btn btn-primario">${icono('imprimir')}Imprimir</button>`;
  $('imprimir').addEventListener('click', () => window.print());
  if (!/^\d+$/.test(id)) { aviso('alerta', 'aviso-error', 'Falta la partida: ábrala desde la lista de partidas.'); return; }
  try {
    $('hojas').innerHTML = htmlPartida(await obtenerPartida(id));
  } catch (error) {
    aviso('alerta', 'aviso-error', escapar(error.message));
  }
}

if (sesion && !ROLES.includes(sesion.usuario.rol)) {
  $('barra').remove();
  aviso('candado', 'aviso-info', '<b class="block font-semibold">La contabilidad es de la administradora, la contadora y el auditor.</b>Si necesitas un dato, pídeselo a la administradora.');
} else if (sesion) {
  iniciar();
}
