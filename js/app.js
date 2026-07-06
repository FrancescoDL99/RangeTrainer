// ============================================================
// app.js — Navigazione, sessioni, impostazioni
// ============================================================

// ---------- Colore principale ----------

function applyAccentColor(color) {
  document.documentElement.style.setProperty('--accent', color);
  // Versione leggermente piu' scura per l'effetto pressione
  document.documentElement.style.setProperty('--accent-press', darkenColor(color, 0.12));
}

function darkenColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function loadAccentColor() {
  const saved = loadData('rt_accent', null);
  if (saved !== null) applyAccentColor(saved);
}

// ---------- Navigazione ----------

function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.classList.remove('active');
  });
  const target = document.getElementById('screen-' + screenId);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

function bindNavigation() {
  // Ascolto sul documento intero: funziona anche per pulsanti
  // creati dopo l'avvio (es. la freccia dello Stage Designer)
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-goto]');
    if (!btn) return;
    const dest = btn.getAttribute('data-goto');
    if (dest === 'stage-designer') {
      buildStageDesignerScreen();
      resetStageEditor();
    }
    if (dest === 'history') {
      buildHistoryScreen();
      renderHistory();
    }
    if (dest === 'stats') {
      buildStatsScreen();
      refreshStats();
    }
    if (dest === 'shottimer') {
      buildShotTimerScreen();
      populateShotTimerSetup();
    }
    goTo(dest);
  });
}

// ============================================================
// SETUP SESSIONE DRY-FIRE
// ============================================================

const session = {
  weaponId: null,
  mode: 'simple',        // 'simple' oppure 'stage'
  exerciseId: null,      // per mode simple
  stageId: null,         // per mode stage
  parTime: 2.0,
  delayMin: 2,
  delayMax: 4,
  threshold: 5,
  reductionPct: 5,
  streak: 0,
  runner: null,          // oggetto restituito da runBeepSequence
  stage: null,           // copia dello stage in esecuzione
  phaseResults: []       // ✓/✗ del riepilogo drill
};

function populateSetupScreen() {
  // Armi
  const wSel = document.getElementById('setup-weapon');
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

  // Esercizi semplici + stage salvati, in un unico menu con gruppi
  const eSel = document.getElementById('setup-exercise');
  eSel.innerHTML = '';

  const gSimple = document.createElement('optgroup');
  gSimple.label = 'Esercizi semplici';
  getAllExercises().forEach(function (e) {
    const opt = document.createElement('option');
    opt.value = 'simple|' + e.id;
    opt.textContent = e.name;
    gSimple.appendChild(opt);
  });
  eSel.appendChild(gSimple);

  const stages = getSavedStages();
  if (stages.length > 0) {
    const gStage = document.createElement('optgroup');
    gStage.label = 'Stage (drill multi-fase)';
    stages.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = 'stage|' + s.id;
      opt.textContent = s.name + ' (' + s.phases.length + ' fasi)';
      gStage.appendChild(opt);
    });
    eSel.appendChild(gStage);
  }

  eSel.addEventListener('change', onExerciseSelectionChange);
  onExerciseSelectionChange();
}

// Il campo par time si comporta diversamente nei due casi:
// - esercizio semplice: modificabile, precompilato con l'ultimo valore salvato
// - stage: nascosto, perche' ogni fase ha gia' il suo par time
function onExerciseSelectionChange() {
  const eSel = document.getElementById('setup-exercise');
  const ptField = document.getElementById('setup-partime').closest('.field');
  const info = document.getElementById('exercise-info');

  if (eSel.value.indexOf('stage|') === 0) {
    ptField.classList.add('hidden');
    info.classList.add('hidden');
    return;
  }

  ptField.classList.remove('hidden');
  prefillParTime();

  // Scheda illustrativa per gli esercizi predefiniti
  const exId = eSel.value.split('|')[1];
  const ex = DEFAULT_EXERCISES.find(function (e) { return e.id === exId; });
  if (ex && ex.icon) {
    info.classList.remove('hidden');
    document.getElementById('exercise-desc').textContent = ex.desc;
    drawExerciseIcon(document.getElementById('exercise-icon'), ex.icon);
  } else {
    info.classList.add('hidden');
  }
}

