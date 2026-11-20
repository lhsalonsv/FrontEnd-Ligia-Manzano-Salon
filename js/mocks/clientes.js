/**
 * Clientes de prueba. Solo se usan con DATOS_PRUEBA.clientes = true (js/config.js).
 * Personas, teléfonos y documentos ficticios (teléfonos 7000-00xx / 6000-00xx, DUI 00000000-x).
 * Cada objeto tiene la forma del DTO de la ficha (GET /api/clientes/{id}, docs/contrato-api.md);
 * las fechas son relativas a hoy para que los filtros siempre tengan algo que mostrar.
 */

const hace = (dias) => {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  // fecha local (toISOString daría la de UTC, que en la noche ya es "mañana")
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const enDias = (dias, hora) => {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  f.setHours(...hora.split(':').map(Number), 0, 0);
  return f.toISOString();
};
const mesActual = new Date().getMonth() + 1;

const base = {
  apellido: null, correo: null, diaCumple: null, mesCumple: null, alergias: null,
  tipoDocumento: null, numDocumento: null,
  razonSocial: null, nit: null, nrc: null, nombreComercial: null, codActividad: null, idDistrito: null, complemento: null,
  activo: true, empleadoFrecuente: null, ultimaFormula: null, ultimasVisitas: [], proximaCita: null,
};

export const CLIENTES_PRUEBA = [
  {
    ...base, idCliente: 1, nombre: 'Carmen', apellido: 'Aguilar', telefono: '7000-0012', correo: 'carmen.prueba@ejemplo.com',
    diaCumple: 23, mesCumple: 1, alergias: 'Sensible al amoníaco. Usar productos sin amoníaco.',
    tipoDocumento: '13', numDocumento: '00000001-1', creadoEn: '2025-03-08T10:00:00-06:00',
    ultimaVisita: hace(0), visitas12m: 14, gastado12m: 684, empleadoFrecuente: 'Karla Méndez',
    ultimaFormula: { fecha: hace(36), empleado: 'Karla', formula: '6.1 + 6.0 (1:1) · oxidante 20 vol · 35 min', observaciones: 'Tinte de raíz. Sin amoníaco.' },
    ultimasVisitas: [
      { fecha: hace(0), descripcion: 'Keratina + 2 productos', empleado: 'Karla Méndez', total: 91 },
      { fecha: hace(36), descripcion: 'Tinte de raíz', empleado: 'Karla Méndez', total: 45 },
      { fecha: hace(78), descripcion: 'Corte y secado', empleado: 'Sofía Rivas', total: 15 },
    ],
  },
  {
    ...base, idCliente: 2, nombre: 'Gabriela', apellido: 'Sánchez', telefono: '7000-0045', mesCumple: mesActual, diaCumple: 28,
    creadoEn: '2025-06-14T10:00:00-06:00', ultimaVisita: hace(0), visitas12m: 9, gastado12m: 412.5, empleadoFrecuente: 'Sofía Rivas',
    proximaCita: { fechaHoraInicio: enDias(30, '10:00'), servicio: 'Tratamiento', empleado: 'Sofía' },
    ultimasVisitas: [{ fecha: hace(0), descripcion: 'Tratamiento capilar', empleado: 'Sofía Rivas', total: 55 }],
  },
  {
    ...base, idCliente: 3, nombre: 'Lucía', apellido: 'Pérez', telefono: '6000-0007', creadoEn: '2024-11-02T10:00:00-06:00',
    ultimaVisita: hace(0), visitas12m: 11, gastado12m: 598, empleadoFrecuente: 'Karla Méndez',
    proximaCita: { fechaHoraInicio: enDias(51, '9:00'), servicio: 'Tinte de raíz', empleado: 'Karla' },
  },
  {
    ...base, idCliente: 4, nombre: 'Rosa', apellido: 'Martínez', telefono: '7000-0088', creadoEn: '2023-02-20T10:00:00-06:00',
    ultimaVisita: hace(2), visitas12m: 22, gastado12m: 356,
    proximaCita: { fechaHoraInicio: enDias(7, '11:00'), servicio: 'Corte y secado', empleado: 'Karla' },
  },
  {
    ...base, idCliente: 5, nombre: 'Verónica', apellido: 'Díaz', telefono: '7000-0031', alergias: 'Cuero cabelludo sensible.',
    creadoEn: '2025-01-10T10:00:00-06:00', ultimaVisita: hace(5), visitas12m: 6, gastado12m: 540,
  },
  {
    ...base, idCliente: 6, nombre: 'Ana', apellido: 'Ramírez', telefono: '6000-0064', mesCumple: mesActual, diaCumple: 3,
    creadoEn: '2025-08-01T10:00:00-06:00', ultimaVisita: hace(9), visitas12m: 8, gastado12m: 248,
    proximaCita: { fechaHoraInicio: enDias(5, '15:00'), servicio: 'Peinado', empleado: 'Sofía' },
  },
  {
    ...base, idCliente: 7, nombre: 'Natalia', apellido: 'Vásquez', telefono: '7000-0053', creadoEn: '2025-04-22T10:00:00-06:00',
    ultimaVisita: hace(40), visitas12m: 7, gastado12m: 465,
    proximaCita: { fechaHoraInicio: enDias(0, '14:00'), servicio: 'Tinte completo', empleado: 'Daniela' },
  },
  {
    ...base, idCliente: 8, nombre: 'Elena', apellido: 'Torres', telefono: '6000-0026', creadoEn: '2025-09-30T10:00:00-06:00',
    ultimaVisita: hace(70), visitas12m: 5, gastado12m: 120,
    proximaCita: { fechaHoraInicio: enDias(0, '14:30'), servicio: 'Corte dama', empleado: 'Karla' },
  },
  {
    ...base, idCliente: 9, nombre: 'Patricia', apellido: 'Gómez', telefono: '7000-0070', alergias: 'Alergia al PPD (tintes oscuros).',
    creadoEn: '2025-02-12T10:00:00-06:00', ultimaVisita: hace(90), visitas12m: 4, gastado12m: 310,
    proximaCita: { fechaHoraInicio: enDias(0, '16:00'), servicio: 'Mechas balayage', empleado: 'Karla' },
  },
  {
    ...base, idCliente: 10, nombre: 'Valeria', apellido: 'Campos', telefono: '7000-0058', correo: 'facturas.prueba@ejemplo.com',
    razonSocial: 'Eventos de Prueba, S.A. de C.V.', nit: '00000000000001', nrc: '0000010', codActividad: '82300', idDistrito: 1,
    complemento: 'Colonia Ficticia, calle 1, San Salvador', creadoEn: '2025-10-05T10:00:00-06:00',
    ultimaVisita: hace(120), visitas12m: 3, gastado12m: 75,
  },
  {
    ...base, idCliente: 11, nombre: 'Mónica', apellido: 'Pineda', telefono: '7000-0041', creadoEn: '2024-07-19T10:00:00-06:00',
    ultimaVisita: null, visitas12m: 0, gastado12m: 0,
  },
];
