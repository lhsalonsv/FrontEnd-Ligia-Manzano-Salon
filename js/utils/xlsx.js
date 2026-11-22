/**
 * xlsx.js — Ligia Manzano Salón
 * Arma un archivo de Excel (.xlsx) con una hoja de texto, sin librerías: un .xlsx es un ZIP con unos XML.
 * Se usa en vez de CSV porque Excel separa un CSV según la configuración regional de Windows
 * (coma o punto y coma) y, si no coincide, pone todo en una columna. Prueba: npm test
 *
 * Alcance a propósito: una hoja, solo texto, cabecera en negrita, fija y con filtro. El ZIP va sin comprimir
 * ("stored"); para unos cientos de filas pesa poco.
 */

const codificar = (texto) => new TextEncoder().encode(texto);

/** Texto seguro dentro de XML (sin caracteres de control, que Excel rechaza). */
const xml = (t) => String(t ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 0 → 'A', 25 → 'Z', 26 → 'AA' */
export function letraColumna(i) {
  let letras = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
  return letras;
}

function hojaXml(filas, anchos) {
  const ultima = `${letraColumna(Math.max(0, filas[0].length - 1))}${filas.length}`;
  const celdas = filas.map((fila, f) => `<row r="${f + 1}">${fila.map((valor, c) =>
    `<c r="${letraColumna(c)}${f + 1}" t="inlineStr"${f === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(valor)}</t></is></c>`).join('')}</row>`).join('');
  const columnas = anchos.length ? `<cols>${anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:${ultima}"/>`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `${columnas}<sheetData>${celdas}</sheetData><autoFilter ref="A1:${ultima}"/></worksheet>`;
}

function archivos(filas, hoja, anchos) {
  const tipo = 'application/vnd.openxmlformats-';
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + `<Override PartName="/xl/workbook.xml" ContentType="${tipo}officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${tipo}officedocument.spreadsheetml.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="${tipo}officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${xml(hoja.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>`
      + `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(hoja.slice(0, 31)).replace(/'/g, "''")}'!$A$1:$${letraColumna(filas[0].length - 1)}$${filas.length}</definedName></definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '</styleSheet>',
    'xl/worksheets/sheet1.xml': hojaXml(filas, anchos),
  };
}

// --- ZIP sin compresión -------------------------------------------------------

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** { 'ruta': 'texto' } → bytes de un .zip ("stored"). */
export function zip(entradas) {
  const partes = [];
  const central = [];
  let desplazamiento = 0;
  const encabezado = (tam) => { const b = new Uint8Array(tam); return [b, new DataView(b.buffer)]; };

  for (const [ruta, texto] of Object.entries(entradas)) {
    const nombre = codificar(ruta);
    const datos = codificar(texto);
    const crc = crc32(datos);
    const [local, l] = encabezado(30);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); // 0x0800: nombres en UTF-8
    l.setUint32(14, crc, true); l.setUint32(18, datos.length, true); l.setUint32(22, datos.length, true);
    l.setUint16(26, nombre.length, true);
    partes.push(local, nombre, datos);

    const [cen, c] = encabezado(46);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true);
    c.setUint16(28, nombre.length, true); c.setUint32(42, desplazamiento, true);
    central.push(cen, nombre);
    desplazamiento += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const [fin, f] = encabezado(22);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, central.length / 2, true); f.setUint16(10, central.length / 2, true);
  f.setUint32(12, tamCentral, true); f.setUint32(16, desplazamiento, true);

  const todo = [...partes, ...central, fin];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) { salida.set(p, i); i += p.length; }
  return salida;
}

/**
 * @param {string[][]} filas  la primera es la cabecera
 * @param {{hoja?: string, anchos?: number[]}} [opciones]  anchos en caracteres, uno por columna
 * @returns {Uint8Array} bytes del .xlsx
 */
export function crearXlsx(filas, { hoja = 'Hoja1', anchos = [] } = {}) {
  return zip(archivos(filas, hoja, anchos));
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
