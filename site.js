/* Shared site enhancements: theme toggle, back-to-top, page transitions, analytics */
(function(){
  // ── Theme Toggle ──────────────────────────
  var saved = localStorage.getItem('theme');
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  var initial = saved || (prefersLight ? 'light' : 'dark');
  if (initial === 'light') document.documentElement.setAttribute('data-theme', 'light');

  window.toggleTheme = function() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'light' ? 'dark' : 'light';
    if (next === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', next);
  };

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

  // ── Page Transitions ──────────────────────────
  document.body.classList.add('page-entering');
  setTimeout(function(){ document.body.classList.remove('page-entering'); }, 320);

  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    // Skip external, anchors, mailto, tel, new tab, download
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http') || a.target === '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    document.body.classList.add('page-leaving');
    setTimeout(function(){ window.location.href = href; }, 300);
  });

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
})();
