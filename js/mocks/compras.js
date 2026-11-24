/**
 * Proveedores de prueba. Solo se usan con DATOS_PRUEBA.compras = true (js/config.js).
 * Empresas, NIT, NRC, teléfonos y correos ficticios. Las compras de prueba no están aquí:
 * comprasService las arma con los lotes del inventario de prueba (cada lote = una línea de compra),
 * para que Compras e Inventario digan lo mismo.
 */

export const PROVEEDORES_PRUEBA = [
  {
    idProveedor: 1, nombreComercial: 'Distribuidora Aurora', razonSocial: 'Aurora Distribuciones, S.A. de C.V.',
    nit: '00000000000011', nrc: '0000011', contactoNombre: 'Sofía Rivas', telefono: '7000-0031', correo: 'pedidos@aurora.example',
    direccion: 'Calle Ficticia 101, San Salvador', diasCredito: 30, notas: 'Entrega martes y jueves. Pedido mínimo $50.', activo: true,
  },
  {
    idProveedor: 2, nombreComercial: 'Cosmética Central', razonSocial: 'Cosmética Central de Ejemplo, S.A. de C.V.',
    nit: '00000000000021', nrc: '0000021', contactoNombre: 'Roberto Flores', telefono: '7000-0032', correo: 'ventas@cosmeticacentral.example',
    direccion: null, diasCredito: 15, notas: null, activo: true,
  },
  {
    idProveedor: 3, nombreComercial: 'Nails & Co. Importadora', razonSocial: 'Nails and Company Importadora, S.A. de C.V.',
    nit: '00000000000031', nrc: '0000031', contactoNombre: 'Mariela Ayala', telefono: '7000-0033', correo: null,
    direccion: null, diasCredito: 0, notas: 'Solo de contado.', activo: true,
  },
  {
    idProveedor: 4, nombreComercial: 'Química Capilar Andina', razonSocial: 'Química Capilar Andina, S.A. de C.V.',
    nit: '00000000000041', nrc: '0000041', contactoNombre: 'Jorge Pineda', telefono: '7000-0034', correo: 'jpineda@qcandina.example',
    direccion: null, diasCredito: 30, notas: null, activo: true,
  },
  {
    idProveedor: 5, nombreComercial: 'Belleza Total Mayoreo', razonSocial: 'Belleza Total Mayoreo, S.A. de C.V.',
    nit: '00000000000051', nrc: '0000051', contactoNombre: null, telefono: null, correo: null,
    direccion: null, diasCredito: 0, notas: 'Cerró su bodega en San Salvador.', activo: false,
  },
  // Proveedores de gastos del local (no venden productos): sus compras no crean lotes
  {
    idProveedor: 6, nombreComercial: 'Energía del Valle', razonSocial: 'Distribuidora Eléctrica del Valle de Ejemplo, S.A. de C.V.',
    nit: '00000000000061', nrc: '0000061', contactoNombre: null, telefono: '7000-0036', correo: null,
    direccion: null, diasCredito: 0, notas: 'Recibo de energía: llega como crédito fiscal electrónico.', activo: true,
  },
  {
    // Persona natural: su NIT es el DUI (9 dígitos), así sale en la columna DUI del anexo de compras
    idProveedor: 7, nombreComercial: 'Mantenimiento Ejemplo', razonSocial: 'Persona Natural de Ejemplo',
    nit: '000000071', nrc: '0000071', contactoNombre: null, telefono: '7000-0037', correo: null,
    direccion: null, diasCredito: 0, notas: 'Revisa secadores y planchas cada mes.', activo: true,
  },
];

/** Qué proveedor surte cada marca del inventario de prueba (idMarca → idProveedor). */
export const PROVEEDOR_POR_MARCA = { 1: 1, 2: 4, 3: 3, 4: 2 };
