/**
 * reportesContablesImprimirController.js — Ligia Manzano Salón
 * Reportes contables en hojas carta horizontales: Libro diario y Libro mayor (libros legales: foliados, con encabezado de contribuyente,
 * NIT y NRC y la firma del contador, art. 139 del Código Tributario) y Balance de comprobación, Balance General y Estado de Resultados
 * (con las firmas de FIRMAS_ESTADOS, sin folio). Los modelos son los mismos de la pantalla (js/utils/reportesContables.js).
 *
 * URL: reportes-contables-imprimir.html?pestana=diario|mayor|comprobacion|balance|resultados + los filtros de la pantalla (desde, hasta, tipo,
 * cuenta, formato, anio, mes, nivel, ocultar=1). Se abre desde reportes-contables.html ("Imprimir").
 */
import { exigirSesion } from '../utils/session.js';
import { icono } from '../utils/icons.js';
import { escapar, fechaIso, MESES } from '../utils/formato.js';
import { CLAVE_CONTADOR, repartir, htmlHoja, montarBarra, pieFirma, pieFirmas, folioGuardado, leerLocal, guardarLocal, fechaDMY, montoHoja } from '../utils/hojas.js';
import { ultimoDia, modeloDiario, modeloMayor, modeloComprobacion, modeloBalanceGeneral, modeloResultados } from '../utils/reportesContables.js';
import { obtenerSaldos, obtenerMayor, obtenerDiario } from '../services/contabilidadService.js';

// Firmas de los estados financieros (Código de Comercio arts. 283, 286 y 441): los certifica el contador público y los dictamina el auditor externo
// (confirmado el 25 de noviembre). `contador`: lleva el nombre de la barra.
const FIRMAS_ESTADOS = [{ rotulo: 'Representante legal' }, { rotulo: 'Contador', contador: true }, { rotulo: 'Auditor externo' }];

const sesion = exigirSesion();
const $ = (id) => document.getElementById(id);
const ROLES = ['ADMINISTRADOR', 'CONTADOR', 'AUDITOR'];

/** El subtítulo le quita una fila a la hoja (15 de 16). En la última hoja van además los totales y las firmas (3 filas). */
const FILAS_POR_HOJA = 15;
const RESERVA = 3;
const SUBTITULO_ESTADOS = 'Expresado en dólares de los Estados Unidos de América (US$)';

const q = new URLSearchParams(location.search);
const hoy = fechaIso();
const anio = Number(q.get('anio')) || Number(hoy.slice(0, 4));
const mes = Number(q.get('mes')) >= 1 && Number(q.get('mes')) <= 12 ? Number(q.get('mes')) : Number(hoy.slice(5, 7));
const desde = q.get('desde') || `${hoy.slice(0, 7)}-01`;
const hasta = q.get('hasta') || ultimoDia(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)));
const finMes = ultimoDia(anio, mes);
const nivel = (porDefecto) => (q.has('nivel') && Number.isInteger(Number(q.get('nivel'))) ? Math.min(6, Math.max(0, Number(q.get('nivel')))) : porDefecto);

const REPORTES = {
  diario: {
    titulo: 'Libro diario', libro: true, grilla: '30mm 1fr 1.4fr 28mm 28mm', derecha: `Del ${fechaDMY(desde)} al ${fechaDMY(hasta)}`,
    cargar: async () => { const d = await obtenerDiario({ desde, hasta, tipo: q.get('tipo') ?? '' }); return { emisor: d.emisor, modelo: modeloDiario(d), subtitulo: q.get('tipo') ? `Partidas de tipo ${q.get('tipo')}` : 'Todas las partidas aplicadas' }; },
  },
  mayor: {
    titulo: 'Libro mayor', libro: true, grilla: '20mm 26mm 28mm 1fr 26mm 26mm 28mm', derecha: `Del ${fechaDMY(desde)} al ${fechaDMY(hasta)}`,
    cargar: async () => {
      const d = await obtenerMayor({ cuenta: q.get('cuenta') ?? '', desde, hasta });
      const formato = q.get('formato') === 'dia' ? 'dia' : 'partida';
      return { emisor: d.emisor, modelo: modeloMayor(d, formato), subtitulo: `Cuenta ${d.cuenta.codigo} — ${d.cuenta.nombre} · ${formato === 'dia' ? 'por día' : 'por partida'}` };
    },
  },
  comprobacion: {
    titulo: 'Balance de comprobación', grilla: '30mm 1fr 28mm 28mm 28mm 28mm', derecha: `Mes: ${MESES[mes - 1]} de ${anio}`,
    cargar: async () => {
      const d = await obtenerSaldos({ anio, mes, nivel: nivel(6) });
      const ocultar = q.get('ocultar') === '1';
      return { emisor: d.emisor, modelo: modeloComprobacion(d.filas, { ocultar }), subtitulo: `${SUBTITULO_ESTADOS} · Nivel ${nivel(6)}${ocultar ? ' · sin cuentas sin saldo ni movimiento' : ''}` };
    },
  },
  balance: {
    titulo: 'Balance General', grilla: '34mm 1fr 36mm', derecha: `Al ${fechaDMY(finMes)}`,
    cargar: async () => { const d = await obtenerSaldos({ anio, mes, nivel: nivel(3) }); return { emisor: d.emisor, modelo: modeloBalanceGeneral(d.filas), subtitulo: SUBTITULO_ESTADOS }; },
  },
  resultados: {
    titulo: 'Estado de Resultados', grilla: '34mm 1fr 36mm', derecha: `Del ${fechaDMY(`${anio}-01-01`)} al ${fechaDMY(finMes)}`,
    cargar: async () => { const d = await obtenerSaldos({ anio, mes, nivel: nivel(3) }); return { emisor: d.emisor, modelo: modeloResultados(d.filas), subtitulo: SUBTITULO_ESTADOS }; },
  },
};

