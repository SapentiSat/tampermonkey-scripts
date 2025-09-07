// ==UserScript==
// @name         Podświetl sekcje „Notatka wewnętrzna”
// @namespace    suuhouse.tools
// @version      1.0
// @description  Na stronie szczegółów zamówienia podświetla sekcję „Notatka wewnętrzna” na czerwono (50% przejrzystości).
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // wstrzykujemy prosty CSS dla podświetlenia
  const style = document.createElement('style');
  style.textContent = `
    .suu-note-highlighted {
      background: rgba(255, 0, 0, 0.3) !important; /* 50% */
      outline: 2px solid rgba(255, 0, 0, 0.85);
      border-radius: 8px;
      transition: background 120ms ease-in-out, outline 120ms ease-in-out;
    }
  `;
  document.documentElement.appendChild(style);

  function highlightNoteRow() {
    // szukamy etykiety „Notatka wewnętrzna:”
    const spans = document.querySelectorAll('span');
    let changed = false;

    spans.forEach((sp) => {
      const label = (sp.textContent || '').trim();
      if (label === 'Notatka wewnętrzna:') {
        // znajdź najbliższy wiersz formularza
        const row = sp.closest('.rjsf-form-row');
        if (row && !row.classList.contains('suu-note-highlighted')) {
          row.classList.add('suu-note-highlighted');
          changed = true;
        }
      }
    });

    return changed;
  }

  // pierwsze próby (UI potrafi doczytywać sekcje)
  let tries = 0;
  const int = setInterval(() => {
    if (highlightNoteRow() || ++tries > 60) clearInterval(int);
  }, 300);

  // obserwacja zmian DOM (np. po przełączeniu zakładek/edycji)
  const mo = new MutationObserver(() => highlightNoteRow());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ręczny trigger z konsoli
  window.SUU_HL_INTERNAL_NOTE = highlightNoteRow;
})();
