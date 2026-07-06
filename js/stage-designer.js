// ============================================================
// stage-designer.js — Editor grafico stage + sequenza fasi
// ============================================================

// ---------- Lettura del colore principale dal CSS ----------
// Il canvas non puo' usare direttamente le variabili CSS,
// quindi leggiamo il valore corrente di --accent quando serve.

function getAccentColor() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim() || '#ff6a00';
}

// ---------- Tipi di oggetto disponibili nella palette ----------

const STAGE_OBJECT_TYPES = [
  { type: 'ipsc',      name: 'Sagoma IPSC',   canShoot: true  },
  { type: 'idpa',      name: 'Sagoma IDPA',   canShoot: true  },
  { type: 'plate',     name: 'Piattello',     canShoot: true  },
  { type: 'popper',    name: 'Popper',        canShoot: true  },
  { type: 'noshoot',   name: 'No-shoot',      canShoot: false },
  { type: 'barricade', name: 'Barricata',     canShoot: false },
  { type: 'start',     name: 'Partenza',      canShoot: false },
  { type: 'move',      name: 'Movimento',     canShoot: false }
];

// ---------- Stato dell'editor ----------

const stageEditor = {
  objects: [],        // oggetti sul canvas
  phases: [],         // fasi della sequenza
  selectedId: null,   // oggetto attualmente selezionato
  stageName: '',
  canvas: null,
  ctx: null,
  dragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  nextObjectId: 1
};

// ---------- Salvataggio layout (localStorage, chiave rt_stages) ----------

function getSavedStages() {
  return loadData('rt_stages', []);
}

function saveStage(stage) {
  const stages = getSavedStages();
  const existing = stages.findIndex(function (s) { return s.id === stage.id; });
  if (existing >= 0) {
    stages[existing] = stage;
  } else {
    stages.push(stage);
  }
  saveData('rt_stages', stages);
}

function deleteStage(stageId) {
  const stages = getSavedStages().filter(function (s) { return s.id !== stageId; });
  saveData('rt_stages', stages);
}

// ============================================================
// COSTRUZIONE DELLA SCHERMATA (creata dinamicamente)
// ============================================================

function buildStageDesignerScreen() {
  if (document.getElementById('screen-stage-designer')) return;

  const div = document.createElement('div');
  div.id = 'screen-stage-designer';
  div.className = 'screen';
  div.innerHTML = [
    '<header class="app-header">',
    '  <button class="btn-back" data-goto="home">&#8592;</button>',
    '  <h2>Stage Designer</h2>',
    '</header>',
    '<main class="designer-page">',

    '  <label class="field">',
    '    <span class="field-label">Nome dello stage</span>',
    '    <input type="text" id="sd-stage-name" placeholder="Es. Stage 1 - El Presidente">',
    '  </label>',

    '  <div class="sd-palette" id="sd-palette"></div>',

    '  <canvas id="sd-canvas" width="700" height="500"></canvas>',

    '  <div id="sd-object-panel" class="sd-object-panel hidden">',
    '    <div class="sd-panel-row">',
    '      <span id="sd-obj-name" class="sd-obj-name"></span>',
    '      <button id="sd-obj-delete" class="btn-small btn-delete-obj">Elimina oggetto</button>',
    '    </div>',
    '    <label class="field">',
    '      <span class="field-label">Dimensione (distanza simulata)</span>',
    '      <input type="range" id="sd-obj-scale" min="30" max="200" value="100">',
    '    </label>',
    '    <label class="field">',
    '      <span class="field-label">Rotazione</span>',
    '      <input type="range" id="sd-obj-rotation" min="0" max="359" value="0">',
    '    </label>',
    '    <label class="field" id="sd-shots-field">',
    '      <span class="field-label">Colpi richiesti</span>',
    '      <input type="number" id="sd-obj-shots" min="1" max="20" value="2" inputmode="numeric">',
    '    </label>',
    '    <label class="field">',
    '      <span class="field-label">Appare al secondo (vuoto = sempre visibile)</span>',
    '      <input type="number" id="sd-obj-appear" min="0" step="0.5" inputmode="decimal" placeholder="Sempre visibile">',
    '    </label>',
    '  </div>',

    '  <section class="settings-section">',
    '    <h3>Sequenza fasi</h3>',
    '    <ol id="sd-phases-list" class="phases-list"></ol>',
    '    <button id="sd-add-phase" class="btn-small">Aggiungi fase</button>',
    '  </section>',

    '  <button id="sd-save-stage" class="btn-primary">Salva stage</button>',
    '</main>'
  ].join('');

  document.body.appendChild(div);

  initStageDesigner();
}

