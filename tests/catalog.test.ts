import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMetadata, moveFabric, normalizeKey, preliminaryName, validateMetadataMatches } from '../src/lib/catalog.ts';
import type { Fabric } from '../src/types.ts';
import { normalizeEmptyInlineCells } from '../src/lib/excel.ts';

const fabric = (id: string, fileName: string, sku?: string): Fabric => ({ id, fileName, name: preliminaryName(fileName), image: '/preview.webp', original: '/original.jpg', sku });
const fabrics = [fabric('green', 'Комфорт 30 Бирюз утро.jpg'), fabric('ivory', 'Комфорт 30 Слоновая кость.jpg'), fabric('dark', 'Комфорт 5 Мокрый асфальт Темный.jpg'), fabric('light', 'Комфорт 5.1 Мокрый асфальт СВЕТЛЫЙ.jpg')];

test('uses filename as preliminary title without extension or duplicate-copy suffix', () => {
  assert.equal(preliminaryName('Комфорт 1 Черный (1).jpg'), 'Комфорт 1 Черный');
  assert.equal(preliminaryName('Silencio 003 Size 10 (1).jpg'), 'Silencio 003 Size 10');
  assert.equal(preliminaryName('Узор_206-03.webp'), 'Узор 206-03');
});

test('normalizes case, yo and Unicode without removing meaningful digits', () => {
  assert.equal(normalizeKey('  ЗЕЛЁНЫЙ_003.JPG'), 'зеленый 003');
  assert.equal(normalizeKey('5.1'), '5.1');
});

test('matches exact filename before SKU fallback', () => {
  const [match] = matchMetadata(fabrics, [{ name: 'Название из таблицы', fileName: 'Комфорт 30 Бирюз утро.jpg', sku: '30' }]);
  assert.deepEqual(match.candidates, ['green']);
});

test('reports ambiguous SKU rather than guessing', () => {
  const [match] = matchMetadata(fabrics, [{ name: 'Новое имя', fileName: '', sku: '30' }]);
  assert.deepEqual(match.candidates, ['green', 'ivory']);
});

test('does not confuse SKU 5 with 5.1', () => {
  const [match] = matchMetadata(fabrics, [{ name: 'Новое имя', fileName: '', sku: '5' }]);
  assert.deepEqual(match.candidates, ['dark']);
});

test('preserves leading zeros in identifiers', () => {
  const samples = [fabric('003', 'Silencio 003.jpg'), fabric('3', 'Silencio 3.jpg')];
  assert.deepEqual(matchMetadata(samples, [{ name: 'Ткань', sku: '003', fileName: '' }])[0].candidates, ['003']);
});

test('does not match arbitrary substrings and reports missing match', () => {
  assert.deepEqual(matchMetadata(fabrics, [{ name: 'Неизвестная ткань', sku: '3', fileName: '' }])[0].candidates, []);
});

test('detects two metadata rows assigned to the same image', () => {
  const rows = [{ name: 'Первое', fileName: fabrics[0].fileName, sku: '' }, { name: 'Второе', fileName: fabrics[0].fileName, sku: '' }];
  assert.ok(validateMetadataMatches(matchMetadata(fabrics, rows)).every((match) => match.conflict));
});

test('reorders without mutating source and respects boundaries', () => {
  const moved = moveFabric(fabrics, 'dark', -1);
  assert.deepEqual(moved.map((item) => item.id), ['green', 'dark', 'ivory', 'light']);
  assert.deepEqual(fabrics.map((item) => item.id), ['green', 'ivory', 'dark', 'light']);
  assert.equal(moveFabric(fabrics, 'green', -1), fabrics);
  assert.equal(moveFabric(fabrics, 'missing', 1), fabrics);
});

test('accepts empty inline string cells produced by spreadsheet editors', () => {
  const input = '<row><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"></c><c t="inlineStr" r="C1"/><c r="D1"><v>30</v></c></row>';
  assert.equal(normalizeEmptyInlineCells(input), '<row><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="D1"><v>30</v></c></row>');
});
