// ============================================================
// stage-designer.js — Editor grafico stage + sequenza fasi
// ============================================================

// ---------- Lettura del colore principale dal CSS ----------

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
  { type: 'wall',      name: 'Muro',          canShoot: false },
  { type: 'start',     name: 'Partenza',      canShoot: false },
  { type: 'move',      name: 'Movimento',     canShoot: false }
];

// ---------- Stato dell'editor ----------

const stageEditor = {
  objects: [],
  phases: [],
  selectedId: null,
  stageName: '',
  canvas: null,
  ctx: null,
  dragging: false,
  rotating: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  nextObjectId: 1,
  // Vista (zoom e pan)
  view: { scale: 1, ox: 0, oy: 0 },
  pointers: {},          // tocchi attivi (per pinch)
  pinchStart: null,
  // Selezione bersagli per una fase
  pickingForPhase: null,
  lastTapTime: 0
};

// ---------- Salvataggio layout ----------

function getSavedStages() {
  return loadData('rt_stages', []);
}

function saveStage(stage) {
  const stages = getSavedStages();
  const existing = stages.findIndex(function (s) { return s.id === stage.id; });
  if (existing >= 0) stages[existing] = stage;
  else stages.push(stage);
  saveData('rt_stages', stages);
}

function deleteStage(stageId) {
  const stages = getSavedStages().filter(function (s) { return s.id !== stageId; });
  saveData('rt_stages', stages);
}

// ============================================================
// COSTRUZIONE DELLA SCHERMATA
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

    '  <div id="sd-picking-banner" class="sd-picking-banner hidden">',
    '    Tocca i bersagli della fase <span id="sd-picking-num"></span>, poi',
    '    <button id="sd-picking-done" class="btn-small">Fine</button>',
    '  </div>',

    '  <canvas id="sd-canvas" width="700" height="500"></canvas>',
    '  <div class="sd-canvas-hint">Due dita: zoom e sposta - doppio tocco: vista normale</div>',

    '  <div id="sd-object-panel" class="sd-object-panel hidden">',
    '    <div class="sd-panel-row">',
    '      <span id="sd-obj-name" class="sd-obj-name"></span>',
    '      <span id="sd-obj-dist" class="sd-obj-dist"></span>',
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
    '    <label class="field hidden" id="sd-length-field">',
    '      <span class="field-label">Lunghezza muro</span>',
    '      <input type="range" id="sd-obj-length" min="60" max="400" value="160">',
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

  const palette = document.getElementById('sd-palette');
  STAGE_OBJECT_TYPES.forEach(function (t) {
    const btn = document.createElement('button');
    btn.className = 'btn-small sd-palette-btn';
    btn.textContent = t.name;
    btn.addEventListener('click', function () { addStageObject(t.type); });
    palette.appendChild(btn);
  });

  const c = stageEditor.canvas;
  c.addEventListener('pointerdown', onCanvasDown);
  c.addEventListener('pointermove', onCanvasMove);
  c.addEventListener('pointerup', onCanvasUp);
  c.addEventListener('pointercancel', onCanvasUp);

  document.getElementById('sd-obj-scale').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) { obj.scale = parseInt(e.target.value, 10) / 100; updateDistLabel(obj); drawStage(); }
  });
  document.getElementById('sd-obj-rotation').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) { obj.rotation = parseInt(e.target.value, 10); drawStage(); }
  });
  document.getElementById('sd-obj-length').addEventListener('input', function (e) {
    const obj = getSelectedObject();
    if (obj) { obj.length = parseInt(e.target.value, 10); drawStage(); }
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
    // Rimuove l'oggetto anche dai collegamenti delle fasi
    stageEditor.phases.forEach(function (p) {
      if (p.targetIds) {
        p.targetIds = p.targetIds.filter(function (id) {
          return id !== stageEditor.selectedId;
        });
      }
    });
    stageEditor.objects = stageEditor.objects.filter(function (o) {
      return o.id !== stageEditor.selectedId;
    });
    selectObject(null);
    renderPhases();
    drawStage();
  });

  document.getElementById('sd-add-phase').addEventListener('click', addPhase);
  document.getElementById('sd-save-stage').addEventListener('click', onSaveStage);
  document.getElementById('sd-picking-done').addEventListener('click', endTargetPicking);

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
    length: type === 'wall' ? 160 : 0,
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

