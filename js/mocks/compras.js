/**
 * Proveedores de prueba. Solo se usan con DATOS_PRUEBA.compras = true (js/config.js).
 * Empresas, NIT, NRC, teléfonos y correos ficticios. Las compras de prueba no están aquí:
 * comprasService las arma con los lotes del inventario de prueba (cada lote = una línea de compra),
 * para que Compras e Inventario digan lo mismo.
 */

export const PROVEEDORES_PRUEBA = [
  {
    idProveedor: 1, nombreComercial: 'Distribuidora Aurora', razonSocial: 'Aurora Distribuciones, S.A. de C.V.',
    nit: '00000000000011', nrc: '0000011', nacionalidad: 'El Salvador', contactoNombre: 'Sofía Rivas', telefono: '7000-0031', correo: 'pedidos@aurora.example',
    direccion: 'Calle Ficticia 101, San Salvador', diasCredito: 30, notas: 'Entrega martes y jueves. Pedido mínimo $50.', activo: true,
  },
  {
    idProveedor: 2, nombreComercial: 'Cosmética Central', razonSocial: 'Cosmética Central de Ejemplo, S.A. de C.V.',
    nit: '00000000000021', nrc: '0000021', nacionalidad: 'El Salvador', contactoNombre: 'Roberto Flores', telefono: '7000-0032', correo: 'ventas@cosmeticacentral.example',
    direccion: null, diasCredito: 15, notas: null, activo: true,
  },
  {
    idProveedor: 3, nombreComercial: 'Nails & Co. Importadora', razonSocial: 'Nails and Company Importadora, S.A. de C.V.',
    nit: '00000000000031', nrc: '0000031', nacionalidad: 'El Salvador', contactoNombre: 'Mariela Ayala', telefono: '7000-0033', correo: null,
    direccion: null, diasCredito: 0, notas: 'Solo de contado.', activo: true,
  },
  {
    idProveedor: 4, nombreComercial: 'Química Capilar Andina', razonSocial: 'Química Capilar Andina, S.A. de C.V.',
    nit: '00000000000041', nrc: '0000041', nacionalidad: 'Guatemala', contactoNombre: 'Jorge Pineda', telefono: '7000-0034', correo: 'jpineda@qcandina.example',
    direccion: null, diasCredito: 30, notas: null, activo: true,
  },
  {
    idProveedor: 5, nombreComercial: 'Belleza Total Mayoreo', razonSocial: 'Belleza Total Mayoreo, S.A. de C.V.',
    nit: '00000000000051', nrc: '0000051', nacionalidad: 'El Salvador', contactoNombre: null, telefono: null, correo: null,
    direccion: null, diasCredito: 0, notas: 'Cerró su bodega en San Salvador.', activo: false,
  },
  // Proveedores de gastos del local (no venden productos): sus compras no crean lotes
  {
    idProveedor: 6, nombreComercial: 'Energía del Valle', razonSocial: 'Distribuidora Eléctrica del Valle de Ejemplo, S.A. de C.V.',
    nit: '00000000000061', nrc: '0000061', nacionalidad: 'El Salvador', contactoNombre: null, telefono: '7000-0036', correo: null,
    direccion: null, diasCredito: 0, notas: 'Recibo de energía: llega como crédito fiscal electrónico.', activo: true,
  },
  {
    // Persona natural: su NIT es el DUI (9 dígitos), así sale en la columna DUI del anexo de compras
    idProveedor: 7, nombreComercial: 'Mantenimiento Ejemplo', razonSocial: 'Persona Natural de Ejemplo',
    nit: '000000071', nrc: '0000071', nacionalidad: 'El Salvador', contactoNombre: null, telefono: '7000-0037', correo: null,
    direccion: null, diasCredito: 0, notas: 'Revisa secadores y planchas cada mes.', activo: true,
  },
];

/** Qué proveedor surte cada marca del inventario de prueba (idMarca → idProveedor). */
export const PROVEEDOR_POR_MARCA = { 1: 1, 2: 4, 3: 3, 4: 2 };

/**
 * Nota de crédito del proveedor con líneas de producto (migración 1.5): las reglas de fn_registrar_devolucion_proveedor.
 * Cada producto sale del lote que creó la compra relacionada. `campos` = 400, `conflicto` = 409 STOCK_INSUFICIENTE.
 * @param {{ numeroCompra: string, lineas: object[] }} relacionada la compra que corrige (lineas con idProducto, idLote, cantidad)
 * @param {{ idProducto?: number, cantidad: number }[]} detalle
 * @param {object[]} productos los de js/mocks/inventario.js
 */
export function revisarDevolucion(relacionada, detalle, productos) {
  const campos = {};
  let conflicto = null;
  for (const { idProducto, cantidad } of detalle.filter((l) => l.idProducto)) {
    const nombre = productos.find((p) => p.idProducto === idProducto)?.nombreProducto ?? `El producto ${idProducto}`;
    const comprada = relacionada.lineas.find((l) => l.idProducto === idProducto);
    if (!comprada) campos.agregar = `${nombre} no viene en la compra ${relacionada.numeroCompra}.`;
    else if (cantidad > comprada.cantidad) campos.agregar = `${nombre}: la compra ${relacionada.numeroCompra} trajo ${comprada.cantidad}, no se pueden devolver ${cantidad}.`;
    else {
      const lote = productos.find((p) => p.idProducto === idProducto).lotes.find((l) => l.idLote === comprada.idLote);
      if (!conflicto && lote.cantidadDisponible < cantidad) conflicto = `De ${nombre} solo quedan ${lote.cantidadDisponible} unidades del lote de esa compra: no se pueden devolver ${cantidad}`; // = fn_registrar_devolucion_proveedor (v1.9)
    }
  }
  return { campos, conflicto };
}

/** Saca las unidades de sus lotes y deja el movimiento DEVOLUCION_PROVEEDOR. Devuelve el detalle con el `idLote` de cada línea de producto. */
export function aplicarDevolucion(relacionada, detalle, productos, numeroCompra, fechaHora) {
  return detalle.map((l) => {
    if (!l.idProducto) return l;
    const { idLote } = relacionada.lineas.find((x) => x.idProducto === l.idProducto);
    const producto = productos.find((p) => p.idProducto === l.idProducto);
    producto.lotes.find((x) => x.idLote === idLote).cantidadDisponible -= l.cantidad;
    producto.movimientos.push({ fechaHora, tipo: 'DEVOLUCION_PROVEEDOR', cantidad: -l.cantidad, referencia: numeroCompra, motivo: null, idLote });
    return { ...l, idLote };
  });
}
