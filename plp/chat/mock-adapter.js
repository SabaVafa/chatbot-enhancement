/* ============================================================
   Metzler Juna chat — MOCK adapter (scripted German flows)
   Implements the contract in adapter.js without any network.
   Also loaded by server/server.mjs (CommonJS) so the BFF's mock
   mode replays the exact same flows over SSE.

   Flows (Türsprechanlagen PLP):
     greeting → 4 starter chips
     advisor  "Welche Anlage passt zu meinem Haus?" → Gebäude → Leitung
              → 2–3 real products (window.MetzlerCatalog, else SNAPSHOT) → Vergleich
     compat   "Kompatibilität mit meiner bestehenden Verkabelung"
     montage  "Montage & Fachbetrieb" → handoff (installer finder first)
     delivery "Lieferzeit & Garantie" (10 Jahre Garantie)
     human    → handoff card (hotline live open/closed, Termin, E-Mail)
     fallback → honest "weiß ich nicht" + handoff card
   Simulation: typing delay + token streaming; ?chat=offline → offline;
     ?chat_speed=0 (instant) … 2 (slow); adapter.simulate('offline'|'online'|'fail-next').
   ============================================================ */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var core = isNode ? require('./adapter.js') : root.MetzlerChat;
  var api = factory(root, core);
  if (isNode) module.exports = api; else root.MetzlerChatMock = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, C) {
  'use strict';
  if (!C) throw new Error('mock-adapter.js needs chat/adapter.js first');
  var B = C.blocks, choice = C.choice, S = C.SERVICE;

  /* Snapshot of plp/sprechanlage.js PRODUCTS (2026-10-14) for pages without
     window.MetzlerCatalog (harness, server). The page catalogue wins when present. */
  var SP = 'Product%20Image/Sprechanlage/';
  var SNAPSHOT = [
    { id: 'colson1', name: 'VDM10 2.0 Video-Türsprechanlage | 1 Klingeltaster | Colson', line: 'IP-System', price: 594.15, uvp: 699.00, rating: 5, reviews: 63, system: 'ip', klingel: '1', tuer: ['rfid'], type: 'video', img: SP + 'video-station.png' },
    { id: 'kian1', name: 'VDM10 2.0 Video-Türsprechanlage | 1 Klingeltaster | Kian', line: 'IP-System', price: 577.15, uvp: 679.00, rating: 5, reviews: 19, system: 'ip', klingel: '1', tuer: ['rfid'], type: 'video', img: SP + 'video-station.png' },
    { id: 'niko1', name: 'VDM10 2.0 Video-Türsprechanlage | mit Fingerprint | 1 Klingeltaster | Niko', line: 'IP-System', price: 721.65, uvp: 849.00, rating: 5, reviews: 12, system: 'ip', klingel: '1', tuer: ['fingerprint', 'rfid'], type: 'video', img: SP + 'video-station.png' },
    { id: 'dominik1', name: 'XDM10 Video-Türsprechanlage mit austauschbarem Namensschild | 2-Draht-BUS | 1 Klingeltaster | Maxior', line: 'BUS-System', price: 424.15, uvp: 499.00, rating: 5, reviews: 2, system: 'bus', klingel: '1', tuer: [], type: 'video', img: SP + 'audio-station-namensschild.png' },
    { id: 'colson2', name: 'VDM10 2.0 Mehrfamilien Video-Türsprechanlage | 2 Klingeltaster | Colson', line: 'IP-System', price: 645.15, uvp: 759.00, rating: 5, reviews: 26, system: 'ip', klingel: '2', tuer: ['rfid'], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'neo2', name: 'VDM10 2.0 Video-Türsprechanlage mit austauschbarem Namensschild | 2 Klingeltaster | Neo', line: 'IP-System', price: 577.15, uvp: 679.00, rating: 5, reviews: 6, system: 'ip', klingel: '2', tuer: ['rfid'], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'kian2', name: 'VDM10 2.0 Mehrfamilien Video-Türsprechanlage | 2 Klingeltaster | Kian', line: 'IP-System', price: 628.15, uvp: 739.00, rating: 5, reviews: 2, system: 'ip', klingel: '2', tuer: ['rfid'], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'maxior2', name: 'XDM10 Video-Türsprechanlage mit austauschbarem Namensschild | 2-Draht-BUS | 2 Klingeltaster | Maxior', line: 'BUS-System', price: 806.65, uvp: 949.00, rating: 5, reviews: null, system: 'bus', klingel: '2', tuer: [], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'horizon', name: 'VDM10 2.0 modulare Video-Türsprechanlage | Ein- & Mehrfamilien | Horizon', line: 'IP-System', price: 849.15, uvp: 999.00, rating: 5, reviews: 21, system: 'ip', klingel: 'flex', tuer: ['rfid'], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'sdm10x', name: 'Türsprechanlage mit Kamera | Gesichtserkennung | Touch-Display | Live-HD-Video | Ein- & Mehrfamilien | SDM10X', line: 'IP-System', price: 1266.50, uvp: 1490.00, rating: 5, reviews: 9, system: 'ip', klingel: 'flex', tuer: ['rfid', 'gesicht', 'pin', 'qr'], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'colson3', name: 'VDM10 2.0 Mehrfamilien Video-Türsprechanlage | 3 Klingeltaster | Colson', line: 'IP-System', price: 696.15, uvp: 819.00, rating: 5, reviews: 5, system: 'ip', klingel: '3', tuer: ['rfid'], type: 'video', img: SP + 'touch-display-station.png' },
    { id: 'maxior3', name: 'XDM10 Video-Türsprechanlage mit austauschbarem Namensschild | 2-Draht-BUS | 3 Klingeltaster | Maxior', line: 'BUS-System', price: 849.15, uvp: 999.00, rating: 5, reviews: null, system: 'bus', klingel: '3', tuer: [], type: 'video', img: SP + 'touch-display-station.png' }
  ];

  /* Round 2 (research/16 CA-01…CA-17): every factual sentence below is either backed by
     window.MetzlerCatalog / the brief's service facts or reuses the wording of the PLP FAQ
     (sprechanlage.html #beratung). Each FAQ-backed answer carries one "Quelle" link. */
  var STARTERS = [
    choice('Welche Anlage passt zu mir?', 'intent:advisor'),
    choice('Passt meine Verkabelung?', 'intent:compat'),
    choice('Montage & Fachbetrieb', 'intent:montage'),
    choice('Lieferzeit & Garantie', 'intent:delivery')
  ];
  var HOUSE = { efh: 'ein Einfamilienhaus', zfh: 'ein Zweifamilienhaus', mfh: 'ein Mehrfamilienhaus' };
  var WIRE = { ip: 'Netzwerkkabel (IP)', bus: '2-Draht-Klingelleitung', unknown: 'unbekannter Verkabelung' };
  /* sources: only targets that exist — the FAQ section on this page and the warranty page */
  function faq(question) { return { label: 'FAQ', href: '#beratung', faq: question }; }
  var SRC_WARRANTY = { label: 'Garantieerklärung', href: S.guaranteeUrl };

  /* ---------- brain: input → steps (pure; no timers, no DOM) ---------- */
  function MockBrain(opts) {
    opts = opts || {};
    this.catalog = opts.catalog || null;
    this.assetBase = opts.assetBase || '';
    this.reset();
  }
  MockBrain.prototype.reset = function () { this.st = { flow: null, await: null, house: null, wire: null, lastIds: [], montage: false, mount: false, recommended: false }; };
  MockBrain.prototype.products = function () {
    var c = this.catalog || (root.MetzlerCatalog && root.MetzlerCatalog.products) || SNAPSHOT;
    return c.filter(function (p) { return !p.briefkasten; });
  };
  MockBrain.prototype.card = function (p) { return C.productCard(p, { assetBase: this.assetBase }); };

  function bot(blocks, extra) { return C.message('bot', blocks, extra); }
  function say(md, source) {
    var b = B.text(md, 'markdown');
    if (source) b.source = source;
    return { type: 'message', stream: true, message: bot([b]) };
  }
  function show(blocks, extra) { return { type: 'message', stream: false, message: bot(blocks, extra) }; }
  function typing(ms) { return { type: 'typing', ms: ms }; }
  /* kind: 'starters' (welcome rows) | 'answers' (question → rows) | 'followups' (≤2 chips, spec 13 §7) */
  function withChips(step, chips, kind) { step.message.quickReplies = chips; step.message.quickRepliesKind = kind || 'followups'; return step; }
  var SUMMARY_CHIP = choice('Protokoll für den Elektriker', 'intent:summary');
  var MONTAGE_CHIP = choice('Montage & Fachbetrieb', 'intent:montage');
  var ADVISOR_CHIP = choice('Welche Anlage passt zu mir?', 'intent:advisor');
  var COMPAT_CHIP = choice('Passt meine Verkabelung?', 'intent:compat');
  /* CA-13: a turn that would end without a way on gets one sensible chip */
  MockBrain.prototype.nextChip = function () { return this.st.recommended ? SUMMARY_CHIP : ADVISOR_CHIP; };

  MockBrain.prototype.greeting = function (ctx) {
    ctx = ctx || {};
    var where = ctx.productName ? ' zur **' + ctx.productName + '**' : '';
    return [typing(500), withChips(say(
      'Guten Tag! Ich bin **Juna**, die KI-Assistentin von Metzler. Ich helfe Ihnen' + where + ' bei der Auswahl der passenden Türsprechanlage – und beantworte Fragen zu Verkabelung, Montage und Lieferung.'
    ), STARTERS, 'starters')];
  };

  /** input: { type:'text', text } | { type:'postback', value, label } | { type:'image'|'photo' } */
  MockBrain.prototype.reply = function (input, ctx) {
    if (input.type === 'image' || input.type === 'photo') return this.photo();
    var v = input.type === 'postback' ? String(input.value) : '';
    var t = input.type === 'text' ? input.text.toLowerCase() : '';
    var st = this.st;

    /* slots from chips or free text ("Mehrfamilienhaus mit 2-Draht?" fills both) */
    var h = v.indexOf('house:') === 0 ? v.slice(6) : parseHouse(t);
    var w = v.indexOf('wire:') === 0 ? v.slice(5) : parseWire(t, st.await === 'wire');
    if (h) {   /* naming the building type is enough to (re)start the advisor with it */
      st.house = h; st.flow = 'advisor';
      if (w) { st.wire = w; return this.recommend(); }
      return st.wire ? this.recommend() : this.askWire();
    }
    if (w && (st.await === 'wire' || v)) { st.wire = w; return st.house ? this.recommend() : this.askHouse(true); }
    if (v.indexOf('compat:') === 0) return this.compatAnswer(v.slice(7));
    if (v.indexOf('compare:') === 0) return this.compare(v.slice(8).split(','));
    if (v.indexOf('product:') === 0) return this.productDetail(v.slice(8));

    var intent = v.indexOf('intent:') === 0 ? v.slice(7) : this.classify(t);
    switch (intent) {
      case 'advisor': return this.askHouse();
      case 'compat': return this.askCompat();
      case 'montage': return this.montage();
      case 'delivery': return this.delivery();
      case 'human': return this.human();
      case 'summary': return this.summary();
      case 'app': return this.app();
      case 'av': return this.audioVideo();
      case 'night': return this.nightVision();
      case 'indoor': return this.indoorStation();
      case 'mount': return this.mountType();
      case 'compare': return st.lastIds.length > 1 ? this.compare(st.lastIds) : this.askHouse();
      case 'hello': st.await = null; return [typing(400), withChips(say('Guten Tag. Wobei kann ich Sie unterstützen – bei der Auswahl, der Verkabelung oder der Montage?'), STARTERS, 'answers')];
      case 'thanks': st.await = null; return [typing(400), withChips(say('Gern geschehen. Kann ich Ihnen noch bei etwas weiterhelfen?'), STARTERS.slice(0, 2))];
      default: return this.fallback();
    }
  };
  function parseHouse(t) {
    if (!t) return null;
    return /mehrfam|mehrparteien|parteien|wohnungen|\bmfh\b/.test(t) ? 'mfh' : /zweifam|zwei.?familien|\bzfh\b/.test(t) ? 'zfh' : /einfam|\befh\b|eigenheim/.test(t) ? 'efh' : null;
  }
  function parseWire(t, loose) {
    if (!t) return null;
    if (/2.?draht|zwei.?draht|klingelleitung|zweiadrig|2 adern|\bbus\b/.test(t)) return 'bus';
    if (/\blan\b|netzwerk|\bcat ?\d|\bip\b|ethernet/.test(t)) return 'ip';
    if (loose && /weiß nicht|weiss nicht|keine ahnung|unsicher|nicht sicher/.test(t)) return 'unknown';
    return null;
  }
  MockBrain.prototype.classify = function (t) {
    if (!t) return null;
    if (/vergleich/.test(t)) return 'compare';
    if (/zusammenfass|protokoll/.test(t)) return 'summary';
    if (/mensch|mitarbeiter|berater|hotline|anruf|telefon|termin|rückruf|support|persönlich/.test(t)) return 'human';
    if (/\bapp\b|\bapps\b|smartphone|handy|iphone|android|von unterwegs/.test(t)) return 'app';
    if (/nachtsicht|nachts|dunkel|infrarot|\bir\b/.test(t)) return 'night';
    if (/innenstation|innengerät|innen-?gerät|innenteil|monitor/.test(t)) return 'indoor';
    if (/unterputz|aufputz|\bup\b|\bap\b|in die wand|auf die wand/.test(t)) return 'mount';
    if (/audio|kamera|mit bild|ohne bild/.test(t)) return 'av';
    if (/kompatib|verkabel|leitung|2.?draht|zwei.?draht|kabel|bestehend|alte anlage|nachrüst/.test(t)) return 'compat';
    if (/montage|montier|install|fachbetrieb|elektriker|einbau|anschlie|handwerker|selbst/.test(t)) return 'montage';
    if (/liefer|versand|garantie|gewährleist|wann kommt|zustell/.test(t)) return 'delivery';
    if (/passt|empfehl|welche anlage|einfamilien|mehrfamilien|zweifamilien|suche|beratung|kaufen|preis|günstig/.test(t)) return 'advisor';
    if (/^(hallo|hi|hey|guten (tag|morgen|abend)|moin|servus)\b/.test(t)) return 'hello';
    if (/danke|dankeschön|super|perfekt/.test(t)) return 'thanks';
    return null;
  };

  /* ---- advisor ---- */
  MockBrain.prototype.askHouse = function (keepWire) {
    this.st.flow = 'advisor'; this.st.await = 'house'; this.st.house = null;
    if (!keepWire) this.st.wire = null;
    return [typing(600), withChips(say('Gern. Nach zwei kurzen Fragen zeige ich Ihnen passende Modelle.\n\n**Für welches Gebäude suchen Sie die Anlage?**'), [
      choice('Einfamilienhaus', 'house:efh'), choice('Zweifamilienhaus', 'house:zfh'), choice('Mehrfamilienhaus (3+ Parteien)', 'house:mfh')
    ], 'answers')];
  };
  MockBrain.prototype.askWire = function () {
    this.st.await = 'wire';
    return [typing(700), withChips(say('Vielen Dank. **Welche Leitung liegt an Ihrer Haustür?** Davon hängt ab, ob ein IP-System oder ein 2-Draht-BUS-System für Sie infrage kommt.'), [
      choice('Netzwerkkabel (LAN)', 'wire:ip'), choice('2-adrige Klingelleitung', 'wire:bus'), choice('Weiß ich nicht', 'wire:unknown')
    ], 'answers')];
  };
  MockBrain.prototype.pick = function (house, system, n) {
    var want = house === 'efh' ? ['1'] : house === 'zfh' ? ['2'] : ['flex', '7', '6', '5', '4', '3'];
    var all = this.products().filter(function (p) { return p.type !== 'audio' && (!system || p.system === system); });
    var hits = all.filter(function (p) { return want.indexOf(p.klingel) > -1; });
    if (house === 'mfh') hits.sort(function (a, b) { return (a.klingel === 'flex' ? 0 : 1) - (b.klingel === 'flex' ? 0 : 1); });
    var rank = function (a, b) { return (b.reviews || 0) - (a.reviews || 0) || a.price - b.price; };
    hits = house === 'mfh' ? hits.slice(0, 6).sort(rank) : hits.sort(rank);
    if (!hits.length) hits = all.sort(rank);   /* relax: never return an empty answer */
    return hits.slice(0, n || 3);
  };
  MockBrain.prototype.recommend = function () {
    var st = this.st, house = st.house || 'efh', wire = st.wire || 'unknown', picks, intro;
    st.await = null; st.flow = 'advisor-results';
    if (wire === 'unknown') {
      picks = this.pick(house, 'ip', 2).concat(this.pick(house, 'bus', 1));
      /* CA-16: one sentence, then the cards */
      intro = 'Ohne Netzwerkkabel passt der **2-Draht-BUS (XDM10)**, mit Netzwerkkabel ein **IP-System (VDM10 2.0)**. Beide Wege für ' + HOUSE[house] + ':';
    } else {
      picks = this.pick(house, wire, 3);
      /* CA-11: the ranking is by number of reviews — say so */
      intro = 'Für ' + HOUSE[house] + ' mit ' + WIRE[wire] + (picks.length > 1 ? ' passen diese ' + picks.length + ' Modelle – sortiert nach Anzahl der Bewertungen:' : ' passt diese Anlage:');
    }
    st.lastIds = picks.map(function (p) { return p.id; });
    var self = this;
    st.recommended = true;
    var chips = picks.length > 1 ? [choice('Modelle vergleichen', 'compare:' + st.lastIds.join(',')), SUMMARY_CHIP] : [SUMMARY_CHIP, MONTAGE_CHIP];
    return [typing(900), say(intro), typing(350),
      withChips(show([B.products(picks.map(function (p) { return self.card(p); }))]), chips)];
  };
  MockBrain.prototype.compare = function (ids) {
    var self = this, all = this.products();
    var ps = ids.map(function (id) { return all.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean).slice(0, 3);
    if (ps.length < 2) return this.fallback();
    var cards = ps.map(function (p) { return self.card(p); });
    var min = function (arr) { var m = Math.min.apply(null, arr); return arr.indexOf(m); };
    var ratings = cards.map(function (c) { return c.rating || 0; });
    var ratingsDiffer = ratings.some(function (r) { return r !== ratings[0]; });
    /* CW-02/CA-03: no UVP row (the price row covers it), no blanket "10 Jahre" guarantee row
       (the warranty covers "viele Modelle", not provably every model) */
    var rows = [
      { label: 'Preis', numeric: true, values: cards.map(function (c) { return c.priceText; }), best: min(cards.map(function (c) { return c.price; })) },
      { label: 'System', values: cards.map(function (c) { return c.systemLabel; }) },
      { label: 'Klingeltaster', values: ps.map(function (p) { return p.klingel === 'flex' ? 'flexibel' : p.klingel; }) },
      { label: 'Türöffnung', values: ps.map(function (p) { var x = (p.tuer || []).map(function (k) { return { rfid: 'RFID', fingerprint: 'Fingerprint', gesicht: 'Gesicht', pin: 'PIN', qr: 'QR' }[k]; }).filter(Boolean); return x.length ? x.join(', ') : '–'; }) },
      /* CW-14 notation as on the card; CA-11 no "best" while every rating ties */
      { label: 'Bewertung', values: cards.map(function (c) { return c.reviews ? '★ ' + (c.rating || 5).toFixed(1).replace('.', ',') + ' (' + c.reviews + ')' : 'neu'; }),
        best: ratingsDiffer ? ratings.indexOf(Math.max.apply(null, ratings)) : undefined }
    ];
    return [typing(700), say('Die wichtigsten Unterschiede im Überblick:'), typing(300),
      withChips(show([B.comparison('Vergleich', cards.map(function (c) { return { id: c.id, title: c.title, family: c.title.split(' · ')[0], imageUrl: c.imageUrl, url: c.url }; }), rows)]),
        [SUMMARY_CHIP, MONTAGE_CHIP])];
  };

  /* ---- compatibility (FAQ "IP-System oder 2-Draht-BUS") ---- */
  var FAQ_SYSTEM = faq('IP-System oder 2-Draht-BUS');
  MockBrain.prototype.askCompat = function () {
    this.st.flow = 'compat'; this.st.await = null;
    return [typing(600), withChips(say('Gern prüfe ich das mit Ihnen. **Was ist an Ihrer Haustür bereits verlegt?**'), [
      choice('2-adrige Klingelleitung', 'compat:2draht'), choice('Netzwerkkabel', 'compat:cat'),
      choice('Alte Sprechanlage (mehradrig)', 'compat:old'), choice('Noch nichts – Neubau', 'compat:none')
    ], 'answers')];
  };
  MockBrain.prototype.compatAnswer = function (k) {
    var self = this;
    if (k === '2draht') {
      this.st.wire = this.st.wire || 'bus';
      var bus = this.pick(this.st.house || 'efh', 'bus', 2);
      this.st.lastIds = bus.map(function (p) { return p.id; });
      return [typing(900), say('Das **2-Draht-BUS-System XDM10** nutzt die vorhandene Verkabelung weiter und eignet sich damit besonders für den Austausch bestehender Anlagen. Ob Ihre Leitung geeignet ist, prüft unser Technik-Team gern gemeinsam mit Ihnen.', FAQ_SYSTEM),
        typing(300), withChips(show([B.products(bus.map(function (p) { return self.card(p); }))]), [ADVISOR_CHIP, MONTAGE_CHIP])];
    }
    if (k === 'cat') {
      this.st.wire = this.st.wire || 'ip';
      return [typing(800), withChips(say('Mit einem Netzwerkanschluss an der Tür ist ein **IP-System (VDM10 2.0)** die flexibelste Lösung – per App nehmen Sie Anrufe an, sehen das Kamerabild und öffnen die Tür auch von unterwegs.', FAQ_SYSTEM),
        [choice('Passende IP-Anlage finden', 'intent:advisor'), MONTAGE_CHIP])];
    }
    if (k === 'none') {
      return [typing(800), withChips(say('Im Neubau ist ein **IP-System** die flexibelste Lösung. Welche Leitung zur Haustür gelegt wird, stimmen Sie am besten mit Ihrem Elektriker ab.', FAQ_SYSTEM),
        [choice('Passende Anlage finden', 'intent:advisor'), choice('Lieferzeit & Garantie', 'intent:delivery')])];
    }
    /* old multi-wire installation → honest handoff (no unbacked wiring claims) */
    /* R3r: no handoff card outside "cannot answer" — the overview (← in the header) holds hotline and Termin */
    return [typing(900), withChips(say('Für den Austausch einer bestehenden Anlage ist der **2-Draht-BUS (XDM10)** gedacht – ohne neue Kabel. Ob Ihre vorhandene Verkabelung dafür geeignet ist, klärt unser Technik-Team gern persönlich unter **' + S.hotlineDisplay + '**.', FAQ_SYSTEM),
      [this.nextChip()])];
  };

  /* ---- FAQ intents (CA-02) — wording reused from sprechanlage.html #beratung ---- */
  MockBrain.prototype.app = function () {
    this.st.await = null;
    return [typing(700), withChips(say('Ja. Unsere IP-Systeme (VDM10 2.0, SDM10) binden sich per **App** ein – Sie nehmen Anrufe an, sehen das Kamerabild und öffnen die Tür auch von unterwegs. Auch das 2-Draht-BUS-System XDM10 bietet App-Anbindung. Eine Innenstation ist optional, aber nicht zwingend erforderlich.', faq('Smartphone')),
      [ADVISOR_CHIP, COMPAT_CHIP])];
  };
  MockBrain.prototype.audioVideo = function () {
    this.st.await = null;
    return [typing(700), withChips(say('Eine **Audio-Türsprechanlage** ermöglicht das Sprechen mit Besuchern, eine **Video-Türsprechanlage** zeigt Ihnen über die Kamera zusätzlich, wer vor der Tür steht. Gerade in unübersichtlichen Eingangsbereichen oder für mehr Sicherheit empfiehlt sich die Video-Variante mit Live-HD-Bild.', faq('Audio- und einer Video')),
      [ADVISOR_CHIP, choice('Gibt es Nachtsicht?', 'intent:night')])];
  };
  MockBrain.prototype.nightVision = function () {
    this.st.await = null;
    return [typing(600), withChips(say('Unsere Video-Anlagen verfügen über eine **IR-Nachtsicht**, sodass Sie Besucher auch bei Dunkelheit zuverlässig erkennen.', faq('Nachtsicht')),
      [ADVISOR_CHIP, choice('Gibt es eine App?', 'intent:app')])];
  };
  MockBrain.prototype.indoorStation = function () {
    this.st.await = null;
    return [typing(600), withChips(say('Eine **Innenstation** ist optional, aber nicht zwingend erforderlich: Mit unseren IP-Systemen (VDM10 2.0, SDM10) nehmen Sie Anrufe auch per App an. Passende Innenstationen finden Sie in der Kategorie „Innenstationen“ auf dieser Seite.', faq('Smartphone')),
      [ADVISOR_CHIP, choice('Gibt es eine App?', 'intent:app')])];
  };
  /* Unterputz/Aufputz: no catalogue data → honest, noted for the protocol (no source link: there is no target) */
  MockBrain.prototype.mountType = function () {
    this.st.await = null; this.st.mount = true;
    return [typing(600), withChips(say('Ob Unterputz- oder Aufputzmontage möglich ist, hängt vom Modell ab und steht in den Produktdaten. Ich notiere es für Ihr Protokoll unter „Offen klären“ – unser Team bestätigt es Ihnen gern.'),
      [this.nextChip(), MONTAGE_CHIP])];
  };

  /* ---- montage / delivery / human / fallback ---- */
  /* CA-01: DIY-first, as the page FAQ says; the 230-V sentence needs Metzler sign-off (notes 14 §R2) */
  MockBrain.prototype.montage = function () {
    this.st.await = null; this.st.montage = true;
    return [typing(800), withChips(say('Mit handwerklichem Geschick und der mitgelieferten Anleitung ist die Montage gut selbst machbar – besonders beim 2-Draht-BUS-System, das vorhandene Leitungen weiternutzt. Bei IP-Anlagen ist ein Netzwerkanschluss erforderlich. Arbeiten an 230 V überlassen Sie bitte einer Elektrofachkraft.', faq('selbst installieren')), [this.nextChip()])];
  };
  MockBrain.prototype.delivery = function () {
    this.st.await = null;
    return [typing(800), withChips(say('Auf viele Modelle gibt es **' + S.guaranteeYears + ' Jahre Metzler-Garantie** – die Details stehen in der Garantieerklärung. Ab 99 € ist der Versand kostenfrei; die aktuelle Lieferzeit Ihres Wunschmodells nennt Ihnen unser Team gern.', SRC_WARRANTY),
      [ADVISOR_CHIP, MONTAGE_CHIP])];
  };
  MockBrain.prototype.human = function () {
    this.st.await = null;
    return [typing(500), withChips(say('Unser Kundenservice ist telefonisch unter **' + S.hotlineDisplay + '** erreichbar. Termin, E-Mail und Fachbetriebe finden Sie in der Übersicht – über den Pfeil oben links.'), [this.nextChip()])];
  };
  MockBrain.prototype.fallback = function () {
    this.st.await = null;
    return [typing(700), say('Darauf kann ich Ihnen leider keine verlässliche Antwort geben. Unser Kundenservice berät Sie gern persönlich.'),
      typing(200), withChips(show([C.handoffBlock('fallback')], { meta: { source: 'mock', fallback: true } }), STARTERS.slice(0, 2))];
  };

  /* ---- product detail (postback product:<id>, e.g. the welcome context chip) ---- */
  MockBrain.prototype.productDetail = function (id) {
    var p = this.products().filter(function (x) { return x.id === id; })[0];
    if (!p) return this.fallback();
    this.st.await = null;
    if (this.st.lastIds.indexOf(id) === -1) this.st.lastIds = [id].concat(this.st.lastIds).slice(0, 3);
    var sys = p.system === 'bus' ? '2-Draht-BUS (vorhandene Klingelleitung)' : 'IP-System (Netzwerkkabel)';
    return [typing(600), say('Die **' + C.productCard(p).title + '** ist ein ' + sys + ' – ' + (p.klingel === 'flex' ? 'flexibel für Ein- und Mehrfamilienhäuser.' : 'mit ' + p.klingel + ' Klingeltaster' + (p.klingel === '1' ? '.' : 'n.'))),
      typing(250), withChips(show([B.products([this.card(p)], 'single')]), [choice('Passt das zu meinem Haus?', 'intent:advisor'), SUMMARY_CHIP])];
  };

  /* ---- Beratungsprotokoll (spec 13 §8 / §10.2; CW-07 compact; CA-01 no default installer) ---- */
  MockBrain.prototype.summary = function () {
    var st = this.st, self = this, all = this.products();
    if (!st.lastIds.length) {
      return [typing(500), withChips(say('Für das Beratungsprotokoll benötige ich zunächst Angaben zu Ihrem Gebäude und Ihrer Leitung.'), [ADVISOR_CHIP, MONTAGE_CHIP])];
    }
    var ps = st.lastIds.map(function (id) { return all.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    var cards = ps.map(function (p) { return self.card(p); });
    var refs = cards.map(function (c) { return { id: c.id, title: c.title, imageUrl: c.imageUrl, url: c.url, priceText: c.priceText }; });
    var houseTxt = { efh: 'Einfamilienhaus', zfh: 'Zweifamilienhaus', mfh: 'Mehrfamilienhaus (3+ Parteien)' }[st.house] || 'noch offen';
    var wireTxt = { ip: 'Netzwerkkabel → IP-System', bus: '2-adrige Leitung → 2-Draht-BUS', unknown: 'unbekannt' }[st.wire] || 'noch offen';
    var open = [];
    if (!st.wire || st.wire === 'unknown') open.push('Leitung an der Haustür prüfen');
    if (st.mount) open.push('Unterputz/Aufputz je Modell');
    var rows = [
      { label: 'Wohnsituation', value: houseTxt },
      { label: 'Leitung', value: wireTxt },
      { label: 'Empfehlung', value: cards[0] ? cards[0].title + ' · ' + cards[0].priceText : '–', product: refs[0] || null },
      { label: 'Alternativen', value: cards.slice(1).map(function (c) { return c.title.split(' · ')[0]; }).join(', ') || '–' },
      { label: 'Montage', value: st.montage ? 'selbst möglich; 230 V nur durch Elektrofachkraft' : 'selbst oder Fachbetrieb – offen' },
      { label: 'Offen klären', value: open.join('; ') || '–' }
    ];
    return [typing(600), say('Gern. Hier ist Ihr Beratungsprotokoll zur Weitergabe:'), typing(200),
      withChips(show([B.summary(rows, refs, 'Erstellt von Juna (KI) – bitte mit Ihrem Fachbetrieb abstimmen.')]), [MONTAGE_CHIP, choice('Lieferzeit & Garantie', 'intent:delivery')])];
  };

  /* ---- Leitungs-Check photo (prototype: no image analysis — hedged scripted answer) ---- */
  MockBrain.prototype.photo = function () {
    this.st.await = null; this.st.wire = this.st.wire || 'bus';
    return [typing(1200), withChips(say('**Auf dem Foto ist vermutlich eine 2-adrige Klingelleitung zu sehen.** In diesem Fall eignet sich das 2-Draht-BUS-System XDM10 – ohne neue Kabel. Verbindlich prüft das unser Technik-Team unter **' + S.hotlineDisplay + '**.'),
      [choice('Passende BUS-Anlagen', 'compat:2draht'), choice('Anderes Foto senden', 'action:photo')])];
  };

  /* ---------- player: executes steps with typing + token streaming ---------- */
  function tokens(text) { return text.match(/\S+\s*|\s+/g) || [text]; }
  function playScript(steps, sink, opts) {
    opts = opts || {};
    var speed = opts.speed == null ? 1 : +opts.speed;
    var streamOn = opts.stream !== false;
    var timers = [], cancelled = false;
    function wait(ms) { return new Promise(function (r) { if (speed <= 0) return r(); timers.push(setTimeout(r, ms * speed)); }); }
    function clone(m, patch) { var c = JSON.parse(JSON.stringify(m)); for (var k in patch) c[k] = patch[k]; return c; }
    var chain = Promise.resolve();
    steps.forEach(function (s) {
      chain = chain.then(function () {
        if (cancelled) return;
        if (s.type === 'typing') { sink.typing(true); return wait(s.ms); }
        var m = s.message;
        sink.typing(false);
        if (!s.stream || !streamOn || speed <= 0 || m.blocks[0].type !== 'text') return void sink.upsert(clone(m, { status: 'complete' }));
        var full = m.blocks[0].text, toks = tokens(full), i = 0, streamId = C.uid('s');
        var chips = m.quickReplies;
        return new Promise(function (done) {
          (function tick() {
            if (cancelled) return done();
            i = Math.min(toks.length, i + 1 + Math.floor(Math.random() * 3));
            var partial = clone(m, { status: i < toks.length ? 'streaming' : 'complete' });
            partial.blocks[0].text = toks.slice(0, i).join('');
            partial.meta.streamId = streamId;
            if (i < toks.length) delete partial.quickReplies; else if (chips) partial.quickReplies = chips;
            sink.upsert(partial);
            if (i < toks.length) timers.push(setTimeout(tick, 32 * speed)); else done();
          })();
        });
      });
    });
    chain = chain.then(function () { sink.typing(false); });
    return { done: chain, cancel: function () { cancelled = true; timers.forEach(clearTimeout); sink.typing(false); } };
  }

  /* ---------- the adapter ---------- */
  function MockAdapter(opts) {
    C.BaseAdapter.call(this, opts.offline ? 'mock-offline' : 'mock');
    this.stream = opts.stream != null ? !!opts.stream : C._param('chat_stream') !== '0';
    this.capabilities.streaming = this.stream;
    this.capabilities.upload = true;
    var assetBase = opts.assetBase;
    if (assetBase == null && C._scriptBase) { try { assetBase = new URL('../', C._scriptBase).href; } catch (e) { assetBase = ''; } }
    this.brain = new MockBrain({ catalog: opts.catalog, assetBase: assetBase || '' });
    this.speed = opts.speed != null ? opts.speed : (C._param('chat_speed') != null ? +C._param('chat_speed') : 1);
    this.offline = !!opts.offline;
    this.failNext = false;
    this._run = null;
    /* transcript survives PLP → PDP navigation in the same tab (sessionStorage, never localStorage) */
    this.persist = opts.persist !== false && !this.offline && typeof sessionStorage !== 'undefined';
    if (opts.context) this.setContext(opts.context);
  }
  MockAdapter.prototype = Object.create(C.BaseAdapter.prototype);
  MockAdapter.prototype.constructor = MockAdapter;
  var STORE = 'mc_mock_v1';
  MockAdapter.prototype._upsert = function (m) {
    C.BaseAdapter.prototype._upsert.call(this, m);
    if (this.persist && m.status !== 'streaming' && m.status !== 'sending') {
      try { sessionStorage.setItem(STORE, JSON.stringify({ msgs: this._msgs.filter(function (x) { return x.role !== 'system'; }).slice(-60), st: this.brain.st })); } catch (e) { /* quota / blocked */ }
    }
    return m;
  };
  MockAdapter.prototype._restore = function () {
    if (!this.persist || this._msgs.length) return false;
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      if (!saved || !saved.msgs || !saved.msgs.length) return false;
      this.brain.st = saved.st || this.brain.st;
      var self = this;
      saved.msgs.forEach(function (m) { if (m.status === 'streaming') m.status = 'complete'; C.BaseAdapter.prototype._upsert.call(self, m); });
      return true;
    } catch (e) { return false; }
  };
  MockAdapter.prototype._sink = function () {
    var self = this;
    return { typing: function (on) { self._typing(on); }, upsert: function (m) { self._upsert(m); } };
  };
  MockAdapter.prototype._play = function (steps) {
    if (this._run) this._run.cancel();
    this._run = playScript(steps, this._sink(), { speed: this.speed, stream: this.stream });
    return this._run.done;
  };
  MockAdapter.prototype._offlineNotice = function () {
    this._upsert(C.message('system', [
      B.error('offline', 'Juna ist gerade nicht erreichbar. Bitte prüfen Sie Ihre Verbindung – oder wenden Sie sich direkt an unser Team.', true),
      C.handoffBlock('offline')
    ], { meta: { source: 'mock' } }));
  };
  MockAdapter.prototype.connect = function () {
    var self = this;
    this._setStatus('connecting');
    return new Promise(function (r) { setTimeout(r, self.speed > 0 ? 450 * self.speed : 0); }).then(function () {
      if (self.offline) { self._setStatus('offline', 'simulated (?chat=offline)'); self._offlineNotice(); return; }
      self._setStatus('online');
      if (self._restore()) return;
      /* greet in the background: connect() resolves at "online", so a carried hub question can be sent at once (hub v3 handover) */
      if (!self._msgs.length) self._play(self.brain.greeting(self.context));
    });
  };
  MockAdapter.prototype.send = function (input) {
    input = C.normalizeInput(input);
    var self = this, echo;
    if (input.type === 'image') {
      if (input.blob && !input.url && root.URL && URL.createObjectURL) input.url = URL.createObjectURL(input.blob);   /* stays in this tab — never uploaded */
      echo = C.userMessage(input);
    } else echo = C.userMessage(input);
    echo.meta.source = 'mock';
    this._upsert(echo);
    if (this.offline || this.failNext) {
      var code = this.offline ? 'offline' : 'server';
      this.failNext = false;
      echo = JSON.parse(JSON.stringify(echo)); echo.status = 'failed';
      this._upsert(echo);
      var err = new Error(code); err.code = code; err.message_id = echo.id;
      return Promise.reject(err);
    }
    var sent = JSON.parse(JSON.stringify(echo)); sent.status = 'sent';
    var upload = input.type === 'image' ? (this.speed > 0 ? 1200 * this.speed : 0) : 0;   /* simulated upload hairline */
    var delay = this.slowNext ? 9000 : 0, silent = this.silentNext;
    this.slowNext = this.silentNext = false;
    return new Promise(function (resolve) {
      setTimeout(function () {
        self._upsert(sent); resolve(sent);
        if (silent) return;                                   /* simulate('silent-next'): no answer → UI 15 s cap */
        setTimeout(function () { self._play(self.brain.reply(input, self.context)); }, delay + (self.speed > 0 ? 120 : 0));
      }, upload);
    });
  };
  MockAdapter.prototype.restart = function () {
    if (this._run) this._run.cancel();
    this._msgs = [];
    this.brain.reset();
    try { sessionStorage.removeItem(STORE); } catch (e) { /* ignore */ }
    this._em.emit('reset', {});
    return this.connect();
  };
  MockAdapter.prototype.disconnect = function () { if (this._run) this._run.cancel(); this._setStatus('idle'); };
  /** harness/test hook: 'offline' | 'online' | 'fail-next' | 'slow-next' | 'silent-next' */
  MockAdapter.prototype.simulate = function (what) {
    if (what === 'offline') { this.offline = true; this.mode = 'mock-offline'; this._setStatus('offline', 'simulated'); this._offlineNotice(); }
    else if (what === 'online') { this.offline = false; this.mode = 'mock'; this._setStatus('online'); }
    else if (what === 'fail-next') this.failNext = true;
    else if (what === 'slow-next') this.slowNext = true;       /* 9 s before the answer → "Das dauert länger als üblich …" */
    else if (what === 'silent-next') this.silentNext = true;   /* never answers → 15 s cap error */
  };

  function createMockAdapter(opts) { return new MockAdapter(opts || {}); }

  return { createMockAdapter: createMockAdapter, MockBrain: MockBrain, playScript: playScript, SNAPSHOT: SNAPSHOT };
});
