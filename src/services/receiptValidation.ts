import type { ReceiptShift } from '../types/receipt';
import { getShiftFromReceiptTime } from './receiptParser';

export interface ReceiptReviewValues {
  receiptDate: string;
  receiptTime: string;
  shift: ReceiptShift | '';
  milkType: string;
  quantityLitres: string;
  fat: string;
  snf: string;
  clr: string;
  ratePerLitre: string;
  totalAmount: string;
}

export interface ReceiptValidationResult {
  errors: Partial<Record<keyof ReceiptReviewValues, string>>;
  amountMismatch: boolean;
  valid: boolean;
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validDecimal(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value);
}

function multiplyRounded(
  left: string,
  right: string,
  scale: number,
): bigint | null {
  if (!validDecimal(left) || !validDecimal(right)) return null;
  const [leftWhole, leftFraction = ''] = left.split('.');
  const [rightWhole, rightFraction = ''] = right.split('.');
  const leftScale = leftFraction.length;
  const rightScale = rightFraction.length;
  const leftInteger = BigInt(leftWhole + leftFraction);
  const rightInteger = BigInt(rightWhole + rightFraction);
  let product = leftInteger * rightInteger;
  const productScale = leftScale + rightScale;

  if (productScale > scale) {
    const divisor = 10n ** BigInt(productScale - scale);
    product = (product + divisor / 2n) / divisor;
  } else if (productScale < scale) {
    product *= 10n ** BigInt(scale - productScale);
  }
  return product;
}

function decimalToScaled(value: string, scale: number): bigint | null {
  if (!validDecimal(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) return null;
  return BigInt(whole + fraction.padEnd(scale, '0'));
}

export function validateReceiptReview(
  values: ReceiptReviewValues,
): ReceiptValidationResult {
  const errors: ReceiptValidationResult['errors'] = {};

  if (!isValidISODate(values.receiptDate)) {
    errors.receiptDate = 'Choose the receipt date after checking the printed date.';
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.receiptTime)) {
    errors.receiptTime = 'Enter a valid receipt time.';
  }
  const expectedShift = getShiftFromReceiptTime(values.receiptTime);
  if (!expectedShift || values.shift !== expectedShift) {
    errors.shift = 'Shift must match the receipt time.';
  }
  if (values.milkType !== 'Cow') {
    errors.milkType = 'This app currently accepts Cow milk receipts only.';
  }

  const numericFields = [
    ['quantityLitres', 'Enter quantity exactly as printed.'],
    ['fat', 'Enter FAT exactly as printed.'],
    ['snf', 'Enter SNF exactly as printed.'],
    ['clr', 'Enter CLR exactly as printed.'],
    ['ratePerLitre', 'Enter rate exactly as printed.'],
    ['totalAmount', 'Enter amount exactly as printed.'],
  ] as const;

  for (const [key, message] of numericFields) {
    const value = values[key];
    if (!validDecimal(value) || Number(value) <= 0) errors[key] = message;
  }

  const expectedAmount = multiplyRounded(
    values.quantityLitres,
    values.ratePerLitre,
    2,
  );
  const printedAmount = decimalToScaled(values.totalAmount, 2);
  const amountMismatch =
    expectedAmount !== null &&
    printedAmount !== null &&
    expectedAmount !== printedAmount;

  return {
    errors,
    amountMismatch,
    valid: Object.keys(errors).length === 0,
  };
}
