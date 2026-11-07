export type EntryMethod = 'camera' | 'upload';
export type ReceiptShift = 'Morning/Day' | 'Night';

export interface VerifiedReceipt {
  id: string;
  ownerId?: string;
  cloudSyncStatus?: 'local-only' | 'pending' | 'synced';
  formatId: 'dodla-cow-provisional-slip-v1';
  milkType: 'Cow';
  receiptDate: string;
  receiptTime: string;
  shift: ReceiptShift;
  quantityLitres: string;
  fat: string;
  snf: string;
  clr: string;
  ratePerLitre: string;
  totalAmount: string;
  supplierCode?: string;
  mccCode?: string;
  vlccCode?: string;
  originalImageRef: string;
  originalFilename: string;
  originalMimeType: string;
  ocrRawText: string;
  verificationStatus: 'verified';
  verificationTimestamp: string;
  createdAt: string;
  updatedAt: string;
  entryMethod: EntryMethod;
}

export interface ReceiptImage {
  receiptId: string;
  ownerId?: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  createdAt: string;
}

export interface ReceiptSettings {
  key: string;
  value: unknown;
  updatedAt: string;
}
