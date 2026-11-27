/* ============================================================
   Metzler Help Hub — launcher + panel + Botpress handoff
   Spec: research/03-design-spec.md (§6 behaviour, §7 Botpress,
   §8 copy, §9 config, §10 analytics). Vanilla JS, no dependencies.

   CONTRACT
   - Markup is static in the page (`<div class="hh" id="helpHub">`).
     This script never injects the hub; it only wires it and renders
     config-driven strings/hrefs into the existing nodes.
   - Configuration = `data-*` attributes on `#helpHub`:
       data-page-type        plp_sprechanlagen | plp_briefkaesten  (analytics + copy map)
       data-hotline-tel      E.164, e.g. +4971213177333
       data-hotline-display  human format, e.g. "07121 / 317 7333"
       data-hotline-name     "Sprechanlagen-Hotline" (aria-label of the tile)
       data-hours            "Mo-Fr 09:00-16:00" (Europe/Berlin, drives the status line)
       data-faq-url          href of the FAQ row
       data-dealer-url       href of the Fachhandelspartner row ("" hides the row)
       data-advisor          selector of the Kaufberater toggle ("" hides the row)
       data-appointment-url  fallback link when no #contactModal exists on the page
       data-nudge            "on" | "off" (default off)
       data-nudge-text       optional nudge copy override
       data-copy-kaufberater-sub / data-copy-faq-sub   optional subtext overrides
       data-botpress         "on" | "off" (off = never inject; chat tile shows error state)
       data-botpress-src     optional inject.js URL override (consent-gated / self-hosted copy)
       data-chat             "custom" | "botpress" | "off"  (default botpress = rollback-safe)
                             custom → our Juna window (chat/chat-window.js, research/13), lazy-loaded
                             on chat intent with the same hover/idle pattern as Botpress
       data-photo            "on" | "off" — Leitungs-Check photo flow inside the custom window
   - Hub v3 (research/17): `.hh--v3` markup with the inline ask field `.hh-ask` (label,
     KI badge, resume button, field + send, Art. 50 line). Typing + Enter hands the text
     over to the Juna window as its first message (crossfade, no close-then-open gap).
     v2 markup (chat tile `.hh-tile--chat`, briefkasten.html) keeps working unchanged.
   - Public API: window.MetzlerHelpHub = { init, open, close, destroy, isOpen, setUnread }
     (the only global this file creates besides the Botpress widget's own).
   - Analytics: dataLayer.push with the exact event names from spec §10.
   - Debug: `?hh_now=2026-10-11T07:30:00Z` stubs "now" for the availability line.
   - Works without Botpress: if inject.js fails (offline / blocked) the chat
     tile shows the error copy and every other item keeps working.
   ============================================================ */
