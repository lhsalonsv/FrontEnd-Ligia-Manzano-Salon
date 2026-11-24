/**
 * configuracionController.js — Ligia Manzano Salón
 * Pantalla Configuración (solo Administrador): datos del negocio como emisor, reglas del salón
 * (horario, comisiones, formas de pago, planilla) y usuarios. La matriz de permisos por rol es un
 * borrador de solo lectura hasta que el salón la confirme.
 *
 * URL: configuracion.html?seccion=reglas · ?seccion=usuarios[&idEmpleado=5] (desde Empleados)
 */
import { montarLayout, NOMBRE_ROL } from '../utils/layout.js';
import { icono } from '../utils/icons.js';
import { escapar, dinero, fechaCorta, fechaHora, iniciales, nitConGuiones, nrcConGuion } from '../utils/formato.js';
import { DIAS } from '../utils/horario.js';
import { centavos } from '../utils/calculos.js';
import { campo, entrada, mostrarErrores } from '../utils/formulario.js';
import { listarActividades, listarDistritos } from '../services/catalogosService.js';
import { listarEmpleados } from '../services/empleadosService.js';
import {
  obtenerNegocio, guardarNegocio, obtenerReglas, guardarReglas,
  listarUsuarios, crearUsuario, actualizarUsuario, restablecerContrasena, cambiarActivoUsuario,
} from '../services/configuracionService.js';

const sesion = montarLayout();
const $ = (id) => document.getElementById(id);
const dialogo = $('dialogo');
const SIN_CAMBIOS = 'Hay cambios sin guardar. ¿Salir sin guardar?';

const estado = {
  seccion: 'negocio',
  sucio: false,
  negocio: null,
  reglas: null,
  usuarios: [],
  empleados: [],
  actividades: [],
  distritos: [],
};

function sePuedeSalir() {
  if (estado.sucio && !confirm(SIN_CAMBIOS)) return false;
  estado.sucio = false;
  return true;
}

const ROLES = [
  { valor: 'ADMINISTRADOR', texto: 'Todo el sistema' },
  { valor: 'RECEPCIONISTA', texto: 'Agenda, cobros y clientes' },
  { valor: 'CONTADOR', texto: 'Reportes, facturas y planilla; no cobra ni anula' },
  { valor: 'AUDITOR', texto: 'Ve todo, no modifica' },
];

/**
 * BORRADOR del mockup: qué ve cada rol. Falta que el salón lo confirme (decisión D1).
 * '+' acceso completo, '~' parcial, '-' sin acceso. Columnas: Administrador, Recepcionista, Contador, Auditor.
 */
const MATRIZ_BORRADOR = [
  ['Inicio', '+Completo', '~El de recepción', '-', '~Solo ver'],
  ['Agenda', '+Completa', '+Completa', '-', '~Solo ver'],
  ['Punto de venta', '+Cobrar', '+Cobrar', '-', '-'],
  ['Clientes', '+Completo', '+Completo', '-', '~Solo ver'],
  ['Servicios', '+Editar', '~Ver', '-', '~Solo ver'],
  ['Inventario', '+Con costos', '~Solo existencias', '~Ver con costos', '~Solo ver'],
  ['Compras', '+Registrar', '-', '~Ver', '~Solo ver'],
  ['Empleados', '+Editar', '-', '~Ver salarios', '~Solo ver'],
  ['Comisiones y planilla', '+Cierra la quincena', '-', '~Ver y exportar', '~Solo ver'],
  ['Facturación', '+Puede anular', '~Consulta y reenvía', '~Consulta', '~Solo ver'],
  ['Reportes', '+Todos', '-', '+Todos', '+Todos'],
  ['Bitácora', '+Sí', '-', '-', '+Sí'],
  ['Configuración', '+Sí', '-', '-', '-'],
];

// Lista de pares y no objeto: JS pondría la clave 20 (número) antes que '02'
const TIPOS_ESTABLECIMIENTO = [['02', 'Casa matriz'], ['01', 'Sucursal'], ['04', 'Bodega'], ['07', 'Predio o patio'], ['20', 'Otro']];

const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const opciones = (pares, elegido) => pares.map(([v, t]) => `<option value="${escapar(v)}" ${String(v) === String(elegido) ? 'selected' : ''}>${escapar(t)}</option>`).join('');
const errorCarga = (mensaje) => `<div class="aviso aviso-error">${icono('alerta')}<p>${escapar(mensaje)}</p></div>`;

/** Barra de abajo de Negocio y Reglas: último cambio, Descartar y Guardar. */
function htmlPie(ultimoCambio, boton) {
  return `<div class="sticky bottom-0 -mx-4 mt-2 flex flex-wrap items-center gap-3 border-t border-borde-default bg-fondo-app/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-medio sm:border sm:bg-fondo-superficie">
    <p class="basis-full text-13 text-texto-secundario sm:mr-auto sm:basis-auto">${ultimoCambio ? `Último cambio: ${fechaHora(ultimoCambio.fechaHora)} · ${escapar(ultimoCambio.nombreUsuario)}` : 'Sin cambios desde la instalación.'}</p>
    <button type="button" class="btn btn-secundario flex-1 sm:flex-none" data-accion="descartar">Descartar</button>
    <button type="submit" class="btn btn-primario flex-1 sm:flex-none" id="${boton}">Guardar cambios</button>
  </div>`;
}

function avisoGuardado(contenedor, mensaje) {
  contenedor.insertAdjacentHTML('afterbegin', `<div class="aviso aviso-exito mb-4" role="status">${icono('info')}<p>${escapar(mensaje)}</p></div>`);
}

// --- Secciones ---------------------------------------------------------------

