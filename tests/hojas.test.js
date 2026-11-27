import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlHoja, AVISO_SIN_EMISOR } from '../js/utils/hojas.js';

const hoja = (emisor) => htmlHoja({ emisor, titulo: 'Libro', derecha: 'Mes', grilla: '1fr', columnas: [{ h: 'A', c: (r) => r }], filas: ['x'] });

test('la hoja avisa si faltan los datos del negocio en vez de caerse', () => {
  assert.match(hoja(null), new RegExp(AVISO_SIN_EMISOR));
  const conEmisor = hoja({ nombre: 'Salón', nit: '06140000000000', nrc: '1234567' });
  assert.match(conEmisor, /Salón/);
  assert.doesNotMatch(conEmisor, new RegExp(AVISO_SIN_EMISOR));
});
