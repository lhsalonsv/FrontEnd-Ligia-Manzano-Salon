/**
 * librosIvaService.js — Ligia Manzano Salón
 * Libros de IVA y anexos del F-07 (solo lectura). Contrato en docs/contrato-api.md → "Libros de IVA".
 *
 *   GET /api/libros-iva?periodo=2026-11
 *       → { periodo, ventasContribuyentes, consumidorFinal, compras, anulados, pendientes: { sinSello } }
 *
 * Cada lista son las filas de las vistas v_anexo_* de la base (migración 1.3) en camelCase. Cada fila trae
 * lineaCsv, la línea exacta del archivo que se sube a Hacienda: el formato lo hace la base, no el frontend.
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch } from '../utils/authFetch.js';
import { centavos } from '../utils/calculos.js';
import { DTES_PRUEBA, INVALIDACIONES_PRUEBA } from '../mocks/librosIva.js';
import { comprasDePrueba } from './comprasService.js';

/** @param {string} periodo 'AAAA-MM' */
export async function obtenerLibros(periodo) {
  if (DATOS_PRUEBA.librosIva) return librosPrueba(periodo);
  return authFetch(`/libros-iva?periodo=${encodeURIComponent(periodo)}`);
}

// --- Datos de prueba ---------------------------------------------------------
// Repiten las reglas de las vistas SQL para que la pantalla se vea igual que con la API.
// Las vistas son las que valen; prueba_1.3.sql revisa sus líneas contra el manual de Hacienda.

const esperar = () => new Promise((r) => setTimeout(r, 250));
const monto = (n) => centavos(n ?? 0).toFixed(2);
const fechaAnexo = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const texto = (t) => String(t ?? '').trim().replace(/[;\r\n]+/g, ' ');
const digitos = (t) => String(t ?? '').replace(/\D/g, '');
const codigo = (u) => u.toUpperCase().replace(/-/g, '');
const linea = (columnas) => columnas.join(';');
const siguienteMes = (periodo) => {
  const [a, m] = periodo.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
};