// Distanza simulata: scala 1 = ~10 m (convenzione), inversamente proporzionale
function simulatedDistance(obj) {
  return Math.round(10 / obj.scale);
}

function updateDistLabel(obj) {
  const el = document.getElementById('sd-obj-dist');
  const typeDef = STAGE_OBJECT_TYPES.find(function (t) { return t.type === obj.type; });
  el.textContent = typeDef.canShoot ? '~' + simulatedDistance(obj) + ' m' : '';
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
  document.getElementById('sd-obj-name').textContent = typeDef.name + ' #' + obj.id;
  document.getElementById('sd-obj-scale').value = Math.round(obj.scale * 100);
  document.getElementById('sd-obj-rotation').value = obj.rotation || 0;
  document.getElementById('sd-obj-length').value = obj.length || 160;
  document.getElementById('sd-obj-shots').value = obj.shots;
  document.getElementById('sd-shots-field').style.display = typeDef.canShoot ? '' : 'none';
  document.getElementById('sd-length-field').classList.toggle('hidden', obj.type !== 'wall');
  document.getElementById('sd-obj-appear').value = obj.appearAt === null ? '' : obj.appearAt;
  updateDistLabel(obj);
}

// ---------- Coordinate: dal tocco al "mondo" (tenendo conto di zoom/pan) ----------

