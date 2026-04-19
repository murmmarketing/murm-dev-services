(() => {
  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Inject grain at runtime
  const grainSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(" + "#n" + ")'/></svg>";
  document.documentElement.style.setProperty('--grain', "url(\"data:image/svg+xml;utf8," + encodeURIComponent(grainSvg) + "\")");

  // ---------- Clock (Europe/Amsterdam) ----------
  const clockEl = document.getElementById('clock');
  const tzEl = document.getElementById('tz');
  function tickClock(){
    try {
      const now = new Date();
      const p = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        timeZoneName: 'short'
      }).formatToParts(now);
      const t = {};
      p.forEach(x => t[x.type] = x.value);
      if (clockEl) clockEl.innerHTML = '<b>Leiden</b>' + `${t.hour}:${t.minute}:${t.second}`;
      if (tzEl && t.timeZoneName) tzEl.textContent = t.timeZoneName;
    } catch(e){}
  }
  tickClock(); setInterval(tickClock, 1000);

  // ---------- Process dates ----------
  const today = new Date();
  const dateFmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
  document.querySelectorAll('.tl-step .date').forEach(el => {
    const off = parseInt(el.dataset.offset, 10) || 0;
    const d = new Date(today.getTime() + off * 86400000);
    el.textContent = dateFmt(d);
  });

  // ---------- Split-text reveal ----------
  const revs = document.querySelectorAll('.reveal');
  if (!prefersReduce && 'IntersectionObserver' in window){
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting){
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.01, rootMargin: '0px 0px -5% 0px' });
    revs.forEach((el, i) => {
      el.style.setProperty('--d', (i * 80) + 'ms');
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0){
        requestAnimationFrame(() => el.classList.add('in'));
      } else {
        io.observe(el);
      }
    });
  } else {
    revs.forEach(el => el.classList.add('in'));
  }

  // ---------- Custom cursor ----------
  const cursor = document.getElementById('cursor');
  if (cursor && matchMedia('(hover:hover)').matches && !prefersReduce){
    let x=0,y=0, tx=0, ty=0;
    window.addEventListener('mousemove', (e) => {
      tx = e.clientX; ty = e.clientY;
      cursor.style.opacity = 1;
    });
    window.addEventListener('mouseleave', () => { cursor.style.opacity = 0; });
    function loop(){
      x += (tx - x) * 0.25;
      y += (ty - y) * 0.25;
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    }
    loop();
    document.querySelectorAll('a, button, [data-cursor]').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('active'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('active'));
    });
  }

  // ---------- Hero refs ----------
  const heroTitle = document.getElementById('heroTitle');

  // ---------- Tilt ----------
  const tilt = document.getElementById('tilt');
  if (tilt && !prefersReduce && matchMedia('(hover:hover)').matches){
    const MAX = 4;
    tilt.addEventListener('mousemove', (e) => {
      const r = tilt.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width - 0.5;
      const cy = (e.clientY - r.top) / r.height - 0.5;
      const ry = cx * MAX * 2;
      const rx = -cy * MAX * 2;
      tilt.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    tilt.addEventListener('mouseleave', () => {
      tilt.style.transform = 'rotateX(0) rotateY(0)';
    });
  }

  // ---------- Timeline scroll fill ----------
  const timeline = document.getElementById('timeline');
  const tlFill = document.getElementById('timelineFill');
  const tlSteps = Array.from(document.querySelectorAll('.tl-step'));

  // ---------- Main scroll rAF ----------
  let ticking = false;
  function onScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sy = window.scrollY;
      const vh = window.innerHeight;

      if (heroTitle && !prefersReduce){
        heroTitle.style.transform = `translateY(${sy * 0.3 * -1}px)`;
      }

      if (timeline && tlFill){
        const r = timeline.getBoundingClientRect();
        const start = vh * 0.7;
        const end   = vh * 0.25;
        const total = r.height;
        let progress;
        if (r.top > start) progress = 0;
        else if (r.top + total < end) progress = 1;
        else progress = (start - r.top) / (start - end + total);
        progress = Math.min(1, Math.max(0, progress));
        const isMobile = window.matchMedia('(max-width: 1024px)').matches;
        if (isMobile){
          tlFill.style.height = (progress * 100) + '%';
          tlFill.style.width = '1px';
        } else {
          tlFill.style.width = (progress * 100) + '%';
          tlFill.style.height = '1px';
        }
        const active = Math.floor(progress * tlSteps.length + 0.0001);
        tlSteps.forEach((s, i) => s.classList.toggle('on', i <= active - 0 && progress * tlSteps.length >= i + 0.25));
        if (progress > 0.05) tlSteps[0].classList.add('on');
      }

      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Cursor: text-mode on serif headline hover ----------
  if (cursor && matchMedia('(hover:hover)').matches && !prefersReduce){
    document.querySelectorAll('.hero-title, .svc-card h3, .work-row .name, .case-title, .cta h2, .about-left h2, .wordmark').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('text'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('text'));
    });
  }

  // ---------- Word-split helper ----------
  function splitIntoWords(el){
    if (el.dataset.split === 'done') return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const frag = document.createDocumentFragment();
      const parts = n.nodeValue.split(/(\s+)/);
      parts.forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)){
          frag.appendChild(document.createTextNode(part));
        } else {
          const w = document.createElement('span');
          w.className = 'w';
          const i = document.createElement('i');
          i.textContent = part;
          w.appendChild(i);
          frag.appendChild(w);
        }
      });
      n.parentNode.replaceChild(frag, n);
    });
    el.querySelectorAll('.w > i').forEach((inner, idx) => {
      inner.style.setProperty('--d', (idx * 50) + 'ms');
    });
    el.dataset.split = 'done';
  }

  const splitTargets = document.querySelectorAll('.proc-head h2, .svc-head h2, .about-left h2, .work-head h2, .cta h2, .nl-body h2, .case-title');
  splitTargets.forEach(el => {
    el.classList.add('split');
    splitIntoWords(el);
  });

  // ---------- Generic in-view observer ----------
  if (!prefersReduce && 'IntersectionObserver' in window){
    const inView = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting){
          e.target.classList.add('in');
          inView.unobserve(e.target);
        }
      });
    }, { threshold: [0, 0.05, 0.15], rootMargin: '0px 0px -5% 0px' });

    document.querySelectorAll('.split, .rise, .sec-rule, .draw-rule, .nl-tags, .wordmark').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.95 && r.bottom > 0){
        requestAnimationFrame(() => el.classList.add('in'));
      } else {
        inView.observe(el);
      }
    });
    const wmEl = document.getElementById('wordmark');
    if (wmEl){
      const wmObs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting){ wmEl.classList.add('in'); wmObs.disconnect(); }
        });
      }, { threshold: 0, rootMargin: '0px 0px -5% 0px' });
      wmObs.observe(wmEl);
    }
  } else {
    document.querySelectorAll('.split, .rise, .sec-rule, .draw-rule, .nl-tags, .wordmark').forEach(el => el.classList.add('in'));
  }

  // ---------- NL tags stagger ----------
  document.querySelectorAll('.nl-tags .nl-tag').forEach((el, i) => {
    el.style.setProperty('--d', (i * 80) + 'ms');
  });

  // ---------- Footer wordmark: letter-split ----------
  const wm = document.getElementById('wordmark');
  if (wm){
    wm.querySelectorAll('span[data-word]').forEach((line, li) => {
      const txt = line.dataset.word;
      line.innerHTML = '';
      [...txt].forEach((ch, i) => {
        const s = document.createElement('span');
        s.className = 'ch';
        if (ch === '·') s.classList.add('dot');
        s.textContent = ch;
        s.style.setProperty('--d', (li * 240 + i * 55) + 'ms');
        line.appendChild(s);
      });
    });
  }

  // ---------- GPS scramble on load ----------
  const coordEl = document.querySelector('[data-coord] b');
  if (coordEl && !prefersReduce){
    const finalText = coordEl.textContent;
    const mutable = finalText.split('');
    const digitIdx = [];
    mutable.forEach((c, i) => { if (/\d/.test(c)) digitIdx.push(i); });
    const duration = 900;
    const start = performance.now();
    function scramble(now){
      const p = Math.min(1, (now - start) / duration);
      const lock = Math.floor(p * digitIdx.length);
      const out = finalText.split('');
      for (let k = lock; k < digitIdx.length; k++){
        out[digitIdx[k]] = String(Math.floor(Math.random() * 10));
      }
      coordEl.textContent = out.join('');
      if (p < 1) requestAnimationFrame(scramble);
      else coordEl.textContent = finalText;
    }
    requestAnimationFrame(scramble);
  }

  // ---------- 15,000 count-up on enter viewport ----------
  const bignum = document.querySelector('.bignum');
  if (bignum && !prefersReduce){
    const numEl = bignum.querySelector('.num');
    const target = 15000;
    let done = false;
    const trigger = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !done){
          done = true;
          const dur = 1200;
          const t0 = performance.now();
          function step(t){
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(2, -10 * p);
            const v = Math.floor(eased * target);
            const str = v.toLocaleString('en-US');
            if (v < 1000){
              numEl.innerHTML = `<span class="italic">${v}</span>`;
            } else {
              const commaIdx = str.indexOf(',');
              const head = str.slice(0, commaIdx);
              const tail = str.slice(commaIdx + 1);
              numEl.innerHTML =
                `<span class="italic">${head}</span>` +
                `<span class="comma">,</span>` +
                `${tail}`;
            }
            if (p < 1) requestAnimationFrame(step);
            else {
              numEl.innerHTML = `<span class="italic">15</span><span class="comma">,</span>000`;
              bignum.classList.add('counted');
            }
          }
          requestAnimationFrame(step);
          trigger.unobserve(bignum);
        }
      });
    }, { threshold: 0.3 });
    trigger.observe(bignum);
  }

  // ---------- Service card 3D tilt (mousemove) ----------
  if (!prefersReduce && matchMedia('(hover:hover)').matches){
    document.querySelectorAll('.svc-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width - 0.5;
        const cy = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateX(${-cy * 2}deg) rotateY(${cx * 2}deg) translateZ(0)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'rotateX(0) rotateY(0)';
      });
    });
  }

  // ---------- Hex artifact interaction ----------
  const hexSw = document.getElementById('hexSw');
  const hexCode = document.getElementById('hexCode');
  if (hexSw && hexCode){
    const palette = [
      { hex: '#FF6B3D', label: 'Primary · Coral' },
      { hex: '#FFD66B', label: 'Accent · Gold' },
      { hex: '#F4EFE6', label: 'Ink · Paper' },
      { hex: '#0C0C0C', label: 'Ground · Black' },
    ];
    let idx = 0;
    hexSw.parentElement.addEventListener('click', () => {
      idx = (idx + 1) % palette.length;
      const p = palette[idx];
      hexSw.style.background = p.hex;
      hexCode.textContent = p.hex;
      hexCode.parentElement.querySelector('.k').textContent = p.label;
    });
  }

  // ---------- Extend main scroll loop ----------
  const coordBlock = document.querySelector('.hero-coord');
  function extraScroll(){
    const sy = window.scrollY;
    const vh = window.innerHeight;
    if (bignum){
      const r = bignum.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const dist = Math.abs(center - vh / 2);
      const norm = Math.max(0, 1 - dist / vh);
      const s = 1 + norm * 0.04;
      if (!bignum.matches(':hover')){
        bignum.style.transform = `scale(${s.toFixed(4)})`;
      }
    }
    if (coordBlock && !prefersReduce){
      const p = Math.min(1, Math.max(0, sy / vh));
      coordBlock.style.transform = `translateY(${p * -vh * 0.15}px)`;
    }
  }
  window.addEventListener('scroll', extraScroll, { passive: true });
  extraScroll();
})();
