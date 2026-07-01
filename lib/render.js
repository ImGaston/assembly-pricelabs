import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const tokens = require('../config/design-tokens.json');

// --- Design token shortcuts ---
const c = {
  // Brand
  cedar: tokens.color.brand.cedar.value,
  walnut: tokens.color.brand.walnut.value,
  tobacco: tokens.color.brand.tobacco.value,
  onyx: tokens.color.brand.onyx.value,
  moss: tokens.color.brand.moss.value,
  // Surfaces
  paper: tokens.color.surface.paper.value,
  stone: tokens.color.surface.stone.value,
  level0: tokens.color.surface.level0.value,
  level1: tokens.color.surface.level1.value,
  level2: tokens.color.surface.level2.value,
  level3: tokens.color.surface.level3.value,
  white: tokens.color.surface.white.value,
  outlineVariant: tokens.color.surface.outlineVariant.value,
  // Semantic
  success: tokens.color.semantic.success.value,
  successBg: tokens.color.semantic.successBg.value,
  warning: tokens.color.semantic.warning.value,
  warningBg: tokens.color.semantic.warningBg.value,
  error: tokens.color.semantic.error.value,
  errorBg: tokens.color.semantic.errorBg.value,
};

const f = {
  display: tokens.typography.fontFamily.display,
  body: tokens.typography.fontFamily.body,
  mono: tokens.typography.fontFamily.mono,
};

