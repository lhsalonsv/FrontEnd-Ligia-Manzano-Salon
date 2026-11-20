/**
 * formato.js — Ligia Manzano Salón
 * Cómo se muestran dinero, fechas y nombres en todas las pantallas.
 */

/** Escapa texto que viene de la API antes de meterlo en innerHTML. */
export const escapar = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 'Carmen Aguilar' → 'CA' */
export const iniciales = (nombre) =>
  String(nombre ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

const DINERO = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
/** 684 → '$684.00' (El Salvador usa dólares con punto decimal) */
export const dinero = (monto) => DINERO.format(Number(monto ?? 0));

/** Número con separador de miles: 1248 → '1,248' */
export const numero = (n) => new Intl.NumberFormat('en-US').format(n ?? 0);

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-12-15' o un Date → Date en hora local (sin el desfase de UTC que da new Date('2026-12-15')). */
function aFecha(valor) {
  if (valor instanceof Date) return valor;
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00`) : new Date(valor);
}

const mismoDia = (a, b) => a.toDateString() === b.toDateString();

/** Fecha local 'AAAA-MM-DD' (hoy si no se pasa nada), más `dias` días. toISOString daría la de UTC. */
export function fechaIso(valor = new Date(), dias = 0) {
  const f = new Date(aFecha(valor));
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** 'Hoy', '12 dic' o '12 dic 2025' si es de otro año. */
export function fechaCorta(valor) {
  if (!valor) return '—';
  const f = aFecha(valor);
  const hoy = new Date();
  if (mismoDia(f, hoy)) return 'Hoy';
  const texto = `${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)}`;
  return f.getFullYear() === hoy.getFullYear() ? texto : `${texto} ${f.getFullYear()}`;
}

/** '18 de septiembre' (con el año si no es este). */
export function fechaLarga(valor) {
  const f = aFecha(valor);
  const texto = `${f.getDate()} de ${MESES[f.getMonth()]}`;
  return f.getFullYear() === new Date().getFullYear() ? texto : `${texto} de ${f.getFullYear()}`;
}

/** 'Hoy, 7:43 a. m.' o '2 dic, 9:15 a. m.' (último acceso, último cambio). */
export function fechaHora(valor) {
  const f = aFecha(valor);
  return `${fechaCorta(f)}, ${f.toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit' })}`;
}

/** 'Hoy 2:00' o '19 dic' (para citas: la hora solo importa si es hoy). */
export function fechaCita(valor) {
  const f = aFecha(valor);
  if (!mismoDia(f, new Date())) return fechaCorta(f);
  const hora = f.toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]\.?\s?m\.?/i, '');
  return `Hoy ${hora}`;
}

/** 90 → '1 h 30', 60 → '1 h', 45 → '45 min', null → '—' */
export function duracion(minutos) {
  if (!minutos) return '—';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** 'marzo de 2025' */
export const mesAnio = (valor) => {
  const f = aFecha(valor);
  return `${MESES[f.getMonth()]} de ${f.getFullYear()}`;
};