(function (window, document) {
  'use strict';

  /* ---------- constants ---------- */
  var BOTPRESS = {
    src: 'https://cdn.botpress.cloud/webchat/v3.7/inject.js',
    botId: 'a63799f2-e362-4d12-8df9-f10a3ae2418a',
    clientId: '4b9a073d-6b06-4d91-83d1-42c5fa922d9a',
    configuration: {
      botName: 'Juna',
      color: '#005253',
      radius: 2,
      themeMode: 'light',
      composerPlaceholder: 'Ihre Nachricht'
    },
    initTimeout: 10000     /* ms until the chat tile falls into the error state */
  };

  var COPY = {
    fabAria: 'Hilfe & Kontakt',
    fabAriaUnread: function (n) { return 'Hilfe & Kontakt – ' + n + (n === 1 ? ' neue Nachricht' : ' neue Nachrichten'); },
    nowOpen: 'jetzt erreichbar',
    backAt: function (t) { return 'ab ' + t + ' Uhr'; },
    backTomorrow: function (t) { return 'ab morgen ' + t + ' Uhr'; },
    backMonday: function (t) { return 'ab Mo ' + t + ' Uhr'; },
    chatSub: 'KI · sofort',
    chatLoading: 'lädt …',
    chatError: 'derzeit nicht verfügbar',
    chatResume: 'fortsetzen',
    askPlaceholder: 'Ihre Frage …',
    askResume: 'Weiter mit Juna …',
    askOff: 'Chat derzeit nicht verfügbar',
    askOpen: 'Chat öffnen',
    askSend: 'Senden',
    resumeAria: function (n) { return 'Zum Gespräch zurückkehren' + (n ? ' – ' + n + (n === 1 ? ' neue Nachricht' : ' neue Nachrichten') : ''); },
    nudge: 'Fragen zur Video-Sprechanlage? Hotline oder Chat mit Juna (KI).'
  };

  /* Per-page subtext variants (spec §8/§9); data-copy-* attributes win. */
  var PAGE_COPY = {
    plp_sprechanlagen: { kaufberaterSub: 'In wenigen Fragen zur passenden Anlage', faqSub: 'Montage, Kompatibilität, App, Garantie' },
    plp_briefkaesten:  { kaufberaterSub: 'In wenigen Fragen zum passenden Briefkasten', faqSub: 'Montage, Größen, Lieferung, Garantie' }
  };

  var DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];          /* index = JS getDay() */
  var DAYS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }; /* Intl en-GB short */

  var MOBILE = '(max-width: 767px), (max-height: 500px)';   /* phones in portrait AND landscape (short screens) get the sheet */
  var DESKTOP_NUDGE = '(min-width: 1024px)';
  var REDUCED = '(prefers-reduced-motion: reduce)';

  /* ---------- module state ---------- */
  var root, els, cfg;
  var listeners = [];        /* [{target, type, fn, opts}] for destroy() */
  var timers = [];
  var observers = [];
  var state = {
    open: false,
    closing: false,
    chatOpen: false,
    everOpened: false,
    scrollY: 0,
    inerted: [],
    statusTimer: null,
    refocusAfterOverlay: false,
    unread: 0
  };
  var bp = {                 /* Botpress runtime */
    enabled: true,
    requested: false,
    injectedAt: 0,
    loadedMs: 0,
    initialized: false,
    failed: false,
    waiters: [],
    firstMessageSent: false,
    opened: false
  };

  /* ---------- small helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function mq(q) { return window.matchMedia(q).matches; }
  function isMobile() { return mq(MOBILE); }
  function reduced() { return mq(REDUCED); }
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push({ target: target, type: type, fn: fn, opts: opts });
  }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function attr(el, name, fallback) {
    var v = el.getAttribute(name);
    return v === null ? fallback : v;
  }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function track(event, params) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: event };
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
    window.dataLayer.push(payload);
  }
  /* non-cryptographic hash for `email_click.address_hash` (no PII in the dataLayer) */
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }
  function focusables(container) {
    return $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', container)
      .filter(function (el) { return !el.hidden && el.offsetParent !== null && !el.closest('[hidden]'); });
  }

  /* ---------- config ---------- */
  function readConfig() {
    var pageType = attr(root, 'data-page-type', 'plp_sprechanlagen');
    var pc = PAGE_COPY[pageType] || PAGE_COPY.plp_sprechanlagen;
    return {
      pageType: pageType,
      hotlineTel: attr(root, 'data-hotline-tel', '+4971213177333'),
      hotlineDisplay: attr(root, 'data-hotline-display', '07121 / 317 7333'),
      hotlineName: attr(root, 'data-hotline-name', 'Sprechanlagen-Hotline'),
      hours: attr(root, 'data-hours', 'Mo-Fr 09:00-16:00'),
      faqUrl: attr(root, 'data-faq-url', '/faq/'),
      dealerUrl: attr(root, 'data-dealer-url', ''),
      advisor: attr(root, 'data-advisor', '[data-ai-toggle]'),
      appointmentUrl: attr(root, 'data-appointment-url', '#'),
      nudge: attr(root, 'data-nudge', 'off') === 'on',
      nudgeText: attr(root, 'data-nudge-text', COPY.nudge),
      kaufberaterSub: attr(root, 'data-copy-kaufberater-sub', pc.kaufberaterSub),
      faqSub: attr(root, 'data-copy-faq-sub', pc.faqSub),
      botpress: attr(root, 'data-botpress', 'on') !== 'off',
      chat: attr(root, 'data-chat', 'botpress'),
      botpressSrc: attr(root, 'data-botpress-src', BOTPRESS.src)   /* override for a consent-gated / self-hosted copy */
    };
  }

  function collectEls() {
    return {
      fab: $('.hh-fab', root),
      fabLabel: $('.hh-fab__label', root),
      badge: $('.hh-fab__badge', root),
      top: $('.hh-top', root),
      scrim: $('.hh-scrim', root),
      panel: $('.hh-panel', root),
      handle: $('.hh-panel__handle', root),
      head: $('.hh-head', root),
      title: $('.hh-head__title', root),
      status: $('[data-hh-status]', root),
      statusShort: $('[data-hh-status-short]', root),
      close: $('.hh-head__close', root),
      hotline: $('.hh-tile--hotline', root),
      chatTile: $('.hh-tile--chat', root),                       /* v2 */
      chat: $('.hh-tile--chat', root) || $('.hh-ask__send', root),
      chatSub: $('.hh-tile--chat .hh-tile__sub', root),
      ask: $('.hh-ask', root),                                   /* v3 */
      askForm: $('.hh-ask__form', root),
      askField: $('.hh-ask__field', root),
      askSend: $('.hh-ask__send', root),
      askResume: $('.hh-head__resume', root) || $('.hh-ask__resume', root),     /* R3r: "Zum Gespräch" in the header */
      askUnread: $('.hh-head__unread', root) || $('.hh-ask__unread', root),
      appointment: $('[data-hh="appointment"]', root),
      kaufberater: $('[data-hh="kaufberater"]', root),
      faq: $('[data-hh="faq"]', root),
      dealer: $('[data-hh="dealer"]', root),
      nudge: $('.hh-nudge', root),
      nudgeText: $('.hh-nudge__text', root),
      nudgeClose: $('.hh-nudge__close', root)
    };
  }

  /* Render config into the static markup (markup ships with sprechanlage
     defaults so it is correct without JS). */
  function render() {
    /* hotline tile */
    if (els.hotline) {
      els.hotline.setAttribute('href', 'tel:' + cfg.hotlineTel);
      /* no aria-label: the visible text "Hotline anrufen / number / status" is the
         accessible name, so screen readers hear the live availability (HH-06) */
      els.hotline.removeAttribute('aria-label');
      var num = $('[data-hh-number]', els.hotline);
      if (num) setText(num, cfg.hotlineDisplay);
    }
    /* rows */
    if (els.faq) {
      els.faq.setAttribute('href', cfg.faqUrl);
      setText($('.hh-row__sub', els.faq), cfg.faqSub);
    }
    if (els.kaufberater) {
      setText($('.hh-row__sub', els.kaufberater), cfg.kaufberaterSub);
      var hasAdvisor = cfg.advisor && $(cfg.advisor);
      els.kaufberater.parentNode.hidden = !hasAdvisor;
    }
    if (els.dealer) {
      if (cfg.dealerUrl) { els.dealer.setAttribute('href', cfg.dealerUrl); els.dealer.parentNode.hidden = false; }
      else els.dealer.parentNode.hidden = true;        /* no dead anchor (spec §11.15) */
    }
    /* Termin: button → contact modal when the page has one, otherwise a real link */
    if (els.appointment) {
      var modalAvailable = !!($('#contactModal') && $('[data-open-modal]'));
      if (!modalAvailable && els.appointment.tagName === 'BUTTON') {
        var a = document.createElement('a');
        a.className = els.appointment.className;
        a.setAttribute('data-hh', 'appointment');
        a.href = cfg.appointmentUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.innerHTML = els.appointment.innerHTML;
        els.appointment.parentNode.replaceChild(a, els.appointment);
        els.appointment = a;
      }
    }
    /* nudge copy */
    if (els.nudgeText) setText(els.nudgeText, cfg.nudgeText);
    if (cfg.chat === 'off' || (cfg.chat !== 'custom' && !cfg.botpress)) setChatError();
    else if (cfg.chat === 'custom') setText(els.chatSub, chatSubText());
    syncAsk();
  }

  /* ---------- availability (Europe/Berlin) ---------- */
  var hoursSpec = null;   /* {d1, d2, start, end, text, startText} */
  function parseHours(str) {
    var m = /^\s*(\w{2})\s*[-–]\s*(\w{2})\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/.exec(str || '');
    if (!m) return null;
    var d1 = DAYS_DE.indexOf(m[1]), d2 = DAYS_DE.indexOf(m[2]);
    if (d1 < 0 || d2 < 0) return null;
    var sh = +m[3], sm = +m[4], eh = +m[5], em = +m[6];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return {
      d1: d1, d2: d2,
      start: sh * 60 + sm, end: eh * 60 + em,
      text: m[1] + '–' + m[2] + ' ' + pad(sh) + ':' + pad(sm) + '–' + pad(eh) + ':' + pad(em) + ' Uhr',
      startText: pad(sh) + ':' + pad(sm)   /* "09:00" — zero-padded like the hours range (HH-12) */
    };
  }
  function debugNow() {
    var m = /[?&]hh_now=([^&]+)/.exec(window.location.search);
    if (!m) return null;
    var d = new Date(decodeURIComponent(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  function berlinNow(date) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      return { day: DAYS_EN[o.weekday], minutes: (+o.hour % 24) * 60 + (+o.minute) };
    } catch (e) {
      return { day: date.getDay(), minutes: date.getHours() * 60 + date.getMinutes() };
    }
  }
  function isWorkday(day) {
    if (!hoursSpec) return false;
    return hoursSpec.d1 <= hoursSpec.d2 ? (day >= hoursSpec.d1 && day <= hoursSpec.d2) : (day >= hoursSpec.d1 || day <= hoursSpec.d2);
  }
  function availability(date) {
    if (!hoursSpec) return { open: true, text: '', short: COPY.nowOpen };
    var now = berlinNow(date);
    var short;
    var open = isWorkday(now.day) && now.minutes >= hoursSpec.start && now.minutes < hoursSpec.end;
    if (open) short = COPY.nowOpen;
    else if (isWorkday(now.day) && now.minutes < hoursSpec.start) short = COPY.backAt(hoursSpec.startText);
    else if (isWorkday(now.day) && isWorkday((now.day + 1) % 7)) short = COPY.backTomorrow(hoursSpec.startText);
    else short = COPY.backMonday(hoursSpec.startText);
    return { open: open, text: hoursSpec.text + ' · ' + short, short: short };
  }
  function updateStatus() {
    var a = availability(debugNow() || new Date());
    root.classList.toggle('is-closed-hours', !a.open);
    setText(els.status, a.text);
    setText(els.statusShort, a.short);
  }

  /* ---------- open / close ---------- */
  function open(trigger, opts) {
    opts = opts || {};
    if (state.open || root.classList.contains('is-hidden')) return;
    if (state.closing) finishClose();
    state.open = true;
    state.everOpened = true;
    hideNudge();
    updateStatus();
    state.statusTimer = setInterval(updateStatus, 60000);

    root.classList.add('is-open');
    els.fab.setAttribute('aria-expanded', 'true');
    els.panel.hidden = false;

    if (isMobile()) {
      els.scrim.hidden = false;
      els.panel.setAttribute('aria-modal', 'true');
      lockScroll();
      setInert(true);
    } else {
      els.panel.removeAttribute('aria-modal');
    }
    /* focus: v3 desktop → the ask field (typing starts at once); otherwise / mobile → the title
       (tabindex=-1, no on-screen keyboard). focus() forces layout, the rAF is a fallback */
    syncAsk();
    if (!opts.noFocus) focusHubStart();

    track('help_hub_open', { page_type: cfg.pageType, trigger: trigger || 'fab' });
    /* warm Botpress off the click task AND off the user's next tap: idle callback,
       2 s ceiling (SEO F4); the chat tile still injects immediately */
    if (cfg.chat === 'custom') requestChat('idle', 2000);
    else if (cfg.chat !== 'off' && cfg.botpress) requestBotpress('idle', 2000);   /* "off" never warms Botpress */
  }

  function focusHubStart() {
    var first = els.askField && !isMobile() && !els.askField.disabled ? els.askField : els.title;
    first.focus({ preventScroll: true });
    requestAnimationFrame(function () { if (state.open && document.activeElement !== first) first.focus({ preventScroll: true }); });
  }
  function close(opts) {
    opts = opts || {};
    if (!state.open) return;
    state.open = false;
    clearInterval(state.statusTimer);
    if (!opts.keepLauncher) els.fab.setAttribute('aria-expanded', 'false');   /* hand-over: the launcher stays the chevron */
    var restore = opts.restoreFocus !== false && (root.contains(document.activeElement) || document.activeElement === document.body);
    if (isMobile()) { setInert(false); unlockScroll(); }

    /* exit animation (150 ms card / 220 ms sheet / 120 ms reduced) then `hidden` */
    var dur = reduced() ? 120 : (isMobile() ? 220 : 150);
    if (opts.handover) { dur = reduced() ? 120 : 180; root.classList.add('is-handover'); }   /* v3: crossfade into the Juna window */
    if (opts.immediate) dur = 0;
    state.closing = true;
    root.classList.remove('is-open');
    root.classList.add('is-closing');
    if (opts.swipe) {
      /* continue the exit from the current drag offset instead of replaying the sheet keyframe */
      dur = reduced() ? 0 : 200;
      els.panel.classList.add('is-settling');
      els.panel.style.setProperty('--hh-drag', '100%');
    }
    if (dur === 0) finishClose(); else later(finishClose, dur);

    if (restore) els.fab.focus({ preventScroll: true });
  }
  function finishClose() {
    if (!state.closing) return;
    state.closing = false;
    root.classList.remove('is-closing', 'is-handover', 'is-handback', 'is-handback-in', 'is-handback-fade');
    els.panel.hidden = true;
    els.scrim.hidden = true;
    els.panel.classList.remove('is-dragging', 'is-settling');
    els.panel.style.removeProperty('--hh-drag');
  }
  function toggle(trigger) { state.open ? close() : open(trigger); }

  /* ---------- mobile modality: scroll lock + inert ---------- */
  function lockScroll() {
    state.scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.body.style.overflow = '';
    if (Math.abs(window.scrollY - state.scrollY) > 2) window.scrollTo(0, state.scrollY);
  }
  function setInert(onOff) {
    var supportsInert = 'inert' in HTMLElement.prototype;
    if (onOff) {
      state.inerted = [];
      $$(':scope > *', document.body).forEach(function (el) {
        if (el === root || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
        if (supportsInert) { if (el.inert) return; el.inert = true; }
        else { if (el.getAttribute('aria-hidden') === 'true') return; el.setAttribute('aria-hidden', 'true'); }
        state.inerted.push(el);
      });
    } else {
      state.inerted.forEach(function (el) {
        if (supportsInert) el.inert = false; else el.removeAttribute('aria-hidden');
      });
      state.inerted = [];
    }
  }

  /* ---------- keyboard ---------- */
  function onKeydown(e) {
    if (!state.open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(els.panel);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (isMobile()) {
      /* modal sheet: loop focus inside the panel */
      if (e.shiftKey && (cur === first || cur === els.title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
      return;
    }
    /* desktop non-modal: Tab past the last control (or Shift+Tab off the
       launcher) leaves the hub and closes it; the browser moves focus on. */
    if ((!e.shiftKey && cur === last) || (e.shiftKey && cur === els.fab)) close({ restoreFocus: false });
  }
  /* desktop non-modal: Tab past the last link leaves the hub and closes it */
  function onFocusOut(e) {
    if (!state.open || isMobile()) return;
    var to = e.relatedTarget;
    /* R3r: focus moving into the Juna window during a hand-over is not "leaving" - the hand-over closes the panel
       itself (keepLauncher); closing here would flip the launcher to its closed state ("Hilfe" instead of the chevron) */
    if (root.classList.contains('is-handing') || (to && to.closest && to.closest('#metzlerChat'))) return;
    if (to && !root.contains(to)) close({ restoreFocus: false });
  }
  /* outside pointerdown (≥768) */
  function onDocPointerDown(e) {
    if (!state.open || isMobile()) return;
    if (!root.contains(e.target)) close();
  }

  /* ---------- swipe-to-close (<768) on handle/header ---------- */
  var drag = null;
  function onDragStart(e) {
    if (!state.open || !isMobile() || e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { y: e.clientY, t: e.timeStamp, dy: 0, id: e.pointerId };
    els.panel.classList.add('is-dragging');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    els.panel.style.setProperty('--hh-drag', drag.dy + 'px');
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dt = Math.max(1, e.timeStamp - drag.t);
    var fast = drag.dy / dt > 0.5;           /* px per ms → flick */
    var far = drag.dy >= 80;
    var d = drag; drag = null;
    if (far || (fast && d.dy > 24)) { close({ swipe: true }); return; }
    /* sub-threshold release: ease back to 0 over 200 ms, then drop the drag state */
    els.panel.classList.add('is-settling');
    els.panel.style.setProperty('--hh-drag', '0px');
    later(function () {
      if (drag) return;                      /* a new drag started meanwhile */
      els.panel.classList.remove('is-settling', 'is-dragging');
      els.panel.style.removeProperty('--hh-drag');
    }, 220);
  }

  /* ---------- items ---------- */
  function select(item, destination) {
    track('help_hub_select', { item: item, destination: destination, page_type: cfg.pageType });
  }
  function onHotline() { select('hotline', 'tel:' + cfg.hotlineTel); close({ restoreFocus: false }); }
  function onFaq() { select('faq', cfg.faqUrl); close({ restoreFocus: false }); }
  function onDealer() { select('dealer', cfg.dealerUrl); close({ restoreFocus: false }); }
  function onFooterLink(e) {
    var a = e.currentTarget, href = a.getAttribute('href') || '';
    if (/^mailto:/i.test(href)) select('email', href);
    else if (/datenschutz/i.test(href)) select('privacy', href);
    else select('contact', href);
    close({ restoreFocus: false });
  }
  function onAppointment(e) {
    if (els.appointment.tagName === 'A') {
      select('appointment', els.appointment.getAttribute('href'));
      track('appointment_click', { type: 'kaufberatung' });
      close({ restoreFocus: false });
      return;
    }
    e.preventDefault();
    select('appointment', '#contactModal');
    /* close first (focus → launcher), then the existing opener records the
       launcher as its return-focus target and opens the modal above the hub */
    close({ immediate: true });
    els.fab.focus({ preventScroll: true });
    state.refocusAfterOverlay = true;
    var opener = $('[data-open-modal]');
    if (opener) opener.click();
  }
  function onKaufberater(e) {
    e.preventDefault();
    select('kaufberater', cfg.advisor);
    close({ restoreFocus: false });
    var target = $(cfg.advisor);
    if (!target) return;
    /* data-advisor is either the inline advisor's toggle or (since 2026-11-24, as in Desktop/PLP) the iframe of the
       embedded Purchase Advisor (plp-berater.html, same origin): then the toggle lives in the frame's document */
    var framed = target.tagName === 'IFRAME';
    var doc = null;
    if (framed) { try { doc = target.contentDocument; } catch (err) { doc = null; } }
    var toggleEl = framed ? (doc && $('[data-ai-toggle]', doc)) : target;
    var advisor = toggleEl ? (toggleEl.closest('.advisor') || toggleEl) : null;
    /* scroll so the advisor clears the sticky header */
    var header = $('.header');
    var offset = (header ? header.getBoundingClientRect().height : 0) + 16;
    var top = (framed ? target : advisor).getBoundingClientRect().top + window.scrollY - offset;
    /* 'instant', not 'auto': the PLP sets html{scroll-behavior:smooth} (HH-10) */
    window.scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'instant' : 'smooth' });
    if (!advisor) { if (framed) target.focus({ preventScroll: true }); return; }   /* frame not loaded yet: at least land on it */
    if (!advisor.classList.contains('is-open')) toggleEl.click();
    /* land on the first quiz control once the hub's 150 ms close has finished
       (the advisor's own toggle targets the question heading, which is not
       focusable) — candidates in priority order, retry once if the quiz re-rendered */
    function focusQuiz(retry) {
      var ctl = $('.advisor__opt', advisor) || $('[data-ai-quiz] button', advisor) || $('[data-ai-quiz] [tabindex]', advisor);
      if (ctl) ctl.focus({ preventScroll: true });
      if (retry && !advisor.contains((doc || document).activeElement)) later(function () { focusQuiz(false); }, 300);
    }
    later(function () { focusQuiz(true); }, 200);
  }

  /* tel:/mailto: anywhere on the page (hub + quickbar + footer + modal) */
  function onDocClick(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^tel:/i.test(href)) track('hotline_click', { number: href.slice(4) });
    else if (/^mailto:/i.test(href)) track('email_click', { address_hash: hashStr(href.slice(7).toLowerCase()) });
    else if (a.closest('#contactModal')) {
      if (/calendly\.com/i.test(href)) track('appointment_click', { type: 'kaufberatung' });
      else if (/support-termin/i.test(href)) track('appointment_click', { type: 'support' });
    }
  }

  /* ---------- scroll-to-top ---------- */
  var topTicking = false;
  function updateTop() {
    topTicking = false;
    var show = window.scrollY > 1.5 * window.innerHeight;
    els.top.classList.toggle('is-visible', show);
  }
  function onScroll() {
    if (!topTicking) { topTicking = true; requestAnimationFrame(updateTop); }
    if (cfg.nudge) nudgeScrollCheck();
  }
  function onTop() {
    window.scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' });
    els.fab.focus({ preventScroll: true });
  }

  /* ---------- suppression by other overlays (spec §3) ---------- */
  function shouldHide() {
    var modal = $('#contactModal');
    if (modal && modal.classList.contains('is-open')) return true;
    var nav = $('#mobileNav');
    if (nav && nav.getAttribute('aria-hidden') === 'false') return true;
    var filters = $('.filters');
    if (filters && filters.classList.contains('is-open') && !mq('(min-width: 1024px)')) return true;
    if (isMobile() && (document.body.classList.contains('sidebasket-open') || document.body.classList.contains('configurator-open'))) return true;
    return false;
  }
  function syncHidden() {
    var hide = shouldHide();
    if (hide && state.open) close({ immediate: true, restoreFocus: false });
    var was = root.classList.contains('is-hidden');
    root.classList.toggle('is-hidden', hide);
    /* the contact modal returned focus while we were display:none → re-focus the launcher */
    if (was && !hide && state.refocusAfterOverlay) {
      state.refocusAfterOverlay = false;
      els.fab.focus({ preventScroll: true });
    }
  }
  function watchOverlays() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(syncHidden);
    ['#contactModal', '#mobileNav', '.filters'].forEach(function (sel) {
      var el = $(sel);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observers.push(mo);
    syncHidden();
  }

  /* ---------- Botpress handoff (spec §7) ---------- */
  function setChatLoading(onOff) {
    root.classList.toggle('is-loading', onOff);
    if (onOff) { els.chat.setAttribute('aria-busy', 'true'); setText(els.chatSub, COPY.chatLoading); }
    else { els.chat.removeAttribute('aria-busy'); if (!bp.failed) setText(els.chatSub, chatSubText()); }
    if (els.askForm) { if (onOff) els.askForm.setAttribute('aria-busy', 'true'); else els.askForm.removeAttribute('aria-busy'); }
  }
  function setChatError() {
    bp.failed = true;
    root.classList.remove('is-loading');
    root.classList.add('is-chat-error');
    els.chat.setAttribute('aria-disabled', 'true');
    els.chat.removeAttribute('aria-busy');
    setText(els.chatSub, COPY.chatError);
    if (els.askField) {
      els.askField.disabled = true;
      els.askField.placeholder = COPY.askOff;
      els.askSend.setAttribute('aria-disabled', 'true');
      if (els.askResume) els.askResume.hidden = true;
    }
    bp.waiters.splice(0).forEach(function (w) { w.reject(new Error('botpress unavailable')); });
  }
  function whenInitialized() {
    return new Promise(function (resolve, reject) {
      if (bp.initialized) return resolve();
      if (bp.failed) return reject(new Error('botpress unavailable'));
      bp.waiters.push({ resolve: resolve, reject: reject });
    });
  }
  /* inject the script off the interaction task; idle-deferred on hover,
     immediate (setTimeout 0) when the hub opens or the chat tile is clicked */
  var idleHandle = null, idleTimeout = Infinity;
  function cancelIdle() {
    if (idleHandle !== null && window.cancelIdleCallback) window.cancelIdleCallback(idleHandle);
    idleHandle = null; idleTimeout = Infinity;
  }
  /* mode 'idle' (hover 8 s / open 2 s ceiling): requestIdleCallback, falling
     back to setTimeout(0) where rIC is unavailable; no mode = inject now. A
     shorter ceiling replaces a pending longer one. */
  function requestBotpress(mode, timeout) {
    if (!cfg.botpress || cfg.chat === 'off' || cfg.chat === 'custom' || bp.requested) return;
    if (mode === 'idle') {
      timeout = timeout || 8000;
      if (!window.requestIdleCallback) { later(injectBotpress, 0); return; }
      if (idleHandle !== null && timeout >= idleTimeout) return;
      cancelIdle();
      idleTimeout = timeout;
      idleHandle = window.requestIdleCallback(function () { idleHandle = null; injectBotpress(); }, { timeout: timeout });
      return;
    }
    cancelIdle();
    injectBotpress();
  }
  function injectBotpress() {
    if (bp.requested) return;
    bp.requested = true;
    bp.injectedAt = performance.now();
    var s = document.createElement('script');
    s.src = cfg.botpressSrc;
    s.async = true;
    s.onload = initBotpress;
    s.onerror = function () { setChatError(); };
    document.head.appendChild(s);
    later(function () { if (!bp.initialized && !bp.failed) setChatError(); }, BOTPRESS.initTimeout);
  }
  /* Botpress renders window + FAB in one open shadow root (host:
     `.bpChatContainer > div`). Append a style there that hides only the
     FAB wrapper and anchors the window to the hub stack (badge clearance
     + right axis). Returns true once applied. Production path: Botpress
     dashboard "Custom element" toggle / custom stylesheet (handoff). */
  function styleBotpressShadow() {
    var host = $('.bpChatContainer > *');
    var sr = host && host.shadowRoot;
    if (!sr) return false;
    if (!sr.querySelector('#hh-bp-style')) {
      var cs = getComputedStyle(root);
      var bottom = (cs.getPropertyValue('--hh-badge-h') || '').trim() || '72px';
      var right = (cs.getPropertyValue('--hh-right') || '').trim() || '24px';
      var st = document.createElement('style');
      st.id = 'hh-bp-style';
      st.textContent =
        '.bpFabWrapper{display:none!important}' +
        '@media (min-width:768px) and (min-height:501px){.bpWebchat.bpFABWebchat{bottom:' + bottom + '!important;right:' + right + '!important}}';
      sr.appendChild(st);
    }
    document.documentElement.classList.add('hh-bp-styled');
    return true;
  }
  function pollBotpressShadow(tries) {
    if (styleBotpressShadow() || tries <= 0) return;
    requestAnimationFrame(function () { pollBotpressShadow(tries - 1); });
  }
  function initBotpress() {
    var w = window.botpress;
    if (!w || typeof w.init !== 'function') { setChatError(); return; }
    /* listeners BEFORE init() so nothing is missed */
    w.on('webchat:initialized', function () {
      bp.initialized = true;
      bp.loadedMs = Math.round(performance.now() - bp.injectedAt);
      styleBotpressShadow();
      try {
        w.updateUser({ data: { language: 'de', currentPageUrl: window.location.href, entryPoint: 'helphub', pageType: cfg.pageType } });
        Promise.resolve(w.getUser && w.getUser()).then(function (u) { if (u) bp.userId = u.id || u.userId || null; }, function () {});
      } catch (e) { /* non-fatal */ }
      bp.waiters.splice(0).forEach(function (x) { x.resolve(); });
    });
    w.on('webchat:opened', function () {
      state.chatOpen = true;
      root.classList.add('is-chat-open');
      document.documentElement.classList.add('hh-chat-open');
      if (!bp.opened) { bp.opened = true; track('chat_open', { source: 'hub', bot_loaded_ms: bp.loadedMs }); }
      else track('chat_open', { source: 'hub', bot_loaded_ms: bp.loadedMs });
      setUnread(0);
    });
    w.on('webchat:closed', function () {
      state.chatOpen = false;
      /* launcher re-appears closed (short fade, not the 320 ms rise — HH-11) and takes focus */
      root.classList.add('is-chat-returning');
      root.classList.remove('is-chat-open');
      document.documentElement.classList.remove('hh-chat-open');
      later(function () { root.classList.remove('is-chat-returning'); }, 200);
      els.fab.focus({ preventScroll: true });
    });
    w.on('message', function (msg) {
      /* v3 payload: { ... } — a user-authored message is the first "sent" one */
      var fromUser = msg && (msg.direction === 'outgoing' || msg.role === 'user' || (msg.authorId && msg.authorId === bp.userId));
      if (fromUser && !bp.firstMessageSent) { bp.firstMessageSent = true; track('chat_first_message', { source: 'hub' }); }
      if (!fromUser && !state.chatOpen && bp.opened) setUnread(state.unread + 1);
    });
    w.on('error', function () { if (!bp.initialized) setChatError(); });
    try {
      w.init({ botId: BOTPRESS.botId, clientId: BOTPRESS.clientId, configuration: BOTPRESS.configuration });
    } catch (e) { setChatError(); }
    pollBotpressShadow(180);   /* ~3 s of frames: style the shadow root as soon as it exists */
    /* Mirror Botpress' own unread API onto the launcher badge. `window.botpress`
       is frozen in v3.7 (verified: assignment throws), so this is best-effort;
       the `message` listener above and MetzlerHelpHub.setUnread() remain. */
    try {
      if (typeof w.setUnreadMessageCount === 'function') {
        var orig = w.setUnreadMessageCount;
        w.setUnreadMessageCount = function (n) { setUnread(n); return orig.apply(w, arguments); };
      }
    } catch (e) { /* frozen API object — ignore */ }
  }
  function onChat(e) {
    if (cfg.chat === 'custom') { onChatCustom(e); return; }
    if (bp.failed || root.classList.contains('is-loading')) return;
    select('chat', 'botpress');
    if (!cfg.botpress) return;
    setChatLoading(true);
    later(function () { requestBotpress(); }, 0);
    whenInitialized().then(function () {
      setChatLoading(false);
      close({ immediate: false, restoreFocus: false });
      later(function () {
        state.chatOpen = true;
        root.classList.add('is-chat-open');
        try { window.botpress.open(); } catch (e) { setChatError(); root.classList.remove('is-chat-open'); }
      }, 150);
    }, function () { /* error state already rendered */ });
  }
  /* ---------- custom Juna window (data-chat="custom", spec research/13 §4) ----------
     Assets (chat/chat-window.css + chat/chat-window.js → adapter.js → mock/BFF adapter)
     load only on chat intent: launcher hover → idle (8 s ceiling), hub open → idle (2 s),
     chat row → immediately. Nothing is in the critical path; the window root is created
     on first open (no CLS). The Botpress path above stays untouched (rollback). */
  var HUB_BASE = (function () {
    var s = document.currentScript || $$('script[src*="help-hub.js"]')[0];
    return s ? s.src.replace(/[^/]*$/, '') : '';
  })();
  var chatMod = { promise: null, wired: false, idle: null };
  function chatSubText() {
    if (cfg.chat !== 'custom') return COPY.chatSub;
    var resume = false;
    try { resume = sessionStorage.getItem('cw_transcript') === '1'; } catch (e) { /* storage blocked */ }
    return resume ? COPY.chatResume : COPY.chatSub;
  }
  function loadChat() {
    if (chatMod.promise) return chatMod.promise;
    chatMod.promise = new Promise(function (resolve, reject) {
      var v = '?v=54';
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = HUB_BASE + 'chat/chat-window.css' + v;
      document.head.appendChild(link);
      var s = document.createElement('script');
      s.src = HUB_BASE + 'chat/chat-window.js' + v;
      s.async = true;
      s.onload = function () { if (window.MetzlerChatWindow) resolve(window.MetzlerChatWindow); else reject(new Error('no window')); };
      s.onerror = function () { reject(new Error('chat-window.js failed')); };
      document.head.appendChild(s);
    });
    chatMod.promise.catch(function () { chatMod.promise = null; });
    return chatMod.promise;
  }
  function requestChat(mode, timeout) {
    if (chatMod.promise) return;
    if (mode === 'idle' && window.requestIdleCallback) {
      timeout = timeout || 8000;
      if (chatMod.idle && chatMod.idle.timeout <= timeout) return;
      if (chatMod.idle && window.cancelIdleCallback) window.cancelIdleCallback(chatMod.idle.handle);
      chatMod.idle = { timeout: timeout, handle: window.requestIdleCallback(function () { chatMod.idle = null; loadChat().catch(function () {}); }, { timeout: timeout }) };
      return;
    }
    later(function () { loadChat().catch(function () {}); }, 0);
  }
  function wireChatWindow(w) {
    if (chatMod.wired) return;
    chatMod.wired = true;
    w.on('open', function () {
      try { sessionStorage.setItem('cw_opened', '1'); } catch (e) { /* storage blocked */ }
      state.chatOpen = true;
      bp.opened = true;
      /* desktop v3: the launcher stays in place as the chevron - switch state directly (the old is-chat-opening step
         restarted its hh-fab-in rise animation mid hand-over, research/19). Mobile / v2 keep the 150 ms launcher fade. */
      if (!isMobile() && root.classList.contains('hh--v3')) {
        root.classList.add('is-chat-open'); document.documentElement.classList.add('hh-chat-open');
      } else {
        root.classList.add('is-chat-opening');
        later(function () {
          root.classList.remove('is-chat-opening');
          if (state.chatOpen) { root.classList.add('is-chat-open'); document.documentElement.classList.add('hh-chat-open'); }
        }, 150);
      }
      setUnread(0);
      if (!isMobile()) { els.fab.setAttribute('aria-expanded', 'true'); els.fab.setAttribute('aria-label', 'Chat minimieren'); }
    });
    /* R3r: the window's ← hands back to this panel (one surface, reverse of the hand-over). The panel opens laid out
       but invisible (.is-handback); the window calls reveal() at the swap and done() at the end. */
    w.on('back', function (hb) {
      if (state.open) return;
      root.classList.add('is-handback');
      open('chat_back', { noFocus: true });
      hb.panel = els.panel;
      hb.reveal = function (fade) {
        root.classList.add(fade ? 'is-handback-fade' : 'is-handback-in');
        focusHubStart();                                    /* desktop: the ask field ("Weiter mit Juna …"); mobile: the title */
      };
      hb.done = function () { syncAsk(); };
    });
    w.on('close', function (d) {
      state.chatOpen = false;
      if (d && d.handback) {
        /* back to the hub: the launcher stays the chevron (hub open) — no is-chat-returning replay, no focus move */
        root.classList.remove('is-chat-opening', 'is-chat-open');
        document.documentElement.classList.remove('hh-chat-open');
        els.fab.setAttribute('aria-expanded', 'true'); setUnread(state.unread);
        setText(els.chatSub, chatSubText());
        syncAsk();
        return;
      }
      els.fab.setAttribute('aria-expanded', 'false'); setUnread(state.unread);   /* restores the launcher's label */
      /* desktop v3: the launcher never left (it was the ⌄) - it only unfolds back into the pill (help-hub.css), so no
         is-chat-returning fade; toggling that class would also restart the launcher's entrance animation (a blink) */
      var returning = isMobile() || !root.classList.contains('hh--v3');
      root.classList.remove('is-chat-opening');
      if (returning) root.classList.add('is-chat-returning');
      root.classList.remove('is-chat-open');
      document.documentElement.classList.remove('hh-chat-open');
      if (returning) later(function () { root.classList.remove('is-chat-returning'); }, 200);
      setText(els.chatSub, chatSubText());
      syncAsk();
      if (!d || d.restoreFocus !== false) els.fab.focus({ preventScroll: true });
    });
    w.on('unread', function (n) { setUnread(n); });
    w.on('transcript', function () { setText(els.chatSub, chatSubText()); syncAsk(); });
  }
  function onChatCustom(e) {
    if (root.classList.contains('is-loading')) return;
    select('chat', 'juna');
    var t0 = performance.now();
    var trigger = e && e.detail === 0 ? 'keyboard' : 'pointer';
    setChatLoading(true);
    loadChat().then(function (w) {
      wireChatWindow(w);
      setChatLoading(false);
      close({ immediate: false, restoreFocus: false });
      return w.open({ source: 'hub', trigger: trigger, t0: t0 });
    }).catch(function () { setChatError(); });
  }

  /* ---------- hub v3 ask field (research/17 §3–§6) ---------- */
  /* owner 2026-10-15 ("the link is still hidden"): the way back to the chat must exist as soon as the user has been
     in the chat in this tab — not only once a message was sent */
  function chatVisited() {
    try { return sessionStorage.getItem('cw_opened') === '1'; } catch (e) { return false; }
  }
  function hasTranscript() {
    try { return sessionStorage.getItem('cw_transcript') === '1'; } catch (e) { return false; }
  }
  function syncAsk() {
    if (!els || !els.ask || !cfg) return;
    var off = bp.failed || cfg.chat === 'off';
    var resume = !off && cfg.chat === 'custom' && (hasTranscript() || chatVisited());
    if (els.askResume) {
      els.askResume.hidden = !resume;
      els.askResume.setAttribute('aria-label', COPY.resumeAria(state.unread));
    }
    if (els.askUnread) { els.askUnread.hidden = !(resume && state.unread > 0); setText(els.askUnread, state.unread > 9 ? '9+' : String(state.unread)); }
    if (!off) els.askField.placeholder = hasTranscript() ? COPY.askResume : COPY.askPlaceholder;   /* "Weiter mit Juna …" only with a conversation */
    var has = !!els.askField.value.trim();
    els.ask.classList.toggle('has-text', has);
    els.askSend.setAttribute('aria-label', has ? COPY.askSend : COPY.askOpen);
  }
  function wireAsk() {
    on(els.askForm, 'submit', function (e) {
      e.preventDefault();
      var text = els.askField.value.trim();
      handover(text, text ? 'text' : 'empty', 'keyboard');
    });
    on(els.askSend, 'click', function (e) {
      /* pointer clicks submit the form too; remember the trigger for focus rules */
      els.askSend._trigger = e.detail === 0 ? 'keyboard' : 'pointer';
    });
    on(els.askField, 'input', syncAsk);
    if (els.askResume) on(els.askResume, 'click', function (e) { handover('', 'resume', e.detail === 0 ? 'keyboard' : 'pointer'); });
    /* mobile: tapping the field hands over straight to the Juna sheet — no keyboard inside the hub sheet */
    on(els.askField, 'pointerdown', function (e) {
      if (!isMobile() || els.askField.disabled || e.pointerType === 'mouse') return;
      e.preventDefault();
      swallowNextClick();
      handover('', 'empty', 'tap');
    });
  }
  /* 2026-11-27 (live mobile QA, owner's iPhone): the hand-over starts on pointerdown, but the browser still fires the
     tap's click when the finger lifts - by then the Juna sheet is open under the finger and the click hit a starter
     question ("Lieferzeit & Garantie" was sent unasked). preventDefault on pointerdown does not cancel that click, so
     the next click within 800 ms is swallowed once, in the capture phase, before anything in the chat sees it. */
  function swallowNextClick() {
    function eat(ev) { document.removeEventListener('click', eat, true); ev.preventDefault(); ev.stopPropagation(); }
    document.addEventListener('click', eat, true);
    later(function () { document.removeEventListener('click', eat, true); }, 800);
  }
  function handover(text, input, trigger) {
    if (cfg.chat === 'off' || bp.failed || root.classList.contains('is-loading')) return;
    if (cfg.chat !== 'custom') { onChat(); return; }                 /* Botpress rollback: open the stock widget */
    track('help_hub_select', { item: input === 'resume' ? 'chat_resume' : 'chat', destination: 'juna', input: input, page_type: cfg.pageType });
    var t0 = performance.now();
    var loadedBefore = !!window.MetzlerChatWindow;
    if (els.askSend._trigger) { trigger = trigger === 'keyboard' ? els.askSend._trigger : trigger; els.askSend._trigger = null; }
    setChatLoading(true);
    loadChat().then(function (w) {
      wireChatWindow(w);
      setChatLoading(false);
      /* research/19: one surface. The window drives the choreography and calls back:
         swap(fade) - hide the panel (at once, or with the old 120/180 ms fade for reduced motion / expanded)
         done()     - clear the field only after the hand-over has finished (no empty-field flash) */
      var fr = els.askField.getBoundingClientRect(), fcs = getComputedStyle(els.askField);
      var ho = {
        panel: els.panel,
        field: text ? els.askField : null,
        fieldText: text ? { x: fr.left + parseFloat(fcs.paddingLeft), y: fr.top + fr.height / 2 } : null,
        swap: function (fade) {
          if (!state.open) return;
          if (fade) close({ handover: true, restoreFocus: false, keepLauncher: true });
          else close({ immediate: true, restoreFocus: false, keepLauncher: true });
        },
        done: function () {
          root.classList.remove('is-handing');
          els.askField.value = '';
          syncAsk();
        }
      };
      root.classList.add('is-handing');                     /* hub content fades (120 ms); the panel shell stays */
      return w.open({ source: 'hub', trigger: trigger === 'tap' ? 'pointer' : trigger, t0: t0, text: text, handover: ho,
        focus: trigger === 'tap' && !loadedBefore ? undefined : 'composer' });
    }).catch(function () { root.classList.remove('is-handing'); setChatError(); });
  }

  function setUnread(n) {
    state.unread = Math.max(0, n | 0);
    var show = state.unread > 0 && !state.chatOpen;
    els.badge.hidden = !show;
    setText(els.badge, state.unread > 9 ? '9+' : String(state.unread));
    var minimise = state.chatOpen && cfg.chat === 'custom' && !isMobile();   /* launcher = "minimise chat" while the window is open */
    els.fab.setAttribute('aria-label', minimise ? 'Chat minimieren' : show ? COPY.fabAriaUnread(state.unread) : COPY.fabAria);
    syncAsk();
  }

  /* ---------- nudge (default off; spec §6) ---------- */
  var nudge = { dwell: false, scrolled: false, shown: false, hideTimer: null };
  function nudgeAllowed() {
    if (!cfg.nudge || !els.nudge || !mq(DESKTOP_NUDGE)) return false;
    try {
      if (sessionStorage.getItem('hh_nudge_shown')) return false;
      var dismissed = +localStorage.getItem('hh_nudge_dismissed') || 0;
      if (dismissed && Date.now() - dismissed < 7 * 864e5) return false;
    } catch (e) { /* storage blocked → still allowed once */ }
    return !state.everOpened && !bp.opened && !state.chatOpen;
  }
  function nudgeScrollCheck() {
    if (nudge.scrolled) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY / max >= 0.5) { nudge.scrolled = true; maybeNudge(); }
  }
  function maybeNudge() {
    if (nudge.shown || !nudge.dwell || !nudge.scrolled || !nudgeAllowed()) return;
    nudge.shown = true;
    try { sessionStorage.setItem('hh_nudge_shown', '1'); } catch (e) { /* ignore */ }
    els.nudge.hidden = false;
    nudge.hideTimer = later(hideNudge, 8000);
  }
  function hideNudge() { if (els.nudge) els.nudge.hidden = true; clearTimeout(nudge.hideTimer); }
  function dismissNudge() {
    hideNudge();
    try { localStorage.setItem('hh_nudge_dismissed', String(Date.now())); } catch (e) { /* ignore */ }
    els.fab.focus({ preventScroll: true });
  }
  function startNudge() {
    if (!cfg.nudge || !els.nudge) return;
    later(function () { nudge.dwell = true; maybeNudge(); }, 60000);
    nudgeScrollCheck();
  }

  /* ---------- wiring ---------- */
  /* the pill ⇄ circle morph animates the label's width (help-hub.css); CSS cannot transition to `auto`, so the
     label's natural width is measured here (scrollWidth ignores the clip; 0 while hidden on mobile → keep the last) */
  function measureFab() {
    var w = els.fabLabel ? els.fabLabel.scrollWidth : 0;
    if (w) els.fab.style.setProperty('--hh-fab-label-w', w + 'px');
  }
  function wire() {
    on(els.fab, 'click', function (e) {
      /* owner 2026-10-15: the launcher stays visible while the Juna window is open (desktop) and minimises it */
      if (state.chatOpen && cfg.chat === 'custom' && window.MetzlerChatWindow && !isMobile()) { window.MetzlerChatWindow.close(); return; }
      /* keyboard activation of a button fires click with detail 0 */
      toggle(e.detail === 0 ? 'keyboard' : 'fab');
    });
    on(els.fab, 'pointerenter', function () {
      if (cfg.chat === 'custom') requestChat('idle');
      else if (cfg.chat !== 'off') requestBotpress('idle');
    }, { passive: true });
    on(els.close, 'click', function () { close(); });
    on(els.scrim, 'click', function () { close(); });
    on(document, 'keydown', onKeydown);
    on(root, 'focusout', onFocusOut);
    on(document, 'pointerdown', onDocPointerDown, { passive: true });
    on(document, 'click', onDocClick, { passive: true });

    [els.handle, els.head].forEach(function (el) {
      if (!el) return;
      on(el, 'pointerdown', onDragStart);
      on(el, 'pointermove', onDragMove);
      on(el, 'pointerup', onDragEnd);
      on(el, 'pointercancel', onDragEnd);
    });

    if (els.hotline) on(els.hotline, 'click', onHotline);
    if (els.chatTile) on(els.chatTile, 'click', onChat);
    if (els.ask) wireAsk();
    if (els.appointment) on(els.appointment, 'click', onAppointment);
    if (els.kaufberater) on(els.kaufberater, 'click', onKaufberater);
    if (els.faq) on(els.faq, 'click', onFaq);
    if (els.dealer) on(els.dealer, 'click', onDealer);
    $$('.hh-foot__links a', root).forEach(function (a) { on(a, 'click', onFooterLink); });

    if (els.top) { on(els.top, 'click', onTop); els.top.hidden = false; }
    on(window, 'scroll', onScroll, { passive: true });
    measureFab();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureFab);
    on(window, 'resize', function () {
      measureFab();
      /* breakpoint change while open: re-evaluate modality */
      if (!state.open) return;
      var mobile = isMobile();
      els.scrim.hidden = !mobile;
      if (mobile) { els.panel.setAttribute('aria-modal', 'true'); if (!state.inerted.length) { lockScroll(); setInert(true); } }
      else { els.panel.removeAttribute('aria-modal'); if (state.inerted.length) { setInert(false); unlockScroll(); } }
    });
    if (els.nudgeClose) on(els.nudgeClose, 'click', dismissNudge);
    updateTop();
  }

  /* ---------- lifecycle ---------- */
  function init(el) {
    if (root) destroy();
    root = el || document.getElementById('helpHub');
    if (!root) return false;
    els = collectEls();
    if (!els.fab || !els.panel || !els.title) return false;
    cfg = readConfig();
    hoursSpec = parseHours(cfg.hours);
    render();
    updateStatus();
    wire();
    watchOverlays();
    /* launcher appears after DOMContentLoaded + 400 ms (spec §5) */
    later(function () { root.classList.add('is-ready'); }, 400);
    startNudge();
    return true;
  }
  function destroy() {
    if (!root) return;
    if (state.open) close({ immediate: true, restoreFocus: false });
    listeners.forEach(function (l) { l.target.removeEventListener(l.type, l.fn, l.opts); });
    listeners = [];
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(state.statusTimer);
    observers.forEach(function (o) { o.disconnect(); });
    observers = [];
    root.classList.remove('is-ready', 'is-open', 'is-closing', 'is-hidden', 'is-chat-open');
    root = null;
  }

  window.MetzlerHelpHub = {
    init: init,
    open: function (trigger) { if (root) open(trigger || 'api'); },
    close: function () { if (root) close(); },
    destroy: destroy,
    isOpen: function () { return !!state.open; },
    setUnread: function (n) { if (root) setUnread(n); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})(window, document);

/* ------------------------------------------------------------
   KI badge note (2026-10-14, owner: "remove the extra text").
   The Art. 50 / Datenschutz line is no longer shown by default;
   the KI badge toggles it as a small note. Esc / outside click
   close the note first, without closing the hub.
   ------------------------------------------------------------ */
(function () {
  'use strict';
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var badge = document.querySelector('#helpHub button.hh-ask__ki');
    var note = document.getElementById('hhAskLegal');
    if (!badge || !note) return;
    function set(open) {
      note.hidden = !open;
      badge.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    badge.addEventListener('click', function (e) { e.stopPropagation(); set(note.hidden); });
    note.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (!note.hidden) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !note.hidden) { e.stopImmediatePropagation(); e.preventDefault(); set(false); badge.focus(); }
    }, true);
    var panel = document.getElementById('hhPanel');
    if (panel && window.MutationObserver) {
      new MutationObserver(function () { if (panel.hidden) set(false); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    }
  });
})();
