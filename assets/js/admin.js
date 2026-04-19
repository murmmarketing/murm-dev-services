(() => {
  const prefersReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'include', ...opts });
    if (res.status === 401) { location.replace('/admin/login?next=' + encodeURIComponent(location.pathname + location.hash)); throw new Error('401'); }
    return res;
  }
  async function apiJson(path, opts) { const r = await api(path, opts); return r.json(); }

  // ---------- Utilities ----------
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    } catch { return iso; }
  }
  function fmtPhoneNL(raw) {
    if (!raw) return '—';
    let s = String(raw).replace(/[^\d]/g, '');
    if (s.startsWith('31') && s.length === 11) s = '0' + s.slice(2);
    if (s.length === 10 && s.startsWith('06')) return '06 ' + s.slice(2, 10);
    if (s.length === 10) return s.slice(0,3) + ' ' + s.slice(3);
    return raw;
  }
  function truncate(s, n) { return s && s.length > n ? s.slice(0, n-1) + '…' : (s || ''); }
  function scoreClass(n) { const v = Number(n)||0; return v>=85?'s-high':v>=75?'s-med':'s-low'; }
  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1800); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- Clock ----------
  function tickClock() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone:'Europe/Amsterdam', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
      }).formatToParts(new Date()).reduce((a,p)=>(a[p.type]=p.value,a),{});
      $('#clock').innerHTML = '<b>Leiden</b>' + `${parts.hour}:${parts.minute}:${parts.second}`;
    } catch {}
  }
  setInterval(tickClock, 1000); tickClock();
  $('#sessionStart').textContent = 'started ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});

  // ---------- Observer for section rule draw-in ----------
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: 0.05 });
  $$('.sec-label').forEach(el => obs.observe(el));

  // ---------- Active nav anchor ----------
  const navLinks = $$('.subnav a');
  const sections = ['overview','leads','site','tools'].map(id => document.getElementById(id));
  function syncNav() {
    const y = scrollY + 100;
    let current = 'overview';
    sections.forEach(s => { if (s && s.offsetTop <= y) current = s.id; });
    navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + current));
  }
  addEventListener('scroll', syncNav, { passive:true });

  // ---------- Metrics + count-up ----------
  function countUp(el, target) {
    if (prefersReduce || !target) { el.textContent = String(target || 0); return; }
    const t0 = performance.now(); const dur = 1000;
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(2, -10 * p);   // easeOutExpo, matches index.html
      el.textContent = Math.floor(eased * target).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step); else el.textContent = target.toLocaleString('en-US');
    }
    requestAnimationFrame(step);
  }
  function renderDelta(el, curr, prev) {
    const delta = curr - prev;
    if (delta === 0) { el.textContent = '—'; el.className = 'd'; return; }
    const sign = delta > 0 ? '+' : '';
    el.textContent = `${sign}${delta} vs prev week`;
    el.className = 'd ' + (delta > 0 ? 'up' : 'down');
  }
  async function loadMetrics() {
    try {
      const { stats } = await apiJson('/api/admin/metrics');
      const pairs = {
        new: stats.new_this_week, outreach: stats.outreach_sent_this_week,
        replies: stats.replies_this_week, demos: stats.demos_this_week,
      };
      Object.entries(pairs).forEach(([key, v]) => {
        const el = document.querySelector(`[data-stat="${key}"]`);
        const dEl = document.querySelector(`[data-delta="${key}"]`);
        if (el && v) { el.dataset.countTo = v.current; countUp(el, v.current); renderDelta(dEl, v.current||0, v.previous||0); }
      });
      $('#lastSync').textContent = stats.last_sync ? fmtDate(stats.last_sync) + ' · ' + new Date(stats.last_sync).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'never';
    } catch (e) { console.warn('metrics:', e.message); }
  }

  // ---------- State ----------
  const state = {
    source: localStorage.getItem('admin:tab') || 'local',
    page: 1, limit: 50,
    q: '', status: '', city: '', type: '', minScore: 0,
    cache: { local: null, shopify: null, demos: null }, // full lists
  };

  // ---------- Tabs ----------
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const src = tab.dataset.source;
      if (src === state.source) return;
      $$('.tab').forEach(t => { t.classList.remove('on'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('on'); tab.setAttribute('aria-selected','true');
      state.source = src; state.page = 1;
      localStorage.setItem('admin:tab', src);
      loadAndRender();
    });
  });

  // ---------- Filters ----------
  $('#qInput').addEventListener('input', debounce((e) => { state.q = e.target.value.toLowerCase().trim(); state.page = 1; renderTable(); }, 300));
  $('#statusF').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; renderTable(); });
  $('#cityF').addEventListener('change', (e) => { state.city = e.target.value; state.page = 1; renderTable(); });
  $('#typeF').addEventListener('change', (e) => { state.type = e.target.value; state.page = 1; renderTable(); });
  $('#scoreF').addEventListener('change', (e) => { state.minScore = Number(e.target.value) || 0; state.page = 1; renderTable(); });
  $('#clearFilters').addEventListener('click', () => {
    state.q = state.status = state.city = state.type = ''; state.minScore = 0; state.page = 1;
    $('#qInput').value = ''; $('#statusF').value = ''; $('#cityF').value = ''; $('#typeF').value = ''; $('#scoreF').value = '';
    renderTable();
  });
  $('#prevPage').addEventListener('click', () => { if (state.page > 1) { state.page--; renderTable(); scrollTo({top:sections[1].offsetTop-60,behavior:'smooth'}); } });
  $('#nextPage').addEventListener('click', () => { state.page++; renderTable(); scrollTo({top:sections[1].offsetTop-60,behavior:'smooth'}); });

  // ---------- Load + render ----------
  async function loadAndRender() {
    const { source } = state;
    const rowsBox = $('#tableRows'); rowsBox.innerHTML = '';
    $('#leadsSub').textContent = 'Loading ' + source + '…';
    if (source === 'demos') {
      // No /api/leads/list?source=demos yet, render empty state
      state.cache.demos = [];
    } else if (!state.cache[source]) {
      try {
        const data = await apiJson(`/api/leads/list?source=${source}&limit=999999`);
        state.cache[source] = data.leads || [];
        // Also count for tab badges
      } catch { state.cache[source] = []; }
    }
    // Always refresh all tab counts from caches + a light ping for sources not cached
    ['local','shopify','demos'].forEach(s => {
      const el = document.querySelector(`[data-cnt="${s}"]`);
      const cache = state.cache[s];
      el.textContent = cache ? String(cache.length) : '—';
    });
    // Populate city + type dropdowns from current source
    populateDropdowns(state.cache[source] || []);
    renderTable();
  }

  function populateDropdowns(rows) {
    const cities = new Set(), types = new Set();
    rows.forEach(r => { if (r.area || r.city) cities.add(r.area || r.city); if (r.business_type) types.add(r.business_type); });
    const cityF = $('#cityF'), typeF = $('#typeF');
    cityF.innerHTML = '<option value="">All cities</option>' + [...cities].sort().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    typeF.innerHTML = '<option value="">All types</option>' + [...types].sort().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    if (state.city) cityF.value = state.city;
    if (state.type) typeF.value = state.type;
  }

  function applyFilters(rows) {
    const { q, status, city, type, minScore } = state;
    return rows.filter(r => {
      if (q) {
        const hay = [r.name, r.area, r.city, r.phone, r.email, r.contact_email].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && (r._status || 'new') !== status) return false;
      if (city && (r.area || r.city) !== city) return false;
      if (type && r.business_type !== type) return false;
      if (minScore && Number(r.lead_score || 0) < minScore) return false;
      return true;
    });
  }

  function renderTable() {
    const { source, page, limit } = state;
    const rows = state.cache[source] || [];
    const filtered = applyFilters(rows);
    const total = filtered.length;
    const start = (page - 1) * limit;
    const slice = filtered.slice(start, start + limit);

    $('#leadsSub').textContent = total === rows.length
      ? `${total} rows`
      : `${total} of ${rows.length} rows · filtered`;

    const container = $('#tableWrap');
    const empty = $('#emptyState');
    const rowsBox = $('#tableRows');

    // Demos + Shopify empty-state treatment
    if (source === 'demos' && rows.length === 0) {
      container.style.display = 'none'; empty.style.display = 'block';
      empty.innerHTML = `No demos generated yet.<br><span class="hint">Run ~/murmweb-demos/scripts/generate.js when you have one.</span>`;
      renderPagination(0); return;
    }
    if (source === 'shopify' && rows.length === 0) {
      container.style.display = 'none'; empty.style.display = 'block';
      empty.innerHTML = `No Shopify leads synced yet.<br><span class="hint">Run ~/murmweb-leads/ cli to populate,<br>or sync existing DB via the Tools section.</span>`;
      renderPagination(0); return;
    }
    if (total === 0) {
      container.style.display = 'none'; empty.style.display = 'block';
      empty.innerHTML = `No results for the current filters.<br><span class="hint">Clear filters to see all ${rows.length} leads.</span>`;
      renderPagination(0); return;
    }

    container.style.display = 'grid'; empty.style.display = 'none';
    rowsBox.innerHTML = slice.map(r => rowHtml(r)).join('');
    $$('#tableRows [data-hash]').forEach(row => {
      row.addEventListener('click', () => openDrawer(row.dataset.hash));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(row.dataset.hash); }
      });
    });
    renderPagination(total);
  }

  function rowHtml(r) {
    const status = r._status || 'new';
    const score = Number(r.lead_score || 0);
    const city = r.area || r.city || '';
    return `
      <div class="row" data-hash="${r._hash}" tabindex="0" role="row">
        <div class="td center" role="cell"><span class="dot ${scoreClass(score)}" aria-label="score ${score}"></span></div>
        <div class="td" role="cell"><span class="name">${escapeHtml(r.name || '—')}</span></div>
        <div class="td x-mobile" role="cell">${escapeHtml(city)}</div>
        <div class="td x-mobile" role="cell">${escapeHtml(r.business_type || '')}</div>
        <div class="td x-mobile center" role="cell">${score || '—'}</div>
        <div class="td x-mobile" role="cell">${escapeHtml(fmtPhoneNL(r.phone))}</div>
        <div class="td x-mobile" role="cell">${escapeHtml(truncate(r.email || r.contact_email || '', 30))}</div>
        <div class="td" role="cell"><span class="badge ${status}">${status}</span></div>
        <div class="td x-mobile" role="cell" style="color:var(--ink-4)">→</div>
      </div>
    `;
  }

  function renderPagination(total) {
    const { page, limit } = state;
    const end = Math.min(page*limit, total);
    const start = total === 0 ? 0 : (page-1)*limit + 1;
    $('#pageInfo').textContent = total === 0 ? 'No results' : `Showing ${start}-${end} of ${total}`;
    $('#prevPage').disabled = page <= 1;
    $('#nextPage').disabled = end >= total;
  }

  // ---------- Drawer ----------
  const drawer = $('#drawer');
  const drawerBody = $('#drawerBody');
  let activeHash = null;

  async function openDrawer(hash) {
    const lead = (state.cache[state.source] || []).find(r => r._hash === hash);
    if (!lead) return;
    activeHash = hash;
    // Lazy-fetch notes + canonical status for this lead
    if (!lead._notes) {
      try {
        const d = await apiJson('/api/leads/detail?hash=' + encodeURIComponent(hash));
        lead._notes = d.notes || [];
        lead._status = d.status || lead._status || 'new';
      } catch { lead._notes = []; }
    }
    drawerBody.innerHTML = drawerHtml(lead);
    wireDrawer(lead);
    if (!drawer.open) drawer.showModal();
  }

  function closeDrawer() { drawer.close(); activeHash = null; }

  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
  drawer.addEventListener('cancel', () => { /* native Escape */ });

  function drawerHtml(r) {
    const status = r._status || 'new';
    const statuses = ['new','contacted','replied','booked','won','lost'];
    const issues = r.issues ? String(r.issues).split(/;\s*/).filter(Boolean) : [];
    const notesHtml = (r._notes || []).map(n => `<div class="note"><div class="ts">${fmtDate(n.ts)}</div>${escapeHtml(n.text)}</div>`).join('') || '<div class="note" style="opacity:0.5">No notes yet.</div>';
    return `
      <div class="drawer-head">
        <div>
          <h3>${escapeHtml(r.name || '—')}</h3>
          <div class="meta">${escapeHtml(r.area || r.city || '—')}${r.business_type ? ' · ' + escapeHtml(r.business_type) : ''}</div>
        </div>
        <button class="close" id="drawerClose" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="drawer-stats">
        <div class="s">Score <b>${r.lead_score || '—'}</b></div>
        <div class="s">Rating <b>${r.rating || '—'}</b></div>
        <div class="s">Reviews <b>${r.reviews || '—'}</b></div>
      </div>

      ${r.phone ? `<div class="drawer-field"><div class="label">Phone</div><div class="val"><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(fmtPhoneNL(r.phone))}</a><button class="copy-btn" data-copy="${escapeHtml(r.phone)}" aria-label="Copy phone"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div></div>` : ''}
      ${(r.email || r.contact_email) ? `<div class="drawer-field"><div class="label">Email</div><div class="val"><a href="mailto:${escapeHtml(r.email || r.contact_email)}">${escapeHtml(r.email || r.contact_email)}</a><button class="copy-btn" data-copy="${escapeHtml(r.email || r.contact_email)}" aria-label="Copy email"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div></div>` : ''}
      ${r.address ? `<div class="drawer-field"><div class="label">Address</div><div class="val">${escapeHtml(r.address)}</div></div>` : ''}

      <div class="drawer-links">
        ${r.website ? `<a class="drawer-btn" href="${escapeHtml(r.website)}" target="_blank" rel="noopener noreferrer">Website <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></a>` : ''}
        ${r.maps_url ? `<a class="drawer-btn" href="${escapeHtml(r.maps_url)}" target="_blank" rel="noopener noreferrer">Maps <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></a>` : ''}
      </div>

      <div class="drawer-field">
        <div class="label">Status</div>
        <div class="status-row" role="radiogroup">
          ${statuses.map(s => `<button class="status-btn ${s === status ? 'active' : ''}" data-status="${s}" type="button" role="radio" aria-checked="${s === status}">${s}</button>`).join('')}
        </div>
      </div>

      ${issues.length ? `<div class="drawer-field"><div class="label">Flagged issues</div><div class="val" style="flex-wrap:wrap">${issues.map(i => `<span style="border:1px solid var(--rule);padding:3px 8px;font-size:10px;color:var(--ink-3)">${escapeHtml(i)}</span>`).join('')}</div></div>` : ''}

      <div class="notes">
        <div class="label" style="font-family:var(--mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-4);margin-bottom:8px">Notes</div>
        <div class="notes-list">${notesHtml}</div>
        <textarea id="noteText" placeholder="Add a note…"></textarea>
        <button class="drawer-btn" id="addNote" type="button">Add note</button>
      </div>

      <details class="drawer-raw">
        <summary>Raw row data</summary>
        <pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>
      </details>
    `;
  }

  function wireDrawer(lead) {
    $('#drawerClose').addEventListener('click', closeDrawer);
    $$('.copy-btn', drawerBody).forEach(b => b.addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(b.dataset.copy); toast('Copied');
    }));
    $$('.status-btn', drawerBody).forEach(b => b.addEventListener('click', async () => {
      const newStatus = b.dataset.status;
      // Optimistic
      $$('.status-btn', drawerBody).forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked','false'); });
      b.classList.add('active'); b.setAttribute('aria-checked','true');
      lead._status = newStatus;
      // Update in cache + table row badge
      const badge = document.querySelector(`[data-hash="${lead._hash}"] .badge`);
      if (badge) { badge.className = 'badge ' + newStatus; badge.textContent = newStatus; }
      try {
        await api('/api/leads/update', {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hash: lead._hash, status: newStatus }),
        });
        toast('Status → ' + newStatus);
      } catch { toast('Update failed'); }
    }));
    $('#addNote').addEventListener('click', async () => {
      const text = $('#noteText').value.trim();
      if (!text) return;
      try {
        await api('/api/leads/update', {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hash: lead._hash, note: text }),
        });
        lead._notes = lead._notes || []; lead._notes.push({ ts: new Date().toISOString(), text });
        $('#noteText').value = '';
        drawerBody.innerHTML = drawerHtml(lead); wireDrawer(lead);
        toast('Note added');
      } catch { toast('Note save failed'); }
    });
  }

  // Arrow-key navigation through table rows
  addEventListener('keydown', (e) => {
    if (drawer.open) return;
    if (!['ArrowDown','ArrowUp'].includes(e.key)) return;
    const rows = $$('#tableRows .row');
    if (!rows.length) return;
    const focused = document.activeElement;
    let idx = rows.indexOf(focused);
    if (idx === -1) idx = 0; else idx = Math.max(0, Math.min(rows.length-1, idx + (e.key === 'ArrowDown' ? 1 : -1)));
    rows[idx].focus();
    e.preventDefault();
  });

  // ---------- Tools ----------
  $('#toolSync').addEventListener('click', () => toast('Sync endpoint not implemented yet — run ~/local_leads/sync_to_admin.sh manually'));
  $('#toolExport').addEventListener('click', () => {
    const url = `/api/leads/export?source=${state.source}&format=csv`;
    window.open(url, '_blank');
  });
  $('#exportCsv').addEventListener('click', () => {
    const url = `/api/leads/export?source=${state.source}&format=csv`;
    window.open(url, '_blank');
  });
  $('#refreshBtn').addEventListener('click', () => { state.cache[state.source] = null; loadAndRender(); });
  $('#toolClearCache').addEventListener('click', async () => {
    if (!confirm('Clear the /api/admin/metrics KV cache? Next metrics fetch will recompute.')) return;
    // There's no explicit endpoint; triggering a status PATCH invalidates it server-side.
    toast('Cache will invalidate on next write');
  });

  // ---------- Logout ----------
  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method:'POST' }); } catch {}
    location.replace('/admin/login');
  });

  // ---------- Boot ----------
  loadMetrics();
  loadAndRender();
  syncNav();
})();
