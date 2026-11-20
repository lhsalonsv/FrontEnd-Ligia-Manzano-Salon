/**
 * horario.js — Ligia Manzano Salón
 * Horario semanal de una empleada (tb_horarios_empleado) dentro del horario del salón (tb_horarios).
 * Horas en texto 'HH:MM' (24 h), que se comparan bien como texto. Prueba: npm test
 */

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']; // 1 = lunes

/** '08:00' → '8:00', '13:30:00' → '13:30' (24 h, como en la agenda). */
export const hora = (hhmm) => String(hhmm ?? '').slice(0, 5).replace(/^0/, '');

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
    else if (delDia.some((b) => b.horaFin <= b.horaInicio)) errores[dia] = 'La salida tiene que ser después de la entrada.';
    else if (!s?.abierto) errores[dia] = 'El salón está cerrado ese día.';
    else if (delDia.some((b) => b.horaInicio < s.horaAbre.slice(0, 5) || b.horaFin > s.horaCierra.slice(0, 5))) {
      errores[dia] = `El salón abre de ${hora(s.horaAbre)} a ${hora(s.horaCierra)}.`;
    } else if (delDia.some((b, i) => i > 0 && b.horaInicio < delDia[i - 1].horaFin)) {
      errores[dia] = 'Los dos bloques se cruzan: el segundo empieza antes de que termine el primero.';
    }
  }
  return errores;
}

/** Texto corto para la ficha: '8:00–12:00 y 13:00–17:00'. */
export const textoDia = (bloques) =>
  bloques.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)).map((b) => `${hora(b.horaInicio)}–${hora(b.horaFin)}`).join(' y ');
