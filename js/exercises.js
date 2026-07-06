// ============================================================
// exercises.js — Dati: armi, esercizi, par time salvati
// ============================================================

// Esercizi predefiniti (dalla specifica: presentazione, transizioni, ricarica a vuoto)
const DEFAULT_EXERCISES = [
  { id: 'presentazione', name: 'Presentazione' },
  { id: 'transizioni', name: 'Transizioni' },
  { id: 'ricarica', name: 'Ricarica a vuoto' }
];

// Chiavi di salvataggio in localStorage
const STORAGE_KEYS = {
  weapons: 'rt_weapons',
  customExercises: 'rt_custom_exercises',
  parTimes: 'rt_partimes'
};

// ---------- Funzioni generiche di lettura/scrittura ----------

function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- Armi ----------

function getWeapons() {
  return loadData(STORAGE_KEYS.weapons, []);
}

function addWeapon(name) {
  const weapons = getWeapons();
  const id = 'w_' + Date.now();
  weapons.push({ id: id, name: name });
  saveData(STORAGE_KEYS.weapons, weapons);
}

function deleteWeapon(id) {
  const weapons = getWeapons().filter(function (w) { return w.id !== id; });
  saveData(STORAGE_KEYS.weapons, weapons);
}

// ---------- Esercizi ----------

function getCustomExercises() {
  return loadData(STORAGE_KEYS.customExercises, []);
}

function getAllExercises() {
  return DEFAULT_EXERCISES.concat(getCustomExercises());
}

function addCustomExercise(name) {
  const custom = getCustomExercises();
  const id = 'e_' + Date.now();
  custom.push({ id: id, name: name });
  saveData(STORAGE_KEYS.customExercises, custom);
}

function deleteCustomExercise(id) {
  const custom = getCustomExercises().filter(function (e) { return e.id !== id; });
  saveData(STORAGE_KEYS.customExercises, custom);
}

// ---------- Par time salvati ----------
// Il par time corrente viene ricordato per ogni combinazione arma + esercizio,
// cosi' alla sessione successiva si riparte da dove si era arrivati.

function parTimeKey(weaponId, exerciseId) {
  return weaponId + '|' + exerciseId;
}

function getSavedParTime(weaponId, exerciseId) {
  const parTimes = loadData(STORAGE_KEYS.parTimes, {});
  const key = parTimeKey(weaponId, exerciseId);
  if (parTimes[key] !== undefined) {
    return parTimes[key];
  }
  return null;
}

function saveParTime(weaponId, exerciseId, value) {
  const parTimes = loadData(STORAGE_KEYS.parTimes, {});
  parTimes[parTimeKey(weaponId, exerciseId)] = value;
  saveData(STORAGE_KEYS.parTimes, parTimes);
}
