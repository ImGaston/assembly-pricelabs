import { c, f, escapeHtml, htmlHead, renderHeader, renderFooter, TOOLTIP_JS } from '../render.js';
import { isServingConfigured } from '../serving-db.js';
import { getServingListing, getServingPortfolio } from '../serving.js';
import { generateMockServingListing, generateMockServingPortfolio, mockListingFor } from '../mock-serving.js';
import {
  NA, money, toMs, shortDate, monthYear, longDate, channelClass, channelLabel, legend, empty,
  renderCalendar, calendarCss, CALENDAR_JS,
} from '../calendar.js';

// "PriceLabs Report" model — port of the per-client report in the
// pricelabs-dashboard app (Overview + one report per listing with Calendar ·
// Booking insights · Neighborhood data). Reads that app's serving database
// (lib/serving.js), not the Hub report tables.
//
// Server-rendered; every view is a URL (?listing=, ?view=, and ?date= / ?res= /
// ?others= for a calendar detail). JS only enhances: the listing picker submits
// on change, calendar details open in place (from inert <template>s), the
// calendar scrolls to this month, and charts get styled tooltips.

const VIEWS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'insights', label: 'Booking insights' },
  { id: 'neighborhood', label: 'Neighborhood data' },
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;

// --- formatting ---

const pct0 = (n) => (n == null ? NA : `${n.toFixed(0)}%`);
const kAxis = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}m` : v % 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v / 1000}k`);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function niceStep(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}


function tip(title, pairs) {
  return `<b>${escapeHtml(title)}</b>` + pairs
    .map(([k, v]) => `<span class="tt-row"><span class="tt-k">${escapeHtml(k)}</span><span class="tt-v">${escapeHtml(v)}</span></span>`)
    .join('');
}

// --- links ---
// One URLSearchParams + a single template literal (see conventions → SWC gotcha).
function href(ctx, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, v);
  if (ctx.layoutParam) qs.set('layout', ctx.layoutParam);
  qs.set('token', ctx.client.token || '');
  return `/api/dashboard/${encodeURIComponent(ctx.client.id)}?${qs.toString()}`;
}

// --- shared pieces ---

function nav(ctx, data, currentKey) {
  const options = [...data.listings]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => `<option value="${escapeHtml(l.key)}"${l.key === currentKey ? ' selected' : ''}>${escapeHtml(l.name)}</option>`)
    .join('');
  return `
<nav class="plr-nav" aria-label="Report sections">
  <a class="plr-navtab${currentKey ? '' : ' active'}" href="${href(ctx)}">Overview</a>
  <form class="plr-navtab plr-picker${currentKey ? ' active' : ''}" method="get" action="/api/dashboard/${encodeURIComponent(ctx.client.id)}">
    <label for="plr-listing">Listing report</label>
    <select id="plr-listing" name="listing" data-autosubmit>
      ${currentKey ? '' : '<option value="" selected>Choose a listing…</option>'}${options}
    </select>
    <input type="hidden" name="token" value="${escapeHtml(ctx.client.token || '')}">
    ${ctx.layoutParam ? `<input type="hidden" name="layout" value="${escapeHtml(ctx.layoutParam)}">` : ''}
    <button type="submit" class="plr-go">Open</button>
  </form>
</nav>`;
}

function kpi(label, value, sub, tone = '') {
  return `<div class="plr-kpi"><div class="plr-kpi-label">${escapeHtml(label)}</div><div class="plr-kpi-value ${tone}">${value}</div>${sub ? `<div class="plr-kpi-sub ${tone}">${escapeHtml(sub)}</div>` : ''}</div>`;
}

function panel(title, hint, body, legend = '') {
  return `<section class="plr-panel"><div class="plr-panel-head"><h3>${escapeHtml(title)}</h3>${hint ? `<span class="plr-hint">${escapeHtml(hint)}</span>` : ''}</div>${legend}${body}</section>`;
}