function cambiarSeccion(seccion) {
  estado.seccion = seccion;
  for (const b of $('secciones').querySelectorAll('[data-seccion]')) b.setAttribute('aria-pressed', String(b.dataset.seccion === seccion));
  for (const s of ['negocio', 'reglas', 'usuarios']) $(`seccion-${s}`).classList.toggle('hidden', s !== seccion);
  history.replaceState(null, '', seccion === 'negocio' ? location.pathname : `${location.pathname}?seccion=${seccion}`);
  return { negocio: cargarNegocio, reglas: cargarReglas, usuarios: cargarUsuarios }[seccion]();
}

// --- Negocio y Hacienda ------------------------------------------------------

async function cargarNegocio(aviso = '') {
  const seccion = $('seccion-negocio');
  seccion.innerHTML = '<p class="py-10 text-center text-texto-secundario">Cargando…</p>';
  try {
    const [negocio, actividades, distritos] = await Promise.all([obtenerNegocio(), listarActividades(), listarDistritos()]);
    Object.assign(estado, { negocio, actividades, distritos });
  } catch (error) {
    seccion.innerHTML = errorCarga(error.message);
    return;
  }
  pintarNegocio();
  if (aviso) avisoGuardado($('form-negocio'), aviso);
}

function pintarNegocio() {
  const n = estado.negocio;
  const produccion = n.ambiente === '01';
  const envio = n.ultimoEnvio;
  $('seccion-negocio').innerHTML = `
    <form id="form-negocio" class="flex flex-col gap-4" novalidate>
      <div id="error-negocio" class="aviso aviso-error hidden" role="alert"></div>
      <div class="tarjeta rounded-grande p-4 sm:p-6">
        <h2 class="text-lg font-semibold">Datos del negocio</h2>
        <p class="mb-4 text-sm text-texto-secundario">Estos datos salen en cada factura como emisor.</p>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          ${campo({ nombre: 'nombreComercial', columna: 'nombre_comercial', etiqueta: 'Nombre comercial', control: entrada('nombreComercial', n.nombreComercial, 'maxlength="150" autocomplete="off"') })}
          ${campo({ nombre: 'nombre', columna: 'nombre', etiqueta: 'Nombre o razón social', obligatorio: true, ayuda: 'El que tiene el NIT. Si es persona natural, su nombre.', control: entrada('nombre', n.nombre, 'maxlength="250" autocomplete="off" aria-describedby="ayuda-nombre"') })}
          ${campo({ nombre: 'nit', columna: 'nit', etiqueta: 'NIT', obligatorio: true, control: entrada('nit', nitConGuiones(n.nit), 'maxlength="17" inputmode="numeric" autocomplete="off" class="tabular-nums"') })}
          ${campo({ nombre: 'nrc', columna: 'nrc', etiqueta: 'NRC', obligatorio: true, control: entrada('nrc', nrcConGuion(n.nrc), 'maxlength="9" inputmode="numeric" autocomplete="off" class="tabular-nums"') })}
          <div class="sm:col-span-2">${campo({ nombre: 'codActividad', columna: 'cod_actividad', etiqueta: 'Actividad económica', obligatorio: true, control: `<select id="f-codActividad" name="codActividad"><option value="">Elegir…</option>${opciones(estado.actividades.map((a) => [a.codActividad, `${a.codActividad} · ${a.descripcion}`]), n.codActividad)}</select>` })}</div>
          ${campo({ nombre: 'telefono', columna: 'telefono', etiqueta: 'Teléfono', obligatorio: true, control: entrada('telefono', n.telefono, 'type="tel" maxlength="30" autocomplete="off"') })}
          ${campo({ nombre: 'correo', columna: 'correo', etiqueta: 'Correo', obligatorio: true, ayuda: 'Desde aquí salen las facturas.', control: entrada('correo', n.correo, 'type="email" maxlength="100" autocomplete="off" aria-describedby="ayuda-correo"') })}
          ${campo({ nombre: 'idDistrito', columna: 'id_distrito', etiqueta: 'Distrito', obligatorio: true, control: `<select id="f-idDistrito" name="idDistrito"><option value="">Elegir…</option>${opciones(estado.distritos.map((d) => [d.idDistrito, `${d.distrito} · ${d.municipio}, ${d.departamento}`]), n.idDistrito)}</select>` })}
          ${campo({ nombre: 'tipoEstablecimiento', columna: 'tipo_establecimiento', etiqueta: 'Tipo de establecimiento', obligatorio: true, control: `<select id="f-tipoEstablecimiento" name="tipoEstablecimiento">${opciones(TIPOS_ESTABLECIMIENTO, n.tipoEstablecimiento)}</select>` })}
          <div class="sm:col-span-2">${campo({ nombre: 'complemento', columna: 'complemento', etiqueta: 'Dirección', obligatorio: true, ayuda: 'Calle, número y colonia; el distrito va aparte.', control: entrada('complemento', n.complemento, 'maxlength="200" autocomplete="off" aria-describedby="ayuda-complemento"') })}</div>
        </div>
      </div>

      <div class="tarjeta rounded-grande p-4 sm:p-6">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold">Conexión con Hacienda</h2>
          <span class="insignia ${produccion ? 'insignia-ok' : 'insignia-aviso'}" data-campo="ambiente">${produccion ? 'Producción' : 'Pruebas'}</span>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          ${campo({ nombre: 'codEstable', columna: 'cod_estable', etiqueta: 'Establecimiento', obligatorio: true, ayuda: 'Va en el número de control (M001).', control: entrada('codEstable', n.codEstable, 'maxlength="4" autocomplete="off" spellcheck="false" class="font-mono uppercase" aria-describedby="ayuda-codEstable"') })}
          ${campo({ nombre: 'codPuntoVenta', columna: 'cod_punto_venta', etiqueta: 'Punto de venta', obligatorio: true, ayuda: 'La caja del salón (P001).', control: entrada('codPuntoVenta', n.codPuntoVenta, 'maxlength="4" autocomplete="off" spellcheck="false" class="font-mono uppercase" aria-describedby="ayuda-codPuntoVenta"') })}
          <div><span class="campo-etiqueta">Último envío</span>
          <p class="text-sm">${envio ? `${fechaHora(envio.fechaHora)} · ${escapar(envio.estado === 'PROCESADO' ? 'aceptado' : envio.estado.toLowerCase())} · <span class="font-mono text-13">…${escapar(envio.numeroControl.slice(-4))}</span>` : 'Todavía no se ha enviado ninguna factura.'}</p></div>
          <div><span class="campo-etiqueta">Certificado de firma</span>
          <p class="text-sm">${n.certificadoVence ? `Vigente · vence el ${fechaCorta(n.certificadoVence)}` : 'Sin cargar'}</p></div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3 rounded-medio bg-fondo-sutil p-3 text-sm text-texto-secundario">
          ${icono('candado', 'size-[18px]')}
          <p class="min-w-60 flex-1">La contraseña de Hacienda y la llave del certificado no se escriben aquí. Se guardan en el servidor; esta pantalla solo muestra si funcionan.</p>
          <button type="button" class="btn btn-secundario h-9 text-sm" disabled title="Disponible cuando se programe Facturación">Probar conexión</button>
        </div>
      </div>
      ${htmlPie(n.ultimoCambio, 'btn-guardar-negocio')}
    </form>`;
  estado.sucio = false;
}

