import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Fabric } from '../src/types.ts';

const fabrics = JSON.parse(await readFile(new URL('../src/data/fabrics.json', import.meta.url), 'utf8')) as Fabric[];

test('catalog has unique identities and nonempty filenames and labels', () => {
  assert.ok(fabrics.length > 0, 'Run the catalog importer first');
  assert.equal(new Set(fabrics.map((fabric) => fabric.id)).size, fabrics.length);
  assert.ok(fabrics.every((fabric) => fabric.name.trim() && fabric.fileName.trim()));
});

test('every catalog preview, thumbnail and original is present in public', async () => {
  for (const fabric of fabrics) {
    for (const url of [fabric.image, fabric.thumbnail!, fabric.original]) {
      const path = fileURLToPath(new URL(`../public${url}`, import.meta.url));
      await assert.doesNotReject(access(path), `Missing asset for ${fabric.fileName}: ${url}`);
    }
  }
});
