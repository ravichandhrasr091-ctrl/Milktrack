import { describe, expect, it } from 'vitest';
import { validateReceiptReview } from './receiptValidation';

const completeReview = {
  receiptDate: '2026-11-04',
  receiptTime: '19:28',
  shift: 'Night' as const,
  milkType: 'Cow',
  quantityLitres: '2.25',
  fat: '8.3',
  snf: '9.1',
  clr: '26.7',
  ratePerLitre: '58.47',
  totalAmount: '131.56',
};

describe('verified receipt validation', () => {
  it('accepts explicitly reviewed values without altering decimal strings', () => {
    const result = validateReceiptReview(completeReview);
    expect(result.valid).toBe(true);
    expect(result.amountMismatch).toBe(false);
    expect(completeReview.quantityLitres).toBe('2.25');
  });

  it('requires a valid date and a shift derived from the receipt time', () => {
    const result = validateReceiptReview({
      ...completeReview,
      receiptDate: '',
      shift: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.receiptDate).toBeDefined();
    expect(result.errors.shift).toBeDefined();
  });

  it('rejects a shift that conflicts with the printed receipt time', () => {
    const result = validateReceiptReview({
      ...completeReview,
      receiptTime: '07:42',
      shift: 'Night',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.shift).toBe('Shift must match the receipt time.');
  });

  it('flags a calculated amount discrepancy without rewriting the printed amount', () => {
    const result = validateReceiptReview({
      ...completeReview,
      totalAmount: '131.55',
    });
    expect(result.valid).toBe(true);
    expect(result.amountMismatch).toBe(true);
    expect(completeReview.totalAmount).toBe('131.56');
  });

  it('rejects invalid numbers without guessing missing decimal points', () => {
    const result = validateReceiptReview({
      ...completeReview,
      quantityLitres: '2,25',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.quantityLitres).toBeDefined();
  });
});
