/**
 * formulario.js — Ligia Manzano Salón
 * Piezas de formulario que comparten las pantallas: campo con etiqueta + error, y mostrar errores
 * (los de la validación del frontend y los `campos` que manda el backend en un 400/409).
 */
import { escapar } from './formato.js';

/**
 * Campo con etiqueta, caja y mensaje de error.
 * @param {{nombre: string, columna: string, etiqueta: string, obligatorio?: boolean, ayuda?: string, control: string}} o
 *        nombre = clave del JSON (camelCase, igual al name del control); columna = columna del SQL (data-campo).
 */
export function campo({ nombre, columna, etiqueta, obligatorio = false, ayuda = '', control }) {
  return `<div data-campo="${columna}">
    <label class="campo-etiqueta" for="f-${nombre}">${etiqueta}${obligatorio ? ' <span class="text-estado-error" aria-hidden="true">*</span>' : ' <span class="opcional">opcional</span>'}</label>
    <div class="campo-caja">${control}</div>
    ${ayuda ? `<p class="campo-ayuda" id="ayuda-${nombre}">${ayuda}</p>` : ''}
    <p class="campo-error hidden" id="error-${nombre}"></p>
  </div>`;
}

/** <input> con id f-<nombre> y su valor escapado. */
export const entrada = (nombre, valor, extra = '') =>
  `<input id="f-${nombre}" name="${nombre}" value="${escapar(valor ?? '')}" ${extra}>`;

/** Limpia los errores anteriores, marca los nuevos y pone el foco en el primero. */
export function mostrarErrores(form, errores) {
  for (const p of form.querySelectorAll('.campo-error')) {
    p.classList.add('hidden');
    p.textContent = '';
  }
  for (const control of form.querySelectorAll('[aria-invalid]')) control.removeAttribute('aria-invalid');

  for (const [nombre, mensaje] of Object.entries(errores)) {
    const p = form.querySelector(`#error-${nombre}`);
    const control = form.elements[nombre];
    if (!p || !control) continue;
    const controles = control instanceof RadioNodeList ? [...control] : [control];
    p.textContent = mensaje;
    p.classList.remove('hidden');
    for (const c of controles) {
      c.setAttribute('aria-invalid', 'true');
      c.setAttribute('aria-describedby', [`error-${nombre}`, form.querySelector(`#ayuda-${nombre}`) ? `ayuda-${nombre}` : ''].join(' ').trim());
    }
    abrirPlegable(controles[0]);
  }
  const primero = Object.keys(errores).map((n) => form.elements[n]).find(Boolean);
  (primero instanceof RadioNodeList ? primero[0] : primero)?.focus();
}

/** Si el campo con error está dentro de un <details> cerrado, lo abre para que se vea. */
function abrirPlegable(control) {
  const plegable = control?.closest('details');
  if (plegable) plegable.open = true;
}
