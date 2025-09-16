// ==UserScript==
// @name         Podświetl sekcję „Notatka wewnętrzna”
// @namespace    suuhouse.tools
// @author       valiantsin12@gmail.com
// @version      2.4
// @description  Podświetla sekcję „Notatka wewnętrzna”
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/SapentiSat/tampermonkey-scripts
// @updateURL    https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/highlight-note.user.js
// @downloadURL  https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/highlight-note.user.js
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .suu-note-highlighted {
      background: rgba(255, 0, 0, 0.15) !important; /* 50% */
      outline: 2px solid rgba(255, 0, 0, 0.85);
      border-radius: 8px;
      transition: background 120ms ease-in-out, outline 120ms ease-in-out;
    }
  `;
  document.documentElement.appendChild(style);

  function highlightNoteRow() {
    const spans = document.querySelectorAll('span');
    let changed = false;

    spans.forEach((sp) => {
      const label = (sp.textContent || '').trim();
      if (label === 'Notatka wewnętrzna:') {
        const row = sp.closest('.rjsf-form-row');
        if (row && !row.classList.contains('suu-note-highlighted')) {
          row.classList.add('suu-note-highlighted');
          changed = true;
        }
      }
    });

    return changed;
  }

  let tries = 0;
  const int = setInterval(() => {
    if (highlightNoteRow() || ++tries > 60) clearInterval(int);
  }, 300);

  const mo = new MutationObserver(() => highlightNoteRow());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  window.SUU_HL_INTERNAL_NOTE = highlightNoteRow;
})();