function prefillParTime() {
  const wSel = document.getElementById('setup-weapon');
  const eSel = document.getElementById('setup-exercise');
  if (!wSel.value || !eSel.value) return;
  const exId = eSel.value.split('|')[1];
  const saved = getSavedParTime(wSel.value, exId);
  if (saved !== null) {
    document.getElementById('setup-partime').value = saved;
  }
}

function onStartSession() {
  const wSel = document.getElementById('setup-weapon');
  if (!wSel.value) {
    alert('Aggiungi prima un\u2019arma nelle Impostazioni.');
    return;
  }
  const eSel = document.getElementById('setup-exercise');
  const parts = eSel.value.split('|');

  session.weaponId = wSel.value;
  session.mode = parts[0];
  session.delayMin = parseFloat(document.getElementById('setup-delay-min').value) || 2;
  session.delayMax = parseFloat(document.getElementById('setup-delay-max').value) || 4;
  if (session.delayMax < session.delayMin) session.delayMax = session.delayMin;
  session.threshold = parseInt(document.getElementById('setup-threshold').value, 10) || 5;
  session.reductionPct = parseInt(document.getElementById('setup-reduction').value, 10) || 5;
  session.streak = 0;

  if (session.mode === 'simple') {
    session.exerciseId = parts[1];
    session.parTime = parseFloat(document.getElementById('setup-partime').value) || 2.0;
    startSimpleSession();
  } else {
    session.stageId = parts[1];
    session.stage = JSON.parse(JSON.stringify(
      getSavedStages().find(function (s) { return s.id === session.stageId; })
    ));
    startStageSession();
  }
}

// ============================================================
// SESSIONE ESERCIZIO SEMPLICE
// ============================================================

function startSimpleSession() {
  goTo('session');
  document.getElementById('session-canvas-wrap').classList.add('hidden');
  updateSimpleSessionInfo('Premi VIA quando sei pronto');
  showRunButton(true);
  showResultButtons(false);
}

function updateSimpleSessionInfo(statusText) {
  document.getElementById('session-status').textContent = statusText;
  document.getElementById('session-partime').textContent =
    'Par time: ' + session.parTime.toFixed(2) + ' s';
  document.getElementById('session-streak').textContent =
    'Successi consecutivi: ' + session.streak + ' / ' + session.threshold;
}

function showRunButton(visible) {
  document.getElementById('session-controls').classList.toggle('hidden', !visible);
}

function showResultButtons(visible) {
  document.getElementById('session-result').classList.toggle('hidden', !visible);
}

function onRun() {
  if (session.mode === 'simple') {
    runSimpleRep();
  } else {
    runStageDrill();
  }
}

function runSimpleRep() {
  showRunButton(false);
  session.runner = runBeepSequence(
    [{ parTime: session.parTime, toneId: 'B' }],
    session.delayMin, session.delayMax, 'A',
    {
      onWaiting: function () { updateSimpleSessionInfo('Attendi il beep...'); },
      onStart: function () { updateSimpleSessionInfo('VIA!'); },
      onFinished: function () {
        updateSimpleSessionInfo('Sei rientrato nel par time?');
        showResultButtons(true);
      }
    }
  );
}

function onSimpleResult(success) {
  showResultButtons(false);
  // Salvataggio della ripetizione nello storico
  const weapons = getWeapons();
  const weapon = weapons.find(function (w) { return w.id === session.weaponId; });
  const exercise = getAllExercises().find(function (e) { return e.id === session.exerciseId; });
  dbSaveSession({
    date: Date.now(),
    type: 'simple',
    weaponId: session.weaponId,
    weaponName: weapon ? weapon.name : '?',
    exerciseKey: session.exerciseId,
    exerciseName: exercise ? exercise.name : '?',
    parTime: session.parTime,
    success: success
  });
  if (success) {
    session.streak++;
    if (session.streak >= session.threshold) {
      proposeReduction();
      return;
    }
  } else {
    session.streak = 0;
  }
  updateSimpleSessionInfo('Premi VIA per la prossima ripetizione');
  showRunButton(true);
}

