import { describe, expect, it } from 'vitest';
import {
  buildFinanceContext,
  questionNeedsFinancialData,
} from './financeContext';
import type { VerifiedReceipt } from '../types/receipt';

function receipt(
  id: string,
  overrides: Partial<VerifiedReceipt> = {},
): VerifiedReceipt {
  return {
    id,
    formatId: 'dodla-cow-provisional-slip-v1',
    milkType: 'Cow',
    receiptDate: '2026-11-05',
    receiptTime: '08:30',
    shift: 'Morning/Day',
    quantityLitres: '2.25',
    fat: '8.3',
    snf: '9.1',
    clr: '26.7',
    ratePerLitre: '58.47',
    totalAmount: '131.56',
    supplierCode: 'not-for-ai',
    mccCode: 'private-mcc',
    vlccCode: 'private-vlcc',
    originalImageRef: id,
    originalFilename: 'receipt.jpg',
    originalMimeType: 'image/jpeg',
    ocrRawText: 'private raw OCR',
    verificationStatus: 'verified',
    verificationTimestamp: '2026-11-05T10:00:00.000Z',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
    entryMethod: 'upload',
    ...overrides,
  };
}

describe('buildFinanceContext', () => {
  it('only loads financial context for questions that need financial figures', () => {
    expect(questionNeedsFinancialData('How do I add a receipt?')).toBe(false);
    expect(questionNeedsFinancialData('Where are the app settings?')).toBe(false);
    expect(questionNeedsFinancialData('How much did I earn this month?')).toBe(
      true,
    );
    expect(
      questionNeedsFinancialData('Compare morning and night collections'),
    ).toBe(true);
    expect(questionNeedsFinancialData('How many receipts did I save?')).toBe(
      true,
    );
  });

  it('summarizes verified records without including receipt-level private data', () => {
    const context = buildFinanceContext(
      'Summarize today and compare shifts',
      [
        receipt('1'),
        receipt('2', {
          shift: 'Night',
          quantityLitres: '1.5',
          totalAmount: '87.71',
        }),
        receipt('3', {
          verificationStatus: 'verified',
          receiptDate: '2026-11-04',
        }),
      ],
      new Date(2026, 10, 5, 12),
    );

    expect(context.verifiedReceipts).toBe(2);
    expect(context.period).toEqual({ from: '2026-11-05', to: '2026-11-05' });
    expect(context.totals).toMatchObject({
      receipts: 2,
      litres: '3.750',
      earningsInr: '219.27',
      shifts: {
        morningDay: { receipts: 1, litres: '2.250', earningsInr: '131.56' },
        night: { receipts: 1, litres: '1.500', earningsInr: '87.71' },
      },
    });
    expect(JSON.stringify(context)).not.toMatch(
      /supplierCode|mccCode|vlccCode|ocrRawText|not-for-ai|private-mcc|private-vlcc/,
    );
    expect(context.dailyTotals).toHaveLength(1);
  });

  it('filters a requested period and returns month summaries', () => {
    const context = buildFinanceContext(
      'How much did I earn last month?',
      [
        receipt('november', { receiptDate: '2026-11-05' }),
        receipt('october', { receiptDate: '2026-10-28' }),
      ],
      new Date(2026, 10, 5, 12),
    );

    expect(context.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(context.totals.receipts).toBe(1);
    expect(context.monthlyTotals.map(({ month }) => month)).toEqual([
      '2026-10',
    ]);
  });

  it('includes both months when comparing this month with last month', () => {
    const context = buildFinanceContext(
      'Compare this month with last month',
      [
        receipt('november', { receiptDate: '2026-11-05' }),
        receipt('october', { receiptDate: '2026-10-28' }),
        receipt('september', { receiptDate: '2026-09-28' }),
      ],
      new Date(2026, 10, 5, 12),
    );

    expect(context.totals.receipts).toBe(2);
    expect(context.monthlyTotals.map(({ month }) => month)).toEqual([
      '2026-10',
      '2026-11',
    ]);
  });

  it('limits daily breakdowns while retaining monthly totals', () => {
    const records = Array.from({ length: 100 }, (_, index) => {
      const date = new Date(2026, 0, index + 1, 12);
      return receipt(String(index), {
        receiptDate: date.toISOString().slice(0, 10),
      });
    });
    const context = buildFinanceContext('Show daily collections', records);

    expect(context.dailyTotals).toHaveLength(90);
    expect(context.monthlyTotals.length).toBeGreaterThan(1);
  });
});
