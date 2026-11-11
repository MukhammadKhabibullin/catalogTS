import type { CatalogSnapshot } from '../types';

const DB_NAME = 'tihie-steny-catalog';
const STORE = 'workspace';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Не удалось открыть локальное хранилище.'));
    request.onblocked = () => reject(new Error('Закройте другие вкладки каталога и повторите.'));
  });
}

export async function loadSnapshot(): Promise<CatalogSnapshot | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('catalog');
      request.onsuccess = () => resolve(request.result as CatalogSnapshot | undefined);
      request.onerror = () => reject(new Error('Не удалось прочитать сохраненный каталог.'));
    });
  } finally { db.close(); }
}

export async function saveSnapshot(snapshot: CatalogSnapshot): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(snapshot, 'catalog');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Не удалось сохранить каталог. Возможно, недостаточно места в браузере.'));
      transaction.onabort = () => reject(new Error('Сохранение отменено. Проверьте свободное место в браузере.'));
    });
  } finally { db.close(); }
}
