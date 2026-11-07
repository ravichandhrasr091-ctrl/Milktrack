import { describe, expect, it } from 'vitest';
import {
  assessReceiptPixels,
  validateImageFile,
} from './imageQuality';

function solidImage(
  width: number,
  height: number,
  value: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
  return pixels;
}

function sharpTextLikeImage(width: number, height: number): Uint8ClampedArray {
  const pixels = solidImage(width, height, 240);
  for (let y = 100; y < height - 100; y += 14) {
    for (let x = 80; x < width - 80; x++) {
      if (x % 97 < 46) {
        const index = (y * width + x) * 4;
        pixels[index] = 25;
        pixels[index + 1] = 25;
        pixels[index + 2] = 25;
      }
    }
  }
  return pixels;
}

describe('receipt image quality gate', () => {
  it('rejects images below the minimum dimensions', () => {
    const result = assessReceiptPixels(500, 700, solidImage(500, 700, 120));
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatch(/too small/i);
  });

  it('rejects very dark images', () => {
    const result = assessReceiptPixels(600, 800, solidImage(600, 800, 15));
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatch(/too dark/i);
  });

  it('rejects blank images', () => {
    const result = assessReceiptPixels(600, 800, solidImage(600, 800, 245));
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatch(/blank/i);
  });

  it('rejects low-detail blurred images', () => {
    const pixels = solidImage(600, 800, 0);
    for (let y = 0; y < 800; y++) {
      for (let x = 0; x < 600; x++) {
        const index = (y * 600 + x) * 4;
        const value = 140 + Math.round(30 * Math.sin((2 * Math.PI * x) / 80));
        pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
      }
    }
    const result = assessReceiptPixels(600, 800, pixels);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatch(/blurred/i);
  });

  it('passes a sufficiently detailed, bright image', () => {
    expect(
      assessReceiptPixels(600, 800, sharpTextLikeImage(600, 800)),
    ).toEqual({ status: 'passed' });
  });

  it('rejects unsupported and oversized image files', () => {
    const unsupported = new File(['data'], 'receipt.gif', { type: 'image/gif' });
    const oversized = new File(
      [new Uint8Array(20 * 1024 * 1024 + 1)],
      'receipt.jpg',
      { type: 'image/jpeg' },
    );
    expect(validateImageFile(unsupported).status).toBe('rejected');
    const largeResult = validateImageFile(oversized);
    expect(largeResult.status).toBe('rejected');
    if (largeResult.status === 'rejected') {
      expect(largeResult.reason).toMatch(/20 MB/i);
    }
  });
});
