import Dexie, { type Table } from 'dexie';
import {
  isReceiptCloudConfigured,
  uploadReceiptToCloud,
} from './receiptCloud';
import type {
  ReceiptImage,
  ReceiptSettings,
  VerifiedReceipt,
} from '../types/receipt';

export class MilkTrackDatabase extends Dexie {
  receipts!: Table<VerifiedReceipt, string>;
  receiptImages!: Table<ReceiptImage, string>;
  settings!: Table<ReceiptSettings, string>;

  constructor() {
    super('MilkTrack');
    this.version(1).stores({
      receipts:
        '&id, receiptDate, shift, formatId, verificationStatus, verificationTimestamp',
      receiptImages: '&receiptId, createdAt',
      settings: '&key',
    });
    this.version(2).stores({
      receipts:
        '&id, receiptDate, shift, formatId, verificationStatus, verificationTimestamp, ownerId, [ownerId+receiptDate], [ownerId+verificationStatus]',
      receiptImages: '&receiptId, createdAt, ownerId, [ownerId+receiptId]',
      settings: '&key',
    });
  }
}

export const database = new MilkTrackDatabase();

export async function bindLocalReceiptsToUser(userId: string): Promise<void> {
  if (!userId) throw new Error('A signed-in account is required to scope local receipts.');

  await database.transaction(
    'rw',
    database.receipts,
    database.receiptImages,
    async () => {
      await database.receipts
        .toCollection()
        .filter((receipt) => !receipt.ownerId)
        .modify({ ownerId: userId, cloudSyncStatus: 'local-only' });
      await database.receiptImages
        .toCollection()
        .filter((image) => !image.ownerId)
        .modify({ ownerId: userId });
    },
  );
}

export async function getReceiptsForUser(
  userId: string,
): Promise<VerifiedReceipt[]> {
  return (await database.receipts
    .where('[ownerId+receiptDate]')
    .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
    .toArray())
    .sort((left, right) =>
      `${right.receiptDate}T${right.receiptTime}`.localeCompare(
        `${left.receiptDate}T${left.receiptTime}`,
      ),
    );
}

export async function getReceiptForUser(
  userId: string,
  receiptId: string,
): Promise<VerifiedReceipt | undefined> {
  const receipt = await database.receipts.get(receiptId);
  return receipt?.ownerId === userId ? receipt : undefined;
}

export async function getReceiptImageForUser(
  userId: string,
  receiptId: string,
): Promise<ReceiptImage | undefined> {
  return database.receiptImages
    .where('[ownerId+receiptId]')
    .equals([userId, receiptId])
    .first();
}

export async function saveVerifiedReceipt(
  receipt: VerifiedReceipt,
  originalImage: Blob,
  userId: string,
): Promise<{
  cloudSyncStatus: NonNullable<VerifiedReceipt['cloudSyncStatus']>;
  syncError?: string;
}> {
  if (receipt.verificationStatus !== 'verified') {
    throw new Error('Only a user-verified receipt can be saved.');
  }
  if (!userId) {
    throw new Error('A signed-in account is required to save this receipt.');
  }
  if (receipt.id !== receipt.originalImageRef) {
    throw new Error('Receipt and original photo references do not match.');
  }
  if (originalImage.size === 0) {
    throw new Error('The original receipt photo is empty and cannot be saved.');
  }
  if (originalImage.type !== receipt.originalMimeType) {
    throw new Error('The original photo MIME type does not match the record.');
  }

  const image: ReceiptImage = {
    receiptId: receipt.id,
    ownerId: userId,
    blob: originalImage,
    filename: receipt.originalFilename,
    mimeType: receipt.originalMimeType,
    createdAt: receipt.createdAt,
  };
  const cloudSyncStatus = isReceiptCloudConfigured() ? 'pending' : 'local-only';
  const userReceipt: VerifiedReceipt = {
    ...receipt,
    ownerId: userId,
    cloudSyncStatus,
  };

  try {
    await database.transaction(
      'rw',
      database.receipts,
      database.receiptImages,
      async () => {
        await database.receiptImages.add(image);
        await database.receipts.add(userReceipt);
      },
    );
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
    ) {
      throw new Error(
        'Browser storage is full or unavailable. Free device storage, then retry saving the receipt.',
        { cause: error },
      );
    }

    throw new Error(
      error instanceof Error
        ? `Could not save receipt and original photo: ${error.message}`
        : 'Could not save receipt and original photo.',
      { cause: error },
    );
  }

  if (cloudSyncStatus === 'local-only') return { cloudSyncStatus };
  try {
    await uploadReceiptToCloud(userReceipt, originalImage);
    await database.receipts.update(receipt.id, { cloudSyncStatus: 'synced' });
    return { cloudSyncStatus: 'synced' };
  } catch (error) {
    return {
      cloudSyncStatus: 'pending',
      syncError:
        error instanceof Error
          ? error.message
          : 'Cloud sync could not complete. The receipt is saved on this device.',
    };
  }
}
