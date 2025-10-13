// ==UserScript==
// @name         SUUHOUSE OMS — Notatki (popup czat)
// @namespace    suuhouse.tools
// @author       SapentiSat
// @version      1.3.0
// @description  Popup z notatkami wewnętrznymi dla unified-orders/{id}
// @match        https://suuhouse.enterprise.sellrocket.pl/unified-orders/*
// @run-at       document-idle
// @grant        GM_addStyle
// @noframes
// @icon         https://suuhouse.pl/favicon.ico
// @homepageURL  https://github.com/SapentiSat/tampermonkey-scripts
// @supportURL   https://github.com/SapentiSat/tampermonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/suuhouse-oms-notes.user.js
// @downloadURL  https://raw.githubusercontent.com/SapentiSat/tampermonkey-scripts/main/suuhouse-oms-notes.user.js
// @license      MIT
// @connect      sellrocket-notes.valiantsin12.workers.dev
// ==/UserScript==


(() => {
  /* ====== KONFIG BACKEND ====== */
  const WORKER_URL   = "https://sellrocket-notes.valiantsin12.workers.dev"; // GET/POST /notes
  const SERVER_TOKEN = "tkA6PhLmIaHwDhtDWqoxgtIhdLqxg9xd6V5e9ByBy56gUCFiw";
  const AUTH_URL     = "https://suuhouse-smerp-api.enterprise.sellrocket.pl/api/v3/Logon/GetAuthenticatedUser";

  /* ====== KONFIG UI (łatwe strojenie) ====== */
  // czas „pending” (żeby zobaczyć bąbelek wysyłania)
  const PENDING_MIN_MS = 1200;
  // przezroczystość tła (0..1): pending i po zapisie
  const PENDING_BG_OPACITY = 0.30;
  const OK_BG_OPACITY      = 0.60;
  // rozmiary
  const TITLE_SIZE_PX = 13;   // "Notatki — Zamówienie #..."
  const META_SIZE_PX  = 11;   // data/autor
  const NOTE_SIZE_PX  = 17;   // treść notatki + textarea
  const ICON_BTN_PX   = 35;   // ↻ i × w nagłówku

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ====== STYLES ====== */
  GM_addStyle(`
    .sh-notes-launcher{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#2563eb;color:#fff;border:1px solid #1e40af;border-radius:14px;padding:16px 56px;cursor:pointer;font:600 20px/1.2 system-ui,sans-serif;box-shadow:0 6px 28px rgba(0,0,0,.35)}
    .sh-notes-launcher .sh-badge{position:absolute;left:-8px;top:-8px;min-width:28px;height:28px;background:#10b981;color:#0b141a;border:2px solid #0b63eb22;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font:700 14px/1 system-ui,sans-serif;padding:0 8px;box-shadow:0 2px 10px rgba(0,0,0,.35)}

    .sh-notes{position:fixed;right:16px;bottom:88px;z-index:2147483000;width:380px;height:550px;min-width:300px;min-height:260px;max-width:520px;max-height:70vh;resize:both;overflow:hidden;background:#0f1115;color:#eaeaea;border:1px solid #2b2f36;border-radius:14px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.45)}
    .sh-notes__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #22262c;background:#12141a}
    .sh-notes__title{font-weight:700;font-size:${TITLE_SIZE_PX}px;opacity:.95}
    .sh-btn{background:#1b1f27;color:#eaeaea;border:1px solid #2c3139;border-radius:8px;height:28px;padding:0 10px;font:500 12px system-ui,sans-serif;cursor:pointer}
    .sh-btn:hover{background:#222733}
    /* powiększenie ikon ↻ i × */
    .sh-notes__header .sh-btn{width:${ICON_BTN_PX}px;height:${ICON_BTN_PX}px;padding:0;font-size:${Math.round(ICON_BTN_PX*0.45)}px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px}

    .sh-notes__list{flex:1;overflow:auto;padding:10px 10px 4px 10px;display:flex;flex-direction:column;gap:8px}
    .sh-item{background:#141821;border:1px solid #242a34;border-radius:10px;padding:8px 10px}
    .sh-item__meta{display:flex;gap:8px;justify-content:space-between;opacity:.75;font:${META_SIZE_PX}px system-ui,sans-serif;margin-bottom:4px}
    .sh-item__text{white-space:pre-wrap;word-break:break-word;font:${NOTE_SIZE_PX}px/1.5 system-ui,sans-serif}

    /* Efekt czatowy (pending/ok) */
    .sh-item--pending{background:rgba(37,99,235,${PENDING_BG_OPACITY})!important;border-color:#1d4ed8}
    .sh-item--ok{background:rgba(37,99,235,${OK_BG_OPACITY})!important;border-color:#1d4ed8}
    .sh-item--error{border-color:#b91c1c}
    .sh-ok{margin-left:6px;font-size:12px;color:#7CFC7C}
    .sh-err{color:#ff7373;font-size:12px}

    .sh-notes__composer{border-top:1px solid #22262c;padding:10px;display:flex;flex-direction:column;gap:10px;background:#101219}
    .sh-textarea{width:100%;height:90px;font:${NOTE_SIZE_PX}px/1.35 system-ui,sans-serif;color:#eaeaea;background:#383d61;border:1px solid #252b37;border-radius:10px;padding:10px 12px;outline:none}
    .sh-textarea:focus{border-color:#33415c}
    .sh-composer__row{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .sh-counter{font:12px system-ui;opacity:.7}
    .sh-counter--warn{color:#ffcc66;opacity:1}
    .sh-counter--max{color:#ff7373;opacity:1}

    .sh-send{background:#16a34a;color:#fff;border:1px solid #15803d;border-radius:10px;height:44px;padding:0 18px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 12px rgba(22,163,74,.35)}
    .sh-send:hover{background:#139047}

    .sh-hidden{display:none!important}
  `);

  /* ====== STATE ====== */
  let currentOrderId = null;
  let currentUser = null;

  /* ====== HELPERS ====== */
  const qs = s => document.querySelector(s);
  const fmt = ts => {
    const d=new Date(ts), p=n=>String(n).padStart(2,"0");
    return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function isOrderPage(u = location.href){
    try{const x=new URL(u); return x.hostname.endsWith("sellrocket.pl") && /^\/unified-orders\/\d+(?:\/|$)/.test(x.pathname);}catch{return false;}
  }
  function getOrderId(u = location.href){ return Number(new URL(u).pathname.match(/\/unified-orders\/(\d+)/)?.[1] || 0); }

  async function apiGet(orderId){
    const u = new URL(`${WORKER_URL}/notes`);
    u.searchParams.set("order_id", orderId);
    u.searchParams.set("token", SERVER_TOKEN);
    const r = await fetch(u, { mode:"cors", credentials:"omit", cache:"no-store" });
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
  async function apiPost(orderId, text, user){
    const r = await fetch(`${WORKER_URL}/notes`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      mode:"cors", credentials:"omit",
      body: JSON.stringify({ order_id: orderId, text, user, token: SERVER_TOKEN })
    });
    if(!r.ok){ const t = await r.text().catch(()=> ""); throw new Error(`${r.status} ${t || r.statusText}`); }
    return r.json();
  }
  async function fetchUser(){
    if(currentUser) return currentUser;
    const r = await fetch(AUTH_URL, { credentials:"include" });
    if(!r.ok) throw new Error("auth_fetch_failed");
    const j = await r.json();
    const login = String(j?.username || "").trim().split("@")[0];
    if(!login) throw new Error("empty_username");
    currentUser = login;
    return login;
  }

  /* ====== UI ====== */
  function ensureUI(){
    if(!qs(".sh-notes-launcher")){
      const b = document.createElement("button");
      b.className = "sh-notes-launcher";
      b.innerHTML = `Notatki <span class="sh-badge" id="sh-badge">0</span>`;
      b.onclick = toggle;
      document.body.appendChild(b);
    }
    if(!qs(".sh-notes")){
      const w = document.createElement("div");
      w.className = "sh-notes sh-hidden";
      w.innerHTML = `
        <div class="sh-notes__header">
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
      document.addEventListener("keydown",(e)=>{
        if(qs(".sh-notes").classList.contains("sh-hidden")) return;
        if(e.key.toLowerCase()==="r" && !e.ctrlKey && !e.metaKey){ e.preventDefault(); refresh(); }
        if(e.key==="Enter" && !e.shiftKey && document.activeElement===qs("#sh-ta")){ e.preventDefault(); send(); }
      });
    }
  }

  function toggle(){
    const box = qs(".sh-notes");
    if(!box) return;
    box.classList.toggle("sh-hidden");
    if(!box.classList.contains("sh-hidden")){ refresh(); qs("#sh-ta").focus(); }
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

  async function refresh(){
    if(!currentOrderId) return;
    qs("#sh-ord").textContent = currentOrderId;
    const list = qs("#sh-list");
    list.innerHTML = `<div style="opacity:.7;font:12px system-ui;">Ładowanie…</div>`;
    try{
      const {items} = await apiGet(currentOrderId);
      render(items);
      badge(items.length);
    }catch(e){
      badge(NaN);
      list.innerHTML = `<div class="sh-err">Błąd pobierania: ${e.message}</div>`;
    }
  }

  function render(items){
    const list = qs("#sh-list");
    list.innerHTML = "";
    if(!items?.length){
      list.innerHTML = `<div style="opacity:.7;font:12px system-ui;">Brak notatek dla tego zamówienia.</div>`;
      return;
    }
    for(const n of items){
      const el = document.createElement("div");
      el.className = "sh-item sh-item--ok";
      el.innerHTML = `
        <div class="sh-item__meta"><div>${fmt(n.created_at)}</div><div>${escapeHtml(n.user || "")}</div></div>
        <div class="sh-item__text">${escapeHtml(n.text || "")}</div>`;
      list.appendChild(el);
    }
    list.scrollTop = list.scrollHeight;
  }

  async function send(){
    const ta = qs("#sh-ta");
    let text = (ta.value || "").trim();
    if(!text) return;
    if(text.length>700){ text = text.slice(0,700); ta.value = text; counter(); }

    let user;
    try{ user = await fetchUser(); }
    catch{ alert("Nie udało się pobrać loginu użytkownika."); return; }

    // pending (10–30% wg PENDING_BG_OPACITY)
    const list = qs("#sh-list");
    const pending = document.createElement("div");
    pending.className = "sh-item sh-item--pending";
    pending.innerHTML = `
      <div class="sh-item__meta">
        <div>${fmt(Date.now())}</div>
        <div>${escapeHtml(user)} <span class="sh-ok">…</span></div>
      </div>
      <div class="sh-item__text">${escapeHtml(text)}</div>`;
    list.appendChild(pending);
    list.scrollTop = list.scrollHeight;
    ta.value = ""; counter();

    try{
      const [res] = await Promise.all([ apiPost(currentOrderId, text, user), sleep(PENDING_MIN_MS) ]);
      if(res?.ok){
        pending.classList.remove("sh-item--pending");
        pending.classList.add("sh-item--ok");
        const ok = pending.querySelector(".sh-ok"); if(ok) ok.textContent="✔";
        await refresh();
      }else{
        throw new Error("save_failed");
      }
    }catch(e){
      pending.classList.remove("sh-item--pending");
      pending.classList.add("sh-item--error");
      const ok = pending.querySelector(".sh-ok"); if(ok) ok.textContent="×";
      const err = document.createElement("div"); err.className="sh-err"; err.textContent=`Błąd zapisu: ${e.message}`;
      pending.appendChild(err);
    }
  }

  /* ====== SPA routing ====== */
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
      qs("#sh-ord") && (qs("#sh-ord").textContent = currentOrderId);
      apiGet(currentOrderId).then(r=>badge(r.items?.length||0)).catch(()=>badge(NaN));
    }
  }
  const _ps = history.pushState, _rs = history.replaceState;
  history.pushState = function(){ _ps.apply(this, arguments); setTimeout(onRoute,0); };
  history.replaceState = function(){ _rs.apply(this, arguments); setTimeout(onRoute,0); };
  window.addEventListener("popstate", ()=>setTimeout(onRoute,0));
  new MutationObserver(()=>onRoute()).observe(document.documentElement,{childList:true,subtree:true});
  onRoute();
})();