// --- Helpers ---

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrency(n) {
  if (n == null) return '\u2014';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function formatPercent(n) {
  if (n == null) return '\u2014';
  return Math.round(n) + '%';
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function performanceColor(value, benchmark) {
  if (value == null || benchmark == null || benchmark === 0) {
    return { color: c.walnut, bg: 'transparent' };
  }
  const ratio = value / benchmark;
  if (ratio >= 1.05) return { color: c.success, bg: c.successBg };
  if (ratio >= 0.95) return { color: c.warning, bg: c.warningBg };
  return { color: c.error, bg: c.errorBg };
}

function deltaSign(value) {
  if (value == null) return '\u2014';
  const sign = value > 0 ? '+' : '';
  return sign + Math.round(value) + '%';
}

function formatCompactCurrency(n) {
  if (n == null) return '\u2014';
  const abs = Math.abs(n);
  if (abs >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + Math.round(n);
}

// Color for an index/percentage where 100 == market parity (RevPAR index, MPI).
function indexColor(value) {
  if (value == null) return { color: c.walnut, bg: 'transparent' };
  if (value >= 105) return { color: c.success, bg: c.successBg };
  if (value >= 95) return { color: c.warning, bg: c.warningBg };
  return { color: c.error, bg: c.errorBg };
}

// Color for a year-over-year (or delta) percentage centered on 0.
function yoyColor(value) {
  if (value == null) return { color: c.walnut, bg: 'transparent' };
  if (value >= 5) return { color: c.success, bg: c.successBg };
  if (value >= -5) return { color: c.warning, bg: c.warningBg };
  return { color: c.error, bg: c.errorBg };
}

// --- Report aggregation ---

function monthKey(m) {
  return m.year * 100 + m.monthNum;
}

// Current month + the next (n-1) months; falls back to the trailing window when
// the report's calendar lies entirely in the past.
function forwardMonths(listing, asOf, n = 4) {
  const fwd = listing.months.filter((m) => monthKey(m) >= asOf);
  if (fwd.length === 0) return listing.months.slice(-n);
  return fwd.slice(0, n);
}

function listingAgg(listing, asOf) {
  let revenue = 0;
  let pickup = 0;
  let idxWeighted = 0;
  let idxWeight = 0;
  let idxSum = 0;
  let idxCnt = 0;
  for (const m of listing.months) {
    revenue += m.revenue || 0;
    pickup += m.pickup30 || 0;
    if (m.revparIndex != null) {
      idxWeighted += m.revparIndex * (m.revenue || 0);
      idxWeight += m.revenue || 0;
      idxSum += m.revparIndex;
      idxCnt++;
    }
  }
  const fwd = forwardMonths(listing, asOf);
  let occSum = 0, occCnt = 0, mktSum = 0, mktCnt = 0, bwSum = 0, bwCnt = 0;
  for (const m of fwd) {
    if (m.occ != null) { occSum += m.occ; occCnt++; }
    if (m.marketOcc != null) { mktSum += m.marketOcc; mktCnt++; }
    if (m.bookingWindow != null) { bwSum += m.bookingWindow; bwCnt++; }
  }
  return {
    revenue,
    pickup,
    occ: occCnt ? occSum / occCnt : null,
    marketOcc: mktCnt ? mktSum / mktCnt : null,
    bookingWindow: bwCnt ? bwSum / bwCnt : null,
    revparIndex: idxWeight ? idxWeighted / idxWeight : idxCnt ? idxSum / idxCnt : null,
  };
}

function computeReportKpis(data) {
  const aggs = data.listings.map((l) => listingAgg(l, data.asOf));

  let revenue = 0, revenueStly = 0;
  for (const l of data.listings) {
    for (const m of l.months) {
      revenue += m.revenue || 0;
      revenueStly += m.revenueStly || 0;
    }
  }
  const revenueYoy = revenueStly > 0 ? ((revenue - revenueStly) / revenueStly) * 100 : null;

  const mean = (vals) => {
    const f = vals.filter((v) => v != null);
    return f.length ? f.reduce((s, v) => s + v, 0) / f.length : null;
  };
  // RevPAR index weighted by each listing's revenue (bigger earners dominate).
  let idxW = 0, idxWt = 0;
  aggs.forEach((a) => {
    if (a.revparIndex != null && a.revenue) { idxW += a.revparIndex * a.revenue; idxWt += a.revenue; }
  });

  return {
    count: data.listings.length,
    revenue,
    revenueStly,
    revenueYoy,
    avgOcc: mean(aggs.map((a) => a.occ)),
    marketOcc: mean(aggs.map((a) => a.marketOcc)),
    revparIndex: idxWt ? idxW / idxWt : mean(aggs.map((a) => a.revparIndex)),
    bookingWindow: mean(aggs.map((a) => a.bookingWindow)),
    pickup: aggs.reduce((s, a) => s + a.pickup, 0),
  };
}

// Portfolio revenue per month (current year vs same-time-last-year).
function portfolioMonthly(data) {
  const byMonth = new Map();
  for (const l of data.listings) {
    for (const m of l.months) {
      let e = byMonth.get(m.monthNum);
      if (!e) {
        e = { monthNum: m.monthNum, label: m.label, key: monthKey(m), revenue: 0, revenueStly: 0 };
        byMonth.set(m.monthNum, e);
      }
      e.revenue += m.revenue || 0;
      e.revenueStly += m.revenueStly || 0;
    }
  }
  return [...byMonth.values()].sort((a, b) => a.monthNum - b.monthNum);
}

// --- SVG Logo ---
const logoSvg = `<svg viewBox="0 0 160 36" xmlns="http://www.w3.org/2000/svg" style="height:28px;width:auto;">
  <text x="0" y="28" font-family="${f.display}" font-size="32" font-weight="400" fill="${c.cedar}" style="text-transform:lowercase;letter-spacing:-0.5px;">revfactor</text>
</svg>`;

const logoSvgSmall = `<svg viewBox="0 0 160 36" xmlns="http://www.w3.org/2000/svg" style="height:20px;width:auto;">
  <text x="0" y="28" font-family="${f.display}" font-size="32" font-weight="400" fill="${c.cedar}" style="text-transform:lowercase;letter-spacing:-0.5px;">revfactor</text>
</svg>`;

// --- Page shell ---

function htmlHead(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    background: ${c.stone};
    font-family: ${f.body};
    color: ${c.onyx};
    font-size: 15px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }

  /* Container — paper on stone */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 48px 32px;
  }
  .paper {
    background: ${c.paper};
    padding: 48px 40px;
    box-shadow: 0 20px 40px rgba(29, 28, 20, 0.05);
  }

  /* Header */
  .header { margin-bottom: 48px; }
  .header-logo { margin-bottom: 20px; }
  .header h1 {
    font-family: ${f.display};
    font-weight: 400;
    font-size: 40px;
    line-height: 1.15;
    text-transform: lowercase;
    color: ${c.tobacco};
    margin-bottom: 4px;
  }
  .header .tagline {
    font-family: ${f.display};
    font-weight: 400;
    font-style: italic;
    font-size: 22px;
    line-height: 1.3;
    text-transform: lowercase;
    color: ${c.walnut};
    margin-bottom: 16px;
  }
  .header .updated {
    font-family: ${f.body};
    font-size: 12px;
    font-weight: 500;
    color: ${c.walnut};
    letter-spacing: 0.3px;
  }
  .mock-notice {
    display: inline-block;
    background: ${c.warningBg};
    color: ${c.warning};
    font-family: ${f.body};
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 4px 12px;
    border-radius: 2px;
    margin-bottom: 12px;
  }

  /* KPI Cards — tonal layering, no borders */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 48px;
  }
  .kpi-card {
    background: ${c.level2};
    padding: 28px 24px;
  }
  .kpi-label {
    font-family: ${f.body};
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: ${c.moss};
    margin-bottom: 8px;
  }
  .kpi-value {
    font-family: ${f.mono};
    font-size: 32px;
    font-weight: 500;
    color: ${c.onyx};
    line-height: 1.1;
  }
  .kpi-sub {
    font-family: ${f.body};
    font-size: 12px;
    font-weight: 500;
    color: ${c.walnut};
    margin-top: 6px;
  }

  /* Pacing chart — server-rendered SVG, no client JS */
  .chart-section { margin-bottom: 48px; }
  .chart-card {
    background: ${c.level2};
    padding: 28px 24px 20px;
  }
  .chart-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }
  .chart-legend {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: ${f.body};
    font-size: 11px;
    font-weight: 500;
    color: ${c.walnut};
  }
  .legend-swatch { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
  .chart-svg { width: 100%; height: auto; display: block; }

  /* Table — tonal layering, no explicit borders */
  .table-section {
    margin-bottom: 48px;
  }
  .table-section-title {
    font-family: ${f.body};
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: ${c.moss};
    margin-bottom: 16px;
  }
  .table-wrap {
    overflow-x: auto;
    background: ${c.level2};
  }
  table { width: 100%; border-collapse: collapse; min-width: 700px; }
  thead th {
    font-family: ${f.body};
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: ${c.moss};
    text-align: left;
    padding: 16px 16px;
    background: ${c.level3};
    position: sticky;
    top: 0;
    z-index: 1;
  }
  thead th.num { text-align: right; }
  tbody td {
    padding: 14px 16px;
    font-family: ${f.body};
    font-size: 14px;
    font-weight: 400;
    vertical-align: middle;
  }
  tbody td.mono {
    font-family: ${f.mono};
    font-size: 13px;
    font-weight: 500;
    text-align: right;
  }
  tbody tr:nth-child(odd) { background: ${c.paper}; }
  tbody tr:nth-child(even) { background: ${c.level2}; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 2px;
    font-family: ${f.mono};
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  /* Tab bar — links, no client JS */
  .tab-bar {
    display: flex;
    gap: 4px;
    margin-bottom: 40px;
    background: ${c.level2};
    padding: 4px;
    border-radius: 2px;
  }
  .tab {
    flex: 1;
    text-align: center;
    text-decoration: none;
    font-family: ${f.body};
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: ${c.walnut};
    padding: 12px 16px;
    border-radius: 2px;
  }
  .tab-active {
    background: ${c.cedar};
    color: ${c.paper};
  }

  /* SEO tab — empty state */
  .seo-empty {
    text-align: center;
    padding: 64px 24px;
    background: ${c.level2};
  }
  .seo-empty-title {
    font-family: ${f.display};
    font-size: 24px;
    text-transform: lowercase;
    color: ${c.tobacco};
    margin-bottom: 8px;
  }
  .seo-empty-sub {
    font-family: ${f.body};
    font-size: 14px;
    color: ${c.walnut};
  }

  /* SEO tab — visuals (scoped under .seo-view; ported from the design drafts) */
  .seo-view .eyebrow { font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:${c.moss}; margin-bottom:10px; }
  .seo-view .section { margin-bottom:48px; }
  .seo-view .section-title { font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:${c.moss}; margin-bottom:16px; }
  .seo-view .seo-sub { font-family:${f.display}; font-style:italic; font-size:20px; text-transform:lowercase; color:${c.walnut}; margin:-4px 0 12px; }
  .seo-view .kpi-note { font-family:${f.body}; font-size:12px; color:${c.walnut}; font-style:italic; margin-top:14px; }
  .seo-view .legend { display:flex; gap:16px; flex-wrap:wrap; }
  .seo-view .legend-item { display:flex; align-items:center; gap:6px; font-family:${f.body}; font-size:11px; font-weight:600; color:${c.walnut}; }
  .seo-view .legend-swatch { width:12px; height:12px; border-radius:2px; display:inline-block; }
  .seo-view .chart-svg { width:100%; height:auto; display:block; }

  /* Funnel */
  .seo-view .funnel-card { background:${c.level2}; padding:28px 24px 20px; }
  .seo-view .funnel-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  .seo-view .funnel-head .ttl { font-family:${f.display}; font-style:italic; font-size:20px; text-transform:lowercase; color:${c.tobacco}; }

  /* Funnel guide (3 layers) */
  .seo-view .guide-box { background:${c.level1}; margin-top:18px; }
  .seo-view .guide-box summary { cursor:pointer; font-family:${f.body}; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:1.2px; color:${c.moss}; padding:15px 18px; list-style:none; display:flex; align-items:center; gap:8px; }
  .seo-view .guide-box summary::-webkit-details-marker { display:none; }
  .seo-view .guide-box summary::after { content:'▾'; margin-left:auto; transition:transform .2s; }
  .seo-view .guide-box[open] summary::after { transform:rotate(180deg); }
  .seo-view .guide-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:2px 18px 20px; }
  .seo-view .layer { background:${c.paper}; padding:16px; border-top:3px solid ${c.moss}; }
  .seo-view .layer .ln { font-family:${f.mono}; font-size:10px; font-weight:600; color:${c.moss}; letter-spacing:1px; text-transform:uppercase; }
  .seo-view .layer h4 { font-family:${f.display}; font-style:italic; font-size:18px; text-transform:lowercase; color:${c.tobacco}; margin:3px 0 9px; font-weight:400; }
  .seo-view .layer .chips { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:9px; }
  .seo-view .layer .chip { font-family:${f.body}; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; background:${c.level2}; color:${c.walnut}; padding:3px 7px; border-radius:3px; }
  .seo-view .layer p { font-size:11.5px; color:${c.walnut}; line-height:1.5; }
  .seo-view .layer .fix { font-size:10.5px; color:${c.walnut}; margin-top:9px; padding-top:9px; box-shadow:inset 0 1px 0 ${c.level3}; }
  .seo-view .layer .fix b { color:${c.tobacco}; font-weight:600; }

  /* Metrics board */
  .seo-view .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
  .seo-view .kpi-card { background:${c.level2}; padding:22px 20px; }
  .seo-view .kpi-card .head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; }
  .seo-view .kpi-label { font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:${c.moss}; }
  .seo-view .kpi-ico { width:26px; height:26px; border-radius:8px; background:${c.level3}; display:flex; align-items:center; justify-content:center; font-size:13px; }
  .seo-view .kpi-rows { display:flex; flex-direction:column; gap:7px; }
  .seo-view .kpi-r { display:flex; align-items:center; justify-content:space-between; }
  .seo-view .kpi-mo { font-family:${f.body}; font-size:11px; font-weight:600; color:${c.walnut}; text-transform:uppercase; letter-spacing:.5px; }
  .seo-view .kpi-mo .now { font-size:8px; font-weight:700; color:${c.cedar}; background:${c.successBg}; border-radius:2px; padding:1px 5px; margin-left:6px; letter-spacing:1px; }
  .seo-view .kpi-v { font-family:${f.mono}; font-size:14px; font-weight:500; color:${c.onyx}; display:flex; align-items:center; gap:6px; }
  .seo-view .arrow-up { color:${c.success}; }
  .seo-view .arrow-dn { color:${c.error}; }

  /* Trend chart */
  .seo-view .chart-card { background:${c.level2}; padding:28px 24px 20px; }
  .seo-view .chart-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:16px; }

  /* Rank snapshot */
  .seo-view .rank-card { background:${c.level2}; padding:28px 24px; }
  .seo-view .rank-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:16px; margin-top:8px; }
  .seo-view .rank-pod { background:${c.paper}; padding:18px 16px; text-align:center; }
  .seo-view .rank-pod .g { font-family:${f.body}; font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:1px; color:${c.moss}; margin-bottom:6px; }
  .seo-view .rank-pod .p { font-family:${f.mono}; font-size:30px; font-weight:500; color:${c.cedar}; line-height:1; }
  .seo-view .rank-pod .s { font-family:${f.body}; font-size:10px; color:${c.walnut}; margin-top:4px; }

  /* Portfolio — where-to-focus callout */
  .seo-view .focus-box { background:${c.level1}; padding:18px 22px; border-left:3px solid #E0B84C; font-size:13px; color:${c.tobacco}; }

  /* Portfolio — small multiples (2–7 listings) */
  .seo-view .cards { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
  .seo-view .card { background:${c.level2}; padding:22px 22px 18px; }
  .seo-view .card .top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:4px; }
  .seo-view .card .top > div { min-width:0; }
  .seo-view .card .nm { font-family:${f.body}; font-weight:600; font-size:15px; color:${c.tobacco}; line-height:1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .seo-view .card .cy { font-size:11px; color:${c.walnut}; font-weight:500; margin-top:2px; }
  .seo-view .rankchip { font-family:${f.mono}; font-size:12px; font-weight:500; padding:4px 9px; border-radius:3px; white-space:nowrap; }
  .seo-view .ribbon { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:16px 0 10px; }
  .seo-view .tile { padding:9px 6px 8px; border-radius:4px; text-align:center; }
  .seo-view .tile .tl { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:${c.moss}; margin-bottom:3px; }
  .seo-view .tile .tv { font-family:${f.mono}; font-size:14px; font-weight:500; line-height:1.1; }
  .seo-view .tile .tm { font-size:9px; font-weight:600; margin-top:2px; }
  .seo-view .diag { display:flex; align-items:center; gap:8px; font-size:12px; color:${c.walnut}; padding-top:10px; box-shadow:inset 0 1px 0 ${c.level3}; }
  .seo-view .pill { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; padding:3px 8px; border-radius:3px; }

  /* Portfolio — matrix (8+ listings) */
  .seo-view .triage { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .seo-view .tcard { background:${c.errorBg}; padding:18px 20px; border-left:3px solid ${c.error}; }
  .seo-view .tcard .r { font-family:${f.mono}; font-size:11px; font-weight:600; color:${c.error}; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .seo-view .tcard .n { font-size:14px; font-weight:600; color:${c.tobacco}; line-height:1.25; }
  .seo-view .tcard .d { font-size:12px; color:${c.walnut}; margin-top:6px; }
  .seo-view .matrix-wrap { overflow-x:auto; background:${c.level2}; }
  .seo-view table { width:100%; border-collapse:collapse; min-width:880px; }
  .seo-view thead th { font-family:${f.body}; font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:1px; color:${c.moss}; padding:14px 8px; background:${c.level3}; text-align:center; white-space:nowrap; }
  .seo-view thead th.lh { text-align:left; position:sticky; left:0; background:${c.level3}; z-index:2; min-width:230px; }
  .seo-view thead th .sub { display:block; font-weight:500; font-size:8px; color:${c.walnut}; letter-spacing:.5px; text-transform:none; margin-top:2px; }
  .seo-view tbody td { padding:0; text-align:center; vertical-align:middle; }
  .seo-view tbody td.lh { padding:11px 14px; text-align:left; position:sticky; left:0; background:${c.paper}; z-index:1; }
  .seo-view tbody tr:nth-child(even) td.lh { background:${c.level2}; }
  .seo-view .pn { font-weight:600; font-size:13px; color:${c.tobacco}; line-height:1.2; }
  .seo-view .pc { font-size:10px; color:${c.walnut}; font-weight:500; }
  .seo-view .cell { font-family:${f.mono}; font-size:12.5px; font-weight:500; padding:11px 6px; margin:2px; border-radius:3px; display:block; }
  .seo-view .hbadge { font-family:${f.mono}; font-size:12px; font-weight:600; padding:4px 8px; border-radius:3px; }
  .seo-view .leaktag { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; padding:3px 7px; border-radius:3px; white-space:nowrap; }

  @media (max-width:900px) {
    .seo-view .kpi-grid { grid-template-columns:repeat(2,1fr); }
    .seo-view .guide-grid { grid-template-columns:1fr; }
  }
  @media (max-width:860px) {
    .seo-view .cards { grid-template-columns:1fr; }
    .seo-view .triage { grid-template-columns:1fr; }
  }

  /* Footer — tonal transition to stone */
  .footer {
    text-align: center;
    padding: 48px 24px 0;
    margin-top: 40px;
  }
  .footer-label {
    font-family: ${f.body};
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: ${c.moss};
    margin-top: 12px;
  }
  .footer-tagline {
    font-family: ${f.display};
    font-style: italic;
    font-size: 16px;
    color: ${c.walnut};
    margin-top: 4px;
    text-transform: lowercase;
  }

  /* Error page */
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    text-align: center;
    padding: 48px 24px;
  }
  .error-code {
    font-family: ${f.display};
    font-size: 96px;
    font-weight: 400;
    color: ${c.level3};
    line-height: 1;
    margin-bottom: 16px;
  }
  .error-msg {
    font-family: ${f.display};
    font-size: 28px;
    font-weight: 400;
    text-transform: lowercase;
    color: ${c.tobacco};
    margin-bottom: 16px;
  }
  .error-sub {
    font-family: ${f.body};
    font-size: 14px;
    color: ${c.walnut};
  }

  /* Responsive */
  @media (max-width: 900px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .paper { padding: 32px 24px; }
    .header h1 { font-size: 28px; }
    .header .tagline { font-size: 18px; }
    .kpi-value { font-size: 26px; }
  }
  @media (max-width: 428px) {
    .kpi-grid { grid-template-columns: 1fr; }
    .container { padding: 16px 12px; }
    .paper { padding: 24px 16px; }
  }
</style>
</head>`;
}

// --- KPI computation ---

function computeKpis(data) {
  const listings = data.listings.filter((l) => !l.dataUnavailable);
  const count = data.listings.length;

  if (listings.length === 0) {
    return { count, avgOcc: null, marketOcc: null, perfIndex: null, avgAdr: null, avgAdrStly: null };
  }

  const avgOcc =
    listings.reduce((sum, l) => sum + (l.occupancy30d || 0), 0) / listings.length;
  const marketOcc =
    listings.reduce((sum, l) => sum + (l.marketOccupancy30d || 0), 0) / listings.length;
  const perfIndex = marketOcc > 0 ? avgOcc / marketOcc : null;

  const adrListings = listings.filter((l) => l.adrPast30 != null);
  const avgAdr = adrListings.length > 0
    ? adrListings.reduce((sum, l) => sum + l.adrPast30, 0) / adrListings.length
    : null;
  const stlyListings = listings.filter((l) => l.stlyAdrPast30 != null);
  const avgAdrStly = stlyListings.length > 0
    ? stlyListings.reduce((sum, l) => sum + l.stlyAdrPast30, 0) / stlyListings.length
    : null;

  return {
    count,
    avgOcc: Math.round(avgOcc),
    marketOcc: Math.round(marketOcc),
    perfIndex: perfIndex != null ? +perfIndex.toFixed(2) : null,
    avgAdr: avgAdr != null ? Math.round(avgAdr) : null,
    avgAdrStly: avgAdrStly != null ? Math.round(avgAdrStly) : null,
  };
}

// --- Section renderers ---

function renderHeader(client, data) {
  const mockBanner = data.isUsingMockData
    ? `<span class="mock-notice">Sample Data</span>`
    : '';

  return `
<header class="header">
  <div class="header-logo">${logoSvg}</div>
  ${mockBanner}
  <h1>${escapeHtml(client.name)}</h1>
  <p class="tagline">intelligent pricing for inspired stays</p>
  <p class="updated">Last updated: ${formatTimestamp(data.fetchedAt)} \u00b7 ${escapeHtml(client.market)}</p>
</header>`;
}

function renderKpiCards(kpis) {
  const perfColor = performanceColor(
    kpis.perfIndex != null ? kpis.perfIndex * 100 : null,
    100
  );

  const adrYoy = kpis.avgAdr != null && kpis.avgAdrStly != null && kpis.avgAdrStly > 0
    ? ((kpis.avgAdr - kpis.avgAdrStly) / kpis.avgAdrStly) * 100
    : null;
  const adrYoyColor = adrYoy != null
    ? (adrYoy >= 5 ? { color: c.success, bg: c.successBg }
      : adrYoy >= -5 ? { color: c.warning, bg: c.warningBg }
      : { color: c.error, bg: c.errorBg })
    : { color: c.walnut, bg: 'transparent' };

  return `
<div class="kpi-grid">
  <div class="kpi-card">
    <p class="kpi-label">Active Listings</p>
    <p class="kpi-value">${kpis.count}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Avg Occupancy (30d)</p>
    <p class="kpi-value">${formatPercent(kpis.avgOcc)}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Market Occupancy (30d)</p>
    <p class="kpi-value">${formatPercent(kpis.marketOcc)}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Performance Index</p>
    <p class="kpi-value" style="color:${perfColor.color};">${kpis.perfIndex != null ? kpis.perfIndex.toFixed(2) : '\u2014'}</p>
    <p class="kpi-sub" style="color:${perfColor.color};">${kpis.perfIndex != null ? (kpis.perfIndex >= 1.05 ? 'Above market' : kpis.perfIndex >= 0.95 ? 'At market' : 'Below market') : ''}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Avg ADR (30d)</p>
    <p class="kpi-value">${formatCurrency(kpis.avgAdr)}</p>
    <p class="kpi-sub">vs ${formatCurrency(kpis.avgAdrStly)} last year</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">ADR vs Last Year</p>
    <p class="kpi-value" style="color:${adrYoyColor.color};">${adrYoy != null ? deltaSign(adrYoy) : '\u2014'}</p>
    <p class="kpi-sub" style="color:${adrYoyColor.color};">${adrYoy != null ? (adrYoy >= 5 ? 'Rates up YoY' : adrYoy >= -5 ? 'Rates flat YoY' : 'Rates down YoY') : ''}</p>
  </div>
</div>`;
}

function renderListingsTable(data) {
  const rows = data.listings
    .map((l) => {
      const occ = l.dataUnavailable ? null : l.occupancy30d;
      const mktOcc = l.dataUnavailable ? null : l.marketOccupancy30d;
      const delta = occ != null && mktOcc != null ? occ - mktOcc : null;
      const deltaColor = performanceColor(occ, mktOcc);
      const mpiColor = performanceColor(
        l.mpi30d != null ? l.mpi30d * 100 : null,
        100
      );

      const adrYoy = l.adrPast30 != null && l.stlyAdrPast30 != null && l.stlyAdrPast30 > 0
        ? ((l.adrPast30 - l.stlyAdrPast30) / l.stlyAdrPast30) * 100
        : null;
      const adrYoyColor = adrYoy != null
        ? (adrYoy >= 5 ? { color: c.success, bg: c.successBg }
          : adrYoy >= -5 ? { color: c.warning, bg: c.warningBg }
          : { color: c.error, bg: c.errorBg })
        : { color: c.walnut, bg: 'transparent' };

      return `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(l.name)}</div>
          <div style="font-size:12px;color:${c.walnut};font-weight:400;">${escapeHtml(l.city)}${l.bedrooms ? ` \u00b7 ${l.bedrooms}br` : ''}</div>
        </td>
        <td class="mono">${formatPercent(occ)}</td>
        <td class="mono">${formatPercent(mktOcc)}</td>
        <td class="mono"><span class="badge" style="color:${deltaColor.color};background:${deltaColor.bg};">${deltaSign(delta)}</span></td>
        <td class="mono">${l.dataUnavailable ? '\u2014' : formatCurrency(l.adrPast30)}</td>
        <td class="mono">${l.dataUnavailable ? '\u2014' : `<span class="badge" style="color:${adrYoyColor.color};background:${adrYoyColor.bg};">${deltaSign(adrYoy)}</span>`}</td>
        <td class="mono">${l.dataUnavailable ? '\u2014' : l.nightsBooked15d}</td>
        <td class="mono"><span class="badge" style="color:${mpiColor.color};background:${mpiColor.bg};">${l.mpi30d != null ? l.mpi30d.toFixed(2) : '\u2014'}</span></td>
      </tr>`;
    })
    .join('');

  return `
<div class="table-section">
  <p class="table-section-title">Portfolio Overview</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Listing</th>
          <th class="num">Occ (30d)</th>
          <th class="num">Market Occ</th>
          <th class="num">vs Market</th>
          <th class="num">ADR (30d)</th>
          <th class="num">vs Last Year</th>
          <th class="num">Pickup (15d)</th>
          <th class="num">MPI (30d)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</div>`;
}

// --- Report-backed section renderers ---

function renderReportKpiCards(kpis, data) {
  const occDelta =
    kpis.avgOcc != null && kpis.marketOcc != null ? kpis.avgOcc - kpis.marketOcc : null;
  const occColor = performanceColor(kpis.avgOcc, kpis.marketOcc);
  const revYoyColor = yoyColor(kpis.revenueYoy);
  const idxColor = indexColor(kpis.revparIndex);

  return `
<div class="kpi-grid">
  <div class="kpi-card">
    <p class="kpi-label">Active Listings</p>
    <p class="kpi-value">${kpis.count}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">${data.year} Revenue</p>
    <p class="kpi-value">${formatCompactCurrency(kpis.revenue)}</p>
    <p class="kpi-sub" style="color:${revYoyColor.color};">${kpis.revenueYoy != null ? `${deltaSign(kpis.revenueYoy)} vs last year` : 'booked + pace'}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Occupancy (next 4 mo)</p>
    <p class="kpi-value" style="color:${occColor.color};">${formatPercent(kpis.avgOcc)}</p>
    <p class="kpi-sub" style="color:${occColor.color};">${occDelta != null ? `${deltaSign(occDelta)} vs ${formatPercent(kpis.marketOcc)} market` : ''}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">RevPAR Index</p>
    <p class="kpi-value" style="color:${idxColor.color};">${kpis.revparIndex != null ? Math.round(kpis.revparIndex) : '—'}</p>
    <p class="kpi-sub" style="color:${idxColor.color};">${kpis.revparIndex != null ? (kpis.revparIndex >= 105 ? 'Above market' : kpis.revparIndex >= 95 ? 'At market' : 'Below market') : ''}</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Avg Booking Window</p>
    <p class="kpi-value">${kpis.bookingWindow != null ? Math.round(kpis.bookingWindow) : '—'}<span style="font-size:16px;"> days</span></p>
    <p class="kpi-sub">lead time on the books</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Nights Booked (30d)</p>
    <p class="kpi-value">${Math.round(kpis.pickup)}</p>
    <p class="kpi-sub">recent pickup across portfolio</p>
  </div>
</div>`;
}

function renderPacingChart(data) {
  const months = portfolioMonthly(data);
  if (months.length === 0) return '';

  const W = 760;
  const H = 260;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / months.length;
  const barW = Math.min(30, slot * 0.5);

  const maxVal = Math.max(
    1,
    ...months.map((m) => Math.max(m.revenue || 0, m.revenueStly || 0))
  );
  const y = (v) => padT + plotH * (1 - (v || 0) / maxVal);

  let firstForecast = months.findIndex((m) => m.key >= data.asOf);

  const bars = months
    .map((m, i) => {
      const cx = padL + slot * i + slot / 2;
      const x = cx - barW / 2;
      const isActual = m.key < data.asOf;
      const barY = y(m.revenue);
      const barH = padT + plotH - barY;
      const stlyY = y(m.revenueStly);
      // current-year revenue bar (muted when it's forward-looking pace)
      const bar = `<rect x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" rx="2" fill="${c.cedar}" fill-opacity="${isActual ? '1' : '0.38'}"></rect>`;
      // same-time-last-year reference tick
      const tick = m.revenueStly > 0
        ? `<line x1="${(x - 2).toFixed(1)}" y1="${stlyY.toFixed(1)}" x2="${(x + barW + 2).toFixed(1)}" y2="${stlyY.toFixed(1)}" stroke="${c.walnut}" stroke-width="2" stroke-linecap="round"></line>`
        : '';
      const label = `<text x="${cx.toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-family="${f.body}" font-size="11" font-weight="500" fill="${c.walnut}">${m.label}</text>`;
      return bar + tick + label;
    })
    .join('');

  // Divider marking the actual → forecast boundary.
  let divider = '';
  if (firstForecast > 0) {
    const dx = padL + slot * firstForecast;
    divider = `<line x1="${dx.toFixed(1)}" y1="${padT}" x2="${dx.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="${c.level3}" stroke-width="1.5" stroke-dasharray="3 4"></line>`;
  }

  return `
<div class="chart-section">
  <div class="chart-card">
    <div class="chart-head">
      <p class="table-section-title" style="margin-bottom:0;">Revenue Pacing · ${data.year}</p>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:${c.cedar};"></span>Booked</span>
        <span class="legend-item"><span class="legend-swatch" style="background:${c.cedar};opacity:0.38;"></span>Pace (forecast)</span>
        <span class="legend-item"><span class="legend-swatch" style="background:${c.walnut};height:2px;"></span>Last year</span>
      </div>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monthly revenue pacing">
      ${divider}
      ${bars}
    </svg>
  </div>
</div>`;
}

