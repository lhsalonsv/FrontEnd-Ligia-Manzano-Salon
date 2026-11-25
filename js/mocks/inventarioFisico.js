/**
 * Inventario físico de prueba (funciones puras). Solo se usa con DATOS_PRUEBA.inventarioFisico = true (js/config.js).
 * Se arma con los lotes de js/mocks/inventario.js: el cierre aplica cada diferencia como un ajuste PEPS (js/utils/peps.js) y el acta
 * son los lotes que quedan vivos, como la vista v_acta_inventario_fisico. El estado de la sesión vive en inventarioFisicoService.js.
 * Los lotes se toman como están hoy: la fecha de ingreso no se compara con la fecha de corte. Prueba: npm test
 */
import { existencia, salidaPeps, ultimoCosto, valorAlCosto } from '../utils/peps.js';
import { centavos } from '../utils/calculos.js';

/** Copia de los lotes de cada producto: Map(idProducto → lotes). */
export const clonarLotes = (productos) => new Map(productos.map((p) => [p.idProducto, p.lotes.map((l) => ({ ...l }))]));

/**
 * Un ajuste PEPS de `diferencia` unidades. Si salen, se toman de los lotes más viejos; si entran, nace un lote al último costo.
 * @returns {{ lotes: object[], valor: number }} lotes nuevos (sin tocar los de entrada) y el valor firmado del ajuste
 */
export function ajustarLotes(lotes, diferencia, idLoteNuevo, fechaIngreso) {
  if (diferencia < 0) {
    const { partes, costo } = salidaPeps(lotes, -diferencia);
    return {
      lotes: lotes.map((l) => { const p = partes.find((x) => x.idLote === l.idLote); return p ? { ...l, cantidadDisponible: l.cantidadDisponible - p.cantidad } : l; }),
      valor: -costo,
    };
  }
  const costoUnitario = ultimoCosto(lotes) ?? 0;
  return {
    lotes: [...lotes, { idLote: idLoteNuevo, fechaIngreso, costoUnitario, cantidadInicial: diferencia, cantidadDisponible: diferencia, numeroCompra: null }],
    valor: centavos(diferencia * costoUnitario),
  };
}

/**
 * El cierre: congela lo que decía el sistema y aplica las diferencias.
 * @param {{ productos: object[], lotes: Map, contadas: Map<number, number>, fechaCorte: string, idLoteInicial: number }} d
 *        contadas: idProducto → cantidad contada de cada producto activo.
 * @returns {{ lotes: Map, sistema: Map<number, {existenciaSistema:number, valorSistema:number}>, ajustes: {idProducto:number, cantidad:number, valor:number}[], siguienteIdLote: number }}
 */
export function aplicarConteo({ productos, lotes, contadas, fechaCorte, idLoteInicial }) {
  const nuevos = new Map(lotes);
  const sistema = new Map();
  const ajustes = [];
  let idLote = idLoteInicial;
  for (const p of productos.filter((x) => x.activo)) {
    const actuales = lotes.get(p.idProducto);
    const existenciaSistema = existencia(actuales);
    sistema.set(p.idProducto, { existenciaSistema, valorSistema: valorAlCosto(actuales) });
    const diferencia = contadas.get(p.idProducto) - existenciaSistema;
    if (!diferencia) continue;
    const r = ajustarLotes(actuales, diferencia, idLote, `${fechaCorte}T23:59:59-06:00`);
    if (diferencia > 0) idLote++;
    nuevos.set(p.idProducto, r.lotes);
    ajustes.push({ idProducto: p.idProducto, cantidad: diferencia, valor: r.valor });
  }
  return { lotes: nuevos, sistema, ajustes, siguienteIdLote: idLote };
}

/** Nombres de categoría, marca y unidad de un producto. */
const nombresDe = (p, { marcas, categorias, unidades }) => ({
  categoria: categorias.find((c) => c.idCategoria === p.idCategoria)?.nombreCategoria ?? '',
  marca: marcas.find((m) => m.idMarca === p.idMarca)?.nombreMarca ?? '',
  unidadMedida: unidades.find((u) => u.codUnidadMedida === p.codUnidadMedida)?.nombre ?? '',
});

const porCategoria = (a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombreProducto.localeCompare(b.nombreProducto, 'es');

/** Filas de v_acta_inventario_fisico: un lote vivo por fila, por categoría y producto. compras: las de comprasDePrueba(). */
export function armarActa({ productos, lotes, compras, marcas, categorias, unidades }) {
  return productos.flatMap((p) => {
    const { categoria, marca, unidadMedida } = nombresDe(p, { marcas, categorias, unidades });
    return lotes.get(p.idProducto).filter((l) => l.cantidadDisponible > 0).map((l) => {
      const c = compras.find((x) => x.numeroCompra === l.numeroCompra);
      const mes = c && (c.periodoIva ?? c.fechaCompra);
      return {
        categoria, codigo: p.codigo, nombreProducto: p.nombreProducto, nombreMarca: marca, unidadMedida, idLote: l.idLote,
        cantidad: l.cantidadDisponible, costoUnitario: l.costoUnitario, valor: centavos(l.cantidadDisponible * l.costoUnitario),
        referenciaCosto: c ? `Libro de compras ${mes.slice(5, 7)}/${mes.slice(0, 4)}, compra ${c.numeroCompra}` : `Lote ${l.idLote} (ajuste)`,
      };
    });
  }).sort(porCategoria);
}

/**
 * El `conteo` del GET /api/inventario-fisico/{id}: un producto activo por fila.
 * @param {{ filas: Map<number, {cantidadContada:number|null, nota:string|null}>, congelado: Map|null }} d
 *        congelado: lo que decía el sistema al cerrar; null mientras es borrador (se usa la existencia de hoy).
 */
export function armarConteo({ productos, lotes, filas, congelado, marcas, categorias, unidades }) {
  return productos.filter((p) => p.activo).map((p) => {
    const sistema = congelado?.get(p.idProducto) ?? { existenciaSistema: existencia(lotes.get(p.idProducto)), valorSistema: valorAlCosto(lotes.get(p.idProducto)) };
    const { categoria, marca, unidadMedida } = nombresDe(p, { marcas, categorias, unidades });
    const fila = filas.get(p.idProducto);
    return {
      idProducto: p.idProducto, codigo: p.codigo, nombreProducto: p.nombreProducto, marca, categoria, unidadMedida,
      ...sistema, cantidadContada: fila?.cantidadContada ?? null, nota: fila?.nota ?? null,
    };
  }).sort(porCategoria);
}
