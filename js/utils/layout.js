/**
 * layout.js — Ligia Manzano Salón
 * Dibuja el menú lateral y la barra superior en todas las páginas internas,
 * para no copiar el mismo HTML en cada archivo.
 *
 * Cada página interna tiene:
 *   <body data-pagina="inicio" data-titulo="Inicio">
 *     <div id="app" class="...">  <aside id="lateral"></aside>  <div> <header id="barra"></header> <main>…</main> </div> </div>
 * y su controlador llama a montarLayout().
 */
import { icono } from './icons.js';
import { escapar, iniciales } from './formato.js';
import { exigirSesion, vigilarInactividad } from './session.js';
import { salir } from '../services/authService.js';

/**
 * Menú. `listo: false` = la pantalla todavía no está programada (se ve deshabilitada).
 * `roles` = quién la ve. Todos la ven mientras el equipo no defina los permisos por rol
 * (pendiente: Administrador, Recepcionista, Contador, Auditor).
 */
const MENU = [
  [
    { id: 'inicio', texto: 'Inicio', href: 'inicio.html', listo: true },
    { id: 'agenda', texto: 'Agenda', href: 'agenda.html', listo: false },
    { id: 'pos', texto: 'Punto de venta', href: 'pos.html', listo: false },
    { id: 'clientes', texto: 'Clientes', href: 'clientes.html', listo: true },
  ],
  [
    { id: 'servicios', texto: 'Servicios', href: 'servicios.html', listo: true },
    { id: 'inventario', texto: 'Inventario', href: 'inventario.html', listo: true },
    { id: 'compras', texto: 'Compras', href: 'compras.html', listo: true },
  ],
  [
    { id: 'empleados', texto: 'Empleados', href: 'empleados.html', listo: true },
    { id: 'comisiones', texto: 'Comisiones y planilla', href: 'comisiones.html', listo: false },
  ],
  [
    { id: 'facturacion', texto: 'Facturación', href: 'facturacion.html', listo: false },
    { id: 'reportes', texto: 'Reportes', href: 'reportes.html', listo: false },
    { id: 'bitacora', texto: 'Bitácora', href: 'bitacora.html', listo: false },
    { id: 'configuracion', texto: 'Configuración', href: 'configuracion.html', listo: false },
  ],
];

const NOMBRE_ROL = {
  ADMINISTRADOR: 'Administrador',
  RECEPCIONISTA: 'Recepcionista',
  CONTADOR: 'Contador',
  AUDITOR: 'Auditor',
};

function enlaceMenu(item, paginaActual, rol) {
  if (item.roles && !item.roles.includes(rol)) return '';
  const actual = item.id === paginaActual;
  if (!item.listo) {
    return `<span class="nav-enlace" aria-disabled="true" title="En construcción">${icono(item.id)}${item.texto}</span>`;
  }
  return `<a class="nav-enlace" href="${item.href}" ${actual ? 'aria-current="page"' : ''}>${icono(item.id)}${item.texto}</a>`;
}

function htmlLateral(paginaActual, rol) {
  const grupos = MENU.map(
    (grupo) => `<div class="nav-grupo">${grupo.map((i) => enlaceMenu(i, paginaActual, rol)).join('')}</div>`,
  ).join('');
  return `
    <div class="flex items-center gap-3 px-2">
      <img src="img/isotipo-negativo.svg" alt="" class="h-[42px] w-11 shrink-0">
      <div>
        <b class="block text-lg leading-tight font-semibold text-texto-sobre-oscuro">Ligia Manzano</b>
        <span class="text-sm text-neutro-400">Salón · Administración</span>
      </div>
      <button type="button" id="btn-cerrar-menu" class="ml-auto rounded-chico p-1.5 text-lateral-texto hover:bg-neutro-800 lg:hidden" aria-label="Cerrar menú">${icono('cerrar')}</button>
    </div>
    <nav class="flex flex-col gap-4" aria-label="Menú principal">${grupos}</nav>`;
}

function htmlBarra(titulo, usuario, accion) {
  const boton = accion
    ? `<button type="button" id="${accion.id}" class="btn btn-primario h-9 px-3 sm:h-10 sm:px-4">${icono(accion.icono)}<span class="hidden sm:inline">${escapar(accion.texto)}</span></button>`
    : '';
  return `
    <button type="button" id="btn-abrir-menu" class="-ml-2 rounded-chico p-2 hover:bg-fondo-sutil lg:hidden" aria-label="Abrir menú" aria-controls="lateral" aria-expanded="false">${icono('menu')}</button>
    <h1 class="text-xl">${escapar(titulo)}</h1>
    <div class="ml-auto flex items-center gap-2 sm:gap-4">
      ${boton}
      <div class="flex items-center gap-3 text-sm leading-tight">
        <span class="grid size-9 place-items-center max-sm:hidden rounded-full bg-marca-carbon text-sm font-semibold text-texto-sobre-oscuro" aria-hidden="true">${escapar(iniciales(usuario.nombreCompleto))}</span>
        <div class="hidden sm:block">
          <b class="block text-15 font-semibold">${escapar(usuario.nombreCompleto)}</b>
          <span class="text-texto-secundario">${escapar(NOMBRE_ROL[usuario.rol] ?? usuario.rol)}</span>
        </div>
      </div>
      <a href="cambiar-contrasena.html" class="btn btn-secundario h-9 px-2.5" aria-label="Cambiar contraseña" title="Cambiar contraseña">${icono('candado')}</a>
      <button type="button" id="btn-salir" class="btn btn-secundario h-9 px-3 text-sm" aria-label="Salir">${icono('salir')}<span class="hidden sm:inline">Salir</span></button>
    </div>`;
}

/**
 * Monta menú y barra. Devuelve la sesión (o null si redirigió al login).
 * @param {{accion?: {id: string, texto: string, icono: string}}} [opciones]
 *        accion: botón principal de la pantalla, a la derecha de la barra (p. ej. "Nuevo cliente").
 */
export function montarLayout({ accion } = {}) {
  const sesion = exigirSesion();
  if (!sesion) return null;

  const { pagina, titulo } = document.body.dataset;
  const lateral = document.getElementById('lateral');
  const barra = document.getElementById('barra');
  lateral.innerHTML = htmlLateral(pagina, sesion.usuario.rol);
  barra.innerHTML = htmlBarra(titulo, sesion.usuario, accion);
  document.title = `${titulo} · Ligia Manzano Salón`;

  // Menú plegable en pantallas angostas (tablet de recepción)
  const fondo = document.getElementById('fondo-menu');
  const botonAbrir = document.getElementById('btn-abrir-menu');
  const abrir = (si) => {
    lateral.classList.toggle('-translate-x-full', !si);
    fondo?.classList.toggle('hidden', !si);
    botonAbrir.setAttribute('aria-expanded', String(si));
  };
  botonAbrir.addEventListener('click', () => abrir(true));
  document.getElementById('btn-cerrar-menu').addEventListener('click', () => abrir(false));
  fondo?.addEventListener('click', () => abrir(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && abrir(false));

  document.getElementById('btn-salir').addEventListener('click', salir);
  vigilarInactividad();
  return sesion;
}