function renderReportTable(data) {
  const rows = data.listings
    .map((l) => {
      const a = listingAgg(l, data.asOf);
      const occDelta = a.occ != null && a.marketOcc != null ? a.occ - a.marketOcc : null;
      const occColor = performanceColor(a.occ, a.marketOcc);
      const idxColor = indexColor(a.revparIndex);
      return `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(l.name)}</div>
          <div style="font-size:12px;color:${c.walnut};font-weight:400;">${escapeHtml(l.city)}${l.bedrooms ? ` · ${l.bedrooms}br` : ''}</div>
        </td>
        <td class="mono">${formatCurrency(a.revenue)}</td>
        <td class="mono">${formatPercent(a.occ)}</td>
        <td class="mono"><span class="badge" style="color:${occColor.color};background:${occColor.bg};">${deltaSign(occDelta)}</span></td>
        <td class="mono"><span class="badge" style="color:${idxColor.color};background:${idxColor.bg};">${a.revparIndex != null ? Math.round(a.revparIndex) : '—'}</span></td>
        <td class="mono">${a.bookingWindow != null ? Math.round(a.bookingWindow) : '—'}</td>
        <td class="mono">${Math.round(a.pickup)}</td>
      </tr>`;
    })
    .join('');

  return `
<div class="table-section">
  <p class="table-section-title">Portfolio Overview</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Listing</th>
          <th class="num">${data.year} Revenue</th>
          <th class="num">Occ (4mo)</th>
          <th class="num">vs Market</th>
          <th class="num">RevPAR Index</th>
          <th class="num">Book Window</th>
          <th class="num">Pickup (30d)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</div>`;
}

