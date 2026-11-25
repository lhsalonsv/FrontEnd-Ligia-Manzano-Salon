/**
 * Registro de control de inventarios de prueba (kardex). Solo se usa con DATOS_PRUEBA.registroInventario = true (js/config.js).
 * No hay datos propios: se arma con los lotes y movimientos de js/mocks/inventario.js y las compras de comprasService,
 * para que cuadre con la pantalla Inventario. Las entradas salen de los lotes (a su costo) y cada salida consume lotes por PEPS
 * (js/utils/peps.js), una fila por lote tocado, como la vista v_registro_inventario de la base. Prueba: npm test
 */
import { salidaPeps } from '../utils/peps.js';
import { centavos } from '../utils/calculos.js';

// Los mismos textos que arma v_registro_inventario (modelo/migracion_1.4.sql)
const DESCRIPCION = {
  ENTRADA_COMPRA: 'Compra a proveedor', ENTRADA_AJUSTE: 'Ajuste', SALIDA_VENTA: 'Venta a cliente',
  SALIDA_AJUSTE: 'Ajuste', USO_SALON: 'Uso en el salón',
};

const siguienteMes = (periodo) => {
  const [a, m] = periodo.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};

/** Todas las filas del kardex de un producto, de la primera entrada a la última salida. */
function kardexDe(producto, compras) {
  const eventos = [
    ...producto.lotes.map((lote) => ({ orden: 0, fechaHora: lote.fechaIngreso, lote })),
    ...producto.movimientos.filter((m) => m.cantidad < 0).map((mov) => ({ orden: 1, fechaHora: mov.fechaHora, mov })), // las entradas salen de los lotes
  ].sort((a, b) => Date.parse(a.fechaHora) - Date.parse(b.fechaHora) || a.orden - b.orden);

  const enExistencia = new Map(); // lotes que ya entraron, con lo que les queda
  const compraDe = (lote) => compras.find((c) => c.numeroCompra === lote.numeroCompra);
  // Entradas: el libro de compras del mes en que se declaró. Salidas y ajustes: el lote PEPS y su compra.
  const refCosto = (lote, entrada) => {
    const c = compraDe(lote);
    const mes = c && (c.periodoIva ?? c.fechaCompra);
    if (entrada && c) return `Libro de compras ${mes.slice(5, 7)}/${mes.slice(0, 4)}, compra ${c.numeroCompra}`;
    return `Lote ${lote.idLote}${c ? ` (compra ${c.numeroCompra})` : ''}`;
  };
  let unidades = 0;
  let valor = 0;
  const filas = [];
  const correlativoDelAnio = new Map(); // como la vista: vuelve a 1 cada año
  const fila = (fechaHora, tipo, lote, costoUnitario, entrada, salida, extra, motivo) => {
    unidades += entrada - salida;
    valor = centavos(valor + centavos(entrada * costoUnitario) - centavos(salida * costoUnitario));
    const anio = fechaHora.slice(0, 4);
    correlativoDelAnio.set(anio, (correlativoDelAnio.get(anio) ?? 0) + 1);
    filas.push({
      idMovimiento: producto.idProducto * 1000 + filas.length + 1, correlativo: correlativoDelAnio.get(anio),
      fecha: fechaHora.slice(0, 10), tipo, descripcionOperacion: DESCRIPCION[tipo] + (motivo ? `: ${motivo}` : ''),
      tipoDocumento: null, numeroDocumento: null, proveedor: null, nacionalidadProveedor: null,
      referenciaCosto: refCosto(lote, entrada > 0), idLote: lote.idLote, costoUnitario,
      entradaUnidades: entrada, salidaUnidades: salida, entradaValor: centavos(entrada * costoUnitario), salidaValor: centavos(salida * costoUnitario),
      saldoUnidades: unidades, saldoValor: valor, ...extra,
    });
  };

  for (const { fechaHora, lote, mov } of eventos) {
    if (lote) {
      enExistencia.set(lote.idLote, { ...lote, cantidadDisponible: lote.cantidadInicial });
      const compra = compraDe(lote);
      fila(fechaHora, compra ? 'ENTRADA_COMPRA' : 'ENTRADA_AJUSTE', lote, lote.costoUnitario, lote.cantidadInicial, 0, compra && {
        tipoDocumento: compra.tipoDocumentoProveedor, numeroDocumento: compra.numeroDocumentoProveedor,
        proveedor: compra.proveedor.razonSocial, nacionalidadProveedor: compra.proveedor.nacionalidad,
      });
    } else {
      for (const parte of salidaPeps([...enExistencia.values()], -mov.cantidad).partes) {
        const trabajo = enExistencia.get(parte.idLote);
        trabajo.cantidadDisponible -= parte.cantidad;
        fila(fechaHora, mov.tipo, trabajo, parte.costoUnitario, 0, parte.cantidad,
          mov.tipo === 'SALIDA_VENTA' && mov.referencia ? { tipoDocumento: 'FACTURA', numeroDocumento: mov.referencia } : {},
          mov.tipo === 'SALIDA_VENTA' ? null : mov.motivo);
      }
    }
  }
  return filas;
}

/**
 * La respuesta de GET /api/inventario/registro (docs/contrato-api.md) para un mes.
 * @param {{ periodo: string, idProducto?: number|null, productos: object[], compras: object[], marcas: object[], unidades: object[], emisor: object }} datos
 *   compras: las de comprasDePrueba() (con su proveedor); productos: los de js/mocks/inventario.js.
 */
export function armarRegistro({ periodo, idProducto = null, productos, compras, marcas, unidades, emisor }) {
  const desde = `${periodo}-01`;
  const hasta = `${siguienteMes(periodo)}-01`;
  const lista = productos
    .filter((p) => !idProducto || p.idProducto === Number(idProducto))
    .map((p) => {
      const filas = kardexDe(p, compras);
      const antes = filas.filter((f) => f.fecha < desde).at(-1);
      const movimientos = filas.filter((f) => f.fecha >= desde && f.fecha < hasta);
      return {
        idProducto: p.idProducto, codigo: p.codigo, nombreProducto: p.nombreProducto,
        marca: marcas.find((m) => m.idMarca === p.idMarca)?.nombreMarca ?? '',
        unidadMedida: unidades.find((u) => u.codUnidadMedida === p.codUnidadMedida)?.nombre ?? '',
        saldoInicial: { unidades: antes?.saldoUnidades ?? 0, valor: antes?.saldoValor ?? 0 },
        movimientos,
      };
    })
    .filter((p) => p.movimientos.length || p.saldoInicial.unidades !== 0)
    .sort((a, b) => a.nombreProducto.localeCompare(b.nombreProducto, 'es'));
  return { emisor, periodo, productos: lista };
}
