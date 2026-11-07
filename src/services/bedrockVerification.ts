import type { ParsedDodlaReceipt } from './receiptParser';

export type ReceiptFieldKey =
  | 'receiptDate'
  | 'receiptTime'
  | 'shiftCode'
  | 'milkType'
  | 'quantityLitres'
  | 'fat'
  | 'snf'
  | 'clr'
  | 'ratePerLitre'
  | 'totalAmount'
  | 'supplierCode'
  | 'mccCode'
  | 'vlccCode';

export interface ReceiptFieldCheck {
  field: ReceiptFieldKey;
  ocrValue: string;
  imageValue: string | null;
  status: 'match' | 'mismatch' | 'uncertain';
  note: string;
}

export interface BedrockVerification {
  checks: ReceiptFieldCheck[];
}

const fieldLabels: Record<ReceiptFieldKey, string> = {
  receiptDate: 'Receipt date',
  receiptTime: 'Receipt time',
  shiftCode: 'Shift code',
  milkType: 'Milk type',
  quantityLitres: 'Quantity',
  fat: 'FAT',
  snf: 'SNF',
  clr: 'CLR',
  ratePerLitre: 'Rate per litre',
  totalAmount: 'Total amount',
  supplierCode: 'Supplier code',
  mccCode: 'MCC code',
  vlccCode: 'VLCC code',
};

const fieldKeys = Object.keys(fieldLabels) as ReceiptFieldKey[];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;

export function getReceiptFieldLabel(field: ReceiptFieldKey): string {
  return fieldLabels[field];
}

export async function verifyReceiptWithBedrock(
  file: File,
  parsed: ParsedDodlaReceipt,
  signal?: AbortSignal,
): Promise<BedrockVerification> {
  const image = await prepareVerificationImage(file);
  const fields: Record<ReceiptFieldKey, string> = {
    receiptDate: parsed.receiptDateText,
    receiptTime: parsed.receiptTime.value,
    shiftCode: parsed.shiftText,
    milkType: parsed.milkType.value,
    quantityLitres: parsed.quantityLitres.value,
    fat: parsed.fat.value,
    snf: parsed.snf.value,
    clr: parsed.clr.value,
    ratePerLitre: parsed.ratePerLitre.value,
    totalAmount: parsed.totalAmount.value,
    supplierCode: parsed.supplierCode.value,
    mccCode: parsed.mccCode.value,
    vlccCode: parsed.vlccCode.value,
  };
  const response = await fetch('/api/ai/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: await blobToBase64(image),
      mediaType: 'image/jpeg',
      fields,
    }),
    signal,
  });

  const responseText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(
      'The local AWS verification service returned an invalid response. Restart the MilkTrack development server and try again.',
    );
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'AWS receipt verification failed. You can continue checking the receipt manually.';
    throw new Error(message);
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('checks' in payload) ||
    !Array.isArray(payload.checks)
  ) {
    throw new Error('AWS returned an invalid receipt verification result.');
  }

  const checks = payload.checks as ReceiptFieldCheck[];
  if (
    checks.length !== fieldKeys.length ||
    checks.some(
      (check, index) =>
        !check ||
        check.field !== fieldKeys[index] ||
        !['match', 'mismatch', 'uncertain'].includes(check.status) ||
        typeof check.ocrValue !== 'string' ||
        (check.imageValue !== null && typeof check.imageValue !== 'string') ||
        typeof check.note !== 'string',
    )
  ) {
    throw new Error('AWS returned an incomplete receipt verification result.');
  }

  return { checks };
}

async function prepareVerificationImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Could not prepare a temporary image for AWS verification.');
  }

  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser could not prepare an image for AWS verification.');
    }

    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const compressed = await canvasToJpeg(canvas, quality);
      if (compressed.size <= MAX_IMAGE_BYTES) return compressed;
    }

    throw new Error(
      'This photo is too large to send to AWS for verification. You can still review it manually.',
    );
  } finally {
    bitmap.close();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create a temporary verification image.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