function renderFooter() {
  return `
<footer class="footer">
  ${logoSvgSmall}
  <p class="footer-label">Managed by RevFactor</p>
  <p class="footer-tagline">intelligent pricing for inspired stays</p>
</footer>`;
}

// --- SEO Visibility tab ---

// Listing-count thresholds for the portfolio roll-up layout.
const SEO_LAYOUT = { cardsMin: 2, matrixMin: 8 }; // 1 funnel \u00b7 2\u20137 cards \u00b7 8+ matrix

const SEO_STAGE_KEYS = [
  'first_page_impressions', 'ctr', 'views', 'wishlists', 'booking_rate', 'overall_conversion',
];
const SEO_STAGE_SHORT = {
  first_page_impressions: 'Impr', ctr: 'CTR', views: 'Views',
  wishlists: 'Wish', booking_rate: 'Book', overall_conversion: 'Conv',
};
const SEO_STAGE_FULL = {
  first_page_impressions: 'First-page impressions', ctr: 'Click-through rate',
  views: 'Listing views', wishlists: 'Wishlist additions',
  booking_rate: 'Booking rate', overall_conversion: 'Overall conversion',
};
const SEO_MULTIPLIER_KEYS = new Set(['first_page_impressions', 'views', 'wishlists']);
const SEO_MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const SEO_GOLD = '#E0B84C';
const SEO_STAR = ` <tspan fill="${SEO_GOLD}">★</tspan>`;

