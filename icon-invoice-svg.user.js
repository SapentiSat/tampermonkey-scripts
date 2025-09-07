// ==UserScript==
// @name         Ikona SVG kiedy klient prosi o FV
// @namespace    suuhouse.tools
// @author       valiantsin12@gmail.com
// @version      2.0
// @description  Gdy invoice.required===true i additionalField1 === "Dokument sprzedaży dodany" — ikona NIEBIESKA, w innym wypadku POMARAŃCZOWA.
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders*
// @run-at       document-start
// @grant        none
// @noframes
// @homepageURL  https://github.com/SapentiSat/tampermonkey-scripts
// @updateURL    https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/icon-invoice-svg.user.js
// @downloadURL  https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/icon-invoice-svg.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- stałe / utilsy ---
  const ICON_CLASS = 'suu-invoice-req';
  const BLUE  = '#1ad2f0';   // plik sprzedaży dodany
  const ORANGE = '#ff9900';  // wymagane, ale brak pliku.

  const makeIconSvg = (color) => `
    <svg class="${ICON_CLASS}" width="30" height="30" viewBox="0 0 24 24"
         xmlns="http://www.w3.org/2000/svg" fill="${color}"
         aria-hidden="true" title="Wymagana faktura/paragon"
         style="margin-left:4px;vertical-align:middle">
      <path d="M12,14a1,1,0,0,0-1,1v2a1,1,0,0,0,2,0V15A1,1,0,0,0,12,14Zm.38-2.92A1,1,0,0,0,11.8,11l-.18.06-.18.09-.15.12A1,1,0,0,0,11,12a1,1,0,0,0,.29.71,1,1,0,0,0,.33.21A.84.84,0,0,0,12,13a1,1,0,0,0,.71-.29A1,1,0,0,0,13,12a1,1,0,0,0-.29-.71A1.15,1.15,0,0,0,12.38,11.08ZM20,8.94a1.31,1.31,0,0,0-.06-.27l0-.09a1.07,1.07,0,0,0-.19-.28h0l-6-6h0a1.07,1.07,0,0,0-.28-.19l-.1,0A1.1,1.1,0,0,0,13.06,2H7A3,3,0,0,0,4,5V19a3,3,0,0,0,3,3H17a3,3,0,0,0,3-3V9S20,9,20,8.94ZM14,5.41,16.59,8H15a1,1,0,0,1-1-1ZM18,19a1,1,0,0,1-1,1H7a1,1,0,0,1-1-1V5A1,1,0,0,1,7,4h5V7a3,3,0,0,0,3,3h3Z"/>
    </svg>
  `.trim();

  // Przechowujemy więcej niż boolean:
  // orderId -> { required: boolean, hasDoc: boolean }
  const orders = new Map();

  // --- UI ---
  function updateRowUI(row) {
    const orderId = row?.getAttribute('data-id');
    if (!orderId) return;

    const info = orders.get(orderId);
    if (!info) return;

    const cell = row.querySelector('[role="gridcell"][data-field="graphicInfo"]');
    if (!cell) return;

    const container = cell.firstElementChild || cell;
    let icon = container.querySelector(`.${ICON_CLASS}`);

    if (!info.required) {
      if (icon) icon.remove();
      return;
    }

    const color = info.hasDoc ? BLUE : ORANGE;

    if (!icon) {
      container.insertAdjacentHTML('beforeend', makeIconSvg(color));
    } else if (icon.getAttribute('fill') !== color) {
      icon.setAttribute('fill', color);
      // dla pewności zaktualizuj też atrybut style, jeśli kiedyś byłby nadpisany
      icon.style.fill = color;
    }
  }

  function updateAllVisibleRows() {
    document.querySelectorAll('div[role="row"][data-id]').forEach(updateRowUI);
  }

  // --- JSON parsowanie ---
  const DOC_OK_TEXT = 'Dokument sprzedaży dodany';

  function processOrdersListJson(json) {
    const arr = json?.list;
    if (!Array.isArray(arr)) return;
    let changed = false;

    for (const it of arr) {
      const id = String(it?.id ?? '');
      if (!id) continue;

      const required = !!(it?.invoice?.required);
      const hasDoc = required && (String(it?.additionalField1 ?? '').trim() === DOC_OK_TEXT);

      const prev = orders.get(id);
      if (!prev || prev.required !== required || prev.hasDoc !== hasDoc) {
        orders.set(id, { required, hasDoc });
        changed = true;
      }
    }
    if (changed) updateAllVisibleRows();
  }

  function processOrderDetailsJson(json) {
    const id = String(json?.id ?? '');
    if (!id) return;

    const required = !!(json?.invoice?.required);
    const hasDoc = required && (String(json?.additionalField1 ?? '').trim() === DOC_OK_TEXT);

    const prev = orders.get(id);
    if (!prev || prev.required !== required || prev.hasDoc !== hasDoc) {
      orders.set(id, { required, hasDoc });
      updateAllVisibleRows();
    }
  }

  // --- fetch/XHR hook ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = (args[0] instanceof Request) ? args[0].url : String(args[0]);
      if (url.includes('/api/v3/Orders')) {
        res.clone().json().then(processOrdersListJson).catch(() => {});
      } else if (/\/api\/v2\/Orders\/\d+/.test(url)) {
        res.clone().json().then(processOrderDetailsJson).catch(() => {});
      }
    } catch {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._tm_url = String(url || '');
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        const url = this._tm_url || '';
        if (!this.responseText) return;

        if (url.includes('/api/v3/Orders')) {
          processOrdersListJson(JSON.parse(this.responseText));
        } else if (/\/api\/v2\/Orders\/\d+/.test(url)) {
          processOrderDetailsJson(JSON.parse(this.responseText));
        }
      } catch {}
    });
    return origSend.apply(this, args);
  };

  // --- obserwacja DOM (wirtualizacja/paginacja) ---
  const mo = new MutationObserver(() => updateAllVisibleRows());
  const startObserve = () => mo.observe(document.documentElement, { childList: true, subtree: true });

  let tries = 0;
  const int = setInterval(() => {
    updateAllVisibleRows();
    if (++tries > 60) clearInterval(int);
  }, 300);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserve, { once: true });
  } else {
    startObserve();
  }

  // ręczny trigger
  window.SUU_UPDATE_INVOICE_ICONS = updateAllVisibleRows;
})();
