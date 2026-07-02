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

  /* Drill-down affordances (cards + matrix rows become links) */
  .seo-view a.card { display:block; text-decoration:none; color:inherit; cursor:pointer; transition:transform .12s, box-shadow .12s; position:relative; }
  .seo-view a.card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(20,53,45,.10); }
  .seo-view a.card:focus-visible { outline:2px solid ${c.cedar}; outline-offset:2px; }
  .seo-view .card-cta { display:block; margin-top:10px; font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1px; color:${c.cedar}; opacity:0; transition:opacity .12s; }
  .seo-view a.card:hover .card-cta { opacity:1; }
  .seo-view a.row-link { display:flex; flex-direction:column; text-decoration:none; color:inherit; cursor:pointer; }
  .seo-view a.row-link:hover .pn { color:${c.cedar}; text-decoration:underline; }
  .seo-view .row-cta { font-family:${f.body}; font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:${c.cedar}; opacity:0; margin-top:2px; }
  .seo-view a.row-link:hover .row-cta { opacity:1; }
  .seo-view tbody tr:hover td { background:${c.level1}; }
  .seo-view tbody tr:hover td.lh { background:${c.level1}; }
  .seo-back { display:inline-flex; align-items:center; gap:6px; font-family:${f.body}; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:${c.cedar}; text-decoration:none; margin-bottom:20px; }
  .seo-back:hover { text-decoration:underline; }

  @media (max-width:900px) {
    .seo-view .kpi-grid { grid-template-columns:repeat(2,1fr); }
    .seo-view .guide-grid { grid-template-columns:1fr; }
  }
  @media (max-width:860px) {
    .seo-view .cards { grid-template-columns:1fr; }
    .seo-view .triage { grid-template-columns:1fr; }
  }

  /* Pricing table — clickable listing rows (drill-down) */
  .ld-row-link { display:block; text-decoration:none; color:inherit; cursor:pointer; }
  .ld-row-link:hover span:first-child { color:${c.cedar}; text-decoration:underline; }
  .ld-row-link .row-cta { font-family:${f.body}; font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:${c.cedar}; opacity:0; margin-top:2px; }
  .ld-row-link:hover .row-cta { opacity:1; }
  tbody tr:hover td { background:${c.level1}; }

  /* Per-listing detail view */
  .ld-view { position:relative; }
  .ld-back { display:inline-flex; align-items:center; gap:6px; font-family:${f.body}; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:${c.cedar}; text-decoration:none; margin-bottom:16px; }
  .ld-back:hover { text-decoration:underline; }
  .ld-head { margin-bottom:16px; }
  .ld-name { font-family:${f.display}; font-weight:400; font-size:30px; text-transform:lowercase; color:${c.tobacco}; margin:0; }
  .ld-meta { font-family:${f.body}; font-size:13px; color:${c.walnut}; margin:2px 0 0; }
  .ld-tabs { display:inline-flex; gap:2px; background:${c.level3}; border-radius:10px; padding:4px; margin-bottom:20px; flex-wrap:wrap; }
  .ld-tab { border:0; background:transparent; font-family:${f.body}; font-weight:700; font-size:12px; letter-spacing:.5px; color:${c.walnut}; padding:8px 16px; border-radius:7px; cursor:pointer; }
  .ld-tab.active { background:${c.paper}; color:${c.tobacco}; }
  .ld-panel { margin-bottom:8px; }
  .ld-panel[hidden] { display:none; }
  .ld-panel-h { font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:${c.moss}; margin:0 0 14px; }
  .ld-view[data-js] .ld-panel-h { display:none; }
  .ld-card { background:${c.level2}; padding:22px 22px 18px; margin-bottom:16px; }
  .ld-card-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
  .ld-card-title { font-family:${f.body}; font-weight:700; font-size:13px; color:${c.tobacco}; margin:0; }
  .ld-card-desc { font-family:${f.body}; font-size:12px; color:${c.walnut}; margin:2px 0 0; }
  .ld-svg { width:100%; height:auto; display:block; }
  .ld-bar { cursor:pointer; transition:opacity .12s; }
  .ld-bar:hover { opacity:.82; }
  .ld-dot { cursor:pointer; }
  .ld-hband { fill:transparent; cursor:pointer; }
  .ld-hband:hover { fill:${c.cedar}; fill-opacity:.06; }
  .ld-legend { display:flex; gap:14px; flex-wrap:wrap; }
  .ld-leg { display:flex; align-items:center; gap:5px; font-family:${f.body}; font-size:11px; font-weight:600; color:${c.walnut}; }
  .ld-sw { width:11px; height:11px; border-radius:3px; display:inline-block; }
  .ld-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px; }
  .ld-kpi { background:${c.level2}; padding:16px 18px; }
  .ld-kpi-l { font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1px; color:${c.moss}; margin:0; }
  .ld-kpi-v { font-family:${f.mono}; font-size:24px; font-weight:600; color:${c.onyx}; margin:6px 0 0; }
  .ld-kpi-s { font-family:${f.body}; font-size:11px; color:${c.walnut}; margin:2px 0 0; }
  .ld-row2 { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
  .ld-table-wrap { overflow-x:auto; }
  .ld-table { width:100%; border-collapse:collapse; min-width:640px; }
  .ld-table thead th { position:static; background:transparent; padding:10px 10px; font-size:9px; }
  .ld-table thead th.num { text-align:right; }
  .ld-table tbody td { padding:9px 10px; font-size:13px; }
  .ld-table tbody td.num, .ld-table tbody td.mono { text-align:right; }
  .ld-table th:not(.num) { text-align:left; }
  .ld-table td:first-child { font-weight:600; color:${c.tobacco}; }
  .ld-table tbody tr:hover td { background:${c.level1}; }
  .ld-table .ld-total td { border-top:2px solid ${c.level3}; font-weight:700; }
  .ld-now { font-family:${f.body}; font-size:8px; font-weight:700; letter-spacing:1px; color:${c.cedar}; background:${c.successBg}; border-radius:2px; padding:1px 5px; margin-left:6px; }
  .ld-flag { display:flex; flex-wrap:wrap; align-items:baseline; gap:12px; padding:10px 14px; border-radius:6px; margin-bottom:8px; }
  .ld-flag-lvl { min-width:52px; font-family:${f.body}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1px; }
  .ld-flag-mo { font-weight:700; font-size:13px; color:${c.tobacco}; }
  .ld-flag-txt { flex:1; font-size:13px; color:${c.onyx}; }
  .ld-empty { font-size:13px; color:${c.walnut}; }
  #ld-tip { position:fixed; z-index:99; pointer-events:none; opacity:0; transition:opacity .1s; background:${c.tobacco}; color:${c.paper}; font-family:${f.body}; font-size:12px; line-height:1.5; padding:9px 12px; border-radius:8px; box-shadow:0 8px 24px rgba(22,25,16,.22); max-width:240px; }
  #ld-tip b { display:block; color:#fff; margin-bottom:5px; font-size:12px; }
  #ld-tip .tt-row { display:flex; justify-content:space-between; gap:18px; }
  #ld-tip .tt-k { color:${c.bone || '#DDDAD3'}; }
  #ld-tip .tt-v { font-family:${f.mono}; font-weight:600; }
  @media (max-width:860px) {
    .ld-kpis { grid-template-columns:repeat(2,1fr); }
    .ld-row2 { grid-template-columns:1fr; }
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

  // Same chart language as the per-listing detail: ld-card chrome, y-axis grid,
  // ld-bar columns with hover tooltips (driven by the shared #ld-tip).
  const H = 300;
  const max = ldNiceMax(Math.max(1, ...months.map((m) => Math.max(m.revenue || 0, m.revenueStly || 0))));
  const slot = ldSlot(months.length);
  const barW = Math.min(34, slot * 0.5);
  const firstForecast = months.findIndex((m) => m.key >= data.asOf);

  const bars = months
    .map((m, i) => {
      const cx = LDL + slot * i + slot / 2;
      const x = cx - barW / 2;
      const isActual = m.key < data.asOf;
      const barY = ldY(m.revenue, max, H);
      const barH = LDT + (H - LDT - LDB) - barY;
      const stlyY = ldY(m.revenueStly, max, H);
      const yoy = m.revenueStly > 0 ? ((m.revenue - m.revenueStly) / m.revenueStly) * 100 : null;
      const t = ldTip(`${m.label} ${data.year}`, [
        [isActual ? 'Booked' : 'Pace (forecast)', ldMoney(m.revenue)],
        ['Same time LY', ldMoney(m.revenueStly)],
        ['YoY', yoy == null ? '—' : ldSignedPct(yoy)],
      ]);
      const bar = `<rect class="ld-bar" x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" rx="3" fill="${c.cedar}" fill-opacity="${isActual ? '1' : '0.38'}" data-tip="${t}"></rect>`;
      const tick = m.revenueStly > 0
        ? `<line x1="${(x - 2).toFixed(1)}" y1="${stlyY.toFixed(1)}" x2="${(x + barW + 2).toFixed(1)}" y2="${stlyY.toFixed(1)}" stroke="${c.walnut}" stroke-width="2" stroke-linecap="round"></line>`
        : '';
      return bar + tick;
    })
    .join('');

  let divider = '';
  if (firstForecast > 0) {
    const dx = LDL + slot * firstForecast;
    divider = `<line x1="${dx.toFixed(1)}" y1="${LDT}" x2="${dx.toFixed(1)}" y2="${(LDT + (H - LDT - LDB)).toFixed(1)}" stroke="${c.level3}" stroke-width="1.5" stroke-dasharray="3 4"></line>`;
  }

  const svg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monthly revenue pacing">${ldGrid(H, max, 4, ldK)}${divider}${bars}${ldXLabels(H, months)}</svg>`;
  const legend = `<div class="ld-legend"><span class="ld-leg"><span class="ld-sw" style="background:${c.cedar};"></span>Booked</span><span class="ld-leg"><span class="ld-sw" style="background:${c.cedar};opacity:.38;"></span>Pace (forecast)</span><span class="ld-leg"><span class="ld-sw" style="background:${c.walnut};height:2px;"></span>Last year</span></div>`;

  return ldChartCard(`Revenue Pacing · ${data.year}`, '', svg, legend);
}

function renderReportTable(data, client) {
  const rows = data.listings
    .map((l) => {
      const a = listingAgg(l, data.asOf);
      const occDelta = a.occ != null && a.marketOcc != null ? a.occ - a.marketOcc : null;
      const occColor = performanceColor(a.occ, a.marketOcc);
      const idxColor = indexColor(a.revparIndex);
      const nameCell = client
        ? `<a class="ld-row-link" href="${pricingDrillHref(client, l.listingId)}" data-pricing-drill="${escapeHtml(String(l.listingId))}"><span style="font-weight:600;">${escapeHtml(l.name)}</span><span style="display:block;font-size:12px;color:${c.walnut};font-weight:400;">${escapeHtml(l.city)}${l.bedrooms ? ` · ${l.bedrooms}br` : ''}</span><span class="row-cta">View report →</span></a>`
        : `<div style="font-weight:600;">${escapeHtml(l.name)}</div><div style="font-size:12px;color:${c.walnut};font-weight:400;">${escapeHtml(l.city)}${l.bedrooms ? ` · ${l.bedrooms}br` : ''}</div>`;
      return `
      <tr>
        <td>${nameCell}</td>
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
  <p class="table-section-title">Portfolio Overview${client ? ' · <span style="font-weight:400;text-transform:none;letter-spacing:0;color:' + c.walnut + ';">click a listing for its full report</span>' : ''}</p>
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

// --- Pricing: per-listing detail (drill-down) ---
// Ported from revfactor-hub listing-report-dashboard.tsx into server-rendered
// SVG + tables. Four sub-views (Overview · Market Position · Booking Window ·
// Pacing) render as stacked panels; the shared client script (LISTING_DETAIL_JS)
// turns them into client-side tabs and adds hover tooltips. Progressive
// enhancement: with JS off, all panels render stacked and fully readable.

function pricingDrillHref(client, listingId) {
  return `/api/dashboard/${encodeURIComponent(client.id)}?tab=pricing` +
    `&listing=${encodeURIComponent(listingId)}` +
    `&token=${encodeURIComponent(client.token || '')}`;
}
function pricingBackHref(client) {
  return `/api/dashboard/${encodeURIComponent(client.id)}?tab=pricing` +
    `&token=${encodeURIComponent(client.token || '')}`;
}

// Local formatters for the detail view.
function ldMoney(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
function ldK(v) { return '$' + Math.round(v / 1000) + 'k'; }
function ldSignedPct(n) { return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
function ldSignedPp(n) { return n == null ? '—' : (n > 0 ? '+' : '') + Math.round(n) + ' pp'; }
function ldDays(n) { return n == null ? '—' : Math.round(n) + ' d'; }

// data-tip payload: HTML escaped for the attribute; the client decodes + injects.
function ldTip(title, pairs) {
  const body = pairs.map(([k, v]) => `<span class="tt-row"><span class="tt-k">${k}</span><span class="tt-v">${v}</span></span>`).join('');
  return escapeHtml(`<b>${title}</b>${body}`);
}

function ldNiceMax(v) {
  if (!v || v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

// SVG chart frame constants (viewBox 760 wide).
const LDW = 760, LDL = 46, LDR = 12, LDT = 16, LDB = 28;
function ldPlotW() { return LDW - LDL - LDR; }
function ldSlot(n) { return ldPlotW() / n; }

function ldGrid(H, max, ticks, fmt) {
  const plotH = H - LDT - LDB;
  let out = '';
  for (let i = 0; i <= ticks; i++) {
    const v = (max * i) / ticks;
    const yy = LDT + plotH - (plotH * i) / ticks;
    out += `<line x1="${LDL}" y1="${yy.toFixed(1)}" x2="${LDW - LDR}" y2="${yy.toFixed(1)}" stroke="${c.level3}" stroke-width="1"></line>`;
    out += `<text x="${LDL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-family="${f.body}" font-size="10" fill="${c.walnut}">${fmt(v)}</text>`;
  }
  return out;
}
function ldXLabels(H, months) {
  const slot = ldSlot(months.length);
  return months
    .map((m, i) => `<text x="${(LDL + slot * i + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-family="${f.body}" font-size="10" fill="${c.walnut}">${m.label}</text>`)
    .join('');
}
function ldY(v, max, H) { const plotH = H - LDT - LDB; return LDT + plotH - (plotH * (v || 0)) / max; }

// Polyline + hover dots for a metric series.
function ldLine(months, get, max, H, color, dash, dots) {
  const slot = ldSlot(months.length);
  const pts = [];
  const circles = [];
  months.forEach((m, i) => {
    const v = get(m);
    if (v == null) return;
    const cx = LDL + slot * i + slot / 2;
    const yy = ldY(v, max, H);
    pts.push(`${cx.toFixed(1)},${yy.toFixed(1)}`);
    if (dots) circles.push({ cx, yy, m });
  });
  const line = `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${dash ? 1.6 : 2.2}"${dash ? ` stroke-dasharray="5 4"` : ''}></polyline>`;
  const dotsSvg = dots
    ? circles.map((d) => `<circle class="ld-dot" cx="${d.cx.toFixed(1)}" cy="${d.yy.toFixed(1)}" r="4.5" fill="${c.paper}" stroke="${color}" stroke-width="2" data-tip="${dots(d.m)}"></circle>`).join('')
    : '';
  return line + dotsSvg;
}

function ldRefLine(y, max, H, label) {
  const yy = ldY(y, max, H);
  return `<line x1="${LDL}" y1="${yy.toFixed(1)}" x2="${LDW - LDR}" y2="${yy.toFixed(1)}" stroke="${c.walnut}" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"></line>` +
    (label ? `<text x="${LDW - LDR}" y="${(yy - 4).toFixed(1)}" text-anchor="end" font-family="${f.body}" font-size="9" fill="${c.walnut}">${label}</text>` : '');
}

function ldChartCard(title, desc, svg, legend) {
  return `<div class="ld-card"><div class="ld-card-head"><div><p class="ld-card-title">${title}</p>${desc ? `<p class="ld-card-desc">${desc}</p>` : ''}</div>${legend || ''}</div>${svg}</div>`;
}
function ldLegend(items) {
  return `<div class="ld-legend">${items.map(([col, lbl, isLine]) => `<span class="ld-leg"><span class="ld-sw" style="background:${col};${isLine ? 'height:2px;' : ''}"></span>${lbl}</span>`).join('')}</div>`;
}

// ---- Overview ----
function ldOverview(listing, asOf) {
  const ms = listing.months;
  const totalOtb = ms.reduce((s, m) => s + (m.revenue || 0), 0);
  const realized = ms.filter((m) => m.year * 100 + m.monthNum < asOf).reduce((s, m) => s + (m.revenue || 0), 0);
  const comp = ms.filter((m) => m.revenueStly && m.revenueStly > 0);
  const compRev = comp.reduce((s, m) => s + (m.revenue || 0), 0);
  const compStly = comp.reduce((s, m) => s + (m.revenueStly || 0), 0);
  const vsStly = compStly > 0 ? ((compRev - compStly) / compStly) * 100 : null;
  const fwd = ms.filter((m) => m.year * 100 + m.monthNum >= asOf);
  const potential = fwd.reduce((s, m) => s + (m.potentialRevenue || 0), 0);
  const rpis = fwd.filter((m) => m.revparIndex != null);
  const fwdRpi = rpis.length ? rpis.reduce((s, m) => s + m.revparIndex, 0) / rpis.length : null;

  const vsCol = vsStly == null ? { color: c.walnut } : yoyColor(vsStly);
  const rpiCol = fwdRpi == null ? { color: c.walnut } : indexColor(fwdRpi);
  const kpis = `
    <div class="ld-kpis">
      <div class="ld-kpi"><p class="ld-kpi-l">Revenue OTB</p><p class="ld-kpi-v">${ldMoney(totalOtb)}</p><p class="ld-kpi-s">${ldMoney(realized)} realized</p></div>
      <div class="ld-kpi"><p class="ld-kpi-l">vs Same Time LY</p><p class="ld-kpi-v" style="color:${vsCol.color};">${ldSignedPct(vsStly)}</p><p class="ld-kpi-s">comparable months</p></div>
      <div class="ld-kpi"><p class="ld-kpi-l">Open Inventory</p><p class="ld-kpi-v">${ldMoney(potential)}</p><p class="ld-kpi-s">bookable · final price</p></div>
      <div class="ld-kpi"><p class="ld-kpi-l">Fwd RevPAR Index</p><p class="ld-kpi-v" style="color:${rpiCol.color};">${fwdRpi != null ? Math.round(fwdRpi) : '—'}</p><p class="ld-kpi-s">100 = market</p></div>
    </div>`;

  // Revenue chart: OTB + STLY bars + LY final line.
  const H = 300;
  const max = ldNiceMax(Math.max(1, ...ms.map((m) => Math.max(m.revenue || 0, m.revenueStly || 0, m.revenueLy || 0))));
  const slot = ldSlot(ms.length), bw = Math.min(13, slot * 0.3);
  const bars = ms.map((m, i) => {
    const cx = LDL + slot * i + slot / 2;
    const groups = [
      { v: m.revenue, fill: c.cedar },
      { v: m.revenueStly, fill: c.moss },
    ];
    const t = ldTip(`${m.label} ${m.year}`, [['On the books', ldMoney(m.revenue)], ['Same time LY', ldMoney(m.revenueStly)], ['LY final', ldMoney(m.revenueLy)], ['YoY', m.revenueYoy == null ? '—' : ldSignedPct(m.revenueYoy)]]);
    return groups.map((g, gi) => {
      const x = cx - bw - 1 + gi * (bw + 2);
      const yy = ldY(g.v, max, H), h = LDT + (H - LDT - LDB) - yy;
      return `<rect class="ld-bar" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${g.fill}" data-tip="${t}"></rect>`;
    }).join('');
  }).join('');
  const lyLine = ldLine(ms, (m) => m.revenueLy, max, H, c.tobacco, true, null);
  const svg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H}" role="img" aria-label="Revenue on the books">${ldGrid(H, max, 4, ldK)}${bars}${lyLine}${ldXLabels(H, ms)}</svg>`;
  const chart = ldChartCard(`Revenue on the books · ${listing.months[0]?.year || ''}`, 'On the books vs same time last year, with last year’s final close', svg,
    ldLegend([[c.cedar, 'On the books'], [c.moss, 'Same time LY'], [c.tobacco, 'LY final', true]]));

  // Focus list.
  const flags = [];
  fwd.forEach((m) => {
    const pot = m.potentialRevenue || 0;
    if (m.revenue === 0 && pot > 0) { flags.push({ lvl: 0, mo: m.label, txt: `Nothing on the books — ${ldMoney(pot)} open. Check rates, min-stay & visibility.` }); return; }
    if (m.revparIndex != null && m.revparIndex < 100) flags.push({ lvl: 0, mo: m.label, txt: `RevPAR Index ${Math.round(m.revparIndex)} — below market with ${ldMoney(pot)} still bookable.` });
    else if (m.occ != null && m.marketOcc != null && m.occ + 5 < m.marketOcc && pot > 0) flags.push({ lvl: 1, mo: m.label, txt: `Occupancy ${Math.round(m.occ)}% vs market ${Math.round(m.marketOcc)}% — ${ldMoney(pot)} open.` });
    else if (m.revenueYoy != null && m.revenueYoy < -25) flags.push({ lvl: 1, mo: m.label, txt: `Pacing ${ldSignedPct(m.revenueYoy)} vs STLY with ${ldMoney(pot)} of inventory left.` });
    else if (m.revenueYoy != null && m.revenueYoy > 25 && m.revparIndex != null && m.revparIndex >= 100) flags.push({ lvl: 2, mo: m.label, txt: `Pacing ${ldSignedPct(m.revenueYoy)} ahead of STLY (RPI ${Math.round(m.revparIndex)}) — hold price.` });
  });
  flags.sort((a, b) => a.lvl - b.lvl);
  const tone = [
    { label: 'Action', color: c.error, bg: c.errorBg },
    { label: 'Watch', color: c.warning, bg: c.warningBg },
    { label: 'Healthy', color: c.success, bg: c.successBg },
  ];
  const focus = `<div class="ld-card"><p class="ld-card-title">Focus list</p><p class="ld-card-desc">Forward months · sorted by severity</p>${flags.length === 0
    ? `<p class="ld-empty">No flags for the forward months.</p>`
    : flags.slice(0, 12).map((fl) => `<div class="ld-flag" style="background:${tone[fl.lvl].bg};"><span class="ld-flag-lvl" style="color:${tone[fl.lvl].color};">${tone[fl.lvl].label}</span><span class="ld-flag-mo">${fl.mo}</span><span class="ld-flag-txt">${escapeHtml(fl.txt)}</span></div>`).join('')}</div>`;

  return kpis + chart + focus;
}

// Visual-only dots on a line series (tooltips come from the hover bands).
function ldDots(months, get, max, H, color) {
  const slot = ldSlot(months.length);
  return months
    .map((m, i) => {
      const v = get(m);
      if (v == null) return '';
      const cx = LDL + slot * i + slot / 2;
      const cy = ldY(v, max, H);
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${c.paper}" stroke="${color}" stroke-width="2"></circle>`;
    })
    .join('');
}

// Filled area under a line series (adds weight to the primary line).
function ldArea(months, get, max, H, color, opacity) {
  const slot = ldSlot(months.length);
  const pts = [];
  months.forEach((m, i) => {
    const v = get(m);
    if (v == null) return;
    pts.push([LDL + slot * i + slot / 2, ldY(v, max, H)]);
  });
  if (pts.length < 2) return '';
  const base = H - LDB;
  let d = `M ${pts[0][0].toFixed(1)} ${base.toFixed(1)}`;
  pts.forEach((p) => { d += ` L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`; });
  d += ` L ${pts[pts.length - 1][0].toFixed(1)} ${base.toFixed(1)} Z`;
  return `<path d="${d}" fill="${color}" fill-opacity="${opacity}"></path>`;
}

// One invisible full-height hover zone per month → a single rich tooltip for the
// whole column (best-practice hit target for line/grouped charts). Render LAST.
function ldHoverBands(months, H, tipFn) {
  const slot = ldSlot(months.length);
  const top = LDT;
  const h = H - LDT - LDB;
  return months
    .map((m, i) => `<rect class="ld-hband" x="${(LDL + slot * i).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${h.toFixed(1)}" data-tip="${tipFn(m)}"></rect>`)
    .join('');
}

// Shaded region + dashed guide marking where actuals end and forecast begins.
function ldForecastGuide(months, H, asOf) {
  const idx = months.findIndex((m) => m.year * 100 + m.monthNum >= asOf);
  if (idx <= 0) return '';
  const slot = ldSlot(months.length);
  const dx = LDL + slot * idx;
  const top = LDT;
  const bot = H - LDB;
  return `<rect x="${dx.toFixed(1)}" y="${top}" width="${(LDW - LDR - dx).toFixed(1)}" height="${(bot - top).toFixed(1)}" fill="${c.level3}" opacity="0.25"></rect>` +
    `<line x1="${dx.toFixed(1)}" y1="${top}" x2="${dx.toFixed(1)}" y2="${bot.toFixed(1)}" stroke="${c.walnut}" stroke-width="1" stroke-dasharray="3 4" opacity="0.55"></line>` +
    `<text x="${(dx + 6).toFixed(1)}" y="${(top + 12).toFixed(1)}" font-family="${f.body}" font-size="9" fill="${c.walnut}">forecast →</text>`;
}

// ---- Market Position ----
function ldMarket(listing, asOf) {
  const ms = listing.months;
  // RevPAR Index
  const H1 = 240;
  const maxRpi = ldNiceMax(Math.max(120, ...ms.map((m) => m.revparIndex || 0)));
  const slot1 = ldSlot(ms.length), bw1 = Math.min(30, slot1 * 0.44);
  const rpiBars = ms.map((m, i) => {
    const cx = LDL + slot1 * i + slot1 / 2, v = m.revparIndex || 0;
    const yy = ldY(v, maxRpi, H1), h = LDT + (H1 - LDT - LDB) - yy;
    const fill = v === 0 ? c.level3 : v >= 100 ? c.cedar : c.error;
    const t = ldTip(`${m.label} ${m.year}`, [['RevPAR Index', v ? Math.round(v) : '—'], ['Occ', formatPercent(m.occ)], ['Mkt Occ', formatPercent(m.marketOcc)]]);
    return `<rect class="ld-bar" x="${(cx - bw1 / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${bw1.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="4" fill="${fill}" data-tip="${t}"></rect>`;
  }).join('');
  const rpiSvg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H1}" role="img" aria-label="RevPAR Index">${ldGrid(H1, maxRpi, 4, (v) => Math.round(v))}${ldRefLine(100, maxRpi, H1, '100')}${rpiBars}${ldXLabels(H1, ms)}</svg>`;
  const rpiCard = ldChartCard('RevPAR Index', '100 = market parity · above is outperforming the comp set', rpiSvg);

  // Occupancy — full-width area+line chart with per-column hover zones.
  const H2 = 320;
  const occTip = (m) => ldTip(`${m.label} ${m.year}`, [
    ['Listing', formatPercent(m.occ)],
    ['Market', formatPercent(m.marketOcc)],
    ['Listing LY', formatPercent(m.occLy)],
    ['Gap vs market', ldSignedPp(m.occ != null && m.marketOcc != null ? m.occ - m.marketOcc : null)],
  ]);
  const occSvg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H2}" role="img" aria-label="Occupancy vs market">` +
    `${ldGrid(H2, 100, 4, (v) => Math.round(v) + '%')}` +
    `${ldForecastGuide(ms, H2, asOf)}` +
    `${ldArea(ms, (m) => m.occ, 100, H2, c.cedar, 0.08)}` +
    `${ldLine(ms, (m) => m.occLy, 100, H2, c.moss, false, null)}` +
    `${ldLine(ms, (m) => m.marketOcc, 100, H2, c.walnut, true, null)}` +
    `${ldLine(ms, (m) => m.occ, 100, H2, c.cedar, false, null)}` +
    `${ldDots(ms, (m) => m.occ, 100, H2, c.cedar)}` +
    `${ldHoverBands(ms, H2, occTip)}` +
    `${ldXLabels(H2, ms)}</svg>`;
  const occCard = ldChartCard('Occupancy vs market', '% booked · listing vs comp set vs last year', occSvg,
    ldLegend([[c.cedar, 'Listing'], [c.walnut, 'Market', true], [c.moss, 'Listing LY', true]]));

  // ADR — full-width grouped bars with per-column hover zones.
  const H3 = 320;
  const maxAdr = ldNiceMax(Math.max(1, ...ms.map((m) => Math.max(m.adr || 0, m.marketAdr || 0))));
  const slot3 = ldSlot(ms.length), bw3 = Math.min(22, slot3 * 0.34);
  const adrBars = ms.map((m, i) => {
    const cx = LDL + slot3 * i + slot3 / 2;
    const groups = [{ v: m.adr, fill: c.cedar }, { v: m.marketAdr, fill: c.moss }];
    return groups.map((g, gi) => {
      const x = cx - bw3 - 1 + gi * (bw3 + 2), yy = ldY(g.v, maxAdr, H3), h = LDT + (H3 - LDT - LDB) - yy;
      return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw3.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${g.fill}"></rect>`;
    }).join('');
  }).join('');
  const adrTip = (m) => {
    const prem = m.marketAdr && m.adr != null ? (m.adr / m.marketAdr - 1) * 100 : null;
    return ldTip(`${m.label} ${m.year}`, [
      ['Listing ADR', ldMoney(m.adr)],
      ['Market ADR', ldMoney(m.marketAdr)],
      ['Premium', ldSignedPct(prem)],
      ['ADR YoY', ldSignedPct(m.adrYoy)],
    ]);
  };
  const adrSvg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H3}" role="img" aria-label="ADR vs market">` +
    `${ldGrid(H3, maxAdr, 4, (v) => '$' + Math.round(v))}` +
    `${ldForecastGuide(ms, H3, asOf)}` +
    `${adrBars}` +
    `${ldHoverBands(ms, H3, adrTip)}` +
    `${ldXLabels(H3, ms)}</svg>`;
  const adrCard = ldChartCard('ADR vs market', 'Achieved nightly rate vs comp set', adrSvg,
    ldLegend([[c.cedar, 'Listing ADR'], [c.moss, 'Market ADR']]));

  // Position detail table
  const rows = ms.map((m) => {
    const gap = m.occ != null && m.marketOcc != null ? m.occ - m.marketOcc : null;
    const prem = m.adr != null && m.marketAdr ? (m.adr / m.marketAdr - 1) * 100 : null;
    const past = m.year * 100 + m.monthNum < 0; // never dim; kept for parity
    return `<tr>
      <td>${m.label}</td>
      <td class="mono" style="color:${m.revparIndex == null ? c.walnut : m.revparIndex >= 100 ? c.onyx : c.error};font-weight:600;">${m.revparIndex != null ? Math.round(m.revparIndex) : '—'}</td>
      <td class="mono">${formatPercent(m.occ)}</td>
      <td class="mono" style="color:${c.walnut};">${formatPercent(m.marketOcc)}</td>
      <td class="mono" style="color:${gap == null ? c.walnut : gap >= 0 ? c.success : c.error};font-weight:600;">${ldSignedPp(gap)}</td>
      <td class="mono">${ldMoney(m.adr)}</td>
      <td class="mono" style="color:${c.walnut};">${ldMoney(m.marketAdr)}</td>
      <td class="mono" style="color:${prem == null ? c.walnut : prem >= 0 ? c.success : c.error};">${ldSignedPct(prem)}</td>
      <td class="mono"><span class="badge" style="color:${yoyColor(m.adrYoy).color};background:${yoyColor(m.adrYoy).bg};">${ldSignedPct(m.adrYoy)}</span></td>
    </tr>`;
  }).join('');
  const table = `<div class="ld-card"><p class="ld-card-title">Position detail</p><div class="ld-table-wrap"><table class="ld-table"><thead><tr><th>Month</th><th class="num">RPI</th><th class="num">Occ</th><th class="num">Mkt Occ</th><th class="num">Occ Gap</th><th class="num">ADR</th><th class="num">Mkt ADR</th><th class="num">ADR Prem.</th><th class="num">ADR YoY</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;

  return rpiCard + occCard + adrCard + table;
}

// ---- Booking Window ----
function ldBookingWindow(listing) {
  const ms = listing.months;
  const H = 280;
  const max = ldNiceMax(Math.max(1, ...ms.map((m) => Math.max(m.bookingWindow || 0, m.marketBookingWindow || 0, m.bookingWindowLy || 0))));
  const svg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H}" role="img" aria-label="Median booking window">${ldGrid(H, max, 4, (v) => Math.round(v))}${ldRefLine(30, max, H, '30d')}${ldRefLine(90, max, H, '90d')}${ldLine(ms, (m) => m.bookingWindowLy, max, H, c.moss, false, null)}${ldLine(ms, (m) => m.marketBookingWindow, max, H, c.walnut, true, null)}${ldLine(ms, (m) => m.bookingWindow, max, H, c.cedar, false, (m) => ldTip(`${m.label} ${m.year}`, [['Listing', ldDays(m.bookingWindow)], ['Market', ldDays(m.marketBookingWindow)], ['Listing LY', ldDays(m.bookingWindowLy)]]))}${ldXLabels(H, ms)}</svg>`;
  const chart = ldChartCard('Median booking window', 'Days before check-in · higher = guests book earlier', svg,
    ldLegend([[c.cedar, 'Listing'], [c.walnut, 'Market', true], [c.moss, 'Listing LY']]));

  const bucket = (d) => {
    if (d == null) return null;
    if (d <= 30) return { label: 'Last-minute', color: c.error, bg: c.errorBg };
    if (d <= 90) return { label: 'Pickup chase', color: c.warning, bg: c.warningBg };
    if (d <= 120) return { label: 'Far-out', color: c.walnut, bg: c.level2 };
    return { label: 'Anchor', color: c.success, bg: c.successBg };
  };
  const rows = ms.map((m) => {
    const diff = m.bookingWindow != null && m.marketBookingWindow != null ? m.bookingWindow - m.marketBookingWindow : null;
    const b = bucket(m.marketBookingWindow);
    return `<tr>
      <td>${m.label}</td>
      <td class="mono" style="font-weight:600;">${ldDays(m.bookingWindow)}</td>
      <td class="mono" style="color:${c.walnut};">${ldDays(m.marketBookingWindow)}</td>
      <td class="mono" style="color:${diff == null ? c.walnut : diff >= 0 ? c.success : c.warning};font-weight:600;">${diff == null ? '—' : (diff > 0 ? '+' : '') + Math.round(diff) + ' d'}</td>
      <td class="mono" style="color:${c.walnut};">${ldDays(m.bookingWindowLy)}</td>
      <td>${b ? `<span class="badge" style="color:${b.color};background:${b.bg};">${b.label}</span>` : '—'}</td>
    </tr>`;
  }).join('');
  const table = `<div class="ld-card"><p class="ld-card-title">Window detail</p><p class="ld-card-desc">≤30d last-minute · 31–90d pickup chase · 91–120d far-out · 120d+ anchor (by market window)</p><div class="ld-table-wrap"><table class="ld-table"><thead><tr><th>Month</th><th class="num">Listing</th><th class="num">Market</th><th class="num">Δ vs Mkt</th><th class="num">Listing LY</th><th>Demand pattern</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;

  return chart + table;
}

// ---- Pacing ----
function ldPacing(listing, asOf) {
  const ms = listing.months;
  const H = 300;
  const max = ldNiceMax(Math.max(1, ...ms.map((m) => Math.max((m.revenue || 0) + (m.potentialRevenue || 0), m.revenueLy || 0))));
  const slot = ldSlot(ms.length), bw = Math.min(30, slot * 0.5);
  const bars = ms.map((m, i) => {
    const cx = LDL + slot * i + slot / 2, x = cx - bw / 2;
    const rev = m.revenue || 0, pot = m.potentialRevenue || 0;
    const yRev = ldY(rev, max, H), hRev = LDT + (H - LDT - LDB) - yRev;
    const yTop = ldY(rev + pot, max, H), hPot = yRev - yTop;
    const t = ldTip(`${m.label} ${m.year}`, [['On the books', ldMoney(rev)], ['Open inventory', ldMoney(pot)], ['Ceiling', ldMoney(rev + pot)], ['LY final', ldMoney(m.revenueLy)]]);
    return `<rect class="ld-bar" x="${x.toFixed(1)}" y="${yRev.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, hRev).toFixed(1)}" fill="${c.cedar}" data-tip="${t}"></rect>` +
      `<rect class="ld-bar" x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, hPot).toFixed(1)}" rx="2" fill="${c.moss}" fill-opacity="0.55" data-tip="${t}"></rect>`;
  }).join('');
  const lyLine = ldLine(ms, (m) => m.revenueLy, max, H, c.tobacco, true, null);
  const svg = `<svg class="ld-svg" viewBox="0 0 ${LDW} ${H}" role="img" aria-label="Booked vs still bookable">${ldGrid(H, max, 4, ldK)}${bars}${lyLine}${ldXLabels(H, ms)}</svg>`;
  const chart = ldChartCard('Booked vs still bookable', 'On the books + open inventory at final price; dashed = last year final close', svg,
    ldLegend([[c.cedar, 'On the books'], [c.moss, 'Open inventory'], [c.tobacco, 'LY final', true]]));

  const t = { rev: 0, stly: 0, ly: 0, pot: 0 };
  ms.forEach((m) => { t.rev += m.revenue || 0; t.stly += m.revenueStly || 0; t.ly += m.revenueLy || 0; t.pot += m.potentialRevenue || 0; });
  const rows = ms.map((m) => {
    const pctLy = m.revenueLy && m.revenueLy > 0 ? (m.revenue / m.revenueLy) * 100 : null;
    const isNow = m.year * 100 + m.monthNum === asOf;
    return `<tr>
      <td>${m.label}${isNow ? ` <span class="ld-now">NOW</span>` : ''}</td>
      <td class="mono" style="font-weight:600;">${ldMoney(m.revenue)}</td>
      <td class="mono" style="color:${c.walnut};">${m.revenueStly && m.revenueStly > 0 ? ldMoney(m.revenueStly) : '—'}</td>
      <td class="mono"><span class="badge" style="color:${yoyColor(m.revenueYoy).color};background:${yoyColor(m.revenueYoy).bg};">${ldSignedPct(m.revenueYoy)}</span></td>
      <td class="mono" style="color:${c.walnut};">${ldMoney(m.revenueLy)}</td>
      <td class="mono" style="color:${pctLy != null && pctLy >= 100 ? c.success : c.walnut};">${pctLy != null ? Math.round(pctLy) + '%' : '—'}</td>
      <td class="mono">${formatPercent(m.occ)}</td>
      <td class="mono" style="color:${(m.potentialRevenue || 0) > 0 ? c.onyx : c.walnut};">${(m.potentialRevenue || 0) > 0 ? ldMoney(m.potentialRevenue) : '—'}</td>
      <td class="mono" style="font-weight:600;">${ldMoney((m.revenue || 0) + (m.potentialRevenue || 0))}</td>
    </tr>`;
  }).join('');
  const foot = `<tr class="ld-total"><td>Total</td><td class="mono">${ldMoney(t.rev)}</td><td class="mono" style="color:${c.walnut};">${ldMoney(t.stly)}</td><td></td><td class="mono" style="color:${c.walnut};">${ldMoney(t.ly)}</td><td class="mono" style="color:${c.walnut};">${t.ly > 0 ? Math.round((t.rev / t.ly) * 100) + '%' : '—'}</td><td></td><td class="mono" style="color:${c.walnut};">${ldMoney(t.pot)}</td><td class="mono">${ldMoney(t.rev + t.pot)}</td></tr>`;
  const table = `<div class="ld-card"><p class="ld-card-title">Monthly pacing detail</p><div class="ld-table-wrap"><table class="ld-table"><thead><tr><th>Month</th><th class="num">OTB</th><th class="num">STLY</th><th class="num">vs STLY</th><th class="num">LY Final</th><th class="num">% of LY</th><th class="num">Occ</th><th class="num">Open Inv.</th><th class="num">Ceiling</th></tr></thead><tbody>${rows}${foot}</tbody></table></div></div>`;

  return chart + table;
}

