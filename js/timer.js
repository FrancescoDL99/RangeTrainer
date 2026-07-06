// ============================================================
// timer.js — Audio: beep, delay randomico, sequenze continue
// ============================================================

// Contesto audio globale (creato al primo utilizzo, perche' i browser
// richiedono un gesto dell'utente prima di attivare l'audio)
let audioCtx = null;

function getAudioContext() {
  if (audioCtx === null) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Se il contesto e' stato sospeso dal browser (es. app in background), lo riattiva
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ---------- Tonalita' disponibili ----------
// Ogni tonalita' ha un nome (mostrato all'utente nello Stage Designer)
// e una frequenza in Hz. La tonalita' A e' quella classica degli shot timer.

const BEEP_TONES = [
  { id: 'A', name: 'Standard (acuto)', freq: 2000 },
  { id: 'B', name: 'Medio', freq: 1400 },
  { id: 'C', name: 'Basso', freq: 900 },
  { id: 'D', name: 'Grave', freq: 600 },
  { id: 'E', name: 'Doppio acuto', freq: 2500 }
];

function getToneById(toneId) {
  for (let i = 0; i < BEEP_TONES.length; i++) {
    if (BEEP_TONES[i].id === toneId) return BEEP_TONES[i];
  }
  return BEEP_TONES[0];
}

// ---------- Generazione di un singolo beep ----------
// "when" e' il momento esatto sull'orologio audio in cui il beep deve suonare.
// Durata standard: 150 millisecondi, come uno shot timer reale.

const BEEP_DURATION = 0.15;

function scheduleBeep(ctx, freq, when) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'square';
  oscillator.frequency.value = freq;

  // Inviluppo del volume: attacco immediato, rilascio rapido per evitare "click"
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.8, when + 0.005);
  gain.gain.setValueAtTime(0.8, when + BEEP_DURATION - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + BEEP_DURATION);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(when);
  oscillator.stop(when + BEEP_DURATION + 0.01);
}

// Beep immediato (per test tonalita' nello Stage Designer)
function playBeepNow(toneId) {
  const ctx = getAudioContext();
  const tone = getToneById(toneId);
  scheduleBeep(ctx, tone.freq, ctx.currentTime + 0.05);
}

// ---------- Delay randomico ----------

function randomDelay(minSec, maxSec) {
  return minSec + Math.random() * (maxSec - minSec);
}

// ---------- Sequenza continua ----------
// Cuore del modulo. Riceve una lista di fasi:
//   [ { parTime: 2.0, toneId: 'B' }, { parTime: 1.5, toneId: 'C' }, ... ]
// e programma TUTTA la sequenza in anticipo sull'orologio audio:
//   beep start -> parTime fase 1 -> beep fase 1 -> parTime fase 2 -> ... -> beep finale.
//
// Parametri:
//   phases        lista delle fasi (per l'esercizio semplice: una sola fase)
//   delayMin/Max  intervallo del delay randomico prima del beep di start
//   startToneId   tonalita' del beep di partenza
//   callbacks     funzioni chiamate nei momenti chiave (per aggiornare lo schermo):
//     onWaiting()            durante l'attesa randomica
//     onStart()              al beep di partenza
//     onPhaseBeep(index)     al beep di fine di ogni fase (index parte da 0)
//     onFinished()           dopo il beep dell'ultima fase
//
// Restituisce un oggetto con .cancel() per interrompere tutto,
// e .timeline: gli istanti assoluti (in secondi dall'inizio) di ogni evento,
// che serviranno allo Stage Designer per gli eventi temporizzati a video.

function runBeepSequence(phases, delayMin, delayMax, startToneId, callbacks) {
  const ctx = getAudioContext();
  const jsTimeouts = [];
  let cancelled = false;

  const delay = randomDelay(delayMin, delayMax);
  const startTime = ctx.currentTime + delay;

  // --- Programmazione audio (precisa, sull'orologio della scheda audio) ---

  // Beep di partenza
  const startTone = getToneById(startToneId || 'A');
  scheduleBeep(ctx, startTone.freq, startTime);

  // Beep di ogni fase, in sequenza continua
  const timeline = { start: 0, phases: [] };
  let elapsed = 0;
  for (let i = 0; i < phases.length; i++) {
    elapsed += phases[i].parTime;
    const tone = getToneById(phases[i].toneId);
    scheduleBeep(ctx, tone.freq, startTime + elapsed);
    timeline.phases.push(elapsed);
  }
  const totalDuration = elapsed;

  // --- Notifiche a video (tramite timer JS, la cui precisione qui basta:
  //     servono solo ad aggiornare lo schermo, non a generare suoni) ---

  function schedule(fn, seconds) {
    const t = setTimeout(function () {
      if (!cancelled) fn();
    }, seconds * 1000);
    jsTimeouts.push(t);
  }

  if (callbacks.onWaiting) callbacks.onWaiting();
  if (callbacks.onStart) schedule(callbacks.onStart, delay);
  for (let i = 0; i < phases.length; i++) {
    (function (index) {
      if (callbacks.onPhaseBeep) {
        schedule(function () { callbacks.onPhaseBeep(index); }, delay + timeline.phases[index]);
      }
    })(i);
  }
  if (callbacks.onFinished) {
    schedule(callbacks.onFinished, delay + totalDuration + 0.2);
  }

  // --- Oggetto di controllo restituito ---

  return {
    timeline: timeline,
    totalDuration: totalDuration,
    cancel: function () {
      cancelled = true;
      for (let i = 0; i < jsTimeouts.length; i++) {
        clearTimeout(jsTimeouts[i]);
      }
      // Interrompe anche i suoni gia' programmati chiudendo e ricreando il contesto
      if (audioCtx !== null) {
        audioCtx.close();
        audioCtx = null;
      }
    }
  };
}