function canvasCoords(e) {
  const rect = stageEditor.canvas.getBoundingClientRect();
  const scaleX = stageEditor.canvas.width / rect.width;
  const scaleY = stageEditor.canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  const v = stageEditor.view;
  return { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
}

function objectRadius(o) {
  if (o.type === 'wall') return Math.max(30, (o.length || 160) / 2);
  return 45 * o.scale;
}

// Posizione della maniglia di rotazione (sopra l'oggetto, segue la rotazione)
function rotationHandlePos(o) {
  const r = objectRadius(o) + 28;
  const a = ((o.rotation || 0) - 90) * Math.PI / 180;
  return { x: o.x + r * Math.cos(a), y: o.y + r * Math.sin(a) };
}

// ---------- Interazione ----------

function onCanvasDown(e) {
  e.preventDefault();
  stageEditor.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  const ids = Object.keys(stageEditor.pointers);

  // Due dita: inizia pinch/pan
  if (ids.length === 2) {
    stageEditor.dragging = false;
    stageEditor.rotating = false;
    const p1 = stageEditor.pointers[ids[0]];
    const p2 = stageEditor.pointers[ids[1]];
    stageEditor.pinchStart = {
      dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
      cx: (p1.x + p2.x) / 2,
      cy: (p1.y + p2.y) / 2,
      view: { scale: stageEditor.view.scale, ox: stageEditor.view.ox, oy: stageEditor.view.oy }
    };
    return;
  }

  // Doppio tocco: reset vista
  const now = Date.now();
  if (now - stageEditor.lastTapTime < 300) {
    stageEditor.view = { scale: 1, ox: 0, oy: 0 };
    stageEditor.lastTapTime = 0;
    drawStage();
    return;
  }
  stageEditor.lastTapTime = now;

  const p = canvasCoords(e);

  // Modalita' selezione bersagli per una fase
  if (stageEditor.pickingForPhase !== null) {
    for (let i = stageEditor.objects.length - 1; i >= 0; i--) {
      const o = stageEditor.objects[i];
      const typeDef = STAGE_OBJECT_TYPES.find(function (t) { return t.type === o.type; });
      if (!typeDef.canShoot) continue;
      if (Math.abs(p.x - o.x) < objectRadius(o) && Math.abs(p.y - o.y) < objectRadius(o)) {
        const phase = stageEditor.phases[stageEditor.pickingForPhase];
        if (!phase.targetIds) phase.targetIds = [];
        const idx = phase.targetIds.indexOf(o.id);
        if (idx >= 0) phase.targetIds.splice(idx, 1);
        else phase.targetIds.push(o.id);
        drawStage();
        return;
      }
    }
    return;
  }

  // Maniglia di rotazione dell'oggetto selezionato?
  const sel = getSelectedObject();
  if (sel) {
    const h = rotationHandlePos(sel);
    if (Math.hypot(p.x - h.x, p.y - h.y) < 20) {
      stageEditor.rotating = true;
      return;
    }
  }

  // Oggetto toccato?
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
  if (stageEditor.pointers[e.pointerId]) {
    stageEditor.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  }
  const ids = Object.keys(stageEditor.pointers);

  // Pinch/pan con due dita
  if (ids.length === 2 && stageEditor.pinchStart) {
    e.preventDefault();
    const p1 = stageEditor.pointers[ids[0]];
    const p2 = stageEditor.pointers[ids[1]];
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const st = stageEditor.pinchStart;
    let newScale = st.view.scale * (dist / st.dist);
    newScale = Math.max(0.5, Math.min(4, newScale));
    // Lo zoom resta centrato sul punto medio delle dita
    const rect = stageEditor.canvas.getBoundingClientRect();
    const k = stageEditor.canvas.width / rect.width;
    const mx = (st.cx - rect.left) * k;
    const my = (st.cy - rect.top) * k;
    stageEditor.view.scale = newScale;
    stageEditor.view.ox = mx - (mx - st.view.ox) * (newScale / st.view.scale) + (cx - st.cx) * k;
    stageEditor.view.oy = my - (my - st.view.oy) * (newScale / st.view.scale) + (cy - st.cy) * k;
    drawStage();
    return;
  }

  const p = canvasCoords(e);

  if (stageEditor.rotating) {
    e.preventDefault();
    const obj = getSelectedObject();
    if (!obj) return;
    const ang = Math.atan2(p.y - obj.y, p.x - obj.x) * 180 / Math.PI + 90;
    obj.rotation = Math.round((ang + 360) % 360);
    document.getElementById('sd-obj-rotation').value = obj.rotation;
    drawStage();
    return;
  }

  if (!stageEditor.dragging) return;
  e.preventDefault();
  const obj = getSelectedObject();
  if (!obj) return;
  obj.x = p.x - stageEditor.dragOffsetX;
  obj.y = p.y - stageEditor.dragOffsetY;
  drawStage();
}

function onCanvasUp(e) {
  delete stageEditor.pointers[e.pointerId];
  if (Object.keys(stageEditor.pointers).length < 2) {
    stageEditor.pinchStart = null;
  }
  stageEditor.dragging = false;
  stageEditor.rotating = false;
}

// ============================================================
// DISEGNO
// ============================================================

function drawStage(visibleFilter, highlightIds) {
  const ctx = stageEditor.ctx;
  const c = stageEditor.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);

  // Applica zoom/pan
  const v = stageEditor.view;
  ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);

  drawFloor(ctx, c.width, c.height);

  const accent = getAccentColor();
  const picking = stageEditor.pickingForPhase !== null;
  const pickedIds = picking && stageEditor.phases[stageEditor.pickingForPhase].targetIds ?
    stageEditor.phases[stageEditor.pickingForPhase].targetIds : [];

  stageEditor.objects.forEach(function (o) {
    if (visibleFilter && !visibleFilter(o)) return;

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate((o.rotation || 0) * Math.PI / 180);
    ctx.scale(o.scale, o.scale);
    drawObjectShape(ctx, o);
    ctx.restore();

    const r = objectRadius(o);

    // Evidenziazione: bersaglio della fase in esecuzione, o selezionato in picking
    const isHighlighted = (highlightIds && highlightIds.indexOf(o.id) >= 0) ||
      (picking && pickedIds.indexOf(o.id) >= 0);
    if (isHighlighted) {
      ctx.strokeStyle = '#ffd400';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bordo di selezione (solo in editing normale)
    if (!picking && !highlightIds && o.id === stageEditor.selectedId) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(o.x - r, o.y - r, r * 2, r * 2);
      ctx.setLineDash([]);
      // Maniglia di rotazione
      const h = rotationHandlePos(o);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(h.x, h.y);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }

    // Colpi richiesti
    if (o.shots > 0) {
      ctx.fillStyle = accent;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(o.shots + ' c.', o.x, o.y + r + 16);
    }

    // Evento temporizzato
    if (o.appearAt !== null && o.appearAt !== undefined) {
      ctx.fillStyle = '#4aa3ff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('t=' + o.appearAt + 's', o.x, o.y - r - 6);
    }
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Pavimento con griglia prospettica
function drawFloor(ctx, W, H) {
  // Cielo/fondo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#2a2f28');
  grad.addColorStop(0.25, '#242822');
  grad.addColorStop(1, '#1c211b');
  ctx.fillStyle = grad;
  ctx.fillRect(-W, -H, W * 3, H * 3);

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;

  // Linee orizzontali: piu' fitte verso il fondo (prospettiva)
  const horizon = 40;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = horizon + (H - horizon) * t * t;
    ctx.beginPath();
    ctx.moveTo(-W, y);
    ctx.lineTo(W * 2, y);
    ctx.stroke();
  }

  // Linee convergenti verso il punto di fuga centrale
  const vpx = W / 2;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(vpx, horizon);
    ctx.lineTo(vpx + i * W / 5, H + 50);
    ctx.stroke();
  }
}