function proposeReduction() {
  const newPar = session.parTime * (1 - session.reductionPct / 100);
  const ok = confirm(
    'Hai raggiunto ' + session.threshold + ' successi consecutivi!\n' +
    'Vuoi ridurre il par time da ' + session.parTime.toFixed(2) +
    ' s a ' + newPar.toFixed(2) + ' s?'
  );
  if (ok) {
    session.parTime = Math.round(newPar * 100) / 100;
    saveParTime(session.weaponId, session.exerciseId, session.parTime);
  }
  session.streak = 0;
  updateSimpleSessionInfo('Premi VIA per la prossima ripetizione');
  showRunButton(true);
}

// ============================================================
// SESSIONE DRILL (STAGE)
// ============================================================

function startStageSession() {
  goTo('session');
  document.getElementById('session-canvas-wrap').classList.remove('hidden');
  drawSessionStage(null); // null = mostra solo oggetti sempre visibili
  document.getElementById('session-status').textContent =
    session.stage.name + ' - Premi VIA quando sei pronto';
  document.getElementById('session-partime').textContent =
    session.stage.phases.length + ' fasi';
  document.getElementById('session-streak').textContent = '';
  showRunButton(true);
  showResultButtons(false);
}

// Disegna lo stage sul canvas della sessione.
// elapsedSeconds = null: solo oggetti senza evento temporizzato.
// Altrimenti mostra anche gli oggetti il cui appearAt e' passato.
function drawSessionStage(elapsedSeconds) {
  const canvas = document.getElementById('session-canvas');
  const savedCanvas = stageEditor.canvas;
  const savedCtx = stageEditor.ctx;
  const savedObjects = stageEditor.objects;
  const savedSelected = stageEditor.selectedId;

  stageEditor.canvas = canvas;
  stageEditor.ctx = canvas.getContext('2d');
  stageEditor.objects = session.stage.objects;
  stageEditor.selectedId = null;

  drawStage(function (o) {
    if (o.appearAt === null) return true;
    if (elapsedSeconds === null) return false;
    return elapsedSeconds >= o.appearAt;
  });

  stageEditor.canvas = savedCanvas;
  stageEditor.ctx = savedCtx;
  stageEditor.objects = savedObjects;
  stageEditor.selectedId = savedSelected;
}

let stageAnimationTimer = null;

function runStageDrill() {
  showRunButton(false);
  const phases = session.stage.phases.map(function (p) {
    return { parTime: p.parTime, toneId: p.toneId };
  });

  session.runner = runBeepSequence(
    phases, session.delayMin, session.delayMax, 'A',
    {
      onWaiting: function () {
        document.getElementById('session-status').textContent = 'Attendi il beep...';
        drawSessionStage(null);
      },
      onStart: function () {
        document.getElementById('session-status').textContent = 'VIA!';
        startStageAnimation();
      },
      onPhaseBeep: function (index) {
        const total = session.stage.phases.length;
        if (index < total - 1) {
          document.getElementById('session-status').textContent =
            'Fase ' + (index + 2) + ' di ' + total;
        }
      },
      onFinished: function () {
        stopStageAnimation();
        showDrillSummary();
      }
    }
  );
}

// Animazione: ridisegna il canvas 10 volte al secondo durante il drill,
// cosi' gli oggetti con "appare al secondo" compaiono al momento giusto.
function startStageAnimation() {
  const startedAt = Date.now();
  stageAnimationTimer = setInterval(function () {
    const elapsed = (Date.now() - startedAt) / 1000;
    drawSessionStage(elapsed);
  }, 100);
}

function stopStageAnimation() {
  if (stageAnimationTimer !== null) {
    clearInterval(stageAnimationTimer);
    stageAnimationTimer = null;
  }
}

// ---------- Riepilogo drill ----------

