import { c, f, escapeHtml } from './render.js';

// Price calendar shared by the "PriceLabs Report" model and the standard
// model's per-listing detail. Data: lib/serving.js (pricelabs-dashboard DB).
// Server-rendered month grids; each open day / stay links to its detail
// (?date= / ?res= / ?others=, rendered open server-side — the no-JS path).
// CALENDAR_JS opens the same details in place from inert <template>s and
// scrolls the calendar to this month once it is visible.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86400000;
export const NA = 'n/a';

export const money = (n) => (n == null ? NA : `$${Math.round(n).toLocaleString('en-US')}`);
export const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d, n) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
export const shortDate = (d) => new Date(toMs(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const longDate = (d) => new Date(toMs(d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const monthYear = (d) => new Date(toMs(d)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function channelClass(channel) {
  const v = (channel || '').toLowerCase();
  if (v.includes('airbnb')) return 'ch-airbnb';
  if (v.includes('vrbo') || v.includes('homeaway')) return 'ch-vrbo';
  if (v.includes('book')) return 'ch-bcom';
  return 'ch-other';
}
const CHANNEL_LABELS = { airbnb: 'Airbnb', vrbo: 'Vrbo', homeaway: 'Vrbo', bookingcom: 'Booking.com', bcom: 'Booking.com', manual: 'Direct', others: 'Other' };
export const channelLabel = (ch) => (ch ? CHANNEL_LABELS[String(ch).toLowerCase().replace(/[^a-z]/g, '')] || ch : 'Direct');

export function legend(items) {
  return `<div class="plr-legend">${items
    .map(([kind, color, label]) => `<span><i class="plr-sw ${kind}" style="--k:${color}"></i>${escapeHtml(label)}</span>`)
    .join('')}</div>`;
}

export const empty = (msg) => `<p class="plr-empty">${escapeHtml(msg)}</p>`;

// Client-facing day detail shows only the market factors; customizations,
// thresholds and overrides stay internal.
const REASON_SECTIONS = [
  ['market_factors', 'Market factors'],
];

// Terciles over this listing's own prices: which days are high/low for it.
function priceTiers(prices) {
  const v = prices.map((p) => p.price).filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return { low: 0, high: 0 };
  return { low: v[Math.floor(v.length * 0.33)], high: v[Math.floor(v.length * 0.66)] };
}
function tierClass(price, t) {
  if (price == null) return '';
  return price <= t.low ? 'tier-low' : price >= t.high ? 'tier-high' : 'tier-mid';
}

// A calendar also carries bookings of sibling units at the same property.
const isOtherUnit = (r, pmsName) => !!(r.listing_name && pmsName && r.listing_name !== pmsName);
const resLabel = (r) => `${channelLabel(r.booking_channel)} | ${r.channel_confirmation_code || r.reservation_id}`;

function seriesValue(series, chart, metric, x) {
  const row = series.find((s) => s.chart === chart && s.metric === metric && s.x_value === x);
  return row ? row.value : null;
}

function dl(pairs) {
  return `<dl class="plr-dl">${pairs.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function dateDetail(date, ld, today) {
  const p = ld.prices.find((x) => x.price_date === date);
  const month = monthYear(date);
  const marketOcc = seriesValue(ld.neighborhoodSeries, 'occupancy', 'Occupancy', date);
  const los = seriesValue(ld.neighborhoodSeries, 'market_kpi', 'LOS', month);
  const bw = seriesValue(ld.neighborhoodSeries, 'market_kpi', 'Booking Window', month);
  const summary = ld.priceReasonSummaries.find((s) => s.price_date === date);
  const factors = ld.priceReasonFactors.filter((x) => x.price_date === date);

  const price = [];
  if (p?.user_price > 0) price.push(['Last pushed to the PMS', money(p.user_price)]);
  if (p?.min_stay != null) price.push(['Minimum stay', `${p.min_stay} night${p.min_stay === 1 ? '' : 's'}`]);

  const sections = REASON_SECTIONS.map(([key, label]) => {
    const rows = factors.filter((x) => x.section === key).sort((a, b) => a.sort_order - b.sort_order);
    if (!rows.length) return '';
    return `<p class="plr-dsec">${label}</p>${dl(rows.map((r) => {
      const v = (r.value || '').trim();
      const cls = v.startsWith('+') ? 'up' : v.startsWith('-') ? 'down' : '';
      return [r.title || r.key || 'Unnamed factor', `<span class="${cls}">${escapeHtml(r.value ?? NA)}</span>${r.price != null ? ` <span class="plr-faint">· ${money(r.price)}</span>` : ''}`];
    }))}`;
  }).join('');

  return `
<div class="plr-dhead"><span class="plr-pill">${escapeHtml(month)}</span></div>
<h4 class="plr-dtitle">${longDate(date)}${date === today ? '<span class="plr-today-tag">Today</span>' : ''}</h4>
${p?.demand_desc ? `<p class="plr-demand"><i class="plr-dot" style="background:${escapeHtml(p.demand_color || c.warning)}"></i>${escapeHtml(p.demand_desc)}${marketOcc != null ? ` (${marketOcc.toFixed(0)}% market occupancy)` : ''}</p>` : ''}
${summary?.summary ? `<p class="plr-dsummary">${escapeHtml(summary.summary)}</p>` : ''}
${price.length ? `<p class="plr-dsec">Price</p>${dl(price)}` : ''}
${sections}
<p class="plr-dsec">Market averages, ${escapeHtml(month)}</p>
${dl([['Length of stay', los != null ? `${los.toFixed(1)} nights` : NA], ['Booking window', bw != null ? `${bw.toFixed(0)} days` : NA]])}`;
}

function resDetail(r, pmsName) {
  const pairs = [];
  if (r.booked_date) pairs.push(['Booked on', r.booked_date]);
  pairs.push(['Check-in', r.check_in], ['Check-out', r.check_out], ['Nights', String(r.no_of_days ?? NA)],
    ['Rental revenue', money(r.rental_revenue)], ['Total cost', money(r.total_cost)]);
  if (r.channel_confirmation_code) pairs.push(['Confirmation', escapeHtml(r.channel_confirmation_code)]);
  const airbnb = r.channel_confirmation_code && channelClass(r.booking_channel) === 'ch-airbnb'
    ? `<a class="plr-ext" href="https://www.airbnb.com/hosting/stay/${encodeURIComponent(r.channel_confirmation_code)}" target="_blank" rel="noopener noreferrer">View on Airbnb ↗</a>`
    : '';
  return `
<div class="plr-dhead"><span class="plr-pill ${channelClass(r.booking_channel)}">${escapeHtml(channelLabel(r.booking_channel))}</span></div>
<h4 class="plr-dtitle">${escapeHtml(r.channel_confirmation_code || r.reservation_id)}</h4>
${isOtherUnit(r, pmsName) ? `<p class="plr-dsummary">Belongs to a different unit at this property: ${escapeHtml(r.listing_name)}</p>` : ''}
${dl(pairs.map(([k, v]) => [k, escapeHtml(v)]))}
${airbnb}`;
}

function othersDetail(linkFor, date, list) {
  return `
<div class="plr-dhead"><span class="plr-pill">${longDate(date)}</span></div>
<h4 class="plr-dtitle">Other bookings at this property</h4>
<p class="plr-dsummary">These belong to a different unit at this property, not this listing.</p>
<div class="plr-others">${list.map((r) => `<a class="plr-other" href="${linkFor({ res: r.reservation_id })}" data-detail="r-${escapeHtml(r.reservation_id)}">
  <span class="plr-pill ${channelClass(r.booking_channel)}">${escapeHtml(channelLabel(r.booking_channel))}</span>
  <span>${escapeHtml(r.listing_name || '')}</span><span class="num">${escapeHtml(r.channel_confirmation_code || r.reservation_id)}</span></a>`).join('')}</div>`;
}

/**
 * Price calendar for one listing. `listing` needs `pmsName` (the PriceLabs
 * name, used to tell own stays from sibling units); `ld` is getServingListing's
 * shape; `linkFor(params)` builds this calendar's URL plus `date`/`res`/`others`
 * (the no-JS detail path); `detail` holds those params from the request.
 * Returns { range, html }; the page must include calendarCss() and CALENDAR_JS.
 */
export function renderCalendar({ listing, ld, linkFor, detail: detailParams = {}, today = new Date().toISOString().slice(0, 10) }) {
  const { prices, reservations } = ld;
  if (!prices.length && !reservations.length) return { range: '', html: empty('The pricing calendar is not available for this listing yet.') };
  const pms = listing.pmsName;
  const tiers = priceTiers(prices);
  const priceByDate = new Map(prices.map((p) => [p.price_date, p]));

  // Own stays fill cells; sibling-unit stays show as a small badge instead.
  const booked = new Set();
  const others = new Map();
  for (const r of reservations) {
    const own = !isOtherUnit(r, pms);
    for (let d = r.check_in; d < r.check_out; d = addDays(d, 1)) {
      if (own) booked.add(d);
      else others.set(d, [...(others.get(d) || []), r]);
    }
  }

  // Months: the exported price window, widened to stays that touch it so
  // edge stays still show; earlier stay history is left out.
  const monthSet = new Set(prices.map((p) => p.price_date.slice(0, 7)));
  const firstMonth = prices.length ? prices[0].price_date.slice(0, 7) : today.slice(0, 7);
  for (const r of reservations) {
    const last = addDays(r.check_out, -1);
    if (last < r.check_in) continue;
    for (let d = `${r.check_in.slice(0, 7)}-01`; d.slice(0, 7) <= last.slice(0, 7); d = addDays(`${d.slice(0, 7)}-01`, 32).slice(0, 7) + '-01') {
      if (d.slice(0, 7) >= firstMonth) monthSet.add(d.slice(0, 7));
    }
  }
  const months = [...monthSet].sort();

  const templates = [];
  const shownRes = new Set(); // only stays visible on this calendar get a detail template
  const dateLink = (d) => linkFor({ date: d });

  const monthHtml = months.map((mk) => {
    const [y, m] = mk.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${mk}-${String(i + 1).padStart(2, '0')}`)];
    const weeks = Math.ceil(cells.length / 7);
    let grid = WEEKDAYS.map((w, i) => `<div class="plr-wd" style="grid-column:${i + 1};grid-row:1">${w}</div>`).join('');

    cells.forEach((d, i) => {
      const pos = `grid-column:${(i % 7) + 1};grid-row:${Math.floor(i / 7) + 2}`;
      if (!d) { grid += `<div class="plr-cell blank" style="${pos}"></div>`; return; }
      const p = priceByDate.get(d);
      const isBooked = booked.has(d);
      const isBlocked = !isBooked && p?.booking_status === 'Blocked';
      const available = !isBooked && !isBlocked && p != null;
      const cls = ['plr-cell', isBlocked ? 'blocked' : '', d === today ? 'today' : '', available ? `clickable ${tierClass(p.price, tiers)}` : ''].join(' ');
      let inner = `<span class="plr-daynum">${Number(d.slice(-2))}</span>`;
      if (available && p.demand_color) inner += `<i class="plr-dot plr-demand-dot" style="background:${escapeHtml(p.demand_color)}"></i>`;
      if (isBlocked) inner += '<span class="plr-blocked">Blocked</span>';
      if (available && p.price != null) inner += `<span class="plr-price">$${Math.round(p.price)}</span>`;
      if (available && p.min_stay > 1) inner += `<span class="plr-minstay">${p.min_stay}n min</span>`;
      const sib = !isBooked ? others.get(d) : null;
      if (sib) {
        inner += `<a class="plr-otherbadge" href="${linkFor({ others: d })}" data-detail="o-${d}" title="${sib.length} other booking${sib.length === 1 ? '' : 's'} at this property">${sib.length} other ${sib.length === 1 ? 'booking' : 'bookings'}</a>`;
        templates.push(`<template id="plr-o-${d}">${othersDetail(linkFor, d, sib)}</template>`);
        sib.forEach((r) => shownRes.add(r));
      }
      if (available) {
        templates.push(`<template id="plr-d-${d}">${dateDetail(d, ld, today)}</template>`);
        // Whole-cell link sits under the sibling badge (badge is positioned above it).
        inner = `<a class="plr-cell-link" href="${dateLink(d)}" data-detail="d-${d}"${p.demand_desc ? ` title="${escapeHtml(p.demand_desc)}"` : ''} aria-label="${longDate(d)}"></a>${inner}`;
      }
      grid += `<div class="${cls}" style="${pos}">${inner}</div>`;
    });

    // Own stays as bars, one piece per week row.
    for (const r of reservations) {
      if (isOtherUnit(r, pms)) continue;
      const lastNight = addDays(r.check_out, -1);
      for (let w = 0; w < weeks; w++) {
        const wk = cells.slice(w * 7, w * 7 + 7);
        const first = wk.find(Boolean);
        const last = [...wk].reverse().find(Boolean);
        if (!first || r.check_in > last || lastNight < first) continue;
        const s = r.check_in > first ? r.check_in : first;
        const e = lastNight < last ? lastNight : last;
        const cs = wk.indexOf(s), ce = wk.indexOf(e);
        if (cs < 0 || ce < 0) continue;
        const isStart = s === r.check_in, isEnd = e === lastNight;
        shownRes.add(r);
        grid += `<a class="plr-bar ${channelClass(r.booking_channel)}${isStart ? ' start' : ''}${isEnd ? ' end' : ''}" style="grid-column:${cs + 1}/${ce + 2};grid-row:${w + 2}" href="${linkFor({ res: r.reservation_id })}" data-detail="r-${escapeHtml(r.reservation_id)}" title="${escapeHtml(resLabel(r))}">${isStart ? escapeHtml(resLabel(r)) : ''}</a>`;
      }
    }
    return `<div class="plr-month" data-month="${mk}"><div class="plr-month-label">${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div><div class="plr-cal" style="grid-template-rows:auto repeat(${weeks},minmax(64px,auto))">${grid}</div></div>`;
  }).join('');

  for (const r of shownRes) templates.push(`<template id="plr-r-${escapeHtml(r.reservation_id)}">${resDetail(r, pms)}</template>`);

  // No-JS detail: a ?date= / ?res= / ?others= link renders the panel open.
  let openDetail = '';
  if (detailParams.date && priceByDate.has(detailParams.date)) openDetail = dateDetail(detailParams.date, ld, today);
  else if (detailParams.res) {
    const r = reservations.find((x) => String(x.reservation_id) === detailParams.res);
    if (r) openDetail = resDetail(r, pms);
  } else if (detailParams.others && others.has(detailParams.others)) {
    openDetail = othersDetail(linkFor, detailParams.others, others.get(detailParams.others));
  }
  const closeHref = linkFor({});

  const range = prices.length ? `${shortDate(prices[0].price_date)}, ${prices[0].price_date.slice(0, 4)} to ${shortDate(prices[prices.length - 1].price_date)}, ${prices[prices.length - 1].price_date.slice(0, 4)}` : '';

  const key = legend([
    ['box', c.successBg, 'Lower priced'],
    ['box', c.level2, 'Typical'],
    ['box', c.warningBg, 'Higher priced'],
    ['box', c.channelAirbnb, 'Booked'],
    ['box blocked', c.level3, 'Blocked'],
    ['dot', c.warning, 'Demand (click a day for detail)'],
    ['box outline', c.white, 'Other bookings at this property'],
  ]);
  return { range, html: `${key}
<div class="plr-cal-scroll" data-today="${today.slice(0, 7)}">${monthHtml}</div>
<div class="plr-modal"${openDetail ? '' : ' hidden'}>
  <a class="plr-backdrop" href="${closeHref}" data-close aria-label="Close"></a>
  <div class="plr-dpanel" role="dialog" aria-modal="true">
    <a class="plr-close" href="${closeHref}" data-close aria-label="Close">×</a>
    <div class="plr-dbody">${openDetail}</div>
  </div>
</div>
${templates.join('')}` };
}

// Opens calendar details in place and scrolls each calendar to this month the
// first time it becomes visible (it may start in a hidden tab). No backticks / ${}.
export const CALENDAR_JS = `
(function(){
  document.querySelectorAll('.plr-cal-scroll').forEach(function(sc){
    function go(){ var m=sc.querySelector('[data-month="'+sc.getAttribute('data-today')+'"]'); if(m) sc.scrollTop=m.offsetTop-sc.offsetTop; }
    if(!('IntersectionObserver' in window)){ go(); return; }
    var io=new IntersectionObserver(function(es){ if(es[0].isIntersecting){ go(); io.disconnect(); } }); io.observe(sc);
  });
  var modal=document.querySelector('.plr-modal'); if(!modal) return;
  var body=modal.querySelector('.plr-dbody');
  function open(id){ var t=document.getElementById('plr-'+id); if(!t) return false; body.innerHTML=''; body.appendChild(t.content.cloneNode(true)); modal.hidden=false; return true; }
  function close(){ modal.hidden=true; }
  document.addEventListener('click', function(e){
    var a=e.target.closest && e.target.closest('[data-detail]');
    if(a && open(a.getAttribute('data-detail'))){ e.preventDefault(); return; }
    var x=e.target.closest && e.target.closest('[data-close]');
    if(x){ e.preventDefault(); close(); }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
})();
`;

// A function, not a constant: render.js imports this module, so token values
// must not be read at import time (circular import).
export const calendarCss = () => `
  .plr-legend { display:flex; flex-wrap:wrap; gap:6px 18px; font-size:12px; color:${c.walnut}; margin-bottom:12px; }
  .plr-legend span { display:inline-flex; align-items:center; gap:7px; }
  .plr-sw { display:inline-block; width:12px; height:12px; border-radius:3px; background:var(--k); }
  .plr-sw.faded { opacity:.35; }
  .plr-sw.line { height:3px; width:16px; border-radius:2px; }
  .plr-sw.line.dash { background:repeating-linear-gradient(90deg,var(--k) 0 4px,transparent 4px 7px); }
  .plr-sw.dot { width:9px; height:9px; border-radius:50%; }
  .plr-sw.outline { box-shadow:inset 0 0 0 1.5px ${c.walnut}; }
  .plr-sw.blocked { background:repeating-linear-gradient(135deg,${c.level3} 0 3px,${c.outlineVariant} 3px 4px); }
  .plr-pill { display:inline-block; font-size:11px; font-weight:600; padding:2px 9px; border-radius:999px; background:${c.level3}; color:${c.tobacco}; white-space:nowrap; }
  .plr-pill.ch-airbnb { background:color-mix(in srgb, ${c.channelAirbnb} 20%, transparent); color:${c.channelAirbnb}; }
  .plr-pill.ch-vrbo { background:color-mix(in srgb, ${c.channelVrbo} 20%, transparent); color:${c.channelVrbo}; }
  .plr-pill.ch-bcom { background:color-mix(in srgb, ${c.channelBcom} 20%, transparent); color:${c.channelBcom}; }
  .plr-pill.ch-other { background:color-mix(in srgb, ${c.channelOther} 20%, transparent); color:${c.channelOther}; }
  .plr-empty { color:${c.walnut}; font-size:14px; padding:24px 0; text-align:center; }
  .plr-faint { color:${c.walnut}; }
  /* Calendar */
  .plr-cal-scroll { max-height:min(760px,80vh); overflow-y:auto; background:${c.level2}; border-radius:12px; padding:16px; }
  .plr-month + .plr-month { margin-top:28px; }
  .plr-month-label { font-family:${f.mono}; font-size:13px; font-weight:500; color:${c.tobacco}; margin-bottom:8px; }
  .plr-cal { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:5px; }
  .plr-wd { font-family:${f.mono}; font-size:10px; letter-spacing:.5px; text-transform:uppercase; color:${c.walnut}; text-align:center; padding-bottom:2px; }
  .plr-cell { position:relative; min-height:64px; border-radius:8px; background:${c.level3}; padding:6px 7px; display:flex; flex-direction:column; gap:2px; overflow:hidden; }
  .plr-cell.blank { background:transparent; }
  .plr-cell.tier-low { background:${c.successBg}; color:${c.cedar}; }
  .plr-cell.tier-mid { background:${c.white}; }
  .plr-cell.tier-high { background:${c.warningBg}; color:${c.tobacco}; }
  .plr-cell.blocked { background:repeating-linear-gradient(135deg,${c.level3} 0 6px,${c.outlineVariant} 6px 7px); }
  .plr-cell.today { box-shadow:inset 0 0 0 2px ${c.cedar}; }
  .plr-cell.today .plr-daynum { color:${c.cedar}; font-weight:700; }
  .plr-cell.clickable:hover { box-shadow:inset 0 0 0 2px ${c.moss}; }
  .plr-cell-link { position:absolute; inset:0; z-index:1; }
  .plr-daynum { font-family:${f.mono}; font-size:11px; color:${c.walnut}; }
  .plr-price { font-family:${f.mono}; font-size:13px; font-weight:600; }
  .plr-minstay { font-size:10px; color:${c.walnut}; margin-top:auto; }
  .plr-blocked { font-size:10px; color:${c.walnut}; margin-top:auto; }
  .plr-dot { display:inline-block; width:8px; height:8px; border-radius:50%; flex:none; }
  .plr-demand-dot { position:absolute; top:7px; right:7px; }
  .plr-otherbadge { position:relative; z-index:2; margin-top:auto; align-self:flex-start; max-width:100%; font-size:9px; color:${c.tobacco}; background:${c.white}; border-radius:4px; padding:1px 4px; text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-shadow:inset 0 0 0 1px ${c.outlineVariant}; }
  .plr-bar { position:relative; z-index:3; align-self:center; height:26px; display:flex; align-items:center; padding:0 8px; font-size:11px; font-weight:500; color:#fff; text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .plr-bar.start { border-top-left-radius:6px; border-bottom-left-radius:6px; margin-left:3px; }
  .plr-bar.end { border-top-right-radius:6px; border-bottom-right-radius:6px; margin-right:3px; }
  .plr-bar.ch-airbnb { background:${c.channelAirbnb}; } .plr-bar.ch-vrbo { background:${c.channelVrbo}; }
  .plr-bar.ch-bcom { background:${c.channelBcom}; } .plr-bar.ch-other { background:${c.channelOther}; }
  .plr-bar:hover { filter:brightness(1.08); }
  .plr-modal[hidden] { display:none; }
  .plr-backdrop { position:fixed; inset:0; background:rgba(22,25,16,.35); z-index:40; }
  .plr-dpanel { position:fixed; z-index:41; top:50%; left:50%; transform:translate(-50%,-50%); width:min(420px,92vw); max-height:85vh; overflow-y:auto; background:${c.paper}; border-radius:12px; padding:22px; box-shadow:0 20px 40px rgba(29,28,20,0.05); }
  .plr-close { position:absolute; top:12px; right:16px; font-size:24px; line-height:1; color:${c.walnut}; text-decoration:none; }
  .plr-dhead { margin-bottom:10px; }
  .plr-dtitle { font-family:${f.mono}; font-size:17px; font-weight:500; color:${c.tobacco}; margin-bottom:6px; }
  .plr-today-tag { font-family:${f.body}; font-size:10px; font-weight:700; color:${c.cedar}; background:${c.successBg}; border-radius:999px; padding:2px 8px; margin-left:8px; vertical-align:middle; }
  .plr-demand { display:flex; align-items:center; gap:7px; font-size:13px; margin-bottom:8px; }
  .plr-dsummary { font-size:13px; color:${c.walnut}; margin-bottom:12px; }
  .plr-dsec { font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${c.moss}; margin:14px 0 6px; }
  .plr-dl div { display:flex; justify-content:space-between; gap:16px; font-size:13px; padding:5px 0; }
  .plr-dl div:nth-child(even) { background:${c.level1}; }
  .plr-dl dt { color:${c.walnut}; } .plr-dl dd { font-family:${f.mono}; text-align:right; }
  .plr-dl .up { color:${c.success}; } .plr-dl .down { color:${c.error}; }
  .plr-ext { display:inline-block; margin-top:14px; font-size:12px; font-weight:700; color:${c.cedar}; }
  .plr-others { display:flex; flex-direction:column; gap:6px; }
  .plr-other { display:flex; gap:10px; align-items:center; padding:8px 10px; background:${c.level2}; border-radius:8px; text-decoration:none; color:${c.onyx}; font-size:13px; }
  .plr-other .num { margin-left:auto; font-family:${f.mono}; font-size:12px; }
  .ld-card .plr-legend { margin-top:12px; }
  .ld-card .plr-cal-scroll { background:${c.paper}; }
  @media (max-width: 640px) {
    .plr-cal { gap:3px; } .plr-cell { min-height:44px; padding:4px; border-radius:6px; }
    .plr-price { font-size:11px; } .plr-minstay, .plr-otherbadge { display:none; }
    .plr-bar { height:20px; font-size:10px; padding:0 4px; }
  }
`;
