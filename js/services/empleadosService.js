/**
 * empleadosService.js — Ligia Manzano Salón
 * Empleados (tb_empleados), sus especialidades y su horario. Contrato en docs/contrato-api.md → "Empleados".
 *
 *   GET   /api/empleados             → { quincena, horarioSalon, empleados: [resumen] }  (activos y de baja)
 *   GET   /api/empleados/{id}        → ficha: columnas + especialidades + horarios + usuario
 *   POST  /api/empleados | PUT /api/empleados/{id}
 *   PATCH /api/empleados/{id}/baja   { fechaBaja }
 */
import { DATOS_PRUEBA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { EMPLEADOS_PRUEBA, HORARIO_SALON_PRUEBA } from '../mocks/empleados.js';

export async function listarEmpleados() {
  if (DATOS_PRUEBA.empleados) return listarPrueba();
  return authFetch('/empleados');
}

export async function obtenerEmpleado(idEmpleado) {
  if (DATOS_PRUEBA.empleados) {
    await esperar();
    return structuredClone(buscar(idEmpleado));
  }
  return authFetch(`/empleados/${idEmpleado}`);
}

/** Crea o actualiza. `datos` = columnas de tb_empleados + especialidades [ids] + horarios [{diaSemana, horaInicio, horaFin}]. */
export async function guardarEmpleado(datos, idEmpleado = null) {
  if (DATOS_PRUEBA.empleados) return guardarPrueba(datos, idEmpleado);
  return idEmpleado
    ? authFetch(`/empleados/${idEmpleado}`, { method: 'PUT', cuerpo: datos })
    : authFetch('/empleados', { method: 'POST', cuerpo: datos });
}

/** Dar de baja no borra: sus ventas y comisiones quedan en el historial. */
export async function darDeBaja(idEmpleado, fechaBaja) {
  if (DATOS_PRUEBA.empleados) {
    await esperar();
    const e = buscar(idEmpleado);
    if (fechaBaja < e.fechaIngreso) {
      throw new ApiError(400, 'La fecha de baja no puede ser antes del ingreso.', { campos: { fechaBaja: 'Es antes de la fecha de ingreso.' } });
    }
    Object.assign(e, { fechaBaja, activo: false, horarios: [] });
    return structuredClone(e);
  }
  return authFetch(`/empleados/${idEmpleado}/baja`, { method: 'PATCH', cuerpo: { fechaBaja } });
}

/** Quincena en curso: del 1 al 15 o del 16 al fin de mes. */
export function quincenaActual(hoy = new Date()) {
  const a = hoy.getFullYear();
  const m = hoy.getMonth();
  const primera = hoy.getDate() <= 15;
  const fecha = (d) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { inicio: fecha(primera ? 1 : 16), fin: fecha(primera ? 15 : new Date(a, m + 1, 0).getDate()) };
}

// --- Datos de prueba ---------------------------------------------------------
const esperar = () => new Promise((r) => setTimeout(r, 200));
const empleados = structuredClone(EMPLEADOS_PRUEBA);

function buscar(idEmpleado) {
  const e = empleados.find((x) => x.idEmpleado === Number(idEmpleado));
  if (!e) throw new ApiError(404, 'No se encontró el empleado.');
  return e;
}

async function listarPrueba() {
  await esperar();
  return {
    quincena: quincenaActual(),
    horarioSalon: structuredClone(HORARIO_SALON_PRUEBA),
    empleados: empleados.map((e) => ({
      idEmpleado: e.idEmpleado, nombreEmpleado: e.nombreEmpleado, apellido: e.apellido, puesto: e.puesto, dui: e.dui,
      rol: e.usuario?.rol ?? null, sueldoBaseMensual: e.sueldoBaseMensual, recibeComision: e.recibeComision,
      comisionesQuincena: e.comisionesQuincena, activo: e.activo, fechaBaja: e.fechaBaja,
    })),
  };
}

async function guardarPrueba(datos, idEmpleado) {
  await esperar();
  const repetido = datos.dui && empleados.find((x) => x.dui === datos.dui && x.idEmpleado !== Number(idEmpleado));
  if (repetido) throw new ApiError(409, 'Ya hay un empleado con ese DUI.', { campos: { dui: `Es el DUI de ${repetido.nombreEmpleado} ${repetido.apellido}.` } });
  if (idEmpleado) {
    Object.assign(buscar(idEmpleado), datos);
    return structuredClone(buscar(idEmpleado));
  }
  const nuevo = {
    ...datos, idEmpleado: Math.max(...empleados.map((x) => x.idEmpleado)) + 1,
    fechaBaja: null, activo: true, usuario: null, comisionesQuincena: 0,
  };
  empleados.push(nuevo);
  return structuredClone(nuevo);
}