function showDrillSummary() {
  goTo('drill-summary');
  session.phaseResults = session.stage.phases.map(function () { return null; });

  const list = document.getElementById('summary-phases-list');
  list.innerHTML = '';

  session.stage.phases.forEach(function (phase, index) {
    const li = document.createElement('li');
    li.className = 'summary-phase';

    const label = document.createElement('span');
    label.textContent = (index + 1) + '. ' +
      (phase.description || 'Fase ' + (index + 1)) +
      ' (' + phase.parTime.toFixed(2) + ' s)';

    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';

    const yes = document.createElement('button');
    yes.className = 'btn-mini btn-yes';
    yes.innerHTML = '&#10003;';
    const no = document.createElement('button');
    no.className = 'btn-mini btn-no';
    no.innerHTML = '&#10007;';

    yes.addEventListener('click', function () {
      session.phaseResults[index] = true;
      yes.classList.add('chosen'); no.classList.remove('chosen');
      checkSummaryComplete();
    });
    no.addEventListener('click', function () {
      session.phaseResults[index] = false;
      no.classList.add('chosen'); yes.classList.remove('chosen');
      checkSummaryComplete();
    });

    buttons.appendChild(yes);
    buttons.appendChild(no);
    li.appendChild(label);
    li.appendChild(buttons);
    list.appendChild(li);
  });

  document.getElementById('btn-confirm-summary').disabled = true;
}

function checkSummaryComplete() {
  const complete = session.phaseResults.every(function (r) { return r !== null; });
  document.getElementById('btn-confirm-summary').disabled = !complete;
}

function onConfirmSummary() {
  // Riduzione par time per singola fase (spec 3.2):
  // ogni fase ha il proprio contatore di successi consecutivi,
  // salvato dentro lo stage stesso.
  const stages = getSavedStages();
  const stored = stages.find(function (s) { return s.id === session.stageId; });

  let reductions = [];
  session.stage.phases.forEach(function (phase, i) {
    const storedPhase = stored.phases[i];
    if (storedPhase.streak === undefined) storedPhase.streak = 0;

    if (session.phaseResults[i]) {
      storedPhase.streak++;
      if (storedPhase.streak >= session.threshold) {
        const newPar = Math.round(storedPhase.parTime * (1 - session.reductionPct / 100) * 100) / 100;
        reductions.push('Fase ' + (i + 1) + ': ' +
          storedPhase.parTime.toFixed(2) + ' s -> ' + newPar.toFixed(2) + ' s');
        storedPhase.parTime = newPar;
        storedPhase.streak = 0;
      }
    } else {
      storedPhase.streak = 0;
    }
  });

  saveStage(stored);
  // Salvataggio del drill nello storico
  const weapons2 = getWeapons();
  const weapon2 = weapons2.find(function (w) { return w.id === session.weaponId; });
  dbSaveSession({
    date: Date.now(),
    type: 'stage',
    weaponId: session.weaponId,
    weaponName: weapon2 ? weapon2.name : '?',
    exerciseKey: session.stageId,
    exerciseName: session.stage.name,
    phases: session.stage.phases.map(function (p, i) {
      return {
        description: p.description,
        parTime: p.parTime,
        success: session.phaseResults[i]
      };
    }),
    success: session.phaseResults.every(function (r) { return r === true; })
  });

  const allOk = session.phaseResults.every(function (r) { return r === true; });
  let message = allOk ? 'Drill riuscito!' : 'Drill non completato.';
  if (reductions.length > 0) {
    message += '\n\nPar time ridotti:\n' + reductions.join('\n');
  }
  alert(message);
  goTo('home');
}

// ---------- Fine sessione ----------

function onEndSession() {
  if (session.runner) {
    session.runner.cancel();
    session.runner = null;
  }
  stopStageAnimation();
  goTo('home');
}

// ============================================================
// IMPOSTAZIONI
// ============================================================

function renderWeaponsList() {
  const list = document.getElementById('weapons-list');
  list.innerHTML = '';
  getWeapons().forEach(function (w) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = w.name;
    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.innerHTML = '&#10007;';
    del.addEventListener('click', function () {
      if (confirm('Eliminare ' + w.name + '?')) {
        deleteWeapon(w.id);
        renderWeaponsList();
      }
    });
    li.appendChild(span);
    li.appendChild(del);
    list.appendChild(li);
  });
}

