// ============================================================
// stats.js — Storico sessioni e Statistiche con grafici
// ============================================================

// ============================================================
// SCHERMATA STORICO
// ============================================================

function buildHistoryScreen() {
  if (document.getElementById('screen-history')) return;

  const div = document.createElement('div');
  div.id = 'screen-history';
  div.className = 'screen';
  div.innerHTML = [
    '<header class="app-header">',
    '  <button class="btn-back" data-goto="home">&#8592;</button>',
    '  <h2>Storico</h2>',
    '</header>',
    '<main class="form-page">',
    '  <div class="field-row">',
    '    <select id="hist-filter-weapon"></select>',
    '    <select id="hist-filter-exercise"></select>',
    '  </div>',
    '  <ul id="history-list" class="items-list"></ul>',
    '</main>'
  ].join('');
  document.body.appendChild(div);

  document.getElementById('hist-filter-weapon')
    .addEventListener('change', renderHistory);
  document.getElementById('hist-filter-exercise')
    .addEventListener('change', renderHistory);
}

// Riempie i filtri con le armi/esercizi realmente presenti nello storico
function populateHistoryFilters(sessions) {
  const wSel = document.getElementById('hist-filter-weapon');
  const eSel = document.getElementById('hist-filter-exercise');
  const wPrev = wSel.value, ePrev = eSel.value;

  const weapons = {}, exercises = {};
  sessions.forEach(function (s) {
    weapons[s.weaponId] = s.weaponName;
    exercises[s.exerciseKey] = s.exerciseName;
  });

  function fill(sel, map, allLabel) {
    sel.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = allLabel;
    sel.appendChild(all);
    Object.keys(map).forEach(function (key) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = map[key];
      sel.appendChild(opt);
    });
  }
  fill(wSel, weapons, 'Tutte le armi');
  fill(eSel, exercises, 'Tutti gli esercizi');
  wSel.value = wPrev;
  eSel.value = ePrev;
}

function formatDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('it-IT') + ' ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function renderHistory() {
  dbGetAllSessions().then(function (sessions) {
    populateHistoryFilters(sessions);

    const wFilter = document.getElementById('hist-filter-weapon').value;
    const eFilter = document.getElementById('hist-filter-exercise').value;
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    const filtered = sessions.filter(function (s) {
      if (wFilter && s.weaponId !== wFilter) return false;
      if (eFilter && s.exerciseKey !== eFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Nessuna sessione trovata.';
      list.appendChild(li);
      return;
    }

    filtered.forEach(function (s) {
      const li = document.createElement('li');
      li.className = 'history-item';

      const info = document.createElement('div');
      info.className = 'history-info';

      const line1 = document.createElement('div');
      line1.className = 'history-title';
      line1.textContent = (s.success ? '\u2713 ' : '\u2717 ') +
        s.exerciseName + ' - ' + s.weaponName;

      const line2 = document.createElement('div');
      line2.className = 'history-sub';
      if (s.type === 'simple') {
        line2.textContent = formatDate(s.date) +
          ' - par time ' + s.parTime.toFixed(2) + ' s';
      } else if (s.type === 'stage') {
        const okCount = s.phases.filter(function (p) { return p.success; }).length;
        line2.textContent = formatDate(s.date) +
          ' - ' + okCount + '/' + s.phases.length + ' fasi ok';
      } else {
        line2.textContent = formatDate(s.date);
      }

      info.appendChild(line1);
      info.appendChild(line2);

      // Dettaglio fasi per i drill (si apre/chiude al tocco)
      if (s.type === 'stage') {
        const detail = document.createElement('div');
        detail.className = 'history-detail hidden';
        s.phases.forEach(function (p, i) {
          const row = document.createElement('div');
          row.textContent = (p.success ? '\u2713' : '\u2717') + ' ' +
            (i + 1) + '. ' + (p.description || 'Fase ' + (i + 1)) +
            ' (' + p.parTime.toFixed(2) + ' s)';
          detail.appendChild(row);
        });
        info.appendChild(detail);
        info.addEventListener('click', function () {
          detail.classList.toggle('hidden');
        });
      }

      const del = document.createElement('button');
      del.className = 'btn-delete';
      del.innerHTML = '&#10007;';
      del.addEventListener('click', function () {
        if (confirm('Eliminare questa sessione dallo storico?')) {
          dbDeleteSession(s.id).then(renderHistory);
        }
      });

      li.appendChild(info);
      li.appendChild(del);
      list.appendChild(li);
    });
  });
}

// ============================================================
// SCHERMATA STATISTICHE
// ============================================================

function buildStatsScreen() {
  if (document.getElementById('screen-stats')) return;

  const div = document.createElement('div');
  div.id = 'screen-stats';
  div.className = 'screen';
  div.innerHTML = [
    '<header class="app-header">',
    '  <button class="btn-back" data-goto="home">&#8592;</button>',
    '  <h2>Statistiche</h2>',
    '</header>',
    '<main class="form-page">',
    '  <div class="field-row">',
    '    <select id="stats-filter-weapon"></select>',
    '    <select id="stats-filter-exercise"></select>',
    '  </div>',
    '  <div class="field-row">',
    '    <select id="stats-filter-phase" class="hidden"></select>',
    '  </div>',
    '  <div id="stats-summary" class="stats-summary"></div>',
    '  <h3 class="stats-chart-title">Andamento par time</h3>',
    '  <canvas id="stats-chart" width="700" height="380"></canvas>',
    '  <h3 class="stats-chart-title">Percentuale di successo</h3>',
    '  <div id="stats-success" class="stats-success"></div>',
    '</main>'
  ].join('');
  document.body.appendChild(div);

  document.getElementById('stats-filter-weapon')
    .addEventListener('change', renderStats);
  document.getElementById('stats-filter-exercise')
    .addEventListener('change', function () {
      populatePhaseFilter();
      renderStats();
    });
  document.getElementById('stats-filter-phase')
    .addEventListener('change', renderStats);
}

let statsSessions = [];

function refreshStats() {
  dbGetAllSessions().then(function (sessions) {
    statsSessions = sessions;
    populateStatsFilters();
    populatePhaseFilter();
    renderStats();
  });
}

function populateStatsFilters() {
  const wSel = document.getElementById('stats-filter-weapon');
  const eSel = document.getElementById('stats-filter-exercise');
  const wPrev = wSel.value, ePrev = eSel.value;

  const weapons = {}, exercises = {};
  statsSessions.forEach(function (s) {
    weapons[s.weaponId] = s.weaponName;
    exercises[s.exerciseKey] = s.exerciseName;
  });

  function fill(sel, map, allLabel) {
    sel.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = allLabel;
    sel.appendChild(all);
    Object.keys(map).forEach(function (key) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = map[key];
      sel.appendChild(opt);
    });
  }
  fill(wSel, weapons, 'Tutte le armi');
  fill(eSel, exercises, 'Tutti gli esercizi');
  wSel.value = wPrev;
  eSel.value = ePrev;
}

// Il filtro fase compare solo se l'esercizio selezionato e' uno stage
function populatePhaseFilter() {
  const eFilter = document.getElementById('stats-filter-exercise').value;
  const pSel = document.getElementById('stats-filter-phase');

  const stageSessions = statsSessions.filter(function (s) {
    return s.type === 'stage' && s.exerciseKey === eFilter;
  });

  if (eFilter === '' || stageSessions.length === 0) {
    pSel.classList.add('hidden');
    pSel.innerHTML = '';
    return;
  }

  const maxPhases = stageSessions.reduce(function (max, s) {
    return Math.max(max, s.phases.length);
  }, 0);

  pSel.classList.remove('hidden');
  pSel.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Tutte le fasi';
  pSel.appendChild(all);
  for (let i = 0; i < maxPhases; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = 'Fase ' + (i + 1);
    pSel.appendChild(opt);
  }
}

