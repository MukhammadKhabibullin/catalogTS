import type { Fabric, LocalAsset, MetadataRow } from '../types';
import { preliminaryName } from './catalog';
import { normalizeEmptyInlineCells } from './excel';

const MAX_FILE_SIZE = 60 * 1024 * 1024;

export async function imagePreview(blob: Blob, maxSize = 1400): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает обработку изображений.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Не удалось подготовить изображение.')), 'image/webp', 0.9));
  } finally { bitmap.close(); }
}

export async function importImages(files: File[], onProgress: (message: string) => void): Promise<{ fabrics: Fabric[]; assets: LocalAsset[] }> {
  const fabrics: Fabric[] = [];
  const assets: LocalAsset[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_FILE_SIZE) throw new Error(`«${file.name}» превышает 60 МБ. Уменьшите файл перед импортом.`);
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error(`Неизвестный формат: ${file.name}`);
    onProgress(`Подготовка изображения ${index + 1} из ${files.length}…`);
    const id = crypto.randomUUID();
    const preview = await imagePreview(file);
    assets.push({ id, preview, original: file });
    fabrics.push({ id, name: preliminaryName(file.name), fileName: file.name, image: `asset:${id}:preview`, original: `asset:${id}:original`, source: 'image' });
  }
  return { fabrics, assets };
}

export async function importPdf(file: File, onProgress: (message: string) => void): Promise<{ fabrics: Fabric[]; assets: LocalAsset[] }> {
  if (file.size > MAX_FILE_SIZE) throw new Error('PDF превышает 60 МБ. Разделите его на несколько файлов.');
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer(), cMapUrl: '/catalog/pdf/cmaps/', cMapPacked: true, standardFontDataUrl: '/catalog/pdf/standard_fonts/', wasmUrl: '/catalog/pdf/wasm/' });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error('В PDF больше 200 страниц. Разделите его на части.');
    const fabrics: Fabric[] = [];
    const assets: LocalAsset[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress(`Подготовка страницы PDF ${pageNumber} из ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(base.width, base.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const original = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось обработать страницу PDF.')), 'image/png'));
      const id = crypto.randomUUID();
      assets.push({ id, preview: await imagePreview(original), original });
      fabrics.push({ id, name: `${preliminaryName(file.name)} · ${pageNumber}`, fileName: `${file.name}#${pageNumber}`, image: `asset:${id}:preview`, original: `asset:${id}:original`, source: 'pdf', needsReview: true });
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
    return { fabrics, assets };
  } finally { await task.destroy(); }
}

export async function readMetadata(file: File): Promise<MetadataRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Таблица превышает 10 МБ. Разделите ее перед импортом.');
  const { default: readXlsxFile } = await import('read-excel-file');
  const { unzip, zipSync, strFromU8, strToU8 } = await import('fflate');
  let expandedBytes = 0;
  let oversized = false;
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    void file.arrayBuffer().then((buffer) => unzip(new Uint8Array(buffer), {
      filter: (entry) => {
        expandedBytes += entry.originalSize;
        if (expandedBytes > 50 * 1024 * 1024) oversized = true;
        return !oversized;
      },
    }, (error, files) => error ? reject(error) : resolve(files))).catch(reject);
  });
  if (oversized) throw new Error('Распакованная таблица превышает 50 МБ. Удалите лишние листы и изображения.');
  for (const name of Object.keys(entries)) {
    if (/^xl\/worksheets\/.*\.xml$/.test(name)) entries[name] = strToU8(normalizeEmptyInlineCells(strFromU8(entries[name])));
  }
  const normalized = new Uint8Array(zipSync(entries, { level: 0 }));
  const rows = await readXlsxFile(normalized.buffer);
  if (!rows.length) throw new Error('Таблица не содержит строк.');
  if (rows.length > 10001) throw new Error('В таблице больше 10 000 строк. Разделите ее на части.');
  const headers = rows[0].map((cell) => String(cell ?? '').toLowerCase().trim());
  const nameIndex = headers.findIndex((header) => /^(название|наименование|ткань|name|title|fabric)$/.test(header));
  const skuIndex = headers.findIndex((header) => /^(артикул|код|sku|article|id)$/.test(header));
  const fileIndex = headers.findIndex((header) => /^(файл|изображение|имя файла|filename|file|image)$/.test(header));
  if (nameIndex < 0) throw new Error('Добавьте в первую строку столбец «Название». Для сопоставления используйте столбец «Файл» или «Артикул».');
  return rows.slice(1).filter((row) => row[nameIndex] !== null && row[nameIndex] !== undefined && String(row[nameIndex]).trim())
    .map((row) => ({ name: String(row[nameIndex]).trim(), sku: skuIndex >= 0 ? String(row[skuIndex] ?? '').trim() : '', fileName: fileIndex >= 0 ? String(row[fileIndex] ?? '').trim() : '' }));
}
