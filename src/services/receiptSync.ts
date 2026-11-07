import { database } from './database';
import {
  downloadCloudReceiptImage,
  getCloudReceiptPage,
  isReceiptCloudConfigured,
  uploadReceiptToCloud,
} from './receiptCloud';
import type { ReceiptImage, VerifiedReceipt } from '../types/receipt';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function synchronizeAccountReceipts(userId: string): Promise<void> {
  if (!isReceiptCloudConfigured()) return;

  const pending = await database.receipts
    .where('ownerId')
    .equals(userId)
    .filter((receipt) => receipt.cloudSyncStatus === 'pending')
    .toArray();
  let firstUploadError: Error | undefined;

  for (const receipt of pending) {
    try {
      const image = await database.receiptImages
        .where('[ownerId+receiptId]')
        .equals([userId, receipt.id])
        .first();
      if (!image) {
        throw new Error('The original receipt photo is missing from this device.');
      }
      await uploadReceiptToCloud(receipt, image.blob);
      await database.receipts.update(receipt.id, { cloudSyncStatus: 'synced' });
    } catch (error) {
      firstUploadError ??=
        error instanceof Error
          ? error
          : new Error('A saved receipt could not be uploaded.');
    }
  }

  await downloadAccountReceipts(userId);
  if (firstUploadError) {
    throw new Error(`A receipt is still waiting to sync: ${firstUploadError.message}`);
  }
}

export async function getPendingReceiptCount(userId: string): Promise<number> {
  return database.receipts
    .where('ownerId')
    .equals(userId)
    .filter((receipt) => receipt.cloudSyncStatus === 'pending')
    .count();
}

async function downloadAccountReceipts(userId: string): Promise<void> {
  const seenTokens = new Set<string>();
  let nextToken: string | undefined;

  do {
    const page = await getCloudReceiptPage(nextToken);
    for (const cloudReceipt of page.receipts) {
      await storeCloudReceipt(userId, cloudReceipt);
    }

    nextToken = page.nextToken;
    if (nextToken) {
      if (seenTokens.has(nextToken)) {
        throw new Error('The cloud API returned a repeated pagination token.');
      }
      seenTokens.add(nextToken);
    }
  } while (nextToken);
}

async function storeCloudReceipt(
  userId: string,
  cloudReceipt: VerifiedReceipt,
): Promise<void> {
  const existing = await database.receipts.get(cloudReceipt.id);
  if (existing) {
    if (existing.ownerId !== userId) {
      throw new Error('A cloud receipt conflicts with another local account.');
    }
    if (existing.cloudSyncStatus === 'pending') {
      await database.receipts.update(cloudReceipt.id, {
        cloudSyncStatus: 'synced',
      });
    }
    return;
  }

  const blob = await downloadCloudReceiptImage(cloudReceipt.id);
  if (
    blob.size < 1 ||
    blob.size > MAX_IMAGE_BYTES ||
    blob.type !== cloudReceipt.originalMimeType
  ) {
    throw new Error('A downloaded receipt photo failed its integrity checks.');
  }

  const receipt: VerifiedReceipt = {
    ...cloudReceipt,
    ownerId: userId,
    cloudSyncStatus: 'synced',
  };
  const image: ReceiptImage = {
    receiptId: cloudReceipt.id,
    ownerId: userId,
    blob,
    filename: cloudReceipt.originalFilename,
    mimeType: cloudReceipt.originalMimeType,
    createdAt: cloudReceipt.createdAt,
  };

  try {
    await database.transaction(
      'rw',
      database.receipts,
      database.receiptImages,
      async () => {
        await database.receiptImages.add(image);
        await database.receipts.add(receipt);
      },
    );
  } catch (error) {
    const racedReceipt = await database.receipts.get(cloudReceipt.id);
    if (racedReceipt?.ownerId === userId) return;
    throw error;
  }
}