// Metrics-board cards (label + icon), ordered like the draft.
const SEO_BOARD_CARDS = [
  { key: 'first_page_impressions', label: '1st Page Impressions', ico: '👁' },
  { key: 'ctr', label: 'Click-through rate', ico: '🖱' },
  { key: 'views', label: 'Listing views', ico: '🎯' },
  { key: 'wishlists', label: 'Wishlists', ico: '♡' },
  { key: 'booking_rate', label: 'Booking rate', ico: '📈' },
  { key: 'overall_conversion', label: 'Overall conversion', ico: '⚡' },
  { key: 'occupancy', label: 'Airbnb Occupancy', ico: '📅' },
  { key: 'adr', label: 'Avg. Daily Rate', ico: '$' },
];

// Per-step ⓘ tooltip copy, verbatim from rankbreeze-seo-dashboard-DRAFT.html.
const SEO_RANK_TIP =
  'Positioning & Views — Your average position in city search results. A higher placement reflects how relevant and reliable Airbnb considers your listing.';
const SEO_FUNNEL_TIPS = {
  first_page_impressions:
    'Positioning & Views — How often your listing appeared on the first page of search results. This represents your overall visibility on the platform.',
  ctr:
    'Openings & Clicks — The share of impressions that resulted in a click. It reflects how compelling your main photo, title and displayed price are at first glance.',
  views:
    'Openings & Clicks — The number of guests who opened your listing. It represents interest translating into actual visits.',
  wishlists:
    'Conversion — The number of guests who saved your listing. It is a signal of intent and active consideration.',
  booking_rate:
    'Conversion — Of the guests who viewed your listing, the share who booked. It measures whether the offer holds up once guests review the full details.',
  overall_conversion:
    'Conversion — The share of all impressions that ended in a booking. It reflects the performance of the funnel from end to end.',
};