function drawObjectShape(ctx, o) {
  ctx.textAlign = 'center';
  switch (o.type) {

    case 'ipsc':
      // Sagoma IPSC "metric": proporzioni realistiche, zone A/C/D
      ctx.fillStyle = '#c8a06a';
      ctx.beginPath();
      ctx.moveTo(-29, 42); ctx.lineTo(-29, -8);
      ctx.lineTo(-15, -30); ctx.lineTo(-11, -44);
      ctx.lineTo(11, -44); ctx.lineTo(15, -30);
      ctx.lineTo(29, -8); ctx.lineTo(29, 42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a6a40';
      ctx.lineWidth = 1.2;
      // Zona D (perimetro interno)
      ctx.strokeRect(-25, -18, 50, 56);
      // Zona C
      ctx.strokeRect(-17, -14, 34, 46);
      // Zona A corpo
      ctx.strokeRect(-7.5, -10, 15, 28);
      // Testa: zona A + contorno
      ctx.strokeRect(-9, -42, 18, 14);
      ctx.strokeRect(-4.5, -39, 9, 8);
      ctx.fillStyle = '#8a6a40';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('A', 0, 6);
      break;

    case 'idpa':
      ctx.fillStyle = '#c9b183';
      ctx.beginPath();
      ctx.moveTo(-28, 42); ctx.lineTo(-28, -14);
      ctx.quadraticCurveTo(-28, -44, 0, -44);
      ctx.quadraticCurveTo(28, -44, 28, -14);
      ctx.lineTo(28, 42); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 2, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -30, 7, 0, Math.PI * 2); ctx.stroke();
      break;

    case 'plate': {
      // Piattello con effetto metallo
      const pg = ctx.createRadialGradient(-6, -6, 3, 0, 0, 20);
      pg.addColorStop(0, '#f0f4f8');
      pg.addColorStop(0.6, '#b8c2cc');
      pg.addColorStop(1, '#7d8790');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5d6770'; ctx.lineWidth = 2; ctx.stroke();
      break;
    }

    case 'popper': {
      // Popper classico a "chiodo": testa tonda, collo stretto, base larga
      const mg = ctx.createLinearGradient(-14, 0, 14, 0);
      mg.addColorStop(0, '#8d97a0');
      mg.addColorStop(0.5, '#d8e0e8');
      mg.addColorStop(1, '#8d97a0');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(0, -26, 13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5, -16); ctx.lineTo(-14, 24);
      ctx.lineTo(14, 24); ctx.lineTo(5, -16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6d7780';
      ctx.fillRect(-19, 24, 38, 7);
      break;
    }

    case 'noshoot':
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.moveTo(-28, 42); ctx.lineTo(-28, -14);
      ctx.quadraticCurveTo(-28, -44, 0, -44);
      ctx.quadraticCurveTo(28, -44, 28, -14);
      ctx.lineTo(28, 42); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-20, -32); ctx.lineTo(20, 32);
      ctx.moveTo(20, -32); ctx.lineTo(-20, 32);
      ctx.stroke();
      break;

    case 'barricade': {
      const bg = ctx.createLinearGradient(0, -14, 0, 14);
      bg.addColorStop(0, '#6a6a6a');
      bg.addColorStop(1, '#4a4a4a');
      ctx.fillStyle = bg;
      ctx.fillRect(-35, -14, 70, 28);
      ctx.strokeStyle = '#333333'; ctx.lineWidth = 2;
      ctx.strokeRect(-35, -14, 70, 28);
      // Doghe verticali
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let i = -25; i <= 25; i += 10) {
        ctx.beginPath(); ctx.moveTo(i, -14); ctx.lineTo(i, 14); ctx.stroke();
      }
      break;
    }

    case 'wall': {
      // Il muro NON viene scalato dalla dimensione: usa la lunghezza propria
      const half = (o.length || 160) / 2 / o.scale;
      const wg = ctx.createLinearGradient(0, -8, 0, 8);
      wg.addColorStop(0, '#7a7268');
      wg.addColorStop(1, '#57504a');
      ctx.fillStyle = wg;
      ctx.fillRect(-half, -8 / o.scale, half * 2, 16 / o.scale);
      ctx.strokeStyle = '#3a352f';
      ctx.lineWidth = 2 / o.scale;
      ctx.strokeRect(-half, -8 / o.scale, half * 2, 16 / o.scale);
      break;
    }

    case 'start':
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3;
      ctx.strokeRect(-20, -20, 40, 40);
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('START', 0, 4);
      break;

    case 'move':
      ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 4;
      ctx.lineCap = 'round';
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
    toneId: 'B',
    targetIds: []
  });
  renderPhases();
}

