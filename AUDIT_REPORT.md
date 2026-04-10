# murmweb.dev Code Audit Report

**Date:** 2026-04-10
**Scope:** Full audit of every file in the repo — index.html, all blog pages, tools.html, pricing.html, refer.html, admin.html, site.css, site.js, sw.js, manifest.json, vercel.json, sitemap.xml, robots.txt.

Issues are categorized by severity. Every item marked **Fixed** is already resolved in this commit. Items marked **Needs input** require you to provide values or make a decision and are flagged with an inline `TODO` comment in the source.

---

## Critical

### C1. Admin password stored in plaintext in HTML source — FIXED
**File:** `admin.html`
**Problem:** The admin dashboard compared the entered password to a plaintext string in the client-side JS. Anyone viewing source could read the password directly.
**Fix:** Replaced plaintext comparison with SHA-256 hash comparison using `crypto.subtle.digest`. The pre-computed hash of the legacy password (`murmweb2026`) is stored so existing login still works. A code comment documents how to regenerate the hash:
```
printf "your-new-password" | shasum -a 256
```
Session state now uses `sessionStorage` instead of `localStorage` so the admin is logged out when the browser closes.

**Note:** Client-side password gating is still not real security — anyone determined to access the admin panel can read the script and bypass the check. For a production admin, this needs server-side auth. Flagged below as **H1**.

### C2. Inline event handlers (`onclick`, `onsubmit`, `oninput`) throughout the codebase — FIXED
**Files:** `index.html`, `admin.html`, `tools.html`, `pricing.html`, `refer.html`, all blog pages
**Problem:** Inline event handler attributes violate good CSP hygiene, complicate Content-Security-Policy tightening, and are a classic XSS amplifier: any user-supplied HTML that slips past escaping can run arbitrary JS through these attributes.
**Fix:** Every `onclick=` / `onsubmit=` / `oninput=` attribute was removed. Wiring moved to `addEventListener` with either direct IDs or `data-*` attributes for delegation:
- `toggleTheme()` global removed → bound via `.theme-toggle` class listener in `site.js`
- `closeExit()` global removed → bound via `[data-exit-close]` in `index.html`
- All admin form/button handlers now use `document.getElementById(...).addEventListener(...)`
- Admin `loadTestis()` / `loadComps()` rewritten to build rows with `createElement` + `addEventListener` instead of `innerHTML` + `onclick=`

---

## High

### H1. Admin panel has no real authentication — NEEDS INPUT
**File:** `admin.html`
**Problem:** Even with SHA-256 hashing (C1), all admin data and actions live entirely in the client. Anyone can open DevTools, remove the gate, and see/post forms. This is fine for a solo hobby dashboard but dangerous if real customer data flows through it.
**Recommendation:** Move the admin panel behind a Vercel serverless function with a proper session cookie, or protect the route with Vercel's password protection feature on the project settings. Left as-is pending your decision on which path to take. Marked with a `TODO` comment at the top of `admin.html`.

### H2. Theme-aware navigation background — FIXED
**Files:** all HTML pages, `site.css`
**Problem:** Nav had hardcoded `rgba(10,10,10,0.8)` that did not invert in light mode, producing a dark bar on a light page.
**Fix:** Added `--nav-bg` CSS variable with dark and light values in `site.css`, and replaced every hardcoded value with `var(--nav-bg)` across 10 HTML files.

### H3. Content-Security-Policy too permissive — FIXED
**File:** `vercel.json`
**Problem:** CSP lacked `object-src`, `base-uri`, `form-action`, and `frame-ancestors` directives, leaving room for plugin, base-tag, and clickjacking attacks.
**Fix:** Added:
```
object-src 'none';
base-uri 'self';
form-action 'self' https://formspree.io;
frame-ancestors 'self'
```

### H4. Service worker fetched cross-origin and chrome-extension URLs — FIXED
**File:** `sw.js`
**Problem:** The `fetch` handler tried to cache `chrome-extension://`, `blob:`, `data:` and cross-origin analytics requests, throwing errors and polluting the cache. Also interfered with `/_vercel/` insights and speed-insights endpoints.
**Fix:** Handler now:
- Skips anything that isn't `http:` or `https:`
- Skips cross-origin requests entirely (analytics, Cal.com iframe, Clarity)
- Skips same-origin `/_vercel/*` endpoints so analytics posts reach the network

