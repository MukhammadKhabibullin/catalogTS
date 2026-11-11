import { useCallback, useEffect, useMemo } from 'react';
import type { LocalAsset } from '../types';

export function useAssetUrls(assets: LocalAsset[]) {
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assets) {
      map.set(`asset:${asset.id}:preview`, URL.createObjectURL(asset.preview));
      map.set(`asset:${asset.id}:original`, URL.createObjectURL(asset.original));
    }
    return map;
  }, [assets]);
  useEffect(() => () => { for (const url of urls.values()) URL.revokeObjectURL(url); }, [urls]);
  return useCallback((value: string) => urls.get(value) ?? value, [urls]);
}
