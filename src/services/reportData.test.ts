import { describe, expect, it } from 'vitest';
import { buildReportData } from './reportData';
import type { VerifiedReceipt } from '../types/receipt';

function receipt(
  id: string,
  receiptDate: string,
  overrides: Partial<VerifiedReceipt> = {},
): VerifiedReceipt {
  return {
    id,
    formatId: 'dodla-cow-provisional-slip-v1',
    milkType: 'Cow',
    receiptDate,
    receiptTime: '07:42',
    shift: 'Morning/Day',
    quantityLitres: '2.25',
    fat: '6.6',
    snf: '8.5',
    clr: '26.0',
    ratePerLitre: '51.03',
    totalAmount: '114.82',
    originalImageRef: id,
    originalFilename: 'receipt.jpg',
    originalMimeType: 'image/jpeg',
    ocrRawText: 'test',
    verificationStatus: 'verified',
    verificationTimestamp: '2026-11-05T00:00:00.000Z',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    entryMethod: 'upload',
    ...overrides,
  };
}

describe('buildReportData', () => {
  it('builds a live rolling window with zero-filled days and verified totals', () => {
    const report = buildReportData(
      [
        receipt('yesterday', '2026-11-04'),
        receipt('today', '2026-11-05', {
          quantityLitres: '1.5',
          totalAmount: '76.55',
        }),
        receipt('outside', '2026-10-28'),
      ],
      7,
      new Date(2026, 10, 5, 12),
    );

    expect(report.from).toBe('2026-10-30');
    expect(report.to).toBe('2026-11-05');
    expect(report.days).toHaveLength(7);
    expect(report.days[0]).toMatchObject({
      date: '2026-10-30',
      litres: '0.000',
      receipts: 0,
    });
    expect(report.totals).toEqual({
      litres: '3.750',
      earningsInr: '191.37',
      receipts: 2,
    });
  });

  it('excludes records outside the selected rolling window', () => {
    const report = buildReportData(
      [receipt('old', '2025-11-05')],
      365,
      new Date(2026, 10, 5, 12),
    );

    expect(report.totals.receipts).toBe(0);
    expect(report.days).toHaveLength(365);
  });
});
