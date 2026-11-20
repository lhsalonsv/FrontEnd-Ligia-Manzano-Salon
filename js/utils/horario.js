/**
 * horario.js — Ligia Manzano Salón
 * Horario semanal de una empleada (tb_horarios_empleado) dentro del horario del salón (tb_horarios).
 * Horas en texto 'HH:MM' (24 h), que se comparan bien como texto. Prueba: npm test
 */

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']; // 1 = lunes

/** '08:00' → '8:00', '13:30:00' → '13:30' (24 h, como en la agenda). */
export const hora = (hhmm) => String(hhmm ?? '').slice(0, 5).replace(/^0/, '');

/** '13:15' → '1:15 p. m.', '12:00' → '12:00 m.', '08:00' → '8:00 a. m.' (para que se note si algo quedó de madrugada). */
export function hora12(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  if (h === 12 && m === 0) return '12:00 m.';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** '01:15' → '13:15' (la misma hora, de tarde). */
const masDoce = (hhmm) => `${String(Number(hhmm.slice(0, 2)) + 12).padStart(2, '0')}${hhmm.slice(2, 5)}`;

/**
 * Al agregar la tarde, parte la jornada en mañana y tarde con una hora de almuerzo (12:00 a 13:00).
 * 8:00–16:00 → 8:00–12:00 y 13:00–16:00. Si solo trabaja la mañana, la tarde va hasta que cierra el salón.
 * @returns {[[string, string], [string, string]] | null} null si entra después de las 12 (se escribe a mano)
 */
export function partirJornada(inicio, fin, cierra) {
  if (!inicio || inicio >= '12:00') return null;
  if (fin > '13:00') return [[inicio, '12:00'], ['13:00', fin]];
  return [[inicio, fin], ['13:00', cierra.slice(0, 5)]];
}

/**
 * Revisa los bloques de cada día.
 * @param {{diaSemana: number, horaInicio: string, horaFin: string}[]} bloques
 * @param {{diaSemana: number, abierto: boolean, horaAbre: string|null, horaCierra: string|null}[]} salon
 * @returns {Record<number, string>} mensaje por día con problema (vacío si todo está bien)
 */
export function validarHorario(bloques, salon) {
  const errores = {};
  for (let dia = 1; dia <= 7; dia++) {
    const delDia = bloques.filter((b) => b.diaSemana === dia).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
    if (!delDia.length) continue;
    const s = salon.find((x) => x.diaSemana === dia);
    if (delDia.some((b) => !b.horaInicio || !b.horaFin)) errores[dia] = 'Escriba la hora de entrada y la de salida.';
    else if (delDia.some((b) => b.horaFin <= b.horaInicio)) {
      // Formato 24 h: quien piensa "1:15 de la tarde" escribe 01:15. Si de tarde sí cabe, se sugiere.
      const b = delDia.find((x) => x.horaFin <= x.horaInicio);
      const tarde = masDoce(b.horaFin);
      const cabe = b.horaFin < '12:00' && tarde > b.horaInicio && (!s?.abierto || tarde <= s.horaCierra.slice(0, 5));
      errores[dia] = cabe
        ? `La salida (${hora12(b.horaFin)}) es antes de la entrada (${hora12(b.horaInicio)}). ¿Quiso decir ${hora(tarde)}?`
        : 'La salida tiene que ser después de la entrada.';
    }
    else if (!s?.abierto) errores[dia] = 'El salón está cerrado ese día.';
    else if (delDia.some((b) => b.horaInicio < s.horaAbre.slice(0, 5) || b.horaFin > s.horaCierra.slice(0, 5))) {
      errores[dia] = `El salón abre de ${hora(s.horaAbre)} a ${hora(s.horaCierra)}.`;
    } else if (delDia.some((b, i) => i > 0 && b.horaInicio < delDia[i - 1].horaFin)) {
      errores[dia] = 'Los dos bloques se cruzan: el segundo empieza antes de que termine el primero.';
    }
  }
  return errores;
}

/** Resumen debajo del día en el formulario: '8:00 a. m.–12:00 m. y 1:00 p. m.–4:00 p. m.'. */
export const textoDia12 = (bloques) =>
  [...bloques].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)).map((b) => `${hora12(b.horaInicio)}–${hora12(b.horaFin)}`).join(' y ');

/** Texto corto para la ficha: '8:00–12:00 y 13:00–17:00'. */
export const textoDia = (bloques) =>
  bloques.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)).map((b) => `${hora(b.horaInicio)}–${hora(b.horaFin)}`).join(' y ');
