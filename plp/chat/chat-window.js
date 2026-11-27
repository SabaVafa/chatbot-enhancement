/* ============================================================
   Metzler Juna chat window — behaviour (BEM `cw-`)
   Spec: research/13-chat-design-spec.md (single source of truth).
   Runs on the adapter foundation in this folder (adapter.js →
   mock / BFF / live adapter). Vanilla JS, zero dependencies.

   PUBLIC API
     window.MetzlerChatWindow = { open(opts), close(opts), toggle(opts), isOpen(),
                                  destroy(), on(type, cb), hasTranscript() }
     The same open/close/toggle/isOpen/destroy are mirrored onto
     window.MetzlerChat (the adapter core namespace).
     opts.open: { source:'hub'|'api', trigger:'keyboard'|'pointer', t0:ms }
   EVENTS (on): open · close · unread(n) · first_message · error · transcript(bool)
   CONFIG (data-* on #helpHub): data-page-type, data-hours, data-photo="on|off",
     data-chat-product (context product id). Debug: ?chat_product=<id>,
     ?chat=mock|offline|live, ?chat_speed=0, ?chat_stream=0, ?hh_now=…
   ANALYTICS: dataLayer events of spec §12 — never message text.
   ============================================================ */
(function (window, document) {
  'use strict';

  var VERSION = '1.8.17';
  var BASE = (function () {
    var s = document.currentScript || [].slice.call(document.scripts).filter(function (x) { return /chat-window\.js/.test(x.src); })[0];
    return s ? s.src.replace(/[^/]*$/, '') : 'chat/';
  })();

  /* ---------- copy deck (spec §13) ---------- */
  var COPY = {
    title: 'Chat mit KI-Assistentin Juna', ki: 'KI', kiAria: 'KI-Assistentin', menuHuman: 'Mit einem Menschen sprechen',
    expand: 'Größer anzeigen', shrink: 'Kleiner anzeigen', menu: 'Menü', close: 'Chat minimieren',
    aiNotice: 'Juna ist eine KI und kann sich irren. Verbindlich hilft unser Team.',
    menuSummary: 'Zusammenfassung', menuRestart: 'Neues Gespräch', menuPrivacy: 'Datenschutz', menuTerms: 'AGB', voiceStart: 'Spracheingabe starten', voiceStop: 'Spracheingabe beenden', voiceListening: 'Ich höre zu …', voiceDenied: 'Bitte erlauben Sie den Mikrofonzugriff, um zu sprechen.', voiceFailed: 'Spracheingabe gerade nicht möglich.', voiceOn: 'Spracheingabe aktiv.', voiceOff: 'Spracheingabe beendet.', newChat: 'Neues Gespräch', back: 'Zurück zur Übersicht', undo: 'Rückgängig', undoAria: 'Rückgängig – vorheriges Gespräch wiederherstellen',
    liveStarted: 'Neues Gespräch begonnen.', liveRestored: 'Gespräch wiederhergestellt.',
    contextPrefix: 'Sie sehen: ', pageNames: { plp_sprechanlagen: 'Türsprechanlagen', plp_briefkaesten: 'Briefkästen' },
    greet: { morning: 'Guten Morgen, ich bin Juna,\nIhr Metzler Service Agent.', day: 'Guten Tag, ich bin Juna,\nIhr Metzler Service Agent.', evening: 'Guten Abend, ich bin Juna,\nIhr Metzler Service Agent.' },
    scope: 'Ich bin eine KI und helfe bei Auswahl, Verkabelung und Montage.',
    starters: [
      { label: 'Welche Anlage passt zu mir?', value: 'intent:advisor' },
      { label: 'Passt meine Verkabelung?', value: 'intent:compat' },
      { label: 'Montage & Fachbetrieb', value: 'intent:montage' },
      { label: 'Lieferzeit & Garantie', value: 'intent:delivery' }
    ],
    placeholder: 'Ihre Frage …', placeholderPhoto: 'Frage zum Foto (optional) …', placeholderOffline: 'Juna ist offline',
    attach: 'Foto hinzufügen', send: 'Senden', field: 'Nachricht an Juna',
    privacy: 'Ihre Eingaben werden zur Beantwortung verarbeitet.', privacyLink: 'Datenschutz',
    photoRow: 'Foto der Leitung senden', drop: 'Foto hier ablegen', photoHint: 'Bitte keine Personen oder Hausnummern fotografieren.',
    photoError: 'Bitte ein Foto (JPG, PNG) bis 10 MB wählen.', photoRemove: 'Foto entfernen', photoAlt: 'Ihr Foto',
    typing: 'Juna schreibt …', slow: 'Das dauert länger als üblich …', newAnswer: 'Neue Antwort ↓', newDivider: 'Neu',
    failed: 'Nicht gesendet', retry: 'Erneut versuchen', offline: 'Juna ist gerade nicht erreichbar.', reconnect: 'Erneut verbinden',
    reconnecting: 'Verbindung wird wiederhergestellt …', rateLimit: 'Bitte einen Moment warten – zu viele Nachrichten.',
    noAnswer: 'Keine Antwort erhalten.', unsupported: 'Dieser Inhalt kann hier nicht angezeigt werden.',
    confirm: 'Gespräch löschen und neu beginnen?', cancel: 'Abbrechen', restart: 'Neu beginnen',
    view: 'Ansehen', uvp: 'UVP', carousel: 'Passende Modelle', of: ' von ',
    allRows: function (n) { return 'Alle Merkmale (' + n + ')'; }, diffRows: 'Nur Unterschiede', best: '(bester Wert)',
    stars: function (r, n) { return r.toFixed(1).replace('.', ',') + ' von 5 Sternen, ' + n + ' Bewertungen'; },
    print: 'Drucken', copy: 'Kopieren', copied: 'Kopiert', summaryChip: 'Protokoll für den Elektriker',
    light: { online: 'Status: online', waiting: 'Status: antwortet', streaming: 'Status: antwortet', reconnecting: 'Status: verbindet', offline: 'Status: offline' },
    juna: 'Juna:', you: 'Sie:', prev: 'Vorheriges Modell', next: 'Nächstes Modell', external: '(öffnet neues Fenster)',
    attachCheck: 'Foto hinzufügen', placeholderPhotoHint: '',
    source: 'Quelle:', retiredHead: function (page) { return page + ' · Juna'; }
  };

  /* ---------- icons (stroke, currentColor) ---------- */
  function svg(d, vb) { return '<svg viewBox="' + (vb || '0 0 24 24') + '" aria-hidden="true" focusable="false">' + d + '</svg>'; }
  var I = {
    phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    expand: svg('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'),
    shrink: svg('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>'),
    menu: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    close: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
    minimise: svg('<path d="M6 9l6 6 6-6"/>'),
    restart: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    chevL16: svg('<path d="M15 18l-6-6 6-6"/>'),   /* name kept; now on the shared 24 grid */
    attach: svg('<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.5" r="3.6"/>'),
    send: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/><path d="M8 21h8"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>'),
    chevL: svg('<path d="M15 6l-6 6 6 6"/>'),
    ext: svg('<path d="M7 17L17 7M9 7h8v8"/>'),
    cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    pin: svg('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    wire: svg('<path d="M4 7h5a3 3 0 0 1 3 3v4a3 3 0 0 0 3 3h5"/><circle cx="4" cy="7" r="1.5"/><circle cx="20" cy="17" r="1.5"/>'),
    tool: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
    check: svg('<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    warn: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>'),
    doc: svg('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'),
    print: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
    copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>')
  };
  var STARTER_ICON = { 'intent:advisor': I.home, 'intent:compat': I.wire, 'intent:montage': I.tool, 'intent:delivery': I.check };
  var CHANNEL_ICON = { phone: I.phone, appointment: I.cal, email: I.mail, installer: I.pin };

  /* ---------- helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (children || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mq(q) { return window.matchMedia(q).matches; }
  function reduced() { return mq('(prefers-reduced-motion: reduce)'); }
  var SHEET_MQ = '(max-width: 767px), (max-height: 500px)';     /* phones in portrait and landscape (short screens) */
  var EXPAND_MQ = '(min-width: 1024px) and (min-height: 501px)';
  function isSheetViewport() { return mq(SHEET_MQ); }
  function canExpand() { return mq(EXPAND_MQ); }
  function track(event, params) {
    window.dataLayer = window.dataLayer || [];
    var p = { event: event };
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    window.dataLayer.push(p);
  }
  function ss(key, val) {
    try {
      if (val === undefined) return sessionStorage.getItem(key);
      if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function param(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; }
  function isExternal(href) { try { return new URL(href, location.href).origin !== location.origin; } catch (e) { return false; } }
  function safeHref(u) {
    u = String(u || '').trim();
    return /^(https?:|mailto:|tel:|\/|#|\.{0,2}\/)/i.test(u) && !/^javascript:/i.test(u) ? u : '#';
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------- markdown subset → safe HTML (spec §7) ---------- */
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
      var href = safeHref(u.replace(/&amp;/g, '&'));
      var ext = isExternal(href) && !/^(mailto|tel):/i.test(href);
      return '<a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + (ext ? '<span class="cw-sr"> ' + COPY.external + '</span>' : '') + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\b(2-(?:Draht|adrig)[\wäöü-]*)/g, '<span class="cw-nb">$1</span>');   /* CW-12 */
    s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return s;
  }
  function markdown(src, streaming) {
    src = String(src || '');
    if (streaming && (src.match(/\*\*/g) || []).length % 2) src += '**';   /* close a half-streamed bold */
    var lines = src.replace(/\r/g, '').split('\n'), out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { i++; continue; }
      if (/^\s*\|/.test(l)) {
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        var cells = rows.filter(function (r) { return !/^\s*\|?\s*:?-{2,}/.test(r.replace(/\|/g, '').trim() ? r : '---'); })
          .map(function (r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); });
        var body = cells.filter(function (r, idx) { return !(idx === 1 && r.every(function (c) { return /^:?-+:?$/.test(c); })); });
        var head = body.shift() || [];
        out.push('<table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.filter(function (r) { return !r.every(function (c) { return /^:?-+:?$/.test(c); }); })
            .map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>');
        continue;
      }
      if (/^\s*([-*•]|\d+\.)\s+/.test(l)) {
        var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, '')); i++; }
        out.push('<' + (ordered ? 'ol' : 'ul') + '>' + items.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</' + (ordered ? 'ol' : 'ul') + '>');
        continue;
      }
      if (/^#{1,4}\s+/.test(l)) { out.push('<p><strong>' + inline(l.replace(/^#{1,4}\s+/, '')) + '</strong></p>'); i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+\.\s|#{1,4}\s)/.test(lines[i])) { para.push(inline(lines[i])); i++; }
      out.push('<p>' + para.join('<br>') + '</p>');
    }
    return out.join('');
  }
  function plain(src) { return String(src || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'); }

  /* ---------- state ---------- */
  var C = null;                    /* window.MetzlerChat (adapter core) */
  var hub = null, cfg = null;
  var el = {};                     /* DOM refs */
  var adapter = null, adapterReady = null, offs = [];
  var listeners = {};
  var S = {
    built: false, open: false, closing: false, size: 'compact', expandedPref: false,   /* owner 2026-10-15: full-screen/expand control removed */
    msgs: {}, order: [], turns: {}, greetingId: null, starters: null,
    status: 'idle', typing: false, awaiting: false, streamingIds: {},
    timers: {}, errorStreak: 0, lastInput: null, firstTracked: false, hasSent: false,
    unread: 0, unreadFirstId: null, countedComplete: {}, follow: { active: true, anchorId: null }, programmatic: false,
    pillTarget: null, menuOpen: false, confirmOpen: false, photo: null, recommended: false, summaryTracked: {},
    inerted: [], scrollY: 0, restoring: false, lastHandoffTurn: null, openedAt: 0, t0: 0, dragDepth: 0, statusSince: 0,
    trigger: 'pointer', connectedOnce: false
  };

  function emit(type, data) { (listeners[type] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return function () { var l = listeners[type], i = l.indexOf(fn); if (i > -1) l.splice(i, 1); }; }

  function readConfig() {
    hub = document.getElementById('helpHub');
    var d = hub ? hub.dataset : {};
    var productId = param('chat_product') || d.chatProduct || '';
    var product = null;
    try { product = productId && window.MetzlerCatalog ? window.MetzlerCatalog.products.filter(function (p) { return p.id === productId; })[0] : null; } catch (e) { /* ignore */ }
    return {
      pageType: d.pageType || 'plp_sprechanlagen',
      hours: d.hours || 'Mo-Fr 09:00-16:00',
      photo: (d.photo || 'on') === 'on',
      privacyUrl: '#',
      termsUrl: '#',
      product: product,
      context: { pageType: d.pageType || 'plp_sprechanlagen', entryPoint: 'helphub', productId: product ? product.id : '', productName: '' }
    };
  }

  /* ============================================================
     BUILD
     ============================================================ */
  function build() {
    if (S.built) return;
    cfg = readConfig();
    var root = h('section', { class: 'cw cw--compact', id: 'metzlerChat', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'cwTitle', lang: 'de', hidden: true });
    var head = h('header', { class: 'cw-head' });
    el.light = h('span', { class: 'cw-head__light cw-sr', role: 'img', 'aria-label': COPY.light.online });   /* status kept for AT; visual cue = "Juna schreibt …" in the log */
    /* brand header (owner 2026-10-15: same logo + style as the hub) */
    var hubLogo = document.querySelector('#helpHub .hh-brand');
    el.logo = h('img', { class: 'cw-brand cw-brand--center', src: hubLogo ? hubLogo.src : 'Home/Logo/Metzler_Logo-rot-schwarz.svg', alt: 'Metzler', width: '131', height: '22' });
    el.title = h('h2', { class: 'cw-head__title cw-sr', id: 'cwTitle', tabindex: '-1', text: COPY.title });
    /* owner 2026-10-16: the KI note box was repetitive and is removed — the chip is a plain label now (no toggle) */
    el.ki = h('span', { class: 'cw-head__ki cw-head__ki--label', text: COPY.ki });
    el.expand = h('button', { class: 'cw-hbtn cw-head__expand', type: 'button', 'aria-pressed': 'false', 'aria-label': COPY.expand, html: I.expand, onclick: toggleExpand });
    el.menuBtn = h('button', { class: 'cw-hbtn cw-head__menu', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'cwMenu', 'aria-label': COPY.menu, html: I.menu, onclick: function () { S.menuOpen ? closeMenu(true) : openMenu(); } });
    /* owner 2026-10-15: 'Neues Gespräch' out of the menu -> its own header icon, shown once a conversation exists */
    el.restartBtn = h('button', { class: 'cw-hbtn cw-head__restart', type: 'button', 'aria-label': COPY.newChat, title: COPY.newChat, hidden: true,
      html: I.restart.replace('<svg ', '<svg class="cw-head__restart-icon cw-i-restart" ') + I.undo.replace('<svg ', '<svg class="cw-head__restart-icon cw-i-undo" ') +
        '<span class="cw-head__restart-label">' + COPY.undo + '</span>',
      onclick: function (e) { if (S.pendingReset) undoRestart(); else startRestart(e); } });
    /* spec 18 §4: the undo window pauses while the button is hovered or focused (WCAG 2.2.1) */
    el.restartBtn.addEventListener('mouseenter', function () { S.undoHover = true; pauseUndo(); });
    el.restartBtn.addEventListener('mouseleave', function () { S.undoHover = false; resumeUndo(); });
    el.restartBtn.addEventListener('focus', function () { S.undoFocus = true; pauseUndo(); });
    el.restartBtn.addEventListener('blur', function () { S.undoFocus = false; resumeUndo(); });
    el.close = h('button', { class: 'cw-hbtn cw-head__close', type: 'button', 'aria-label': COPY.close, html: I.close, onclick: function () { close(); } });
    /* owner 2026-10-15 (R3r): the brand is the way home - ONE button (chevron + Metzler logo) back to the Help Hub
       overview (hotline, Termin, Kaufberater, FAQ, Fachhändler). Without a hub on the page the logo stays plain. */
    el.home = null;
    if (hub) {
      el.homeChev = h('span', { class: 'cw-head__home-chev', html: I.chevL16 });
      el.home = h('button', { class: 'cw-head__home', type: 'button', 'aria-label': COPY.back, title: COPY.back,
        onclick: function (e) { back(e && e.detail === 0 ? 'keyboard' : 'pointer'); } }, [el.homeChev]);
    }
    /* owner change (round 2): no "☎ Mensch" header button — human contact is the first ⋯ menu item */
    [el.light, el.home, el.logo, el.title, h('span', { class: 'cw-head__spacer' }), el.restartBtn, el.close].filter(Boolean).forEach(function (n) { head.appendChild(n); });

    el.menu = h('ul', { class: 'cw-menu', id: 'cwMenu', role: 'menu', 'aria-label': COPY.menu, hidden: true });
    /* owner 2026-10-15: "Mit einem Menschen sprechen" removed from the menu — human contact stays via the automatic
       handoff card (fallback / offline / second error) and the hub's Hotline / Termin rows. */
    el.menuSummary = h('li', { role: 'none', hidden: true }, [h('button', { class: 'cw-menu__item', type: 'button', role: 'menuitem', tabindex: '-1', text: COPY.menuSummary, onclick: function () { closeMenu(false); requestSummary('menu'); } })]);
    el.menu.appendChild(el.menuSummary);
    /* 'Neues Gespräch' moved to the header (restart icon) with undo instead of a confirmation bar */
    /* legal group (owner 2026-10-15): Datenschutz + AGB side by side under a hairline */
    el.menu.appendChild(h('li', { role: 'none', class: 'cw-menu__legal' }, [
      h('a', { class: 'cw-menu__item cw-menu__item--legal', role: 'menuitem', tabindex: '-1', href: cfg.privacyUrl, text: COPY.menuPrivacy }),
      h('a', { class: 'cw-menu__item cw-menu__item--legal', role: 'menuitem', tabindex: '-1', href: cfg.termsUrl, text: COPY.menuTerms })
    ]));
    el.menu.addEventListener('keydown', onMenuKey);

    /* owner 2026-10-15: the ⋯ menu is gone; Datenschutz + AGB live in the KI note (same as the hub) */
    /* one persistent polite live region for restart / undo announcements (spec 18 §5) */
    el.live = h('p', { class: 'cw-sr cw-live', id: 'cwLive', role: 'status', 'aria-live': 'polite' });
    el.aiNotice = h('p', { class: 'cw-ainotice', id: 'cwAiNotice', hidden: true, html: /* owner 2026-10-16: sentence removed, links only */ 
      '<span class="cw-ainotice__links"><a href="' + esc(cfg.privacyUrl) + '">' + esc(COPY.menuPrivacy) + '</a><a href="' + esc(cfg.termsUrl) + '">' + esc(COPY.menuTerms) + '</a></span>' });

    el.main = h('div', { class: 'cw-main' });
    el.log = h('div', { class: 'cw-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Gesprächsverlauf', tabindex: '-1' });
    el.typing = h('p', { class: 'cw-typing', 'aria-hidden': 'true', text: COPY.typing });
    el.pill = h('button', { class: 'cw-newpill', type: 'button', hidden: true, text: COPY.newAnswer, onclick: onPill });
    el.main.appendChild(el.log);
    el.main.appendChild(el.pill);
    el.log.addEventListener('scroll', onLogScroll, { passive: true });
    if (window.MutationObserver) new MutationObserver(scheduleSmooth).observe(el.log, { childList: true, subtree: true, characterData: true });
    /* CW-11: explicit "the reader took over" signals */
    el.log.addEventListener('wheel', function (e) { if (e.deltaY < 0) userTookOver(); }, { passive: true });
    el.log.addEventListener('touchmove', userTookOver, { passive: true });
    el.log.addEventListener('keydown', function (e) { if (/^(ArrowUp|PageUp|Home)$/.test(e.key)) userTookOver(); });

    /* composer */
    el.form = h('form', { class: 'cw-composer', novalidate: true });
    el.tray = h('div', { class: 'cw-composer__tray', hidden: true });
    el.attach = h('button', { type: 'button', class: 'cw-composer__attach', 'aria-label': COPY.attachCheck, title: COPY.attachCheck, html: I.attach, onclick: function () { el.file.click(); } });
    el.field = h('textarea', { id: 'cwField', class: 'cw-composer__field', rows: '1', maxlength: '1000', placeholder: COPY.placeholder, autocomplete: 'off', enterkeyhint: 'send' });
    el.send = h('button', { type: 'submit', class: 'cw-composer__send', 'aria-label': COPY.send, disabled: true, html: I.send });
    /* owner 2026-10-15: audio option — voice input shares the send slot (mic while the field is empty, send arrow once there is text) */
    el.mic = h('button', { type: 'button', class: 'cw-composer__send cw-composer__mic', 'aria-label': COPY.voiceStart, 'aria-pressed': 'false', title: COPY.voiceStart, hidden: true, html: I.mic, onclick: toggleVoice });
    el.file = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    el.error = h('p', { class: 'cw-composer__error', role: 'alert', hidden: true });
    el.count = h('span', { class: 'cw-composer__count', 'aria-live': 'polite', hidden: true });
    /* owner 2026-10-15: Datenschutz + AGB permanently visible under the composer; the privacy sentence shows until the first send */
    el.privacy = h('p', { class: 'cw-composer__privacy', html: '<span class="cw-composer__privacy-text">' + esc(COPY.privacy) + '</span>' +
      '<span class="cw-composer__legal"><a href="' + esc(cfg.privacyUrl) + '">' + esc(COPY.privacyLink) + '</a><span aria-hidden="true">·</span><a href="' + esc(cfg.termsUrl) + '">' + esc(COPY.menuTerms) + '</a></span>' });
    /* KI chip leads the field (same as the hub); camera sits next to send */
    var box = h('div', { class: 'cw-composer__box' }, [el.ki, h('label', { class: 'cw-sr', for: 'cwField', text: COPY.field }), el.field, el.attach, el.mic, el.send]);
    el.form.appendChild(el.tray);
    el.form.appendChild(box);
    el.form.appendChild(el.file);
    el.form.appendChild(el.error);
    el.form.appendChild(h('div', { class: 'cw-composer__meta' }, [el.privacy, el.count]));
    if (!cfg.photo) el.attach.hidden = true;
    el.field.addEventListener('input', onFieldInput);
    el.field.addEventListener('keydown', onFieldKey);
    /* re-measure while the keyboard slides in or out: Chrome on iOS reports the final size late or not at all */
    function kbSettle() { if (S.size !== 'sheet') return; updateKb(); [150, 350, 700].forEach(function (t) { setTimeout(updateKb, t); }); }
    el.field.addEventListener('focus', kbSettle);
    el.field.addEventListener('blur', kbSettle);
    el.form.addEventListener('submit', onSubmit);
    el.file.addEventListener('change', function () { if (el.file.files && el.file.files[0]) acceptFile(el.file.files[0], 'button'); el.file.value = ''; });

    el.confirm = h('div', { class: 'cw-confirm', hidden: true, role: 'group', 'aria-labelledby': 'cwConfirmQ' }, [
      h('p', { id: 'cwConfirmQ', text: COPY.confirm }),
      h('div', { class: 'cw-confirm__btns' }, [
        el.confirmCancel = h('button', { type: 'button', class: 'cw-obtn', text: COPY.cancel, onclick: function () { closeConfirm(true); } }),
        h('button', { type: 'button', class: 'cw-obtn cw-obtn--primary', text: COPY.restart, onclick: doRestart })
      ])
    ]);
    el.drop = h('div', { class: 'cw-drop', hidden: true, 'aria-hidden': 'true', text: COPY.drop });

    [head, el.menu, el.main, el.form, el.confirm, el.drop, el.live].forEach(function (n) { root.appendChild(n); });   /* KI note box removed (owner 2026-10-16) */
    el.root = root;
    document.body.appendChild(root);

    root.addEventListener('keydown', onRootKey);
    head.addEventListener('pointerdown', onDragStart);
    head.addEventListener('pointermove', onDragMove);
    head.addEventListener('pointerup', onDragEnd);
    head.addEventListener('pointercancel', onDragEnd);
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (t) { root.addEventListener(t, onDrag); });
    document.addEventListener('pointerdown', onDocPointer, true);
    window.addEventListener('resize', onResize);
    /* breakpoint changes also via matchMedia (fires even when 'resize' is coalesced) */
    [SHEET_MQ, EXPAND_MQ].forEach(function (q) {
      var m = window.matchMedia(q);
      if (m.addEventListener) m.addEventListener('change', onResize); else if (m.addListener) m.addListener(onResize);
      S.mqls = (S.mqls || []).concat([m]);
    });
    if (window.visualViewport) { visualViewport.addEventListener('resize', updateKb); visualViewport.addEventListener('scroll', updateKb); }
    S.timers.hours = setInterval(refreshHandoffs, 60000);
    /* owner 2026-10-15: no rotating, category-specific placeholder ("… oder Foto Ihrer alten Klingel") — the field
       reads "Ihre Frage …" (owner 2026-10-16) on every category page; the camera icon carries the photo option on its own. */

    renderWelcome();
    S.built = true;
  }

  /* ============================================================
     ADAPTER
     ============================================================ */
  function ensureCore() {
    if (window.MetzlerChat && window.MetzlerChat.createAdapter) return Promise.resolve(window.MetzlerChat);
    return loadScript(BASE + 'adapter.js?v=' + VERSION).then(function () { return window.MetzlerChat; });
  }
  function startAdapter() {
    if (adapterReady) return adapterReady;
    setStatus('connecting');
    adapterReady = C.createAdapter({ context: cfg.context }).then(function (a) {
      adapter = a;
      if (!a.capabilities.upload) el.attach.hidden = true;
      offs.push(a.onStatus(function (s) { setStatus(s.state, s.detail); }));
      offs.push(a.onTyping(function (on) { S.typing = on; syncActivity(); }));
      offs.push(a.onMessage(onMessage));
      if (a.onReset) offs.push(a.onReset(onReset));
      S.restoring = true;
      el.root.classList.add('cw-noanim');
      return a.connect().catch(function (e) {
        track('chat_error', { code: 'offline', phase: 'connect', retryable: true });
        emit('error', { phase: 'connect' });
      }).then(function () {
        S.restoring = false;
        S.connectedOnce = true;
        setTimeout(function () { el.root.classList.remove('cw-noanim'); }, 30);
        if (!S.greetingId && !hasUserMessages()) renderWelcome();
        S.restoredFromStorage = hasUserMessages();
        if (S.restoredFromStorage) { S.hasSent = true; S.firstTracked = true; el.root.classList.add('has-sent'); }   /* restored transcript */
        scrollToBottom();
        return a;
      });
    });
    return adapterReady;
  }

  function setStatus(state, detail) {
    var prev = S.status;
    S.status = state;
    S.statusSince = Date.now();
    var r = el.root;
    r.classList.toggle('is-offline', state === 'offline' || state === 'error');
    r.classList.toggle('is-reconnecting', state === 'reconnecting' || state === 'connecting');
    var offline = r.classList.contains('is-offline');
    if (offline && document.activeElement === el.field) el.title.focus({ preventScroll: true });   /* never strand focus on a disabled field */
    el.field.disabled = offline;
    el.field.placeholder = offline ? COPY.placeholderOffline : (S.photo ? COPY.placeholderPhoto : COPY.placeholder);
    el.attach.disabled = offline;
    updateSend();
    clearTimeout(S.timers.reconnect);
    if (state === 'reconnecting') S.timers.reconnect = setTimeout(function () { localNotice('reconnecting', COPY.reconnecting); }, 3000);
    if (state === 'online') { removeLocal('reconnecting'); }
    if (offline && prev !== state) {
      S.awaiting = false;
      track('chat_error', { code: 'offline', phase: S.connectedOnce ? 'stream' : 'connect', retryable: true });
      /* the adapter normally posts an offline notice + handoff; add ours if it did not */
      setTimeout(function () {
        if (S.status !== 'offline' && S.status !== 'error') return;
        if (!$('.cw-turn[data-offline]', el.log)) insertLocal({ blocks: [{ type: 'error', code: 'offline', text: COPY.offline, retryable: true }, C.handoffBlock('offline', { hours: cfg.hours })] }, 'auto');
      }, 80);
    }
    syncActivity();
  }

  /* waiting / streaming / light */
  function syncActivity() {
    var streaming = Object.keys(S.streamingIds).length > 0;
    var waiting = !streaming && (S.awaiting || S.typing) && (S.status === 'online' || S.carrying);
    el.root.classList.toggle('is-streaming', streaming);
    el.root.classList.toggle('is-waiting', waiting);
    var key = el.root.classList.contains('is-offline') ? 'offline' : el.root.classList.contains('is-reconnecting') ? 'reconnecting' : streaming ? 'streaming' : waiting ? 'waiting' : 'online';
    el.light.setAttribute('aria-label', COPY.light[key]);
    if (waiting) { if (el.typing.parentNode !== el.log) el.log.appendChild(el.typing); }
    else if (el.typing.parentNode) el.typing.parentNode.removeChild(el.typing);
  }
  function startAwaiting() {
    S.awaiting = true;
    clearTimeout(S.timers.slow); clearTimeout(S.timers.cap);
    S.timers.slow = setTimeout(function () { if (S.awaiting) localNotice('slow', COPY.slow); }, 8000);
    S.timers.cap = setTimeout(function () {
      if (!S.awaiting) return;
      S.awaiting = false; removeLocal('slow'); syncActivity();
      track('chat_error', { code: 'timeout', phase: 'stream', retryable: true });
      registerError();
      insertLocal({ blocks: [{ type: 'error', code: 'timeout', text: COPY.noAnswer, retryable: true }] }, 'auto', 'timeout');
    }, 15000);
    syncActivity();
  }
  function stopAwaiting() {
    if (!S.awaiting) return;
    S.awaiting = false;
    clearTimeout(S.timers.slow); clearTimeout(S.timers.cap);
    removeLocal('slow');
    syncActivity();
  }
  function registerError() {
    S.errorStreak++;
    if (S.errorStreak === 2 && !handoffShown(null)) insertLocal({ blocks: [C.handoffBlock('fallback', { hours: cfg.hours })] }, 'auto');
  }

  /* ============================================================
     MESSAGES → TURNS
     ============================================================ */
  function hasUserMessages() { return S.order.some(function (id) { return S.msgs[id] && S.msgs[id].role === 'user'; }); }

  function onMessage(m) {
    /* hand-over in flight: Juna's reply waits until the question has landed (research/19) */
    if (S.handing && m.role !== 'user') { S.held = (S.held || []).concat([m]); return; }
    /* a failed send is already shown on its plate ("Nicht gesendet · Erneut versuchen") */
    if (m.role === 'system' && m.meta && m.meta.retryOf) return;
    /* a late greeting (e.g. after a reset, when the user already asked something) is covered by the welcome — never a bubble */
    if (m.role === 'bot' && m.quickRepliesKind === 'starters' && !S.msgs[m.id] && (hasUserMessages() || S.carrying)) return;
    var isNew = !S.msgs[m.id];
    S.msgs[m.id] = m;
    if (isNew) S.order.push(m.id);
    /* owner 2026-10-15 "sometimes the renew icon is away": a restored transcript (reload / reopen) replays its
       messages through here, so ↻ is shown whenever the conversation contains a user message */
    if (m.role === 'user' && el.restartBtn && !S.pendingReset && !el.restartBtn.classList.contains('is-undo')) el.restartBtn.hidden = false;

    /* first bot message of an empty transcript = greeting → welcome (text suppressed, replies → starters) */
    if (m.role === 'bot' && (S.greetingId === m.id || (!S.greetingId && !hasUserMessages() && !$('.cw-turn', el.log)))) {
      S.greetingId = m.id;
      if (m.status === 'complete' && m.quickReplies && m.quickReplies.length) { S.starters = m.quickReplies.slice(0, 4); renderWelcome(); }
      return;
    }
    if (m.role === 'bot' || m.role === 'system') {
      if (m.role === 'bot') stopAwaiting();
      if (m.status === 'streaming') S.streamingIds[m.id] = true; else delete S.streamingIds[m.id];
      syncActivity();
    }
    if (m.role === 'system' && m.blocks.some(function (b) { return b.type === 'error' && b.code === 'offline'; })) {
      $$('.cw-turn[data-offline]', el.log).forEach(function (t) { if (t.getAttribute('data-id') !== m.id) removeTurn(t.getAttribute('data-id')); });
    }
    var wasBottom = atBottom();
    var turn = renderTurn(m, isNew);
    if (m.role === 'user') {
      if (isNew) { retireWelcome(); S.follow = { active: true, anchorId: null }; scrollToBottom(); }
    } else if (isNew) {
      if (S.follow.active && (wasBottom || S.follow.anchorId === null)) {
        if (!S.follow.anchorId) S.follow.anchorId = m.id;
        followScroll();
      } else if (!S.restoring) showPill(S.follow.anchorId || m.id);
      else scrollToBottom();
    } else if (S.follow.active) followScroll();

    if ((m.role === 'bot' || m.role === 'system') && m.status === 'complete' && !S.countedComplete[m.id]) {
      S.countedComplete[m.id] = true;
      if (m.role === 'bot') S.errorStreak = 0;
      if (!S.open && !S.restoring && m.role === 'bot') {
        S.unread++;
        if (!S.unreadFirstId) S.unreadFirstId = m.id;
        emit('unread', S.unread);
      }
    }
    return turn;
  }

  function onReset() {
    S.msgs = {}; S.order = []; S.turns = {}; S.greetingId = null; S.streamingIds = {}; S.countedComplete = {};
    S.recommended = false; S.errorStreak = 0; S.lastHandoffTurn = null; S.unread = 0; S.unreadFirstId = null; S.chipLast = null;
    el.menuSummary.hidden = true;
    stopAwaiting();
    el.log.textContent = '';
    renderWelcome();
    hidePill();
    ss('cw_transcript', null);
    emit('transcript', false);
    el.restartBtn.hidden = true;
  }

  function removeTurn(id) {
    var t = S.turns[id];
    if (t && t.parentNode) t.parentNode.removeChild(t);
    delete S.turns[id];
  }

  function renderTurn(m, isNew) {
    var turn = S.turns[m.id];
    var role = m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'bot';
    if (!turn && role === 'user' && S.provisional) {             /* hub hand-over: the carried plate becomes this turn */
      turn = S.provisional; S.provisional = null; S.carrying = false;
      turn.setAttribute('data-id', m.id); S.turns[m.id] = turn;
    }
    if (!turn) {
      turn = h('article', { class: 'cw-turn cw-turn--' + role, 'data-id': m.id });
      if (!S.restoring && !reduced()) turn.classList.add('is-enter');
      S.turns[m.id] = turn;
      el.log.insertBefore(turn, el.typing.parentNode === el.log ? el.typing : null);
    }
    if (role === 'user') renderUser(turn, m); else renderBot(turn, m);
    return turn;
  }

  function renderUser(turn, m) {
    turn.textContent = '';
    turn.classList.toggle('is-sending', m.status === 'sending');
    turn.classList.toggle('is-failed', m.status === 'failed');
    turn.appendChild(h('span', { class: 'cw-sr', text: COPY.you }));
    var img = m.blocks.filter(function (b) { return b.type === 'image'; })[0];
    var txt = m.blocks.filter(function (b) { return b.type === 'text'; })[0];
    if (img) {
      var plate = h('div', { class: 'cw-plate cw-plate--photo' }, [
        img.url ? h('img', { src: img.url, alt: img.alt || COPY.photoAlt }) : h('div', { class: 'cw-plate__caption', text: COPY.photoAlt }),
        txt ? h('div', { class: 'cw-plate__caption', text: txt.text }) : null,
        h('span', { class: 'cw-plate__progress', 'aria-hidden': 'true' })
      ]);
      turn.appendChild(plate);
    } else turn.appendChild(h('div', { class: 'cw-plate', text: txt ? txt.text : '' }));
    if (m.status === 'failed') {
      turn.appendChild(h('p', { class: 'cw-plate__failed' }, [COPY.failed + ' · ', h('button', { type: 'button', text: COPY.retry, onclick: function () { retry(m.id); } })]));
    }
  }

  function renderBot(turn, m) {
    var streaming = m.status === 'streaming';
    /* fast path: streaming text update */
    var body = turn.querySelector('.cw-turn__body');
    if (body && streaming && m.blocks.length === 1 && m.blocks[0].type === 'text' && body.firstElementChild && body.firstElementChild.classList.contains('cw-text')) {
      body.firstElementChild.innerHTML = markdown(m.blocks[0].text, true);
      appendCaret(body.firstElementChild);
      turn.setAttribute('aria-busy', 'true');
      return;
    }
    var hadCaret = !!turn.querySelector('.cw-caret');
    turn.textContent = '';
    turn.removeAttribute('data-offline');
    if (m.role === 'bot') turn.appendChild(h('span', { class: 'cw-sr', text: COPY.juna }));
    body = h('div', { class: 'cw-turn__body' });
    turn.appendChild(body);
    var suppressed = 0;
    m.blocks.forEach(function (b, i) {
      /* owner rule (R3r): the "Persönliche Beratung" card appears AT MOST ONCE per conversation, whatever its source;
         the bot's text still shows. Scope = the current log (undo restores it, a committed reset clears it). */
      if (b.type === 'handoff' && (!handoffAllowed(b, m) || handoffShown(turn))) { suppressed++; return; }
      var node = renderBlock(b, m, i);
      if (node) body.appendChild(node);
      if (b.type === 'error' && b.code === 'offline') turn.setAttribute('data-offline', '');
    });
    if (streaming) {
      turn.setAttribute('aria-busy', 'true');
      var t = body.querySelector('.cw-text');
      if (t) appendCaret(t);
    } else {
      turn.removeAttribute('aria-busy');
      if (hadCaret && !reduced()) {
        var last = body.querySelector('.cw-text');
        if (last) { var c = appendCaret(last); setTimeout(function () { c.classList.add('is-out'); setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 130); }, 16); }
      }
      var src = m.blocks.filter(function (b) { return b.type === 'text' && b.source; })[0];
      if (src) body.appendChild(sourceEl(src.source));
      if (m.quickReplies && m.quickReplies.length && !m.meta.repliesUsed) renderReplies(turn, m);
    }
    turn.hidden = suppressed > 0 && !body.childElementCount;          /* a card-only message with nothing left: no empty turn */
  }
  /* owner 2026-10-15 (R3r): the card is NOT a default. It renders only when Juna cannot answer:
     a message flagged meta.fallback === true (normalised model; mock fallback, Botpress fallback node), or an
     adapter/UI system message for the offline / repeated-error state (reason 'offline' | 'fallback').
     A live bot attaching a handoff to an ordinary answer is ignored here. */
  function handoffAllowed(b, m) {
    if (m.meta && m.meta.fallback === true) return true;
    return m.role === 'system' && (b.reason === 'offline' || b.reason === 'fallback');
  }
  function handoffShown(except) {
    return $$('.cw-handoff', el.log).some(function (n) { return n.closest('.cw-turn') !== except; });
  }
  function appendCaret(textEl) {
    var host = textEl.lastElementChild && /^(P|LI|UL|OL)$/.test(textEl.lastElementChild.tagName) ? textEl.lastElementChild : textEl;
    if (host.tagName === 'UL' || host.tagName === 'OL') host = host.lastElementChild || host;
    var c = h('span', { class: 'cw-caret', 'aria-hidden': 'true' });
    host.appendChild(c);
    return c;
  }

  function renderBlock(b, m, idx) {
    switch (b.type) {
      case 'text': return h('div', { class: 'cw-text', html: b.format === 'plain' ? '<p>' + esc(b.text).replace(/\n/g, '<br>') + '</p>' : markdown(b.text, m.status === 'streaming') });
      case 'products': return renderProducts(b, m);
      case 'comparison': return renderCompare(b);
      case 'handoff': return renderHandoff(b, m);
      case 'summary': return renderSummary(b, m);
      case 'choices': return renderAnswerRows(m, b.options, true);
      case 'card': return renderGenericCard(b);
      case 'carousel': return renderCarousel(b.items.map(function (c) { return renderGenericCard(c); }));
      case 'image': return h('figure', { class: 'cw-figure' }, [h('img', { src: b.url, alt: b.alt || '', loading: 'lazy' }), b.caption ? h('figcaption', { text: b.caption }) : null]);
      case 'media': return h(b.kind === 'audio' ? 'audio' : 'video', { class: 'cw-media', src: b.url, controls: true, preload: 'none' });
      case 'file': return linkRow(I.doc, b.title || 'Datei', b.url);
      case 'location': return linkRow(I.pin, b.title || 'Karte', b.mapUrl);
      case 'notice': return noticeEl(b.text, b.link ? h('a', { class: 'cw-notice__action', href: safeHref(b.link.href), text: b.link.label }) : null);
      case 'error': return errorEl(b, m);
      default: return noticeEl(COPY.unsupported);
    }
  }
  /* "Quelle: FAQ ›" — on-page FAQ anchors open the matching <details>; the sheet minimises so the page is visible */
  function sourceEl(src) {
    var ext = isExternal(src.href);
    var a = h('a', { href: safeHref(src.href), target: ext ? '_blank' : null, rel: ext ? 'noopener' : null, text: src.label + ' ›' });
    a.addEventListener('click', function () {
      track('chat_source_click', { label: src.label });
      if (src.faq && src.href.charAt(0) === '#') {
        var target = document.querySelector(src.href);
        $$('details', target || document).forEach(function (d) {
          var q = d.querySelector('summary');
          if (q && q.textContent.indexOf(src.faq) > -1) d.open = true;
        });
        if (S.size === 'sheet') close({ restoreFocus: false });
      }
    });
    return h('p', { class: 'cw-source' }, [COPY.source + ' ', a, ext ? h('span', { class: 'cw-sr', text: ' ' + COPY.external }) : null]);
  }
  function noticeEl(text, action, extraClass) {
    return h('p', { class: 'cw-notice' + (extraClass ? ' ' + extraClass : ''), role: 'status' }, [h('span', { html: I.warn }).firstChild, h('span', null, [text, action ? ' ' : null, action])]);
  }
  function errorEl(b, m) {
    var action = null, text = b.text;
    if (b.code === 'offline') { text = COPY.offline; action = h('button', { type: 'button', class: 'cw-notice__action', text: COPY.reconnect, onclick: reconnect }); }
    else if (b.code === 'rate_limit') text = COPY.rateLimit;
    else if (b.code === 'timeout' || b.code === 'server') { text = COPY.noAnswer; if (b.retryable !== false) action = h('button', { type: 'button', class: 'cw-notice__action', text: COPY.retry, onclick: function () { retryLast(m.id); } }); }
    return noticeEl(text, action);
  }
  function linkRow(icon, label, href) {
    var ext = isExternal(href);
    return h('ul', { class: 'cw-rows' }, [h('li', null, [h('a', { class: 'cw-row', href: safeHref(href), target: ext ? '_blank' : null, rel: ext ? 'noopener' : null, html:
      '<span class="cw-row__icon">' + icon + '</span><span class="cw-row__label">' + esc(label) + '</span>' + '<span class="cw-row__chev">' + I.ext + '</span>' })])]);
  }

  /* ---------- replies: answers (rows) vs follow-ups (≤2 chips) ---------- */
  function renderReplies(turn, m) {
    var kind = m.quickRepliesKind;
    var lastText = m.blocks.filter(function (b) { return b.type === 'text'; }).pop();
    if (!kind) kind = lastText && /\?\s*$/.test(lastText.text) ? 'answers' : 'followups';
    if (kind === 'answers' || kind === 'starters') { turn.querySelector('.cw-turn__body').appendChild(renderAnswerRows(m, m.quickReplies)); return; }
    var opts = m.quickReplies.slice();
    if (opts.length > 2) opts = opts.filter(function (o) { return o.value !== 'intent:human'; });   /* the ⋯ menu item covers it */
    opts = opts.slice(0, 2);
    var key = opts.map(function (o) { return o.value; }).join('|');
    /* R3r: the same pair as on the previous chip turn is not offered again (single "way on" chips stay, CA-13) */
    if (opts.length > 1 && S.chipLast && S.chipLast.id !== m.id && S.chipLast.key === key) return;
    S.chipLast = { id: m.id, key: key };
    var wrap = h('div', { class: 'cw-chips' });
    opts.forEach(function (o, i) {
      wrap.appendChild(h('button', { type: 'button', class: 'cw-chip', text: o.label, onclick: function () { pickReply(m, o, 'chip', i + 1, wrap); } }));
    });
    turn.querySelector('.cw-turn__body').appendChild(wrap);
  }
  function renderAnswerRows(m, options, inline) {
    var list = h('ul', { class: 'cw-rows cw-rows--answers' });
    var opts = options.slice(0, 4);
    opts.forEach(function (o, i) {
      list.appendChild(h('li', null, [h('button', { type: 'button', class: 'cw-row', onclick: function () { pickReply(m, o, 'chip', i + 1, list); },
        html: '<span class="cw-row__label">' + esc(o.label) + '</span><span class="cw-row__chev">' + I.chev + '</span>' })]));
    });
    var isWiring = options.some(function (o) { return /^(wire|compat):/.test(o.value); });
    if (cfg.photo && isWiring && adapter && adapter.capabilities.upload) {
      list.appendChild(h('li', null, [h('button', { type: 'button', class: 'cw-row cw-row--photo', onclick: function () { el.file.click(); },
        html: I.attach + '<span class="cw-row__label">' + COPY.photoRow + '</span><span class="cw-row__chev">' + I.chev + '</span>' })]));
    }
    return list;
  }
  function pickReply(m, o, input, position, container) {
    if (o.value === 'action:photo') { el.file.click(); return; }
    if (o.value === 'intent:summary') { requestSummary('chip', o); return; }
    track('chat_followup_select', { item: o.value, position: position });
    if (container) container.classList.add('is-gone');
    m.meta.repliesUsed = true;
    send({ type: 'postback', value: o.value, label: o.label }, input);
  }
  function retireReplies() {
    $$('.cw-chips, .cw-rows--answers', el.log).forEach(function (n) {
      var t = n.closest('.cw-turn'); var m = t && S.msgs[t.getAttribute('data-id')];
      if (m) m.meta.repliesUsed = true;
      n.classList.add('is-gone');
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, reduced() ? 0 : 130);
    });
  }

  /* ---------- products ---------- */
  function productEl(p, position, block, total) {
    var stars = p.reviews ? h('span', { class: 'cw-product__rating', 'aria-label': COPY.stars(p.rating || 5, p.reviews), text: '★ ' + (p.rating || 5).toFixed(1).replace('.', ',') + ' (' + p.reviews + ')' }) : null;
    var ext = isExternal(p.url);
    var badge = /bus|2-draht/i.test(p.systemLabel || '') ? 'BUS' : 'IP';
    var card = h('div', { class: 'cw-product' }, [
      h('div', { class: 'cw-product__media' }, [h('img', { src: p.imageUrl, alt: p.title, loading: 'lazy', width: '76', height: '76' })]),
      h('div', { class: 'cw-product__body' }, [
        h('p', { class: 'cw-product__title', title: p.name, text: p.title }),
        h('p', { class: 'cw-product__meta' }, [h('span', { class: 'cw-badge', text: badge }), h('span', { text: p.highlights && p.highlights[1] ? p.highlights[1] : '' })]),
        h('p', { class: 'cw-product__price' }, [h('strong', { text: p.priceText }), p.uvpText ? h('span', { class: 'cw-product__uvp' }, [COPY.uvp + ' ', h('s', { text: p.uvpText })]) : null]),
        h('p', { class: 'cw-product__foot' }, [stars,
          h('a', { class: 'cw-product__link', href: safeHref(p.url), target: ext ? '_blank' : null, rel: ext ? 'noopener' : null,
            onclick: function () { track('chat_product_click', { product_id: p.id, position: position, block: block, price: p.price }); } },
            [COPY.view + ' ›', h('span', { class: 'cw-sr', text: ': ' + p.name + (ext ? ' ' + COPY.external : '') })])])
      ])
    ]);
    return card;
  }
  function renderProducts(b, m) {
    noteRecommendation();
    if (b.items.length === 1 || b.layout === 'single') return productEl(b.items[0], 1, 'single');
    return renderCarousel(b.items.map(function (p, i) { return productEl(p, i + 1, 'carousel', b.items.length); }));
  }
  function renderCarousel(cards) {
    var track_ = h('ul', { class: 'cw-carousel__track' });
    cards.forEach(function (c, i) {
      track_.appendChild(h('li', { class: 'cw-carousel__item', role: 'group', 'aria-roledescription': 'Folie', 'aria-label': (i + 1) + COPY.of + cards.length }, [c]));
    });
    var prev = h('button', { type: 'button', class: 'cw-carousel__nav cw-carousel__nav--prev', 'aria-label': COPY.prev, html: I.chevL, disabled: true, onclick: function () { step(-1); } });
    var next = h('button', { type: 'button', class: 'cw-carousel__nav cw-carousel__nav--next', 'aria-label': COPY.next, html: I.chev, onclick: function () { step(1); } });
    function step(dir) { var w = track_.firstElementChild ? track_.firstElementChild.getBoundingClientRect().width + 8 : 288; track_.scrollBy({ left: dir * w, behavior: reduced() ? 'auto' : 'smooth' }); }
    function sync() { prev.disabled = track_.scrollLeft < 4; next.disabled = track_.scrollLeft + track_.clientWidth >= track_.scrollWidth - 4; }
    track_.addEventListener('scroll', sync, { passive: true });
    track_.addEventListener('focusin', function (e) { var item = e.target.closest('.cw-carousel__item'); if (item && item.scrollIntoView) item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    setTimeout(sync, 0);
    return h('div', { class: 'cw-carousel', role: 'group', 'aria-roledescription': 'Karussell', 'aria-label': COPY.carousel }, [prev, track_, next]);
  }
  function renderGenericCard(c) {
    return h('div', { class: 'cw-product' }, [
      c.imageUrl ? h('div', { class: 'cw-product__media' }, [h('img', { src: c.imageUrl, alt: c.title, loading: 'lazy' })]) : h('div'),
      h('div', { class: 'cw-product__body' }, [
        h('p', { class: 'cw-product__title', text: c.title }),
        c.subtitle ? h('p', { class: 'cw-product__meta', text: c.subtitle }) : null,
        h('p', { class: 'cw-product__actions' }, (c.actions || []).map(function (a) {
          if (a.kind === 'url') return h('a', { href: safeHref(a.value), target: '_blank', rel: 'noopener', text: a.label });
          return h('button', { type: 'button', text: a.label, onclick: function () { send({ type: 'postback', value: a.value, label: a.label }, 'chip'); } });
        }))
      ])
    ]);
  }
  function noteRecommendation() {
    if (S.recommended) return;
    S.recommended = true;
    el.menuSummary.hidden = false;
  }

  /* ---------- comparison datasheet ---------- */
  function renderCompare(b) {
    noteRecommendation();
    var wrap = h('div', { class: 'cw-compare' });
    var table = h('table');
    var thead = h('thead'), tr = h('tr');
    tr.appendChild(h('th', { scope: 'col' }, [h('span', { class: 'cw-sr', text: 'Merkmal' })]));
    var many = b.columns.length > 3;
    wrap.classList.toggle('cw-compare--many', many);     /* horizontal scroll only for ≥4 products */
    b.columns.forEach(function (c) {
      var fam = c.family || String(c.title).split(' · ')[0];
      tr.appendChild(h('th', { scope: 'col' }, [h('div', { class: 'cw-compare__head' }, [h('img', { src: c.imageUrl, alt: '', loading: 'lazy' }),
        h('span', { class: 'cw-compare__fam', text: fam }), h('span', { class: 'cw-compare__full', text: c.title })])]));
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = h('tbody'), same = 0;
    b.rows.forEach(function (r) {
      var identical = r.values.every(function (v) { return v === r.values[0]; });
      if (identical) same++;
      var row = h('tr', { class: identical ? 'is-same' : null });
      row.appendChild(h('th', { scope: 'row', text: r.label }));
      r.values.forEach(function (v, i) {
        var best = !identical && r.best === i;
        var cls = [best ? 'is-best' : '', r.numeric ? 'is-num' : ''].join(' ').trim() || null;
        row.appendChild(h('td', { class: cls }, [h('span', { class: 'cw-compare__v', text: v }), best ? h('span', { class: 'cw-sr', text: ' ' + COPY.best }) : null]));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    var tfoot = h('tfoot'), ft = h('tr');
    ft.appendChild(h('th', { scope: 'row' }, [h('span', { class: 'cw-sr', text: 'Produktseite' })]));
    b.columns.forEach(function (c, i) {
      var ext = isExternal(c.url);
      ft.appendChild(h('td', null, [h('a', { class: 'cw-compare__link', href: safeHref(c.url), target: ext ? '_blank' : null, rel: ext ? 'noopener' : null,
        onclick: function () { track('chat_product_click', { product_id: c.id, position: i + 1, block: 'comparison', price: priceOf(c.id) }); } },
        [COPY.view + ' ›', h('span', { class: 'cw-sr', text: ': ' + c.title })])]));
    });
    tfoot.appendChild(ft); table.appendChild(tfoot);
    var scroller = h('div', { class: 'cw-compare__scroll', tabindex: '0', role: 'region', 'aria-label': b.title || 'Vergleich' }, [table]);
    wrap.appendChild(scroller);
    if (same) {
      var toggle = h('button', { type: 'button', class: 'cw-compare__toggle', 'aria-expanded': 'false', text: COPY.allRows(b.rows.length) });
      toggle.addEventListener('click', function () {
        var all = wrap.classList.toggle('show-all');
        toggle.textContent = all ? COPY.diffRows : COPY.allRows(b.rows.length);
        toggle.setAttribute('aria-expanded', String(all));
      });
      wrap.appendChild(toggle);
    }
    function edge() {
      wrap.classList.toggle('is-scrollable', scroller.scrollWidth > scroller.clientWidth + 2);
      wrap.classList.toggle('is-end', scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2);
    }
    scroller.addEventListener('scroll', edge, { passive: true });
    setTimeout(edge, 0);
    return wrap;
  }
  function priceOf(id) {
    for (var i = S.order.length - 1; i >= 0; i--) {
      var m = S.msgs[S.order[i]];
      if (!m) continue;
      for (var j = 0; j < m.blocks.length; j++) if (m.blocks[j].type === 'products') {
        var p = m.blocks[j].items.filter(function (x) { return x.id === id; })[0];
        if (p) return p.price;
      }
    }
    return null;
  }

  /* ---------- handoff card ---------- */
  var handoffSeq = 0;
  function renderHandoff(b, m) {
    var id = 'cwH' + (++handoffSeq);
    var trigger = (m.meta && m.meta.trigger) || 'bot';
    var card = h('section', { class: 'cw-handoff' + (b.emphasis === 'none' ? ' cw-handoff--flat' : ''), 'aria-labelledby': id + 't', 'aria-describedby': id + 'd', 'data-reason': b.reason });
    card.appendChild(h('h3', { class: 'cw-handoff__title', id: id + 't', text: b.title }));
    card.appendChild(h('p', { class: 'cw-sr', id: id + 'd', text: b.text }));
    var list = h('ul', { class: 'cw-rows' });
    b.channels.forEach(function (c) {
      /* owner 2026-10-15: "Termin buchen" opens the page's own Termin modal (#contactModal: Produktberatung,
         Technischer Support, Partnerbetriebe) — same as the hub's Termin row. Calendly link only as fallback. */
      var viaModal = c.kind === 'appointment' && terminModalAvailable();
      var ext = !viaModal && (!!c.external || (isExternal(c.href) && !/^(tel|mailto):/i.test(c.href)));
      var a = h('a', { class: 'cw-row', href: viaModal ? '#contactModal' : safeHref(c.href), 'data-channel': c.kind,
        'aria-haspopup': viaModal ? 'dialog' : null, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null });
      if (viaModal) a.addEventListener('click', function (e) { e.preventDefault(); openTerminModal(a); });
      a.innerHTML = '<span class="cw-row__icon">' + (CHANNEL_ICON[c.kind] || I.chev) + '</span><span class="cw-row__label">' + esc(c.label) + '</span>' +
        '<span class="cw-row__meta"></span><span class="cw-row__chev">' + (ext ? I.ext : I.chev) + '</span>';
      if (ext) a.appendChild(h('span', { class: 'cw-sr', text: ' ' + COPY.external }));
      a.addEventListener('click', function () {
        var av = c.kind === 'phone' ? C.availability(null, cfg.hours).open : null;
        track('chat_handoff_select', { channel: c.kind, reason: b.reason, trigger: trigger, available: av });
      });
      list.appendChild(h('li', null, [a]));
    });
    card.appendChild(list);
    updatePhoneMeta(card);
    S.lastHandoffTurn = m.id;
    return card;
  }
  function terminModalAvailable() { return !!(document.getElementById('contactModal') && document.querySelector('[data-open-modal]')); }
  /* Opens the page's Termin modal above the chat. On the mobile sheet the chat makes the page inert, so the modal is
     released first and the sheet becomes modal again once the Termin modal closes. Focus returns to the row
     (the page's modal remembers document.activeElement as its return target). */
  function openTerminModal(row) {
    var modal = document.getElementById('contactModal');
    var opener = document.querySelector('[data-open-modal]');
    if (!modal || !opener) return;
    track('appointment_click', { type: 'modal', source: 'chat' });
    var sheet = S.size === 'sheet' && S.open;
    if (sheet) leaveModal();
    document.body.classList.add('cw-modal-over');
    try { row.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    opener.click();
    var obs = new MutationObserver(function () {
      if (modal.classList.contains('is-open')) return;
      obs.disconnect();
      document.body.classList.remove('cw-modal-over');
      if (S.open && S.size === 'sheet') enterModal();
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  function updatePhoneMeta(scope) {
    var a = C.availability(null, cfg.hours);
    $$('.cw-row[data-channel="phone"]', scope).forEach(function (row) {
      var meta = row.querySelector('.cw-row__meta');
      meta.innerHTML = '<span class="cw-row__dot' + (a.open ? '' : ' is-closed') + '" aria-hidden="true"></span>' +
        '<span>' + esc(a.open ? C.SERVICE.hotlineDisplay : a.short) + '</span><span class="cw-sr"> – ' + esc(a.text) + '</span>';
    });
  }
  function refreshHandoffs() { if (el.log) updatePhoneMeta(el.log); }

  /* ---------- Beratungsprotokoll ---------- */
  function renderSummary(b, m) {
    var date = new Date(b.date || Date.now());
    var dateText = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var id = 'cwS' + (++handoffSeq);
    var card = h('section', { class: 'cw-summary', 'aria-labelledby': id });
    card.appendChild(h('header', { class: 'cw-summary__head' }, [h('h3', { id: id, text: b.title || 'Beratungsprotokoll' }), h('time', { datetime: date.toISOString().slice(0, 10), text: dateText })]));
    var dl = h('dl');
    (b.rows || []).slice(0, 6).forEach(function (r) {
      var dd = h('dd');
      if (r.product) {
        dd.appendChild(h('span', { class: 'cw-summary__prod' }, [h('img', { src: r.product.imageUrl, alt: '' }), h('span', { text: r.product.title + ' · ' + r.product.priceText })]));
      } else dd.textContent = r.value;
      dl.appendChild(h('div', null, [h('dt', { text: r.label }), dd]));
    });
    card.appendChild(dl);
    if (b.note) card.appendChild(h('p', { class: 'cw-summary__note', text: b.note }));
    var status = h('span', { class: 'cw-summary__status', 'aria-live': 'polite' });
    card.appendChild(h('div', { class: 'cw-summary__actions' }, [
      h('button', { type: 'button', class: 'cw-obtn', html: I.print + COPY.print, onclick: function () { printSummary(b, dateText); } }),
      h('button', { type: 'button', class: 'cw-obtn', html: I.copy + COPY.copy, onclick: function () { copySummary(b, dateText, status); } }),
      status
    ]));
    $$('svg', card.querySelector('.cw-summary__actions')).forEach(function (s) { s.style.width = '16px'; s.style.height = '16px'; });
    if (!S.summaryTracked[m.id] && !S.restoring) { S.summaryTracked[m.id] = true; track('chat_summary', { action: 'open' }); }
    return card;
  }
  function summaryText(b, dateText) {
    var lines = ['Beratungsprotokoll – Metzler Türsprechanlagen', dateText, ''];
    (b.rows || []).forEach(function (r) { lines.push(r.label + ': ' + r.value); });
    if (b.products && b.products.length) { lines.push('', 'Produkte:'); b.products.forEach(function (p) { lines.push('- ' + p.title + ' (' + p.priceText + '): ' + new URL(p.url, location.href).href); }); }
    lines.push('', b.note || '', 'Hotline ' + C.SERVICE.hotlineDisplay + ' · edelstahl-tuerklingel.de');
    return lines.join('\n');
  }
  function copySummary(b, dateText, status) {
    var text = summaryText(b, dateText);
    var done = function () { status.textContent = COPY.copied; setTimeout(function () { status.textContent = ''; }, 2000); track('chat_summary', { action: 'copy' }); };
    /* Clipboard API first; if it rejects or hangs (no focus / permissions) fall back to execCommand */
    var settled = false;
    var fallback = function () { if (settled) return; settled = true; if (legacyCopy(text)) done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { if (!settled) { settled = true; done(); } }, fallback);
      setTimeout(fallback, 800);
    } else fallback();
  }
  function legacyCopy(text) {
    var ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;font-size:16px' }); ta.value = text;   /* 16 px: no iOS zoom on select */
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function buildPrintRoot(b, dateText) {
    $$('.cw-print-root').forEach(function (n) { n.parentNode.removeChild(n); });
    var root = h('div', { class: 'cw-print-root' });
    root.appendChild(h('p', { class: 'cw-print__brand', text: 'METZLER' }));
    root.appendChild(h('h1', { text: b.title || 'Beratungsprotokoll' }));
    root.appendChild(h('p', { class: 'cw-print__date', text: 'Türsprechanlagen · ' + dateText }));
    var dl = h('dl');
    (b.rows || []).forEach(function (r) { dl.appendChild(h('div', null, [h('dt', { text: r.label }), h('dd', { text: r.value })])); });
    root.appendChild(dl);
    if (b.products && b.products.length) {
      var ul = h('ul', { class: 'cw-print__urls' });
      b.products.forEach(function (p) { ul.appendChild(h('li', { text: p.title + ' – ' + p.priceText + ' – ' + new URL(p.url, location.href).href })); });
      root.appendChild(ul);
    }
    if (b.note) root.appendChild(h('p', { class: 'cw-print__note', text: b.note }));
    root.appendChild(h('p', { class: 'cw-print__foot', text: 'Hotline ' + C.SERVICE.hotlineDisplay + ' (' + cfg.hours.replace('-', '–') + ' Uhr) · edelstahl-tuerklingel.de · ' + dateText }));
    document.body.appendChild(root);
    return root;
  }
  function printSummary(b, dateText) {
    buildPrintRoot(b, dateText);
    track('chat_summary', { action: 'print' });
    var cleanup = function () { window.removeEventListener('afterprint', cleanup); $$('.cw-print-root').forEach(function (n) { n.parentNode.removeChild(n); }); };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }
  function requestSummary(source, chip) {
    track('chat_followup_select', { item: 'intent:summary', position: source === 'menu' ? 0 : 2 });
    retireReplies();
    send({ type: 'postback', value: 'intent:summary', label: chip ? chip.label : COPY.summaryChip }, source === 'menu' ? 'chip' : 'chip');
  }

  /* ---------- local (UI-only) system turns ---------- */
  var localSeq = 0;
  function insertLocal(spec, trigger, key) {
    var m = { id: 'local_' + (key || 'x') + '_' + (++localSeq), role: 'system', createdAt: new Date().toISOString(), status: 'complete', blocks: spec.blocks, meta: { source: 'ui', trigger: trigger || 'auto', key: key || '' } };
    S.msgs[m.id] = m; S.order.push(m.id);
    var t = renderTurn(m, true);
    if (key) t.setAttribute('data-local', key);
    if (atBottom() || trigger === 'menu') scrollToBottom();
    return t;
  }
  function localNotice(key, text) {
    if ($('.cw-turn[data-local="' + key + '"]', el.log)) return;
    insertLocal({ blocks: [{ type: 'notice', variant: 'info', text: text }] }, 'auto', key);
  }
  function removeLocal(key) { $$('.cw-turn[data-local="' + key + '"]', el.log).forEach(function (t) { removeTurn(t.getAttribute('data-id')); }); }

  /* ============================================================
     WELCOME
     ============================================================ */
  function greetingText() {
    var now = new Date(), dbg = param('hh_now');                       /* same debug clock as the hub */
    if (dbg && !isNaN(new Date(dbg).getTime())) now = new Date(dbg);
    var hour = now.getHours();
    try { hour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(now) % 24; } catch (e) { /* local */ }
    return hour < 11 ? COPY.greet.morning : hour >= 18 ? COPY.greet.evening : COPY.greet.day;
  }
  function renderWelcome() {
    var w = $('.cw-welcome', el.log);
    if (!w) { w = h('div', { class: 'cw-welcome' }); el.log.insertBefore(w, el.log.firstChild); }
    w.textContent = '';
    var page = COPY.pageNames[cfg.pageType] || 'Türsprechanlagen';
    w.appendChild(h('p', { class: 'cw-welcome__context' }, [COPY.contextPrefix, h('strong', { text: page })]));
    if (cfg.product) {
      var card = C.productCard(cfg.product, { assetBase: assetBase() });
      w.appendChild(h('button', { type: 'button', class: 'cw-welcome__product', onclick: function () {
        track('chat_starter_select', { item: 'product:' + card.id, position: 0 });
        send({ type: 'postback', value: 'product:' + card.id, label: card.title }, 'starter');
      } }, [h('img', { src: card.imageUrl, alt: '' }), h('span', { text: card.title })]));
    }
    w.insertBefore(h('img', { class: 'cw-welcome__visual', src: assetBase() + 'Product%20Image/Sprechanlage/video-station.png', alt: '', 'aria-hidden': 'true' }), w.firstChild);
    w.appendChild(h('p', { class: 'cw-welcome__head', text: COPY.retiredHead(page) }));
    w.appendChild(h('h3', { class: 'cw-welcome__title', role: 'heading', 'aria-level': '3', text: greetingText() }));
    w.appendChild(h('p', { class: 'cw-welcome__scope', text: COPY.scope }));
    var starters = (S.starters && S.starters.length ? S.starters : COPY.starters).slice(0, 4);
    var list = h('ul', { class: 'cw-rows' });
    starters.forEach(function (s, i) {
      var label = (COPY.starters.filter(function (c) { return c.value === s.value; })[0] || s).label;
      list.appendChild(h('li', null, [h('button', { type: 'button', class: 'cw-row', 'data-value': s.value, onclick: function () {
        track('chat_starter_select', { item: s.value, position: i + 1 });
        send({ type: 'postback', value: s.value, label: label }, 'starter');
      }, html: '<span class="cw-row__icon">' + (STARTER_ICON[s.value] || I.chev) + '</span><span class="cw-row__label">' + esc(label) + '</span><span class="cw-row__chev">' + I.chev + '</span>' })]));
    });
    w.appendChild(list);
    w.classList.toggle('is-retired', hasUserMessages() || !!S.carrying);
  }
  /* CW-01: starters serve the empty state only — fade (120 ms), then out of layout and tab order */
  function retireWelcome() {
    var w = $('.cw-welcome', el.log);
    if (!w || w.classList.contains('is-retired') || w.classList.contains('is-retiring')) return;
    if (reduced() || S.restoring) { w.classList.add('is-retired'); return; }
    w.classList.add('is-retiring');
    setTimeout(function () { w.classList.remove('is-retiring'); w.classList.add('is-retired'); }, 120);
  }
  function assetBase() { try { return new URL('../', BASE).href; } catch (e) { return ''; } }

  /* ============================================================
     SENDING
     ============================================================ */
  function send(input, kind) {
    if (S.pendingReset) return commitRestart().then(function () { return send(input, kind); });
    if (el.root.classList.contains('is-offline')) return Promise.resolve(null);
    S.lastInput = input;
    if (!S.hasSent) { S.hasSent = true; el.root.classList.add('has-sent'); }
    if (!S.firstTracked) {
      S.firstTracked = true;
      track('chat_first_message', { source: 'hub', input: kind || 'text' });
      emit('first_message', { input: kind || 'text' });
    }
    retireReplies();
    hidePill();
    ss('cw_transcript', '1');
    emit('transcript', true);
    el.restartBtn.hidden = false;
    return (adapterReady || startAdapter()).then(function () {
      startAwaiting();
      return adapter.send(input).then(function (msg) {
        if (input.type === 'image') track('chat_photo_upload', { state: 'sent', size_kb: input.sizeKb || 0, source: S.photoSource || 'button' });
        return msg;
      }, function (err) {
        stopAwaiting();
        var code = err && err.code || 'server';
        track('chat_error', { code: code, phase: 'send', retryable: code !== 'offline' });
        if (input.type === 'image') track('chat_photo_upload', { state: 'failed', size_kb: input.sizeKb || 0, source: S.photoSource || 'button' });
        emit('error', { phase: 'send', code: code });
        if (code === 'rate_limit') localNotice('rate', COPY.rateLimit);
        registerError();
        return null;
      });
    });
  }
  function retry(id) {
    var m = S.msgs[id]; if (!m) return;
    var img = m.blocks.filter(function (b) { return b.type === 'image'; })[0];
    var txt = m.blocks.filter(function (b) { return b.type === 'text'; })[0];
    var input = img ? { type: 'image', blob: S.photoBlobs && S.photoBlobs[img.url], url: img.url, sizeKb: m.meta.sizeKb, text: txt ? txt.text : '' }
      : m.meta.postback ? { type: 'postback', value: m.meta.postback, label: txt ? txt.text : '' } : { type: 'text', text: txt ? txt.text : '' };
    removeTurn(id);
    delete S.msgs[id];
    send(input, img ? 'photo' : 'text');
  }
  function retryLast(errorTurnId) {
    removeTurn(errorTurnId);
    if (S.lastInput) send(S.lastInput, 'text');
  }
  function reconnect() {
    if (!adapter) return;
    setStatus('connecting');
    adapter.connect().catch(function () { /* status handles it */ });
  }

  /* composer */
  function onFieldInput() {
    var f = el.field;
    f.style.height = 'auto';
    f.style.height = Math.min(120, Math.max(44, f.scrollHeight)) + 'px';
    var n = f.value.length;
    el.count.hidden = n < 900;
    el.count.textContent = n + ' / 1000';
    updateSend();
  }
  function updateSend() {
    el.send.disabled = el.field.disabled || (!el.field.value.trim() && !S.photo);
    if (!el.mic) return;
    var showMic = voiceSupported() && !el.field.disabled && (S.listening || (!el.field.value.trim() && !S.photo));
    el.mic.hidden = !showMic;
    el.send.hidden = showMic;
  }
  /* ---- Voice input (Web Speech API, de-DE). Text lands in the field for review — never auto-sent.
     NOTE for production: Chrome's recognition streams audio to Google — needs a privacy review or an own STT service. */
  function voiceSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function toggleVoice() { return S.listening ? stopVoice() : startVoice(); }
  function startVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || S.listening) return;
    var rec;
    try { rec = new SR(); } catch (e) { voiceError(COPY.voiceFailed); return; }
    rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    var base = el.field.value.trim();
    rec.onresult = function (ev) {
      var txt = '';
      for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
      el.field.value = (base ? base + ' ' : '') + txt.trim();
      onFieldInput();
    };
    rec.onerror = function (ev) {
      voiceError(ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') ? COPY.voiceDenied : (ev && ev.error === 'no-speech' ? '' : COPY.voiceFailed));
    };
    rec.onend = function () { voiceUi(false); };
    S.rec = rec;
    voiceUi(true);
    el.error.hidden = true;
    try { rec.start(); track('chat_voice_start', {}); } catch (e) { voiceUi(false); voiceError(COPY.voiceFailed); }
  }
  function stopVoice() { if (S.rec) { try { S.rec.stop(); } catch (e) { /* ignore */ } } voiceUi(false); }
  function voiceUi(on) {
    S.listening = !!on;
    if (!on) S.rec = null;
    el.root.classList.toggle('is-listening', !!on);
    el.mic.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.mic.setAttribute('aria-label', on ? COPY.voiceStop : COPY.voiceStart);
    el.mic.title = on ? COPY.voiceStop : COPY.voiceStart;
    el.field.placeholder = on ? COPY.voiceListening : COPY.placeholder;
    announce(on ? COPY.voiceOn : COPY.voiceOff);
    updateSend();
    if (!on && el.field.value.trim()) el.field.focus({ preventScroll: true });
  }
  function voiceError(msg) {
    voiceUi(false);
    if (msg) { el.error.textContent = msg; el.error.hidden = false; }
  }
  function announce(text) {
    var live = document.getElementById('cwLive');
    if (live) { live.textContent = ''; setTimeout(function () { live.textContent = text; }, 30); }
  }
  function onFieldKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); onSubmit(e); }
  }
  function onSubmit(e) {
    if (e) e.preventDefault();
    if (S.listening) stopVoice();
    if (el.send.disabled) return;
    el.error.hidden = true;
    var text = el.field.value.trim();
    if (S.photo) {
      var p = S.photo;
      S.photoBlobs = S.photoBlobs || {};
      S.photoBlobs[p.url] = p.blob;
      clearPhoto(true);
      el.field.value = ''; onFieldInput();
      send({ type: 'image', blob: p.blob, url: p.url, sizeKb: p.sizeKb, text: text }, 'photo');
      return;
    }
    if (!text) return;
    el.field.value = ''; onFieldInput();
    send({ type: 'text', text: text }, 'text');
  }

  /* ---------- photo (Leitungs-Check) ---------- */
  function acceptFile(file, source) {
    el.error.hidden = true;
    if (!file || !/^image\//.test(file.type) || file.size > 10 * 1024 * 1024) {
      el.error.textContent = COPY.photoError; el.error.hidden = false;
      return Promise.resolve(false);
    }
    return downscale(file).then(function (blob) {
      S.photoSource = source;
      setPhoto({ blob: blob, url: URL.createObjectURL(blob), sizeKb: Math.round(blob.size / 1024), source: source });
      track('chat_photo_upload', { state: 'selected', size_kb: Math.round(blob.size / 1024), source: source });
      return true;
    }, function () { el.error.textContent = COPY.photoError; el.error.hidden = false; return false; });
  }
  /* ≤1600 px long edge, JPEG q .82 via canvas — re-encoding drops EXIF/GPS */
  function downscale(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hgt = img.naturalHeight, k = Math.min(1, 1600 / Math.max(w, hgt));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hgt * k));
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('encode')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  function setPhoto(p) {
    S.photo = p;
    el.tray.textContent = '';
    el.tray.appendChild(h('div', { class: 'cw-composer__thumb' }, [h('img', { src: p.url, alt: COPY.photoAlt }),
      h('button', { type: 'button', 'aria-label': COPY.photoRemove, html: I.close, onclick: function () { clearPhoto(); el.field.focus(); } })]));
    el.tray.appendChild(h('p', { class: 'cw-composer__hint', text: COPY.photoHint }));
    el.tray.hidden = false;
    el.field.placeholder = COPY.placeholderPhoto;
    updateSend();
    el.field.focus({ preventScroll: true });
  }
  function clearPhoto(keepUrl) {
    if (S.photo && !keepUrl) URL.revokeObjectURL(S.photo.url);
    S.photo = null;
    el.tray.hidden = true; el.tray.textContent = '';
    el.field.placeholder = el.field.disabled ? COPY.placeholderOffline : COPY.placeholder;
    updateSend();
  }
  function onDrag(e) {
    if (!cfg.photo || S.size === 'sheet' || !adapter || !adapter.capabilities.upload) return;
    var types = e.dataTransfer && e.dataTransfer.types ? [].slice.call(e.dataTransfer.types) : [];
    if (types.indexOf('Files') === -1) return;
    e.preventDefault();
    if (e.type === 'dragenter') { S.dragDepth++; el.root.classList.add('is-dragover'); el.drop.hidden = false; }
    else if (e.type === 'dragleave') { S.dragDepth = Math.max(0, S.dragDepth - 1); if (!S.dragDepth) { el.root.classList.remove('is-dragover'); el.drop.hidden = true; } }
    else if (e.type === 'drop') {
      S.dragDepth = 0; el.root.classList.remove('is-dragover'); el.drop.hidden = true;
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) acceptFile(f, 'drop');
    }
  }

  /* ============================================================
     HEADER ACTIONS
     ============================================================ */
  /* "Mit einem Menschen sprechen" (⋯ menu): insert the handoff card, or flash the one already at the end */
  function onHuman() {
    var existing = $$('.cw-handoff', el.log)[0];
    if (existing) {                                                 /* at most one card per conversation (R3r) */
      var t = existing.closest('.cw-turn');
      scrollTurnIntoView(t);
      t.classList.remove('is-flash'); void t.offsetWidth; t.classList.add('is-flash');
      var r0 = t.querySelector('.cw-row'); if (r0) r0.focus({ preventScroll: true });
      return;
    }
    var turn = insertLocal({ blocks: [C.handoffBlock('request', { hours: cfg.hours })] }, 'menu');
    scrollTurnIntoView(turn);
    var first = turn.querySelector('.cw-row');
    if (first) first.focus({ preventScroll: true });
  }
  function setSize(size, animate) {
    S.size = size;
    var r = el.root;
    r.style.height = ''; r.style.transition = '';
    r.classList.remove('cw--compact', 'cw--expanded', 'cw--sheet');
    r.classList.add('cw--' + size);
    r.setAttribute('aria-modal', size === 'sheet' ? 'true' : 'false');
    var exp = size === 'expanded';
    el.expand.setAttribute('aria-pressed', String(exp));
    el.expand.setAttribute('aria-label', exp ? COPY.shrink : COPY.expand);
    el.expand.innerHTML = exp ? I.shrink : I.expand;
    if (animate && !reduced()) { r.classList.remove('is-resizing'); void r.offsetWidth; r.classList.add('is-resizing'); setTimeout(function () { r.classList.remove('is-resizing'); }, 170); }
    $$('.cw-compare__scroll', el.log).forEach(function (s) { s.dispatchEvent(new Event('scroll')); });
  }
  function toggleExpand() {
    if (!canExpand() || S.size === 'sheet') return;
    var next = S.size === 'expanded' ? 'compact' : 'expanded';
    S.expandedPref = next === 'expanded';
    ss('cw_size', next);
    setSize(next, true);
    track('chat_expand', { size: next });
  }
  function pickSize() { return isSheetViewport() ? 'sheet' : (S.expandedPref && canExpand() ? 'expanded' : 'compact'); }

  /* menu */
  function menuItems() { return $$('.cw-menu__item', el.menu).filter(function (b) { return !b.closest('[hidden]'); }); }
  function openMenu() {
    S.menuOpen = true;
    el.menu.hidden = false;
    el.menuBtn.setAttribute('aria-expanded', 'true');
    var items = menuItems(); if (items[0]) items[0].focus();
  }
  function closeMenu(returnFocus) {
    if (!S.menuOpen) return;
    S.menuOpen = false;
    el.menu.hidden = true;
    el.menuBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) el.menuBtn.focus();
  }
  function onMenuKey(e) {
    var items = menuItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Tab') closeMenu(false);
  }
  function onDocPointer(e) {
    if (S.menuOpen && !el.menu.contains(e.target) && e.target !== el.menuBtn && !el.menuBtn.contains(e.target)) closeMenu(false);
  }

  /* restart (inline confirm) */
  function openConfirm() {
    S.confirmOpen = true;
    el.form.hidden = true;
    el.confirm.hidden = false;
    el.confirmCancel.focus();
  }
  function closeConfirm(focusField) {
    if (!S.confirmOpen) return;
    S.confirmOpen = false;
    el.confirm.hidden = true;
    el.form.hidden = false;
    if (focusField) el.field.focus();
  }
  /* ---- Restart with undo in place of ↻ (spec 18, option b) ----
     One tap on ↻ clears the view at once; the same header button turns into "Rückgängig" for 6 s. The real reset
     (adapter.restart) is deferred until that window expires, the user sends, or the window closes, so undo restores
     the exact DOM and state. The fresh greeting is the confirmation; there is no extra element in the log.
     While an answer is still arriving we reset at once (no undo). */
  var UNDO_MS = 6000, UNDO_MIN_RESUME = 3000;
  function announce(text) {
    if (!el.live) return;
    el.live.textContent = '';
    if (text) setTimeout(function () { el.live.textContent = text; }, 30);   /* re-set so the same text is re-announced */
  }
  function setRestartState(undo) {
    var b = el.restartBtn;
    b.classList.remove('is-undo-out');
    b.classList.toggle('is-undo', undo);
    b.setAttribute('aria-label', undo ? COPY.undoAria : COPY.newChat);
    if (undo) b.removeAttribute('title'); else b.setAttribute('title', COPY.newChat);
  }
  function startRestart(e) {
    closeMenu(false);
    if (S.pendingReset) return;
    track('chat_restart', {});
    var byKeyboard = !!(e && e.detail === 0);
    if (S.awaiting || Object.keys(S.streamingIds).length) {
      el.restartBtn.hidden = true;
      announce(COPY.liveStarted);
      doRestart();
      return;
    }
    var frag = document.createDocumentFragment();
    while (el.log.firstChild) frag.appendChild(el.log.firstChild);
    S.pendingReset = {
      frag: frag, msgs: S.msgs, order: S.order, turns: S.turns, greetingId: S.greetingId, recommended: S.recommended,
      errorStreak: S.errorStreak, lastHandoffTurn: S.lastHandoffTurn, chipLast: S.chipLast, summaryHidden: el.menuSummary.hidden,
      timer: null, deadline: 0, remaining: UNDO_MS
    };
    S.msgs = {}; S.order = []; S.turns = {}; S.greetingId = null; S.recommended = false; S.errorStreak = 0; S.lastHandoffTurn = null; S.chipLast = null;
    el.menuSummary.hidden = true;
    clearPhoto(); hidePill();
    renderWelcome();
    var welcome = $('.cw-welcome', el.log);
    if (welcome) welcome.classList.remove('is-retired', 'is-retiring');
    setRestartState(true);
    announce(COPY.liveStarted);
    /* keyboard activation keeps focus on the (now undo) button; pointer activation goes to the composer */
    if (byKeyboard) el.restartBtn.focus({ preventScroll: true });
    else el.field.focus({ preventScroll: true });
    if (S.undoHover || S.undoFocus) pauseUndo(); else armUndo(UNDO_MS);
  }
  function armUndo(ms) {
    var p = S.pendingReset;
    if (!p) return;
    clearTimeout(p.timer);
    p.remaining = ms;
    p.deadline = Date.now() + ms;
    p.timer = setTimeout(function () { commitRestart('expire'); }, ms);
  }
  function pauseUndo() {
    var p = S.pendingReset;
    if (!p || !p.timer) { if (p) p.paused = true; return; }
    clearTimeout(p.timer); p.timer = null;
    p.remaining = Math.max(0, p.deadline - Date.now());
    p.paused = true;
  }
  function resumeUndo() {
    var p = S.pendingReset;
    if (!p || S.undoHover || S.undoFocus) return;
    p.paused = false;
    armUndo(Math.max(p.remaining, UNDO_MIN_RESUME));
  }
  function undoRestart() {
    var p = S.pendingReset;
    if (!p) return;
    clearTimeout(p.timer);
    S.pendingReset = null;
    el.root.classList.add('cw-noanim');                           /* restored log renders without entry motion */
    el.log.textContent = '';
    el.log.appendChild(p.frag);
    S.msgs = p.msgs; S.order = p.order; S.turns = p.turns; S.greetingId = p.greetingId; S.recommended = p.recommended;
    S.errorStreak = p.errorStreak; S.lastHandoffTurn = p.lastHandoffTurn; S.chipLast = p.chipLast;
    el.menuSummary.hidden = p.summaryHidden;
    setRestartState(false);
    el.restartBtn.hidden = false;
    el.log.scrollTop = el.log.scrollHeight;
    setTimeout(function () { el.root.classList.remove('cw-noanim'); }, 30);
    track('chat_restart_undo', {});
    announce(COPY.liveRestored);
    el.restartBtn.focus({ preventScroll: true });
  }
  /* mode: 'expire' (timer: fade the button out) | anything else (send / close: hide at once) */
  function commitRestart(mode) {
    var p = S.pendingReset;
    if (!p) return Promise.resolve();
    clearTimeout(p.timer);
    S.pendingReset = null;
    var b = el.restartBtn, hadFocus = document.activeElement === b;
    announce('');
    if (mode === 'expire' && !reduced()) {
      b.classList.add('is-undo-out');
      setTimeout(function () { if (!S.pendingReset) { b.hidden = true; setRestartState(false); } }, 150);
    } else { b.hidden = true; setRestartState(false); }
    if (hadFocus) el.field.focus({ preventScroll: true });
    S.firstTracked = false;
    var r = adapter ? adapter.restart() : Promise.resolve();
    if (!adapter) onReset();
    return Promise.resolve(r);
  }
  function doRestart() {
    track('chat_restart', {});
    el.log.classList.add('is-clearing');
    setTimeout(function () {
      closeConfirm(false);
      clearPhoto();
      var p = adapter ? adapter.restart() : Promise.resolve();
      onReset();
      S.firstTracked = false;
      el.log.classList.remove('is-clearing');
      Promise.resolve(p).then(function () { el.field.focus(); });
    }, reduced() ? 0 : 150);
  }

  /* ============================================================
     SCROLLING
     ============================================================ */
  function atBottom() { return el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight <= 48; }
  /* CW-11: remember the position we scrolled to; a scroll event only counts as ours when it lands there */
  function setScroll(top) {
    top = Math.max(0, Math.min(top, el.log.scrollHeight - el.log.clientHeight));
    if (Math.abs(el.log.scrollTop - top) < 1) { syncScrolled(); return; }
    S.expectedTop = top;
    clearTimeout(S.timers.expect);
    S.timers.expect = setTimeout(function () { S.expectedTop = null; }, 100);
    el.log.scrollTop = top;
    syncScrolled();
  }
  function userTookOver() { S.follow.active = false; S.expectedTop = null; }
  /* CW-10: the header hairline appears only once the log is scrolled */
  function syncScrolled() { if (el.root) el.root.classList.toggle('is-scrolled', el.log.scrollTop > 2); }
  function scrollToBottom() { setScroll(el.log.scrollHeight); hidePill(); }
  function turnTop(t) { return t.offsetTop - 16; }
  function followScroll() {
    var anchor = S.turns[S.follow.anchorId];
    var max = el.log.scrollHeight - el.log.clientHeight;
    var target = anchor ? Math.min(max, turnTop(anchor)) : max;
    if (target > el.log.scrollTop) setScroll(target);
  }
  function scrollTurnIntoView(t) { setScroll(Math.max(0, Math.min(el.log.scrollHeight - el.log.clientHeight, turnTop(t)))); }
  function onLogScroll() {
    syncScrolled();
    if (S.expectedTop != null && Math.abs(el.log.scrollTop - S.expectedTop) < 2) { if (atBottom()) hidePill(); return; }
    S.expectedTop = null;
    var bottom = atBottom();
    S.follow.active = bottom;
    if (bottom) hidePill();
  }
  function showPill(targetId) { S.pillTarget = targetId; el.pill.hidden = false; }
  function hidePill() { el.pill.hidden = true; S.pillTarget = null; }
  function onPill() {
    var t = S.turns[S.pillTarget] || el.log.lastElementChild;
    hidePill();
    if (t) scrollTurnIntoView(t);
    S.follow.active = true;
    var focusable = t && t.querySelector('a, button');
    el.log.focus({ preventScroll: true });
  }

  /* ============================================================
     OPEN / CLOSE / MODALITY
     ============================================================ */
  /* ============================================================
     HUB → WINDOW HAND-OVER (research/19-handover-fix.md)
     One surface: the hub panel and the compact window share the anchor (right 24, bottom 140, 400 wide).
     t 0      hub content fades (120 ms, CSS .hh.is-handing); the carried question lifts out of the hub field as the
              user plate and flies (FLIP, transform only, 260 ms) to its final place in the window;
              the window is laid out (transparent shell, height = hub panel height, content hidden).
     t 120    swap in ONE task: hub panel hidden, window shell shown (identical rect → no gap, no double shadow);
              height morphs hub → conversation (280 ms), content fades in (180 ms), focus → composer.
     t ~400   cleanup; the hub field is cleared only now.
     Sheet: the chat sheet starts at the hub sheet's top and expands upward (translateY → 0, 280 ms).
     Reduced motion: 120 ms opacity crossfade only (no fly, no height morph).
     ============================================================ */
  var EASE = 'cubic-bezier(.2,.8,.2,1)';
  function placeProvisional(text) {
    var m = { id: 'carried', role: 'user', status: 'sent', blocks: [{ type: 'text', text: text, format: 'plain' }], meta: {} };
    var turn = h('article', { class: 'cw-turn cw-turn--user', 'data-carried': '' });
    renderUser(turn, m);
    el.log.insertBefore(turn, el.typing.parentNode === el.log ? el.typing : null);
    S.provisional = turn;
    return turn;
  }
  function flyQuestion(ho, dur) {
    var turn = S.provisional, plate = turn && turn.querySelector('.cw-plate');
    if (!plate || !ho.fieldText) return null;
    var pr = plate.getBoundingClientRect(), cs = getComputedStyle(plate);
    var ghost = plate.cloneNode(true);
    ghost.classList.add('cw-flyer');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = pr.left + 'px'; ghost.style.top = pr.top + 'px'; ghost.style.width = pr.width + 'px';
    el.root.appendChild(ghost);                            /* inside .cw for its tokens; position:fixed escapes the overflow clip */
    var dx = ho.fieldText.x - (pr.left + parseFloat(cs.paddingLeft));
    var dy = ho.fieldText.y - (pr.top + pr.height / 2);
    turn.classList.add('is-flying');                       /* the real plate (even if re-rendered by the echo) stays hidden */
    if (ho.field) ho.field.classList.add('is-carried');     /* the hub field's text is now the flyer */
    var a = ghost.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: dur, easing: EASE, fill: 'both' });
    var land = function () { turn.classList.remove('is-flying'); if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };
    a.onfinish = land;
    setTimeout(land, dur + 80);                             /* safety: a paused timeline (background tab) must not strand it */
    return a;
  }
  function runHandover(ho) {
    var r = el.root, sheet = S.size === 'sheet', compact = S.size === 'compact';
    S.handing = true;
    var parts = [r.querySelector('.cw-head'), el.main, el.aiNotice, el.form].filter(function (n) { return n && !n.hidden; });
    var anims = [];
    var finish = function () {
      /* end state is guaranteed even if the animation timeline lagged (tab backgrounded mid hand-over) */
      anims.forEach(function (a) { try { if (a.playState !== 'finished') a.finish(); } catch (e) {} });
      r.classList.add('cw-handed');                        /* keep .is-open's cw-in from replaying after the hand-over */
      r.classList.remove('cw-handing', 'cw-handing--shell');
      r.style.transform = '';                              /* keep the inline height: smoothHeight() continues from it */
      parts.forEach(function (n) { n.style.opacity = ''; });
      if (ho.field) ho.field.classList.remove('is-carried');
      ho.done();
      S.handing = false;
      var held = S.held || []; S.held = [];
      held.forEach(onMessage);                             /* the reply now extends the window smoothly */
      S.smoothFrom = null;
      scheduleSmooth();
    };
    var fadeIn = function (delay, dur) {
      if (el.homeChev) anims.push(el.homeChev.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 120, delay: delay + 60, easing: EASE, fill: 'backwards' }));
      parts.forEach(function (n) {
        var a = n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, delay: delay, easing: 'ease-out', fill: 'backwards' });
        a.onfinish = function () { n.style.opacity = ''; };
        anims.push(a);
        n.style.opacity = '';
      });
    };
    if (sheet) {
      /* one upward expansion of the same sheet: start at the hub sheet's top edge */
      var top = Math.max(0, Math.round(ho.panel.getBoundingClientRect().top));
      ho.swap(false);
      anims.push(r.animate([{ transform: 'translateY(' + top + 'px)' }, { transform: 'none' }], { duration: 280, easing: EASE }));
      fadeIn(60, 200);
      flyQuestion(ho, 280);
      setTimeout(finish, 300);
      return;
    }
    if (!compact) {
      /* expanded (720 wide) cannot share the 400-px shell: calm crossfade, same anchor, no scale */
      ho.swap(true);
      anims.push(r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }));
      flyQuestion(ho, 260);
      setTimeout(finish, 280);
      return;
    }
    /* compact: same shell */
    var H0 = ho.panel.offsetHeight;
    r.style.height = '';
    var H1 = r.offsetHeight;                               /* conversation height (capped by max-height) */
    r.classList.add('cw-handing--shell');                  /* transparent until the swap */
    r.style.height = H0 + 'px';
    parts.forEach(function (n) { n.style.opacity = '0'; });
    flyQuestion(ho, 260);
    S.handoverMs = { H0: H0, H1: H1 };
    setTimeout(function () {
      /* re-measure: the answer may already be there (fast adapter) — morph straight to the final height, once */
      r.style.height = '';
      H1 = r.offsetHeight;
      r.style.height = H0 + 'px';
      S.handoverMs.H1 = H1;
      ho.swap(false);                                      /* hub panel hidden … */
      r.classList.remove('cw-handing--shell');             /* … and the window shell shown, same task */
      void r.offsetWidth;
      r.style.transition = 'height 280ms ' + EASE;
      r.style.height = H1 + 'px';
      fadeIn(0, 180);
      if (!el.field.disabled) el.field.focus({ preventScroll: true });
      setTimeout(finish, 300);
    }, 120);
  }

  /* ============================================================
     WINDOW → HUB HAND-BACK (header ←, research/19 §back). The reverse of runHandover: one surface.
     The hub opens its panel laid out but invisible (same anchor). Compact: the window content fades (120 ms) while
     its shell morphs to the hub panel's height (280 ms); at 280 ms the shells swap in one task (identical rect)
     and the hub content fades in (160 ms). Sheet: the chat sheet settles down to the hub sheet's top edge.
     Expanded (720 wide) and reduced motion: opacity crossfade. The conversation is kept (window closed, not reset).
     ============================================================ */
  function back(trigger) {
    if (!S.open || S.closing || S.handing) return;
    closeMenu(false);
    if (S.confirmOpen) closeConfirm(false);
    if (S.pendingReset) commitRestart();
    track('chat_back_to_hub', { size: S.size, trigger: trigger || 'pointer' });
    if (S.size === 'sheet') leaveModal();                   /* before the hub sheet becomes modal (inert / scroll lock) */
    var hb = { size: S.size, reduced: reduced() };
    emit('back', hb);                                       /* the hub fills hb.panel / reveal(fade) / done() */
    if (!hb.panel) { close(); return; }
    runHandback(hb);
  }
  function runHandback(hb) {
    var r = el.root, sheet = S.size === 'sheet', compact = S.size === 'compact';
    var parts = [r.querySelector('.cw-head'), el.main, el.aiNotice, el.form].filter(function (n) { return n && !n.hidden; });
    var anims = [];
    S.handing = true;
    r.classList.add('cw-handing');
    var end = function () {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      S.open = false; S.handing = false; S.closing = false;
      r.classList.remove('is-open', 'is-closing', 'cw-handing', 'cw-handed');
      r.style.height = ''; r.style.transition = ''; r.style.transform = '';
      r.hidden = true;
      emit('close', { restoreFocus: false, handback: true });
      hb.done();
    };
    var fadeOut = function (dur) {
      parts.forEach(function (n) { anims.push(n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' })); });
    };
    if (hb.reduced || !(compact || sheet)) {
      /* reduced motion: 120 ms opacity only; expanded: calm crossfade on the same anchor */
      var d = hb.reduced ? 120 : 180;
      hb.reveal(true);
      anims.push(r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: 'ease-out', fill: 'forwards' }));
      setTimeout(end, d + 10);
      return;
    }
    if (sheet) {
      var top = Math.max(0, Math.round(hb.panel.getBoundingClientRect().top));
      fadeOut(160);
      anims.push(r.animate([{ transform: 'none' }, { transform: 'translateY(' + top + 'px)' }], { duration: 280, easing: EASE, fill: 'forwards' }));
      setTimeout(function () { hb.reveal(false); end(); }, 280);
      return;
    }
    /* compact: same shell, height morph to the hub panel */
    var H0 = r.offsetHeight, H1 = hb.panel.offsetHeight;
    S.handbackMs = { H0: H0, H1: H1 };
    fadeOut(120);
    r.style.transition = 'none';
    r.style.height = H0 + 'px';
    void r.offsetWidth;
    r.style.transition = 'height 280ms ' + EASE;
    r.style.height = H1 + 'px';
    setTimeout(function () { hb.reveal(false); end(); }, 290);   /* swap in one task: panel shown, window hidden */
  }

  /* Content-sized desktop window (R3m/R3o): grow/shrink smoothly instead of jumping line by line. */
  var smoothTimer = null;
  function scheduleSmooth() { clearTimeout(smoothTimer); smoothTimer = setTimeout(smoothHeight, 0); }
  function smoothHeight() {
    var r = el.root;
    if (!r || !S.open || S.size === 'sheet' || r.classList.contains('cw-handing')) return;
    if (reduced()) { r.style.height = ''; r.style.transition = ''; return; }
    var current = parseFloat(getComputedStyle(r).height);
    r.style.transition = 'none';
    r.style.height = '';
    var target = r.offsetHeight;
    if (Math.abs(target - current) < 1.5) { r.style.height = target + 'px'; return; }
    r.style.height = current + 'px';
    void r.offsetWidth;
    r.style.transition = 'height 240ms ' + EASE;
    r.style.height = target + 'px';
  }

  function open(opts) {
    opts = opts || {};
    if (S.open && !S.closing) {
      focusOnOpen(opts);
      return opts.text ? send({ type: 'text', text: String(opts.text).slice(0, 1000) }, 'text') : Promise.resolve();
    }
    S.t0 = opts.t0 || performance.now();
    S.trigger = opts.trigger || 'pointer';
    return ensureCore().then(function (core) {
      C = core;
      build();
      var resume = ss('cw_transcript') === '1';
      clearTimeout(S.timers.close);
      S.closing = false;
      S.open = true;
      setSize(pickSize(), false);
      var ho = opts.handover || null;
      var morph = !!ho && !reduced();
      if (opts.text) {                                     /* a carried question: no welcome, plate + "Juna schreibt …" at once */
        S.carrying = true;
        /* the hub already showed the privacy note while typing — hide the composer's line now, not on the echo
           (it would shrink the window a second time) */
        if (!S.hasSent) { S.hasSent = true; el.root.classList.add('has-sent'); }
        renderWelcome();
        placeProvisional(String(opts.text).slice(0, 1000));
        el.restartBtn.hidden = false;                       /* a conversation exists from the first frame: ↻ does not pop in later */
        startAwaiting();
      }
      el.root.classList.remove('is-closing');
      if (morph) el.root.classList.add('cw-handing');       /* the hub panel's shell becomes this window: no cw-in */
      el.root.hidden = false;
      void el.root.offsetWidth;
      el.root.classList.add('is-open');
      if (S.size === 'sheet') enterModal();
      updateKb();
      emit('open', { size: S.size, handover: !!ho });
      var ready = startAdapter();
      if (morph) runHandover(ho);
      else if (ho) { ho.swap(true); setTimeout(ho.done, 130); }   /* reduced motion: 120 ms crossfade only */
      focusOnOpen(opts);
      ready.then(function () {
        if (opts.text) send({ type: 'text', text: String(opts.text).slice(0, 1000) }, 'text');
        else showUnreadDivider();
        track('chat_open', { source: resume ? 'resume' : (opts.source || 'hub'), mode: adapter ? adapter.mode : 'unknown', size: S.size,
          restored: !!S.restoredFromStorage, load_ms: Math.round(performance.now() - S.t0) });
      });
      return ready;
    });
  }
  function focusOnOpen(opts) {
    var touch = S.size === 'sheet' && (opts.trigger || S.trigger) !== 'keyboard' && opts.focus !== 'composer';
    var target = touch ? el.title : (el.field.disabled ? el.title : el.field);
    target.focus({ preventScroll: true });
    requestAnimationFrame(function () { if (S.open && !el.root.contains(document.activeElement)) target.focus({ preventScroll: true }); });
  }
  function showUnreadDivider() {
    $$('.cw-divider', el.log).forEach(function (d) { d.parentNode.removeChild(d); });
    if (S.unreadFirstId && S.turns[S.unreadFirstId]) {
      var t = S.turns[S.unreadFirstId];
      var d = h('div', { class: 'cw-divider', role: 'separator', 'aria-label': COPY.newDivider, text: COPY.newDivider });
      el.log.insertBefore(d, t);
      setScroll(Math.max(0, d.offsetTop - 16));
    } else scrollToBottom();
    S.unread = 0; S.unreadFirstId = null;
    emit('unread', 0);
  }
  function close(opts) {
    opts = opts || {};
    if (!S.open) return;
    if (S.listening) stopVoice();
    closeMenu(false);
    if (S.confirmOpen) closeConfirm(false);
    if (S.pendingReset) commitRestart();
    S.open = false;
    S.closing = true;
    el.root.classList.remove('cw-handed');
    if (S.size === 'sheet') leaveModal();
    el.root.classList.remove('is-open');
    el.root.classList.add('is-closing');
    var dur = reduced() ? 120 : (S.size === 'sheet' ? 220 : 150);
    S.timers.close = setTimeout(function () {
      S.closing = false;
      el.root.classList.remove('is-closing', 'is-dragging', 'is-settling');
      el.root.style.removeProperty('--cw-drag');
      el.root.hidden = true;
    }, dur);
    emit('close', { restoreFocus: opts.restoreFocus !== false });
  }
  function toggle(opts) { return S.open ? close(opts) : open(opts); }
  function isOpen() { return !!S.open; }

  function enterModal() {
    if (S.inerted.length) return;
    S.scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    var supports = 'inert' in HTMLElement.prototype;
    $$(':scope > *', document.body).forEach(function (n) {
      if (n === el.root || /^(SCRIPT|STYLE|LINK)$/.test(n.tagName)) return;
      if (supports) { if (n.inert) return; n.inert = true; } else { if (n.getAttribute('aria-hidden') === 'true') return; n.setAttribute('aria-hidden', 'true'); }
      S.inerted.push(n);
    });
  }
  function leaveModal() {
    var supports = 'inert' in HTMLElement.prototype;
    S.inerted.forEach(function (n) { if (supports) n.inert = false; else n.removeAttribute('aria-hidden'); });
    S.inerted = [];
    document.body.style.overflow = '';
    if (Math.abs(window.scrollY - S.scrollY) > 2) window.scrollTo(0, S.scrollY);
  }
  function onResize() {
    if (!S.open) return;
    var next = pickSize();
    if (next === S.size) return;
    if (S.size === 'sheet') leaveModal();
    setSize(next, false);
    if (next === 'sheet') enterModal();
    updateKb();
  }
  /* keyboard-aware sheet: the window fills exactly the visible area, from the browser bar to the top of the keyboard.
     2026-11-26 (owner, iPhone): the old bottom inset (innerHeight − vv.height − vv.offsetTop) came out too large on iOS
     Safari, which pans the visual viewport inside the unchanged layout viewport when the keyboard opens - the sheet ended
     ~100 px above the keyboard and the PLP showed through. Fixed elements stay on the layout viewport, so the sheet is
     now pinned to the visual viewport itself: top = its offset, height = its height. Skipped while pinch-zoomed. */
  function updateKb() {
    if (!el.root) return;
    var vv = window.visualViewport;
    /* 2026-11-26 (owner, Chrome on iPhone): after the keyboard closed the sheet kept its keyboard-time height and left an
       empty band at the bottom, because no final viewport event arrived. The keyboard can only be up while the chat field
       has focus, so the sheet follows the visual viewport only then; otherwise it is always the full screen. */
    var pin = S.size === 'sheet' && vv && vv.scale < 1.01 && document.activeElement === el.field;
    var kb = pin ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0;
    el.root.style.setProperty('--cw-vv-top', (pin ? Math.max(0, Math.round(vv.offsetTop)) : 0) + 'px');
    if (pin) el.root.style.setProperty('--cw-vv-h', Math.round(vv.height) + 'px');
    else el.root.style.removeProperty('--cw-vv-h');
    el.root.classList.toggle('has-kb', kb > 40);
    if (kb > 40 && document.activeElement === el.field && S.follow.active) scrollToBottom();
  }

  /* keyboard: Esc order (menu → confirm → photo preview → minimise), sheet focus loop */
  function onRootKey(e) {
    /* the page's Termin modal is open above the chat: let it handle every key (Esc closes the modal, not the chat) */
    if (document.body.classList.contains('cw-modal-over')) return;
    if (e.key === 'Escape' && S.listening) { e.preventDefault(); e.stopPropagation(); stopVoice(); return; }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (S.menuOpen) { closeMenu(true); return; }
      if (S.confirmOpen) { closeConfirm(true); return; }
      if (S.photo) { clearPhoto(); el.field.focus(); return; }
      close();
      return;
    }
    if (e.key === 'Tab' && S.size === 'sheet') {
      var f = $$('a[href], button:not([disabled]), textarea:not([disabled]), [tabindex="0"]', el.root).filter(function (n) { return n.offsetParent !== null && !n.closest('[hidden]'); });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el.title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  /* sheet swipe-down on the header (≥100 px minimises) */
  var drag = null;
  function onDragStart(e) {
    if (S.size !== 'sheet' || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { y: e.clientY, dy: 0, id: e.pointerId, t: e.timeStamp };
    el.root.classList.add('is-dragging');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* old browsers */ }
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    el.root.style.setProperty('--cw-drag', drag.dy + 'px');
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    el.root.classList.remove('is-dragging');
    if (d.dy >= 100 || (d.dy > 24 && d.dy / Math.max(1, e.timeStamp - d.t) > 0.5)) { close(); return; }
    el.root.classList.add('is-settling');
    el.root.style.setProperty('--cw-drag', '0px');
    setTimeout(function () { el.root.classList.remove('is-settling'); el.root.style.removeProperty('--cw-drag'); }, 220);
  }

  function destroy() {
    if (!S.built) return;
    if (S.open) { S.open = false; if (S.size === 'sheet') leaveModal(); }
    offs.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); offs = [];
    if (adapter) adapter.disconnect();
    adapter = null; adapterReady = null;
    Object.keys(S.timers).forEach(function (k) { clearTimeout(S.timers[k]); clearInterval(S.timers[k]); });
    document.removeEventListener('pointerdown', onDocPointer, true);
    window.removeEventListener('resize', onResize);
    (S.mqls || []).forEach(function (m) { if (m.removeEventListener) m.removeEventListener('change', onResize); else if (m.removeListener) m.removeListener(onResize); });
    S.mqls = [];
    if (window.visualViewport) { visualViewport.removeEventListener('resize', updateKb); visualViewport.removeEventListener('scroll', updateKb); }
    if (el.root && el.root.parentNode) el.root.parentNode.removeChild(el.root);
    el = {}; S.built = false; S.msgs = {}; S.order = []; S.turns = {}; S.greetingId = null;
  }

  var api = {
    version: VERSION,
    open: open, close: close, toggle: toggle, isOpen: isOpen, destroy: destroy, on: on,
    hasTranscript: function () { return ss('cw_transcript') === '1'; },
    /* QA aids (not used by the hub): print preview of the newest summary, adapter access */
    _printPreview: function (onOff) {
      var html = document.documentElement;
      if (!onOff) { html.classList.remove('cw-print-preview'); $$('.cw-print-root').forEach(function (n) { n.parentNode.removeChild(n); }); return; }
      for (var i = S.order.length - 1; i >= 0; i--) {
        var m = S.msgs[S.order[i]], b = m && m.blocks.filter(function (x) { return x.type === 'summary'; })[0];
        if (b) { buildPrintRoot(b, new Date(b.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })); html.classList.add('cw-print-preview'); return true; }
      }
      return false;
    },
    _adapter: function () { return adapter; },
    _acceptFile: function (f, src) { return acceptFile(f, src || 'button'); }
  };
  api.back = back;
  window.MetzlerChatWindow = api;
  /* mirror the window API onto the adapter-core namespace (coordinator contract) */
  ensureCore().then(function (core) {
    ['open', 'close', 'toggle', 'isOpen', 'destroy'].forEach(function (k) { if (core && !core[k]) core[k] = api[k]; });
  }, function () { /* adapter unavailable: open() will retry */ });
})(window, document);
