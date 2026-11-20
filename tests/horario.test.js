import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarHorario, textoDia, hora } from '../js/utils/horario.js';

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
