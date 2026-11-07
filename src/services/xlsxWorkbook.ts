import { strToU8, zipSync } from 'fflate';

export interface XlsxWorksheet {
  name: string;
  headers: string[];
  rows: string[][];
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function createWorksheetXml(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const rowXml = allRows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map(
            (value, columnIndex) =>
              `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

export function createXlsxBytes(worksheets: XlsxWorksheet[]): Uint8Array {
  if (worksheets.length === 0) throw new Error('Workbook must include a worksheet.');
  for (const worksheet of worksheets) {
    if (worksheet.headers.length === 0) {
      throw new Error('Workbook sheets must include column headers.');
    }
    if (worksheet.rows.some((row) => row.length !== worksheet.headers.length)) {
      throw new Error('Every workbook row must have the same number of columns.');
    }
  }

  const sheetOverrides = worksheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const sheetLinks = worksheets
    .map(
      (worksheet, index) =>
        `<sheet name="${escapeXml(worksheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const sheetRelationships = worksheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheetOverrides +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${sheetLinks}</sheets>` +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheetRelationships +
        '</Relationships>',
    ),
  };
  worksheets.forEach((worksheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      createWorksheetXml(worksheet.headers, worksheet.rows),
    );
  });

  return zipSync(files);
}
