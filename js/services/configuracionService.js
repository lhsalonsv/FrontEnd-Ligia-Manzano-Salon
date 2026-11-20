/**
 * configuracionService.js — Ligia Manzano Salón
 * Negocio y Hacienda, reglas del salón y usuarios. Contrato en docs/contrato-api.md → "Configuración".
 * Todo es solo para el rol Administrador (la API responde 403 a los demás).
 *
 *   GET/PUT /api/configuracion/negocio · GET/PUT /api/configuracion/reglas
 *   GET /api/usuarios · POST /api/usuarios → { usuario, contrasenaTemporal } · PUT /api/usuarios/{id}
 *   POST /api/usuarios/{id}/restablecer-contrasena → { contrasenaTemporal } · PATCH /api/usuarios/{id}/activo
 */
import { DATOS_PRUEBA, CONTRASENA_MINIMA } from '../config.js';
import { authFetch, ApiError } from '../utils/authFetch.js';
import { obtenerSesion } from '../utils/session.js';
import { validarHorario, DIAS, hora } from '../utils/horario.js';
import { NEGOCIO_PRUEBA, REGLAS_PRUEBA, EMPLEADO_DE_USUARIO } from '../mocks/configuracion.js';
import { USUARIOS_PRUEBA } from '../mocks/usuarios.js';
import { EMPLEADOS_PRUEBA } from '../mocks/empleados.js';

export async function obtenerNegocio() {
  if (DATOS_PRUEBA.configuracion) return pausa(structuredClone(negocio));
  return authFetch('/configuracion/negocio');
}

export async function guardarNegocio(datos) {
  if (DATOS_PRUEBA.configuracion) {
    Object.assign(negocio, datos, { ultimoCambio: cambio() });
    return pausa(structuredClone(negocio));
  }
  return authFetch('/configuracion/negocio', { method: 'PUT', cuerpo: datos });
}

export async function obtenerReglas() {
  if (DATOS_PRUEBA.configuracion) return pausa(structuredClone(reglas));
  return authFetch('/configuracion/reglas');
}

export async function guardarReglas(datos) {
  if (DATOS_PRUEBA.configuracion) return guardarReglasPrueba(datos);
  return authFetch('/configuracion/reglas', { method: 'PUT', cuerpo: datos });
}

export async function listarUsuarios() {
  if (DATOS_PRUEBA.configuracion) return pausa(structuredClone(usuarios));
  return authFetch('/usuarios');
}

/** → { usuario, contrasenaTemporal }. La contraseña solo llega esta vez. */
export async function crearUsuario(datos) {
  if (DATOS_PRUEBA.configuracion) return crearPrueba(datos);
  return authFetch('/usuarios', { method: 'POST', cuerpo: datos });
}

export async function actualizarUsuario(idUsuario, datos) {
  if (DATOS_PRUEBA.configuracion) return actualizarPrueba(idUsuario, datos);
  return authFetch(`/usuarios/${idUsuario}`, { method: 'PUT', cuerpo: datos });
}

/** → { contrasenaTemporal }. También desbloquea la cuenta y cierra sus sesiones. */
export async function restablecerContrasena(idUsuario) {
  if (DATOS_PRUEBA.configuracion) {
    buscarUsuario(idUsuario).debeCambiarContrasena = true;
    return pausa({ contrasenaTemporal: temporal() });
  }
  return authFetch(`/usuarios/${idUsuario}/restablecer-contrasena`, { method: 'POST' });
}

export async function cambiarActivoUsuario(idUsuario, activo) {
  if (DATOS_PRUEBA.configuracion) return activoPrueba(idUsuario, activo);
  return authFetch(`/usuarios/${idUsuario}/activo`, { method: 'PATCH', cuerpo: { activo } });
}

// --- Datos de prueba ---------------------------------------------------------
const pausa = (valor) => new Promise((r) => setTimeout(() => r(valor), 250));
const negocio = structuredClone(NEGOCIO_PRUEBA);
const reglas = structuredClone(REGLAS_PRUEBA);
const hace = (horas) => new Date(Date.now() - horas * 3600e3).toISOString();
const usuarios = USUARIOS_PRUEBA.map(({ contrasena, ...u }, i) => ({
  ...u, activo: true, ultimoAcceso: u.debeCambiarContrasena ? null : hace(2 + i * 30), idEmpleado: EMPLEADO_DE_USUARIO[u.idUsuario] ?? null,
}));