function table(headers, rows) {
  const th = headers.map(([h, num]) => `<th${num ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('');
  return `<div class="plr-table-wrap"><table class="plr-table"><thead><tr>${th}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

// =====================================================================
// Portfolio overview
// =====================================================================

function occupancyAt(points, key, level) {
  const p = points.find((m) => m.listing_key === key && m.level === level && m.metric === 'adjusted_occupancy' && m.dfd === 120);
  return p ? p.value : null;
}

function clientTotals(summaries, occupancy) {
  const comparable = summaries.filter((s) => s.yoy_comparable);
  const ytdC = comparable.reduce((a, s) => a + s.revenue_ytd, 0);
  const lyC = comparable.reduce((a, s) => a + s.revenue_ly_same_period, 0);
  // Occupancy averaged only over listings with BOTH sides.
  const pairs = summaries
    .map((s) => ({ l: occupancyAt(occupancy, s.listing_key, 'listing'), m: occupancyAt(occupancy, s.listing_key, 'market') }))
    .filter((p) => p.l != null && p.m != null);
  const occ = avg(pairs.map((p) => p.l));
  const market = avg(pairs.map((p) => p.m));
  return {
    reportYear: summaries[0]?.report_year ?? null,
    revenueOnBooks: summaries.reduce((a, s) => a + s.revenue_on_books, 0),
    yoyPct: lyC > 0 ? (ytdC / lyC - 1) * 100 : null,
    yoyListings: comparable.length,
    bookingWindowDays: avg(summaries.map((s) => s.booking_window_days).filter((v) => v != null)),
    bookings30d: summaries.reduce((a, s) => a + s.bookings_30d, 0),
    nights30d: summaries.reduce((a, s) => a + s.nights_30d, 0),
    occ,
    market,
    index: occ != null && market ? (occ / market) * 100 : null,
  };
}

function pacingByMonth(monthly, year) {
  const byYm = new Map();
  for (const r of monthly) {
    const k = r.month.slice(0, 7);
    byYm.set(k, (byYm.get(k) || 0) + r.revenue);
  }
  return MONTHS_SHORT.map((name, i) => {
    const mm = String(i + 1).padStart(2, '0');
    return { month: i + 1, name, revenue: byYm.get(`${year}-${mm}`) || 0, lastYear: byYm.has(`${year - 1}-${mm}`) ? byYm.get(`${year - 1}-${mm}`) : null };
  });
}

function pacingChart(months, year) {
  const W = 1080, H = 320, M = { l: 60, r: 16, t: 16, b: 34 };
  const top = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.lastYear || 0)));
  const step = niceStep(top);
  const yMax = Math.ceil(top / step) * step;
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b, slot = plotW / 12, barW = slot * 0.52;
  const y = (v) => M.t + plotH - (v / yMax) * plotH;
  const now = new Date();
  const curMonth = now.getUTCFullYear() === year ? now.getUTCMonth() + 1 : year < now.getUTCFullYear() ? 13 : 0;
  let out = '';
  for (let t = 0; t <= yMax + 1e-6; t += step) {
    out += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}" class="plr-grid"/><text x="${M.l - 10}" y="${y(t) + 4}" class="plr-axis" text-anchor="end">${kAxis(t)}</text>`;
  }
  months.forEach((m, i) => {
    const cx = M.l + i * slot + slot / 2;
    if (m.revenue > 0) {
      out += `<rect x="${cx - barW / 2}" y="${y(m.revenue)}" width="${barW}" height="${y(0) - y(m.revenue)}" rx="2" class="plr-pace${m.month > curMonth ? ' future' : ''}"/>`;
    }
    if (m.lastYear > 0) {
      out += `<line x1="${cx - barW / 2 - 5}" x2="${cx + barW / 2 + 5}" y1="${y(m.lastYear)}" y2="${y(m.lastYear)}" class="plr-ly"/>`;
    }
    out += `<text x="${cx}" y="${H - 10}" class="plr-axis" text-anchor="middle">${m.name}</text>`;
    const pairs = [[`${year}${m.month > curMonth ? ' (upcoming)' : ''}`, money(m.revenue)]];
    if (m.lastYear != null) pairs.push([String(year - 1), money(m.lastYear)]);
    const plain = pairs.map((p) => p.join(': ')).join('\n');
    out += `<rect class="plr-hit" x="${M.l + i * slot}" y="${M.t}" width="${slot}" height="${plotH}" data-tip="${escapeHtml(tip(`${m.name} ${year}`, pairs))}"><title>${escapeHtml(`${m.name}\n${plain}`)}</title></rect>`;
  });
  return `<div class="plr-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue by stay month, ${year} against ${year - 1}">${out}</svg></div>`;
}

