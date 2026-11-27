/* ============================================================
   Variant B — "Ohne Cookies" (owner 2026-10-16). Prototype add-on.
   ?consent=denied  → the visitor declined the KI-Chat cookie (ai_chat_consent):
     - the Juna field in the hub is greyed out ("KI-Chat aktivieren" + lock),
     - a tap opens the shop's JTL consent confirmation (live: CM.openConfirmationModal('ai_chat_consent', cb)),
     - "Einmalig zustimmen" unlocks it for this page view, "Dauerhaft zustimmen" also for later page views
       (prototype: sessionStorage pv_ai_consent; live: the consent manager's local storage),
     - nothing reaches the chat before that: the field is disabled, the gate covers it, "Zum Gespräch" is hidden.
   Without the parameter (variant A) this file only renders the variant switcher.
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'pv_ai_consent';
  var params = new URLSearchParams(location.search);
  var variantB = params.get('consent') === 'denied';

  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); }
    catch (e) { return null; }
  }
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function h(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function isMobile() { return window.matchMedia('(max-width: 767px), (max-height: 500px)').matches; }
  function track(name, data) { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data || {})); }

  /* ---------- variant switcher (prototype only) ---------- */
  function urlFor(b) {
    var p = new URLSearchParams(location.search);
    p.delete('_v');
    if (b) p.set('consent', 'denied'); else p.delete('consent');
    var q = p.toString();
    return location.pathname + (q ? '?' + q : '') + location.hash;
  }
  function renderSwitch() {
    var nav = h('nav', { class: 'pv-switch', 'aria-label': 'Prototyp-Variante' });
    var a = h('a', { href: urlFor(false), 'aria-current': variantB ? null : 'page' }, '<b>A</b> Mit Cookies');
    var b = h('a', { href: urlFor(true), 'aria-current': variantB ? 'page' : null }, '<b>B</b> Ohne Cookies');
    /* B always starts declined, so the greyed state can be shown again after a "Dauerhaft zustimmen" */
    b.addEventListener('click', function () { ss(KEY, null); });
    nav.appendChild(a); nav.appendChild(b);
    document.body.appendChild(nav);
  }

  ready(function () {
    renderSwitch();
    if (!variantB) return;
    var root = document.getElementById('helpHub');
    var form = root && root.querySelector('.hh-ask__form');
    var field = root && root.querySelector('.hh-ask__field');
    if (!form || !field) return;
    if (ss(KEY) === '1') return;                                   /* "Dauerhaft zustimmen" earlier in this session */

    /* ---------- gated field ---------- */
    root.classList.add('is-consent-off');
    field.disabled = true;                                         /* hub focuses its title instead; Enter cannot send */
    field.setAttribute('aria-hidden', 'true');
    var gate = h('button', { type: 'button', class: 'hh-ask__gate', 'aria-haspopup': 'dialog', 'aria-controls': 'pvConsent',
      'aria-label': 'KI-Chat aktivieren – Datenschutz-Einstellungen öffnen' },
      '<span class="hh-ask__gate-label" aria-hidden="true">KI-Chat aktivieren</span>' +
      '<span class="hh-ask__gate-lock" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>');
    form.insertBefore(gate, field.nextSibling);
    gate.addEventListener('click', function () { openConfirm(gate); });

    /* ---------- consent confirmation (replica of live #consent-confirm, inside the hub root so the hub stays open) ---------- */
    var modal = h('div', { id: 'pvConsent', class: 'pv-consent', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pvConsentTitle', hidden: '' },
      '<div class="pv-consent__content">' +
        '<button type="button" class="pv-consent__close" aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<span class="pv-consent__title" id="pvConsentTitle">Datenschutz-Einstellungen</span>' +
        '<p>Sie möchten diesen Inhalt sehen? Aktivieren Sie den gewünschten Inhalt einmalig oder legen Sie eine dauerhafte Freigabe fest. ' +
        'Bei Zustimmung werden Daten beim genannten Drittanbieter abgerufen. Dabei werden unter Umständen Drittanbieter-Cookies auf Ihrem Endgerät gespeichert. ' +
        'Sie können diese Einstellungen jederzeit ändern (Fingerabdruck-Icon links unten). Weitere Details finden Sie in unserer ' +
        '<a href="#">Datenschutzerklärung</a>.</p>' +
        '<div class="pv-consent__info">' +
          '<a class="pv-consent__more" href="#pvConsentDesc" role="button" aria-expanded="false" aria-controls="pvConsentDesc">Weitere Informationen' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg></a>' +
          '<span class="pv-consent__head">KI-Chat</span>' +
          '<span class="pv-consent__help">KI-gestützter Chat zur Beantwortung Ihrer Fragen. Bei der Nutzung werden Ihre Chatnachrichten und technische Daten ' +
            '(z. B. IP-Adresse) von Botpress und dessen Dienstleistern verarbeitet, auch in den USA. Weitere Informationen finden Sie in unserer Datenschutzerklärung.</span>' +
          '<div class="pv-consent__help pv-consent__desc" id="pvConsentDesc" hidden>' +
            '<span>Beschreibung:</span><p>KI-gestützte Kundenberatung</p>' +
            '<span>Verarbeitende Firma:</span><p>Botpress, Inc.</p>' +
            '<span>Nutzungsbedingungen:</span><a href="#">Link</a>' +
          '</div>' +
        '</div>' +
        '<div class="pv-consent__btns">' +
          '<div><button type="button" class="pv-consent__btn pv-consent__btn--outline" data-consent="once">Einmalig zustimmen</button></div>' +
          '<div><button type="button" class="pv-consent__btn" data-consent="always">Dauerhaft zustimmen</button></div>' +
        '</div>' +
      '</div>');
    root.appendChild(modal);
    var content = modal.querySelector('.pv-consent__content');
    var more = modal.querySelector('.pv-consent__more');
    var desc = modal.querySelector('#pvConsentDesc');
    var returnTo = null;

    function focusables() {
      return Array.prototype.filter.call(content.querySelectorAll('a[href], button'), function (n) { return n.offsetParent !== null; });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeConfirm(); return; }
      if (e.key !== 'Tab') return;
      e.stopImmediatePropagation();                                 /* the hub's own Tab handling must not close it */
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function openConfirm(from) {
      returnTo = from;
      modal.hidden = false;
      void modal.offsetWidth;
      modal.classList.add('is-show');
      document.addEventListener('keydown', onKey, true);
      modal.querySelector('[data-consent="always"]').focus({ preventScroll: true });
      track('consent_prompt', { key: 'ai_chat_consent', source: 'helphub' });
    }
    function closeConfirm(after) {
      modal.classList.remove('is-show');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () { modal.hidden = true; }, 200);
      if (after) after(); else if (returnTo) returnTo.focus({ preventScroll: true });
    }
    function unlock(permanent) {
      if (permanent) ss(KEY, '1');
      track('consent_given', { key: 'ai_chat_consent', permanent: !!permanent, source: 'helphub' });
      closeConfirm(function () {
        root.classList.add('is-consent-unlocking');
        root.classList.remove('is-consent-off');
        field.disabled = false;
        field.removeAttribute('aria-hidden');
        if (gate.parentNode) gate.parentNode.removeChild(gate);
        setTimeout(function () { root.classList.remove('is-consent-unlocking'); }, 260);
        /* desktop: straight into the field; mobile: the next tap hands over to the Juna sheet as in variant A */
        if (!isMobile()) field.focus({ preventScroll: true });
        else { var t = root.querySelector('#hhTitle'); if (t) t.focus({ preventScroll: true }); }
      });
    }

    modal.querySelector('.pv-consent__close').addEventListener('click', function () { closeConfirm(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeConfirm(); });
    modal.querySelector('[data-consent="once"]').addEventListener('click', function () { unlock(false); });
    modal.querySelector('[data-consent="always"]').addEventListener('click', function () { unlock(true); });
    more.addEventListener('click', function (e) {
      e.preventDefault();
      var open = desc.hidden;
      desc.hidden = !open;
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    /* clicks inside the modal must not reach the hub's KI-note "outside click" handler */
    modal.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  });
})();