// ============================================================
// INIZIALIZZAZIONE
// ============================================================

function initStageDesigner() {
  stageEditor.canvas = document.getElementById('sd-canvas');
  stageEditor.ctx = stageEditor.canvas.getContext('2d');

  // Palette: un pulsante per ogni tipo di oggetto
  const palette = document.getElementById('sd-palette');
  STAGE_OBJECT_TYPES.forEach(function (t) {
    const btn = document.createElement('button');
    btn.className = 'btn-small sd-palette-btn';
    btn.textContent = t.name;
    btn.addEventListener('click', function () { addStageObject(t.type); });
    palette.appendChild(btn);
  });

  // Interazione canvas (touch e mouse)
  const c = stageEditor.canvas;
  c.addEventListener('pointerdown', onCanvasDown);
  c.addEventListener('pointermove', onCanvasMove);
  c.addEventListener('pointerup', onCanvasUp);
  c.addEventListener('pointercancel', onCanvasUp);

  // Pannello proprieta' oggetto
  document.getElementById('sd-obj-scale').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) { obj.scale = parseInt(e.target.value, 10) / 100; drawStage(); }
  });
  document.getElementById('sd-obj-rotation').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) { obj.rotation = parseInt(e.target.value, 10); drawStage(); }
  });
  document.getElementById('sd-obj-shots').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) { obj.shots = parseInt(e.target.value, 10) || 1; drawStage(); }
  });
  document.getElementById('sd-obj-appear').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) {
      obj.appearAt = e.target.value === '' ? null : parseFloat(e.target.value);
      drawStage();
    }
  });
  document.getElementById('sd-obj-delete').addEventListener('click', function () {
    stageEditor.objects = stageEditor.objects.filter(function (o) {
      return o.id !== stageEditor.selectedId;
    });
    selectObject(null);
    drawStage();
  });

  // Fasi
  document.getElementById('sd-add-phase').addEventListener('click', addPhase);

  // Salvataggio
  document.getElementById('sd-save-stage').addEventListener('click', onSaveStage);

  drawStage();
}

// ============================================================
// GESTIONE OGGETTI
// ============================================================

function addStageObject(type) {
  const typeDef = STAGE_OBJECT_TYPES.find(function (t) { return t.type === type; });
  const obj = {
    id: stageEditor.nextObjectId++,
    type: type,
    x: 350, y: 250,
    scale: 1,
    rotation: 0,
    shots: typeDef.canShoot ? 2 : 0,
    appearAt: null
  };
  stageEditor.objects.push(obj);
  selectObject(obj.id);
  drawStage();
}

function getSelectedObject() {
  return stageEditor.objects.find(function (o) { return o.id === stageEditor.selectedId; }) || null;
}

function selectObject(id) {
  stageEditor.selectedId = id;
  const panel = document.getElementById('sd-object-panel');
  const obj = getSelectedObject();
  if (obj === null) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  const typeDef = STAGE_OBJECT_TYPES.find(function (t) { return t.type === obj.type; });
  document.getElementById('sd-obj-name').textContent =
    typeDef.name + ' #' + obj.id;
  document.getElementById('sd-obj-scale').value = Math.round(obj.scale * 100);
  document.getElementById('sd-obj-rotation').value = obj.rotation || 0;
  document.getElementById('sd-obj-shots').value = obj.shots;
  document.getElementById('sd-shots-field').style.display = typeDef.canShoot ? '' : 'none';
  document.getElementById('sd-obj-appear').value = obj.appearAt === null ? '' : obj.appearAt;
}

// ---------- Coordinate del tocco rispetto al canvas ----------