function renderExercisesList() {
  const list = document.getElementById('exercises-list');
  list.innerHTML = '';
  getCustomExercises().forEach(function (e) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = e.name;
    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.innerHTML = '&#10007;';
    del.addEventListener('click', function () {
      if (confirm('Eliminare ' + e.name + '?')) {
        deleteCustomExercise(e.id);
        renderExercisesList();
      }
    });
    li.appendChild(span);
    li.appendChild(del);
    list.appendChild(li);
  });
}

function renderStagesList() {
  const list = document.getElementById('stages-list');
  list.innerHTML = '';
  getSavedStages().forEach(function (s) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = s.name;

    const actions = document.createElement('div');

    const edit = document.createElement('button');
    edit.className = 'btn-small';
    edit.textContent = 'Modifica';
    edit.addEventListener('click', function () {
      buildStageDesignerScreen();
      loadStageIntoEditor(s.id);
      goTo('stage-designer');
    });

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.innerHTML = '&#10007;';
    del.addEventListener('click', function () {
      if (confirm('Eliminare lo stage ' + s.name + '?')) {
        deleteStage(s.id);
        renderStagesList();
      }
    });

    actions.appendChild(edit);
    actions.appendChild(del);
    li.appendChild(span);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function bindSettings() {
  document.getElementById('btn-add-weapon').addEventListener('click', function () {
    const input = document.getElementById('new-weapon-name');
    const name = input.value.trim();
    if (name === '') return;
    addWeapon(name);
    input.value = '';
    renderWeaponsList();
  });

  document.getElementById('btn-add-exercise').addEventListener('click', function () {
    const input = document.getElementById('new-exercise-name');
    const name = input.value.trim();
    if (name === '') return;
    addCustomExercise(name);
    input.value = '';
    renderExercisesList();
  });

  document.getElementById('btn-export').addEventListener('click', function () {
    dbExportAll().catch(function (e) {
      alert('Errore durante l\u2019export: ' + e.message);
    });
  });

  document.getElementById('import-file').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Importare il backup? Le impostazioni attuali verranno sovrascritte, le sessioni verranno aggiunte allo storico.')) {
      e.target.value = '';
      return;
    }
    dbImportAll(file).then(function () {
      alert('Backup importato correttamente.');
      location.reload();
    }).catch(function (err) {
      alert('Errore: ' + err.message);
    });
    e.target.value = '';
  });
  const colorInput = document.getElementById('accent-color-picker');
  colorInput.value = loadData('rt_accent', '#ff6a00');
  colorInput.addEventListener('input', function () {
    applyAccentColor(colorInput.value);
    saveData('rt_accent', colorInput.value);
  });
}

// ============================================================
// AVVIO APP
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  loadAccentColor();
  bindNavigation();
  bindSettings();
  renderWeaponsList();
  renderExercisesList();
  renderStagesList();

  // Ogni volta che si entra nel setup, ripopola i menu
  document.querySelectorAll('[data-goto="setup-dryfire"]').forEach(function (btn) {
    btn.addEventListener('click', populateSetupScreen);
  });
  // Idem per la lista stage nelle impostazioni
  document.querySelectorAll('[data-goto="settings"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      renderWeaponsList();
      renderExercisesList();
      renderStagesList();
    });
  });

  document.getElementById('btn-start-session').addEventListener('click', onStartSession);
  document.getElementById('btn-run').addEventListener('click', onRun);
  document.getElementById('btn-success').addEventListener('click', function () { onSimpleResult(true); });
  document.getElementById('btn-fail').addEventListener('click', function () { onSimpleResult(false); });
  document.getElementById('btn-end-session').addEventListener('click', onEndSession);
  document.getElementById('btn-confirm-summary').addEventListener('click', onConfirmSummary);
  document.getElementById('setup-weapon').addEventListener('change', prefillParTime);
});