function renderPortfolio(ctx, data) {
  const t = clientTotals(data.summaries, data.occupancy);
  const year = t.reportYear ?? new Date().getUTCFullYear();
  const pacing = pacingByMonth(data.monthly, year);
  const hasLy = pacing.some((m) => (m.lastYear || 0) > 0);
  const byKey = new Map(data.summaries.map((s) => [s.listing_key, s]));
  const nameByKey = new Map(data.listings.map((l) => [l.key, l.name]));
  const above = t.occ != null && t.market != null ? t.occ >= t.market : null;
  const tone = above == null ? '' : above ? 'pos' : 'neg';

  const yoySub = t.yoyPct == null
    ? 'No comparable listings from last year yet'
    : `${t.yoyPct >= 0 ? '+' : ''}${t.yoyPct.toFixed(0)}% on last year to date (${t.yoyListings} listing${t.yoyListings === 1 ? '' : 's'} open both years)`;
  const occSub = t.occ != null && t.market != null
    ? `${Math.abs(t.occ - t.market).toFixed(0)} point${Math.abs(t.occ - t.market).toFixed(0) === '1' ? '' : 's'} ${t.occ >= t.market ? 'above' : 'below'} the market's ${t.market.toFixed(0)}%`
    : 'Market comparison not available yet';
  const idxSub = t.index == null
    ? 'Market comparison not available yet'
    : Math.round(t.index) === 100
    ? 'Level with the market average (100 = market)'
    : `${Math.abs(t.index - 100).toFixed(0)}% ${above ? 'above' : 'below'} the market average (100 = market)`;

  const kpis = `<div class="plr-kpis">
    ${kpi(`${year} revenue`, money(t.revenueOnBooks), yoySub, t.yoyPct == null ? '' : t.yoyPct >= 0 ? 'pos' : 'neg')}
    ${kpi('Occupancy, next 4 months', t.occ != null ? `${t.occ.toFixed(0)}%` : NA, occSub, tone)}
    ${kpi('Occupancy vs. market', t.index != null ? t.index.toFixed(0) : NA, idxSub, tone)}
    ${kpi('Avg booking window', t.bookingWindowDays != null ? `${t.bookingWindowDays.toFixed(0)}<small> days</small>` : NA, 'how far ahead guests are booking')}
    ${kpi('Nights booked, last 30 days', String(t.nights30d), `from ${t.bookings30d} new booking${t.bookings30d === 1 ? '' : 's'}`)}
  </div>`;

  const pacingPanel = panel(
    `Revenue pacing · ${year}`,
    '',
    pacingChart(pacing, year) + (hasLy ? '' : empty("Last year's figures are not available for these listings.")),
    legend([
      ['box', c.cedar, 'Earned'],
      ['box faded', c.cedar, 'Upcoming bookings'],
      ...(hasLy ? [['line', c.walnut, 'Last year']] : []),
    ]),
  );

  const rows = [...data.listings]
    .sort((a, b) => (byKey.get(b.key)?.revenue_on_books || 0) - (byKey.get(a.key)?.revenue_on_books || 0))
    .map((l) => {
      const s = byKey.get(l.key);
      const occ = occupancyAt(data.occupancy, l.key, 'listing');
      const mkt = occupancyAt(data.occupancy, l.key, 'market');
      const diff = occ != null && mkt != null ? occ - mkt : null;
      const link = href(ctx, { listing: l.key });
      return `<tr>
        <td><a class="plr-row-link" href="${link}">${escapeHtml(l.name)}</a>
          <div class="plr-row-sub">${escapeHtml(l.city || 'Location not set')}${l.bedrooms != null ? ` · ${l.bedrooms}br` : ''}</div>
          <a class="plr-view-link" href="${link}">View report →</a></td>
        <td class="num">${s ? money(s.revenue_on_books) : NA}</td>
        <td class="num">${occ != null ? `${occ.toFixed(0)}%` : NA}</td>
        <td class="num">${diff != null ? `<span class="plr-delta ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff.toFixed(0)} pts</span>` : NA}</td>
        <td class="num">${s?.booking_window_days != null ? `${s.booking_window_days.toFixed(0)}d` : NA}</td>
        <td class="num">${s ? s.nights_30d : NA}</td>
      </tr>`;
    });
  const listingTable = table(
    [['Listing'], [`${year} revenue`, 1], ['Occupancy (4 mo)', 1], ['vs. market', 1], ['Booking window', 1], ['Nights booked (30d)', 1]],
    rows,
  );

  const recentRows = data.recent.map((b) => {
    const windowDays = b.booked_date ? Math.round((toMs(b.check_in) - toMs(b.booked_date)) / DAY) : null;
    return `<tr>
      <td>${escapeHtml(nameByKey.get(b.listing_key) || b.listing_key)}</td>
      <td class="num">${b.booked_date ? shortDate(b.booked_date) : NA}</td>
      <td class="num">${shortDate(b.check_in)} → ${shortDate(b.check_out)}</td>
      <td class="num">${b.no_of_days ?? NA}</td>
      <td><span class="plr-pill ${channelClass(b.booking_channel)}">${escapeHtml(channelLabel(b.booking_channel))}</span></td>
      <td class="num">${b.rental_revenue != null && b.no_of_days ? money(b.rental_revenue / b.no_of_days) : NA}</td>
      <td class="num">${windowDays != null ? `${windowDays}d` : NA}</td>
      <td class="num">${money(b.rental_revenue)}</td>
    </tr>`;
  });
  const recent = recentRows.length
    ? table([['Listing'], ['Booked', 1], ['Stay', 1], ['Nights', 1], ['Channel'], ['ADR', 1], ['Booking window', 1], ['Revenue', 1]], recentRows)
    : `<div class="plr-panel">${empty('No recent bookings to show yet.')}</div>`;

  return `
${kpis}
${pacingPanel}
<h3 class="plr-section">Portfolio overview <span>· choose a listing for its full report</span></h3>
${listingTable}
<h3 class="plr-section">Recent reservations</h3>
${recent}
<p class="plr-note">Revenue is rental income from confirmed bookings, counted in the month of the stay;
cancelled bookings are left out. Occupancy looks at the next four months and is compared with similar
properties nearby. Growth on last year compares only listings that were open in both years, so a newly
added listing does not inflate it. Figures update daily.</p>`;
}

// =====================================================================
// Listing report — Calendar
// =====================================================================

// =====================================================================
// Listing report — Booking insights
// =====================================================================

function monthlyChart(data) {
  if (!data.length) return empty('No bookings to chart for this listing yet.');
  const W = 860, H = 320, M = { l: 62, r: 46, t: 16, b: 40 };
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b, slot = plotW / data.length, barW = Math.min(34, slot * 0.55);
  const maxRev = Math.max(4000, ...data.map((d) => Math.ceil(d.revenue / 1000) * 1000 + 1000));
  const yR = (v) => M.t + plotH - (v / maxRev) * plotH;
  const yO = (v) => M.t + plotH - (v / 100) * plotH;
  let out = '';
  [0, 0.25, 0.5, 0.75, 1].forEach((fr) => {
    const v = Math.round((fr * maxRev) / 500) * 500;
    out += `<line x1="${M.l}" x2="${M.l + plotW}" y1="${yR(v)}" y2="${yR(v)}" class="plr-grid"/><text x="${M.l - 10}" y="${yR(v) + 3}" class="plr-axis" text-anchor="end">${kAxis(v)}</text>`;
  });
  [0, 25, 50, 75, 100].forEach((v) => { out += `<text x="${M.l + plotW + 10}" y="${yO(v) + 3}" class="plr-axis">${v}%</text>`; });
  const pts = [];
  let hits = '';
  data.forEach((d, i) => {
    const cx = M.l + i * slot + slot / 2;
    const dt = new Date(toMs(d.month));
    const label = `${MONTHS_SHORT[dt.getUTCMonth()]}${i === 0 || dt.getUTCMonth() === 0 ? ` '${String(dt.getUTCFullYear()).slice(-2)}` : ''}`;
    const h = d.revenue > 0 ? yR(0) - yR(d.revenue) : 2;
    out += `<rect x="${cx - barW / 2}" y="${yR(0) - h}" width="${barW}" height="${h}" rx="3" class="plr-bar-rev${d.revenue > 0 ? '' : ' empty'}"/>`;
    if (d.revenue > 0) out += `<text x="${cx}" y="${yR(d.revenue) - 8}" class="plr-val" text-anchor="middle">$${(Math.round(d.revenue / 100) / 10)}k</text>`;
    out += `<text x="${cx}" y="${M.t + plotH + 18}" class="plr-axis" text-anchor="middle">${label}</text>`;
    pts.push([cx, yO(d.occupancy_pct ?? 0)]);
    const pairs = [['Revenue', money(d.revenue)], ['Nights', String(d.nights_booked)], ['Occupancy', d.occupancy_pct != null ? `${d.occupancy_pct.toFixed(1)}%` : NA], ['ADR', money(d.adr)]];
    hits += `<rect class="plr-hit" x="${M.l + i * slot}" y="${M.t}" width="${slot}" height="${plotH}" data-tip="${escapeHtml(tip(monthYear(d.month), pairs))}"><title>${escapeHtml([monthYear(d.month), ...pairs.map((p) => p.join(': '))].join('\n'))}</title></rect>`;
  });
  const line = `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="plr-occ"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" class="plr-occ-dot"/>`).join('')}`;
  return `<div class="plr-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly revenue and occupancy">${out}${line}${hits}</svg></div>`;
}

const FORWARD_DAYS = [1, 2, 3, 7, 10, 15, 21, 30, 45, 60, 90, 120, 180, 240, 300, 360];
const metricAt = (pts, level, metric, dfd) => pts.find((p) => p.level === level && p.metric === metric && p.dfd === dfd)?.value ?? null;

function paceChart(points) {
  const lst = FORWARD_DAYS.map((d) => metricAt(points, 'listing', 'occupancy', d));
  const mkt = FORWARD_DAYS.map((d) => metricAt(points, 'market', 'occupancy', d));
  if (![...lst, ...mkt].some((v) => v != null)) return empty('A market comparison is not available for this listing yet.');
  const W = 860, H = 220, M = { l: 48, r: 16, t: 16, b: 28 };
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b, n = FORWARD_DAYS.length;
  const x = (i) => M.l + (i / (n - 1)) * plotW;
  const y = (v) => M.t + plotH - (v / 100) * plotH;
  const poly = (s, cls) => `<polyline class="${cls}" points="${s.map((v, i) => (v != null ? `${x(i)},${y(v)}` : null)).filter(Boolean).join(' ')}"/>`;
  let out = [0, 25, 50, 75, 100].map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="plr-grid"/><text x="${M.l - 10}" y="${y(v) + 3}" class="plr-axis" text-anchor="end">${v}%</text>`).join('');
  if (mkt.some((v) => v != null)) out += poly(mkt, 'plr-line-market');
  if (lst.some((v) => v != null)) out += poly(lst, 'plr-line-own');
  FORWARD_DAYS.forEach((d, i) => {
    out += `<text x="${x(i)}" y="${M.t + plotH + 18}" class="plr-axis" text-anchor="middle">${d}d</text>`;
    const pairs = [['This listing', pct0(lst[i])], ['Market', pct0(mkt[i])]];
    const w = plotW / (n - 1);
    out += `<rect class="plr-hit" x="${x(i) - w / 2}" y="${M.t}" width="${w}" height="${plotH}" data-tip="${escapeHtml(tip(`${d} days out`, pairs))}"><title>${escapeHtml([`${d} days out`, ...pairs.map((p) => p.join(': '))].join('\n'))}</title></rect>`;
  });
  return `<div class="plr-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Occupancy on the books by days out, listing vs market">${out}</svg></div>`;
}

function insights(ld) {
  // KPIs: trailing 12 months up to and including this month.
  const today = new Date();
  const thisMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const chartStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 15, 1);
  const twelveAgo = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1);
  const monthly = ld.monthly.filter((m) => toMs(m.month) >= chartStart);
  const kpiMonths = monthly.filter((m) => toMs(m.month) >= twelveAgo && toMs(m.month) <= thisMonth);
  const revenue = kpiMonths.reduce((a, m) => a + m.revenue, 0);
  const nights = kpiMonths.reduce((a, m) => a + m.nights_booked, 0);
  const occ = kpiMonths.length ? kpiMonths.reduce((a, m) => a + (m.occupancy_pct || 0), 0) / kpiMonths.length : null;

  const s = ld.metricsSummary;
  const bp = s?.bp_ratio ?? null;
  const extraKpis = [];
  if (bp != null) extraKpis.push(kpi("Pricing vs. PriceLabs' recommendation", `${Math.abs((bp - 1) * 100).toFixed(0)}% <small>${bp >= 1 ? 'above' : 'below'}</small>`, ''));
  if (s?.last_booked_date) extraKpis.push(kpi('Last booked', shortDate(s.last_booked_date) + `<small>, ${s.last_booked_date.slice(0, 4)}</small>`, ''));

  const trailing = [[-7, 'Last 7 days'], [-30, 'Last 30 days'], [-90, 'Last 90 days']].map(([dfd, label]) => ({
    label,
    lo: metricAt(ld.marketMetrics, 'listing', 'occupancy', dfd),
    mo: metricAt(ld.marketMetrics, 'market', 'occupancy', dfd),
    adr: metricAt(ld.marketMetrics, 'listing', 'adr', dfd),
    revpar: metricAt(ld.marketMetrics, 'listing', 'revpar', dfd),
    rev: metricAt(ld.marketMetrics, 'listing', 'revenue', dfd),
  }));
  const hasTrailing = trailing.some((r) => [r.lo, r.mo, r.adr, r.revpar, r.rev].some((v) => v != null));

  const bookingRows = ld.bookings.map((b) => `<tr>
    <td class="num">${b.booked_date ? shortDate(b.booked_date) : NA}</td>
    <td class="num">${shortDate(b.check_in)}</td><td class="num">${shortDate(b.check_out)}</td>
    <td class="num">${b.no_of_days ?? NA}</td><td class="num">${money(b.rental_revenue)}</td><td class="num">${money(b.total_cost)}</td>
    <td><span class="plr-pill ${channelClass(b.booking_channel)}">${escapeHtml(channelLabel(b.booking_channel))}</span></td></tr>`);

  return `
<div class="plr-kpis three">
  ${kpi('Revenue, last 12 months', money(revenue), '')}
  ${kpi('Avg. occupancy, last 12 months', occ != null ? `${occ.toFixed(1)}<small>%</small>` : NA, '')}
  ${kpi('Blended ADR, last 12 months', nights > 0 ? money(revenue / nights) : NA, '')}
</div>
${panel('Monthly performance', 'Revenue (bars, left) · Occupancy % (line, right)', monthlyChart(monthly), legend([['box', c.cedar, 'Revenue'], ['line', c.walnut, 'Occupancy %']]))}
${extraKpis.length ? `<div class="plr-kpis two">${extraKpis.join('')}</div>` : ''}
${ld.marketMetrics.length || s ? panel('Booking pace vs. market', 'Occupancy on the books, by days out', paceChart(ld.marketMetrics), legend([['line', c.cedar, 'This listing'], ['line', c.warning, 'Market']])) : ''}
${ld.marketMetrics.length || s ? panel('Recent performance', 'Trailing windows, this listing vs. market occupancy', hasTrailing
    ? table([['Window'], ['Occupancy', 1], ['Market occupancy', 1], ['ADR', 1], ['RevPAR', 1], ['Revenue', 1]], trailing.map((r) => `<tr><td>${r.label}</td><td class="num">${pct0(r.lo)}</td><td class="num">${pct0(r.mo)}</td><td class="num">${money(r.adr)}</td><td class="num">${money(r.revpar)}</td><td class="num">${money(r.rev)}</td></tr>`))
    : empty('Recent performance figures are not available for this listing yet.')) : ''}
${panel('Recent bookings', `Most recent ${ld.bookings.length}, by booked date`, bookingRows.length
    ? table([['Booked', 1], ['Check-in', 1], ['Check-out', 1], ['Nights', 1], ['Rental revenue', 1], ['Total cost', 1], ['Channel']], bookingRows)
    : empty('No recent bookings to show for this listing yet.'))}
<p class="plr-note">Revenue and occupancy are calculated from confirmed bookings each month.</p>`;
}

// =====================================================================
// Listing report — Neighborhood data
// =====================================================================

function seriesByMetric(rows, chart) {
  const map = new Map();
  for (const r of rows) {
    if (r.chart !== chart) continue;
    if (!map.has(r.metric)) map.set(r.metric, []);
    map.get(r.metric).push({ x: r.x_value, order: r.x_order, value: r.value });
  }
  for (const arr of map.values()) arr.sort((a, b) => a.order - b.order);
  return map;
}

function dateChart(dates, maxValue, yFmt, layers, hover, aria) {
  const W = 860, H = 260, M = { l: 56, r: 16, t: 16, b: 28 };
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b, n = dates.length;
  const x = (i) => M.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => M.t + plotH - (v / maxValue) * plotH;
  let out = [0, 0.25, 0.5, 0.75, 1].map((fr) => {
    const v = fr * maxValue;
    return `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="plr-grid"/><text x="${M.l - 10}" y="${y(v) + 3}" class="plr-axis" text-anchor="end">${yFmt(v)}</text>`;
  }).join('');
  out += layers({ x, y });
  const ticks = n <= 6 ? dates.map((_, i) => i) : Array.from({ length: 6 }, (_, i) => Math.round((i * (n - 1)) / 5));
  out += ticks.map((i) => `<text x="${x(i)}" y="${M.t + plotH + 18}" class="plr-axis" text-anchor="middle">${escapeHtml(shortDate(dates[i]))}</text>`).join('');
  // Hover: one column per week keeps the markup light.
  for (let i = 0; i < n; i += 7) {
    const pairs = hover(i);
    const w = (plotW / Math.max(1, n - 1)) * 7;
    out += `<rect class="plr-hit" x="${x(i) - w / 2}" y="${M.t}" width="${w}" height="${plotH}" data-tip="${escapeHtml(tip(longDate(dates[i]), pairs))}"><title>${escapeHtml([longDate(dates[i]), ...pairs.map((p) => p.join(': '))].join('\n'))}</title></rect>`;
  }
  return `<div class="plr-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(aria)}">${out}</svg></div>`;
}

function neighborhood(ld) {
  const { neighborhoodSeries: series, neighborhoodSummary: s, prices } = ld;
  if (!series.length && !s) return empty('Neighborhood data is not available for this listing yet.');
  const comp = s?.neighborhood_data_source || 'Nearby listings';

  let out = '';
  if (s) {
    const stat = (v, label) => `<div class="plr-stat"><div class="plr-stat-v">${money(v)}</div><div class="plr-stat-l">${label}</div></div>`;
    out += panel('Market base price',
      `${comp}${s.listings_used != null ? ` · ${s.listings_used} listings compared` : ''}${s.comp_segment === 'All' ? ' · all bedroom counts' : ` · ${s.comp_segment}-bedroom comps`}`,
      `<div class="plr-stats">${stat(s.base_price_p25, '25th percentile')}${stat(s.base_price_p50, 'Median')}${stat(s.base_price_p75, '75th percentile')}${stat(s.base_price_p90, '90th percentile')}</div>`);
  }

  // Market price vs this listing.
  const pm = seriesByMetric(series, 'price');
  const p50 = pm.get('50th Percentile') || [];
  let priceBody;
  if (!p50.length) priceBody = empty('Market prices are not available for this listing yet.');
  else {
    const p25 = pm.get('25th Percentile') || [], p75 = pm.get('75th Percentile') || [], p90 = pm.get('90th Percentile') || [];
    const dates = p50.map((d) => d.x);
    const own = new Map(prices.map((p) => [p.price_date, p.price ?? p.user_price]));
    const ownVals = dates.map((d) => own.get(d) ?? null);
    const max = Math.max(10, ...p25.map((d) => d.value), ...p75.map((d) => d.value), ...p90.map((d) => d.value), ...ownVals.filter((v) => v != null)) * 1.08;
    priceBody = dateChart(dates, max, (v) => `$${Math.round(v / 10) * 10}`, ({ x, y }) => {
      let l = '';
      if (p25.length && p25.length === p75.length) {
        l += `<polygon class="plr-band" points="${[...p25.map((p, i) => `${x(i)},${y(p.value)}`), ...[...p75].reverse().map((p, j) => `${x(p75.length - 1 - j)},${y(p.value)}`)].join(' ')}"/>`;
      }
      const poly = (pts, cls) => `<polyline class="${cls}" points="${pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`;
      if (p90.length) l += poly(p90, 'plr-line-p90');
      l += poly(p50, 'plr-line-median');
      const ownPts = ownVals.map((v, i) => (v != null ? `${x(i)},${y(v)}` : null)).filter(Boolean).join(' ');
      if (ownPts) l += `<polyline class="plr-line-own" points="${ownPts}"/>`;
      return l;
    }, (i) => [['This listing', money(ownVals[i])], ['Market median', money(p50[i]?.value)], ['25th–75th', `${money(p25[i]?.value)} – ${money(p75[i]?.value)}`], ['90th percentile', money(p90[i]?.value)]],
    'Nightly price, this listing vs market percentiles');
  }
  out += panel('Market price', `This listing vs. ${comp.toLowerCase()}`, priceBody, legend([
    ['line', c.cedar, 'This listing'], ['line', c.walnut, 'Market median'], ['line dash', c.moss, 'Market 90th percentile'], ['box', c.successBg, 'Market 25th to 75th percentile'],
  ]));

  // Market occupancy, this year vs last.
  const om = seriesByMetric(series, 'occupancy');
  const cur = om.get('Occupancy') || [];
  const ly = om.get('Occupancy_LY') || [];
  const occBody = !cur.length
    ? empty('Market occupancy is not available for this listing yet.')
    : dateChart(cur.map((d) => d.x), 100, (v) => `${Math.round(v)}%`, ({ x, y }) => {
      const poly = (pts, cls) => `<polyline class="${cls}" points="${pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`;
      return (ly.length ? poly(ly, 'plr-line-market') : '') + poly(cur, 'plr-line-own');
    }, (i) => [['This year', pct0(cur[i]?.value)], ['Last year', pct0(ly[i]?.value ?? null)]], 'Market occupancy this year vs last year');
  out += panel('Market occupancy', `This year vs. last year, ${comp.toLowerCase()}`, occBody, legend([['line', c.cedar, 'This year'], ['line', c.warning, 'Last year']]));

  // Monthly market KPIs.
  const km = seriesByMetric(series, 'market_kpi');
  const rev = km.get('Revenue') || [];
  const at = (metric, i) => km.get(metric)?.[i]?.value ?? null;
  out += panel('Monthly market trends', comp, rev.length
    ? table([['Month'], ['Market revenue', 1], ['Booked days', 1], ['Available days', 1], ['Avg. length of stay', 1], ['Booking window', 1]], rev.map((r, i) => `<tr>
        <td>${escapeHtml(r.x)}</td><td class="num">${money(at('Revenue', i))}</td>
        <td class="num">${at('Total Booked Days', i)?.toFixed(0) ?? NA}</td><td class="num">${at('Total Available Days', i)?.toFixed(0) ?? NA}</td>
        <td class="num">${at('LOS', i) != null ? `${at('LOS', i).toFixed(1)} nights` : NA}</td>
        <td class="num">${at('Booking Window', i) != null ? `${at('Booking Window', i).toFixed(0)} days` : NA}</td></tr>`))
    : empty('Monthly market trends are not available for this listing yet.'));

  return `${out}<p class="plr-note">Market figures come from nearby comparable listings, not this listing's own bookings.</p>`;
}

