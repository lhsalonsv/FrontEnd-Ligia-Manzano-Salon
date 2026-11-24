/**
 * DTE emitidos de prueba para Libros de IVA. Solo se usan con DATOS_PRUEBA.librosIva = true (js/config.js).
 * Se arman para el mes anterior y el actual (hasta hoy), como si fueran de producción (ambiente 01).
 * Clientes, NIT y NRC ficticios. Las compras salen de comprasService, para que Compras y el libro digan lo mismo.
 *
 * Igual que tb_dtes: en la factura (01) total_gravada ya incluye el IVA; en CCF (03) y NC (05) no.
 */
import { fechaIso } from '../utils/formato.js';
import { centavos } from '../utils/calculos.js';

const PRECIOS = [12, 25, 35, 18.5, 45, 60, 8.5, 30]; // servicios y productos, con IVA
const EVENTOS = { receptorNumDocumento: '00000000000081', receptorNrc: '0000081', receptorNombre: 'Eventos Lumière, S.A. de C.V.' };
// Persona natural: su NIT es el DUI (9 dígitos), así sale en la columna DUI del anexo
const CLIENTA = { receptorNumDocumento: '000000091', receptorNrc: '0000091', receptorNombre: 'Clienta de Ejemplo' };

const hex = (n, largo) => n.toString(16).toUpperCase().padStart(largo, '0');
const hoy = fechaIso();
const ahora = new Date();
const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);

let siguiente = 400;
function dte(tipoDte, fecEmi, horEmi, montos, extra = {}) {
  siguiente += 1;
  return {
    idDte: siguiente, tipoDte, ambiente: '01', estado: 'PROCESADO', fecEmi, horEmi,
    codigoGeneracion: `A1B2C3D4-0000-4000-8000-${hex(siguiente, 12)}`,
    numeroControl: `DTE-${tipoDte}-M001P001-${String(siguiente).padStart(15, '0')}`,
    selloRecibido: `${fecEmi.slice(0, 4)}${hex(siguiente * 104729, 12)}${'0'.repeat(24)}`,
    receptorNumDocumento: null, receptorNrc: null, receptorNombre: null,
    totalExenta: 0, totalNoSujeta: 0, ivaRetenido: 0, ivaPercibido: 0,
    tipoOperacionRenta: 1, tipoIngresoRenta: 2, ...montos, ...extra,
  };
}
const factura = (fecha, hora, precio) => dte('01', fecha, hora, { totalGravada: precio, totalIva: centavos(precio - precio / 1.13) });
const hora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

const dtes = [];
const invalidaciones = [];
for (let f = new Date(inicio); fechaIso(f) <= hoy; f.setDate(f.getDate() + 1)) {
  if (f.getDay() === 0) continue; // domingo cerrado
  const fecha = fechaIso(f);
  const dia = f.getDate();
  const delDia = 3 + (dia % 3);
  for (let i = 0; i < delDia; i++) dtes.push(factura(fecha, hora(9 * 60 + i * 80), PRECIOS[(dia + i) % PRECIOS.length]));
  if (dia === 5) dtes.push(dte('03', fecha, '10:15', { totalGravada: 200, totalIva: 26 }, EVENTOS)); // 4 peinados × $50
  // Nota de crédito de ese CCF: el primer día abierto desde el 8
  const ccf = dtes.findLast((d) => d.tipoDte === '03' && d.receptorNombre === EVENTOS.receptorNombre && d.fecEmi.slice(0, 7) === fecha.slice(0, 7));
  if (dia >= 8 && ccf && !dtes.some((d) => d.idDteRelacionado === ccf.idDte)) {
    dtes.push(dte('05', fecha, '11:00', { totalGravada: 50, totalIva: 6.5 }, { ...EVENTOS, idDteRelacionado: ccf.idDte }));
  }
  if (dia === 12) dtes.push(dte('03', fecha, '15:30', { totalGravada: 40, totalIva: 5.2 }, CLIENTA));
  // La primera factura del día 3 se invalidó al día siguiente (mismo mes: no va en el libro, sí en anulados)
  if (dia === 4) {
    const delTres = dtes.find((d) => d.tipoDte === '01' && d.fecEmi === fechaIso(new Date(f.getFullYear(), f.getMonth(), 3)));
    if (delTres) invalidaciones.push({ idDte: delTres.idDte, fecEmi: fecha, horEmi: '09:30', estado: 'PROCESADO' });
  }
}

// La última factura del mes anterior se invalidó el día 2 de este mes: va en el libro del mes anterior
// y en los anulados de este.
const segundo = fechaIso(new Date(ahora.getFullYear(), ahora.getMonth(), 2));
const ultimaAnterior = dtes.findLast((d) => d.tipoDte === '01' && d.fecEmi < fechaIso(new Date(ahora.getFullYear(), ahora.getMonth(), 1)));
if (segundo <= hoy && ultimaAnterior) invalidaciones.push({ idDte: ultimaAnterior.idDte, fecEmi: segundo, horEmi: '08:45', estado: 'PROCESADO' });

// Una factura de hoy en contingencia: sin sello todavía, pero igual va en el libro (art. 141 Código Tributario)
dtes.push({ ...factura(hoy, '17:50', 25), selloRecibido: null, estado: 'CONTINGENCIA' });

export const DTES_PRUEBA = dtes;
export const INVALIDACIONES_PRUEBA = invalidaciones;
