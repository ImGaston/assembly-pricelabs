import { c, f, escapeHtml, htmlHead, renderHeader, renderFooter, TOOLTIP_JS } from '../render.js';
import { DOW_NAMES } from '../day-of-week.js';

// "Performance Report" model: one scrolling page (no tabs) — year / month KPI
// cards, Airbnb funnel cards, per-listing table, month-over-month charts + table,
// day-of-week insights and a metric glossary. Server-rendered, no client JS.
//
// Data: report (lib/reports.js) + SEO (lib/seo.js) + day-of-week (lib/day-of-week.js).
// SEO has no prior-year history, so funnel deltas compare against similar listings.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

// --- number helpers ---

const sum = (xs) => xs.reduce((s, x) => s + (x || 0), 0);
function mean(xs) {
  const v = xs.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? sum(v) / v.length : null;
}
const daysIn = (year, m) => new Date(Date.UTC(year, m, 0)).getUTCDate();
const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

function money(n, decimals = 0) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function int(n) {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}
function pctFmt(n, decimals = 1) {
  return n == null ? '—' : `${n.toFixed(decimals)}%`;
}

// --- aggregation ---

/** Portfolio roll-up per month (1..12) from the report data. */
function monthlyPortfolio(data) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const rows = data.listings.map((l) => l.months.find((x) => x.monthNum === m)).filter(Boolean);
    const revenue = sum(rows.map((r) => r.revenue));
    const nights = sum(rows.map((r) => (r.revenue && r.adr ? r.revenue / r.adr : 0)));
    out.push({
      m,
      days: daysIn(data.year, m),
      revenue,
      revenueLy: sum(rows.map((r) => r.revenueLy)),
      revenueStly: sum(rows.map((r) => r.revenueStly)),
      revpar: mean(rows.map((r) => r.revpar)),
      revparLy: mean(rows.map((r) => r.revparLy)),
      revparStly: mean(rows.map((r) => r.revparStly)),
      marketRevpar: mean(rows.map((r) => r.marketRevpar)),
      marketRevparLy: mean(rows.map((r) => r.marketRevparLy)),
      occ: mean(rows.map((r) => r.occ)),
      occLy: mean(rows.map((r) => r.occLy)),
      occStly: mean(rows.map((r) => r.occStly)),
      marketOcc: mean(rows.map((r) => r.marketOcc)),
      marketOccLy: mean(rows.map((r) => r.marketOccLy)),
      adr: nights ? revenue / nights : mean(rows.map((r) => r.adr)),
    });
  }
  return out;
}

/** Day-weighted average of a monthly field over a set of months. */
function weighted(months, key) {
  const v = months.filter((x) => x[key] != null);
  const days = sum(v.map((x) => x.days));
  return days ? sum(v.map((x) => x[key] * x.days)) / days : null;
}

function periodKey(year, m) {
  return `${String(m).padStart(2, '0')}-${year}`;
}

/** SEO funnel totals for a set of periods and listings ({my, similar} per stage). */
function seoTotals(seoListings, periods) {
  const t = { imp: [0, 0], views: [0, 0], wish: [0, 0], book: [0, 0], any: false };
  for (const l of seoListings) {
    const at = (key, p) => (l.trend?.[key] || []).find((x) => x.period === p);
    for (const p of periods) {
      const imp = at('first_page_impressions', p);
      const views = at('views', p);
      const wish = at('wishlists', p);
      const br = at('booking_rate', p);
      if (imp?.my != null || views?.my != null) t.any = true;
      t.imp[0] += imp?.my || 0;
      t.imp[1] += imp?.similar || 0;
      t.views[0] += views?.my || 0;
      t.views[1] += views?.similar || 0;
      t.wish[0] += wish?.my || 0;
      t.wish[1] += wish?.similar || 0;
      t.book[0] += ((br?.my || 0) / 100) * (views?.my || 0);
      t.book[1] += ((br?.similar || 0) / 100) * (views?.similar || 0);
    }
  }
  const ratio = (a, b) => (b ? (a / b) * 100 : null);
  return {
    any: t.any,
    impressions: t.imp[0],
    views: t.views[0],
    wishlists: t.wish[0],
    ctr: ratio(t.views[0], t.imp[0]),
    bookRate: ratio(t.book[0], t.views[0]),
    conversion: ratio(t.book[0], t.imp[0]),
    vs: {
      impressions: pct(t.imp[0], t.imp[1]),
      views: pct(t.views[0], t.views[1]),
      wishlists: pct(t.wish[0], t.wish[1]),
      ctr: ratio(t.views[0], t.imp[0]) != null && ratio(t.views[1], t.imp[1]) != null
        ? ratio(t.views[0], t.imp[0]) - ratio(t.views[1], t.imp[1])
        : null,
    },
  };
}