// =====================================================================
// Listing report page
// =====================================================================

function renderListing(ctx, data, listing, ld, opts) {
  const view = VIEWS.some((v) => v.id === opts.view) ? opts.view : 'calendar';
  const today = new Date().toISOString().slice(0, 10);
  const tabs = VIEWS.map((v) => `<a class="plr-tab${v.id === view ? ' active' : ''}" href="${href(ctx, { listing: listing.key, view: v.id })}"${v.id === view ? ' aria-current="page"' : ''}>${v.label}</a>`).join('');
  const cal = () => {
    const { range, html } = renderCalendar({
      listing, ld, today, detail: opts,
      linkFor: (p) => href(ctx, { listing: listing.key, view: 'calendar', ...p }),
    });
    return panel('Calendar', range, html);
  };
  const body = view === 'insights' ? insights(ld) : view === 'neighborhood' ? neighborhood(ld) : cal();
  return `
<div class="plr-lhead">
  <a class="plr-back" href="${href(ctx)}">← Back to overview</a>
  <h2>${escapeHtml(listing.name)}</h2>
  <p>${escapeHtml(listing.city || 'Location not set')}${listing.bedrooms != null ? ` · ${listing.bedrooms} bedrooms` : ''}</p>
</div>
<div class="plr-tabs">${tabs}</div>
${body}`;
}

