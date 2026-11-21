/**
 * Bitácora de prueba. Solo se usa con DATOS_PRUEBA.bitacora = true (js/config.js).
 * Personas, clientes y documentos ficticios (los mismos de los otros datos de prueba). Fechas relativas a hoy.
 * Ventas, Hacienda, caja y agenda todavía no existen en el sistema: sus registros muestran cómo se verán.
 */
import { fechaIso } from '../utils/formato.js';

const NOMBRES = { 1: 'Ligia Manzano', 2: 'Andrea López', 4: 'Sara Ramos' };
const EQUIPO = 'Chrome en Windows';

// [días atrás, hora, idUsuario (null = sistema), módulo, acción, entidad, entidadId, descripción, datosAntes, datosDespues]
const FILAS = [
  [0, '14:04', null, 'HACIENDA', 'ACEPTADO', 'DTE', 'DTE-01-M001P001-000000000000412', 'Aceptó la factura DTE-01-…0412 de Carmen Aguilar', { estado: 'ENVIADA' }, { estado: 'ACEPTADA', selloRecepcion: '2026B7E1…' }],
  [0, '14:04', 1, 'VENTAS', 'COBRAR', 'VENTA', 'V-0412', 'Cobró $91.00 a Carmen Aguilar · keratina y 2 productos', null, { total: 91, formaPago: 'Tarjeta de débito' }],
  [0, '13:31', null, 'HACIENDA', 'RECHAZADO', 'DTE', 'DTE-01-M001P001-000000000000409', 'Rechazó la factura DTE-01-…0409: correo no válido', { estado: 'ENVIADA' }, { estado: 'RECHAZADA', observacion: 'El correo del receptor no es válido' }],
  [0, '13:15', 1, 'ANULACIONES', 'ANULAR', 'DTE', 'DTE-01-M001P001-000000000000406', 'Anuló la factura DTE-01-…0406 de Lucía Pérez, $75.00', { estado: 'ACEPTADA' }, { estado: 'ANULADA', motivo: 'La clienta no quedó conforme con el tono.' }],
  [0, '12:40', 2, 'AGENDA', 'MOVER', 'CITA', '318', 'Movió la cita de Elena Torres de las 2:00 a las 2:30 con Karla', { horaInicio: '14:00' }, { horaInicio: '14:30' }],
  [0, '11:58', 1, 'VENTAS', 'COBRAR', 'VENTA', 'V-0406', 'Cobró $75.00 a Lucía Pérez · tinte completo', null, { total: 75, formaPago: 'Efectivo' }],
  [0, '10:20', 2, 'CLIENTES', 'EDITAR', 'CLIENTE', '1', 'Actualizó la fórmula de color de Carmen Aguilar', { formulaColor: '6.1 + 20 vol' }, { formulaColor: '6.1 + 7.1 · 20 vol' }],
  [0, '09:12', 1, 'INVENTARIO', 'AJUSTAR', 'PRODUCTO', '1', 'Ajustó Shampoo hidratante 400 ml: −1 por producto dañado (frasco roto)', { existencia: 3 }, { existencia: 2, motivo: 'Producto dañado: frasco roto' }],
  [0, '07:45', 1, 'CAJA', 'ABRIR', 'CAJA', '88', 'Abrió la caja con $50.00 de fondo', null, { fondoInicial: 50 }],
  [0, '07:43', 1, 'SESION', 'ENTRAR', 'USUARIO', '1', 'Inició sesión', null, null],
  [0, '07:41', null, 'SEGURIDAD', 'CONTRASENA_INCORRECTA', 'USUARIO', '1', 'Contraseña incorrecta para ligia.manzano · 2 intentos', null, null],
  [1, '17:52', 1, 'CAJA', 'CERRAR', 'CAJA', '87', 'Cerró la caja: esperado $412.50, contado $412.50, sin diferencia', null, { esperado: 412.5, contado: 412.5 }],
  [1, '16:30', 1, 'COMPRAS', 'REGISTRAR', 'COMPRA', 'C-0158', 'Registró la compra C-0158 de Distribuidora Aurora por $193.23 (4 productos)', null, { total: 193.23, productos: 4 }],
  [1, '15:05', 1, 'CONFIGURACION', 'EDITAR', 'PARAMETRO', 'COMISION_SERVICIO_PCT', 'Cambió la comisión por servicio de 10 % a 12 %', { comisionServicioPct: 10 }, { comisionServicioPct: 12 }],
  [1, '11:10', 1, 'USUARIOS', 'CREAR', 'USUARIO', '6', 'Creó el usuario paola.gomez (Recepcionista) con contraseña temporal', null, { nombreUsuario: 'paola.gomez', rol: 'RECEPCIONISTA' }],
  [1, '10:02', 1, 'EMPLEADOS', 'EDITAR', 'EMPLEADO', '3', 'Cambió el horario de Daniela Cruz: lunes 8:00–12:00 y 13:00–16:00', { lunes: '08:00–16:00' }, { lunes: '08:00–12:00 y 13:00–16:00' }],
  [1, '08:01', 4, 'SESION', 'ENTRAR', 'USUARIO', '4', 'Inició sesión', null, null],
  [3, '18:20', 1, 'PLANILLA', 'CERRAR_QUINCENA', 'PLANILLA', '2026-11-01', 'Cerró la quincena del 1 al 15 de noviembre: 4 empleadas, $1,512.00', { estado: 'ABIERTA' }, { estado: 'CERRADA' }],
  [3, '09:30', 1, 'SERVICIOS', 'EDITAR', 'SERVICIO', '4', 'Cambió el precio de Corte de dama de $12.00 a $14.00', { precio: 12 }, { precio: 14 }],
];

export const BITACORA_PRUEBA = FILAS.map(([dias, hora, idUsuario, modulo, accion, entidad, entidadId, descripcion, datosAntes, datosDespues], i) => ({
  idBitacora: 9000 + FILAS.length - i,
  fechaHora: `${fechaIso(new Date(), -dias)}T${hora}:00-06:00`,
  idUsuario, nombreUsuario: NOMBRES[idUsuario] ?? null,
  modulo, accion, entidad, entidadId, descripcion, datosAntes, datosDespues,
  equipo: idUsuario ? EQUIPO : null,
}));