function leerNegocio(form) {
  const v = (nombre) => form.elements[nombre].value.trim().replace(/\s+/g, ' ');
  const datos = {
    nombreComercial: v('nombreComercial') || null,
    nombre: v('nombre'),
    nit: soloDigitos(v('nit')),
    nrc: soloDigitos(v('nrc')),
    codActividad: v('codActividad'),
    tipoEstablecimiento: v('tipoEstablecimiento'),
    idDistrito: Number(v('idDistrito')) || null,
    complemento: v('complemento'),
    telefono: v('telefono'),
    correo: v('correo'),
    codEstable: v('codEstable').toUpperCase(),
    codPuntoVenta: v('codPuntoVenta').toUpperCase(),
  };
  const errores = {};
  if (!datos.nombre) errores.nombre = 'Escriba el nombre que tiene el NIT.';
  if (![9, 14].includes(datos.nit.length)) errores.nit = 'El NIT tiene 14 dígitos (o 9 si es un DUI).';
  if (datos.nrc.length < 2 || datos.nrc.length > 8) errores.nrc = 'El NRC tiene de 2 a 8 dígitos.';
  if (!datos.codActividad) errores.codActividad = 'Elija la actividad.';
  if (!datos.telefono) errores.telefono = 'Escriba el teléfono.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) errores.correo = 'Escriba un correo válido.';
  if (!datos.idDistrito) errores.idDistrito = 'Elija el distrito.';
  if (!datos.complemento) errores.complemento = 'Escriba la dirección.';
  if (!/^[MBSP]\d{3}$/.test(datos.codEstable)) errores.codEstable = 'Una letra (M, B, S o P) y 3 números: M001.';
  if (!/^P\d{3}$/.test(datos.codPuntoVenta)) errores.codPuntoVenta = 'P y 3 números: P001.';
  return { datos, errores };
}

async function enviarNegocio(form) {
  const errorGeneral = $('error-negocio');
  errorGeneral.classList.add('hidden');
  const { datos, errores } = leerNegocio(form);
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;
  const n = estado.negocio;
  const delicados = ['nit', 'nrc', 'codEstable'].filter((c) => datos[c] !== n[c]);
  if (delicados.length && !confirm('Cambió el NIT, el NRC o el establecimiento. Las facturas nuevas saldrán con los datos nuevos; las ya emitidas no cambian. ¿Guardar?')) return;

  const boton = $('btn-guardar-negocio');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    estado.negocio = await guardarNegocio(datos);
    pintarNegocio();
    avisoGuardado($('form-negocio'), 'Cambios guardados. Las facturas nuevas ya salen con estos datos.');
    $('form-negocio').scrollIntoView({ block: 'start' });
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';
  }
}

// --- Reglas del salón --------------------------------------------------------

async function cargarReglas() {
  const seccion = $('seccion-reglas');
  seccion.innerHTML = '<p class="py-10 text-center text-texto-secundario">Cargando…</p>';
  try {
    estado.reglas = await obtenerReglas();
  } catch (error) {
    seccion.innerHTML = errorCarga(error.message);
    return;
  }
  pintarReglas();
}

/** ISSS de la empleada por quincena con el salario tope: 3 % de $1,000 = $30 al mes → $15. */
const topeQuincena = (pct, tope) => (pct === '' || tope === '' ? '' : `Tope: ${dinero(centavos((Number(pct) / 100) * Number(tope) / 2))} por quincena.`);