// --- pieces ---

function delta(value, { suffix = 'vs LY', pts = false } = {}) {
  if (value == null || Number.isNaN(value)) return `<span class="pr-delta">—</span>`;
  const up = value >= 0;
  const txt = pts ? `${Math.abs(value).toFixed(1)} pts` : `${Math.abs(value).toFixed(1)}%`;
  return `<span class="pr-delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${txt} ${escapeHtml(suffix)}</span>`;
}

function kpiCard({ tone, eyebrow, corner, stats }) {
  return `
<div class="pr-card ${tone}">
  <div class="pr-card-top"><span class="pr-eyebrow">${escapeHtml(eyebrow)}</span>${corner ? `<span class="pr-corner">${escapeHtml(corner)}</span>` : ''}</div>
  <div class="pr-stats${stats.length > 3 ? ' four' : ''}" style="grid-template-columns: repeat(${stats.length}, minmax(0, 1fr));">
    ${stats.map((s) => `<div><p class="pr-stat-label">${escapeHtml(s.label)}</p><p class="pr-stat-value">${s.value}</p>${s.delta}</div>`).join('')}
  </div>
</div>`;
}

const ICON_CHART = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 20h18M6 16v-4M10 16V8M14 16v-6M18 16V5"/></svg>`;
const ICON_BULB = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"/></svg>`;

function sectionTitle(text, icon = ICON_CHART) {
  return `<h2 class="pr-h2">${icon ? `<span class="pr-icon">${icon}</span>` : ''}${escapeHtml(text)}</h2>`;
}

/** Table cell with a proportional background bar. */
function barCell(value, max, text) {
  const w = value != null && max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<td class="num bar"><span class="pr-bar" style="width:${w.toFixed(1)}%"></span><span class="pr-bar-text">${text}</span></td>`;
}

// --- charts (inline SVG) ---

const CW = 320;
const CH = 190;
const PAD = { l: 34, r: 6, t: 10, b: 24 };

function chartFrame(inner, { yTicks = [], yFmt = (v) => v, max }) {
  const ih = CH - PAD.t - PAD.b;
  const grid = yTicks
    .map((v) => {
      const y = PAD.t + ih - (v / max) * ih;
      return `<line x1="${PAD.l}" x2="${CW - PAD.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${c.level3}" stroke-width="0.6"/>
<text x="${PAD.l - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="pr-axis">${yFmt(v)}</text>`;
    })
    .join('');
  const iw = CW - PAD.l - PAD.r;
  const labels = MONTHS_SHORT.map(
    (m, i) => `<text x="${(PAD.l + (iw / 12) * (i + 0.5)).toFixed(1)}" y="${CH - 8}" text-anchor="middle" class="pr-axis">${m}</text>`
  ).join('');
  return `<svg viewBox="0 0 ${CW} ${CH}" class="pr-chart" role="img">${grid}${inner}${labels}</svg>`;
}

function niceMax(v) {
  if (!v) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil((v * 1.1) / p) * p;
}

function bars(series, max) {
  const ih = CH - PAD.t - PAD.b;
  const iw = CW - PAD.l - PAD.r;
  const slot = iw / 12;
  const bw = (slot * 0.7) / series.length;
  let out = '';
  for (let i = 0; i < 12; i++) {
    series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null) return;
      const h = (v / max) * ih;
      const x = PAD.l + slot * i + slot * 0.15 + bw * k;
      out += `<rect x="${x.toFixed(1)}" y="${(PAD.t + ih - h).toFixed(1)}" width="${(bw - 0.6).toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}"/>`;
    });
  }
  return out;
}

function line(values, max, { color, dash = '', width = 1.4, dots = false, area = false }) {
  const ih = CH - PAD.t - PAD.b;
  const iw = CW - PAD.l - PAD.r;
  const pts = values
    .map((v, i) => (v == null ? null : [PAD.l + (iw / 12) * (i + 0.5), PAD.t + ih - (v / max) * ih]))
    .filter(Boolean);
  if (pts.length < 2) return '';
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const fill = area
    ? `<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${PAD.t + ih}L${pts[0][0].toFixed(1)},${PAD.t + ih}Z" fill="${color}" opacity="0.08"/>`
    : '';
  const dotEls = dots ? pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2" fill="${color}"/>`).join('') : '';
  return `${fill}<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>${dotEls}`;
}

