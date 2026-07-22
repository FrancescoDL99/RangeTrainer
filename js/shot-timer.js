// ============================================================
// shot-timer.js — Modulo 2: rilevazione spari via microfono
// ============================================================

const shotTimer = {
  stream: null,          // flusso del microfono
  analyser: null,        // analizzatore audio
  dataArray: null,
  threshold: 0.5,        // soglia di rilevazione (0..1)
  noiseFloor: 0,         // rumore di fondo misurato in calibrazione
  running: false,        // sessione in corso
  monitoring: false,     // loop di analisi attivo
  startTimeMs: 0,        // istante del beep di start
  shots: [],             // tempi dei colpi (secondi dal beep)
  lastShotMs: 0,         // per il tempo di mascheramento
  maskMs: 150,           // ignora picchi entro 150ms dal colpo precedente
  muteUntilMs: 0,        // finestra di silenzio durante i beep dell'app stessa
  weaponId: null,
  drillName: '',
  parTime: null,
  runner: null
};

// ---------- Accesso al microfono ----------

function openMicrophone() {
  if (shotTimer.stream !== null) return Promise.resolve();
  return navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  }}).then(function (stream) {
    shotTimer.stream = stream;
    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    shotTimer.analyser = ctx.createAnalyser();
    shotTimer.analyser.fftSize = 512;
    shotTimer.dataArray = new Uint8Array(shotTimer.analyser.fftSize);
    source.connect(shotTimer.analyser);
  });
}

function closeMicrophone() {
  if (shotTimer.stream !== null) {
    shotTimer.stream.getTracks().forEach(function (t) { t.stop(); });
    shotTimer.stream = null;
    shotTimer.analyser = null;
  }
  shotTimer.monitoring = false;
}

