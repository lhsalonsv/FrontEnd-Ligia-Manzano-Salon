/**
 * inicioController.js — Ligia Manzano Salón
 * Página de inicio. Por ahora solo saluda; el resumen del día llega después de aprobar el diseño.
 */
import { montarLayout } from '../utils/layout.js';

const sesion = montarLayout();

if (sesion) {
  const primerNombre = sesion.usuario.nombreCompleto.split(' ')[0];
  document.getElementById('saludo-nombre').textContent = primerNombre;
  document.getElementById('saludo-fecha').textContent = new Intl.DateTimeFormat('es-SV', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
}
