// ==UserScript==
// @name         Podświetl sekcję „Notatka wewnętrzna”
// @namespace    suuhouse.tools
// @author       valiantsin12@gmail.com
// @version      1.0.0
// @description  Podświetla sekcję „Notatka wewnętrzna”
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/SapentiSat/tampermonkey-scripts
// @updateURL    https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/Update highlight-note.user.js
// @downloadURL  https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/highlight-note.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
   *  BLOK A — CONFIG (Pamięć Tampermonkey)
   *  — Jedyny blok, który edytujesz przy dodawaniu nowych zmiennych
   *  — Brak migracji; po update dodaje TYLKO brakujące pola
   *  — Nie nadpisuje istniejących wartości użytkownika
   * ========================================================= */

  // Wszystko trzymamy pod jednym kluczem, izolowanym per-skrypt
  const K_DATA = 'CONFIG';

  // 1) Zdefiniuj zmienne dla TEGO skryptu:
  //    - Pola z DOMYŚLNYMI: wpisz wartość (string/number/bool)
  //    - Pola BEZ domyślnej: wpisz null (albo ''), by utworzyć „slot” w Pamięci
  const DEFAULTS = {
    version: 1, // na przyszłość (nie używana do migracji)
    vars: {
      // ——— edytowalne w Pamięci ———
      BG_RGBA: 'rgba(255, 0, 0, 0.1)',      // ma domyślną
      NOTE_LABEL: 'Notatka wewnętrzna:',    // ma domyślną
      ENABLE_HIGHLIGHT: true,               // ma domyślną

      // przykłady „bez domyślnej” — tworzą się w Pamięci, ale puste,
      // użytkownik może je wypełnić; logika powinna to tolerować
      OUTLINE_RGBA: null,                   // brak domyślnej (użyjemy fallbacku w logice)
      BORDER_RADIUS_PX: null,               // brak domyślnej (fallback)
      TRANSITION_MS: null                   // brak domyślnej (fallback)
    }
  };

  // 2) Init/storage helpers

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  // Ładuje CONFIG z Pamięci, dokłada brakujące pola z DEFAULTS.vars (bez nadpisywania istniejących)
  function loadConfigAndAutomerge() {
    const saved = GM_getValue(K_DATA, null);

    // jeśli nie ma nic — zapisujemy DEFAULTS „as is”
    if (!saved || typeof saved !== 'object') {
      const fresh = clone(DEFAULTS);
      GM_setValue(K_DATA, fresh);
      return fresh;
    }

    // mamy istniejący obiekt — uzupełnijmy brakujące klucze
    const merged = clone(saved);
    if (!merged.vars || typeof merged.vars !== 'object') merged.vars = {};

    // dodaj WSZYSTKIE pola z DEFAULTS.vars, których nie ma w saved
    for (const [key, defVal] of Object.entries(DEFAULTS.vars)) {
      if (!Object.prototype.hasOwnProperty.call(merged.vars, key)) {
        merged.vars[key] = defVal; // dodaj nowe pole (nie ruszaj istniejących)
      }
    }

    // opcjonalnie możesz aktualizować wersję (nie wpływa na wartości)
    merged.version = DEFAULTS.version;

    // zapisz z powrotem, jeśli coś dołożyliśmy lub struktura była niepełna
    GM_setValue(K_DATA, merged);
    return merged;
  }

  const CFG = loadConfigAndAutomerge();

  // 3) Wygodny accessor
  function getVar(name) {
    return (CFG && CFG.vars && Object.prototype.hasOwnProperty.call(CFG.vars, name))
      ? CFG.vars[name]
      : undefined;
  }

  /* =========================================================
   *  BLOK B — LOGIKA SKRYPTU (używa wartości z CONFIG)
   *  — Nic tu nie zapisuje do Pamięci
   *  — Toleruje puste/nieustawione zmienne (fallbacki)
   * ========================================================= */

  // Fallbacki dla zmiennych bez domyślnych (albo gdy user nie ustawił)
  const BG        = getVar('BG_RGBA') ?? '';                         // string lub pusty
  const LABEL     = String(getVar('NOTE_LABEL') ?? 'Notatka wewnętrzna:');
  const ENABLE    = Boolean(getVar('ENABLE_HIGHLIGHT') ?? true);

  const OUTLINE   = String(getVar('OUTLINE_RGBA') ?? 'rgba(255, 0, 0, 0.85)');
  const RADIUS    = Number(getVar('BORDER_RADIUS_PX') ?? 8);
  const TRANS_MS  = Number(getVar('TRANSITION_MS') ?? 120);

  // — Style — używają fallbacków, więc zadziałają nawet gdy user nie wypełnił pól
  function injectStyles() {
    const style = document.createElement('style');
    const bgRule = BG ? `background: ${BG} !important;` : '';
    style.textContent = `
      .suu-note-highlighted {
        ${bgRule}
        outline: 2px solid ${OUTLINE};
        border-radius: ${Number.isFinite(RADIUS) ? RADIUS : 8}px;
        transition: background ${Number.isFinite(TRANS_MS) ? TRANS_MS : 120}ms ease-in-out,
                    outline ${Number.isFinite(TRANS_MS) ? TRANS_MS : 120}ms ease-in-out;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function highlightNoteRow() {
    if (!ENABLE) return false;

    const spans = document.querySelectorAll('span');
    let changed = false;

    for (const sp of spans) {
      const label = (sp.textContent || '').trim();
      if (label === LABEL) {
        const row = sp.closest('.rjsf-form-row');
        if (row && !row.classList.contains('suu-note-highlighted')) {
          row.classList.add('suu-note-highlighted');
          changed = true;
        }
      }
    }
    return changed;
  }

  // start
  injectStyles();

  let tries = 0;
  const int = setInterval(() => {
    if (highlightNoteRow() || ++tries > 60) clearInterval(int);
  }, 300);

  const mo = new MutationObserver(() => highlightNoteRow());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // dev helper
  window.SUU_HL_INTERNAL_NOTE = highlightNoteRow;
})();
