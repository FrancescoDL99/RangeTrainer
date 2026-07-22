// ============================================================
// gate.js — Deterrente con password
// ============================================================
// NOTA: essendo l'app pubblicata come file statici su GitHub Pages,
// questo non e' un sistema di sicurezza vero: e' pensato per tenere
// fuori i visitatori occasionali, non chi sa usare gli strumenti
// sviluppatore del browser.

const RT_GATE_SALT = 'af9aafbf-88da-4947-a3c2-8a2db9b572d0';
const RT_GATE_HASH = 'f9d4893c842e76c4cb21f73861c5345f5ceb078b00d67d07fd8e7aa0faa89751';

const RT_GATE_STORAGE_KEY = 'rt_gate_unlocked';

function rtSha256(text) {
  const enc = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  });
}

function rtUnlock() {
  const screen = document.getElementById('rt-lock-screen');
  if (screen) screen.remove();
}

function rtInitGate() {
  if (localStorage.getItem(RT_GATE_STORAGE_KEY) === '1') {
    rtUnlock();
    return;
  }

  const input = document.getElementById('rt-lock-input');
  const button = document.getElementById('rt-lock-submit');
  const error = document.getElementById('rt-lock-error');

  function attempt() {
    const value = input.value;
    rtSha256(RT_GATE_SALT + value).then(function (hash) {
      if (hash === RT_GATE_HASH) {
        localStorage.setItem(RT_GATE_STORAGE_KEY, '1');
        rtUnlock();
      } else {
        error.classList.remove('hidden');
        input.value = '';
        input.focus();
      }
    });
  }

  button.addEventListener('click', attempt);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attempt();
  });
}

document.addEventListener('DOMContentLoaded', rtInitGate);