function legend(items) {
  return `<div class="pr-legend">${items
    .map((it) => `<span><i class="${it.kind}" style="--k:${it.color}"></i>${escapeHtml(it.name)}</span>`)
    .join('')}</div>`;
}

/**
 * Per-month hover columns. `rows(i)` returns [{ name, color, value, dash }] for the
 * tooltip; `extra(i)` an optional trailing [label, value] (e.g. YoY). Each column
 * carries a data-tip (styled tooltip, JS) and a <title> (native fallback, no JS).
 */
function hits(rows, extra) {
  const ih = CH - PAD.t - PAD.b;
  const iw = CW - PAD.l - PAD.r;
  const slot = iw / 12;
  let out = '';
  for (let i = 0; i < 12; i++) {
    const items = rows(i);
    const more = extra ? extra(i) : null;
    const html =
      `<b>${MONTHS[i]}</b>` +
      items
        .map((it) => `<span class="tt-row"><span class="tt-k"><i class="tt-sw${it.dash ? ' dash' : ''}" style="--k:${it.color}"></i>${escapeHtml(it.name)}</span><span class="tt-v">${it.value}</span></span>`)
        .join('') +
      (more ? `<span class="tt-row tt-sep"><span class="tt-k">${escapeHtml(more[0])}</span><span class="tt-v">${more[1]}</span></span>` : '');
    const plain = [MONTHS[i], ...items.map((it) => `${it.name}: ${it.value}`), ...(more ? [`${more[0]}: ${more[1]}`] : [])].join('\n');
    out += `<rect class="pr-hit" data-m="${i}" data-tip="${escapeHtml(html)}" x="${(PAD.l + slot * i).toFixed(1)}" y="${PAD.t}" width="${slot.toFixed(1)}" height="${ih}"><title>${escapeHtml(plain)}</title></rect>`;
  }
  return out;
}

function signed(n, unit = '%') {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}${unit}`;
}

function renderCharts(months, year) {
  const cy = String(year);
  const ly = String(year - 1);
  const C1 = c.cedar;
  const C2 = '#a9b5a6';
  const MK = c.walnut;

  const revMax = niceMax(Math.max(...months.flatMap((m) => [m.revenue, m.revenueLy || 0])));
  const revChart = chartFrame(
    bars(
      [
        { name: `Revenue ${cy}`, color: C1, values: months.map((m) => m.revenue) },
        { name: `Revenue ${ly}`, color: C2, values: months.map((m) => m.revenueLy || null) },
      ],
      revMax
    ) +
      hits(
        (i) => [
          { name: `Revenue ${cy}`, color: C1, value: money(months[i].revenue) },
          { name: `Revenue ${ly}`, color: C2, value: money(months[i].revenueLy || null) },
        ],
        (i) => ['vs last year', signed(pct(months[i].revenue, months[i].revenueLy))]
      ),
    { max: revMax, yTicks: [0, revMax / 2, revMax], yFmt: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`) }
  );

  const rpMax = niceMax(Math.max(...months.flatMap((m) => [m.revpar || 0, m.revparLy || 0, m.marketRevpar || 0, m.marketRevparLy || 0])));
  const rpChart = chartFrame(
    bars(
      [
        { name: `RevPAR ${cy}`, color: C1, values: months.map((m) => m.revpar) },
        { name: `RevPAR ${ly}`, color: C2, values: months.map((m) => m.revparLy) },
      ],
      rpMax
    ) +
      line(months.map((m) => m.marketRevpar), rpMax, { color: MK }) +
      line(months.map((m) => m.marketRevparLy), rpMax, { color: MK, dash: '3 2', width: 1 }) +
      hits(
        (i) => [
          { name: `RevPAR ${cy}`, color: C1, value: money(months[i].revpar, 2) },
          { name: `RevPAR ${ly}`, color: C2, value: money(months[i].revparLy, 2) },
          { name: `Market ${cy}`, color: MK, value: money(months[i].marketRevpar, 2) },
          { name: `Market ${ly}`, color: MK, dash: true, value: money(months[i].marketRevparLy, 2) },
        ],
        (i) => ['vs market', signed(pct(months[i].revpar, months[i].marketRevpar))]
      ),
    { max: rpMax, yTicks: [0, rpMax / 2, rpMax], yFmt: (v) => `$${Math.round(v)}` }
  );

  const occChart = chartFrame(
    line(months.map((m) => m.marketOccLy), 100, { color: MK, dash: '3 2', width: 1 }) +
      line(months.map((m) => m.marketOcc), 100, { color: MK }) +
      line(months.map((m) => m.occLy), 100, { color: C2, width: 1.2, dots: true }) +
      line(months.map((m) => m.occ), 100, { color: C1, width: 1.8, dots: true, area: true }) +
      hits(
        (i) => [
          { name: `Occupancy ${cy}`, color: C1, value: pctFmt(months[i].occ) },
          { name: `Occupancy ${ly}`, color: C2, value: pctFmt(months[i].occLy) },
          { name: `Market ${cy}`, color: MK, value: pctFmt(months[i].marketOcc) },
          { name: `Market ${ly}`, color: MK, dash: true, value: pctFmt(months[i].marketOccLy) },
        ],
        (i) => [
          'vs market',
          months[i].occ != null && months[i].marketOcc != null ? signed(months[i].occ - months[i].marketOcc, ' pts') : '—',
        ]
      ),
    { max: 100, yTicks: [0, 25, 50, 75, 100], yFmt: (v) => `${v}%` }
  );

  return `
<div class="pr-charts">
  <div class="pr-panel"><p class="pr-panel-title">Revenue vs last year</p>${revChart}
    ${legend([{ kind: 'sq', color: C1, name: `Revenue ${cy}` }, { kind: 'sq', color: C2, name: `Revenue ${ly}` }])}</div>
  <div class="pr-panel"><p class="pr-panel-title">RevPAR vs market</p>${rpChart}
    ${legend([{ kind: 'sq', color: C1, name: `RevPAR ${cy}` }, { kind: 'sq', color: C2, name: `RevPAR ${ly}` }, { kind: 'ln', color: MK, name: `Market ${cy}` }, { kind: 'dash', color: MK, name: `Market ${ly}` }])}</div>
  <div class="pr-panel"><p class="pr-panel-title">Occupancy vs market</p>${occChart}
    ${legend([{ kind: 'ln', color: C1, name: `Occupancy ${cy}` }, { kind: 'ln', color: C2, name: `Occupancy ${ly}` }, { kind: 'ln', color: MK, name: `Market ${cy}` }, { kind: 'dash', color: MK, name: `Market ${ly}` }])}</div>
</div>`;
}