const LD_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'market', label: 'Market Position' },
  { id: 'booking', label: 'Booking Window' },
  { id: 'pacing', label: 'Pacing' },
];

// Shared hover-tooltip: any [data-tip] element drives the single #ld-tip. Used by
// both the portfolio pacing chart and the per-listing detail. No backticks / ${}.
const TOOLTIP_JS = `
(function(){
  var tipEl=document.getElementById('ld-tip'); if(!tipEl) return;
  function place(e){
    var w=tipEl.offsetWidth,h=tipEl.offsetHeight,vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
    var x=e.clientX+14; if(x+w>vw-8) x=e.clientX-14-w;
    var y=e.clientY+14; if(y+h>vh-8) y=e.clientY-14-h;
    tipEl.style.left=x+'px'; tipEl.style.top=y+'px';
  }
  document.addEventListener('mouseover', function(e){
    var el=e.target.closest && e.target.closest('[data-tip]'); if(!el) return;
    tipEl.innerHTML=el.getAttribute('data-tip'); tipEl.style.opacity='1'; place(e);
  });
  document.addEventListener('mousemove', function(e){ if(tipEl.style.opacity==='1') place(e); });
  document.addEventListener('mouseout', function(e){ var el=e.target.closest && e.target.closest('[data-tip]'); if(el) tipEl.style.opacity='0'; });
})();
`;