const cambio = () => ({ fechaHora: new Date().toISOString(), nombreUsuario: obtenerSesion()?.usuario.nombreCompleto ?? '' });

/** En el backend la genera SecureRandom; aquí, crypto del navegador. Sin letras que se confunden (l, 1, O, 0). */
function temporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = crypto.getRandomValues(new Uint32Array(Math.max(CONTRASENA_MINIMA, 12)));
  const texto = [...azar].map((n) => letras[n % letras.length]).join('');
  return texto.match(/.{1,4}/g).join('-'); // k7Rm-2pQx-9Lwd: más fácil de dictar
}

function buscarUsuario(idUsuario) {
  const u = usuarios.find((x) => x.idUsuario === Number(idUsuario));
  if (!u) throw new ApiError(404, 'No se encontró el usuario.');
  return u;
}

const yo = () => obtenerSesion()?.usuario.idUsuario;
const adminsActivos = () => usuarios.filter((u) => u.activo && u.rol === 'ADMINISTRADOR');

async function guardarReglasPrueba(datos) {
  // 409 si una empleada activa trabaja fuera del horario nuevo
  for (const e of EMPLEADOS_PRUEBA.filter((x) => x.activo)) {
    const problemas = validarHorario(e.horarios, datos.horarios);
    const dia = Object.keys(problemas)[0];
    if (dia) {
      const s = datos.horarios.find((h) => h.diaSemana === Number(dia));
      const fin = e.horarios.filter((b) => b.diaSemana === Number(dia)).map((b) => b.horaFin).sort().at(-1);
      throw new ApiError(409, `${e.nombreEmpleado} ${e.apellido} trabaja el ${DIAS[dia - 1].toLowerCase()}${s.abierto ? ` hasta las ${hora(fin)}` : ''}. Cambie primero su horario en Empleados.`, { codigo: 'HORARIO_FUERA' });
    }
  }
  const activos = new Map(datos.formasPago.map((f) => [f.idFormaPago, f.activo]));
  Object.assign(reglas, datos, {
    formasPago: reglas.formasPago.map((f) => ({ ...f, activo: activos.get(f.idFormaPago) ?? f.activo })),
    ultimoCambio: cambio(),
  });
  return pausa(structuredClone(reglas));
}

async function crearPrueba(datos) {
  await pausa();
  if (usuarios.some((u) => u.nombreUsuario === datos.nombreUsuario)) {
    throw new ApiError(409, 'Ese nombre de usuario ya existe.', { codigo: 'USUARIO_DUPLICADO', campos: { nombreUsuario: 'Ya existe. Pruebe agregando una inicial o un número.' } });
  }
  const usuario = {
    ...datos, idUsuario: Math.max(...usuarios.map((u) => u.idUsuario)) + 1, activo: true, debeCambiarContrasena: true, ultimoAcceso: null,
  };
  usuarios.push(usuario);
  return { usuario: structuredClone(usuario), contrasenaTemporal: temporal() };
}

async function actualizarPrueba(idUsuario, datos) {
  await pausa();
  const u = buscarUsuario(idUsuario);
  const dejaDeSerAdmin = u.rol === 'ADMINISTRADOR' && datos.rol !== 'ADMINISTRADOR';
  if (dejaDeSerAdmin && u.idUsuario === yo()) {
    throw new ApiError(400, 'No puede quitarse a sí misma el rol de Administrador.', { campos: { rol: 'Pídaselo a otra administradora.' } });
  }
  if (dejaDeSerAdmin && adminsActivos().length === 1) {
    throw new ApiError(400, 'Es la única administradora: el sistema se quedaría sin quien lo configure.', { campos: { rol: 'Tiene que quedar al menos una administradora.' } });
  }
  Object.assign(u, datos);
  return structuredClone(u);
}

async function activoPrueba(idUsuario, activo) {
  await pausa();
  const u = buscarUsuario(idUsuario);
  if (!activo && u.idUsuario === yo()) throw new ApiError(400, 'No puede desactivar su propio usuario.');
  if (!activo && u.rol === 'ADMINISTRADOR' && adminsActivos().length === 1) {
    throw new ApiError(400, 'Es la única administradora activa: el sistema se quedaría sin quien lo configure.');
  }
  u.activo = activo;
  return structuredClone(u);
}
