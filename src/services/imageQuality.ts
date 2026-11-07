export type ImageQualityResult =
  | { status: 'passed' }
  | {
      status: 'rejected';
      reason: string;
    };

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MIN_SHORT_EDGE = 600;
const MIN_LONG_EDGE = 800;

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImageFile(file: File): ImageQualityResult {
  if (!supportedTypes.has(file.type)) {
    return {
      status: 'rejected',
      reason: 'Choose a JPEG, PNG, or WebP image.',
    };
  }

  if (file.size === 0) {
    return {
      status: 'rejected',
      reason: 'This image file is empty. Choose another photo.',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      status: 'rejected',
      reason: 'This photo is larger than 20 MB. Choose a smaller image.',
    };
  }

  return { status: 'passed' };
}

export function assessReceiptPixels(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  sourceWidth = width,
  sourceHeight = height,
): ImageQualityResult {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    pixels.length !== width * height * 4
  ) {
    return {
      status: 'rejected',
      reason: 'The photo could not be read. Choose or capture it again.',
    };
  }

  const shortEdge = Math.min(sourceWidth, sourceHeight);
  const longEdge = Math.max(sourceWidth, sourceHeight);
  if (shortEdge < MIN_SHORT_EDGE || longEdge < MIN_LONG_EDGE) {
    return {
      status: 'rejected',
      reason:
        'This photo is too small to inspect clearly. Retake it at a higher resolution.',
    };
  }

  const grayscale = new Float32Array(width * height);
  let total = 0;
  for (let pixel = 0, index = 0; pixel < grayscale.length; pixel++, index += 4) {
    const value =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;
    grayscale[pixel] = value;
    total += value;
  }

  const mean = total / grayscale.length;
  let squaredDifference = 0;
  for (const value of grayscale) {
    squaredDifference += (value - mean) ** 2;
  }
  const contrast = Math.sqrt(squaredDifference / grayscale.length);

  if (mean < 35) {
    return {
      status: 'rejected',
      reason: 'This photo is too dark to read. Add light and take it again.',
    };
  }

  if (contrast < 7) {
    return {
      status: 'rejected',
      reason:
        'This photo appears blank or has too little contrast. Make sure the receipt is visible.',
    };
  }

  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let sampleCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian =
        grayscale[index - width] +
        grayscale[index + width] +
        grayscale[index - 1] +
        grayscale[index + 1] -
        4 * grayscale[index];
      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      sampleCount++;
    }
  }

  const laplacianMean = laplacianTotal / sampleCount;
  const sharpness =
    laplacianSquaredTotal / sampleCount - laplacianMean * laplacianMean;

  if (sharpness < 40) {
    return {
      status: 'rejected',
      reason: 'This photo looks blurred. Hold steady and take it again.',
    };
  }

  return { status: 'passed' };
}

export async function checkReceiptImage(file: File): Promise<ImageQualityResult> {
  const fileResult = validateImageFile(file);
  if (fileResult.status === 'rejected') return fileResult;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      status: 'rejected',
      reason: 'This image could not be opened. Choose a different photo.',
    };
  }

  try {
    const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return {
        status: 'rejected',
        reason: 'Image quality could not be checked in this browser.',
      };
    }

    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return assessReceiptPixels(
      width,
      height,
      pixels.data,
      bitmap.width,
      bitmap.height,
    );
  } finally {
    bitmap.close();
  }
}
