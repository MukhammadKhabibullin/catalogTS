export interface Fabric {
  id: string;
  name: string;
  fileName: string;
  sku?: string;
  image: string;
  original: string;
  thumbnail?: string;
  source?: 'image' | 'pdf';
  needsReview?: boolean;
}

export interface CatalogSettings {
  cover: string;
  logo: string;
  contacts: { phone: string; email: string; address: string };
}

export interface LocalAsset {
  id: string;
  preview: Blob;
  original: Blob;
}

export interface CatalogSnapshot {
  fabrics: Fabric[];
  settings: CatalogSettings;
  assets: LocalAsset[];
}

export interface MetadataRow {
  name: string;
  sku: string;
  fileName: string;
}

export interface MatchResult {
  row: MetadataRow;
  candidates: string[];
  conflict?: boolean;
}