function canvasCoords(e) {
  const rect = stageEditor.canvas.getBoundingClientRect();
  const scaleX = stageEditor.canvas.width / rect.width;
  const scaleY = stageEditor.canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function onCanvasDown(e) {
  e.preventDefault();
  const p = canvasCoords(e);
  // Cerca l'oggetto toccato, dal piu' recente al piu' vecchio
  for (let i = stageEditor.objects.length - 1; i >= 0; i--) {
    const o = stageEditor.objects[i];
    const r = objectRadius(o);
    if (Math.abs(p.x - o.x) < r && Math.abs(p.y - o.y) < r) {
      selectObject(o.id);
      stageEditor.dragging = true;
      stageEditor.dragOffsetX = p.x - o.x;
      stageEditor.dragOffsetY = p.y - o.y;
      drawStage();
      return;
    }
  }
  selectObject(null);
  drawStage();
}

function onCanvasMove(e) {
  if (!stageEditor.dragging) return;
  e.preventDefault();
  const obj = getSelectedObject();
  if (!obj) return;
  const p = canvasCoords(e);
  obj.x = p.x - stageEditor.dragOffsetX;
  obj.y = p.y - stageEditor.dragOffsetY;
  drawStage();
}

function onCanvasUp() {
  stageEditor.dragging = false;
}

function objectRadius(o) {
  return 45 * o.scale;
}

// ============================================================
// DISEGNO DEGLI OGGETTI SUL CANVAS
// ============================================================

function drawStage(visibleFilter) {
  const ctx = stageEditor.ctx;
  const c = stageEditor.canvas;
  ctx.clearRect(0, 0, c.width, c.height);

  // Sfondo
  ctx.fillStyle = '#20241f';
  ctx.fillRect(0, 0, c.width, c.height);

  stageEditor.objects.forEach(function (o) {
    if (visibleFilter && !visibleFilter(o)) return;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate((o.rotation || 0) * Math.PI / 180);
    ctx.scale(o.scale, o.scale);
    drawObjectShape(ctx, o);
    ctx.restore();

    // Bordo di selezione
    if (o.id === stageEditor.selectedId) {
      const r = objectRadius(o);
      ctx.strokeStyle = getAccentColor();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(o.x - r, o.y - r, r * 2, r * 2);
      ctx.setLineDash([]);
    }

    // Numero colpi richiesti
    if (o.shots > 0) {
      ctx.fillStyle = getAccentColor();
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(o.shots + ' c.', o.x, o.y + objectRadius(o) + 16);
    }

    // Indicatore evento temporizzato
    if (o.appearAt !== null) {
      ctx.fillStyle = '#4aa3ff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('t=' + o.appearAt + 's', o.x, o.y - objectRadius(o) - 6);
    }
  });
}

function drawObjectShape(ctx, o) {
  ctx.textAlign = 'center';
  switch (o.type) {

    case 'ipsc':
      // Sagoma IPSC: cartone marrone con zone A/C/D
      ctx.fillStyle = '#b58a5a';
      ctx.beginPath();
      ctx.moveTo(-30, 40); ctx.lineTo(-30, -10); ctx.lineTo(-18, -28);
      ctx.lineTo(-10, -40); ctx.lineTo(10, -40); ctx.lineTo(18, -28);
      ctx.lineTo(30, -10); ctx.lineTo(30, 40); ctx.closePath();
      ctx.fill();
      // Zona A (centro + testa)
      ctx.strokeStyle = '#6d4c2a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-9, -12, 18, 30);
      ctx.strokeRect(-5, -38, 10, 12);
      // Zona C
      ctx.strokeRect(-20, -22, 40, 50);
      ctx.fillStyle = '#6d4c2a';
      ctx.font = '8px sans-serif';
      ctx.fillText('A', 0, 6);
      break;

    case 'idpa':
      // Sagoma IDPA: cartone con cerchio centrale
      ctx.fillStyle = '#c9b183';
      ctx.beginPath();
      ctx.moveTo(-28, 40); ctx.lineTo(-28, -15);
      ctx.quadraticCurveTo(-28, -40, 0, -40);
      ctx.quadraticCurveTo(28, -40, 28, -15);
      ctx.lineTo(28, 40); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -28, 7, 0, Math.PI * 2); ctx.stroke();
      break;

    case 'plate':
      ctx.fillStyle = '#c0c8d0';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7d8790'; ctx.lineWidth = 2; ctx.stroke();
      break;

    case 'popper':
      ctx.fillStyle = '#c0c8d0';
      ctx.beginPath(); ctx.arc(0, -22, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-7, -14, 14, 34);
      ctx.fillRect(-16, 20, 32, 8);
      break;

    case 'noshoot':
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.moveTo(-28, 40); ctx.lineTo(-28, -15);
      ctx.quadraticCurveTo(-28, -40, 0, -40);
      ctx.quadraticCurveTo(28, -40, 28, -15);
      ctx.lineTo(28, 40); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, -30); ctx.lineTo(20, 30);
      ctx.moveTo(20, -30); ctx.lineTo(-20, 30);
      ctx.stroke();
      break;

    case 'barricade':
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(-35, -12, 70, 24);
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2;
      ctx.strokeRect(-35, -12, 70, 24);
      break;

    case 'start':
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3;
      ctx.strokeRect(-20, -20, 40, 40);
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('START', 0, 4);
      break;

    case 'move':
      ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-25, 0); ctx.lineTo(15, 0);
      ctx.moveTo(15, 0); ctx.lineTo(5, -8);
      ctx.moveTo(15, 0); ctx.lineTo(5, 8);
      ctx.stroke();
      break;
  }
}

