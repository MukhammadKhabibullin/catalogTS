import { mkdir, readdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const directory = path.resolve(process.argv[2] ?? 'public/images/fabrics/source');
const root = process.cwd();
const output = path.join(root, 'public/images/fabrics');
const originals = path.join(root, 'public/catalog/originals');
await mkdir(output, { recursive: true });
await mkdir(originals, { recursive: true });
await mkdir(path.join(root, 'src/data'), { recursive: true });
const names = (await readdir(directory)).filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
if (!names.length) throw new Error(`No images found in ${directory}`);
const orderPath = path.join(directory, 'order.json');
let order;
try { order = JSON.parse(await readFile(orderPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (order && (!Array.isArray(order) || order.some((item) => typeof item !== 'string') || new Set(order).size !== order.length || order.some((name) => !names.includes(name)))) {
  throw new Error('order.json must be an array of unique, existing image filenames.');
}
names.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
const ordered = order ? [...order, ...names.filter((name) => !order.includes(name))] : names;
const fabrics = [];
for (const [index, fileName] of ordered.entries()) {
  const source = path.join(directory, fileName);
  const id = createHash('sha256').update(fileName.normalize('NFC')).digest('hex').slice(0, 16);
  const originalName = `${id}${path.extname(fileName).toLowerCase()}`;
  await sharp(source).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88, effort: 4 }).toFile(path.join(output, `${id}.webp`));
  await sharp(source).rotate().resize(140, 140, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(path.join(output, `${id}-thumb.webp`));
  await copyFile(source, path.join(originals, originalName));
  fabrics.push({ id, name: fileName.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/_/g, ' ').trim(), fileName,
    image: `/images/fabrics/${id}.webp`, thumbnail: `/images/fabrics/${id}-thumb.webp`, original: `/catalog/originals/${originalName}`, source: 'image' });
  if ((index + 1) % 10 === 0 || index === ordered.length - 1) console.log(`Processed ${index + 1}/${ordered.length}`);
}
await writeFile(path.join(root, 'src/data/fabrics.json'), JSON.stringify(fabrics, null, 2) + '\n');
console.log(`Imported ${fabrics.length} fabrics. Order: ${order ? 'order.json' : 'natural filename order (unconfirmed)'}.`);
