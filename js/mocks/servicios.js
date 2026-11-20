/**
 * Servicios y especialidades de prueba. Solo se usan con DATOS_PRUEBA.servicios = true (js/config.js).
 * Precios y duraciones del mockup diseno/pantallas/servicios.html; personas ficticias.
 */

/** GET /api/especialidades: cada especialidad con los empleados activos que la tienen. */
export const ESPECIALIDADES_PRUEBA = [
  { idEspecialidad: 1, nombreEspecialidad: 'Cabello', empleados: [
    { idEmpleado: 1, nombreCompleto: 'Karla Méndez', cargo: 'Estilista' },
    { idEmpleado: 2, nombreCompleto: 'Sofía Rivas', cargo: 'Estilista' },
    { idEmpleado: 3, nombreCompleto: 'Daniela Cruz', cargo: 'Estilista' },
  ] },
  { idEspecialidad: 2, nombreEspecialidad: 'Color', empleados: [
    { idEmpleado: 1, nombreCompleto: 'Karla Méndez', cargo: 'Estilista' },
    { idEmpleado: 3, nombreCompleto: 'Daniela Cruz', cargo: 'Estilista' },
  ] },
  { idEspecialidad: 3, nombreEspecialidad: 'Tratamientos', empleados: [
    { idEmpleado: 1, nombreCompleto: 'Karla Méndez', cargo: 'Estilista' },
    { idEmpleado: 2, nombreCompleto: 'Sofía Rivas', cargo: 'Estilista' },
    { idEmpleado: 3, nombreCompleto: 'Daniela Cruz', cargo: 'Estilista' },
  ] },
  { idEspecialidad: 4, nombreEspecialidad: 'Uñas', empleados: [
    { idEmpleado: 4, nombreCompleto: 'Marta Hernández', cargo: 'Manicurista' },
  ] },
];

/** Parámetros que acompañan al catálogo (tb_parametros). */
export const PARAMETROS_PRUEBA = { comisionServicioPct: 10, ivaPct: 13 };

const s = (idServicio, nombreServicio, idEspecialidad, duracionMin, precio, extra = {}) => ({
  idServicio, nombreServicio, descripcion: null, idEspecialidad, duracionMin, precio, precioDesde: false, activo: true,
  vecesEsteMes: (idServicio * 7) % 13, tieneVentas: true, ...extra,
});

export const SERVICIOS_PRUEBA = [
  s(1, 'Corte dama', 1, 60, 12),
  s(2, 'Corte niña', 1, 30, 8),
  s(3, 'Corte y secado', 1, 60, 15),
  s(4, 'Cepillado', 1, 45, 10),
  s(5, 'Peinado', 1, 60, 15),
  s(6, 'Peinado de evento', 1, 90, 35, { precioDesde: true, descripcion: 'Precio según el largo del cabello y el peinado.' }),
  s(7, 'Tinte de raíz', 2, 90, 45),
  s(8, 'Tinte completo', 2, 120, 45, { precioDesde: true }),
  s(9, 'Mechas balayage', 2, 180, 65, { precioDesde: true }),
  s(10, 'Keratina', 3, 120, 60, { descripcion: 'Alisado con keratina y sellado.', vecesEsteMes: 9 }),
  s(11, 'Tratamiento capilar', 3, 60, 25),
  s(12, 'Manicure', 4, 45, 10),
  s(13, 'Manicure gel', 4, 60, 15),
  s(14, 'Pedicure spa', 4, 60, 18),
  s(15, 'Uñas acrílicas', 4, 120, 30),
  s(16, 'Planchado express', 1, 30, 7, { activo: false, vecesEsteMes: 0, tieneVentas: true }),
];
