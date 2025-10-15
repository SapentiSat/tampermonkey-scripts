// ==UserScript==
// @name         Podświetl sekcję „-Notatka wewnętrzna-”
// @namespace    suuhouse.tools
// @author       valiantsin12@gmail.com
// @version      1.5.0
// @description  Podświetla sekcję „Notatka wewnętrzna”
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @noframes
// @icon         https://suuhouse.pl/favicon.ico
// @homepageURL  https://github.com/SapentiSat/tampermonkey-scripts
// @updateURL    https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/Update highlight-note.user.js
// @downloadURL  https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/highlight-note.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==


(function () {
  'use strict';

  /* =========================================================
   *  BLOK 1 — STORAGE + CONFIG
   *  Kolejność kluczy w Pamięci:
   *    - CONFIG
   *    - LOG_CONFIG
   *    - LOGS
   * ========================================================= */

  const K_CFG         = 'CONFIG';
  const K_LOG_CONFIG  = 'LOG_CONFIG';
  const K_LOGS        = 'LOGS'; // tablica wpisów loggera

  const DEFAULTS_CONFIG = {
    version: 1,
    vars: {
      BG_RGBA: 'rgba(255, 0, 0, 0.12)',
      NOTE_LABEL: 'Notatka wewnętrzna:',
      ENABLE_HIGHLIGHT: true,
      // wymagane (bez domyślnej)
      OUTLINE_RGBA: "rgba(255, 0, 0, 0.9)",
      BORDER_RADIUS_PX: 10,
      TRANSITION_MS: 120,
      TEST11: null
    }
  };

  const DEFAULTS_LOG_CONFIG = {
    version: 1,
    vars: {
      TYPE:  'error',  // 'debug' | 'info' | 'warn' | 'error'  (zostawiamy 'error')
      LIMIT: 200       // ile ostatnich wpisów trzymać
    }
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function loadAndMerge(key, defaultsObj) {
    let saved;
    try { saved = GM_getValue(key, null); } catch { saved = null; }
    if (!saved || typeof saved !== 'object') {
      const fresh = clone(defaultsObj);
      try { GM_setValue(key, fresh); } catch {}
      return fresh;
    }
    const merged = clone(saved);
    if (!merged.vars || typeof merged.vars !== 'object') merged.vars = {};
    for (const [k, defVal] of Object.entries(defaultsObj.vars)) {
      if (!Object.prototype.hasOwnProperty.call(merged.vars, k)) {
        merged.vars[k] = defVal; // dodaj brakujące — nie nadpisuj istniejących
      }
    }
    merged.version = defaultsObj.version;
    try { GM_setValue(key, merged); } catch {}
    return merged;
  }

  const CFG        = loadAndMerge(K_CFG,        DEFAULTS_CONFIG);
  const LOG_CONFIG = loadAndMerge(K_LOG_CONFIG, DEFAULTS_LOG_CONFIG);

  const getCfg  = (k) => (CFG.vars && Object.prototype.hasOwnProperty.call(CFG.vars, k)) ? CFG.vars[k] : undefined;
  const getLogO = (k) => (LOG_CONFIG.vars && Object.prototype.hasOwnProperty.call(LOG_CONFIG.vars, k)) ? LOG_CONFIG.vars[k] : undefined;

  /* =========================================================
   *  BLOK 2 — MINIMALNY LOGGER (tylko błędy przy TYPE:error)
   * ========================================================= */

  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const levelName = String(getLogO('TYPE') ?? 'error').toLowerCase();
  const LEVEL_NOW = LEVELS[levelName] ?? LEVELS.error;
  const LOG_LIMIT = Math.max(10, Number(getLogO('LIMIT') ?? 200) || 200);

  const safeStr = (v) => {
    try { return typeof v === 'string' ? v : JSON.stringify(v); }
    catch { try { return String(v); } catch { return '[Unserializable]'; } }
  };

  function logPersist(type, ...args) {
    try {
      const lvl = LEVELS[type] ?? LEVELS.info;
      if (lvl < LEVEL_NOW) return; // przy TYPE:error przejdą tylko 'error'

      // do konsoli
      const fn = console[type] || console.log;
      fn.call(console, '[HL]', ...args);

      // do bufora w Pamięci
      const arr = (GM_getValue(K_LOGS, []) || []);
      arr.push({ t: new Date().toISOString(), type, info: args.map(safeStr).join(' ') });
      if (arr.length > LOG_LIMIT) arr.splice(0, arr.length - LOG_LIMIT);
      GM_setValue(K_LOGS, arr);
    } catch {
      // logowanie nigdy nie może zabić skryptu
    }
  }

  const log = {
    error: (...a) => logPersist('error', ...a),
    warn : (...a) => logPersist('warn',  ...a),
    info : (...a) => logPersist('info',  ...a),
    debug: (...a) => logPersist('debug', ...a),
  };

  // globalne przechwytywanie błędów — KLUCZOWE
  window.addEventListener('error', (e) => {
    log.error('Uncaught Error:', e.message, `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    log.error('Unhandled Promise rejection:', safeStr(e.reason));
  });

  // pomocnicze komendy w DevTools
  window.SUU_LOGS_DUMP  = () => (GM_getValue(K_LOGS, []) || []);
  window.SUU_LOGS_CLEAR = () => { try { GM_setValue(K_LOGS, []); } catch {} };

  /* =========================================================
   *  BLOK 3 — WYMAGANE ZMIENNE + BANER
   * ========================================================= */

  const REQUIRED_VARS = ['OUTLINE_RGBA', 'BORDER_RADIUS_PX', 'TRANSITION_MS'];

  const SCRIPT_NAME =
    (typeof GM_info === 'object' && GM_info.script && GM_info.script.name)
      ? GM_info.script.name
      : 'Userscript';

  function findMissingRequiredVars() {
    const out = [];
    for (const k of REQUIRED_VARS) {
      const v = getCfg(k);
      const empty = (v === null || v === undefined || (typeof v === 'string' && v.trim() === ''));
      if (empty) out.push(k);
    }
    return out;
  }

  function showConfigErrorBanner(missingKeys) {
    const count_var_limit = 3;
    const total = missingKeys.length;
    const firstN = missingKeys.slice(0, count_var_limit);
    const rest   = missingKeys.slice(count_var_limit);

    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      zIndex: '2147483647',
      right: '14px',
      bottom: '16px',
      width: '400px',
      height: '220px',
      background: '#fff',
      border: '1px solid #ef4444',
      boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
      borderRadius: '12px',
      fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
      fontSize: '12px',
      color: '#111',
      padding: '10px',
      overflow: 'auto',
      overscrollBehavior: 'contain'
    });

    root.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; color:#991b1b; margin-bottom:6px;">
            Brak wymaganych zmiennych w pamięci skryptu:<br>
            <span style="color:#065f46; font-weight:700; font-size:14px;">${SCRIPT_NAME}</span>
          </div>

          <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
            <div>Uzupełnij w: <b>Pamięć</b> → <code>${K_CFG}.vars</code></div>
            <span style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:2px 6px; border-radius:999px; font-size:12px;">
              brakuje: ${total}
            </span>
          </div>

          <ul style="margin:0 0 6px 18px; padding:0; list-style:disc;">
            ${firstN.map(k => `<li><code>${k}</code></li>`).join('')}
          </ul>

          ${rest.length ? `
            <div style="margin:2px 0 6px 0;">
              <button type="button" data-suu-toggle
                style="border:none; background:#ecfeff; color:#075985; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:12px;">
                ▼ Pokaż pozostałe (${rest.length})
              </button>
            </div>
            <div data-suu-more style="display:none; border-top:1px dashed #e5e7eb; padding-top:6px; max-height:90px; overflow:auto; font-size:12px;">
              <ul style="margin:0 0 8px 18px; padding:0; list-style:disc;">
                ${rest.map(k => `<li><code>${k}</code></li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <strong style="opacity:.95; font-size:14px; display:block; margin-top:6px;">Po uzupełnieniu odśwież stronę.</strong>
        </div>

        <button type="button" aria-label="Zamknij"
          style="border:none; background:#fee2e2; color:#991b1b; padding:6px 10px; border-radius:8px; cursor:pointer; align-self:flex-start;">
          ✕
        </button>
      </div>
    `;

    root.querySelector('button[aria-label="Zamknij"]')?.addEventListener('click', () => root.remove());
    const toggleBtn = root.querySelector('button[data-suu-toggle]');
    const moreBox   = root.querySelector('div[data-suu-more]');
    if (toggleBtn && moreBox) {
      let opened = false;
      toggleBtn.addEventListener('click', () => {
        opened = !opened;
        moreBox.style.display = opened ? 'block' : 'none';
        toggleBtn.textContent = opened ? '▲ Ukryj pozostałe' : `▼ Pokaż pozostałe (${rest.length})`;
      });
    }

    // wpinamy do BODY, fallback do alert jeśli CSP zetnie styl
    const attach = () => {
      (document.body || document.documentElement).appendChild(root);
      setTimeout(() => {
        if (!root.isConnected || root.offsetHeight === 0) {
          alert('Brak wymaganych zmiennych: ' + missingKeys.join(', ') + '\nUzupełnij w: Pamięć → CONFIG.vars');
        }
      }, 50);
    };
    if (document.body) attach();
    else {
      const ro = new MutationObserver(() => {
        if (document.body) { ro.disconnect(); attach(); }
      });
      ro.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  const missing = findMissingRequiredVars();
  if (missing.length > 0) {
    log.error('Missing required vars:', missing);
    showConfigErrorBanner(missing);
    return; // STOP — bez kompletu zmiennych nie uruchamiamy logiki
  }

  /* =========================================================
   *  BLOK 4 — LOGIKA SKRYPTU
   * ========================================================= */

  const BG        = getCfg('BG_RGBA') ?? '';
  const LABEL     = String(getCfg('NOTE_LABEL') ?? 'Notatka wewnętrzna:');
  const ENABLE    = Boolean(getCfg('ENABLE_HIGHLIGHT') ?? true);

  const OUTLINE   = String(getCfg('OUTLINE_RGBA'));
  const RADIUS    = Number(getCfg('BORDER_RADIUS_PX'));
  const TRANS_MS  = Number(getCfg('TRANSITION_MS'));

  function injectStyles() {
    try {
      const style = document.createElement('style');
      const bgRule = BG ? `background: ${BG} !important;` : '';
      style.textContent = `
        .suu-note-highlighted {
          ${bgRule}
          outline: 2px solid ${OUTLINE};
          border-radius: ${Number.isFinite(RADIUS) ? RADIUS : 8}px;
          transition:
            background ${Number.isFinite(TRANS_MS) ? TRANS_MS : 120}ms ease-in-out,
            outline ${Number.isFinite(TRANS_MS) ? TRANS_MS : 120}ms ease-in-out;
        }
      `;
      document.documentElement.appendChild(style);
    } catch (e) {
      log.error('Failed to inject styles:', e && e.message ? e.message : e);
    }
  }

  function highlightNoteRow() {
    try {
      if (!ENABLE) return false;
      const spans = document.querySelectorAll('span');
      let changed = false;
      for (const sp of spans) {
        const txt = (sp.textContent || '').trim();
        if (txt === LABEL) {
          const row = sp.closest('.rjsf-form-row');
          if (row && !row.classList.contains('suu-note-highlighted')) {
            row.classList.add('suu-note-highlighted');
            changed = true;
          }
        }
      }
      return changed;
    } catch (e) {
      log.error('highlightNoteRow failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  // start
  injectStyles();

  let tries = 0;
  try {
    const int = setInterval(() => {
      if (highlightNoteRow() || ++tries > 60) clearInterval(int);
    }, 300);

    const mo = new MutationObserver(() => highlightNoteRow());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    log.error('Init flow failed:', e && e.message ? e.message : e);
  }
})();
