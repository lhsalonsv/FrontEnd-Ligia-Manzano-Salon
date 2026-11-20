import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarHorario, textoDia, textoDia12, hora, hora12, partirJornada } from '../js/utils/horario.js';

const salon = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({
  diaSemana, abierto: diaSemana !== 7, horaAbre: diaSemana === 7 ? null : '08:00:00', horaCierra: diaSemana === 7 ? null : '18:00:00',
}));
const b = (diaSemana, horaInicio, horaFin) => ({ diaSemana, horaInicio, horaFin });

test('horario correcto con dos bloques', () => {
  assert.deepEqual(validarHorario([b(1, '08:00', '12:00'), b(1, '13:00', '18:00'), b(2, '09:00', '17:00')], salon), {});
});

test('errores por día', () => {
  const e = validarHorario([
    b(1, '12:00', '10:00'),                         // salida antes de entrada
    b(2, '07:00', '12:00'),                         // antes de que abra
    b(3, '08:00', '13:00'), b(3, '12:00', '17:00'), // se cruzan
    b(4, '', '12:00'),                              // falta hora
    b(7, '09:00', '12:00'),                         // domingo cerrado
  ], salon);
  assert.match(e[1], /después de la entrada/);
  assert.match(e[2], /abre de 8:00 a 18:00/);
  assert.match(e[3], /se cruzan/);
  assert.match(e[4], /entrada y la de salida/);
  assert.match(e[7], /cerrado/);
  assert.equal(Object.keys(e).length, 5);
});

test('bloques pegados no se cruzan', () => {
  assert.deepEqual(validarHorario([b(5, '08:00', '12:00'), b(5, '12:00', '16:00')], salon), {});
});

test('texto del día', () => {
  assert.equal(textoDia([b(1, '13:00', '17:00'), b(1, '08:00', '12:00')]), '8:00–12:00 y 13:00–17:00');
  assert.equal(hora('09:30:00'), '9:30');
});

test('hora de 12 horas para el resumen', () => {
  assert.equal(hora12('08:00'), '8:00 a. m.');
  assert.equal(hora12('12:00'), '12:00 m.');
  assert.equal(hora12('12:30'), '12:30 p. m.');
  assert.equal(hora12('13:15:00'), '1:15 p. m.');
  assert.equal(hora12('01:15'), '1:15 a. m.');
  assert.equal(textoDia12([b(1, '13:00', '16:00'), b(1, '08:00', '12:00')]), '8:00 a. m.–12:00 m. y 1:00 p. m.–4:00 p. m.');
});

test('salida de madrugada: sugiere la misma hora de tarde si cabe en el horario del salón', () => {
  // La captura: 09:00 a 01:15 → quiso decir 13:15
  assert.match(validarHorario([b(1, '09:00', '01:15')], salon)[1], /\(1:15 a\. m\.\) es antes de la entrada \(9:00 a\. m\.\)\. ¿Quiso decir 13:15\?/);
  // 10:00 de tarde ya no cabe (el salón cierra a las 18:00): mensaje normal
  assert.equal(validarHorario([b(1, '12:00', '10:00')], salon)[1], 'La salida tiene que ser después de la entrada.');
});

test('+ tarde parte la jornada con una hora de almuerzo', () => {
  assert.deepEqual(partirJornada('08:00', '16:00', '18:00:00'), [['08:00', '12:00'], ['13:00', '16:00']]);
  assert.deepEqual(partirJornada('08:00', '12:00', '18:00:00'), [['08:00', '12:00'], ['13:00', '18:00']]); // solo mañana
  assert.equal(partirJornada('13:00', '18:00', '18:00:00'), null); // entra de tarde: a mano
  // Lo partido siempre pasa la validación
  for (const [ini, fin] of [['08:00', '16:00'], ['09:00', '18:00'], ['08:00', '12:30']]) {
    const [m, t] = partirJornada(ini, fin, '18:00:00');
    assert.deepEqual(validarHorario([b(2, ...m), b(2, ...t)], salon), {});
  }
});
