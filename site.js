/* Shared site enhancements: theme toggle, back-to-top, page transitions, analytics */
(function(){
  // ── Theme Toggle ──────────────────────────
  var saved = localStorage.getItem('theme');
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  var initial = saved || (prefersLight ? 'light' : 'dark');
  if (initial === 'light') document.documentElement.setAttribute('data-theme', 'light');

  function swapLogo(theme) {
    var src = theme === 'light' ? '/logo-light.png' : '/logo-dark.png';
    document.querySelectorAll('.site-logo').forEach(function(img) {
      img.setAttribute('src', src);
    });
  }
  swapLogo(initial);

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'light' ? 'dark' : 'light';
    if (next === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', next);
    swapLogo(next);
  }
  // Wire up any .theme-toggle buttons on the page (no inline handler needed).
  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.addEventListener('click', toggleTheme);
  });

  // ── Back to Top ──────────────────────────
  var btt = document.querySelector('.back-to-top');
  if (btt) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 500) btt.classList.add('visible');
      else btt.classList.remove('visible');
    }, { passive: true });
    btt.addEventListener('click', function(e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Page Transitions (removed — caused black screen on back navigation) ──

  // ── Toast ──────────────────────────
  window.showToast = function(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){
      t.classList.remove('show');
      setTimeout(function(){ t.remove(); }, 300);
    }, 2000);
  };

  // ── Reading progress ──────────────────────────
  var rp = document.querySelector('.read-progress');
  if (rp) {
    window.addEventListener('scroll', function() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) rp.style.width = (window.scrollY / h * 100) + '%';
    }, { passive: true });
  }

  // ── Share buttons ──────────────────────────
  document.querySelectorAll('[data-share]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var type = btn.dataset.share;
      var url = window.location.href;
      var title = document.title;
      if (type === 'copy') {
        navigator.clipboard.writeText(url).then(function(){ window.showToast('Link copied!'); });
      } else if (type === 'twitter') {
        window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url), '_blank', 'noopener');
      } else if (type === 'linkedin') {
        window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url), '_blank', 'noopener');
      }
    });
  });

  // ── Service Worker ──────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }

  // ── Analytics: custom events ──────────────────────────
  // Fires into Vercel Web Analytics (window.va) and Microsoft Clarity.
  // Both are already loaded via index.html / page heads.
  function track(name, props) {
    try { if (window.va) window.va('event', { name: name, data: props || {} }); } catch (e) {}
    try { if (window.clarity) window.clarity('event', name); } catch (e) {}
  }

  // CTA clicks (delegated) — book call, pricing, email, whatsapp
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var inHero    = !!a.closest('.hero-ctas, .hero');
    var inFinal   = !!a.closest('.cta-section');
    var inNav     = !!a.closest('nav');
    var inPricing = !!a.closest('.pricing-card, .compare-section, .tier');
    var loc = inHero ? 'hero' : inFinal ? 'final_cta' : inNav ? 'nav' : inPricing ? 'pricing' : 'body';

    if (/cal\.com\/murmweb/.test(href))             track('cta_book_call',    { location: loc });
    else if (href.indexOf('/pricing') === 0)        track('cta_pricing',      { location: loc });
    else if (href.indexOf('mailto:') === 0)         track('cta_email_direct', { location: loc });
    else if (/wa\.me/.test(href))                   track('cta_whatsapp',     {});
  });

  // Form submissions
  document.querySelectorAll('form[action*="formspree"]').forEach(function(f) {
    f.addEventListener('submit', function() {
      if (f.hasAttribute('data-audit-form'))                   track('form_submit_audit',     {});
      else if (f.querySelector('input[name="their_email"]'))   track('form_submit_referral',  {});
      else                                                     track('form_submit_newsletter',{});
    });
  });

  // FAQ opens (homepage + pricing page)
  document.querySelectorAll('.faq-list details, .faq-mini details').forEach(function(d) {
    d.addEventListener('toggle', function() {
      if (!d.open) return;
      var s = d.querySelector('summary');
      track('faq_opened', { question: s ? (s.innerText || '').slice(0, 80) : '' });
    });
  });

  // Blog: article read complete (scrolled past 90% of page)
  if (/\/blog\/.+\.html$/.test(location.pathname)) {
    var readFired = false;
    window.addEventListener('scroll', function() {
      if (readFired) return;
      var h = document.documentElement;
      var ratio = (h.scrollTop + window.innerHeight) / h.scrollHeight;
      if (ratio > 0.9) {
        readFired = true;
        track('blog_read_complete', { slug: location.pathname });
      }
    }, { passive: true });
  }
})();