function renderPhases() {
  const list = document.getElementById('sd-phases-list');
  list.innerHTML = '';

  stageEditor.phases.forEach(function (phase, index) {
    const li = document.createElement('li');
    li.className = 'phase-item';

    const desc = document.createElement('input');
    desc.type = 'text';
    desc.placeholder = 'Es. 2 colpi sagoma A - ricarica';
    desc.value = phase.description;
    desc.addEventListener('input', function () { phase.description = desc.value; });

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

    // Riga bersagli collegati
    const targetRow = document.createElement('div');
    targetRow.className = 'field-row';
    const targetBtn = document.createElement('button');
    targetBtn.className = 'btn-small';
    const n = phase.targetIds ? phase.targetIds.length : 0;
    targetBtn.textContent = 'Bersagli (' + n + ')';
    targetBtn.addEventListener('click', function () {
      startTargetPicking(index);
    });
    targetRow.appendChild(targetBtn);

    li.appendChild(desc);
    li.appendChild(row);
    li.appendChild(targetRow);
    list.appendChild(li);
  });
}

// ---------- Selezione bersagli di una fase ----------

function startTargetPicking(phaseIndex) {
  stageEditor.pickingForPhase = phaseIndex;
  selectObject(null);
  document.getElementById('sd-picking-num').textContent = phaseIndex + 1;
  document.getElementById('sd-picking-banner').classList.remove('hidden');
  document.getElementById('sd-canvas').scrollIntoView({ behavior: 'smooth', block: 'center' });
  drawStage();
}

