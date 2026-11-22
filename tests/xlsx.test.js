import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as crcNode } from 'node:zlib';
import { crearXlsx, crc32, letraColumna } from '../js/utils/xlsx.js';

/** Lee un .zip "stored" con el directorio central: { ruta: texto }, y revisa el CRC de cada archivo. */
function leerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fin = bytes.length - 22;
  assert.equal(v.getUint32(fin, true), 0x06054b50, 'fin del directorio central');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos = {};
  for (let n = 0; n < total; n++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const tam = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    assert.equal(v.getUint32(local, true), 0x04034b50, `encabezado local de ${nombre}`);
    const inicio = local + 30 + v.getUint16(local + 26, true);
    const datos = bytes.subarray(inicio, inicio + tam);
    assert.equal(crc32(datos), crc, `CRC de ${nombre}`);
    archivos[nombre] = new TextDecoder().decode(datos);
    p += 46 + largoNombre;
  }
  return archivos;
}

test('crc32 igual al de zlib', () => {
  const datos = new TextEncoder().encode('Bitácora · Ligia Manzano Salón');
  assert.equal(crc32(datos), crcNode(datos));
});

test('letras de columna', () => {
  assert.deepEqual([0, 5, 25, 26, 27, 51, 52].map(letraColumna), ['A', 'F', 'Z', 'AA', 'AB', 'AZ', 'BA']);
});

test('el .xlsx trae las partes que Excel exige y el texto escapado', () => {
  const archivos = leerZip(crearXlsx([
    ['Fecha y hora', 'Quién', 'Qué pasó'],
    ['2026-11-21 1:15 p. m.', 'Ligia Manzano', 'Anuló la factura <0406> de "Lucía" & cía.'],
  ], { hoja: 'Bitácora 2026-11-21', anchos: [20, 18, 60] }));
  assert.deepEqual(Object.keys(archivos).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  const hoja = archivos['xl/worksheets/sheet1.xml'];
  assert.match(hoja, /<c r="A1" t="inlineStr" s="1">/); // cabecera en negrita
  assert.match(hoja, /<c r="C2" t="inlineStr"><is><t xml:space="preserve">Anuló la factura &lt;0406&gt; de &quot;Lucía&quot; &amp; cía\.<\/t>/);
  assert.match(hoja, /<autoFilter ref="A1:C2"\/>/);
  assert.match(hoja, /state="frozen"/);
  assert.match(archivos['xl/workbook.xml'], /<sheet name="Bitácora 2026-11-21"/);
});
