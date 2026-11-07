import { getIdToken } from './auth';
import type { VerifiedReceipt } from '../types/receipt';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

interface ImageUploadResponse {
  uploadUrl?: string;
  fields?: Record<string, string>;
  alreadySaved?: boolean;
}

interface ReceiptListResponse {
  receipts: VerifiedReceipt[];
  nextToken?: string;
}

export function isReceiptCloudConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

export async function uploadReceiptToCloud(
  receipt: VerifiedReceipt,
  image: Blob,
): Promise<void> {
  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
    throw new Error('This receipt photo format cannot be synced to cloud storage.');
  }
  if (image.size < 1 || image.size > MAX_IMAGE_BYTES) {
    throw new Error('Cloud receipt photos must be 10 MB or smaller.');
  }

  const uploadResult = await authorizedRequest<ImageUploadResponse>(
    `receipts/${encodeURIComponent(receipt.id)}/image-upload`,
    {
      method: 'POST',
      body: JSON.stringify({
        contentType: image.type,
        contentLength: image.size,
      }),
    },
  );
  if (uploadResult.alreadySaved) return;
  if (
    typeof uploadResult.uploadUrl !== 'string' ||
    !uploadResult.fields ||
    typeof uploadResult.fields !== 'object'
  ) {
    throw new Error('The cloud API did not provide a receipt photo upload form.');
  }

  const formData = new FormData();
  for (const [name, value] of Object.entries(uploadResult.fields)) {
    formData.append(name, value);
  }
  formData.append('file', image, receipt.originalFilename);
  const uploadResponse = await fetch(uploadResult.uploadUrl, {
    method: 'POST',
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `The receipt photo could not be uploaded to private cloud storage (HTTP ${uploadResponse.status}).`,
    );
  }

  await authorizedRequest('receipts', {
    method: 'POST',
    body: JSON.stringify(receipt),
  });
}

export async function getCloudReceiptPage(
  nextToken?: string,
): Promise<ReceiptListResponse> {
  const suffix = nextToken
    ? `?nextToken=${encodeURIComponent(nextToken)}`
    : '';
  const result = await authorizedRequest<unknown>(`receipts${suffix}`, {
    method: 'GET',
  });
  if (
    typeof result !== 'object' ||
    result === null ||
    !('receipts' in result) ||
    !Array.isArray(result.receipts) ||
    !result.receipts.every(isVerifiedReceipt) ||
    ('nextToken' in result &&
      result.nextToken !== undefined &&
      typeof result.nextToken !== 'string')
  ) {
    throw new Error('The cloud API returned an invalid receipt list.');
  }
  return result as ReceiptListResponse;
}

export async function downloadCloudReceiptImage(
  receiptId: string,
): Promise<Blob> {
  const result = await authorizedRequest<unknown>(
    `receipts/${encodeURIComponent(receiptId)}/image-download`,
    { method: 'GET' },
  );
  if (
    typeof result !== 'object' ||
    result === null ||
    !('downloadUrl' in result) ||
    typeof result.downloadUrl !== 'string'
  ) {
    throw new Error('The cloud API did not provide a receipt photo download URL.');
  }

  const response = await fetch(result.downloadUrl);
  if (!response.ok) {
    throw new Error(
      `The receipt photo could not be downloaded from private cloud storage (HTTP ${response.status}).`,
    );
  }
  return response.blob();
}

async function authorizedRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('Cloud receipt sync is not configured.');

  const token = await getIdToken();
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `Cloud receipt sync failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

function getApiBaseUrl(): string | null {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configuredUrl) return null;

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error('VITE_API_BASE_URL must be a valid absolute URL.');
  }
  const isLocalhost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (
    !['https:', ...(isLocalhost ? ['http:'] : [])].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('VITE_API_BASE_URL must use HTTPS and contain no credentials.');
  }
  return `${url.toString().replace(/\/+$/, '')}/`;
}

function isVerifiedReceipt(value: unknown): value is VerifiedReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const receipt = value as Record<string, unknown>;
  return (
    typeof receipt.id === 'string' &&
    typeof receipt.receiptDate === 'string' &&
    typeof receipt.receiptTime === 'string' &&
    (receipt.shift === 'Morning/Day' || receipt.shift === 'Night') &&
    typeof receipt.quantityLitres === 'string' &&
    typeof receipt.totalAmount === 'string' &&
    receipt.verificationStatus === 'verified' &&
    typeof receipt.originalMimeType === 'string'
  );
}