// Sub-tab switching for the per-listing detail. Tooltip handled by TOOLTIP_JS.
const LISTING_DETAIL_JS = `
(function(){
  var root=document.querySelector('.ld-view'); if(!root) return;
  root.setAttribute('data-js','1');
  var tabs=root.querySelectorAll('.ld-tab'), panels=root.querySelectorAll('.ld-panel');
  function show(name){
    tabs.forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-view')===name); });
    panels.forEach(function(p){ p.hidden = p.getAttribute('data-panel')!==name; });
  }
  if(panels.length) show(panels[0].getAttribute('data-panel'));
  tabs.forEach(function(t){ t.addEventListener('click', function(){ show(t.getAttribute('data-view')); }); });
})();
`;

function renderListingDetail(client, listing, data) {
  const asOf = data.asOf;
  const panels = {
    overview: ldOverview(listing, asOf),
    market: ldMarket(listing, asOf),
    booking: ldBookingWindow(listing),
    pacing: ldPacing(listing, asOf),
  };
  const tabBar = LD_TABS.map((t, i) => `<button type="button" class="ld-tab${i === 0 ? ' active' : ''}" data-view="${t.id}">${t.label}</button>`).join('');
  const panelHtml = LD_TABS.map((t) => `<section class="ld-panel" data-panel="${t.id}"><p class="ld-panel-h">${t.label}</p>${panels[t.id]}</section>`).join('');

  return `
<div class="ld-view">
  <a class="ld-back" href="${pricingBackHref(client)}">← Back to portfolio</a>
  <div class="ld-head">
    <h2 class="ld-name">${escapeHtml(listing.name)}</h2>
    <p class="ld-meta">${escapeHtml(listing.city || '')}${listing.bedrooms ? ` · ${listing.bedrooms} bedrooms` : ''}${listing.group ? ` · ${escapeHtml(listing.group)}` : ''}</p>
  </div>
  <div class="ld-tabs">${tabBar}</div>
  ${panelHtml}
</div>
<script>${LISTING_DETAIL_JS}</script>`;
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

// Drill-down / back links for the SEO tab. Server-routed (work without JS);
// the shared client script may intercept them for an instant, no-reload switch.
function seoDrillHref(client, listingId) {
  return `/api/dashboard/${encodeURIComponent(client.id)}?tab=seo` +
    `&listing=${encodeURIComponent(listingId)}` +
    `&token=${encodeURIComponent(client.token || '')}`;
}

function seoBackHref(client) {
  return `/api/dashboard/${encodeURIComponent(client.id)}?tab=seo` +
    `&token=${encodeURIComponent(client.token || '')}`;
}

function renderSeoBackLink(client) {
  return `<a class="seo-back" href="${seoBackHref(client)}" data-seo-back>← Back to portfolio</a>`;
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

// Portfolio small-multiples (2–7 listings). Each card links to its single view.
function renderSeoPortfolioCards(seo, client) {
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
      return `<a class="card" href="${seoDrillHref(client, l.hubListingId)}" data-seo-drill="${escapeHtml(String(l.hubListingId))}"><div class="top"><div><div class="nm">${escapeHtml(l.name)}</div><div class="cy">${escapeHtml(l.city || '')}</div></div><span class="rankchip" style="background:${rc.bg};color:${rc.color};">${rank != null ? 'city rank #' + rank : '—'}</span></div><div class="ribbon">${tiles}</div>${diag}<span class="card-cta">View funnel →</span></a>`;
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

// Portfolio matrix / heatmap (8+ listings). The listing name links to its view.
function renderSeoPortfolioMatrix(seo, client) {
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
      return `<tr><td class="lh"><a class="row-link" href="${seoDrillHref(client, l.hubListingId)}" data-seo-drill="${escapeHtml(String(l.hubListingId))}"><span class="pn">${escapeHtml(l.name.slice(0, 40))}</span><span class="pc">${escapeHtml(l.city || '')}</span><span class="row-cta">View →</span></a></td><td><span class="cell" style="background:${rc.bg};color:${rc.color};">${rank != null ? '#' + rank : '—'}</span></td>${cells}<td><span class="hbadge" style="background:${hc.bg};color:${hc.color};">${l.health.above}/${l.health.total}</span></td><td><span class="leaktag" style="background:${c.errorBg};color:${c.error};">${ff}</span></td></tr>`;
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
function renderSeoTab(client, seo, selectedListing) {
  if (!seo || !seo.listings || seo.listings.length === 0) {
    return renderSeoEmptyState();
  }
  const n = seo.listings.length;

  // Drill-down: a selected listing (from ?listing=) renders the single view. With
  // more than one listing in the portfolio we prepend a "back to portfolio" link.
  if (selectedListing != null) {
    const picked = seo.listings.find(
      (l) => String(l.hubListingId) === String(selectedListing)
    );
    if (picked) {
      const back = n > 1 ? renderSeoBackLink(client) : '';
      return `<div class="seo-view">${back}${renderSeoSingle(picked, seo)}</div>`;
    }
  }

  let body;
  if (n >= SEO_LAYOUT.matrixMin) body = renderSeoPortfolioMatrix(seo, client);
  else if (n >= SEO_LAYOUT.cardsMin) body = renderSeoPortfolioCards(seo, client);
  else body = renderSeoSingle(seo.listings[0], seo);
  return `<div class="seo-view">${body}</div>`;
}

// --- Main exports ---

function renderDashboard(client, data, { tab = 'pricing', seo = null, listing = null } = {}) {
  const isSeo = tab === 'seo';

  // Header derives its "last updated" line + mock badge from the active dataset.
  const headerData = isSeo ? (seo || { fetchedAt: null, isUsingMockData: false }) : data;

  // Pricing drill-down: a selected listing (from ?listing=) with report data
  // renders the per-listing detail; otherwise the portfolio roll-up.
  const pickedListing =
    !isSeo && listing != null && data.source === 'report'
      ? data.listings.find((l) => String(l.listingId) === String(listing))
      : null;

  const body = isSeo
    ? renderSeoTab(client, seo, listing)
    : pickedListing
    ? renderListingDetail(client, pickedListing, data)
    : data.source === 'report'
    ? `${renderReportKpiCards(computeReportKpis(data), data)}
    ${renderPacingChart(data)}
    ${renderReportTable(data, client)}`
    : `${renderKpiCards(computeKpis(data))}
    ${renderListingsTable(data)}`;

  // Report-backed pricing views (portfolio + per-listing detail) carry [data-tip]
  // chart columns; mount the single shared tooltip + its handler for them.
  const needsTooltip = !isSeo && data && data.source === 'report';
  const tipEl = needsTooltip ? '<div id="ld-tip"></div>' : '';
  const tipScript = needsTooltip ? `<script>${TOOLTIP_JS}</script>` : '';

  const title = isSeo
    ? `${client.name} \u2014 SEO Visibility | RevFactor`
    : `${client.name} \u2014 Pricing Dashboard | RevFactor`;

  return `${htmlHead(title)}
<body>
${tipEl}
<div class="container">
  <div class="paper">
    ${renderHeader(client, headerData)}
    ${renderTabs(tab, client)}
    ${body}
    ${renderFooter()}
  </div>
</div>
${tipScript}
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