function pintarReglas() {
  const r = estado.reglas;
  const fila = (h) => {
    const d = h.diaSemana;
    return `<li class="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-neutro-100 py-2 last:border-0 sm:grid-cols-[120px_112px_minmax(0,1fr)]" data-campo="dia_semana">
      <b class="font-semibold">${DIAS[d - 1]}</b>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="abierto-${d}" class="size-4 accent-neutro-900" ${h.abierto ? 'checked' : ''}> Abierto</label>
      <div class="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1" data-horas="${d}">
        <div class="campo-caja h-10 min-h-0 w-32 ${h.abierto ? '' : 'hidden'}" data-tiempo><input type="time" name="abre-${d}" id="f-abre-${d}" value="${h.horaAbre?.slice(0, 5) ?? ''}" step="900" aria-label="${DIAS[d - 1]}: abre" ${h.abierto ? '' : 'disabled'}></div>
        <span class="text-texto-secundario ${h.abierto ? '' : 'hidden'}" data-tiempo>a</span>
        <div class="campo-caja h-10 min-h-0 w-32 ${h.abierto ? '' : 'hidden'}" data-tiempo><input type="time" name="cierra-${d}" id="f-cierra-${d}" value="${h.horaCierra?.slice(0, 5) ?? ''}" step="900" aria-label="${DIAS[d - 1]}: cierra" ${h.abierto ? '' : 'disabled'}></div>
        <span class="text-sm text-texto-secundario ${h.abierto ? 'hidden' : ''}" data-cerrado>Cerrado</span>
      </div>
      <p class="campo-error col-span-full hidden" id="error-abre-${d}"></p>
    </li>`;
  };
  const numeroCampo = (nombre, columna, etiqueta, valor, { prefijo = '', sufijo = '', ayuda = '', max = '' } = {}) => campo({
    nombre, columna, etiqueta, obligatorio: true, ayuda,
    control: `${prefijo ? `<span class="text-texto-secundario">${prefijo}</span>` : ''}${entrada(nombre, valor, `type="number" inputmode="decimal" min="0" ${max ? `max="${max}"` : ''} step="0.01" class="tabular-nums" ${ayuda ? `aria-describedby="ayuda-${nombre}"` : ''}`)}${sufijo ? `<span class="shrink-0 text-texto-secundario">${sufijo}</span>` : ''}`,
  });
  const fijo = (titulo, texto) => `<div class="flex justify-between gap-3 border-b border-neutro-100 py-2 text-sm last:border-0"><span>${titulo}</span><span class="text-right text-texto-secundario">${texto}</span></div>`;

  $('seccion-reglas').innerHTML = `
    <form id="form-reglas" class="flex flex-col gap-4" novalidate>
      <div id="error-reglas" class="aviso aviso-error hidden" role="alert"></div>
      <p class="aviso aviso-info">${icono('info')}<span>Lo nuevo aplica a las ventas siguientes; lo ya cobrado no se recalcula.</span></p>

      <div class="grid items-start gap-4 2xl:grid-cols-2">
      <div class="tarjeta rounded-grande p-4 sm:p-6">
        <h2 class="text-lg font-semibold">Horario <span class="text-sm font-normal text-texto-secundario">la agenda solo muestra estas horas</span></h2>
        <ul class="mt-2">${r.horarios.map(fila).join('')}</ul>
        <p class="campo-error hidden" id="error-horarios"></p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
        <div class="tarjeta rounded-grande p-4 sm:p-6">
          <h2 class="mb-4 text-lg font-semibold">Comisiones <span class="text-sm font-normal text-texto-secundario">valores por defecto</span></h2>
          <div class="flex flex-col gap-4">
            ${numeroCampo('comisionServicioPct', 'COMISION_SERVICIO_PCT', 'Por servicio', r.comisionServicioPct, { sufijo: '% sin IVA', max: 100, ayuda: 'Igual para todos los servicios.' })}
            ${numeroCampo('comisionProducto', 'COMISION_PRODUCTO', 'Por producto vendido', Number(r.comisionProducto).toFixed(2), { prefijo: '$', ayuda: 'Valor inicial al crear un producto; cada producto puede tener la suya.' })}
          </div>
        </div>
        <fieldset class="tarjeta rounded-grande p-4 sm:p-6" data-campo="formas_pago">
          <legend class="sr-only">Formas de pago</legend>
          <h2 class="mb-2 text-lg font-semibold" aria-hidden="true">Formas de pago</h2>
          ${r.formasPago.map((f) => {
            const efectivo = f.idFormaPago === 1;
            const nota = efectivo ? 'Abre y cierra la caja; no se apaga' : f.pideReferencia ? 'Pide el número de referencia' : '';
            return `<label class="flex items-start gap-3 border-b border-neutro-100 py-2 text-sm last:border-0 ${efectivo ? 'cursor-not-allowed' : 'cursor-pointer'}">
              <input type="checkbox" name="forma-${f.idFormaPago}" class="mt-0.5 size-4 accent-neutro-900" ${f.activo ? 'checked' : ''} ${efectivo ? 'disabled' : ''}>
              <span><b class="block font-semibold">${escapar(f.nombre)}</b>${nota ? `<small class="text-13 text-texto-secundario">${nota}</small>` : ''}</span>
            </label>`;
          }).join('')}
          <p class="campo-error hidden" id="error-formasPago"></p>
        </fieldset>
      </div>

      </div>

      <div class="tarjeta rounded-grande p-4 sm:p-6">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold">Planilla</h2>
          <span class="insignia insignia-aviso">Por confirmar con el contador</span>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          ${numeroCampo('isssEmpleadoPct', 'ISSS_EMPLEADO_PCT', 'ISSS de la empleada', r.isssEmpleadoPct, { sufijo: '%', max: 100 })}
          ${numeroCampo('isssTopeMensual', 'ISSS_TOPE_MENSUAL', 'Salario tope del ISSS', Number(r.isssTopeMensual).toFixed(2), { prefijo: '$', sufijo: 'al mes', ayuda: topeQuincena(r.isssEmpleadoPct, r.isssTopeMensual) })}
          ${numeroCampo('afpEmpleadoPct', 'AFP_EMPLEADO_PCT', 'AFP de la empleada', r.afpEmpleadoPct, { sufijo: '%', max: 100 })}
        </div>
        <div class="mt-4">
          ${fijo('Períodos', '1–15 y 16–fin de mes')}
          ${fijo('Renta', 'Tabla de retención · fija')}
          ${fijo('Quincena 25', '50 % del salario · enero')}
          ${fijo('Aguinaldo', 'Días por antigüedad · diciembre')}
        </div>
        <p class="mt-3 text-13 text-texto-secundario">ISSS y AFP de la empleada se actualizan aquí si cambia la ley. La tabla de renta, la Quincena 25 y el aguinaldo van fijos en el sistema. El aporte del salón no se calcula.</p>
      </div>
      ${htmlPie(r.ultimoCambio, 'btn-guardar-reglas')}
    </form>`;
  estado.sucio = false;
}

const dosDecimales = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

