/**
 * Empleados de prueba. Solo se usan con DATOS_PRUEBA.empleados = true (js/config.js).
 * Personas, DUI, NUP e ISSS ficticios. Forma: el DTO de GET /api/empleados/{id} (docs/contrato-api.md).
 */

/** tb_horarios: 1 = lunes … 7 = domingo. */
export const HORARIO_SALON_PRUEBA = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({
  diaSemana,
  abierto: diaSemana !== 7,
  horaAbre: diaSemana === 7 ? null : '08:00',
  horaCierra: diaSemana === 7 ? null : (diaSemana === 6 ? '16:00' : '18:00'),
}));

const semana = (dias, bloques) => dias.flatMap((diaSemana) => bloques.map(([horaInicio, horaFin]) => ({ diaSemana, horaInicio, horaFin })));

const base = {
  telefono: null, correoEmpleado: null, fechaBaja: null, recibeComision: true,
  nupAfp: null, afpAdministradora: null, numeroIsss: null, usuario: null, activo: true, comisionesQuincena: 0,
};

export const EMPLEADOS_PRUEBA = [
  {
    ...base, idEmpleado: 5, nombreEmpleado: 'Ligia', apellido: 'Manzano', dui: '00000000-5', telefono: '7000-0101',
    puesto: 'Dueña', fechaIngreso: '2015-02-01', sueldoBaseMensual: 0, recibeComision: false,
    usuario: { nombreUsuario: 'ligia.manzano', rol: 'ADMINISTRADOR' }, especialidades: [], horarios: [],
  },
  {
    ...base, idEmpleado: 1, nombreEmpleado: 'Karla', apellido: 'Méndez', dui: '00000000-4', telefono: '7000-0126',
    correoEmpleado: 'karla.prueba@ejemplo.com', puesto: 'Estilista', fechaIngreso: '2023-03-06', sueldoBaseMensual: 408.8,
    afpAdministradora: 'CRECER', nupAfp: '000000004521', numeroIsss: '000000318', comisionesQuincena: 178,
    especialidades: [1, 2, 3], horarios: semana([1, 2, 3, 4, 5], [['08:00', '12:00'], ['13:00', '17:00']]),
  },
  {
    ...base, idEmpleado: 2, nombreEmpleado: 'Sofía', apellido: 'Rivas', dui: '00000000-1', telefono: '7000-0133',
    puesto: 'Estilista', fechaIngreso: '2024-01-15', sueldoBaseMensual: 408.8,
    afpAdministradora: 'CONFIA', nupAfp: '000000007788', numeroIsss: '000000502', comisionesQuincena: 140.5,
    especialidades: [1, 3], horarios: semana([2, 3, 4, 5, 6], [['09:00', '18:00']]),
  },
  {
    ...base, idEmpleado: 3, nombreEmpleado: 'Daniela', apellido: 'Cruz', dui: '00000000-2', telefono: '6000-0144',
    puesto: 'Estilista', fechaIngreso: '2024-08-01', sueldoBaseMensual: 408.8,
    afpAdministradora: 'CRECER', nupAfp: '000000001234', numeroIsss: '000000611', comisionesQuincena: 114,
    especialidades: [1, 2, 3], horarios: semana([1, 3, 5, 6], [['08:00', '16:00']]),
  },
  {
    ...base, idEmpleado: 4, nombreEmpleado: 'Marta', apellido: 'Hernández', dui: '00000000-3', telefono: '7000-0155',
    puesto: 'Manicurista', fechaIngreso: '2025-02-10', sueldoBaseMensual: 408.8,
    afpAdministradora: 'CONFIA', nupAfp: '000000005566', numeroIsss: '000000720', comisionesQuincena: 98.5,
    especialidades: [4], horarios: semana([1, 2, 3, 4, 5, 6], [['10:00', '16:00']]),
  },
  {
    ...base, idEmpleado: 6, nombreEmpleado: 'Rocío', apellido: 'Alvarado', dui: '00000000-6', telefono: '7000-0166',
    puesto: 'Estilista', fechaIngreso: '2023-05-02', fechaBaja: '2026-06-30', activo: false, sueldoBaseMensual: 408.8,
    afpAdministradora: 'CRECER', nupAfp: '000000009900', numeroIsss: '000000844', especialidades: [1], horarios: [],
  },
];