function endTargetPicking() {
  stageEditor.pickingForPhase = null;
  document.getElementById('sd-picking-banner').classList.add('hidden');
  renderPhases();
  drawStage();
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
        toneId: p.toneId,
        targetIds: p.targetIds || [],
        streak: p.streak || 0
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
  stageEditor.view = { scale: 1, ox: 0, oy: 0 };
  stageEditor.pickingForPhase = null;
  const nameField = document.getElementById('sd-stage-name');
  if (nameField) nameField.value = '';
  if (stageEditor.ctx) {
    selectObject(null);
    renderPhases();
    drawStage();
    document.getElementById('sd-picking-banner').classList.add('hidden');
  }
}

// ============================================================
// DRILL CLASSICI PREDEFINITI (stage pronti all'uso)
// ============================================================
// Par time iniziali volutamente comodi: la riduzione automatica
// li fara' scendere con i progressi dell'utente.

const DEFAULT_STAGES = [
  {
    id: 'ds_el_presidente',
    name: 'El Presidente (classico)',
    objects: [
      { id: 1, type: 'start', x: 350, y: 430, scale: 1, rotation: 0, shots: 0, appearAt: null },
      { id: 2, type: 'ipsc', x: 200, y: 120, scale: 1, rotation: 0, shots: 4, appearAt: null },
      { id: 3, type: 'ipsc', x: 350, y: 100, scale: 1, rotation: 0, shots: 4, appearAt: null },
      { id: 4, type: 'ipsc', x: 500, y: 120, scale: 1, rotation: 0, shots: 4, appearAt: null }
    ],
    phases: [
      { description: 'Giro + estrazione + 2 colpi per sagoma (1-2-3)', parTime: 5.0, initialParTime: 5.0, toneId: 'B' },
      { description: 'Ricarica', parTime: 2.5, initialParTime: 2.5, toneId: 'C' },
      { description: '2 colpi per sagoma (1-2-3)', parTime: 3.5, initialParTime: 3.5, toneId: 'B' }
    ]
  },
  {
    id: 'ds_bill_drill',
    name: 'Bill Drill (classico)',
    objects: [
      { id: 1, type: 'start', x: 350, y: 430, scale: 1, rotation: 0, shots: 0, appearAt: null },
      { id: 2, type: 'ipsc', x: 350, y: 130, scale: 1.3, rotation: 0, shots: 6, appearAt: null }
    ],
    phases: [
      { description: 'Estrazione + 6 colpi in zona A', parTime: 4.0, initialParTime: 4.0, toneId: 'B' }
    ]
  },
  {
    id: 'ds_failure_drill',
    name: 'Failure Drill (classico)',
    objects: [
      { id: 1, type: 'start', x: 350, y: 430, scale: 1, rotation: 0, shots: 0, appearAt: null },
      { id: 2, type: 'ipsc', x: 350, y: 130, scale: 1.3, rotation: 0, shots: 3, appearAt: null }
    ],
    phases: [
      { description: 'Estrazione + 2 colpi al corpo', parTime: 2.5, initialParTime: 2.5, toneId: 'B' },
      { description: '1 colpo mirato alla testa', parTime: 1.5, initialParTime: 1.5, toneId: 'C' }
    ]
  },
  {
    id: 'ds_transizioni_3',
    name: 'Transizioni su 3 bersagli',
    objects: [
      { id: 1, type: 'start', x: 350, y: 430, scale: 1, rotation: 0, shots: 0, appearAt: null },
      { id: 2, type: 'ipsc', x: 150, y: 140, scale: 0.9, rotation: 0, shots: 2, appearAt: null },
      { id: 3, type: 'ipsc', x: 350, y: 100, scale: 0.75, rotation: 0, shots: 2, appearAt: null },
      { id: 4, type: 'ipsc', x: 550, y: 140, scale: 0.9, rotation: 0, shots: 2, appearAt: null }
    ],
    phases: [
      { description: 'Estrazione + 2 colpi sagoma sinistra', parTime: 2.5, initialParTime: 2.5, toneId: 'B' },
      { description: 'Transizione + 2 colpi sagoma centrale (lontana)', parTime: 2.0, initialParTime: 2.0, toneId: 'C' },
      { description: 'Transizione + 2 colpi sagoma destra', parTime: 2.0, initialParTime: 2.0, toneId: 'B' }
    ]
  },
  {
    id: 'ds_popper_plate',
    name: 'Popper + piattelli',
    objects: [
      { id: 1, type: 'start', x: 350, y: 430, scale: 1, rotation: 0, shots: 0, appearAt: null },
      { id: 2, type: 'popper', x: 200, y: 140, scale: 1, rotation: 0, shots: 1, appearAt: null },
      { id: 3, type: 'plate', x: 350, y: 110, scale: 1, rotation: 0, shots: 1, appearAt: null },
      { id: 4, type: 'plate', x: 450, y: 110, scale: 1, rotation: 0, shots: 1, appearAt: null },
      { id: 5, type: 'popper', x: 550, y: 140, scale: 1, rotation: 0, shots: 1, appearAt: null }
    ],
    phases: [
      { description: 'Estrazione + popper sinistro', parTime: 2.0, initialParTime: 2.0, toneId: 'B' },
      { description: '2 piattelli centrali', parTime: 2.0, initialParTime: 2.0, toneId: 'C' },
      { description: 'Popper destro', parTime: 1.2, initialParTime: 1.2, toneId: 'B' }
    ]
  },
  {
    id: 'ds_noshoot',
    name: 'Bersagli con no-shoot',
    objects: [
      { id: 1, type: 'start', x: 350, y: 430, scale: 1, rotation: 0, shots: 0, appearAt: null },
      { id: 2, type: 'ipsc', x: 180, y: 130, scale: 1, rotation: 0, shots: 2, appearAt: null },
      { id: 3, type: 'noshoot', x: 280, y: 140, scale: 1, rotation: 15, shots: 0, appearAt: null },
      { id: 4, type: 'ipsc', x: 380, y: 130, scale: 1, rotation: 0, shots: 2, appearAt: null },
      { id: 5, type: 'noshoot', x: 480, y: 140, scale: 1, rotation: -15, shots: 0, appearAt: null },
      { id: 6, type: 'ipsc', x: 570, y: 130, scale: 1, rotation: 0, shots: 2, appearAt: null }
    ],
    phases: [
      { description: 'Estrazione + 2 colpi prima sagoma', parTime: 2.5, initialParTime: 2.5, toneId: 'B' },
      { description: '2 colpi seconda sagoma (attenzione al no-shoot)', parTime: 2.0, initialParTime: 2.0, toneId: 'C' },
      { description: '2 colpi terza sagoma', parTime: 2.0, initialParTime: 2.0, toneId: 'B' }
    ]
  }
];

// Un drill classico e' "attivato" (copiato negli stage dell'utente)
// alla prima esecuzione, cosi' i suoi par time possono evolvere.
function activateDefaultStageIfNeeded(stageId) {
  const isDefault = DEFAULT_STAGES.some(function (s) { return s.id === stageId; });
  if (!isDefault) return;
  const alreadySaved = getSavedStages().some(function (s) { return s.id === stageId; });
  if (alreadySaved) return;
  const template = DEFAULT_STAGES.find(function (s) { return s.id === stageId; });
  saveStage(JSON.parse(JSON.stringify(template)));
}

// Tutti gli stage disponibili: prima i classici non ancora attivati,
// poi quelli dell'utente (che includono i classici gia' attivati).
function getAllStages() {
  const saved = getSavedStages();
  const savedIds = {};
  saved.forEach(function (s) { savedIds[s.id] = true; });
  const inactiveDefaults = DEFAULT_STAGES.filter(function (s) {
    return !savedIds[s.id];
  });
  return inactiveDefaults.concat(saved);
}
