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

function renderFooter() {
  return `
<footer class="footer">
  ${logoSvgSmall}
  <p class="footer-label">Managed by RevFactor</p>
  <p class="footer-tagline">intelligent pricing for inspired stays</p>
</footer>`;
}

// --- Main exports ---

function renderDashboard(client, data) {
  const kpis = computeKpis(data);

  return `${htmlHead(`${client.name} \u2014 Pricing Dashboard | RevFactor`)}
<body>
<div class="container">
  <div class="paper">
    ${renderHeader(client, data)}
    ${renderKpiCards(kpis)}
    ${renderListingsTable(data)}
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
