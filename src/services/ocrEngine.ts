import { createWorker, PSM } from 'tesseract.js';
import type { OcrWord } from './receiptParser';

export interface OCRProgress {
  stage: string;
  progress: number;
}

export interface OCRResult {
  rawText: string;
  words: OcrWord[];
  engine: 'Tesseract.js';
}

export async function recognizeReceipt(
  original: Blob,
  onProgress?: (progress: OCRProgress) => void,
): Promise<OCRResult> {
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core-simd-lstm.wasm.js',
    langPath: '/ocr',
    cachePath: 'milktrack-ocr',
    cacheMethod: 'write',
    gzip: true,
    workerBlobURL: false,
    logger: ({ status, progress }) => {
      onProgress?.({ stage: status, progress });
    },
  });

  try {
    const workingCopy = await prepareOCRCopy(original);
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(workingCopy, {}, { blocks: true });
    const words =
      data.blocks?.flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.flatMap((line) =>
            line.words.map((word) => ({
              text: word.text,
              confidence: word.confidence,
            })),
          ),
        ),
      ) ?? [];

    return { rawText: data.text, words, engine: 'Tesseract.js' };
  } finally {
    await worker.terminate();
  }
}

async function prepareOCRCopy(original: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original);
  } catch {
    throw new Error('The selected photo could not be decoded for OCR.');
  }

  try {
    const scale = Math.min(1.5, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the OCR copy.');

    context.filter = 'grayscale(1) contrast(1.12)';
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const enhanced = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!enhanced) throw new Error('Could not create a temporary OCR image.');
    return enhanced;
  } finally {
    bitmap.close();
  }
}