// --- sections ---

function renderListingTable(data, seoById, asOfMonth) {
  const p = periodKey(data.year, asOfMonth);
  const rows = data.listings
    .map((l) => {
      const m = l.months.find((x) => x.monthNum === asOfMonth) || {};
      const seo = seoTotals(seoById.get(String(l.hubListingId)) ? [seoById.get(String(l.hubListingId))] : [], [p]);
      return { l, m, seo };
    })
    .sort((a, b) => (b.m.revenue || 0) - (a.m.revenue || 0));

  const allSeo = seoTotals([...new Set(rows.map((r) => seoById.get(String(r.l.hubListingId))).filter(Boolean))], [p]);
  const months = monthlyPortfolio(data);
  const tot = months[asOfMonth - 1];
  const seoCell = (s, v) => (s.any ? v : '—');

  return `
<div class="pr-table-wrap">
<table class="pr-table">
  <thead><tr><th>Listing</th><th class="num">Revenue ▼</th><th class="num">RevPAR</th><th class="num">ADR</th><th class="num">Occupancy</th><th class="num">Impr.</th><th class="num">Views</th><th class="num">CTR</th><th class="num">Wishlists</th><th class="num">Book %</th><th class="num">Conv. %</th></tr></thead>
  <tbody>
  ${rows
    .map(
      ({ l, m, seo }) => `<tr><td class="name">${escapeHtml(l.name)}</td><td class="num">${money(m.revenue)}</td><td class="num">${money(m.revpar, 2)}</td><td class="num">${money(m.adr, 2)}</td><td class="num">${pctFmt(m.occ)}</td><td class="num">${seoCell(seo, int(seo.impressions))}</td><td class="num">${seoCell(seo, int(seo.views))}</td><td class="num">${seoCell(seo, pctFmt(seo.ctr))}</td><td class="num">${seoCell(seo, int(seo.wishlists))}</td><td class="num">${seoCell(seo, pctFmt(seo.bookRate))}</td><td class="num">${seoCell(seo, pctFmt(seo.conversion, 2))}</td></tr>`
    )
    .join('')}
  </tbody>
  <tfoot><tr><td>Total</td><td class="num">${money(tot.revenue)}</td><td class="num">${money(tot.revpar, 2)}</td><td class="num">${money(tot.adr, 2)}</td><td class="num">${pctFmt(tot.occ)}</td><td class="num">${seoCell(allSeo, int(allSeo.impressions))}</td><td class="num">${seoCell(allSeo, int(allSeo.views))}</td><td class="num">${seoCell(allSeo, pctFmt(allSeo.ctr))}</td><td class="num">${seoCell(allSeo, int(allSeo.wishlists))}</td><td class="num">${seoCell(allSeo, pctFmt(allSeo.bookRate))}</td><td class="num">${seoCell(allSeo, pctFmt(allSeo.conversion, 2))}</td></tr></tfoot>
</table>
</div>`;
}

