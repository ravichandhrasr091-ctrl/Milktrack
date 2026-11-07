import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bindLocalReceiptsToUser,
  database,
  getReceiptImageForUser,
  getReceiptsForUser,
  saveVerifiedReceipt,
} from './database';
import type { VerifiedReceipt } from '../types/receipt';

const now = '2026-11-05T00:00:00.000Z';

function receipt(id: string): VerifiedReceipt {
  return {
    id,
    formatId: 'dodla-cow-provisional-slip-v1',
    milkType: 'Cow',
    receiptDate: '2026-11-04',
    receiptTime: '19:28',
    shift: 'Night',
    quantityLitres: '2.25',
    fat: '8.3',
    snf: '9.1',
    clr: '26.7',
    ratePerLitre: '58.47',
    totalAmount: '131.56',
    mccCode: 'MCC_0001',
    vlccCode: '83500062',
    originalImageRef: id,
    originalFilename: 'receipt.jpg',
    originalMimeType: 'image/jpeg',
    ocrRawText: 'test only',
    verificationStatus: 'verified',
    verificationTimestamp: now,
    createdAt: now,
    updatedAt: now,
    entryMethod: 'upload',
  };
}

describe('verified receipt storage', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  it('saves the verified record and untouched image together', async () => {
    const original = new Blob(['original-bytes'], { type: 'image/jpeg' });
    await saveVerifiedReceipt(receipt('receipt-1'), original, 'user-1');

    expect(await database.receipts.get('receipt-1')).toMatchObject({
      quantityLitres: '2.25',
      totalAmount: '131.56',
      verificationStatus: 'verified',
      ownerId: 'user-1',
      cloudSyncStatus: 'local-only',
    });
    const savedImage = await database.receiptImages.get('receipt-1');
    expect(savedImage?.blob.size).toBe(original.size);
    expect(savedImage?.blob.type).toBe(original.type);
    expect(await savedImage?.blob.text()).toBe('original-bytes');
  });

  it('binds legacy local records to the first account without sharing them', async () => {
    const original = new Blob(['legacy-photo'], { type: 'image/jpeg' });
    await database.receipts.add(receipt('legacy-1'));
    await database.receiptImages.add({
      receiptId: 'legacy-1',
      blob: original,
      filename: 'receipt.jpg',
      mimeType: 'image/jpeg',
      createdAt: now,
    });

    await bindLocalReceiptsToUser('first-user');
    await bindLocalReceiptsToUser('second-user');

    expect(await getReceiptsForUser('first-user')).toMatchObject([
      { id: 'legacy-1', ownerId: 'first-user', cloudSyncStatus: 'local-only' },
    ]);
    expect(await getReceiptsForUser('second-user')).toEqual([]);
    expect(await getReceiptImageForUser('first-user', 'legacy-1')).toBeDefined();
    expect(await getReceiptImageForUser('second-user', 'legacy-1')).toBeUndefined();
  });

  it('rolls back the photo if the receipt row cannot be added', async () => {
    await database.receipts.add(receipt('duplicate'));
    const original = new Blob(['original-bytes'], { type: 'image/jpeg' });

    await expect(
      saveVerifiedReceipt(receipt('duplicate'), original, 'user-1'),
    ).rejects.toThrow(/Could not save receipt/);
    expect(await database.receiptImages.get('duplicate')).toBeUndefined();
    expect(await database.receipts.count()).toBe(1);
  });

  it('refuses to store a photo whose MIME type does not match the record', async () => {
    const original = new Blob(['bytes'], { type: 'image/jpeg' });
    await expect(
      saveVerifiedReceipt(
        { ...receipt('mismatch'), originalMimeType: 'image/png' },
        original,
        'user-1',
      ),
    ).rejects.toThrow(/MIME type does not match/);
    expect(await database.receipts.count()).toBe(0);
    expect(await database.receiptImages.count()).toBe(0);
  });
});