function seoCompact(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
  if (abs >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

function seoRate(v, precise) {
  if (v == null) return '—';
  return (precise || v < 1 ? v.toFixed(2) : v.toFixed(1)) + '%';
}

// Format a metric value by type. precise keeps full precision (funnel/board);
// compact abbreviates large counts (tiles/matrix).
function formatSeoMetric(key, v, { precise = false, compact = false } = {}) {
  if (v == null) return '—';
  if (key === 'ctr' || key === 'booking_rate' || key === 'overall_conversion') return seoRate(v, precise);
  if (key === 'occupancy') return v.toFixed(1) + '%';
  if (key === 'adr') return '$' + Math.round(v);
  return compact ? seoCompact(v) : Math.round(v).toLocaleString('en-US');
}

// Delta vs market: reach metrics as a multiplier (62×), rate metrics as ± percent.
function seoDelta(key, my, similar) {
  if (my == null || similar == null || similar === 0) return '';
  if (SEO_MULTIPLIER_KEYS.has(key)) {
    const x = my / similar;
    return (x >= 10 ? Math.round(x) : x.toFixed(1)) + '×';
  }
  const pct = ((my - similar) / similar) * 100;
  return (pct >= 0 ? '+' : '') + Math.round(pct) + '%';
}

function seoPageLabel(rank) {
  if (rank == null) return '';
  return 'Page ' + Math.max(1, Math.ceil(rank / 18));
}

function rankColor(rank) {
  if (rank == null) return { color: c.walnut, bg: c.level3 };
  if (rank <= 20) return { color: c.success, bg: c.successBg };
  if (rank <= 50) return { color: c.warning, bg: c.warningBg };
  return { color: c.error, bg: c.errorBg };
}

function seoHealthColor(above) {
  if (above >= 4) return { color: c.success, bg: c.successBg };
  if (above >= 3) return { color: c.warning, bg: c.warningBg };
  return { color: c.error, bg: c.errorBg };
}

// The weakest funnel stage (lowest my/market ratio) — the focus area.
function seoFocusKey(funnel) {
  let worst = null;
  let worstRatio = Infinity;
  for (const key of SEO_STAGE_KEYS) {
    const s = funnel[key];
    if (!s || s.my == null || s.similar == null || s.similar === 0) continue;
    const r = s.my / s.similar;
    if (r < worstRatio) { worstRatio = r; worst = key; }
  }
  return worst;
}

function seoPeriodKey(p) {
  if (!p) return null;
  const [m, y] = String(p).split('-').map(Number);
  if (!m || !y) return null;
  return y * 100 + m;
}

function renderTabs(activeTab, client) {
  const href = (t) =>
    `/api/dashboard/${encodeURIComponent(client.id)}?tab=${t}` +
    `&token=${encodeURIComponent(client.token || '')}`;
  const tab = (id, label) => {
    const active = activeTab === id;
    return `<a class="tab${active ? ' tab-active' : ''}" href="${href(id)}"${
      active ? ' aria-current="page"' : ''
    }>${label}</a>`;
  };
  return `
<nav class="tab-bar">
  ${tab('pricing', 'Pricing')}
  ${tab('seo', 'SEO Visibility')}
</nav>`;
}

function renderSeoEmptyState() {
  return `
<div class="seo-empty">
  <p class="seo-empty-title">no seo data yet</p>
  <p class="seo-empty-sub">SEO visibility data isn't available for this portfolio yet.</p>
</div>`;
}

// --- SEO components (ported from the design DRAFT files) ---

// The collapsible "how to read this funnel" 3-layer guide (copy verbatim).
function renderSeoGuide() {
  return `
      <details class="guide-box" open>
        <summary>How to read this funnel · hover the ⓘ on each step</summary>
        <div class="guide-grid">
          <div class="layer" style="border-top-color:${c.moss};">
            <p class="ln">1 · Positioning &amp; Views</p>
            <h4>airbnb shows your listing</h4>
            <div class="chips"><span class="chip">City ranking</span><span class="chip">First-page impressions</span></div>
            <p>How visible and competitive the listing is in search. Airbnb prioritizes listings by <strong>relevance and reliability</strong>, drawing on historical performance, reviews and conversion.</p>
            <p class="fix"><b>What we review:</b> pricing, review quality and volume, listing optimization, and positioning for the target guest segment.</p>
          </div>
          <div class="layer" style="border-top-color:${c.walnut};">
            <p class="ln">2 · Openings &amp; Clicks</p>
            <h4>guests open your listing</h4>
            <div class="chips"><span class="chip">Click-through rate</span><span class="chip">Listing views</span></div>
            <p>Of the times the listing appears, how often guests are interested enough to click. This depends on what is visible <strong>before</strong> they enter: main photo, title, price and reviews.</p>
            <p class="fix"><b>What we review:</b> photo quality, how competitive the displayed price feels, and how the listing stands out among alternatives.</p>
          </div>
          <div class="layer" style="border-top-color:${c.cedar};">
            <p class="ln">3 · Conversion</p>
            <h4>guests book</h4>
            <div class="chips"><span class="chip">Wishlists</span><span class="chip">Booking rate</span><span class="chip">Overall conversion</span></div>
            <p>Once guests are inside — photos, description, layout and final price in context — whether they find enough to justify booking.</p>
            <p class="fix"><b>What we review:</b> the balance between price, capacity, layout, amenities and the expectations of the target segment.</p>
          </div>
        </div>
      </details>`;
}

// A single funnel stage row (two tapering polygons + values + ⓘ tooltip).
function seoFunnelRow(listing, key, geo) {
  const s = listing.funnel[key] || {};
  const myStr = formatSeoMetric(key, s.my, { precise: true });
  const simStr = formatSeoMetric(key, s.similar, { precise: true });
  const myWins = s.my != null && s.similar != null && s.my >= s.similar;
  const name = SEO_STAGE_FULL[key];
  return `
          <polygon points="${geo.pMy}" fill="${geo.fillMy}"></polygon>
          <polygon points="${geo.pSim}" fill="${geo.fillSim}"></polygon>
          <text x="${geo.myX}" y="${geo.inY}" text-anchor="middle" class="fn-in">${myStr}${myWins ? SEO_STAR : ''}</text>
          <text x="${geo.simX}" y="${geo.inY}" text-anchor="middle" class="fn-in">${simStr}${myWins ? '' : SEO_STAR}</text>
          <text x="14" y="${geo.nameY}" class="fn-name">${name} <tspan fill="${c.moss}" font-size="11">ⓘ</tspan><title>${escapeHtml(SEO_FUNNEL_TIPS[key])}</title></text>
          <text x="14" y="${geo.valY}" class="fn-val" fill="${c.cedar}">${myStr}</text>
          <text x="746" y="${geo.nameY}" text-anchor="end" class="fn-name">${name}</text>
          <text x="746" y="${geo.valY}" text-anchor="end" class="fn-val" fill="${c.moss}">${simStr}</text>`;
}

function renderSeoFunnel(listing, seo) {
  const rk = listing.rank || {};
  const myRank = rk.avg != null ? Math.round(rk.avg) : null;
  const mktRank = rk.marketAvg != null ? Math.round(rk.marketAvg) : null;

  // Fixed funnel geometry (the taper), values injected per row.
  const rows =
    seoFunnelRow(listing, 'first_page_impressions', {
      pMy: '240,74 378,74 378,140 250,140', pSim: '382,74 520,74 510,140 382,140',
      fillMy: c.cedar, fillSim: c.walnut, myX: 306, simX: 450, inY: 112, nameY: 102, valY: 123,
    }) +
    seoFunnelRow(listing, 'ctr', {
      pMy: '250,140 378,140 378,206 260,206', pSim: '382,140 510,140 500,206 382,206',
      fillMy: '#1b4138', fillSim: '#835f53', myX: 308, simX: 448, inY: 178, nameY: 168, valY: 189,
    }) +
    seoFunnelRow(listing, 'views', {
      pMy: '260,206 378,206 378,272 270,272', pSim: '382,206 500,206 490,272 382,272',
      fillMy: '#244e43', fillSim: '#8f6a5d', myX: 310, simX: 446, inY: 244, nameY: 234, valY: 255,
    }) +
    seoFunnelRow(listing, 'wishlists', {
      pMy: '270,272 378,272 378,338 280,338', pSim: '382,272 490,272 480,338 382,338',
      fillMy: '#2f5d50', fillSim: '#9a7668', myX: 312, simX: 444, inY: 310, nameY: 300, valY: 321,
    }) +
    seoFunnelRow(listing, 'booking_rate', {
      pMy: '280,338 378,338 378,404 290,404', pSim: '382,338 480,338 470,404 382,404',
      fillMy: '#3a6b5d', fillSim: '#a48274', myX: 314, simX: 442, inY: 376, nameY: 366, valY: 387,
    }) +
    seoFunnelRow(listing, 'overall_conversion', {
      pMy: '290,404 378,404 378,470 298,470', pSim: '382,404 470,404 462,470 382,470',
      fillMy: '#45796a', fillSim: '#ad8e80', myX: 322, simX: 440, inY: 442, nameY: 432, valY: 453,
    });

  const focus = seoFocusKey(listing.funnel);
  const focusNote = focus
    ? ` The primary opportunity sits at ${SEO_STAGE_FULL[focus].toLowerCase()}, which currently trails the market.`
    : '';

  return `
    <div class="section">
      <p class="section-title">1 · Booking Funnel — ${escapeHtml(seo.periodLabel || '')}</p>
      <div class="funnel-card">
        <div class="funnel-head">
          <span class="ttl">how guests find &amp; book you</span>
          <div class="legend">
            <span class="legend-item"><span class="legend-swatch" style="background:${c.cedar};"></span>Your property</span>
            <span class="legend-item"><span class="legend-swatch" style="background:${c.walnut};"></span>Similar listings</span>
          </div>
        </div>
        <svg class="chart-svg" viewBox="0 0 760 478" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Booking funnel: your property vs similar listings">
          <defs><style>
            .fn-name{ font-family:${f.body}; font-size:12px; font-weight:600; fill:${c.walnut}; cursor:pointer; }
            .fn-in{ font-family:${f.mono}; font-size:14px; font-weight:500; fill:${c.paper}; }
            .fn-val{ font-family:${f.mono}; font-size:15px; font-weight:500; }
          </style></defs>
          <polygon points="230,8 530,8 520,74 240,74" fill="${c.cedar}"></polygon>
          <text x="380" y="34" text-anchor="middle" class="fn-in" font-size="11" fill="#DDDAD3" style="letter-spacing:1px;">CITY SEARCH RANK</text>
          <text x="380" y="56" text-anchor="middle" class="fn-in" font-size="17">★ ${myRank != null ? '#' + myRank : '—'} · ${seoPageLabel(myRank)}</text>
          <text x="14" y="36" class="fn-name">Average city rankings <tspan fill="${c.moss}" font-size="11">ⓘ</tspan><title>${escapeHtml(SEO_RANK_TIP)}</title></text>
          <text x="14" y="57" class="fn-val" fill="${c.cedar}">${myRank != null ? '#' + myRank + ' · ' + seoPageLabel(myRank) : '—'}</text>
          <text x="746" y="36" text-anchor="end" class="fn-name">vs. market</text>
          <text x="746" y="57" text-anchor="end" class="fn-val" fill="${c.moss}">${mktRank != null ? '~#' + mktRank + ' avg' : '—'}</text>
          ${rows}
        </svg>
      </div>
      <p class="kpi-note">This listing's reach — impressions, views and wishlists — stands above comparable listings.${focusNote}</p>
      ${renderSeoGuide()}
    </div>`;
}

function renderSeoMetricsBoard(listing) {
  const board = listing.board || {};
  const cards = SEO_BOARD_CARDS.map(({ key, label, ico }) => {
    const series = board[key] || [];
    const rows = series
      .map((pt, i) => {
        const prev = i > 0 ? series[i - 1].value : null;
        let arrow = '';
        if (i > 0 && pt.value != null && prev != null) {
          if (pt.value > prev) arrow = ` <span class="arrow-up">▲</span>`;
          else if (pt.value < prev) arrow = ` <span class="arrow-dn">▼</span>`;
        }
        const now = pt.isNow ? `<span class="now">Now</span>` : '';
        return `<div class="kpi-r"><span class="kpi-mo">${escapeHtml(pt.label || '')}${now}</span><span class="kpi-v">${formatSeoMetric(key, pt.value, { precise: true })}${arrow}</span></div>`;
      })
      .join('');
    return `<div class="kpi-card"><div class="head"><span class="kpi-label">${label}</span><span class="kpi-ico">${ico}</span></div><div class="kpi-rows">${rows}</div></div>`;
  }).join('');

  return `
    <div class="section">
      <p class="section-title">2 · Metrics Board — 3-month trend</p>
      <div class="kpi-grid">${cards}</div>
    </div>`;
}

function renderSeoTrend(listing, metricKey, seo) {
  const series = (listing.trend && listing.trend[metricKey]) || [];
  if (!series.length) return '';

  const W = 760, H = 260, padL = 8, padR = 8, padT = 16, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / series.length, barW = Math.min(20, slot * 0.5);
  const maxVal = Math.max(1, ...series.map((m) => Math.max(m.my || 0, m.similar || 0)));
  const y = (v) => padT + plotH * (1 - (v || 0) / maxVal);

  const curKey = seoPeriodKey(seo.period);
  let curIdx = series.findIndex((m) => seoPeriodKey(m.period) === curKey);
  if (curIdx < 0) curIdx = series.length - 1;

  const bars = series
    .map((m, i) => {
      const cx = padL + slot * i + slot / 2, x = cx - barW / 2;
      const isActual = i <= curIdx;
      const barY = y(m.my), barH = padT + plotH - barY;
      const tickY = y(m.similar);
      const bar = `<rect x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" rx="2" fill="${c.cedar}" fill-opacity="${isActual ? '1' : '0.38'}"></rect>`;
      const tick = m.similar > 0
        ? `<line x1="${(x - 2).toFixed(1)}" y1="${tickY.toFixed(1)}" x2="${(x + barW + 2).toFixed(1)}" y2="${tickY.toFixed(1)}" stroke="${c.walnut}" stroke-width="2" stroke-linecap="round"></line>`
        : '';
      const lbl = SEO_MONTH_SHORT[(seoPeriodKey(m.period) % 100) - 1] || '';
      const label = `<text x="${cx.toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-family="${f.body}" font-size="11" font-weight="500" fill="${c.walnut}">${lbl}</text>`;
      return bar + tick + label;
    })
    .join('');

  let divider = '';
  if (curIdx + 1 < series.length) {
    const dx = padL + slot * (curIdx + 1);
    divider = `<line x1="${dx.toFixed(1)}" y1="${padT}" x2="${dx.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="${c.level3}" stroke-width="1.5" stroke-dasharray="3 4"></line>`;
  }

  const year = curKey ? Math.floor(curKey / 100) : '';
  const title = `${(SEO_STAGE_FULL[metricKey] || metricKey).toLowerCase()} · ${year}`;

  return `
    <div class="section">
      <p class="section-title">3 · 12-month visibility trend (you vs. market)</p>
      <div class="chart-card">
        <div class="chart-head">
          <span style="font-family:${f.display};font-style:italic;font-size:20px;text-transform:lowercase;color:${c.tobacco};">${escapeHtml(title)}</span>
          <div class="legend">
            <span class="legend-item"><span class="legend-swatch" style="background:${c.cedar};"></span>You</span>
            <span class="legend-item"><span class="legend-swatch" style="background:${c.walnut};height:2px;"></span>Market</span>
          </div>
        </div>
        <svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="12-month ${escapeHtml(SEO_STAGE_FULL[metricKey] || metricKey)}">
          ${divider}
          ${bars}
        </svg>
        <p class="kpi-note">Solid = actuals · muted = forward pace · tick = market average.</p>
      </div>
    </div>`;
}

function renderRankSnapshot(listing) {
  const pods = (listing.rank && listing.rank.pods) || [];
  if (!pods.length) return '';
  const cells = pods
    .map((p) => `<div class="rank-pod"><div class="g">${p.guest_count} guest${p.guest_count === 1 ? '' : 's'}</div><div class="p">${p.position != null ? '#' + p.position : '—'}</div><div class="s">${seoPageLabel(p.position)}</div></div>`)
    .join('');
  return `
    <div class="section">
      <p class="section-title">4 · City search ranking — snapshot by guest count</p>
      <div class="rank-card">
        <div class="rank-grid">${cells}</div>
        <p class="kpi-note">Single-day snapshot — today's position by party size (time-series deferred).</p>
      </div>
    </div>`;
}

// Single-listing SEO dashboard (funnel + board + trend + rank).
function renderSeoSingle(listing, seo) {
  return `
    <p class="eyebrow">SEO Visibility · Airbnb Search</p>
    <p class="seo-sub">visibility &amp; conversion vs. your market</p>
    ${renderSeoFunnel(listing, seo)}
    ${renderSeoMetricsBoard(listing)}
    ${renderSeoTrend(listing, 'first_page_impressions', seo)}
    ${renderRankSnapshot(listing)}`;
}

// Portfolio snapshot KPIs + where-to-focus callout (shared by cards & matrix).
function renderSeoPortfolioSnapshot(seo) {
  const ls = seo.listings;
  const imprOf = (l) => (l.funnel.first_page_impressions || {}).my || 0;
  const totalImpr = ls.reduce((s, l) => s + imprOf(l), 0);
  const beating = ls.filter((l) => {
    const s = l.funnel.overall_conversion;
    return s && s.my != null && s.similar != null && s.my >= s.similar;
  }).length;
  const avgHealth = ls.reduce((s, l) => s + l.health.above, 0) / ls.length;
  const beatColor = beating >= ls.length * 0.5 ? c.success : beating > 0 ? c.warning : c.error;

  const focusL = [...ls].sort((a, b) => imprOf(b) - imprOf(a))[0];
  const fk = seoFocusKey(focusL.funnel);
  const focusCallout = fk
    ? `
    <div class="section">
      <p class="section-title">where to focus</p>
      <div class="focus-box"><strong>${escapeHtml(focusL.name)}</strong> generates the most reach (${seoCompact(imprOf(focusL))} impressions) yet its <strong>${SEO_STAGE_FULL[fk].toLowerCase()}</strong> is the highest-leverage opportunity in this portfolio.</div>
    </div>`
    : '';

  const kpi = (label, valueHtml, sub) =>
    `<div class="kpi-card"><div class="head"><span class="kpi-label">${label}</span></div><div class="kpi-v" style="font-size:30px;">${valueHtml}</div><div style="font-size:12px;color:${c.walnut};margin-top:6px;">${sub}</div></div>`;

  return `
    <p class="eyebrow">SEO Visibility · Portfolio</p>
    <p class="seo-sub">how your ${ls.length} listings find &amp; convert guests</p>
    <p class="section-title">portfolio snapshot</p>
    <div class="kpi-grid">
      ${kpi('Listings', String(ls.length), 'in this portfolio')}
      ${kpi('First-page impressions', seoCompact(totalImpr), 'total reach this month')}
      ${kpi('Beating market · conversion', `<span style="color:${beatColor};">${beating}</span><span style="font-size:16px;color:${c.walnut};">/${ls.length}</span>`, 'convert above similar listings')}
      ${kpi('Avg. funnel health', `${avgHealth.toFixed(1)}<span style="font-size:16px;color:${c.walnut};">/6</span>`, 'stages above market (avg)')}
    </div>
    ${focusCallout}`;
}

function seoMarketLegend(aboveLabel) {
  return `<div class="legend"><span class="legend-item"><span class="legend-swatch" style="background:${c.successBg};box-shadow:inset 0 0 0 2px ${c.success};"></span>${aboveLabel}</span><span class="legend-item"><span class="legend-swatch" style="background:${c.warningBg};box-shadow:inset 0 0 0 2px ${c.warning};"></span>at market</span><span class="legend-item"><span class="legend-swatch" style="background:${c.errorBg};box-shadow:inset 0 0 0 2px ${c.error};"></span>below market</span></div>`;
}

// Portfolio small-multiples (2–7 listings).
function renderSeoPortfolioCards(seo) {
  const cards = seo.listings
    .map((l) => {
      const rank = l.rank && l.rank.avg != null ? Math.round(l.rank.avg) : null;
      const rc = rankColor(rank);
      const tiles = SEO_STAGE_KEYS
        .map((key) => {
          const s = l.funnel[key] || {};
          const col = performanceColor(s.my, s.similar);
          return `<div class="tile" style="background:${col.bg};"><div class="tl">${SEO_STAGE_SHORT[key]}</div><div class="tv" style="color:${col.color};">${formatSeoMetric(key, s.my, { compact: true })}</div><div class="tm" style="color:${col.color};">${seoDelta(key, s.my, s.similar)}</div></div>`;
        })
        .join('');
      const fk = seoFocusKey(l.funnel);
      const ff = fk ? SEO_STAGE_FULL[fk] : '';
      const diag = fk
        ? `<div class="diag"><span class="pill" style="background:${c.errorBg};color:${c.error};">focus · ${ff}</span><span>above market on reach; trails the market at <strong>${ff.toLowerCase()}</strong></span></div>`
        : '';
      return `<div class="card"><div class="top"><div><div class="nm">${escapeHtml(l.name)}</div><div class="cy">${escapeHtml(l.city || '')}</div></div><span class="rankchip" style="background:${rc.bg};color:${rc.color};">${rank != null ? 'city rank #' + rank : '—'}</span></div><div class="ribbon">${tiles}</div>${diag}</div>`;
    })
    .join('');

  return `
    ${renderSeoPortfolioSnapshot(seo)}
    <div class="section">
      <p class="section-title">per-listing funnel · small multiples</p>
      ${seoMarketLegend('above market')}
      <div class="cards" style="margin-top:14px;">${cards}</div>
      <p class="kpi-note">Each tile shows the listing's ${escapeHtml(seo.periodLabel || '')} value; color and delta compare it to similar listings on Airbnb. Reach stages are typically strong — the key question is whether that reach carries through to booking and conversion.</p>
    </div>`;
}

// Portfolio matrix / heatmap (8+ listings).
function renderSeoPortfolioMatrix(seo) {
  const ls = seo.listings;
  const imprOf = (l) => (l.funnel.first_page_impressions || {}).my || 0;

  const triage = [...ls]
    .sort((a, b) => imprOf(b) - imprOf(a))
    .slice(0, 3)
    .map((l) => {
      const fk = seoFocusKey(l.funnel);
      const ff = fk ? SEO_STAGE_FULL[fk] : '';
      const s = fk ? l.funnel[fk] : null;
      const pct = s && s.my != null && s.similar ? Math.round(((s.my - s.similar) / s.similar) * 100) : null;
      return `<div class="tcard"><div class="r">focus · ${ff}</div><div class="n">${escapeHtml(l.name.slice(0, 37))}</div><div class="d">${seoCompact(imprOf(l))} impressions, with ${ff.toLowerCase()} running ${pct != null ? pct + '%' : '—'} vs. market · ${escapeHtml(l.city || '')}</div></div>`;
    })
    .join('');

  const rows = ls
    .map((l) => {
      const rank = l.rank && l.rank.avg != null ? Math.round(l.rank.avg) : null;
      const rc = rankColor(rank);
      const cells = SEO_STAGE_KEYS
        .map((key) => {
          const s = l.funnel[key] || {};
          const col = performanceColor(s.my, s.similar);
          return `<td><span class="cell" style="background:${col.bg};color:${col.color};">${formatSeoMetric(key, s.my, { compact: true })}</span></td>`;
        })
        .join('');
      const hc = seoHealthColor(l.health.above);
      const fk = seoFocusKey(l.funnel);
      const ff = fk ? SEO_STAGE_FULL[fk] : '';
      return `<tr><td class="lh"><div class="pn">${escapeHtml(l.name.slice(0, 40))}</div><div class="pc">${escapeHtml(l.city || '')}</div></td><td><span class="cell" style="background:${rc.bg};color:${rc.color};">${rank != null ? '#' + rank : '—'}</span></td>${cells}<td><span class="hbadge" style="background:${hc.bg};color:${hc.color};">${l.health.above}/${l.health.total}</span></td><td><span class="leaktag" style="background:${c.errorBg};color:${c.error};">${ff}</span></td></tr>`;
    })
    .join('');

  return `
    ${renderSeoPortfolioSnapshot(seo)}
    <div class="section">
      <p class="section-title">needs attention · highest-leverage opportunities</p>
      <div class="triage">${triage}</div>
    </div>
    <div class="section">
      <p class="section-title">funnel matrix · all listings</p>
      ${seoMarketLegend('above similar listings')}
      <div class="matrix-wrap" style="margin-top:14px;">
        <table>
          <thead><tr>
            <th class="lh">Listing</th>
            <th>Rank<span class="sub">city</span></th>
            <th>Impr<span class="sub">1st page</span></th>
            <th>CTR<span class="sub">click-thru</span></th>
            <th>Views<span class="sub">listing</span></th>
            <th>Wish<span class="sub">saves</span></th>
            <th>Book<span class="sub">view→bk</span></th>
            <th>Conv<span class="sub">overall</span></th>
            <th>Health<span class="sub">vs mkt</span></th>
            <th>Focus area</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="kpi-note">Cells show each listing's ${escapeHtml(seo.periodLabel || '')} value; color compares it to similar listings. Performance is typically strong on reach (left) and softer on click-through and booking (right).</p>
    </div>`;
}

// Assemble the SEO tab: single-listing dashboard, small-multiples, or matrix by
// listing count (SEO_LAYOUT thresholds). Scoped in .seo-view so its CSS is isolated.
function renderSeoTab(client, seo) {
  if (!seo || !seo.listings || seo.listings.length === 0) {
    return renderSeoEmptyState();
  }
  const n = seo.listings.length;
  let body;
  if (n >= SEO_LAYOUT.matrixMin) body = renderSeoPortfolioMatrix(seo);
  else if (n >= SEO_LAYOUT.cardsMin) body = renderSeoPortfolioCards(seo);
  else body = renderSeoSingle(seo.listings[0], seo);
  return `<div class="seo-view">${body}</div>`;
}

// --- Main exports ---

function renderDashboard(client, data, { tab = 'pricing', seo = null } = {}) {
  const isSeo = tab === 'seo';

  // Header derives its "last updated" line + mock badge from the active dataset.
  const headerData = isSeo ? (seo || { fetchedAt: null, isUsingMockData: false }) : data;

  const body = isSeo
    ? renderSeoTab(client, seo)
    : data.source === 'report'
    ? `${renderReportKpiCards(computeReportKpis(data), data)}
    ${renderPacingChart(data)}
    ${renderReportTable(data)}`
    : `${renderKpiCards(computeKpis(data))}
    ${renderListingsTable(data)}`;

  const title = isSeo
    ? `${client.name} \u2014 SEO Visibility | RevFactor`
    : `${client.name} \u2014 Pricing Dashboard | RevFactor`;

  return `${htmlHead(title)}
<body>
<div class="container">
  <div class="paper">
    ${renderHeader(client, headerData)}
    ${renderTabs(tab, client)}
    ${body}
    ${renderFooter()}
  </div>
</div>
</body>
</html>`;
}

function renderErrorPage(statusCode, message) {
  return `${htmlHead(`${statusCode} | RevFactor`)}
<body>
<div class="container">
  <div class="paper">
    <div class="error-page">
      ${logoSvg}
      <p class="error-code">${statusCode}</p>
      <p class="error-msg">${escapeHtml(message)}</p>
      <p class="error-sub">Please contact your property manager if you believe this is an error.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

export { renderDashboard, renderErrorPage };
