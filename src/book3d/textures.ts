import * as THREE from 'three';
import { coverSvg } from './coverArtwork';

interface CacheEntry {
  promise: Promise<THREE.Texture>;
  texture?: THREE.Texture;
  used: number;
}

export class BookTextures {
  private entries = new Map<string, CacheEntry>();
  private protectedKeys = new Set<string>();
  private serial = 0;
  private disposed = false;

  constructor(private maxSize: number, private capacity: number, private anisotropy: number) {}

  protect(keys: string[]) {
    this.protectedKeys = new Set(keys);
    this.trim();
  }

  get(key: string): Promise<THREE.Texture> {
    const cached = this.entries.get(key);
    if (cached) { cached.used = ++this.serial; return cached.promise; }
    const loading = this.load(key);
    const entry: CacheEntry = { promise: loading, used: ++this.serial };
    entry.promise = loading.then((texture) => {
      if (this.disposed || this.entries.get(key) !== entry) { texture.dispose(); throw new Error('Texture request superseded'); }
      entry.texture = texture;
      this.trim();
      return texture;
    }).catch((error: unknown) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    return entry.promise;
  }

  private async load(key: string): Promise<THREE.Texture> {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.maxSize;
    const context = canvas.getContext('2d')!;
    context.fillStyle = key === 'inside' ? '#343732' : '#f2f0ed';
    context.fillRect(0, 0, this.maxSize, this.maxSize);
    if (key !== 'inside') {
      const image = new Image();
      image.decoding = 'async';
      let temporaryUrl: string | undefined;
      if (key === 'cover' || key === 'back') {
        temporaryUrl = URL.createObjectURL(new Blob([coverSvg(key === 'back')], { type: 'image/svg+xml' }));
        image.src = temporaryUrl;
      } else { image.src = key; }
      try {
        await image.decode();
        const scale = this.maxSize / Math.max(image.naturalWidth, image.naturalHeight);
        const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
        context.drawImage(image, (this.maxSize - width) / 2, (this.maxSize - height) / 2, width, height);
      } finally { if (temporaryUrl) URL.revokeObjectURL(temporaryUrl); }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.anisotropy;
    return texture;
  }

  private trim() {
    const candidates = [...this.entries.entries()].filter(([key, entry]) => entry.texture && !this.protectedKeys.has(key)).sort((a, b) => a[1].used - b[1].used);
    while (this.entries.size > this.capacity && candidates.length) {
      const [key, entry] = candidates.shift()!;
      entry.texture?.dispose();
      const canvas = entry.texture?.image as HTMLCanvasElement | undefined;
      if (canvas) { canvas.width = canvas.height = 0; }
      this.entries.delete(key);
    }
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.texture?.dispose();
    this.entries.clear();
  }
}

export function createEdgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#d0cbbf'; context.fillRect(0, 0, 8, 256);
  for (let y = 0; y < 256; y += 4) {
    context.fillStyle = y % 12 === 0 ? '#a69f90' : '#b8b2a5'; context.fillRect(0, y, 8, 1);
    context.fillStyle = '#e5e0d5'; context.fillRect(0, y + 1, 8, 1);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