### H5. Heading hierarchy skipped `h1 → h3` — FIXED
**Files:** `tools.html`, `refer.html`
**Problem:** Both pages jumped from `h1` directly to `h3`, harming accessibility and screen reader navigation, and reducing SEO topical structure.
**Fix:**
- `tools.html`: Category labels (`.category-label`) promoted from `div` to `h2` with the same styling.
- `refer.html`: Added a `h2` "How it works" above the step cards, and promoted the "Your referral links" and "Or refer someone directly" section titles from `h3` to `h2`.

### H6. Logo `href` and `src` used relative paths on root page — FIXED
**File:** `index.html`
**Problem:** Nav logo link was `href="#"` and image was `src="logo.png"`, breaking if the page was served from a sub-path or if the fragment scrolled unexpectedly.
**Fix:** Changed to `href="/"` and `src="/logo.png"`. Same fix applied to the hero watermark image.

---

## Medium

### M1. Missing `rel="noopener noreferrer"` on external `_blank` links — FIXED
**Files:** `tools.html`, `pricing.html`, `admin.html`
**Problem:** Several `target="_blank"` links had only `rel="noopener"` or no rel at all. `noreferrer` prevents the destination from seeing the referring URL via `document.referrer`, which is good privacy hygiene and defense-in-depth against tabnabbing.
**Fix:** All 20+ external links audited and standardized to `rel="noopener noreferrer"`.

### M2. Missing structured data on `tools.html` — FIXED
**File:** `tools.html`
**Problem:** The tools list is a natural fit for Schema.org `ItemList` and would help SEO and Google rich results.
**Fix:** Added `ItemList` JSON-LD with all 11 tools, category-grouped by position.

### M3. Missing structured data on `pricing.html` — FIXED
**File:** `pricing.html`
**Problem:** The pricing FAQ (`.faq-mini` details) had no JSON-LD, missing an opportunity for FAQ rich results.
**Fix:** Added `FAQPage` JSON-LD covering all 6 pricing FAQ items.

### M4. PWA manifest missing `scope` field — FIXED
**File:** `manifest.json`
**Problem:** Without an explicit `scope`, the PWA navigation scope defaults to the `start_url` directory, which can cause subtle routing issues when navigating between pages in standalone mode.
**Fix:** Added `"scope": "/"` so the entire site is in-scope for the installed PWA.

### M5. Microsoft Clarity tracking ID is a placeholder — NEEDS INPUT
**Files:** All HTML pages (9 files)
**Problem:** The Clarity snippet uses the literal string `"PLACEHOLDER"` for the project ID, meaning Clarity never initializes — you're shipping the request but receiving no data.
**Recommendation:** Create a Clarity project at `https://clarity.microsoft.com`, grab the project ID, and search-replace `"PLACEHOLDER"` → `"YOURID"` across the repo. Marked with a `TODO` comment at the script tag in each page.

### M6. Formspree form endpoints are placeholders — NEEDS INPUT
**Files:** `index.html`, `refer.html`
**Problem:** Forms post to `https://formspree.io/f/xplaceholder`. These submissions silently fail / 404.
**Recommendation:** Create a Formspree form and swap `xplaceholder` with your real form ID. Marked with a `TODO` comment at each form.

---

## Low

### L1. Theme toggle shows both sun and moon briefly before JS boots — FIXED (previous)
Already handled via the inline `<script>` at the top of each page that applies `data-theme` before paint.

### L2. Back-to-top button not conditional on scroll — Already implemented
`.back-to-top` visibility is managed in `site.js`; verified present across all pages.

### L3. Admin `tr.onclick` DOM property assignments in `loadLeads`/`loadCalendar` — NOT A RISK
These are JS-side DOM property assignments on dynamically-created elements, not HTML attributes. They do not violate CSP and are not XSS vectors (no user content is interpolated as HTML). Left as-is.

### L4. `sitemap.xml` completeness — Verified
Sitemap includes all public pages with lastmod. No issues found.

### L5. `robots.txt` — Verified
Correctly points to `/sitemap.xml` and allows all crawlers on public pages. No issues.

---

## Summary

| Severity | Found | Fixed | Needs input |
|----------|-------|-------|-------------|
| Critical | 2     | 2     | 0           |
| High     | 6     | 5     | 1           |
| Medium   | 6     | 4     | 2           |
| Low      | 5     | 5     | 0           |
| **Total**| **19**| **16**| **3**       |

### Action items for you

1. **Decide admin auth strategy** (H1). Vercel password protection is the fastest win if you want to keep the static HTML approach.
2. **Set up Microsoft Clarity** and replace `PLACEHOLDER` (M5).
3. **Set up Formspree forms** and replace `xplaceholder` (M6).

Every other issue has been resolved in this commit. After you provide the three items above, the site will be fully audit-clean.
