// ==UserScript==
// @name         Podświetl sekcję „do wyboru”
// @namespace    suuhouse.tools
// @author       valiantsin12@gmail.com
// @version      7.0
// @description  Czysty skrypt logiczny wykorzystujący SuuCore_vv
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @noframes
// @icon         https://suuhouse.pl/favicon.ico
// @require      https://gist.githubusercontent.com/SapentiSat/14e92c1c9fffde5af55a70f4da77ad1d/raw/93190fe4f865abebdf548c1fea3d5984f05fe91a/SuuCore_MenuLogsWygoda_vv.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// ==/UserScript==

(function () {
  'use strict';

  // 1. Zdefiniuj strukturę formularza dla TEGO konkretnego skryptu
  // (Używamy funkcji utils.createTooltip dostarczonej przez rdzeń)
  const tt = SuuCore_vv.utils.createTooltip;
  const SETTINGS_HTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
      <div><label style="font-size: 12px; font-weight: bold;">Włącz podświetlenie</label>
           <select id="suu-in-enable" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 4px;"><option value="true">Tak</option><option value="false">Nie</option></select></div>
      <div><label style="font-size: 12px; font-weight: bold;">Szukana etykieta</label>
           <input type="text" id="suu-in-label" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 4px;"></div>

      <div><label style="font-size: 12px; font-weight: bold;">Kolor tła ${tt('Kolor wypełnienia. Reguluj suwakiem przezroczystość.')}</label>
           <div class="suu-color-row">
             <input type="color" id="suu-bg-hex" class="suu-color-picker">
             <input type="range" id="suu-bg-alpha" class="suu-alpha-slider" min="0" max="1" step="0.01">
             <span id="suu-bg-val" style="font-size: 11px; width: 30px; text-align:right;"></span>
           </div>
      </div>

      <div><label style="font-size: 12px; font-weight: bold;">Kolor ramki ${tt('Kolor obramowania. Reguluj suwakiem.')}</label>
           <div class="suu-color-row">
             <input type="color" id="suu-out-hex" class="suu-color-picker">
             <input type="range" id="suu-out-alpha" class="suu-alpha-slider" min="0" max="1" step="0.01">
             <span id="suu-out-val" style="font-size: 11px; width: 30px; text-align:right;"></span>
           </div>
      </div>

      <div><label style="font-size: 12px; font-weight: bold;">Zaokrąglenie (px)</label><input type="number" id="suu-in-radius" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 4px;"></div>
      <div><label style="font-size: 12px; font-weight: bold;">Czas animacji (ms)</label><input type="number" id="suu-in-trans" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 4px;"></div>
    </div>
  `;

  // 2. LOGIKA BIZNESOWA: Inicjalizujemy potężny rdzeń!
  SuuCore_vv.init({
      scriptName: "Podświetlanie sekcji",
      defaultVars: {
          BG_RGBA: 'rgba(255, 0, 0, 0.12)',
          NOTE_LABEL: 'Notatka wewnętrzna:',
          ENABLE_HIGHLIGHT: true,
          OUTLINE_RGBA: 'rgba(255, 0, 0, 0.9)',
          BORDER_RADIUS_PX: 10,
          TRANSITION_MS: 120
      },
      settingsHTML: SETTINGS_HTML,

      // Co zrobić, gdy użytkownik otworzy okno ustawień (ładowanie danych z pamięci do inputów)
      onLoadUI: (vars) => {
          document.getElementById('suu-in-enable').value = vars.ENABLE_HIGHLIGHT;
          document.getElementById('suu-in-label').value = vars.NOTE_LABEL;
          document.getElementById('suu-in-radius').value = vars.BORDER_RADIUS_PX;
          document.getElementById('suu-in-trans').value = vars.TRANSITION_MS;

          const bg = SuuCore_vv.utils.parseRgbaString(vars.BG_RGBA);
          document.getElementById('suu-bg-hex').value = bg.hex;
          document.getElementById('suu-bg-alpha').value = bg.a;
          document.getElementById('suu-bg-val').textContent = Math.round(bg.a * 100) + '%';

          const out = SuuCore_vv.utils.parseRgbaString(vars.OUTLINE_RGBA);
          document.getElementById('suu-out-hex').value = out.hex;
          document.getElementById('suu-out-alpha').value = out.a;
          document.getElementById('suu-out-val').textContent = Math.round(out.a * 100) + '%';

          // Aktualizacja % na żywo przy ruszaniu suwakiem
          document.getElementById('suu-bg-alpha').oninput = (e) => document.getElementById('suu-bg-val').textContent = Math.round(e.target.value * 100) + '%';
          document.getElementById('suu-out-alpha').oninput = (e) => document.getElementById('suu-out-val').textContent = Math.round(e.target.value * 100) + '%';
      },

      // Co zrobić, gdy użytkownik kliknie "Zapisz" (zbieranie danych z inputów)
      onSaveUI: (vars) => {
          vars.ENABLE_HIGHLIGHT = document.getElementById('suu-in-enable').value === 'true';
          vars.NOTE_LABEL = document.getElementById('suu-in-label').value;
          vars.BORDER_RADIUS_PX = Number(document.getElementById('suu-in-radius').value);
          vars.TRANSITION_MS = Number(document.getElementById('suu-in-trans').value);
          vars.BG_RGBA = SuuCore_vv.utils.buildRgbaString(document.getElementById('suu-bg-hex').value, document.getElementById('suu-bg-alpha').value);
          vars.OUTLINE_RGBA = SuuCore_vv.utils.buildRgbaString(document.getElementById('suu-out-hex').value, document.getElementById('suu-out-alpha').value);
      },

      // Funkcja wywoływana przy starcie skryptu oraz natychmiast po zapisaniu nowych ustawień
      onStart: (vars) => { startHighlighting(vars); },
      onApply: (vars) => { startHighlighting(vars); }
  });

  // =========================================================
  // 3. WŁAŚCIWA LOGIKA SKRYPTU (To co ten skrypt w ogóle robi)
  // =========================================================

  function startHighlighting(vars) {
      if (!vars.OUTLINE_RGBA || !vars.BG_RGBA || !vars.NOTE_LABEL) {
          SuuCore_vv.log.fatal("Brakuje wymaganych kolorów w ustawieniach skryptu!");
          return;
      }

      // Wstrzyknięcie / Aktualizacja CSS
      let style = document.getElementById('suu-highlight-style');
      if (!style) {
          style = document.createElement('style'); style.id = 'suu-highlight-style';
          document.documentElement.appendChild(style);
      }
      style.textContent = `
        .suu-note-highlighted { background: ${vars.BG_RGBA} !important; outline: 2px solid ${vars.OUTLINE_RGBA}; border-radius: ${vars.BORDER_RADIUS_PX}px; transition: background ${vars.TRANSITION_MS}ms ease-in-out, outline ${vars.TRANSITION_MS}ms ease-in-out; }
      `;

      // Logika wyszukiwania
      function highlightNoteRow() {
          if (!vars.ENABLE_HIGHLIGHT) {
              document.querySelectorAll('.suu-note-highlighted').forEach(el => el.classList.remove('suu-note-highlighted'));
              return false;
          }
          let changed = false;
          document.querySelectorAll('span').forEach(sp => {
              if ((sp.textContent || '').trim() === vars.NOTE_LABEL) {
                  const row = sp.closest('.rjsf-form-row');
                  if (row && !row.classList.contains('suu-note-highlighted')) {
                      row.classList.add('suu-note-highlighted'); changed = true; SuuCore_vv.log.info("Znalazłem i podświetliłem notatkę.");
                  }
              }
          });
          return changed;
      }

      // Pętle śledzące
      let tries = 0;
      const int = setInterval(() => { if (highlightNoteRow() || ++tries > 60) clearInterval(int); }, 300);

      // Żeby MutationObserver nie tworzył się w nieskończoność przy każdym kliknięciu "Zapisz", zabezpieczamy go
      if (!window.suuObserverAttached) {
          new MutationObserver(() => highlightNoteRow()).observe(document.documentElement, { childList: true, subtree: true });
          window.suuObserverAttached = true;
      }
  }

})();
