/**
 * Catálogos de Hacienda de prueba (CAT-019 actividades y CAT-008 distritos).
 * Son solo unos cuantos; el backend devuelve los catálogos completos de tb_cat_actividades y tb_cat_distritos.
 */
export const ACTIVIDADES_PRUEBA = [
  { codActividad: '10005', descripcion: 'Otros' },
  { codActividad: '46900', descripcion: 'Venta al por mayor de otros productos' },
  { codActividad: '47722', descripcion: 'Venta al por menor de artículos de perfumería y cosméticos' },
  { codActividad: '56101', descripcion: 'Restaurantes' },
  { codActividad: '69200', descripcion: 'Actividades de contabilidad, teneduría de libros y auditoría' },
  { codActividad: '70200', descripcion: 'Actividades de consultoría de gestión' },
  { codActividad: '82300', descripcion: 'Organización de convenciones y ferias de negocios' },
  { codActividad: '96020', descripcion: 'Peluquería y otros tratamientos de belleza' },
];

/** Forma del DTO: un distrito con su municipio y departamento, listo para mostrar. */
export const DISTRITOS_PRUEBA = [
  { idDistrito: 1, distrito: 'San Salvador', municipio: 'San Salvador Centro', departamento: 'San Salvador' },
  { idDistrito: 2, distrito: 'Mejicanos', municipio: 'San Salvador Centro', departamento: 'San Salvador' },
  { idDistrito: 3, distrito: 'Soyapango', municipio: 'San Salvador Este', departamento: 'San Salvador' },
  { idDistrito: 4, distrito: 'Antiguo Cuscatlán', municipio: 'La Libertad Este', departamento: 'La Libertad' },
  { idDistrito: 5, distrito: 'Santa Tecla', municipio: 'La Libertad Sur', departamento: 'La Libertad' },
  { idDistrito: 6, distrito: 'Santa Ana', municipio: 'Santa Ana Centro', departamento: 'Santa Ana' },
];