// Volume istantaneo del microfono, da 0 a 1
function currentLevel() {
  shotTimer.analyser.getByteTimeDomainData(shotTimer.dataArray);
  let peak = 0;
  for (let i = 0; i < shotTimer.dataArray.length; i++) {
    const v = Math.abs(shotTimer.dataArray[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return peak;
}

// ---------- Calibrazione ----------
// Ascolta il rumore di fondo per 3 secondi e propone una soglia:
// il picco di fondo misurato + un margine di sicurezza.

function calibrate(onProgress, onDone) {
  openMicrophone().then(function () {
    let maxLevel = 0;
    let elapsed = 0;
    const interval = setInterval(function () {
      const level = currentLevel();
      if (level > maxLevel) maxLevel = level;
      elapsed += 100;
      if (onProgress) onProgress(elapsed / 3000, level);
      if (elapsed >= 3000) {
        clearInterval(interval);
        shotTimer.noiseFloor = maxLevel;
        // Soglia: a meta' strada tra il rumore di fondo e il massimo,
        // mai sotto 0.25
        shotTimer.threshold = Math.min(0.99,
          Math.max(0.05, maxLevel + (1 - maxLevel) * 0.5));
        if (onDone) onDone(shotTimer.threshold);
      }
    }, 100);
  }).catch(function (err) {
    alert('Impossibile accedere al microfono: ' + err.message +
      '\nControlla i permessi del browser.');
  });
}

// ---------- Loop di rilevazione ----------

function startShotDetection() {
  shotTimer.monitoring = true;
  function loop() {
    if (!shotTimer.monitoring) return;
    if (shotTimer.running) {
      const level = currentLevel();
      const nowMs = performance.now();
      if (level >= shotTimer.threshold &&
          nowMs - shotTimer.lastShotMs > shotTimer.maskMs &&
          nowMs >= shotTimer.muteUntilMs) {
        shotTimer.lastShotMs = nowMs;
        const t = (nowMs - shotTimer.startTimeMs) / 1000;
        if (t > 0) {
          shotTimer.shots.push(Math.round(t * 100) / 100);
          renderLiveShots();
        }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ============================================================
// SCHERMATA SHOT TIMER
// ============================================================

function buildShotTimerScreen() {
  if (document.getElementById('screen-shottimer')) return;

  const div = document.createElement('div');
  div.id = 'screen-shottimer';
  div.className = 'screen';
  div.innerHTML = [
    '<header class="app-header">',
    '  <button class="btn-back" data-goto="home" id="st-back">&#8592;</button>',
    '  <h2>Shot Timer</h2>',
    '</header>',
    '<main class="form-page" id="st-setup">',
    '  <label class="field">',
    '    <span class="field-label">Arma</span>',
    '    <select id="st-weapon"></select>',
    '  </label>',
    '  <label class="field">',
    '    <span class="field-label">Nome del drill</span>',
    '    <input type="text" id="st-drill" placeholder="Es. Bill Drill 7 metri">',
    '  </label>',
    '  <label class="field">',
    '    <span class="field-label">Par time opzionale (secondi, vuoto = nessuno)</span>',
    '    <input type="number" id="st-partime" step="0.1" min="0.5" inputmode="decimal" placeholder="Nessuno">',
    '  </label>',
    '  <label class="field">',
    '    <span class="field-label">Delay randomico (min-max secondi)</span>',
    '    <div class="field-row">',
    '      <input type="number" id="st-delay-min" step="0.5" min="1" value="2" inputmode="decimal">',
    '      <input type="number" id="st-delay-max" step="0.5" min="1" value="4" inputmode="decimal">',
    '    </div>',
    '  </label>',
    '  <section class="settings-section">',
    '    <h3>Calibrazione microfono</h3>',
    '    <button id="st-calibrate" class="btn-small">Calibra (3 secondi di silenzio... o rumore di fondo)</button>',
    '    <div id="st-cal-status" class="st-cal-status"></div>',
    '    <label class="field">',
    '      <span class="field-label">Sensibilita&#768; (soglia: <span id="st-threshold-val">0.50</span>)</span>',
    '      <input type="range" id="st-threshold" min="2" max="99" value="50">',
    '    </label>',
    '    <div class="st-level-bar"><div id="st-level-fill" class="st-level-fill"></div><div id="st-level-marker" class="st-level-marker"></div></div>',
    '  </section>',
    '  <button id="st-start" class="btn-primary">Inizia</button>',
    '</main>',
    '<main class="session-page hidden" id="st-session">',
    '  <div id="st-status" class="session-status">Pronto</div>',
    '  <div id="st-timer-display" class="st-timer-display">0.00</div>',
    '  <ul id="st-shots-list" class="st-shots-list"></ul>',
    '  <button id="st-stop" class="btn-big">STOP</button>',
    '</main>',
    '<main class="form-page hidden" id="st-review">',
    '  <h3 class="stats-chart-title">Revisione colpi</h3>',
    '  <p class="summary-hint">Correggi eventuali errori del microfono: elimina i falsi positivi o aggiungi colpi mancati.</p>',
    '  <ul id="st-review-list" class="items-list"></ul>',
    '  <div class="field-row">',
    '    <input type="number" id="st-manual-time" step="0.01" min="0.01" inputmode="decimal" placeholder="Tempo colpo (s)">',
    '    <button id="st-add-shot" class="btn-small">Aggiungi</button>',
    '  </div>',
    '  <div id="st-review-summary" class="stats-summary"></div>',
    '  <button id="st-save" class="btn-primary">Salva sessione</button>',
    '  <button id="st-discard" class="btn-secondary">Scarta senza salvare</button>',
    '</main>'
  ].join('');
  document.body.appendChild(div);

  bindShotTimer();
}

function bindShotTimer() {
  // Popolamento armi ad ogni ingresso
  document.getElementById('st-calibrate').addEventListener('click', function () {
    const status = document.getElementById('st-cal-status');
    status.textContent = 'Calibrazione in corso...';
    calibrate(
      function (progress, level) {
        status.textContent = 'Calibrazione: ' + Math.round(progress * 100) + '%';
        updateLevelBar(level);
      },
      function (threshold) {
        status.textContent = 'Calibrazione completata. Rumore di fondo: ' +
          shotTimer.noiseFloor.toFixed(2) + ' - soglia proposta: ' + threshold.toFixed(2);
        document.getElementById('st-threshold').value = Math.round(threshold * 100);
        document.getElementById('st-threshold-val').textContent = threshold.toFixed(2);
        startLevelMonitor();
      }
    );
  });

  document.getElementById('st-threshold').addEventListener('input', function (e) {
    shotTimer.threshold = parseInt(e.target.value, 10) / 100;
    document.getElementById('st-threshold-val').textContent =
      shotTimer.threshold.toFixed(2);
    positionThresholdMarker();
  });

  document.getElementById('st-start').addEventListener('click', startShotTimerSession);
  document.getElementById('st-stop').addEventListener('click', stopShotTimerSession);
  document.getElementById('st-add-shot').addEventListener('click', addManualShot);
  document.getElementById('st-save').addEventListener('click', saveShotTimerSession);
  document.getElementById('st-discard').addEventListener('click', function () {
    if (confirm('Scartare la sessione senza salvarla?')) exitToShotTimerSetup();
  });
  document.getElementById('st-back').addEventListener('click', function () {
    closeMicrophone();
  });
}

// Barra del livello microfono in tempo reale (aiuta a regolare la soglia)
let levelMonitorActive = false;

function startLevelMonitor() {
  if (levelMonitorActive) return;
  levelMonitorActive = true;
  positionThresholdMarker();
  function loop() {
    if (!levelMonitorActive || shotTimer.analyser === null) {
      levelMonitorActive = false;
      return;
    }
    updateLevelBar(currentLevel());
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function updateLevelBar(level) {
  const fill = document.getElementById('st-level-fill');
  if (fill) fill.style.width = Math.round(level * 100) + '%';
}

function positionThresholdMarker() {
  const marker = document.getElementById('st-level-marker');
  if (marker) marker.style.left = Math.round(shotTimer.threshold * 100) + '%';
}

function populateShotTimerSetup() {
  const wSel = document.getElementById('st-weapon');
  wSel.innerHTML = '';
  const weapons = getWeapons();
  if (weapons.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nessuna arma - aggiungila nelle Impostazioni';
    wSel.appendChild(opt);
  } else {
    weapons.forEach(function (w) {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = w.name;
      wSel.appendChild(opt);
    });
  }
  document.getElementById('st-setup').classList.remove('hidden');
  document.getElementById('st-session').classList.add('hidden');
  document.getElementById('st-review').classList.add('hidden');
}

// ---------- Sessione ----------

let stDisplayTimer = null;

function startShotTimerSession() {
  const wSel = document.getElementById('st-weapon');
  if (!wSel.value) {
    alert('Aggiungi prima un\u2019arma nelle Impostazioni.');
    return;
  }
  if (shotTimer.analyser === null) {
    alert('Esegui prima la calibrazione del microfono.');
    return;
  }

  shotTimer.weaponId = wSel.value;
  shotTimer.drillName = document.getElementById('st-drill').value.trim() || 'Drill';
  const pt = document.getElementById('st-partime').value;
  shotTimer.parTime = pt === '' ? null : parseFloat(pt);
  const delayMin = parseFloat(document.getElementById('st-delay-min').value) || 2;
  let delayMax = parseFloat(document.getElementById('st-delay-max').value) || 4;
  if (delayMax < delayMin) delayMax = delayMin;

  shotTimer.shots = [];
  shotTimer.running = false;

  document.getElementById('st-setup').classList.add('hidden');
  document.getElementById('st-session').classList.remove('hidden');
  document.getElementById('st-shots-list').innerHTML = '';
  document.getElementById('st-timer-display').textContent = '0.00';

  const phases = shotTimer.parTime !== null ?
    [{ parTime: shotTimer.parTime, toneId: 'B' }] : [];

  shotTimer.runner = runBeepSequence(
    phases, delayMin, delayMax, 'A',
    {
      onWaiting: function () {
        document.getElementById('st-status').textContent = 'Attendi il beep...';
      },
     onStart: function () {
        document.getElementById('st-status').textContent = 'VIA!';
        shotTimer.startTimeMs = performance.now();
        shotTimer.lastShotMs = 0;
        // Silenzia il microfono per la durata del beep + un margine,
        // cosi' l'app non scambia il proprio bip per uno sparo
        shotTimer.muteUntilMs = performance.now() + 350;
        shotTimer.running = true;
        startDisplayTimer();
      },
      onPhaseBeep: function () {
        // Beep di par time (se impostato): stessa protezione
        shotTimer.muteUntilMs = performance.now() + 350;
      }
    }
  );

  startShotDetection();
}

function startDisplayTimer() {
  stDisplayTimer = setInterval(function () {
    const t = (performance.now() - shotTimer.startTimeMs) / 1000;
    document.getElementById('st-timer-display').textContent = t.toFixed(2);
  }, 50);
}

function renderLiveShots() {
  const list = document.getElementById('st-shots-list');
  list.innerHTML = '';
  shotTimer.shots.forEach(function (t, i) {
    const li = document.createElement('li');
    const split = i === 0 ? t : t - shotTimer.shots[i - 1];
    li.textContent = 'Colpo ' + (i + 1) + ': ' + t.toFixed(2) +
      ' s (split ' + split.toFixed(2) + ' s)';
    list.appendChild(li);
  });
}

function stopShotTimerSession() {
  shotTimer.running = false;
  shotTimer.monitoring = false;
  if (stDisplayTimer !== null) {
    clearInterval(stDisplayTimer);
    stDisplayTimer = null;
  }
  if (shotTimer.runner) {
    // Non usiamo runner.cancel() qui: chiuderebbe il contesto audio
    // che serve ancora al microfono. I beep sono comunque gia' passati.
    shotTimer.runner = null;
  }
  showShotReview();
}

// ---------- Revisione con fallback manuale ----------

function showShotReview() {
  document.getElementById('st-session').classList.add('hidden');
  document.getElementById('st-review').classList.remove('hidden');
  renderReviewList();
}

function renderReviewList() {
  shotTimer.shots.sort(function (a, b) { return a - b; });
  const list = document.getElementById('st-review-list');
  list.innerHTML = '';

  shotTimer.shots.forEach(function (t, i) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    const split = i === 0 ? t : t - shotTimer.shots[i - 1];
    span.textContent = 'Colpo ' + (i + 1) + ': ' + t.toFixed(2) +
      ' s (split ' + split.toFixed(2) + ' s)';
    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.innerHTML = '&#10007;';
    del.addEventListener('click', function () {
      shotTimer.shots.splice(i, 1);
      renderReviewList();
    });
    li.appendChild(span);
    li.appendChild(del);
    list.appendChild(li);
  });

  const summary = document.getElementById('st-review-summary');
  if (shotTimer.shots.length === 0) {
    summary.textContent = 'Nessun colpo registrato.';
  } else {
    const first = shotTimer.shots[0];
    const total = shotTimer.shots[shotTimer.shots.length - 1];
    summary.innerHTML =
      'Colpi: <b>' + shotTimer.shots.length + '</b><br>' +
      'First shot: <b>' + first.toFixed(2) + ' s</b><br>' +
      'Tempo totale: <b>' + total.toFixed(2) + ' s</b>' +
      (shotTimer.parTime !== null ?
        '<br>Par time: <b>' + shotTimer.parTime.toFixed(2) + ' s</b>' : '');
  }
}

function addManualShot() {
  const input = document.getElementById('st-manual-time');
  const t = parseFloat(input.value);
  if (isNaN(t) || t <= 0) return;
  shotTimer.shots.push(Math.round(t * 100) / 100);
  input.value = '';
  renderReviewList();
}

// ---------- Salvataggio ----------

function saveShotTimerSession() {
  if (shotTimer.shots.length === 0) {
    alert('Nessun colpo da salvare. Aggiungi almeno un colpo o scarta la sessione.');
    return;
  }
  const weapons = getWeapons();
  const weapon = weapons.find(function (w) { return w.id === shotTimer.weaponId; });
  const splits = shotTimer.shots.map(function (t, i) {
    return i === 0 ? t : Math.round((t - shotTimer.shots[i - 1]) * 100) / 100;
  });
  const total = shotTimer.shots[shotTimer.shots.length - 1];

  dbSaveSession({
    date: Date.now(),
    type: 'shottimer',
    weaponId: shotTimer.weaponId,
    weaponName: weapon ? weapon.name : '?',
    exerciseKey: 'st_' + shotTimer.drillName.toLowerCase().replace(/\s+/g, '_'),
    exerciseName: shotTimer.drillName,
    shots: shotTimer.shots,
    splits: splits,
    firstShot: shotTimer.shots[0],
    totalTime: total,
    parTime: shotTimer.parTime,
    success: shotTimer.parTime === null ? true : total <= shotTimer.parTime
  }).then(function () {
    alert('Sessione salvata.');
    exitToShotTimerSetup();
  });
}

function exitToShotTimerSetup() {
  populateShotTimerSetup();
}