// Estrae dal filtro corrente i punti (data, parTime, successo)
function collectDataPoints() {
  const wFilter = document.getElementById('stats-filter-weapon').value;
  const eFilter = document.getElementById('stats-filter-exercise').value;
  const pFilter = document.getElementById('stats-filter-phase').value;
  const phaseHidden = document.getElementById('stats-filter-phase')
    .classList.contains('hidden');

  const points = [];
  statsSessions.forEach(function (s) {
    if (wFilter && s.weaponId !== wFilter) return;
    if (eFilter && s.exerciseKey !== eFilter) return;

    if (s.type === 'simple') {
      points.push({ date: s.date, parTime: s.parTime, success: s.success });
    } else if (s.type === 'stage') {
      if (!phaseHidden && pFilter !== '') {
        const p = s.phases[parseInt(pFilter, 10)];
        if (p) points.push({ date: s.date, parTime: p.parTime, success: p.success });
      } else {
        // Tutte le fasi: par time = somma (durata totale del drill)
        const total = s.phases.reduce(function (sum, p) { return sum + p.parTime; }, 0);
        points.push({ date: s.date, parTime: total, success: s.success });
      }
    }
  });

  points.sort(function (a, b) { return a.date - b.date; });
  return points;
}

function renderStats() {
  const points = collectDataPoints();

  // Riepilogo numerico
  const summary = document.getElementById('stats-summary');
  if (points.length === 0) {
    summary.textContent = 'Nessun dato per i filtri selezionati.';
    drawChart([]);
    document.getElementById('stats-success').innerHTML = '';
    return;
  }
  const first = points[0].parTime;
  const last = points[points.length - 1].parTime;
  const improvement = first > 0 ? ((first - last) / first * 100) : 0;
  summary.innerHTML =
    'Sessioni: <b>' + points.length + '</b><br>' +
    'Par time iniziale: <b>' + first.toFixed(2) + ' s</b> - attuale: <b>' +
    last.toFixed(2) + ' s</b><br>' +
    'Miglioramento: <b>' + improvement.toFixed(1) + '%</b>';

  drawChart(points);

  // Barra percentuale di successo
  const okCount = points.filter(function (p) { return p.success; }).length;
  const pct = Math.round(okCount / points.length * 100);
  document.getElementById('stats-success').innerHTML =
    '<div class="success-bar"><div class="success-fill" style="width:' +
    pct + '%"></div></div>' +
    '<div class="success-label">' + pct + '% (' + okCount + ' su ' +
    points.length + ')</div>';
}

// ---------- Disegno del grafico su canvas ----------

function drawChart(points) {
  const canvas = document.getElementById('stats-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = 50;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  if (points.length === 0) {
    ctx.fillStyle = '#999999';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nessun dato', W / 2, H / 2);
    return;
  }

  const accent = getAccentColor();
  const times = points.map(function (p) { return p.parTime; });
  let min = Math.min.apply(null, times);
  let max = Math.max.apply(null, times);
  if (min === max) { min -= 0.5; max += 0.5; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  // Assi
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 10); ctx.lineTo(PAD, H - PAD);
  ctx.lineTo(W - 10, H - PAD);
  ctx.stroke();

  // Etichette asse Y (4 valori)
  ctx.fillStyle = '#999999';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const v = max - (max - min) * i / 3;
    const y = 10 + (H - PAD - 10) * i / 3;
    ctx.fillText(v.toFixed(2), PAD - 6, y + 4);
    ctx.strokeStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(PAD, y); ctx.lineTo(W - 10, y);
    ctx.stroke();
  }

  // Posizione X: distribuzione uniforme (una tacca per sessione)
  function xPos(i) {
    if (points.length === 1) return (PAD + W - 10) / 2;
    return PAD + (W - 10 - PAD) * i / (points.length - 1);
  }
  function yPos(v) {
    return 10 + (H - PAD - 10) * (max - v) / (max - min);
  }

  // Linea del par time
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(xPos(i), yPos(p.parTime));
    else ctx.lineTo(xPos(i), yPos(p.parTime));
  });
  ctx.stroke();

  // Punti: verdi se successo, rossi se fallimento
  points.forEach(function (p, i) {
    ctx.fillStyle = p.success ? '#2ecc71' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(p.parTime), 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Etichette date: solo prima e ultima, per non affollare
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'left';
  ctx.fillText(new Date(points[0].date).toLocaleDateString('it-IT'),
    PAD, H - PAD + 20);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(points[points.length - 1].date).toLocaleDateString('it-IT'),
    W - 10, H - PAD + 20);
}