const reporte = REPORTES[q.get('pestana')];
const claveFolio = `lms.libro-folio.${q.get('pestana')}`;
const estado = { datos: null, folio: 1, contador: '' };

// --- Hojas -------------------------------------------------------------------

/** Una celda de la hoja: dinero con 2 decimales (negativos con signo), vacío si es null; las filas de grupo, encabezado y total, en negrita. */
function celda(fila, i, columna) {
  const v = fila.v[i];
  if (v == null || v === '') return '';
  const texto = typeof v === 'number' ? montoHoja(v) : escapar(typeof v === 'object' ? v.t : v);
  const interior = columna.sangria ? `<span class="block" data-estilo="padding-left:${(fila.nivel ?? 0) * 3}mm">${texto}</span>` : texto;
  return fila.tipo === 'normal' ? interior : `<b class="font-semibold">${interior}</b>`;
}

function hojas() {
  const { emisor, modelo, subtitulo } = estado.datos;
  const columnas = modelo.columnas.map((c, i) => ({ h: c.h, num: c.num, c: (fila) => celda(fila, i, c) }));
  const grupos = repartir(modelo.filas, RESERVA, FILAS_POR_HOJA);
  const totales = modelo.totales?.map((v) => (v == null ? '' : typeof v === 'number' ? montoHoja(v) : escapar(v)));
  const firmas = reporte.libro ? pieFirma(estado.contador)
    : pieFirmas(FIRMAS_ESTADOS.map((f) => ({ rotulo: f.rotulo, nombre: f.contador ? estado.contador : '' })), 'w-64');
  return grupos.map((filas, i) => {
    const ultima = i === grupos.length - 1;
    return htmlHoja({
      emisor, titulo: reporte.titulo, derecha: reporte.derecha, folio: reporte.libro ? estado.folio + i : undefined, subtitulo: escapar(subtitulo),
      grilla: reporte.grilla, columnas, filas, totales: ultima && totales ? totales : null, pie: ultima ? firmas : '',
    });
  });
}

function pintar() {
  if (!estado.datos) return;
  const paginas = hojas();
  $('hojas').innerHTML = paginas.join('');
  $('siguiente').textContent = reporte.libro ? `Siguiente folio: ${estado.folio + paginas.length}` : '';
}

const aviso = (icon, clase, html) => { $('hojas').innerHTML = `<div class="aviso ${clase} mx-auto max-w-xl">${icono(icon)}<p>${html}</p></div>`; };

async function iniciar() {
  estado.contador = leerLocal(CLAVE_CONTADOR) ?? '';
  if (reporte?.libro) estado.folio = folioGuardado(claveFolio);
  montarBarra($('barra'), {
    volverHref: `reportes-contables.html${location.search}`, volverTexto: 'Reportes', estado, alCambiar: pintar,
    alImprimir: () => {
      guardarLocal(CLAVE_CONTADOR, estado.contador);
      if (reporte?.libro) guardarLocal(claveFolio, String(estado.folio + hojas().length)); // último folio usado + 1
    },
  });
  if (!reporte?.libro) $('folio').closest('label').remove(); // los estados financieros no se foliaron
  if (!reporte) { aviso('alerta', 'aviso-error', 'Falta el reporte: ábralo desde Contabilidad → Reportes.'); return; }
  try {
    estado.datos = await reporte.cargar();
    pintar();
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
