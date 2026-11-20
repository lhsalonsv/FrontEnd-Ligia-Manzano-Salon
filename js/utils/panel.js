/**
 * panel.js — Ligia Manzano Salón
 * Panel derecho de las pantallas de catálogo (Clientes, Servicios...): en pantalla ancha (xl) queda fijo
 * junto a la lista; en tablet y celular se abre encima, con fondo oscuro, y se cierra con Esc.
 */
import { icono } from './icons.js';
import { escapar, iniciales } from './formato.js';

const enPantallaAncha = () => window.matchMedia('(min-width: 80rem)').matches; // xl

/**
 * @param {{panel: HTMLElement, fondo: HTMLElement, vacio: string, alCerrar?: () => boolean|void}} o
 *        vacio: HTML que se ve en pantalla ancha cuando no hay nada abierto.
 *        alCerrar: se llama antes de cerrar; si devuelve false, no se cierra (p. ej. cambios sin guardar).
 */
export function crearPanel({ panel, fondo, vacio, alCerrar }) {
  let volverFoco = null;

  function abrir(origen) {
    if (origen) volverFoco = origen;
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    fondo.classList.remove('hidden');
  }

  function mostrarVacio() {
    panel.innerHTML = `<div class="m-auto max-w-60 p-6 text-center text-texto-secundario">${vacio}</div>`;
  }

  function cerrar() {
    if (alCerrar?.() === false) return;
    fondo.classList.add('hidden');
    if (enPantallaAncha()) {
      mostrarVacio();
    } else {
      panel.classList.add('hidden');
      panel.classList.remove('flex');
    }
    volverFoco?.focus();
  }

  fondo.addEventListener('click', cerrar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden') && !enPantallaAncha()) cerrar();
  });
  mostrarVacio();

  /** En celular lleva el foco al título; en escritorio solo si se pide (p. ej. tras guardar). */
  function enfocarTitulo(siempre = false) {
    if (siempre || !enPantallaAncha()) panel.querySelector('#panel-titulo')?.focus();
  }

  return { abrir, cerrar, enfocarTitulo };
}

/** Cabecera del panel: título (con iniciales opcionales), subtítulo y botón de cerrar (data-accion="cerrar"). */
export function htmlCabecera(titulo, subtitulo, { conIniciales = false, antes = '' } = {}) {
  return `<div class="flex items-start gap-3 px-6 pt-6 pb-4">
    ${conIniciales ? `<span class="ini size-12 text-base" aria-hidden="true">${escapar(iniciales(titulo))}</span>` : ''}
    <div class="min-w-0">${antes}<h2 id="panel-titulo" tabindex="-1" class="text-xl leading-tight outline-none">${escapar(titulo)}</h2><p class="mt-0.5 text-sm text-texto-secundario">${subtitulo}</p></div>
    <button type="button" data-accion="cerrar" class="ml-auto grid size-8 shrink-0 place-items-center rounded-chico text-texto-secundario hover:bg-fondo-sutil" aria-label="Cerrar">${icono('cerrar')}</button>
  </div>`;
}

/** Aviso de error dentro del panel. */
export const htmlError = (mensaje) => `<div class="aviso aviso-error mx-6">${icono('alerta')}<p>${escapar(mensaje)}</p></div>`;

/** Aviso verde de "guardado". */
export const htmlExito = (mensaje) => `<div class="aviso aviso-exito mx-6 mb-4" role="status">${icono('info')}<p>${escapar(mensaje)}</p></div>`;
