// ============================================================
// exercises.js — Dati: armi, esercizi, par time salvati
// ============================================================

// Esercizi predefiniti: i classici del dry-fire training.
// Ogni esercizio ha una descrizione e una grafica illustrativa
// (disegnata dalla funzione drawExerciseIcon in fondo al file).

const DEFAULT_EXERCISES = [
  {
    id: 'presentazione',
    name: 'Presentazione (draw)',
    desc: 'Dal fodero alla mira sul bersaglio. Al beep: estrai, presenta e premi a secco mantenendo le mire allineate. L\u2019esercizio fondamentale.',
    icon: 'draw'
  },
  {
    id: 'wall_drill',
    name: 'Wall drill (trigger control)',
    desc: 'Mira a una parete vuota a pochi centimetri. Premi il grilletto a secco: le mire non devono muoversi. Puro controllo dello scatto, senza bersaglio.',
    icon: 'trigger'
  },
  {
    id: 'transizioni',
    name: 'Transizioni',
    desc: 'Due o piu\u2019 bersagli distanziati. Al beep: scatto a secco sul primo, transizione veloce con gli occhi che guidano l\u2019arma, scatto sul secondo.',
    icon: 'transition'
  },
  {
    id: 'ricarica',
    name: 'Ricarica a vuoto',
    desc: 'In mira con caricatore vuoto inserito. Al beep: sgancio, inserimento del nuovo caricatore (scarico) e ritorno in mira con scatto a secco.',
    icon: 'reload'
  },
  {
    id: 'presentazione_ricarica',
    name: 'Draw + ricarica',
    desc: 'Combinazione: estrazione, scatto a secco, ricarica e secondo scatto. Allena la sequenza completa piu\u2019 comune in gara.',
    icon: 'draw_reload'
  },
  {
    id: 'el_presidente',
    name: 'El Presidente (dry)',
    desc: 'Il classico di Jeff Cooper: spalle ai bersagli, al beep giri, estrai, 2 scatti su 3 bersagli, ricarica, altri 2 per bersaglio. In dry-fire si esegue la sequenza completa a secco.',
    icon: 'elpres'
  },
  {
    id: 'bill_drill',
    name: 'Bill Drill (dry)',
    desc: 'Estrazione e 6 azionamenti rapidi sullo stesso bersaglio mantenendo le mire in zona A. Con arma a doppia azione o con reset manuale tra i colpi.',
    icon: 'bill'
  },
  {
    id: 'failure_drill',
    name: 'Failure drill / Mozambique',
    desc: '2 scatti rapidi al centro sagoma, poi 1 mirato in testa. Allena il cambio di ritmo tra velocita\u2019 e precisione sullo stesso bersaglio.',
    icon: 'failure'
  },
  {
    id: 'sul_ready',
    name: 'Dal ready (low/high)',
    desc: 'Arma gia\u2019 in mano in posizione ready (bassa o alta). Al beep: sali in mira e scatto a secco. Isola la presentazione senza l\u2019estrazione.',
    icon: 'ready'
  },
  {
    id: 'mano_debole',
    name: 'Mano forte / mano debole',
    desc: 'Presentazione e scatto a secco usando una sola mano, prima la forte poi la debole. Fondamentale per completezza e richiesto in molte gare.',
    icon: 'onehand'
  }
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

// ============================================================
// GRAFICA ILLUSTRATIVA DEGLI ESERCIZI
// ============================================================
// Disegna l'illustrazione dell'esercizio su un canvas 300x150.
// Stile: stick figure e sagome stilizzate nel colore del tema.

function drawExerciseIcon(canvas, iconId) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim() || '#ff6a00';
  const dim = '#777777';

  // --- elementi riutilizzabili ---

  // Omino stilizzato visto di lato, con o senza braccia in mira
  function shooter(x, y, aiming, armAngle) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // testa
    ctx.beginPath(); ctx.arc(x, y - 34, 7, 0, Math.PI * 2); ctx.stroke();
    // corpo
    ctx.beginPath(); ctx.moveTo(x, y - 27); ctx.lineTo(x, y); ctx.stroke();
    // gambe
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 22);
    ctx.moveTo(x, y); ctx.lineTo(x + 8, y + 22);
    ctx.stroke();
    // braccia
    ctx.beginPath();
    if (aiming) {
      const a = armAngle === undefined ? 0 : armAngle;
      ctx.moveTo(x, y - 22);
      ctx.lineTo(x + 24 * Math.cos(a), y - 22 + 24 * Math.sin(a));
    } else {
      ctx.moveTo(x, y - 22); ctx.lineTo(x + 6, y - 4); // braccio al fianco/fondina
    }
    ctx.stroke();
  }

  // Mini sagoma bersaglio
  function target(x, y, s) {
    if (s === undefined) s = 1;
    ctx.fillStyle = dim;
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y + 20 * s); ctx.lineTo(x - 10 * s, y - 5 * s);
    ctx.lineTo(x - 5 * s, y - 15 * s); ctx.lineTo(x + 5 * s, y - 15 * s);
    ctx.lineTo(x + 10 * s, y - 5 * s); ctx.lineTo(x + 10 * s, y + 20 * s);
    ctx.closePath(); ctx.fill();
  }

  // Freccia
  function arrow(x1, y1, x2, y2) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 9 * Math.cos(ang - 0.4), y2 - 9 * Math.sin(ang - 0.4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 9 * Math.cos(ang + 0.4), y2 - 9 * Math.sin(ang + 0.4));
    ctx.stroke();
  }

  // Caricatore
  function magazine(x, y) {
    ctx.fillStyle = accent;
    ctx.fillRect(x - 5, y - 12, 10, 24);
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';

  // --- illustrazioni ---
  switch (iconId) {

    case 'draw':
      shooter(70, 100, false);
      arrow(85, 80, 120, 70);
      shooter(170, 100, true);
      target(255, 80);
      break;

    case 'trigger':
      shooter(100, 100, true);
      // parete
      ctx.fillStyle = dim;
      ctx.fillRect(160, 20, 8, 115);
      ctx.fillStyle = accent;
      ctx.fillText('mire ferme', 220, 75);
      break;

    case 'transition':
      shooter(60, 105, true, -0.15);
      target(180, 60, 0.9);
      target(255, 95, 0.9);
      arrow(190, 45, 245, 72);
      break;

    case 'reload':
      shooter(90, 100, true);
      magazine(170, 100);
      arrow(170, 85, 135, 70);
      break;

    case 'draw_reload':
      shooter(55, 100, false);
      arrow(70, 80, 95, 72);
      shooter(125, 100, true);
      magazine(190, 105);
      arrow(190, 90, 155, 75);
      target(260, 80);
      break;

    case 'elpres':
      // Tiratore girato di spalle (freccia di rotazione) + 3 bersagli
      shooter(60, 105, false);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(60, 65, 20, -Math.PI * 0.2, Math.PI * 0.9);
      ctx.stroke();
      target(170, 80, 0.85);
      target(215, 80, 0.85);
      target(260, 80, 0.85);
      break;

    case 'bill':
      shooter(80, 100, true);
      target(230, 80, 1.2);
      ctx.fillStyle = accent;
      ctx.fillText('x6', 230, 130);
      break;

    case 'failure':
      shooter(70, 100, true);
      target(230, 80, 1.3);
      // 2 colpi corpo + 1 testa
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(224, 85, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(236, 90, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(230, 63, 3.5, 0, Math.PI * 2); ctx.fill();
      break;

    case 'ready':
      shooter(80, 100, true, 0.5);  // braccia abbassate a 45 gradi
      arrow(115, 95, 130, 78);
      target(230, 80);
      break;

    case 'onehand':
      shooter(90, 100, true);
      ctx.fillStyle = accent;
      ctx.fillText('1 mano', 90, 140);
      target(230, 80);
      break;
  }
}
