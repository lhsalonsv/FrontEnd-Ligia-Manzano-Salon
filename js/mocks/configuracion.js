/**
 * Configuración de prueba. Solo se usa con DATOS_PRUEBA.configuracion = true (js/config.js).
 * NIT, NRC, teléfono y correo del salón son ficticios. El horario sale del mismo dato que usa Empleados,
 * y los usuarios, de los del login de prueba (js/mocks/usuarios.js).
 */
import { HORARIO_SALON_PRUEBA } from './empleados.js';

export const NEGOCIO_PRUEBA = {
  nombreComercial: 'Ligia Manzano Salón', nombre: 'Ligia Manzano', nit: '00000000000017', nrc: '0000017',
  codActividad: '96020', tipoEstablecimiento: '02', idDistrito: 1, complemento: 'Calle Ficticia 200, San Salvador',
  telefono: '7000-0140', correo: 'salon@ligiamanzano.example', codEstable: 'M001', codPuntoVenta: 'P001',
  ambiente: '00', certificadoVence: '2028-03-14',
  ultimoEnvio: null, // todavía no hay facturación
  ultimoCambio: null,
};

export const REGLAS_PRUEBA = {
  horarios: HORARIO_SALON_PRUEBA,
  comisionServicioPct: 10, comisionProducto: 2, isssEmpleadoPct: 3, isssTopeMensual: 1000, afpEmpleadoPct: 7.25,
  formasPago: [
    { idFormaPago: 1, nombre: 'Efectivo', pideReferencia: false, activo: true },
    { idFormaPago: 2, nombre: 'Tarjeta de débito', pideReferencia: true, activo: true },
    { idFormaPago: 3, nombre: 'Tarjeta de crédito', pideReferencia: true, activo: true },
    { idFormaPago: 4, nombre: 'Transferencia', pideReferencia: true, activo: true },
  ],
  ultimoCambio: null,
};

/** Qué empleado es cada usuario de prueba (tb_empleados.id_usuario). Los demás no son empleados del salón. */
export const EMPLEADO_DE_USUARIO = { 1: 5 };