// =====================================================================
// Page
// =====================================================================

const JS = `
(function(){
  document.querySelectorAll('[data-autosubmit]').forEach(function(s){
    var go=s.form && s.form.querySelector('.plr-go'); if(go) go.hidden=true;
    s.addEventListener('change', function(){ if(s.value) s.form.submit(); });
  });
})();
`;

const CSS = `${calendarCss()}
  .plr-nav { display:flex; gap:28px; align-items:flex-end; margin:-16px 0 32px; background:${c.level1}; padding:0 20px; border-radius:12px; }
  .plr-navtab { font-family:${f.body}; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${c.walnut}; text-decoration:none; padding:14px 0 12px; border-bottom:2px solid transparent; display:flex; align-items:center; gap:10px; }
  .plr-navtab.active { color:${c.cedar}; border-bottom-color:${c.cedar}; }
  .plr-picker label { cursor:pointer; }
  .plr-picker select { font-family:${f.body}; font-size:13px; color:${c.onyx}; background:${c.level2}; border:none; border-radius:2px; padding:6px 8px; max-width:260px; letter-spacing:0; text-transform:none; font-weight:500; }
  .plr-go { font-family:${f.body}; font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; background:${c.cedar}; color:${c.paper}; border:none; border-radius:2px; padding:7px 10px; cursor:pointer; }
  .plr-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:24px; }
  .plr-kpis.three { grid-template-columns:repeat(3,1fr); }
  .plr-kpis.two { grid-template-columns:repeat(2,1fr); }
  .plr-kpi { background:${c.level2}; border-radius:12px; padding:18px 18px 16px; }
  .plr-kpi-label { font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${c.moss}; margin-bottom:8px; }
  .plr-kpi-value { font-family:${f.mono}; font-size:26px; font-weight:500; color:${c.tobacco}; line-height:1.2; }
  .plr-kpi-value small { font-size:13px; color:${c.walnut}; }
  .plr-kpi-sub { font-size:12px; color:${c.walnut}; margin-top:6px; line-height:1.45; }
  .plr-kpi .pos { color:${c.success}; } .plr-kpi .neg { color:${c.error}; }
  .plr-panel { background:${c.level1}; border-radius:12px; padding:22px 22px 18px; margin-bottom:20px; }
  .plr-panel-head { display:flex; justify-content:space-between; align-items:baseline; gap:16px; flex-wrap:wrap; margin-bottom:10px; }
  .plr-panel-head h3 { font-family:${f.display}; font-weight:400; font-size:22px; text-transform:lowercase; color:${c.tobacco}; }
  .plr-hint { font-size:12px; color:${c.walnut}; }
  .plr-chart svg { width:100%; height:auto; display:block; overflow:visible; }
  .plr-grid { stroke:${c.level3}; stroke-width:1; }
  .plr-axis { font-family:${f.mono}; font-size:11px; fill:${c.walnut}; }
  .plr-val { font-family:${f.mono}; font-size:10px; fill:${c.walnut}; }
  .plr-pace { fill:${c.cedar}; } .plr-pace.future { fill:${c.cedar}; opacity:.35; }
  .plr-ly { stroke:${c.walnut}; stroke-width:3; stroke-linecap:round; }
  .plr-bar-rev { fill:${c.cedar}; } .plr-bar-rev.empty { fill:${c.level3}; }
  .plr-occ { fill:none; stroke:${c.walnut}; stroke-width:2; } .plr-occ-dot { fill:${c.paper}; stroke:${c.walnut}; stroke-width:2; }
  .plr-line-own { fill:none; stroke:${c.cedar}; stroke-width:2.2; stroke-linejoin:round; }
  .plr-line-market { fill:none; stroke:${c.warning}; stroke-width:2; stroke-linejoin:round; }
  .plr-line-median { fill:none; stroke:${c.walnut}; stroke-width:1.6; }
  .plr-line-p90 { fill:none; stroke:${c.moss}; stroke-width:1.2; stroke-dasharray:4 3; }
  .plr-band { fill:${c.successBg}; opacity:.85; }
  .plr-hit { fill:transparent; cursor:default; } .plr-hit:hover { fill:${c.cedar}; fill-opacity:.05; }
  .plr-section { font-family:${f.display}; font-weight:400; font-size:24px; text-transform:lowercase; color:${c.tobacco}; margin:32px 0 12px; }
  .plr-section span { font-family:${f.body}; font-size:13px; color:${c.walnut}; text-transform:none; }
  .plr-table-wrap { overflow-x:auto; background:${c.level1}; border-radius:12px; }
  .plr-table { width:100%; border-collapse:collapse; font-size:13px; }
  .plr-table th { font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${c.moss}; text-align:left; padding:14px 14px 10px; background:${c.level2}; white-space:nowrap; }
  .plr-table td { padding:12px 14px; vertical-align:top; }
  .plr-table tbody tr:nth-child(even) td { background:${c.level2}; }
  .plr-table .num { font-family:${f.mono}; text-align:right; white-space:nowrap; }
  .plr-row-link { color:${c.cedar}; font-weight:600; text-decoration:none; }
  .plr-row-sub { font-size:12px; color:${c.walnut}; }
  .plr-view-link { font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:${c.cedar}; text-decoration:none; opacity:.6; transition:opacity .15s; }
  .plr-table tr:hover .plr-view-link { opacity:1; }
  .plr-delta { font-size:12px; padding:2px 8px; border-radius:999px; }
  .plr-delta.up { background:${c.successBg}; color:${c.success}; } .plr-delta.down { background:${c.errorBg}; color:${c.error}; }
  .plr-note { font-size:12px; color:${c.walnut}; line-height:1.6; max-width:80ch; margin:16px 0 8px; }
  .plr-lhead { margin-bottom:18px; }
  .plr-lhead h2 { font-family:${f.display}; font-weight:400; font-size:32px; text-transform:lowercase; color:${c.tobacco}; line-height:1.2; margin-top:8px; }
  .plr-lhead p { font-size:13px; color:${c.walnut}; }
  .plr-back { font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${c.cedar}; text-decoration:none; }
  .plr-tabs { display:flex; gap:6px; margin-bottom:20px; flex-wrap:wrap; }
  .plr-tab { font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; text-decoration:none; color:${c.walnut}; background:${c.level2}; padding:10px 16px; border-radius:2px; }
  .plr-tab.active { background:${c.cedar}; color:${c.paper}; }
  .plr-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .plr-stat { background:${c.level2}; border-radius:12px; padding:16px; }
  .plr-stat-v { font-family:${f.mono}; font-size:22px; color:${c.tobacco}; }
  .plr-stat-l { font-size:12px; color:${c.walnut}; }
  @media (max-width: 900px) { .plr-kpis { grid-template-columns:repeat(2,1fr); } .plr-stats { grid-template-columns:repeat(2,1fr); } }
  @media (max-width: 640px) {
    .plr-nav { flex-wrap:wrap; gap:4px 20px; }
    .plr-kpis, .plr-kpis.three, .plr-kpis.two { grid-template-columns:1fr; }
  }
`;