function leerReglas(form) {
  const el = form.elements;
  const numeroDe = (nombre) => (el[nombre].value === '' ? null : Number(el[nombre].value));
  const errores = {};
  const horarios = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const abierto = el[`abierto-${d}`].checked;
    const horaAbre = abierto ? el[`abre-${d}`].value : null;
    const horaCierra = abierto ? el[`cierra-${d}`].value : null;
    if (abierto && (!horaAbre || !horaCierra)) errores[`abre-${d}`] = 'Escriba a qué hora abre y a qué hora cierra.';
    else if (abierto && horaCierra <= horaAbre) errores[`abre-${d}`] = 'La hora de cierre tiene que ser después de la de apertura.';
    return { diaSemana: d, abierto, horaAbre, horaCierra };
  });
  if (!horarios.some((h) => h.abierto)) errores['abierto-1'] = 'El salón tiene que abrir al menos un día.';

  const datos = {
    horarios,
    comisionServicioPct: numeroDe('comisionServicioPct'),
    comisionProducto: numeroDe('comisionProducto'),
    isssEmpleadoPct: numeroDe('isssEmpleadoPct'),
    isssTopeMensual: numeroDe('isssTopeMensual'),
    afpEmpleadoPct: numeroDe('afpEmpleadoPct'),
    formasPago: estado.reglas.formasPago.map((f) => ({ idFormaPago: f.idFormaPago, activo: f.idFormaPago === 1 || el[`forma-${f.idFormaPago}`].checked })),
  };
  for (const c of ['comisionServicioPct', 'isssEmpleadoPct', 'afpEmpleadoPct']) {
    if (datos[c] === null || !(datos[c] >= 0 && datos[c] <= 100) || !dosDecimales(datos[c])) errores[c] = 'Un porcentaje de 0 a 100, con hasta 2 decimales.';
  }
  for (const c of ['comisionProducto', 'isssTopeMensual']) {
    if (datos[c] === null || !(datos[c] >= 0) || !dosDecimales(datos[c])) errores[c] = 'Un monto de 0 o más, con hasta 2 decimales.';
  }
  return { datos, errores };
}

async function enviarReglas(form) {
  const errorGeneral = $('error-reglas');
  errorGeneral.classList.add('hidden');
  const { datos, errores } = leerReglas(form);
  // "abierto-1" no tiene su propio <p> de error: el mensaje va en el del lunes
  if (errores['abierto-1'] && !errores['abre-1']) errores['abre-1'] = errores['abierto-1'];
  delete errores['abierto-1'];
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar-reglas');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    estado.reglas = await guardarReglas(datos);
    pintarReglas();
    avisoGuardado($('form-reglas'), 'Cambios guardados.');
    $('form-reglas').scrollIntoView({ block: 'start' });
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    errorGeneral.scrollIntoView({ block: 'nearest' });
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';
  }
}

// --- Usuarios y roles --------------------------------------------------------

async function cargarUsuarios() {
  const seccion = $('seccion-usuarios');
  seccion.innerHTML = '<p class="py-10 text-center text-texto-secundario">Cargando…</p>';
  try {
    const [usuarios, { empleados }] = await Promise.all([listarUsuarios(), listarEmpleados()]);
    Object.assign(estado, { usuarios, empleados });
  } catch (error) {
    seccion.innerHTML = errorCarga(error.message);
    return;
  }
  pintarUsuarios();
}

const nombreEmpleado = (id) => {
  const e = estado.empleados.find((x) => x.idEmpleado === id);
  return e ? `${e.nombreEmpleado} ${e.apellido}` : '';
};

function htmlFilaUsuario(u) {
  const estadoUsuario = !u.activo
    ? '<span class="insignia insignia-apagada">Inactivo</span>'
    : u.debeCambiarContrasena ? '<span class="insignia insignia-aviso">Clave temporal</span>' : '<span class="insignia insignia-ok">Activo</span>';
  return `<button type="button" data-id="${u.idUsuario}" class="fila-u min-h-14 w-full cursor-pointer border-b border-neutro-100 py-2 text-left text-15 hover:bg-fondo-sutil ${u.activo ? '' : 'text-texto-secundario'}">
    <span class="flex min-w-0 items-center gap-3"><span class="ini" aria-hidden="true">${escapar(iniciales(u.nombreCompleto))}</span>
      <span class="min-w-0"><b class="block truncate font-semibold">${escapar(u.nombreCompleto)}</b><small class="block truncate text-13 text-texto-secundario">${u.idEmpleado ? `Empleada: ${escapar(nombreEmpleado(u.idEmpleado))}` : `<span class="font-mono md:hidden">${escapar(u.nombreUsuario)}</span>`}</small></span></span>
    <span class="truncate font-mono text-sm max-md:hidden">${escapar(u.nombreUsuario)}</span>
    <span class="max-sm:hidden">${NOMBRE_ROL[u.rol] ?? escapar(u.rol)}</span>
    <span class="text-sm text-texto-secundario max-md:hidden">${u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : 'Nunca'}</span>
    <span class="text-right">${estadoUsuario}</span>
  </button>`;
}

