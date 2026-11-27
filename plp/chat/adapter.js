/* ============================================================
   Metzler Juna chat — adapter core (contract + message model)
   research/12-chat-feasibility.md §5–§7. Vanilla JS, zero deps,
   no build step. Loads as a classic <script> (→ window.MetzlerChat)
   and as CommonJS (→ module.exports) so server/server.mjs reuses the
   same model + Botpress normaliser.

   ADAPTER CONTRACT (every adapter implements this; the UI only talks to it)
     adapter.mode                    'mock' | 'mock-offline' | 'bff' | 'live-direct'
     adapter.capabilities            { streaming, typing, restart, history, richBlocks, upload }
     adapter.connect()        → Promise<void>      opens session, emits status + greeting
     adapter.send(input)      → Promise<ChatMessage> (the echoed user message)
                                input = 'text' | { type:'text', text }
                                      | { type:'postback', value, label }
                                      | { type:'image', blob, text? }   (capabilities.upload)
     adapter.onMessage(cb)    → unsubscribe        cb(msg: ChatMessage) — UPSERT by msg.id
                                (streaming: same id arrives repeatedly with status
                                 'streaming' and growing text, last one 'complete')
     adapter.onTyping(cb)     → unsubscribe        cb(isTyping: boolean)
     adapter.onStatus(cb)     → unsubscribe        cb({ state, mode, detail })
                                state: 'idle'|'connecting'|'online'|'reconnecting'|'offline'|'error'
     adapter.restart()        → Promise<void>      new conversation, clears history (emits onReset), greets again
     adapter.onReset(cb)      → unsubscribe        optional helper: transcript was wiped
     adapter.setContext(ctx)                       page context { pageType, pageUrl, productId, entryPoint }
     adapter.getMessages()    → ChatMessage[]      current transcript (for re-render / resync)
     adapter.disconnect()                          close streams/timers

   FACTORY
     MetzlerChat.createAdapter({ apiBase?, mode?, context?, webhookId? }) → Promise<adapter>
       mode from opts or ?chat=mock|offline|live|auto (default auto):
       auto  → GET {apiBase}/health answers ⇒ BFF adapter, else in-browser mock
       live  → BFF in proxy mode if present, else direct Chat API (needs webhookId)
   ============================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MetzlerChat = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var VERSION = '0.4.2';

  /* ---------- service facts (single source for mock + handoff) ---------- */
  var SERVICE = {
    hotlineTel: '+4971213177333',
    hotlineDisplay: '07121 / 317 7333',
    hours: 'Mo-Fr 09:00-16:00',
    email: 'service@metzlergmbh.de',
    appointmentSales: '#',
    appointmentSupport: '/sprechanlagen-online-support-termin',
    installerFinder: '#',
    guaranteeUrl: '#',
    guaranteeYears: 10,
    shopRating: '4,72/5 aus über 33.500 Bewertungen',
    botName: 'Juna',
    botAvatar: 'https://files.bpcontent.cloud/2025/10/29/11/20251029110835-IWYWNTBL.png'
  };

  /* ---------- tiny emitter ---------- */
  function Emitter() { this._l = {}; }
  Emitter.prototype.on = function (type, fn) {
    var l = this._l[type] || (this._l[type] = []);
    l.push(fn);
    var self = this;
    return function off() { var i = (self._l[type] || []).indexOf(fn); if (i > -1) self._l[type].splice(i, 1); };
  };
  Emitter.prototype.emit = function (type, data) {
    (this._l[type] || []).slice().forEach(function (fn) {
      try { fn(data); } catch (e) { if (root.console) console.error('[MetzlerChat] listener error', e); }
    });
  };
  Emitter.prototype.clear = function () { this._l = {}; };

  /* ---------- ids / time ---------- */
  var seq = 0;
  function uid(prefix) {
    seq = (seq + 1) % 1e6;
    return (prefix || 'm') + '_' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function nowIso() { return new Date().toISOString(); }

  /* ---------- availability (Europe/Berlin), same rules as help-hub.js ---------- */
  var DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var DAYS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function parseHours(str) {
    var m = /^\s*(\w{2})\s*[-–]\s*(\w{2})\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/.exec(str || '');
    if (!m) return null;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return {
      d1: DAYS_DE.indexOf(m[1]), d2: DAYS_DE.indexOf(m[2]),
      start: +m[3] * 60 + +m[4], end: +m[5] * 60 + +m[6],
      text: m[1] + '–' + m[2] + ' ' + pad(+m[3]) + ':' + m[4] + '–' + pad(+m[5]) + ':' + m[6] + ' Uhr',
      startText: pad(+m[3]) + ':' + m[4]
    };
  }
  function berlin(date) {
    try {
      var o = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
      return { day: DAYS_EN[o.weekday], minutes: (+o.hour % 24) * 60 + (+o.minute) };
    } catch (e) { return { day: date.getDay(), minutes: date.getHours() * 60 + date.getMinutes() }; }
  }
  /* debug: ?hh_now=2026-10-12T15:30:00Z (shared with the Help Hub) */
  function debugNow() {
    try {
      var m = /[?&]hh_now=([^&]+)/.exec(root.location && root.location.search || '');
      var d = m && new Date(decodeURIComponent(m[1]));
      return d && !isNaN(d.getTime()) ? d : null;
    } catch (e) { return null; }
  }
  /** → { open, short, text }  e.g. { open:false, short:'ab morgen 09:00 Uhr', text:'Mo–Fr 09:00–16:00 Uhr · ab morgen 09:00 Uhr' } */
  function availability(date, hoursStr) {
    var h = parseHours(hoursStr || SERVICE.hours);
    date = date || debugNow() || new Date();
    if (!h) return { open: true, short: 'jetzt erreichbar', text: '' };
    var n = berlin(date);
    var work = function (d) { return h.d1 <= h.d2 ? d >= h.d1 && d <= h.d2 : d >= h.d1 || d <= h.d2; };
    var open = work(n.day) && n.minutes >= h.start && n.minutes < h.end;
    var short = open ? 'jetzt erreichbar'
      : work(n.day) && n.minutes < h.start ? 'ab ' + h.startText + ' Uhr'
      : work(n.day) && work((n.day + 1) % 7) ? 'ab morgen ' + h.startText + ' Uhr'
      : 'ab Mo ' + h.startText + ' Uhr';
    return { open: open, short: short, text: h.text + ' · ' + short };
  }

  /* ---------- message model ----------
     ChatMessage {
       id, role: 'bot'|'user'|'system', createdAt (ISO),
       status: 'sending'|'sent'|'failed'|'streaming'|'complete',
       blocks: Block[],                     // rendered top→bottom inside one turn
       quickReplies?: Choice[],             // chips under the message (choice payloads)
       quickRepliesKind?: 'starters'|'answers'|'followups',   // spec 13 §7: rows for questions, ≤2 chips otherwise
       disableFreeText?: boolean,           // bot asks to pick a chip (composer stays usable, UI may hint)
       meta: { source: 'mock'|'bff'|'botpress', streamId?, raw? }
     }
     Block (discriminated by .type):
       text        { text, format:'plain'|'markdown' }
       image       { url, alt?, caption? }
       products    { layout:'single'|'carousel', items: ProductCard[] }
       comparison  { title?, columns: ProductRef[], rows: { label, values: string[], best?: number }[] }
       choices     { prompt?, mode:'chips'|'dropdown', options: Choice[] }   (inline, e.g. dropdown)
       handoff     { reason, title, text, channels: HandoffChannel[] }
       card        { title, subtitle?, imageUrl?, actions: Action[] }        (generic Botpress card)
       carousel    { items: card[] }                                         (generic Botpress carousel)
       file        { url, title }
       location    { lat, lng, title, mapUrl }
       media       { kind:'audio'|'video', url }
       notice      { variant:'ai'|'privacy'|'info', text, link?: { label, href } }
       summary     { title, date, rows:[{label,value}], products:[{id,title,imageUrl,url,priceText}], note }
       error       { code:'offline'|'timeout'|'server'|'rate_limit'|'unknown', text, retryable }
       unsupported { originalType }                                         (never silently drop)
  */
  function message(role, blocks, extra) {
    var m = { id: uid(role === 'user' ? 'u' : 'b'), role: role, createdAt: nowIso(), status: role === 'user' ? 'sending' : 'complete', blocks: blocks || [], meta: { source: 'mock' } };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }
  var B = {
    text: function (text, format) { return { type: 'text', text: String(text), format: format || 'markdown' }; },
    image: function (url, alt, caption) { return { type: 'image', url: url, alt: alt || '', caption: caption || '' }; },
    products: function (items, layout) { return { type: 'products', layout: layout || (items.length > 1 ? 'carousel' : 'single'), items: items }; },
    comparison: function (title, columns, rows) { return { type: 'comparison', title: title || '', columns: columns, rows: rows }; },
    choices: function (options, mode, prompt) { return { type: 'choices', mode: mode || 'chips', prompt: prompt || '', options: options }; },
    notice: function (variant, text, link) { return { type: 'notice', variant: variant, text: text, link: link || null }; },
    error: function (code, text, retryable) { return { type: 'error', code: code, text: text, retryable: retryable !== false }; },
    handoff: function (reason, opts) { return handoffBlock(reason, opts); },
    /* summary {title, date, rows[{label,value}], products[{id,title,imageUrl,url,priceText}], note} (spec 13 §10.2) */
    summary: function (rows, products, note) {
      return { type: 'summary', title: 'Beratungsprotokoll', date: new Date().toISOString(), rows: rows || [], products: products || [], note: note || '' };
    }
  };
  function choice(label, value, extra) {
    var c = { label: label, value: value || label, kind: 'postback' };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }

  /** Human handoff card (spec 13 §8). channels carry live availability for the phone line;
      the UI recomputes it at render time with availability() so it always matches the hub.
      reason: 'fallback'|'montage'|'request'|'offline'|'complex'|'photo' */
  var HANDOFF_TITLES = {
    request: 'Persönliche Beratung', fallback: 'Persönliche Beratung',
    offline: 'Persönliche Beratung', montage: 'Unterstützung bei der Montage',
    complex: 'Technische Beratung', photo: 'Prüfung durch unser Technik-Team'
  };
  function handoffBlock(reason, opts) {
    opts = opts || {};
    reason = reason || 'request';
    var a = availability(opts.now, opts.hours);
    var technical = reason === 'complex' || reason === 'photo';
    var phone = { kind: 'phone', label: 'Anrufen', detail: SERVICE.hotlineDisplay, href: 'tel:' + SERVICE.hotlineTel,
      hours: (parseHours(opts.hours || SERVICE.hours) || {}).text || '', available: a.open, availabilityText: a.short };
    var appt = technical
      ? { kind: 'appointment', label: 'Technik-Termin buchen', detail: 'Online-Support', href: SERVICE.appointmentSupport, external: false }
      : { kind: 'appointment', label: 'Termin buchen', detail: 'Video- oder Telefonberatung', href: SERVICE.appointmentSales, external: true,
          alt: { label: 'Technik-Termin buchen', href: SERVICE.appointmentSupport } };
    var mail = { kind: 'email', label: 'E-Mail schreiben', detail: SERVICE.email, href: 'mailto:' + SERVICE.email };
    var installer = { kind: 'installer', label: 'Fachbetrieb finden', detail: 'Metzler-Partnerbetriebe', href: SERVICE.installerFinder, external: true };
    /* CA-01: Montage leads with the (technical) hotline, the installer finder second, and no row is
       emphasised — the card must not read as an installer upsell */
    var channels = reason === 'montage' ? [phone, installer, appt, mail] : [phone, appt, mail, installer];
    var title = opts.title || HANDOFF_TITLES[reason] || HANDOFF_TITLES.request;
    var text = opts.text || (a.open
      ? 'Unser Service-Team ist jetzt erreichbar.'
      : 'Die Hotline ist ' + a.short + ' wieder erreichbar – einen Termin oder eine E-Mail können Sie jederzeit senden.');
    return { type: 'handoff', reason: reason, title: title, text: text, channels: channels, emphasis: reason === 'montage' ? 'none' : 'first' };
  }

  /* ---------- products (catalog → ProductCard) ---------- */
  var TUER = { rfid: 'RFID', fingerprint: 'Fingerprint', gesicht: 'Gesichtserkennung', pin: 'PIN-Code', qr: 'QR-Code' };
  function euro(n) { return n == null ? '' : n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function shortName(p) {
    var parts = String(p.name).split('|').map(function (s) { return s.trim(); });
    var family = parts[parts.length - 1];
    var series = (/(VDM10 2\.0|XDM10|ADM10|SDM10[A-Z]?|VDM10)/.exec(p.name) || [''])[0];
    return series && family.indexOf(series) === -1 ? family + ' · ' + series : family;
  }
  function tasterLabel(k) { return k === 'flex' ? 'flexibel 1–500 Parteien' : k + (k === '1' ? ' Klingeltaster' : ' Klingeltaster'); }
  /** ProductCard { id, title, name, line, systemLabel, highlights[], price, uvp, priceText, uvpText,
                    discountPct, currency, rating, reviews, imageUrl, url, badges[] } */
  function productCard(p, opts) {
    opts = opts || {};
    var img = p.img || '';
    if (img && opts.assetBase && !/^(https?:|data:|\/)/.test(img)) img = opts.assetBase + img;
    var discount = p.uvp && p.price < p.uvp ? Math.round((1 - p.price / p.uvp) * 100) : 0;
    var hl = [p.system === 'bus' ? '2-Draht-BUS' : 'IP-System', tasterLabel(p.klingel)];
    if (p.type) hl.push(p.type === 'audio' ? 'Audio' : 'Video');
    (p.tuer || []).forEach(function (t) { if (TUER[t] && t !== 'rfid') hl.push(TUER[t]); });
    return {
      id: p.id, title: shortName(p), name: p.name, line: p.line,
      systemLabel: p.system === 'bus' ? 'BUS-System (2-Draht)' : 'IP-System',
      highlights: hl.slice(0, 4),
      price: p.price, uvp: p.uvp || null, priceText: euro(p.price), uvpText: p.uvp ? euro(p.uvp) : '',
      discountPct: discount, currency: 'EUR',
      rating: p.rating || null, reviews: p.reviews || 0,
      imageUrl: img,
      /* placeholder: the PLP copy has no product URLs (cards link to "#"); JTL search keeps the link real */
      url: opts.productUrl ? opts.productUrl(p) : '#',
      badges: discount ? ['−' + discount + ' %'] : []
    };
  }

  /* ---------- Botpress Chat API payload → model ----------
     Covers every payload in @botpress/chat 1.1.0 (signals/messageCreated):
     text, markdown, image, audio, video, file, location, card, carousel,
     choice, dropdown, bloc (+ unknown → 'unsupported'). Product cards: a Botpress
     card whose metadata/payload carries `product` (see doc §6) is upgraded. */
  function normalizeBotpress(bpMsg, opts) {
    opts = opts || {};
    var p = bpMsg.payload || {};
    var out = { id: bpMsg.id || uid('b'), role: opts.role || 'bot', createdAt: bpMsg.createdAt || nowIso(),
      status: 'complete', blocks: [], meta: { source: opts.source || 'botpress', raw: opts.keepRaw ? bpMsg : undefined } };
    function blockFor(x) {
      switch (x.type) {
        case 'text': return B.text(x.text || '', 'markdown');       /* webchat renders text as markdown too */
        case 'markdown': return B.text(x.markdown || '', 'markdown');
        case 'image': return B.image(x.imageUrl, x.alt || x.title || '');
        case 'audio': return { type: 'media', kind: 'audio', url: x.audioUrl };
        case 'video': return { type: 'media', kind: 'video', url: x.videoUrl };
        case 'file': return { type: 'file', url: x.fileUrl, title: x.title || 'Datei' };
        case 'location': return { type: 'location', lat: x.latitude, lng: x.longitude, title: x.title || x.address || 'Karte',
          mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + x.latitude + ',' + x.longitude };
        case 'card': return cardBlock(x);
        default: return { type: 'unsupported', originalType: x.type || 'unknown' };
      }
    }
    function cardBlock(c) {
      if (c.product || (c.metadata && c.metadata.product)) return B.products([c.product || c.metadata.product], 'single');
      return { type: 'card', title: c.title || '', subtitle: c.subtitle || '', imageUrl: c.imageUrl || '',
        actions: (c.actions || []).map(function (a) { return { label: a.label, kind: a.action, value: a.value }; }) };
    }
    switch (p.type) {
      case 'choice':
        if (p.text) out.blocks.push(B.text(p.text, 'markdown'));
        out.quickReplies = (p.options || []).map(function (o) { return choice(o.label, o.value); });
        out.disableFreeText = !!p.disableFreeText;
        break;
      case 'dropdown':
        out.blocks.push(B.choices((p.options || []).map(function (o) { return choice(o.label, o.value); }), 'dropdown', p.text || ''));
        break;
      case 'carousel':
        var items = p.items || [];
        var products = items.filter(function (c) { return c.product; });
        if (products.length === items.length && items.length) out.blocks.push(B.products(products.map(function (c) { return c.product; }), 'carousel'));
        else out.blocks.push({ type: 'carousel', items: items.map(cardBlock) });
        break;
      case 'bloc':
        (p.items || []).forEach(function (it) { out.blocks.push(blockFor(it.payload ? Object.assign({ type: it.type }, it.payload) : it)); });
        break;
      default:
        out.blocks.push(blockFor(p));
    }
    /* our own extension: bot may attach a normalised block in metadata (BFF-friendly, see doc §6) */
    var md = bpMsg.metadata || p.metadata;
    if (md && md.metzler && md.metzler.blocks) out.blocks = out.blocks.concat(md.metzler.blocks);
    return out;
  }
  /** model input → Chat API createMessage payload (webchat sends postbacks as text+value) */
  function toBotpressPayload(input) {
    if (typeof input === 'string') return { type: 'text', text: input };
    if (input.type === 'postback') return { type: 'text', text: input.label || input.value, value: input.value };
    return { type: 'text', text: input.text };
  }
  /** model input → user ChatMessage (echo) */
  function userMessage(input) {
    if (input && input.type === 'image') {
      var blocks = [B.image(input.url || '', 'Ihr Foto')];
      if (input.text) blocks.push(B.text(input.text, 'plain'));
      return message('user', blocks, { meta: { source: 'user', kind: 'image', sizeKb: input.sizeKb || 0 } });
    }
    var text = typeof input === 'string' ? input : (input.type === 'postback' ? (input.label || input.value) : input.text);
    return message('user', [B.text(text, 'plain')], { meta: { source: 'user', postback: input && input.type === 'postback' ? input.value : undefined } });
  }
  function normalizeInput(input) {
    if (typeof input === 'string') input = { type: 'text', text: input };
    if (input && input.type === 'image') {
      if (!input.blob && !input.url) throw new Error('empty image');
      return { type: 'image', blob: input.blob, url: input.url, sizeKb: input.sizeKb || (input.blob ? Math.round(input.blob.size / 1024) : 0),
        text: input.text ? String(input.text).trim().slice(0, 1000) : '' };
    }
    if (!input || (input.type === 'text' && !String(input.text || '').trim()) || (input.type === 'postback' && !input.value)) throw new Error('empty message');
    if (input.type === 'text') input = { type: 'text', text: String(input.text).trim().slice(0, 1000) };
    return input;
  }

  /* ---------- base adapter (shared plumbing) ---------- */
  function BaseAdapter(mode) {
    this.mode = mode;
    this.capabilities = { streaming: false, typing: true, restart: true, history: true, richBlocks: true, upload: false };
    this.context = {};
    this._em = new Emitter();
    this._msgs = [];
    this._status = { state: 'idle', mode: mode, detail: '' };
  }
  BaseAdapter.prototype.onMessage = function (cb) { return this._em.on('message', cb); };
  BaseAdapter.prototype.onTyping = function (cb) { return this._em.on('typing', cb); };
  BaseAdapter.prototype.onStatus = function (cb) { cb(this._status); return this._em.on('status', cb); };
  /* optional: fires when restart() wiped the transcript (UI clears its log) */
  BaseAdapter.prototype.onReset = function (cb) { return this._em.on('reset', cb); };
  BaseAdapter.prototype.getMessages = function () { return this._msgs.slice(); };
  BaseAdapter.prototype.setContext = function (ctx) { for (var k in ctx) this.context[k] = ctx[k]; };
  BaseAdapter.prototype._setStatus = function (state, detail) {
    this._status = { state: state, mode: this.mode, detail: detail || '' };
    this._em.emit('status', this._status);
  };
  /** upsert by id, then emit a shallow copy (UI must treat it as immutable) */
  BaseAdapter.prototype._upsert = function (msg) {
    for (var i = 0; i < this._msgs.length; i++) if (this._msgs[i].id === msg.id) { this._msgs[i] = msg; break; }
    if (i === this._msgs.length) this._msgs.push(msg);
    this._em.emit('message', msg);
    return msg;
  };
  BaseAdapter.prototype._typing = function (on) {
    if (this._isTyping === on) return;
    this._isTyping = on;
    this._em.emit('typing', on);
  };

  /* ---------- environment / factory ---------- */
  var scriptBase = (function () {
    try {
      var s = root.document && (root.document.currentScript || [].slice.call(root.document.scripts).filter(function (x) { return /chat\/adapter\.js/.test(x.src); })[0]);
      return s ? s.src.replace(/[^/]*$/, '') : '';
    } catch (e) { return ''; }
  })();
  function param(name) {
    try { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location.search); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
  }
  var loading = {};
  function loadScript(file) {
    if (loading[file]) return loading[file];
    loading[file] = new Promise(function (resolve, reject) {
      var s = root.document.createElement('script');
      s.src = scriptBase + file + '?v=' + VERSION;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loading[file]; reject(new Error('failed to load ' + file)); };
      root.document.head.appendChild(s);
    });
    return loading[file];
  }
  /* A negative probe is remembered for the tab session, so the static preview logs the
     expected 404 of /api/chat/health once per tab, not once per page (?chat=auto re-probes). */
  function probe(apiBase, ms, force) {
    if (!root.fetch || (root.location && root.location.protocol === 'file:')) return Promise.resolve(null);
    try { if (!force && root.sessionStorage && sessionStorage.getItem('mc_bff') === '0') return Promise.resolve(null); } catch (e) { /* storage blocked */ }
    var ctl = root.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 800);
    return root.fetch(apiBase + '/health', { signal: ctl && ctl.signal, headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.ok && j.service === 'metzler-chat-bff' ? j : null; })
      .catch(function () { return null; })
      .then(function (j) {
        clearTimeout(t);
        try { if (root.sessionStorage) sessionStorage.setItem('mc_bff', j ? '1' : '0'); } catch (e) { /* ignore */ }
        return j;
      });
  }
  /** Resolve the adapter for this page. Never throws: worst case = in-browser mock. */
  function createAdapter(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || '/api/chat';
    var mode = opts.mode || param('chat') || 'auto';
    var ctx = opts.context || {};
    function mock(offline) {
      return loadScript('mock-adapter.js').then(function () {   /* loadScript adds ?v=VERSION itself */
        return root.MetzlerChatMock.createMockAdapter({ offline: offline, speed: opts.speed, context: ctx, assetBase: opts.assetBase });
      });
    }
    function bff(health) {
      return loadScript('http-adapter.js').then(function () {
        return root.MetzlerChatHttp.createHttpAdapter({ apiBase: apiBase, health: health, context: ctx });
      });
    }
    if (mode === 'mock') return mock(false);
    if (mode === 'offline') return mock(true);
    return probe(apiBase, opts.probeTimeout, param('chat') === 'auto' || mode === 'live').then(function (health) {
      if (mode === 'live') {
        if (health && health.mode === 'proxy') return bff(health);
        return loadScript('botpress-adapter.js').then(function () {
          return root.MetzlerChatBotpress.createBotpressAdapter({ webhookId: opts.webhookId || param('chat_webhook'), context: ctx });
        });
      }
      return health ? bff(health) : mock(false);
    });
  }

  return {
    VERSION: VERSION,
    SERVICE: SERVICE,
    Emitter: Emitter,
    BaseAdapter: BaseAdapter,
    uid: uid,
    message: message,
    blocks: B,
    choice: choice,
    handoffBlock: handoffBlock,
    productCard: productCard,
    euro: euro,
    availability: availability,
    normalizeBotpress: normalizeBotpress,
    toBotpressPayload: toBotpressPayload,
    userMessage: userMessage,
    normalizeInput: normalizeInput,
    createAdapter: createAdapter,
    _param: param,
    _scriptBase: scriptBase
  };
});
