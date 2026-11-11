import type { Ref } from 'react';
import type { Fabric } from '../types';

export interface BookHandle {
  next: () => void;
  previous: () => void;
  cover: () => void;
  goToFabric: (index: number) => void;
}

export interface BookProps {
  ref: Ref<BookHandle>;
  fabrics: Fabric[];
  cover: string;
  onPageChange: (page: number, portrait: boolean) => void;
  onZoom: (fabric: Fabric) => void;
  reduceMotion: boolean;
  revision: number;
  initialPage?: number;
}