function htmlMatriz() {
  const porRol = (rol) => estado.usuarios.filter((u) => u.activo && u.rol === rol).length;
  const celda = (valor) => {
    const nivel = valor[0];
    const texto = nivel === '-' ? 'No' : valor.slice(1);
    const punto = { '+': 'bg-estado-exito', '~': 'bg-aviso-300', '-': 'bg-neutro-300' }[nivel];
    return `<td class="px-3 py-2 ${nivel === '-' ? 'text-texto-deshabilitado' : ''}"><span class="inline-flex items-center gap-2"><span class="size-2 shrink-0 rounded-full ${punto}" aria-hidden="true"></span>${texto}</span></td>`;
  };
  return `
    <div class="tarjeta overflow-hidden rounded-grande">
      <div class="aviso aviso-aviso rounded-none">${icono('advertencia')}<p><b class="font-semibold">Pendiente:</b> el salón aún no define qué ve cada rol. Esta tabla es un borrador para revisarlo con ellos. Mientras tanto, todos los roles ven todos los módulos, menos Configuración.</p></div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-sm">
          <caption class="sr-only">Borrador: qué ve cada rol en cada módulo</caption>
          <thead class="bg-fondo-sutil text-left text-13 text-texto-secundario">
            <tr><th scope="col" class="px-3 py-2 font-semibold">Módulo</th>${ROLES.map((r) => `<th scope="col" class="px-3 py-2 font-semibold">${NOMBRE_ROL[r.valor]}<small class="block font-normal">${porRol(r.valor) === 1 ? '1 usuario' : `${porRol(r.valor)} usuarios`}</small></th>`).join('')}</tr>
          </thead>
          <tbody>${MATRIZ_BORRADOR.map(([modulo, ...celdas]) => `<tr class="border-t border-neutro-100"><th scope="row" class="px-3 py-2 text-left font-semibold">${modulo}</th>${celdas.map(celda).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="flex flex-wrap gap-x-4 gap-y-1 border-t border-borde-default px-3 py-2 text-13 text-texto-secundario">
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-estado-exito"></span>Acceso completo</span>
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-aviso-300"></span>Acceso parcial</span>
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-neutro-300"></span>Sin acceso</span>
        <span class="ml-auto">El rol se elige al crear el usuario.</span>
      </p>
    </div>`;
}

function pintarUsuarios(aviso = '') {
  const activos = estado.usuarios.filter((u) => u.activo).length;
  $('seccion-usuarios').innerHTML = `
    <div class="flex flex-col gap-4">
      ${aviso ? `<div class="aviso aviso-exito" role="status">${icono('info')}<p>${escapar(aviso)}</p></div>` : ''}
      <div class="flex flex-wrap items-center gap-3">
        <div class="mr-auto"><h2 class="text-lg font-semibold">Usuarios <span class="text-sm font-normal text-texto-secundario tabular-nums">${activos === 1 ? '1 activo' : `${activos} activos`}</span></h2>
        <p class="text-sm text-texto-secundario">Cada usuario tiene un rol fijo; el rol decide qué módulos ve. Las estilistas no necesitan usuario.</p></div>
        <button type="button" class="btn btn-primario" data-accion="nuevo-usuario">${icono('mas')}Nuevo usuario</button>
      </div>
      <div class="tarjeta overflow-hidden rounded-grande">
        <div class="fila-u h-9 border-b border-borde-default bg-fondo-sutil text-13 font-semibold text-texto-secundario" aria-hidden="true">
          <span>Persona</span><span class="max-md:hidden">Usuario</span><span class="max-sm:hidden">Rol</span><span class="max-md:hidden">Último acceso</span><span class="text-right">Estado</span>
        </div>
        <div id="lista-usuarios">${estado.usuarios.map(htmlFilaUsuario).join('')}</div>
      </div>
      <h2 class="mt-2 text-lg font-semibold">Qué ve cada rol</h2>
      ${htmlMatriz()}
    </div>`;
}

/** 'Paola Gómez' → 'paola.gomez' */
const sugerirUsuario = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');

function abrirUsuario(usuario = null, { idEmpleado = null } = {}) {
  const editando = Boolean(usuario);
  const u = usuario ?? { rol: 'RECEPCIONISTA', idEmpleado, nombreCompleto: idEmpleado ? nombreEmpleado(idEmpleado) : '' };
  const ocupados = new Set(estado.usuarios.filter((x) => x.idEmpleado && x.idUsuario !== usuario?.idUsuario).map((x) => x.idEmpleado));
  const empleadosLibres = estado.empleados.filter((e) => e.activo && !ocupados.has(e.idEmpleado));
  const yo = sesion.usuario.idUsuario === usuario?.idUsuario;

  dialogo.innerHTML = `
    <form id="form-usuario" class="flex max-h-[calc(100dvh-2rem)] flex-col" novalidate>
      <div class="flex items-start gap-3 px-6 pt-6 pb-2">
        <div class="min-w-0"><h2 id="dialogo-titulo" class="text-xl">${editando ? escapar(u.nombreCompleto) : 'Nuevo usuario'}</h2>
        <p class="text-sm text-texto-secundario">${editando ? `<span class="font-mono">${escapar(u.nombreUsuario)}</span>${u.activo ? '' : ' · inactivo'}` : 'Los campos con * son obligatorios'}</p></div>
        <button type="button" data-accion="cerrar-dialogo" class="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-chico text-texto-secundario hover:bg-fondo-sutil" aria-label="Cerrar">${icono('cerrar')}</button>
      </div>
      <div class="flex flex-col gap-4 overflow-y-auto px-6 py-3">
        <div id="error-usuario" class="aviso aviso-error hidden" role="alert"></div>
        ${campo({ nombre: 'nombreCompleto', columna: 'nombre_completo', etiqueta: 'Nombre completo', obligatorio: true, control: entrada('nombreCompleto', u.nombreCompleto, 'maxlength="150" autocomplete="off"') })}
        ${editando ? '' : campo({ nombre: 'nombreUsuario', columna: 'nombre_usuario', etiqueta: 'Usuario para entrar', obligatorio: true, ayuda: 'Minúsculas, sin espacios ni tildes. No se cambia después.', control: entrada('nombreUsuario', sugerirUsuario(u.nombreCompleto), 'maxlength="50" autocomplete="off" spellcheck="false" autocapitalize="none" class="font-mono" aria-describedby="ayuda-nombreUsuario"') })}
        <fieldset data-campo="id_rol">
          <legend class="campo-etiqueta">Rol <span class="text-estado-error" aria-hidden="true">*</span></legend>
          <div class="grid gap-2 sm:grid-cols-2">
            ${ROLES.map((r) => `<label class="opcion"><input type="radio" name="rol" value="${r.valor}" ${r.valor === u.rol ? 'checked' : ''}><span><b>${NOMBRE_ROL[r.valor]}</b><small>${r.texto}</small></span></label>`).join('')}
          </div>
          <p class="campo-error hidden" id="error-rol"></p>
        </fieldset>
        ${campo({ nombre: 'idEmpleado', columna: 'id_empleado', etiqueta: 'Es empleada del salón', ayuda: 'Para ligar sus ventas y comisiones. El contador o el auditor externos no lo son.', control: `<select id="f-idEmpleado" name="idEmpleado" aria-describedby="ayuda-idEmpleado"><option value="">No</option>${opciones(empleadosLibres.map((e) => [e.idEmpleado, `${e.nombreEmpleado} ${e.apellido}`]), u.idEmpleado ?? '')}</select>` })}
        ${editando ? `
          <div class="rounded-medio border border-borde-default p-3 text-sm">
            <p class="mb-2 text-texto-secundario">Último acceso: ${u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : 'nunca'}${u.debeCambiarContrasena ? ' · tiene una contraseña temporal' : ''}</p>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <button type="button" class="cursor-pointer font-semibold underline decoration-borde-fuerte underline-offset-2" data-accion="restablecer">Restablecer contraseña</button>
              ${yo ? '' : `<button type="button" class="cursor-pointer font-semibold underline underline-offset-2 ${u.activo ? 'text-estado-error decoration-rojo-100' : 'decoration-borde-fuerte'}" data-accion="activo-usuario">${u.activo ? 'Desactivar' : 'Activar'}</button>`}
            </div>
            <p class="mt-2 text-13 text-texto-secundario">Restablecer también la desbloquea si se equivocó cinco veces. Desactivar no borra: su nombre queda en la bitácora.</p>
          </div>`
        : `<p class="aviso aviso-info">${icono('info')}<span>Al guardar, el sistema crea una <b class="font-semibold">contraseña temporal</b>. Se la entregas en persona; la primera vez que entre tendrá que cambiarla.</span></p>`}
      </div>
      <div class="grid grid-cols-2 gap-3 border-t border-borde-default px-6 pt-4 pb-6">
        <button type="button" class="btn btn-secundario" data-accion="cerrar-dialogo">Cancelar</button>
        <button type="submit" class="btn btn-primario" id="btn-guardar-usuario">${editando ? 'Guardar cambios' : 'Crear usuario'}</button>
      </div>
    </form>`;

  const form = $('form-usuario');
  let usuarioTocado = false;
  form.addEventListener('input', (e) => {
    estado.sucio = true;
    if (e.target.name === 'nombreUsuario') usuarioTocado = true;
    // Mientras no lo escriba a mano, el usuario se sugiere del nombre
    if (!editando && !usuarioTocado && e.target.name === 'nombreCompleto') form.elements.nombreUsuario.value = sugerirUsuario(e.target.value);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); enviarUsuario(form, usuario); });
  dialogo.usuario = usuario;
  estado.sucio = false;
  if (!dialogo.open) dialogo.showModal();
  form.elements.nombreCompleto.focus();
}

async function enviarUsuario(form, usuario) {
  const errorGeneral = $('error-usuario');
  errorGeneral.classList.add('hidden');
  const v = (nombre) => form.elements[nombre]?.value.trim().replace(/\s+/g, ' ') ?? '';
  const datos = { nombreCompleto: v('nombreCompleto'), rol: v('rol'), idEmpleado: Number(v('idEmpleado')) || null };
  if (!usuario) datos.nombreUsuario = v('nombreUsuario').toLowerCase();
  const errores = {};
  if (!datos.nombreCompleto) errores.nombreCompleto = 'Escriba el nombre de la persona.';
  if (!usuario && !/^[a-z0-9._-]{3,50}$/.test(datos.nombreUsuario)) errores.nombreUsuario = 'De 3 a 50: minúsculas, números, punto, guion o guion bajo.';
  if (!datos.rol) errores.rol = 'Elija el rol.';
  mostrarErrores(form, errores);
  if (Object.keys(errores).length) return;

  const boton = $('btn-guardar-usuario');
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    if (usuario) {
      const guardado = await actualizarUsuario(usuario.idUsuario, datos);
      estado.sucio = false;
      reemplazarUsuario(guardado);
      cerrarDialogo();
      pintarUsuarios(guardado.rol !== usuario.rol ? `Cambios guardados. ${guardado.nombreCompleto} vuelve a entrar con el rol nuevo.` : 'Cambios guardados.');
    } else {
      const { usuario: nuevo, contrasenaTemporal } = await crearUsuario(datos);
      estado.sucio = false;
      estado.usuarios.push(nuevo);
      pintarUsuarios();
      mostrarContrasena(nuevo, contrasenaTemporal, 'Usuario creado');
    }
  } catch (error) {
    if (error.detalle?.campos) mostrarErrores(form, error.detalle.campos);
    errorGeneral.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    errorGeneral.classList.remove('hidden');
    boton.disabled = false;
    boton.textContent = textoBoton;
  }
}

/** Cierra y vacía la ventana: la contraseña temporal no se queda en el HTML ni en memoria. */
function cerrarDialogo() {
  dialogo.close();
  dialogo.innerHTML = '';
  dialogo.contrasena = null;
  dialogo.usuario = null;
}

function reemplazarUsuario(u) {
  estado.usuarios = estado.usuarios.map((x) => (x.idUsuario === u.idUsuario ? u : x));
}

/** La única vez que se ve la contraseña temporal. */
function mostrarContrasena(usuario, contrasena, titulo) {
  dialogo.innerHTML = `
    <div class="flex flex-col gap-4 p-6">
      <div><h2 id="dialogo-titulo" class="text-xl">${titulo}</h2>
      <p class="text-sm text-texto-secundario">Contraseña temporal de <b class="font-semibold text-texto-principal">${escapar(usuario.nombreCompleto)}</b> · usuario <span class="font-mono">${escapar(usuario.nombreUsuario)}</span></p></div>
      <div class="flex items-center gap-3 rounded-medio border border-neutro-900 bg-fondo-sutil p-4">
        <output class="flex-1 font-mono text-xl tracking-wide break-all select-all">${escapar(contrasena)}</output>
        <button type="button" class="btn btn-secundario h-9 text-sm" data-accion="copiar">Copiar</button>
      </div>
      <p class="aviso aviso-aviso">${icono('advertencia')}<span><b class="block font-semibold">No se vuelve a mostrar.</b>Entrégala en persona o en papel, no por chat. Al entrar tendrá que cambiarla. Si se pierde, restablécela y sale otra.</span></p>
      <button type="button" class="btn btn-primario" data-accion="cerrar-dialogo">Listo</button>
    </div>`;
  dialogo.contrasena = contrasena;
  if (!dialogo.open) dialogo.showModal();
  dialogo.querySelector('[data-accion="copiar"]').focus();
}

async function restablecer(usuario) {
  if (!confirm(`¿Restablecer la contraseña de ${usuario.nombreCompleto}? La actual deja de servir y se cierran sus sesiones abiertas.`)) return;
  try {
    const { contrasenaTemporal } = await restablecerContrasena(usuario.idUsuario);
    reemplazarUsuario({ ...usuario, debeCambiarContrasena: true });
    pintarUsuarios();
    mostrarContrasena(usuario, contrasenaTemporal, 'Contraseña restablecida');
  } catch (error) {
    alert(error.message);
  }
}

async function cambiarActivo(usuario) {
  if (usuario.activo && !confirm(`¿Desactivar a ${usuario.nombreCompleto}? Ya no podrá entrar y se cierran sus sesiones. No se borra nada.`)) return;
  try {
    const guardado = await cambiarActivoUsuario(usuario.idUsuario, !usuario.activo);
    reemplazarUsuario(guardado);
    estado.sucio = false;
    cerrarDialogo();
    pintarUsuarios(guardado.activo ? `${guardado.nombreCompleto} puede volver a entrar.` : `${guardado.nombreCompleto} ya no puede entrar.`);
  } catch (error) {
    const caja = $('error-usuario');
    caja.innerHTML = `${icono('alerta')}<p>${escapar(error.message)}</p>`;
    caja.classList.remove('hidden');
  }
}

// --- Eventos -----------------------------------------------------------------

if (sesion && sesion.usuario.rol !== 'ADMINISTRADOR') {
  // La API también responde 403; esto solo evita mostrar una pantalla que no va a funcionar.
  $('principal').innerHTML = `<div class="aviso aviso-info max-w-xl">${icono('candado')}<p><b class="block font-semibold">Solo la administradora entra a Configuración.</b>Si necesitas cambiar algo, pídeselo a ella.</p></div>`;
} else if (sesion) {
  $('secciones').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-seccion]');
    if (!boton || boton.dataset.seccion === estado.seccion || !sePuedeSalir()) return;
    cambiarSeccion(boton.dataset.seccion);
  });

  const principal = $('principal');
  principal.addEventListener('input', (e) => {
    if (!e.target.closest('#form-negocio, #form-reglas')) return;
    estado.sucio = true;
    const form = e.target.form;
    if (form?.id === 'form-reglas') {
      const [tipo, dia] = e.target.name.split('-');
      if (tipo === 'abierto') {
        const caja = form.querySelector(`[data-horas="${dia}"]`);
        for (const input of caja.querySelectorAll('input')) input.disabled = !e.target.checked;
        for (const parte of caja.querySelectorAll('[data-tiempo]')) parte.classList.toggle('hidden', !e.target.checked);
        caja.querySelector('[data-cerrado]').classList.toggle('hidden', e.target.checked);
      }
      if (['isssEmpleadoPct', 'isssTopeMensual'].includes(e.target.name)) {
        $('ayuda-isssTopeMensual').textContent = topeQuincena(form.elements.isssEmpleadoPct.value, form.elements.isssTopeMensual.value);
      }
    }
  });
  principal.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'form-negocio') enviarNegocio(e.target);
    if (e.target.id === 'form-reglas') enviarReglas(e.target);
  });
  principal.addEventListener('click', (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'descartar' && sePuedeSalir()) (estado.seccion === 'negocio' ? pintarNegocio : pintarReglas)();
    if (accion === 'nuevo-usuario') abrirUsuario();
    const fila = e.target.closest('#lista-usuarios [data-id]');
    if (fila) abrirUsuario(estado.usuarios.find((u) => u.idUsuario === Number(fila.dataset.id)));
  });

  dialogo.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'cerrar-dialogo' && sePuedeSalir()) cerrarDialogo();
    if (accion === 'restablecer') restablecer(dialogo.usuario);
    if (accion === 'activo-usuario') cambiarActivo(dialogo.usuario);
    if (accion === 'copiar') {
      try {
        await navigator.clipboard.writeText(dialogo.contrasena);
        e.target.textContent = 'Copiada';
      } catch {
        e.target.textContent = 'Selecciónala y cópiala';
      }
    }
  });
  // Esc cierra el <dialog>: si hay cambios, se pregunta primero
  dialogo.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (sePuedeSalir()) cerrarDialogo();
  });

  window.addEventListener('beforeunload', (e) => { if (estado.sucio) e.preventDefault(); });

  const params = new URLSearchParams(location.search);
  const seccion = ['reglas', 'usuarios'].includes(params.get('seccion')) ? params.get('seccion') : 'negocio';
  const listo = cambiarSeccion(seccion);
  // Desde Empleados: ?seccion=usuarios&idEmpleado=5 abre su usuario, o uno nuevo ligado a ella
  const idEmpleado = Number(params.get('idEmpleado'));
  if (seccion === 'usuarios' && idEmpleado) {
    listo.then(() => {
      const suyo = estado.usuarios.find((u) => u.idEmpleado === idEmpleado);
      abrirUsuario(suyo ?? null, { idEmpleado });
    });
  }
}
