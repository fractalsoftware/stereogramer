import { useState, useEffect } from 'react';
import type { DepthSource } from '../App.js';

/**
 * Checks whether neural network model weights (ONNX / HuggingFace) exist in CacheStorage.
 */
export async function checkIsModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      for (const req of requests) {
        const url = req.url.toLowerCase();
        if (
          url.includes('onnx') ||
          url.includes('depth-anything') ||
          url.includes('huggingface')
        ) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function useModelCacheStatus(isOnline: boolean, activeTab: DepthSource): boolean {
  const [isModelCached, setIsModelCached] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    checkIsModelCached().then((cached) => {
      if (isMounted) {
        setIsModelCached(cached);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isOnline, activeTab]);

  return isModelCached;
}
