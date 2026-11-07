import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createXlsxBytes } from './xlsxWorkbook';

describe('xlsx workbook generation', () => {
  it('creates a valid workbook with escaped inline text values', () => {
    const bytes = createXlsxBytes(
      [
        {
          name: 'All Records',
          headers: ['Receipt ID', 'Amount'],
          rows: [['receipt-1', 'A & B < ₹130']],
        },
        {
          name: 'Night Shift',
          headers: ['Receipt ID'],
          rows: [['receipt-1']],
        },
      ],
    );
    const files = unzipSync(bytes);
    const worksheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    const workbook = strFromU8(files['xl/workbook.xml']);

    expect(Object.keys(files)).toContain('[Content_Types].xml');
    expect(worksheet).toContain('Receipt ID');
    expect(worksheet).toContain('receipt-1');
    expect(worksheet).toContain('A &amp; B &lt; ₹130');
    expect(worksheet).toContain('t="inlineStr"');
    expect(workbook).toContain('name="All Records"');
    expect(workbook).toContain('name="Night Shift"');
    expect(files['xl/worksheets/sheet2.xml']).toBeDefined();
  });

  it('rejects rows with inconsistent column counts', () => {
    expect(() =>
      createXlsxBytes([
        {
          name: 'All Records',
          headers: ['Date', 'Amount'],
          rows: [['2026-11-05']],
        },
      ]),
    ).toThrow(/same number of columns/);
  });
});
