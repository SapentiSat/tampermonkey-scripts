// ==UserScript==
// @name         SUUHOUSE OMS — Notatki (popup czat)
// @namespace    suuhouse.tools
// @author       SapentiSat
// @version      5.0
// @description  Przesuwalny przycisk Notatek, który zapisuje pozycję! Okno zawsze nad przyciskiem.
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @noframes
// @icon         https://suuhouse.pl/favicon.ico
// @homepageURL  https://github.com/SapentiSat/tampermonkey-scripts
// @updateURL    https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/suuhouse-oms-notes.user.js
// @downloadURL  https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/suuhouse-oms-notes.user.js
// @require      https://gist.githubusercontent.com/SapentiSat/14e92c1c9fffde5af55a70f4da77ad1d/raw/3d224b9317fd09a94fdd5495aae981af0a54b95a/SuuCore_MenuLogsWygoda_vv.js
// @connect      sellrocket-notes.valiantsin12.workers.dev
// ==/UserScript==

(() => {
  'use strict';

  // Ukrywamy pływający przycisk ustawień z biblioteki
  GM_addStyle(`div[style*="bottom: 20px"][style*="left: 20px"][style*="z-index: 999999"] { display: none !important; }`);

  const Core = window.SuuCoreFactory('czat_notatek');

  let CFG;
  let isInitialized = false;

  /* =========================================================
   * 1. INTERFEJS USTAWIEŃ
   * ========================================================= */
  const tt = Core.utils.createTooltip;
  const SETTINGS_HTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 6px;">
         <label style="font-size: 12px; font-weight: bold; color: #991b1b;">Token API (Wymagany) ${tt('Sekretny klucz dostępu. Bez niego na górze ekranu pojawi się błąd, a na ikonce notatek wykrzyknik.')}</label>
         <input type="password" id="sh-in-token" style="width: 100%; padding: 8px; border: 1px solid #fca5a5; border-radius: 4px; margin-top: 4px; background: #fff;">
      </div>
      <div>
         <label style="font-size: 12px; font-weight: bold;">Kolor przycisku "Notatki" ${tt('Zmienia tło tylko samego przycisku włączającego czat.')}</label>
         <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
           <input type="color" id="sh-bg-hex" style="width:40px; height:32px; padding:0; border:1px solid #ccc; border-radius:4px; cursor:pointer;">
           <input type="range" id="sh-bg-alpha" min="0" max="1" step="0.01" style="flex-grow:1; cursor:pointer;">
           <span id="sh-bg-val" style="font-size: 11px; width: 35px; text-align:right;"></span>
         </div>
      </div>
      <div>
         <label style="font-size: 12px; font-weight: bold;">Adres Bazy (Worker URL)</label>
         <input type="text" id="sh-in-worker" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 4px;">
      </div>
      <div>
         <label style="font-size: 12px; font-weight: bold;">Adres Autoryzacji (Auth URL)</label>
         <input type="text" id="sh-in-auth" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 4px;">
      </div>
    </div>
  `;

  Core.init({
    scriptName: "Notatki Czat (OMS)",
    defaultVars: {
      SERVER_TOKEN: "",
      LAUNCHER_BG_RGBA: "rgba(37, 99, 235, 1)",
      WORKER_URL: "https://sellrocket-notes.valiantsin12.workers.dev",
      AUTH_URL: "https://suuhouse-smerp-api.enterprise.sellrocket.pl/api/v3/Logon/GetAuthenticatedUser",
      PENDING_MIN_MS: 1200, PENDING_BG_OPACITY: 0.30, OK_BG_OPACITY: 0.60,
      TITLE_SIZE_PX: 13, META_SIZE_PX: 11, NOTE_SIZE_PX: 17, ICON_BTN_PX: 35
    },
    settingsHTML: SETTINGS_HTML,

    onLoadUI: (vars) => {
      document.getElementById('sh-in-token').value = vars.SERVER_TOKEN;
      document.getElementById('sh-in-worker').value = vars.WORKER_URL;
      document.getElementById('sh-in-auth').value = vars.AUTH_URL;

      const bg = Core.utils.parseRgbaString(vars.LAUNCHER_BG_RGBA);
      document.getElementById('sh-bg-hex').value = bg.hex;
      document.getElementById('sh-bg-alpha').value = bg.a;
      document.getElementById('sh-bg-val').textContent = Math.round(bg.a * 100) + '%';

      document.getElementById('sh-bg-alpha').oninput = (e) => document.getElementById('sh-bg-val').textContent = Math.round(e.target.value * 100) + '%';
    },

    onSaveUI: (vars) => {
      vars.SERVER_TOKEN = document.getElementById('sh-in-token').value.trim();
      vars.WORKER_URL = document.getElementById('sh-in-worker').value.trim();
      vars.AUTH_URL = document.getElementById('sh-in-auth').value.trim();
      vars.LAUNCHER_BG_RGBA = Core.utils.buildRgbaString(document.getElementById('sh-bg-hex').value, document.getElementById('sh-bg-alpha').value);
    },

    onStart: (vars) => startApp(vars),
    onApply: (vars) => startApp(vars)
  });

  /* =========================================================
   * 2. GŁÓWNA LOGIKA APLIKACJI
   * ========================================================= */
  function startApp(vars) {
    CFG = vars;

    const closeBtn = document.getElementById('czat_notatek-close-btn');
    if (closeBtn) closeBtn.click();

    injectStyles();

    if (!CFG.SERVER_TOKEN) {
        Core.log.fatal("BRAK TOKENU API! Wpisz go w ustawieniach skryptu.");
    } else {
        Core.log.info("Token zatwierdzony. Gotowe do działania.");
    }

    if (!isInitialized) {
        setupRouting();
        isInitialized = true;
    }
    onRoute();
  }

  function injectStyles() {
    let style = document.getElementById('sh-notes-dynamic-style');
    if(!style){
        style = document.createElement('style');
        style.id = 'sh-notes-dynamic-style';
        document.head.appendChild(style);
    }

    style.textContent = `
      .sh-notes-launcher{position:fixed;z-index:2147483000;background:${CFG.LAUNCHER_BG_RGBA} !important;color:#fff;border:1px solid rgba(0,0,0,0.2);border-radius:14px;padding:16px 56px;cursor:pointer;font:600 20px/1.2 system-ui,sans-serif;box-shadow:0 6px 28px rgba(0,0,0,.35); user-select:none;}
      .sh-notes-launcher .sh-badge{position:absolute;left:-8px;top:-8px;min-width:28px;height:28px;background:#10b981;color:#0b141a;border:2px solid #0b63eb22;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font:700 14px/1 system-ui,sans-serif;padding:0 8px;box-shadow:0 2px 10px rgba(0,0,0,.35)}

      .sh-notes{position:fixed;z-index:2147483000;width:380px;height:550px;min-width:300px;min-height:260px;max-width:520px;max-height:70vh;resize:both;overflow:hidden;background:#0f1115;color:#eaeaea;border:1px solid #2b2f36;border-radius:14px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.45)}
      .sh-notes__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #22262c;background:#12141a;}
      .sh-notes__title{font-weight:700;font-size:${CFG.TITLE_SIZE_PX}px;opacity:.95;}
      .sh-btn{background:#1b1f27;color:#eaeaea;border:1px solid #2c3139;border-radius:8px;height:28px;padding:0 10px;font:500 12px system-ui,sans-serif;cursor:pointer}
      .sh-btn:hover{background:#222733}
      .sh-notes__header .sh-btn{width:${CFG.ICON_BTN_PX}px;height:${CFG.ICON_BTN_PX}px;padding:0;font-size:${Math.round(CFG.ICON_BTN_PX*0.45)}px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px}

      .sh-notes__list{flex:1;overflow:auto;padding:10px 10px 4px 10px;display:flex;flex-direction:column;gap:8px}
      .sh-item{background:#141821;border:1px solid #242a34;border-radius:10px;padding:8px 10px}
      .sh-item__meta{display:flex;gap:8px;justify-content:space-between;opacity:.75;font:${CFG.META_SIZE_PX}px system-ui,sans-serif;margin-bottom:4px}
      .sh-item__text{white-space:pre-wrap;word-break:break-word;font:${CFG.NOTE_SIZE_PX}px/1.5 system-ui,sans-serif}
      .sh-item--pending{background:rgba(37,99,235,${CFG.PENDING_BG_OPACITY})!important;border-color:#1d4ed8}
      .sh-item--ok{background:rgba(37,99,235,${CFG.OK_BG_OPACITY})!important;border-color:#1d4ed8}
      .sh-item--error{border-color:#b91c1c}
      .sh-ok{margin-left:6px;font-size:12px;color:#7CFC7C}
      .sh-err{color:#ff7373;font-size:12px}

      .sh-notes__composer{border-top:1px solid #22262c;padding:10px;display:flex;flex-direction:column;gap:10px;background:#101219}
      .sh-textarea{width:100%;height:90px;font:${CFG.NOTE_SIZE_PX}px/1.35 system-ui,sans-serif;color:#eaeaea;background:#383d61;border:1px solid #252b37;border-radius:10px;padding:10px 12px;outline:none;}
      .sh-textarea:focus{border-color:#33415c}
      .sh-composer__row{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .sh-counter{font:12px system-ui;opacity:.7}
      .sh-counter--warn{color:#ffcc66;opacity:1}
      .sh-counter--max{color:#ff7373;opacity:1}
      .sh-send{background:#16a34a;color:#fff;border:1px solid #15803d;border-radius:10px;height:44px;padding:0 18px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 12px rgba(22,163,74,.35)}
      .sh-send:hover{background:#139047}
      .sh-hidden{display:none!important}
    `;
  }

  /* =========================================================
   * 3. PRZESUWANIE SAMEGO PRZYCISKU (LAUNCHERA)
   * ========================================================= */
  function makeLauncherDraggable(el) {
      let isDragging = false, hasMoved = false, startX, startY, initialLeft, initialTop;

      const pos = GM_getValue('SH_LAUNCHER_POS', null);
      if (pos && pos.left) {
          el.style.right = 'auto'; el.style.bottom = 'auto';
          el.style.left = pos.left; el.style.top = pos.top;
      } else {
          el.style.right = '16px'; el.style.bottom = '16px';
      }

      el.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return; // Tylko lewy przycisk myszy
          isDragging = true;
          hasMoved = false;
          startX = e.clientX; startY = e.clientY;

          const rect = el.getBoundingClientRect();
          initialLeft = rect.left; initialTop = rect.top;

          el.style.right = 'auto'; el.style.bottom = 'auto';
          el.style.left = initialLeft + 'px'; el.style.top = initialTop + 'px';
          el.style.margin = '0';
          document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;

          // Jeśli przesunięto myszkę o więcej niż 3 piksele, uznajemy to za przeciąganie, a nie kliknięcie
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;

          if (hasMoved) {
              el.style.left = (initialLeft + dx) + 'px';
              el.style.top = (initialTop + dy) + 'px';
              updatePopupPosition(el); // Aktualizacja okna na żywo podczas przeciągania
          }
      });

      document.addEventListener('mouseup', () => {
          if (isDragging) {
              isDragging = false;
              document.body.style.userSelect = '';
              if (hasMoved) {
                  // Jeśli użytkownik przeciągnął przycisk - zapisujemy pozycję
                  GM_setValue('SH_LAUNCHER_POS', { left: el.style.left, top: el.style.top });
              } else {
                  // Jeśli użytkownik tylko kliknął (nie przesunął) - otwieramy okno
                  toggle();
              }
          }
      });
  }

  // Funkcja, która zawsze trzyma okno popup idealnie nad przyciskiem
  function updatePopupPosition(launcher) {
      const popup = qs(".sh-notes");
      if (!popup) return;
      const rect = launcher.getBoundingClientRect();

      // Równamy prawą krawędź okna z prawą krawędzią przycisku
      let pRight = window.innerWidth - rect.right;
      // Ustawiamy okno dokładnie 10 pikseli nad przyciskiem
      let pBottom = window.innerHeight - rect.top + 10;

      // Zabezpieczenie przed wyjściem za ekran
      if (pRight < 0) pRight = 10;
      if (pBottom < 0) pBottom = 10;

      popup.style.right = pRight + 'px';
      popup.style.bottom = pBottom + 'px';
      popup.style.left = 'auto';
      popup.style.top = 'auto';
  }

  /* =========================================================
   * 4. STAN I POMOCNIKI
   * ========================================================= */
  let currentOrderId = null;
  let currentUser = null;
  const qs = s => document.querySelector(s);
  const fmt = ts => { const d=new Date(ts), p=n=>String(n).padStart(2,"0"); return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function isOrderPage(u = location.href){ try{const x=new URL(u); return x.hostname.endsWith("sellrocket.pl") && /^\/unified-orders\/\d+(?:\/|$)/.test(x.pathname);}catch{return false;} }
  function getOrderId(u = location.href){ return Number(new URL(u).pathname.match(/\/unified-orders\/(\d+)/)?.[1] || 0); }

  /* ====== API ====== */
  async function apiGet(orderId){
    const u = new URL(`${CFG.WORKER_URL}/notes`);
    u.searchParams.set("order_id", orderId);
    u.searchParams.set("token", CFG.SERVER_TOKEN);
    const r = await fetch(u, { mode:"cors", credentials:"omit", cache:"no-store" });
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async function apiPost(orderId, text, user){
    const r = await fetch(`${CFG.WORKER_URL}/notes`, {
      method:"POST", headers:{ "content-type":"application/json" }, mode:"cors", credentials:"omit",
      body: JSON.stringify({ order_id: orderId, text, user, token: CFG.SERVER_TOKEN })
    });
    if(!r.ok){ const t = await r.text().catch(()=> ""); throw new Error(`${r.status} ${t || r.statusText}`); }
    return r.json();
  }

  async function fetchUser(){
    if(currentUser) return currentUser;
    const r = await fetch(CFG.AUTH_URL, { credentials:"include" });
    if(!r.ok) throw new Error("auth_fetch_failed");
    const j = await r.json();
    const login = String(j?.username || "").trim().split("@")[0];
    if(!login) throw new Error("empty_username");
    currentUser = login;
    return login;
  }

  /* ====== UI BUDOWA ====== */
  function ensureUI(){
    if(!qs(".sh-notes-launcher")){
      const b = document.createElement("div"); // Używamy div zamiast button, by uniknąć problemów z dragowaniem w HTML
      b.className = "sh-notes-launcher sh-hidden";
      b.innerHTML = `Notatki <span class="sh-badge" id="sh-badge">0</span>`;
      document.body.appendChild(b);
      // Podpinamy mechanizm drag & drop do przycisku
      makeLauncherDraggable(b);
    }
    if(!qs(".sh-notes")){
      const w = document.createElement("div");
      w.className = "sh-notes sh-hidden";
      w.innerHTML = `
        <div class="sh-notes__header" id="sh-header">
          <div class="sh-notes__title">Notatki — Zamówienie #<span id="sh-ord"></span></div>
          <div><button class="sh-btn" id="sh-refresh">↻</button><button class="sh-btn" id="sh-close">×</button></div>
        </div>
        <div class="sh-notes__list" id="sh-list"><div style="opacity:.7;font:12px system-ui;">Brak danych…</div></div>
        <div class="sh-notes__composer">
          <textarea class="sh-textarea" id="sh-ta" placeholder="Twoja notatka (max 700 znaków)…" maxlength="700"></textarea>
          <div class="sh-composer__row">
            <div class="sh-counter" id="sh-ctr">0 / 700</div>
            <button class="sh-send" id="sh-send">Wyślij</button>
          </div>
        </div>`;
      document.body.appendChild(w);

      qs("#sh-close").onclick = () => w.classList.add("sh-hidden");
      qs("#sh-refresh").onclick = () => refresh();
      qs("#sh-send").onclick = () => send();
      qs("#sh-ta").addEventListener("input", counter);
    }
  }

  function toggle(){
    const box = qs(".sh-notes");
    const launcher = qs(".sh-notes-launcher");
    if(!box || !launcher) return;
    box.classList.toggle("sh-hidden");
    if(!box.classList.contains("sh-hidden")){
        updatePopupPosition(launcher); // Zawsze ustawiaj okienko prosto nad przyciskiem
        refresh();
        qs("#sh-ta").focus();
    }
  }

  function counter(){
    const len = qs("#sh-ta").value.length;
    const el = qs("#sh-ctr");
    el.textContent = `${len} / 700`;
    el.classList.toggle("sh-counter--warn", len>=600 && len<700);
    el.classList.toggle("sh-counter--max",  len>=700);
  }

  function badge(n){
    const b = qs("#sh-badge"); if(!b) return;
    b.textContent = Number.isFinite(n) ? String(n) : "!";
    b.style.background = Number.isFinite(n) ? "#10b981" : "#ef4444";
  }

  /* ====== LOGIKA POBIERANIA (Z OBSŁUGĄ BRAKU TOKENU) ====== */
  async function refresh(){
    if(!currentOrderId) return;
    qs("#sh-ord").textContent = currentOrderId;
    const list = qs("#sh-list");

    // Brak tokenu = Dyskretny komunikat tylko wewnątrz otwartego okna, baner jest już na górze
    if (!CFG.SERVER_TOKEN) {
        badge(NaN);
        list.innerHTML = `<div class="sh-err" style="text-align:center; padding:10px;">Brak tokenu API. Ustaw go w opcjach skryptu.</div>`;
        return;
    }

    list.innerHTML = `<div style="opacity:.7;font:12px system-ui;">Ładowanie…</div>`;

    try {
      const {items} = await apiGet(currentOrderId);
      render(items);
      badge(items.length);
    } catch(e) {
      badge(NaN);
      Core.log.error(`Błąd pobierania: ${e.message}`);
      list.innerHTML = `<div class="sh-err">Błąd pobierania: ${e.message}</div>`;
    }
  }

  function render(items){
    const list = qs("#sh-list");
    list.innerHTML = "";
    if(!items?.length){
      list.innerHTML = `<div style="opacity:.7;font:12px system-ui;">Brak notatek.</div>`;
      return;
    }
    for(const n of items){
      const el = document.createElement("div");
      el.className = "sh-item sh-item--ok";
      el.innerHTML = `<div class="sh-item__meta"><div>${fmt(n.created_at)}</div><div>${escapeHtml(n.user || "")}</div></div><div class="sh-item__text">${escapeHtml(n.text || "")}</div>`;
      list.appendChild(el);
    }
    list.scrollTop = list.scrollHeight;
  }

  /* ====== LOGIKA WYSYŁANIA ====== */
  async function send(){
    if (!CFG.SERVER_TOKEN) {
        Core.log.error("Próba wysłania bez tokenu API.");
        return;
    }

    const ta = qs("#sh-ta");
    let text = (ta.value || "").trim();
    if(!text) return;
    if(text.length>700){ text = text.slice(0,700); ta.value = text; counter(); }

    let user;
    try { user = await fetchUser(); }
    catch(e) { Core.log.error("Błąd loginu.", e); return; }

    const list = qs("#sh-list");
    const pending = document.createElement("div");
    pending.className = "sh-item sh-item--pending";
    pending.innerHTML = `<div class="sh-item__meta"><div>${fmt(Date.now())}</div><div>${escapeHtml(user)} <span class="sh-ok">…</span></div></div><div class="sh-item__text">${escapeHtml(text)}</div>`;
    list.appendChild(pending);
    list.scrollTop = list.scrollHeight;
    ta.value = ""; counter();

    try {
      const [res] = await Promise.all([ apiPost(currentOrderId, text, user), sleep(CFG.PENDING_MIN_MS) ]);
      if(res?.ok){
        pending.classList.replace("sh-item--pending", "sh-item--ok");
        const ok = pending.querySelector(".sh-ok"); if(ok) ok.textContent="✔";
        await refresh();
      } else { throw new Error("save_failed"); }
    } catch(e) {
      Core.log.error("Błąd wysyłki:", e.message);
      pending.classList.replace("sh-item--pending", "sh-item--error");
      const ok = pending.querySelector(".sh-ok"); if(ok) ok.textContent="×";
      const err = document.createElement("div"); err.className="sh-err"; err.textContent=`Błąd zapisu: ${e.message}`;
      pending.appendChild(err);
    }
  }

  /* ====== SPA ROUTING ====== */
  function setupRouting() {
      function onRoute(){
        if(!isOrderPage()){
          currentOrderId = null;
          qs(".sh-notes")?.classList.add("sh-hidden");
          qs(".sh-notes-launcher")?.classList.add("sh-hidden");
          return;
        }
        const oid = getOrderId();
        if(oid !== currentOrderId){
          currentOrderId = oid;
          ensureUI();
          qs(".sh-notes-launcher")?.classList.remove("sh-hidden");
          if(qs("#sh-ord")) qs("#sh-ord").textContent = currentOrderId;

          // Aktualizuj pozycję okna na wypadek, gdyby przycisk zmienił miejsce pomiędzy przeładowaniami
          const launcher = qs(".sh-notes-launcher");
          if (launcher) updatePopupPosition(launcher);

          refresh();
        }
      }

      const _ps = history.pushState, _rs = history.replaceState;
      history.pushState = function(){ _ps.apply(this, arguments); setTimeout(onRoute,0); };
      history.replaceState = function(){ _rs.apply(this, arguments); setTimeout(onRoute,0); };
      window.addEventListener("popstate", ()=>setTimeout(onRoute,0));
      new MutationObserver(()=>onRoute()).observe(document.documentElement,{childList:true,subtree:true});

      window._suuRouteCheck = onRoute;
  }

  function onRoute() { if(typeof window._suuRouteCheck === 'function') window._suuRouteCheck(); }

})();