function renderMonthlyTable(months, seoListings, year, asOfMonth) {
  const rows = months.map((m) => ({ ...m, seo: seoTotals(seoListings, [periodKey(year, m.m)]) }));
  const max = (fn) => Math.max(0, ...rows.map(fn).filter((v) => v != null));
  const mx = {
    revenue: max((r) => r.revenue),
    revpar: max((r) => r.revpar),
    adr: max((r) => r.adr),
    occ: 100,
    imp: max((r) => r.seo.impressions),
    views: max((r) => r.seo.views),
    ctr: max((r) => r.seo.ctr),
    wish: max((r) => r.seo.wishlists),
  };
  const yearSeo = seoTotals(seoListings, months.map((m) => periodKey(year, m.m)));
  const totRevenue = sum(months.map((m) => m.revenue));
  const nights = sum(months.map((m) => (m.revenue && m.adr ? m.revenue / m.adr : 0)));
  const s = (seo, v) => (seo.any ? v : '—');

  return `
<div class="pr-table-wrap">
<table class="pr-table pr-monthly">
  <thead><tr><th>#</th><th>Year</th><th>Month</th><th class="num">Rental Revenue</th><th class="num">RevPAR</th><th class="num">ADR</th><th class="num">Occupancy</th><th class="num">Impressions</th><th class="num">Views</th><th class="num">CTR</th><th class="num">Wishlists</th></tr></thead>
  <tbody>
  ${rows
    .map(
      (r) => `<tr data-m="${r.m - 1}"><td class="muted">${r.m}.</td><td>${year}</td><td>${MONTHS[r.m - 1]}${r.m > asOfMonth ? ' <span class="pr-otb">OTB</span>' : ''}</td>
${barCell(r.revenue, mx.revenue, money(r.revenue))}${barCell(r.revpar, mx.revpar, money(r.revpar, 2))}${barCell(r.adr, mx.adr, money(r.adr, 2))}${barCell(r.occ, mx.occ, pctFmt(r.occ))}
${barCell(r.seo.any ? r.seo.impressions : null, mx.imp, s(r.seo, int(r.seo.impressions)))}${barCell(r.seo.any ? r.seo.views : null, mx.views, s(r.seo, int(r.seo.views)))}${barCell(r.seo.any ? r.seo.ctr : null, mx.ctr, s(r.seo, pctFmt(r.seo.ctr)))}${barCell(r.seo.any ? r.seo.wishlists : null, mx.wish, s(r.seo, int(r.seo.wishlists)))}</tr>`
    )
    .join('')}
  </tbody>
  <tfoot><tr><td></td><td colspan="2">Grand total</td><td class="num">${money(totRevenue)}</td><td class="num">${money(weighted(months, 'revpar'), 2)}</td><td class="num">${money(nights ? totRevenue / nights : null, 2)}</td><td class="num">${pctFmt(weighted(months, 'occ'))}</td><td class="num">${s(yearSeo, int(yearSeo.impressions))}</td><td class="num">${s(yearSeo, int(yearSeo.views))}</td><td class="num">${s(yearSeo, pctFmt(yearSeo.ctr))}</td><td class="num">${s(yearSeo, int(yearSeo.wishlists))}</td></tr></tfoot>
</table>
</div>
<p class="pr-note">OTB = on the books: future months show reservations confirmed as of the data refresh date.</p>`;
}