async function librosPrueba(periodo) {
  await esperar();
  const desde = `${periodo}-01`;
  const hasta = siguienteMes(periodo);
  const delMes = (iso) => iso >= desde && iso < hasta;
  // v_dtes_declarables: producción, con sello y sin invalidar al cerrar el mes
  const invalidadoAntes = (d) => INVALIDACIONES_PRUEBA.some((i) => i.idDte === d.idDte && i.estado === 'PROCESADO' && i.fecEmi < hasta);
  const declarables = DTES_PRUEBA.filter((d) => d.ambiente === '01' && d.selloRecibido && delMes(d.fecEmi) && !invalidadoAntes(d));
  const porHora = (a, b) => a.fecEmi.localeCompare(b.fecEmi) || a.horEmi.localeCompare(b.horEmi) || a.numeroControl.localeCompare(b.numeroControl);

  const ventasContribuyentes = declarables.filter((d) => d.tipoDte !== '01').sort(porHora).map((d, i) => {
    const doc = digitos(d.receptorNumDocumento);
    const r = {
      correlativo: i + 1, idDte: d.idDte, fecha: d.fecEmi, claseDocumento: 4, tipoDocumento: d.tipoDte,
      numeroResolucion: d.numeroControl.replace(/-/g, ''), serie: d.selloRecibido, numeroDocumento: codigo(d.codigoGeneracion),
      nitNrc: doc.length === 9 ? '' : doc || digitos(d.receptorNrc), dui: doc.length === 9 ? doc : '', nombre: d.receptorNombre,
      ventasExentas: d.totalExenta, ventasNoSujetas: d.totalNoSujeta, ventasGravadas: d.totalGravada, debitoFiscal: d.totalIva,
      totalVentas: centavos(d.totalExenta + d.totalNoSujeta + d.totalGravada + d.totalIva),
      tipoOperacionRenta: d.tipoOperacionRenta, tipoIngresoRenta: d.tipoIngresoRenta,
      ivaRetenido: d.ivaRetenido, ivaPercibido: d.ivaPercibido, signo: d.tipoDte === '05' ? -1 : 1,
    };
    r.lineaCsv = linea([fechaAnexo(r.fecha), '4', r.tipoDocumento, r.numeroResolucion, r.serie, r.numeroDocumento, '', r.nitNrc, texto(r.nombre),
      monto(r.ventasExentas), monto(r.ventasNoSujetas), monto(r.ventasGravadas), monto(r.debitoFiscal), '0.00', '0.00', monto(r.totalVentas), r.dui,
      r.tipoOperacionRenta, r.tipoIngresoRenta, '1']);
    return r;
  });

  const dias = new Map();
  for (const d of declarables.filter((x) => x.tipoDte === '01').sort(porHora)) {
    const clave = `${d.fecEmi}|${d.tipoOperacionRenta}|${d.tipoIngresoRenta}`;
    if (!dias.has(clave)) dias.set(clave, []);
    dias.get(clave).push(d);
  }
  const consumidorFinal = [...dias.values()].map((facturas, i) => {
    const suma = (campo) => centavos(facturas.reduce((s, d) => s + d[campo], 0));
    const [d] = facturas;
    const r = {
      correlativo: i + 1, fecha: d.fecEmi, tipoOperacionRenta: d.tipoOperacionRenta, tipoIngresoRenta: d.tipoIngresoRenta,
      documentos: facturas.length, delDocumento: codigo(d.codigoGeneracion), alDocumento: codigo(facturas.at(-1).codigoGeneracion),
      ventasExentas: suma('totalExenta'), ventasNoSujetas: suma('totalNoSujeta'), ventasGravadas: suma('totalGravada'),
      ivaIncluido: suma('totalIva'), totalVentas: centavos(suma('totalExenta') + suma('totalNoSujeta') + suma('totalGravada')),
    };
    r.lineaCsv = linea([fechaAnexo(r.fecha), '4', '01', 'N/A', 'N/A', 'N/A', 'N/A', r.delDocumento, r.alDocumento, '',
      monto(r.ventasExentas), '0.00', monto(r.ventasNoSujetas), monto(r.ventasGravadas), '0.00', '0.00', '0.00', '0.00', '0.00',
      monto(r.totalVentas), r.tipoOperacionRenta, r.tipoIngresoRenta, '2']);
    return r;
  });

  const TIPO_ANEXO = { CCF: '03', NC: '05', ND: '06' };
  const compras = comprasDePrueba()
    .filter((c) => c.estado === 'REGISTRADA' && TIPO_ANEXO[c.tipoDocumentoProveedor] && c.periodoIva === desde)
    .sort((a, b) => a.fechaCompra.localeCompare(b.fechaCompra) || a.idCompra - b.idCompra)
    .map((c, i) => {
      const nit = digitos(c.proveedor.nit);
      const r = {
        correlativo: i + 1, idCompra: c.idCompra, fecha: c.fechaCompra, claseDocumento: c.claseDocumento,
        tipoDocumento: TIPO_ANEXO[c.tipoDocumentoProveedor],
        numeroDocumento: c.claseDocumento === 4 ? codigo(c.codigoGeneracionProveedor) : c.numeroDocumentoProveedor,
        nitNrc: nit.length === 9 ? '' : nit || digitos(c.proveedor.nrc), dui: nit.length === 9 ? nit : '', nombre: c.proveedor.razonSocial,
        comprasExentas: c.comprasExentas, comprasGravadas: c.subtotalSinIva, creditoFiscal: c.iva,
        totalCompras: centavos(c.comprasExentas + c.subtotalSinIva), ivaPercibido: c.ivaPercibido, totalDocumento: c.total,
        tipoOperacionRenta: c.tipoOperacionRenta, clasificacionRenta: c.clasificacionRenta, sectorRenta: c.sectorRenta,
        tipoCostoGasto: c.tipoCostoGasto, signo: c.tipoDocumentoProveedor === 'NC' ? -1 : 1,
      };
      r.lineaCsv = linea([fechaAnexo(r.fecha), r.claseDocumento, r.tipoDocumento, r.numeroDocumento, r.nitNrc, texto(r.nombre),
        monto(r.comprasExentas), '0.00', '0.00', monto(r.comprasGravadas), '0.00', '0.00', '0.00', monto(r.creditoFiscal),
        monto(r.totalCompras), r.dui, r.tipoOperacionRenta, r.clasificacionRenta, r.sectorRenta, r.tipoCostoGasto, '3']);
      return r;
    });

  const anulados = INVALIDACIONES_PRUEBA
    .filter((i) => i.estado === 'PROCESADO' && delMes(i.fecEmi))
    .sort((a, b) => a.fecEmi.localeCompare(b.fecEmi) || a.horEmi.localeCompare(b.horEmi))
    .map((inv, i) => {
      const d = DTES_PRUEBA.find((x) => x.idDte === inv.idDte);
      const r = {
        correlativo: i + 1, idDte: d.idDte, fecha: inv.fecEmi, fechaDocumento: d.fecEmi, numeroResolucion: d.numeroControl,
        tipoDocumento: d.tipoDte, serie: d.selloRecibido, codigoGeneracion: d.codigoGeneracion.toUpperCase(),
      };
      r.lineaCsv = linea([r.numeroResolucion, '4', '0', '0', r.tipoDocumento, 'D', r.serie, '0', '0', r.codigoGeneracion]);
      return r;
    });

  const sinSello = DTES_PRUEBA.filter((d) => d.ambiente === '01' && !d.selloRecibido && delMes(d.fecEmi)).length;
  return { periodo, ventasContribuyentes, consumidorFinal, compras, anulados, pendientes: { sinSello } };
}