// ============================================================
// EDITOR SEQUENZA FASI
// ============================================================

function addPhase() {
  stageEditor.phases.push({
    description: '',
    parTime: 2.0,
    toneId: 'B'
  });
  renderPhases();
}

function renderPhases() {
  const list = document.getElementById('sd-phases-list');
  list.innerHTML = '';

  stageEditor.phases.forEach(function (phase, index) {
    const li = document.createElement('li');
    li.className = 'phase-item';

    // Descrizione
    const desc = document.createElement('input');
    desc.type = 'text';
    desc.placeholder = 'Es. 2 colpi sagoma A - ricarica';
    desc.value = phase.description;
    desc.addEventListener('input', function () { phase.description = desc.value; });

    // Riga: par time + tonalita' + prova + elimina
    const row = document.createElement('div');
    row.className = 'field-row';

    const pt = document.createElement('input');
    pt.type = 'number';
    pt.step = '0.1'; pt.min = '0.3';
    pt.value = phase.parTime;
    pt.inputMode = 'decimal';
    pt.title = 'Par time (secondi)';
    pt.addEventListener('input', function () {
      phase.parTime = parseFloat(pt.value) || 1;
    });

    const tone = document.createElement('select');
    BEEP_TONES.forEach(function (t) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === phase.toneId) opt.selected = true;
      tone.appendChild(opt);
    });
    tone.addEventListener('change', function () { phase.toneId = tone.value; });

    const test = document.createElement('button');
    test.className = 'btn-small';
    test.textContent = '&#9835;'; // nota musicale
    test.innerHTML = '&#9835;';
    test.addEventListener('click', function () { playBeepNow(phase.toneId); });

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.innerHTML = '&#10007;';
    del.addEventListener('click', function () {
      stageEditor.phases.splice(index, 1);
      renderPhases();
    });

    row.appendChild(pt);
    row.appendChild(tone);
    row.appendChild(test);
    row.appendChild(del);

    li.appendChild(desc);
    li.appendChild(row);
    list.appendChild(li);
  });
}

// ============================================================
// SALVATAGGIO / CARICAMENTO STAGE
// ============================================================

function onSaveStage() {
  const name = document.getElementById('sd-stage-name').value.trim();
  if (name === '') {
    alert('Inserisci un nome per lo stage.');
    return;
  }
  if (stageEditor.phases.length === 0) {
    alert('Aggiungi almeno una fase alla sequenza.');
    return;
  }

  const stage = {
    id: stageEditor.editingId || ('s_' + Date.now()),
    name: name,
    objects: stageEditor.objects,
    phases: stageEditor.phases.map(function (p) {
      return {
        description: p.description,
        parTime: p.parTime,
        initialParTime: p.initialParTime || p.parTime,
        toneId: p.toneId
      };
    })
  };

  saveStage(stage);
  alert('Stage salvato: ' + name);
}

function loadStageIntoEditor(stageId) {
  const stage = getSavedStages().find(function (s) { return s.id === stageId; });
  if (!stage) return;
  stageEditor.editingId = stage.id;
  stageEditor.objects = JSON.parse(JSON.stringify(stage.objects));
  stageEditor.phases = JSON.parse(JSON.stringify(stage.phases));
  stageEditor.nextObjectId = stageEditor.objects.reduce(function (max, o) {
    return Math.max(max, o.id);
  }, 0) + 1;
  document.getElementById('sd-stage-name').value = stage.name;
  selectObject(null);
  renderPhases();
  drawStage();
}

function resetStageEditor() {
  stageEditor.editingId = null;
  stageEditor.objects = [];
  stageEditor.phases = [];
  stageEditor.nextObjectId = 1;
  const nameField = document.getElementById('sd-stage-name');
  if (nameField) nameField.value = '';
  if (stageEditor.ctx) {
    selectObject(null);
    renderPhases();
    drawStage();
  }
}