function renderDayOfWeek(dow) {
  if (!dow || !dow.rows?.length) return '';
  const rows = [...dow.rows].sort((a, b) => (b.occ || 0) - (a.occ || 0));
  const maxRev = Math.max(...rows.map((r) => r.revenue));
  const maxRp = Math.max(...rows.map((r) => r.revpar || 0));
  return `
${sectionTitle('Insights · Day of week', ICON_BULB)}
<div class="pr-table-wrap">
<table class="pr-table">
  <thead><tr><th>#</th><th>Day of week</th><th class="num">Rental Revenue</th><th class="num">RevPAR</th><th class="num">Occupancy ▼</th></tr></thead>
  <tbody>
  ${rows
    .map(
      (r, i) => `<tr><td class="muted">${i + 1}.</td><td>${escapeHtml(DOW_NAMES[r.dow])}</td>${barCell(r.revenue, maxRev, money(r.revenue, 2))}${barCell(r.revpar, maxRp, money(r.revpar, 2))}${barCell(r.occ, 100, pctFmt(r.occ))}</tr>`
    )
    .join('')}
  </tbody>
  <tfoot><tr><td></td><td>Grand total</td><td class="num">${money(dow.total.revenue, 2)}</td><td class="num">${money(dow.total.revpar, 2)}</td><td class="num">${pctFmt(dow.total.occ)}</td></tr></tfoot>
</table>
</div>
<p class="pr-note">Based on confirmed reservations for ${dow.year}; revenue is spread evenly across each stay's nights.</p>`;
}

const GLOSSARY = [
  ['ADR (Average Daily Rate)', 'Rental revenue divided by booked nights.'],
  ['Booking Rate', 'Bookings divided by listing views.'],
  ['CTR (Click-Through Rate)', 'Listing views divided by first-page impressions.'],
  ['Conversion Rate', 'Bookings made in the period divided by impressions.'],
  ['First Page Impressions', 'Times the listing appeared on the first page of Airbnb search results.'],
  ['Occupancy Rate', 'Booked nights divided by available nights. Owner blocks may count as booked.'],
  ['Rental Revenue', 'Total revenue from reservations staying in the period.'],
  ['RevPAR (Revenue per Available Rental night)', 'Rental revenue divided by available nights.'],
  ['Views', 'Visits to the listing page.'],
  ['Wishlists', 'Times guests saved the listing to a wishlist.'],
];

