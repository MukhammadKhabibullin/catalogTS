export function normalizeEmptyInlineCells(xml: string): string {
  return xml.replace(/<c\b(?=[^>]*\bt=(["'])inlineStr\1)[^>]*(?:\/>|>\s*<\/c>)/g, '');
}
