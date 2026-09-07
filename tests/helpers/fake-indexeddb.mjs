/**
 * Ein IndexedDB, gerade genug für `secure-storage.js`: eine Datenbank, ein
 * Objektspeicher, `get`/`put` über einen festen Schlüssel. Node hat kein
 * IndexedDB eingebaut — dieselbe Lücke wie bei `localStorage` in den anderen
 * Tests, hier nur mit mehr Ereignissen nachzubauen, weil IndexedDB sie über
 * `onsuccess`/`onerror`-Rückrufe statt über Promises meldet.
 *
 * Bewusst nicht mehr, als gebraucht wird: kein `openCursor`, keine Indizes,
 * keine `oncomplete`-Transaktionsphase. Das Ziel ist, dass sich ein
 * gespeicherter Schlüssel über einen simulierten Neustart hinweg wiederfindet
 * und Fehler wie ein echtes IndexedDB als `onerror` statt als Wurf ankommen.
 */
export function installFakeIndexedDB() {
  const databases = new Map(); // Name -> Map(Store -> Map(Key -> Value))

  function fireAsync(request, run) {
    queueMicrotask(() => {
      try {
        request.result = run();
        request.onsuccess?.({ target: request });
      } catch (err) {
        request.error = err;
        request.onerror?.({ target: request });
      }
    });
  }

  function makeStore(storeMap) {
    return {
      get(key) {
        const request = {};
        fireAsync(request, () => storeMap.get(key));
        return request;
      },
      put(value, key) {
        const request = {};
        fireAsync(request, () => { storeMap.set(key, value); return key; });
        return request;
      },
    };
  }

  function makeDb(stores) {
    return {
      objectStoreNames: { contains: (name) => stores.has(name) },
      createObjectStore(name) {
        stores.set(name, new Map());
        return makeStore(stores.get(name));
      },
      transaction(name) {
        return { objectStore: () => makeStore(stores.get(name)) };
      },
    };
  }

  globalThis.indexedDB = {
    open(name, version) {
      const request = { result: undefined, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, new Map());
        const db = makeDb(databases.get(name));
        request.result = db;
        if (isNew) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    },
    // Für Tests, die eine völlig neue Installation nachstellen wollen.
    _reset() { databases.clear(); },
  };

  return globalThis.indexedDB;
}
