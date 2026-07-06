// ============================================================
// db.js — Storico sessioni con IndexedDB
// ============================================================

const DB_NAME = 'rangetrainer';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';

let dbInstance = null;

// Apre (o crea) il database. Restituisce una Promise.
function openDatabase() {
  return new Promise(function (resolve, reject) {
    if (dbInstance !== null) {
      resolve(dbInstance);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Eseguito solo la prima volta (o quando si alza DB_VERSION):
    // crea la "tabella" delle sessioni con i suoi indici di ricerca
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('byDate', 'date');
        store.createIndex('byWeapon', 'weaponId');
        store.createIndex('byExercise', 'exerciseKey');
      }
    };

    request.onsuccess = function (event) {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

// ---------- Salvataggio di una sessione ----------
// "session" e' un oggetto qualsiasi; i campi standard che useremo:
//   date        data/ora in millisecondi (Date.now())
//   type        'simple' | 'stage' | 'shottimer'
//   weaponId    id dell'arma
//   weaponName  nome dell'arma (copiato, cosi' resta leggibile
//               anche se l'arma viene poi eliminata)
//   exerciseKey id esercizio o id stage
//   exerciseName nome leggibile
//   ...piu' i dati specifici del tipo di sessione

function dbSaveSession(sessionData) {
  return openDatabase().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.add(sessionData);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

// ---------- Lettura di tutte le sessioni ----------
// Restituisce l'elenco completo, dalla piu' recente alla piu' vecchia.

function dbGetAllSessions() {
  return openDatabase().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.getAll();
      request.onsuccess = function () {
        const list = request.result || [];
        list.sort(function (a, b) { return b.date - a.date; });
        resolve(list);
      };
      request.onerror = function () { reject(request.error); };
    });
  });
}

// ---------- Eliminazione di una sessione ----------

function dbDeleteSession(id) {
  return openDatabase().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.delete(id);
      request.onsuccess = function () { resolve(); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

// ---------- Export / Import (backup, spec sezione 6) ----------
// Esporta TUTTO: sessioni (IndexedDB) + impostazioni (localStorage),
// in un unico file JSON scaricabile.

function dbExportAll() {
  return dbGetAllSessions().then(function (sessions) {
    const backup = {
      app: 'RangeTrainer',
      exportedAt: new Date().toISOString(),
      sessions: sessions,
      settings: {
        weapons: loadData('rt_weapons', []),
        customExercises: loadData('rt_custom_exercises', []),
        parTimes: loadData('rt_partimes', {}),
        stages: loadData('rt_stages', []),
        accent: loadData('rt_accent', null)
      }
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)],
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rangetrainer-backup-' +
      new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function dbImportAll(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const backup = JSON.parse(reader.result);
        if (backup.app !== 'RangeTrainer') {
          reject(new Error('File non valido: non e\u2019 un backup RangeTrainer.'));
          return;
        }
        // Ripristina le impostazioni
        if (backup.settings) {
          saveData('rt_weapons', backup.settings.weapons || []);
          saveData('rt_custom_exercises', backup.settings.customExercises || []);
          saveData('rt_partimes', backup.settings.parTimes || {});
          saveData('rt_stages', backup.settings.stages || []);
          if (backup.settings.accent) {
            saveData('rt_accent', backup.settings.accent);
          }
        }
        // Ripristina le sessioni (aggiunte a quelle esistenti)
        const sessions = backup.sessions || [];
        let chain = Promise.resolve();
        sessions.forEach(function (s) {
          delete s.id; // l'id viene riassegnato dal database
          chain = chain.then(function () { return dbSaveSession(s); });
        });
        chain.then(resolve).catch(reject);
      } catch (e) {
        reject(new Error('File non leggibile: ' + e.message));
      }
    };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsText(file);
  });
}
