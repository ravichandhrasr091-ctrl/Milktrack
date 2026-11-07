import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'public', 'ocr');

const assets = [
  [
    resolve(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    resolve(destination, 'worker.min.js'),
  ],
  [
    resolve(
      root,
      'node_modules',
      'tesseract.js-core',
      'tesseract-core-simd-lstm.wasm.js',
    ),
    resolve(destination, 'tesseract-core-simd-lstm.wasm.js'),
  ],
  [
    resolve(
      root,
      'node_modules',
      '@tesseract.js-data',
      'eng',
      '4.0.0_best_int',
      'eng.traineddata.gz',
    ),
    resolve(destination, 'eng.traineddata.gz'),
  ],
];

await mkdir(destination, { recursive: true });
for (const [source, target] of assets) {
  const [sourceInfo, targetInfo] = await Promise.all([
    stat(source),
    stat(target).catch(() => undefined),
  ]);
  if (targetInfo?.size === sourceInfo.size) continue;

  const temporary = `${target}.${process.pid}.tmp`;
  await copyFile(source, temporary);
  try {
    await rename(temporary, target);
  } catch (error) {
    const currentTarget = await stat(target).catch(() => undefined);
    if (!currentTarget || currentTarget.size !== sourceInfo.size) throw error;
    await unlink(temporary).catch(() => undefined);
  }
}
