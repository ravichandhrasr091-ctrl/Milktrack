import { describe, expect, it } from 'vitest';
import { parseDodlaReceipt } from './receiptParser';

const suppliedReceiptOCR = `Provisional Acknowledgement STip
DODLA DAIRY LTD
SANENARHALLI 1062

HCC Code : NCC_0001

ULCC Code: 83500062

Date: 04/11/26 Ting: 19:28
Code: 0036 0000000036

Name: No Name

Milk Type: Cow Quantity: 2.25
FAT: 8.3%. SKE: 9.1%
Rate (Rs.): 58.47

Amount: 131.56 ;

CLR: 26.7

shift: £ SSCounter: 27`;

const suppliedReceiptWords = [
  ['04/11/26', 96],
  ['19:28', 96],
  ['NCC_0001', 71],
  ['83500062', 96],
  ['0036', 86],
  ['0000000036', 86],
  ['Cow', 69],
  ['2.25', 48],
  ['8.3%.', 53],
  ['9.1%', 95],
  ['58.47', 94],
  ['131.56', 47],
  ['26.7', 96],
  ['£', 59],
].map(([text, confidence]) => ({
  text: String(text),
  confidence: Number(confidence),
}));

describe('Dodla receipt parser', () => {
  it('normalizes the printed day-first date and derives night shift from time', () => {
    const parsed = parseDodlaReceipt(suppliedReceiptOCR, suppliedReceiptWords);

    expect(parsed.recognized).toBe(true);
    expect(parsed.receiptDateText).toBe('04/11/26');
    expect(parsed.receiptDate.value).toBe('2026-11-04');
    expect(parsed.receiptDate.needsReview).toBe(false);
    expect(parsed.receiptTime.value).toBe('19:28');
    expect(parsed.shift.value).toBe('Night');
    expect(parsed.milkType.value).toBe('Cow');
    expect(parsed.quantityLitres.value).toBe('2.25');
    expect(parsed.fat.value).toBe('8.3');
    expect(parsed.snf.value).toBe('9.1');
    expect(parsed.clr.value).toBe('26.7');
    expect(parsed.ratePerLitre.value).toBe('58.47');
    expect(parsed.totalAmount.value).toBe('131.56');
    expect(parsed.supplierCode.value).toBe('0036 0000000036');
    expect(parsed.mccCode.value).toBe('NCC_0001');
    expect(parsed.mccCode.needsReview).toBe(true);
    expect(parsed.vlccCode.value).toBe('83500062');
    expect(parsed.shiftText).toBe('£');
  });

  it('derives morning shift from 7:42 even if OCR reads a conflicting shift code', () => {
    const parsed = parseDodlaReceipt(
      suppliedReceiptOCR.replace('04/11/26 Ting: 19:28', '04/11/26 Ting: 7:42')
        .replace('shift: £', 'shift: E'),
      suppliedReceiptWords,
    );

    expect(parsed.receiptTime.value).toBe('07:42');
    expect(parsed.shiftText).toBe('E');
    expect(parsed.shift.value).toBe('Morning/Day');
  });

  it('leaves invalid printed dates and times for review', () => {
    const parsed = parseDodlaReceipt(
      suppliedReceiptOCR.replace('04/11/26', '31/02/26').replace('19:28', '25:70'),
    );

    expect(parsed.receiptDate.value).toBe('');
    expect(parsed.receiptDate.needsReview).toBe(true);
    expect(parsed.receiptTime.value).toBe('');
    expect(parsed.shift.value).toBe('');
  });

  it('rejects a receipt that does not match the supported Dodla Cow layout', () => {
    const parsed = parseDodlaReceipt('Generic Dairy. Milk Type: Cow Quantity: 2');
    expect(parsed.recognized).toBe(false);
    expect(parsed.rejectionReason).toMatch(/supported Dodla Cow/i);
  });

  it('flags values below the actual OCR confidence threshold', () => {
    const parsed = parseDodlaReceipt(suppliedReceiptOCR, suppliedReceiptWords);
    expect(parsed.quantityLitres.confidence).toBe(48);
    expect(parsed.quantityLitres.needsReview).toBe(true);
    expect(parsed.totalAmount.confidence).toBe(47);
    expect(parsed.totalAmount.needsReview).toBe(true);
  });
});
