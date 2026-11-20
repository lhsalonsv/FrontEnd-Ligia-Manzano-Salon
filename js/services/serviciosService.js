/**
 * serviciosService.js — Ligia Manzano Salón
 * Catálogo de servicios (tb_servicios) y especialidades. Contrato en docs/contrato-api.md → "Servicios".
 *
 *   GET   /api/servicios                 → { comisionServicioPct, ivaPct, servicios: [servicio] }  (activos e inactivos)
 *   GET   /api/servicios/{id}            → servicio + vecesEsteMes, tieneVentas, quienes
 *   POST  /api/servicios | PUT /api/servicios/{id}
 *   PATCH /api/servicios/{id}/activo     { activo }
 *   GET   /api/especialidades            → [{ idEspecialidad, nombreEspecialidad, empleados }]
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { SERVICIOS_PRUEBA, ESPECIALIDADES_PRUEBA, PARAMETROS_PRUEBA } from '../mocks/servicios.js';

export async function listarServicios() {
  if (DATOS_PRUEBA.servicios) {
    await esperar();
    return { ...PARAMETROS_PRUEBA, servicios: structuredClone(servicios) };
  }
  return authFetch('/servicios');
}

export async function obtenerServicio(idServicio) {
  if (DATOS_PRUEBA.servicios) return obtenerPrueba(idServicio);
  return authFetch(`/servicios/${idServicio}`);
}

/** Crea (sin idServicio) o actualiza. Cambiar el precio no toca ventas pasadas: cada venta guarda su precio. */
export async function guardarServicio(datos, idServicio = null) {
  if (DATOS_PRUEBA.servicios) return guardarPrueba(datos, idServicio);
  return idServicio
    ? authFetch(`/servicios/${idServicio}`, { method: 'PUT', cuerpo: datos })
    : authFetch('/servicios', { method: 'POST', cuerpo: datos });
}

/** Los servicios no se borran (tienen ventas): se desactivan y dejan de salir en la agenda y el POS. */
export async function cambiarActivo(idServicio, activo) {
  if (DATOS_PRUEBA.servicios) {
    await esperar();
    buscar(idServicio).activo = activo;
    return obtenerPrueba(idServicio);
  }
  return authFetch(`/servicios/${idServicio}/activo`, { method: 'PATCH', cuerpo: { activo } });
}

export async function listarEspecialidades() {
  if (DATOS_PRUEBA.servicios) return structuredClone(ESPECIALIDADES_PRUEBA);
  return authFetch('/especialidades');
}

// --- Datos de prueba ---------------------------------------------------------
const esperar = () => new Promise((r) => setTimeout(r, 200));
const servicios = structuredClone(SERVICIOS_PRUEBA);

function buscar(idServicio) {
  const encontrado = servicios.find((x) => x.idServicio === Number(idServicio));
  if (!encontrado) throw new ApiError(404, 'No se encontró el servicio.');
  return encontrado;
}

async function obtenerPrueba(idServicio) {
  await esperar();
  const servicio = structuredClone(buscar(idServicio));
  const especialidad = ESPECIALIDADES_PRUEBA.find((e) => e.idEspecialidad === servicio.idEspecialidad);
  // quién lo hace: los de la especialidad, con cuántas veces lo hicieron este mes
  servicio.quienes = (especialidad?.empleados ?? []).map((e, i) => ({
    ...e, vecesEsteMes: Math.max(servicio.vecesEsteMes - i * 2, 0),
  }));
  return servicio;
}

async function guardarPrueba(datos, idServicio) {
  await esperar();
  const repetido = servicios.find((x) => x.nombreServicio.toLowerCase() === datos.nombreServicio.toLowerCase()
    && x.idServicio !== Number(idServicio));
  if (repetido) {
    throw new ApiError(409, 'Ya existe un servicio con ese nombre.', { campos: { nombreServicio: 'Ya existe un servicio con ese nombre.' } });
  }
  if (idServicio) {
    Object.assign(buscar(idServicio), datos);
    return obtenerPrueba(idServicio);
  }
  const nuevo = { ...datos, idServicio: Math.max(...servicios.map((x) => x.idServicio)) + 1, activo: true, vecesEsteMes: 0, tieneVentas: false };
  servicios.push(nuevo);
  return obtenerPrueba(nuevo.idServicio);
}
