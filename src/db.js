// 極簡 IndexedDB 包裝：queue（待上傳）與 kv（快取）兩個 store。
// 照片以 base64 字串存，避開 iOS Safari 舊版存 Blob 的問題。
const DB_NAME = 'defect-app';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    fn(t.objectStore(store));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export const kv = {
  async get(key) { const db = await open(); return reqP(db.transaction('kv').objectStore('kv').get(key)); },
  async set(key, val) { return tx('kv', 'readwrite', s => { s.put(val, key); }); },
  async del(key) { return tx('kv', 'readwrite', s => { s.delete(key); }); },
  async clear() { return tx('kv', 'readwrite', s => { s.clear(); }); }
};

export const queueStore = {
  async all() {
    const db = await open();
    const items = await reqP(db.transaction('queue').objectStore('queue').getAll());
    return items.sort((a, b) => a.createdAt - b.createdAt);
  },
  async put(item) { return tx('queue', 'readwrite', s => { s.put(item); }); },
  async del(id) { return tx('queue', 'readwrite', s => { s.delete(id); }); }
};
