import type { Fabric, MatchResult, MetadataRow } from '../types.ts';

export function preliminaryName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/_/g, ' ').trim();
}

export function normalizeKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е')
    .replace(/\.(jpe?g|png|webp)$/i, '').replace(/\s*\(\d+\)$/, '')
    .replace(/[\s_]+/g, ' ').trim();
}

export function matchMetadata(fabrics: Fabric[], rows: MetadataRow[]): MatchResult[] {
  return rows.map((row) => {
    const fileKey = normalizeKey(row.fileName);
    const nameKey = normalizeKey(row.name);
    const skuKey = normalizeKey(row.sku);
    const exact = fabrics.filter((fabric) =>
      (fileKey && normalizeKey(fabric.fileName) === fileKey) ||
      (nameKey && normalizeKey(fabric.name) === nameKey));
    if (exact.length) return { row, candidates: exact.map((fabric) => fabric.id) };
    const candidates = skuKey ? fabrics.filter((fabric) => {
      if (fabric.sku && normalizeKey(fabric.sku) === skuKey) return true;
      const escaped = skuKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}.])${escaped}($|[^\\p{L}\\p{N}.])`, 'u')
        .test(normalizeKey(preliminaryName(fabric.fileName)));
    }) : [];
    return { row, candidates: candidates.map((fabric) => fabric.id) };
  });
}

export function validateMetadataMatches(matches: MatchResult[]): MatchResult[] {
  const counts = new Map<string, number>();
  for (const match of matches) {
    if (match.candidates.length === 1) {
      const id = match.candidates[0];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return matches.map((match) => ({ ...match, candidates: [...match.candidates],
    conflict: match.candidates.length === 1 && (counts.get(match.candidates[0]) ?? 0) > 1,
  }));
}

export function moveFabric(fabrics: Fabric[], id: string, direction: -1 | 1): Fabric[] {
  const index = fabrics.findIndex((fabric) => fabric.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= fabrics.length) return fabrics;
  const result = [...fabrics];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