function renderGlossary() {
  return `
<h2 class="pr-h2">Metric Description</h2>
<div class="pr-table-wrap">
<table class="pr-table pr-glossary">
  <thead><tr><th>Metric</th><th>Description</th></tr></thead>
  <tbody>${GLOSSARY.map(([k, v]) => `<tr><td class="name">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody>
</table>
</div>`;
}

// --- styles ---

const CSS = `
  .pr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 40px; }
  .pr-card { border-radius: 6px; padding: 20px 22px; color: ${c.paper}; min-width: 0; container-type: inline-size; }
  .pr-card.tobacco { background: ${c.tobacco}; }
  .pr-card.cedar { background: ${c.cedar}; }
  .pr-card-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  .pr-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.85; }
  .pr-corner { font-family: ${f.display}; font-size: 22px; line-height: 1; }
  .pr-stats { display: grid; gap: 12px; }
  .pr-stat-label { font-size: 11px; opacity: 0.8; margin-bottom: 2px; }
  .pr-stat-value { font-family: ${f.display}; font-size: clamp(18px, 6.6cqi, 34px); line-height: 1.1; white-space: nowrap; }
  .pr-stats.four .pr-stat-value { font-size: clamp(16px, 5cqi, 26px); }
  .pr-delta { display: block; font-size: 10px; font-weight: 600; margin-top: 4px; opacity: 0.9; }
  .pr-delta.up { color: ${c.successBg}; }
  .pr-delta.down { color: ${c.errorBg}; }
  .pr-empty { font-size: 13px; opacity: 0.8; }

  .pr-h2 { display: flex; align-items: center; gap: 8px; font-family: ${f.body}; font-size: 18px; font-weight: 600; color: ${c.onyx}; margin: 8px 0 14px; }
  .pr-icon { display: inline-flex; color: ${c.tobacco}; }

  .pr-table-wrap { overflow-x: auto; border-radius: 6px; background: ${c.white}; margin-bottom: 8px; }
  .pr-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  .pr-table thead th { background: ${c.cedar}; color: ${c.paper}; font-family: ${f.body}; font-weight: 600; font-size: 11px; text-transform: none; letter-spacing: 0; text-align: left; padding: 10px 10px; white-space: nowrap; }
  .pr-table thead th.num { text-align: right; }
  .pr-table td { padding: 7px 10px; font-size: 12px; line-height: 1.4; white-space: nowrap; color: ${c.onyx}; }
  .pr-table tbody tr:nth-child(even) { background: ${c.level1}; }
  .pr-table tfoot td { background: ${c.level2}; font-weight: 700; padding: 9px 10px; }
  .pr-table .num { text-align: right; }
  .pr-table .name { font-weight: 500; }
  .pr-table .muted { color: ${c.walnut}; }
  .pr-table td.bar { position: relative; min-width: 90px; }
  .pr-bar { position: absolute; left: 8px; top: 6px; bottom: 6px; max-width: calc(100% - 16px); background: ${c.level3}; border-radius: 1px; }
  .pr-bar-text { position: relative; }
  .pr-otb { display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 1px 5px; border-radius: 2px; background: ${c.warningBg}; color: ${c.warning}; margin-left: 4px; }
  .pr-note { font-size: 11px; color: ${c.walnut}; margin: 6px 0 40px; }
  .pr-glossary td:last-child { white-space: normal; }

  .pr-charts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .pr-panel { background: ${c.white}; border-radius: 6px; padding: 16px; }
  .pr-panel-title { font-size: 12px; font-weight: 600; color: ${c.onyx}; margin-bottom: 8px; }
  .pr-chart { width: 100%; height: auto; display: block; }
  .pr-axis { font-family: ${f.body}; font-size: 9px; fill: ${c.walnut}; }
  .pr-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 10px; color: ${c.walnut}; }
  .pr-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .pr-legend i { display: inline-block; }
  .pr-legend i.sq { width: 8px; height: 8px; background: var(--k); }
  .pr-legend i.ln { width: 12px; height: 2px; background: var(--k); }
  .pr-legend i.dash { width: 12px; height: 2px; background: repeating-linear-gradient(90deg, var(--k) 0 3px, transparent 3px 5px); }

  .pr-hit { fill: ${c.cedar}; fill-opacity: 0; transition: fill-opacity .12s; }
  .pr-hit:hover, .pr-hit.pr-on { fill-opacity: 0.07; }
  .pr-monthly tbody tr.pr-on td { background: ${c.level2}; }
  #ld-tip { max-width: 260px; }
  #ld-tip .tt-k { display: inline-flex; align-items: center; gap: 6px; }
  #ld-tip .tt-sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--k); box-shadow: 0 0 0 1px rgba(252, 249, 242, 0.55); }
  #ld-tip .tt-sw.dash { height: 2px; border-radius: 0; box-shadow: none; background: repeating-linear-gradient(90deg, ${c.paper} 0 3px, transparent 3px 5px); }
  #ld-tip .tt-sep { margin-top: 5px; padding-top: 5px; box-shadow: inset 0 1px 0 rgba(252, 249, 242, 0.2); }

  @media (max-width: 900px) {
    .pr-grid { grid-template-columns: 1fr; }
    .pr-charts { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .pr-stats { grid-template-columns: 1fr 1fr !important; }
  }
`;

// Enhancement only: drop native <title> tooltips (the styled one replaces them)
// and highlight the hovered month across all three charts + the monthly table.
const SYNC_JS = `
(function(){
  document.querySelectorAll('.pr-hit title').forEach(function(t){ t.remove(); });
  var on=[];
  function clear(){ on.forEach(function(el){ el.classList.remove('pr-on'); }); on=[]; }
  document.addEventListener('mouseover', function(e){
    var el=e.target.closest && e.target.closest('.pr-hit[data-m], .pr-monthly tr[data-m]');
    if(!el) return;
    clear();
    on=Array.prototype.slice.call(document.querySelectorAll('[data-m="'+el.getAttribute('data-m')+'"]'));
    on.forEach(function(x){ x.classList.add('pr-on'); });
  });
  document.addEventListener('mouseout', function(e){
    var el=e.target.closest && e.target.closest('.pr-hit[data-m], .pr-monthly tr[data-m]');
    if(el && !(e.relatedTarget && el.contains(e.relatedTarget))) clear();
  });
})();
`;

// --- page ---

function render(client, data, { seo = null, dayOfWeek = null } = {}) {
  const now = new Date();
  const asOfMonth = data.asOf ? data.asOf % 100 : now.getMonth() + 1;
  const months = monthlyPortfolio(data);
  const cur = months[asOfMonth - 1];

  // Year: full calendar year (actuals + on the books), vs same time last year.
  const yRevenue = sum(months.map((m) => m.revenue));
  const yStly = sum(months.map((m) => m.revenueStly || m.revenueLy));
  const yRevpar = weighted(months, 'revpar');
  const yRevparStly = weighted(months, 'revparStly') ?? weighted(months, 'revparLy');
  const yOcc = weighted(months, 'occ');
  const yOccStly = weighted(months, 'occStly') ?? weighted(months, 'occLy');

  const seoListings = seo?.listings || [];
  const reportHubIds = new Set(data.listings.map((l) => String(l.hubListingId)).filter((x) => x !== 'null'));
  const scopedSeo = seoListings.filter((l) => reportHubIds.has(String(l.hubListingId)));
  const seoInScope = scopedSeo.length ? scopedSeo : seoListings;
  const seoById = new Map(seoInScope.map((l) => [String(l.hubListingId), l]));
  const funnelYear = seoTotals(seoInScope, months.map((m) => periodKey(data.year, m.m)));
  const funnelMonth = seoTotals(seoInScope, [periodKey(data.year, asOfMonth)]);

  const funnelCard = (tone, eyebrow, t) =>
    t.any
      ? kpiCard({
          tone,
          eyebrow,
          stats: [
            { label: 'Impressions', value: int(t.impressions), delta: delta(t.vs.impressions, { suffix: 'vs similar' }) },
            { label: 'Listing Views', value: int(t.views), delta: delta(t.vs.views, { suffix: 'vs similar' }) },
            { label: 'CTR', value: pctFmt(t.ctr), delta: delta(t.vs.ctr, { suffix: 'vs similar', pts: true }) },
            { label: 'Wishlists', value: int(t.wishlists), delta: delta(t.vs.wishlists, { suffix: 'vs similar' }) },
          ],
        })
      : `<div class="pr-card ${tone}"><div class="pr-card-top"><span class="pr-eyebrow">${escapeHtml(eyebrow)}</span></div><p class="pr-empty">No Airbnb search data for this period yet.</p></div>`;

  const body = `
<div class="pr-grid">
  ${kpiCard({
    tone: 'tobacco',
    eyebrow: 'Current Year',
    corner: String(data.year),
    stats: [
      { label: 'Rental Revenue', value: money(yRevenue), delta: delta(pct(yRevenue, yStly)) },
      { label: 'RevPAR', value: money(yRevpar), delta: delta(pct(yRevpar, yRevparStly)) },
      { label: 'Occupancy', value: pctFmt(yOcc), delta: delta(yOcc != null && yOccStly != null ? yOcc - yOccStly : null, { pts: true }) },
    ],
  })}
  ${funnelCard('tobacco', `Airbnb Funnel · ${data.year}`, funnelYear)}
  ${kpiCard({
    tone: 'cedar',
    eyebrow: 'Current Month',
    corner: MONTHS_SHORT[asOfMonth - 1],
    stats: [
      { label: 'Rental Revenue', value: money(cur.revenue), delta: delta(pct(cur.revenue, cur.revenueStly || cur.revenueLy)) },
      { label: 'RevPAR', value: money(cur.revpar), delta: delta(pct(cur.revpar, cur.revparStly ?? cur.revparLy)) },
      { label: 'Occupancy', value: pctFmt(cur.occ), delta: delta(cur.occ != null && (cur.occStly ?? cur.occLy) != null ? cur.occ - (cur.occStly ?? cur.occLy) : null, { pts: true }) },
    ],
  })}
  ${funnelCard('cedar', `Airbnb Funnel · ${MONTHS_SHORT[asOfMonth - 1]}`, funnelMonth)}
</div>

${sectionTitle('Performance by Listing')}
${renderListingTable(data, seoById, asOfMonth)}
<div style="height:32px"></div>

${sectionTitle('Month-over-Month Trend')}
${renderCharts(months, data.year)}
${renderMonthlyTable(months, seoInScope, data.year, asOfMonth)}

${renderDayOfWeek(dayOfWeek)}

${renderGlossary()}`;

  return `${htmlHead(`${client.name} — Performance Report | RevFactor`, CSS)}
<body>
<div id="ld-tip" role="tooltip"></div>
<div class="container">
  <div class="paper">
    ${renderHeader(client, data)}
    ${body}
    ${renderFooter()}
  </div>
</div>
<script>${TOOLTIP_JS}</script>
<script>${SYNC_JS}</script>
</body>
</html>`;
}

export default {
  key: 'performance-report',
  name: 'Performance Report',
  description: 'Single page: year/month KPIs, Airbnb funnel, per-listing table, monthly trend, day-of-week insights.',
  // Single page: ignores ?tab / ?listing; the route loads every dataset below.
  singlePage: true,
  needs: { seo: true, dayOfWeek: true },
  render: (client, data, opts) => render(client, data, opts),
};