function render(client, data, opts = {}) {
  const ctx = { client, layoutParam: opts.layoutParam || null };
  const listing = opts.listingData ? data.listings.find((l) => l.key === opts.listing) : null;
  const body = listing ? renderListing(ctx, data, listing, opts.listingData, opts) : renderPortfolio(ctx, data);
  const title = listing ? `${listing.name} — ${client.name} | RevFactor` : `${client.name} — Client Report | RevFactor`;
  return `${htmlHead(title, CSS)}
<body>
<div id="ld-tip" role="tooltip"></div>
<div class="container">
  <div class="paper">
    ${renderHeader(client, data)}
    ${nav(ctx, data, listing ? listing.key : null)}
    ${body}
    ${renderFooter()}
  </div>
</div>
<script>${TOOLTIP_JS}</script>
<script>${JS}</script>
<script>${CALENDAR_JS}</script>
</body>
</html>`;
}

/**
 * Loads this model's data (called by the route instead of the Hub report).
 * Returns { data, listingData? } or { error: { status, message } }.
 */
async function load({ client, dataClient, params, isMock }) {
  const listingKey = params.get('listing');
  if (isMock) {
    const data = generateMockServingPortfolio(client.demoListings);
    if (!listingKey) return { data };
    const demo = mockListingFor(client.demoListings, listingKey);
    if (!demo) return { error: { status: 404, message: 'listing not found' } };
    return { data, listingData: generateMockServingListing(demo) };
  }
  if (!isServingConfigured()) {
    console.error('pricelabs-report: PRICELABS_SERVING_DATABASE_URL is not set');
    return { error: { status: 503, message: 'temporarily unavailable' } };
  }
  const data = await getServingPortfolio(dataClient);
  if (!data) return { error: { status: 500, message: 'no report data yet' } };
  if (!listingKey) return { data };
  // A listing opens only if it belongs to this client.
  if (!data.listings.some((l) => l.key === listingKey)) return { error: { status: 404, message: 'listing not found' } };
  return { data, listingData: await getServingListing(listingKey) };
}

export default {
  key: 'pricelabs-report',
  name: 'PriceLabs Report',
  description: 'Overview + per-listing report (price calendar, booking insights, neighborhood data) from the pricelabs-dashboard database.',
  load,
  render: (client, data, opts) => render(client, data, opts),
};
