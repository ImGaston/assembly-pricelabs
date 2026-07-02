/**
 * TEMPORARY interactive prototype — NOT part of the product.
 *
 * Explores what a JS-enhanced dashboard could look like once we know Assembly's
 * iframe runs JS (see the /api/dashboard/jstest probe). It pulls REAL data from
 * report_metrics via the existing getClientReport data layer (client: Ali Dowden)
 * and renders it fully client-side: JS tabs, hover tooltips on every chart, and
 * tables of different sizes with row-highlight + click-to-sort.
 *
 * This intentionally violates AGENTS.md rule #1 (no client-side JS) — it's a
 * throwaway sandbox to evaluate the approach, not shippable code. DELETE once the
 * direction is decided. Lives under /api/dashboard/* to inherit the iframe
 * headers (vercel.json); folder must not start with "_" (private-folder rule).
 */

import { getClientReport } from '../../../../lib/reports.js';

// Ali Dowden — 4 Lake Geneva listings, 12 months of report data each.
const PROTO_CLIENT = {
  id: '8f07324d-0260-4d4c-81ac-515e26b64eea',
  name: 'Ali Dowden',
  nameOverrides: {},
};

export async function GET() {
  let data = null;
  let err = null;
  try {
    data = await getClientReport(PROTO_CLIENT);
  } catch (e) {
    err = e.message || String(e);
  }

  if (!data) {
    const msg = err
      ? 'Could not load report data: ' + err
      : 'No report data for this client in the latest run.';
    return html(
      '<div style="font:15px system-ui;padding:40px;color:#8B3A3A">' + escapeHtml(msg) + '</div>'
    );
  }

  // Keep only what the prototype renders, and inline it as JSON.
  const payload = {
    client: PROTO_CLIENT.name,
    year: data.year,
    asOf: data.asOf,
    fetchedAt: data.fetchedAt,
    listings: data.listings.map((l) => ({
      name: l.name,
      city: l.city,
      bedrooms: l.bedrooms,
      months: l.months.map((m) => ({
        monthNum: m.monthNum,
        label: m.label,
        revenue: m.revenue,
        revenueStly: m.revenueStly,
        revenueYoy: m.revenueYoy,
        adr: m.adr,
        marketAdr: m.marketAdr,
        revparIndex: m.revparIndex,
        occ: m.occ,
        marketOcc: m.marketOcc,
        mpi: m.mpi,
        bookingWindow: m.bookingWindow,
        potentialRevenue: m.potentialRevenue,
      })),
    })),
  };

  const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  return html(PAGE(dataJson));
}

function html(body) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': 'frame-ancestors *',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function PAGE(dataJson) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dashboard prototype (JS)</title>
<style>
  :root{
    --ink:#13342d; --muted:#6b7c78; --line:#eef2f1;
    --mint:#8fe0b8; --emerald:#0e9f6e; --emerald-d:#0a6b48;
    --pos:#0a8a54; --neg:#c23b3b; --neg-bg:#fbe3e3; --pos-bg:#e2f3ea;
    --page:#f4f6f5; --card:#fff;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:20px;background:var(--page);color:var(--ink);
    font:15px/1.5 'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
  h2{font-size:18px;margin:0 0 2px}
  .sub{color:var(--muted);font-size:13px;margin:0 0 16px}
  .card{background:var(--card);border-radius:16px;padding:22px;margin-bottom:16px;
    box-shadow:0 1px 3px rgba(20,53,45,.06),0 8px 24px rgba(20,53,45,.05);}
  .row{display:flex;gap:16px;flex-wrap:wrap}
  .row > .card{flex:1;min-width:320px}
  /* tabs */
  .tabs{display:inline-flex;gap:2px;background:#e9edec;border-radius:12px;padding:4px;margin-bottom:18px}
  .tab{border:0;background:transparent;font:inherit;font-weight:600;font-size:14px;color:var(--muted);
    padding:8px 16px;border-radius:9px;cursor:pointer;transition:all .15s}
  .tab.active{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(20,53,45,.12)}
  .view{display:none}
  .view.active{display:block}
  /* kpi */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
  .kpi{background:var(--card);border-radius:14px;padding:16px 18px;box-shadow:0 1px 3px rgba(20,53,45,.06)}
  .kpi .lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
  .kpi .val{font-size:26px;font-weight:700;margin-top:6px}
  .kpi .delta{font-size:13px;font-weight:600;margin-top:2px}
  /* controls */
  select{font:inherit;font-weight:600;padding:8px 12px;border-radius:10px;border:1px solid #d6dedb;
    background:#fff;color:var(--ink);cursor:pointer}
  .selwrap{display:flex;align-items:center;gap:10px;margin-bottom:14px}
  .selwrap .meta{color:var(--muted);font-size:13px}
  /* tables */
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:10px 10px;text-align:right;white-space:nowrap}
  th:first-child,td:first-child{text-align:left}
  thead th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);
    font-weight:700;border-bottom:1px solid var(--line);cursor:pointer;user-select:none}
  thead th.sorted::after{content:" \\2193";opacity:.6}
  thead th.sorted.asc::after{content:" \\2191"}
  tbody tr{border-bottom:1px solid var(--line);transition:background .12s}
  tbody tr:hover{background:#f2faf6}
  td.mono{font-variant-numeric:tabular-nums;font-weight:600}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700}
  .pos{color:var(--pos)} .neg{color:var(--neg)}
  .pill.pos{background:var(--pos-bg)} .pill.neg{background:var(--neg-bg)}
  .muted{color:var(--muted)}
  svg{display:block;width:100%;height:auto}
  .bar{cursor:pointer;transition:opacity .12s}
  .bar:hover{opacity:.82}
  .dot{cursor:pointer}
  /* tooltip */
  #tip{position:fixed;z-index:99;pointer-events:none;opacity:0;transition:opacity .1s;
    background:#13342d;color:#eafaf3;font-size:12.5px;line-height:1.45;padding:8px 11px;border-radius:9px;
    box-shadow:0 6px 20px rgba(0,0,0,.22);max-width:240px}
  #tip b{color:#fff}
  #tip .tt-row{display:flex;justify-content:space-between;gap:14px}
  .legend{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-top:6px}
  .legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}
</style>
</head>
<body>
  <div id="tip"></div>

  <div class="tabs" id="tabs">
    <button class="tab active" data-view="overview">Overview</button>
    <button class="tab" data-view="market">Market Position</button>
    <button class="tab" data-view="listings">Listings</button>
  </div>

  <!-- OVERVIEW -->
  <section class="view active" id="view-overview">
    <div class="kpis" id="kpis"></div>
    <div class="card">
      <h2>Revenue on the books · <span id="ov-year"></span></h2>
      <p class="sub">Portfolio total · booked months solid, forecast lighter · dashed = same time last year</p>
      <div id="chart-pacing"></div>
      <div class="legend">
        <span><i style="background:var(--emerald)"></i>On the books</span>
        <span><i style="background:var(--mint)"></i>Forecast / pace</span>
        <span><i style="background:var(--emerald-d);border-radius:0;height:2px;width:16px"></i>Same time last year</span>
      </div>
    </div>
    <div class="card">
      <h2>Portfolio summary</h2>
      <p class="sub">Per listing · YTD actuals + full-year pace</p>
      <table id="tbl-portfolio"></table>
    </div>
  </section>

  <!-- MARKET POSITION -->
  <section class="view" id="view-market">
    <div class="selwrap">
      <label for="sel" style="font-weight:700;font-size:13px">Listing</label>
      <select id="sel"></select>
      <span class="meta" id="sel-meta"></span>
    </div>
    <div class="card">
      <h2>RevPAR Index</h2>
      <p class="sub">100 = market parity · above the line outperforms the comp set</p>
      <div id="chart-rpi"></div>
    </div>
    <div class="row">
      <div class="card">
        <h2>Occupancy vs market</h2>
        <p class="sub">%, listing vs comp set</p>
        <div id="chart-occ"></div>
      </div>
      <div class="card">
        <h2>ADR vs market</h2>
        <p class="sub">Achieved nightly rate vs comp set</p>
        <div id="chart-adr"></div>
      </div>
    </div>
    <div class="card">
      <h2>Position detail</h2>
      <p class="sub">Hover a row · click a header to sort</p>
      <table id="tbl-position"></table>
    </div>
  </section>

  <!-- LISTINGS -->
  <section class="view" id="view-listings">
    <div class="card">
      <h2>All listings</h2>
      <p class="sub">Click any column header to sort · hover for detail</p>
      <table id="tbl-listings"></table>
    </div>
  </section>

<script>
(function(){
  var DATA = ${dataJson};
  var MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var CUR = DATA.asOf;               // YYYYMM numeric "now"
  var YEAR = DATA.year;

  // ---- utils ----
  function money(n){ if(n==null) return "\\u2014"; return "$"+Math.round(n).toLocaleString("en-US"); }
  function kfmt(n){ return "$"+Math.round(n/1000)+"k"; }
  function pct(n){ if(n==null) return "\\u2014"; return Math.round(n)+"%"; }
  function pct1(n){ if(n==null) return "\\u2014"; return (Math.round(n*10)/10)+"%"; }
  function signedPct(n){ if(n==null) return "\\u2014"; return (n>0?"+":"")+(Math.round(n*10)/10)+"%"; }
  function signedPp(n){ if(n==null) return "\\u2014"; return (n>0?"+":"")+Math.round(n)+" pp"; }
  function num(n){ if(n==null) return "\\u2014"; return Math.round(n); }
  function booked(m){ return (YEAR*100+m.monthNum) < CUR; }
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];}); }
  function ttRow(a,b){ return '<div class="tt-row"><span>'+a+'</span><b>'+b+'</b></div>'; }

  // ---- tooltip (event delegation on [data-tip]) ----
  var tip = document.getElementById("tip");
  document.addEventListener("mouseover", function(e){
    var t = e.target.closest && e.target.closest("[data-tip]");
    if(!t) return;
    tip.innerHTML = t.getAttribute("data-tip");
    tip.style.opacity = "1";
    place(e);
  });
  document.addEventListener("mousemove", function(e){
    if(tip.style.opacity==="1") place(e);
  });
  document.addEventListener("mouseout", function(e){
    var t = e.target.closest && e.target.closest("[data-tip]");
    if(t) tip.style.opacity = "0";
  });
  function place(e){
    var x=e.clientX, y=e.clientY, w=tip.offsetWidth, h=tip.offsetHeight;
    var vw=document.documentElement.clientWidth, vh=document.documentElement.clientHeight;
    var left = x+14; if(left+w>vw-8) left = x-14-w;
    var top = y+14;  if(top+h>vh-8) top = y-14-h;
    tip.style.left=left+"px"; tip.style.top=top+"px";
  }

  // ---- SVG helpers ----
  var W=1000, PADL=58, PADR=16, PADT=16, PADB=34;
  function plotW(){ return W-PADL-PADR; }
  function svgOpen(h){ return '<svg viewBox="0 0 '+W+' '+h+'" preserveAspectRatio="xMidYMid meet">'; }
  function gridY(h, ticks, fmt, max){
    var plotH=h-PADT-PADB, out="";
    for(var i=0;i<=ticks;i++){
      var v=max*i/ticks, y=PADT+plotH-(plotH*i/ticks);
      out+='<line x1="'+PADL+'" y1="'+y+'" x2="'+(W-PADR)+'" y2="'+y+'" stroke="#eef2f1"/>';
      out+='<text x="'+(PADL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#9aa7a3">'+fmt(v)+'</text>';
    }
    return out;
  }
  function xLabels(h, labels){
    var pw=plotW(), slot=pw/labels.length, out="";
    for(var i=0;i<labels.length;i++){
      var cx=PADL+slot*i+slot/2;
      out+='<text x="'+cx+'" y="'+(h-12)+'" text-anchor="middle" font-size="11" fill="#9aa7a3">'+labels[i]+'</text>';
    }
    return out;
  }

  // ---- chart: portfolio revenue pacing ----
  function aggregate(){
    var rows=[];
    for(var i=1;i<=12;i++){
      var rev=0, stly=0, isb=(YEAR*100+i)<CUR;
      DATA.listings.forEach(function(l){
        var m=l.months.filter(function(x){return x.monthNum===i;})[0];
        if(m){ rev+=m.revenue||0; stly+=m.revenueStly||0; }
      });
      var yoy = stly ? ((rev-stly)/stly*100) : null;
      rows.push({monthNum:i,label:MONTH[i-1],rev:rev,stly:stly,yoy:yoy,booked:isb});
    }
    return rows;
  }
  function renderPacing(){
    var h=320, rows=aggregate();
    var max=0; rows.forEach(function(r){ max=Math.max(max,r.rev,r.stly); });
    max=niceMax(max);
    var pw=plotW(), plotH=h-PADT-PADB, slot=pw/12, bw=Math.min(38,slot*0.5);
    var s=svgOpen(h);
    s+=gridY(h,4,kfmt,max);
    // bars
    rows.forEach(function(r,i){
      var cx=PADL+slot*i+slot/2, bh=max?plotH*r.rev/max:0, y=PADT+plotH-bh;
      var fill=r.booked?"var(--emerald)":"var(--mint)";
      var tip='<b>'+r.label+' '+YEAR+'</b>'+ttRow(r.booked?"On the books":"Pace",money(r.rev))
        +ttRow("Same time LY",money(r.stly))+ttRow("YoY",r.yoy==null?"\\u2014":signedPct(r.yoy));
      s+='<rect class="bar" x="'+(cx-bw/2)+'" y="'+y+'" width="'+bw+'" height="'+Math.max(0,bh)
        +'" rx="4" fill="'+fill+'" data-tip="'+esc(tip)+'"/>';
    });
    // STLY dashed line
    var pts=rows.map(function(r,i){
      var cx=PADL+slot*i+slot/2, y=PADT+plotH-(max?plotH*r.stly/max:0);
      return cx+","+y;
    }).join(" ");
    s+='<polyline points="'+pts+'" fill="none" stroke="var(--emerald-d)" stroke-width="2" stroke-dasharray="5 4"/>';
    s+=xLabels(h,rows.map(function(r){return r.label;}));
    s+='</svg>';
    document.getElementById("chart-pacing").innerHTML=s;
  }

  function niceMax(v){
    if(v<=0) return 10;
    var p=Math.pow(10,Math.floor(Math.log10(v)));
    var n=v/p;
    var step = n<=1?1:n<=2?2:n<=5?5:10;
    return step*p;
  }

  // ---- KPIs (portfolio) ----
  function renderKpis(){
    var rows=aggregate();
    var revBooked=0, revTotal=0, stlyBooked=0;
    rows.forEach(function(r){ revTotal+=r.rev; if(r.booked){revBooked+=r.rev; stlyBooked+=r.stly;} });
    var yoy = stlyBooked ? ((revBooked-stlyBooked)/stlyBooked*100) : null;
    // avg occ + avg RPI across listings, booked months only
    var occs=[], rpis=[];
    DATA.listings.forEach(function(l){ l.months.forEach(function(m){
      if(booked(m)){ if(m.occ!=null)occs.push(m.occ); if(m.revparIndex!=null&&m.revparIndex>0)rpis.push(m.revparIndex); }
    }); });
    var avgOcc = occs.length? occs.reduce(function(a,b){return a+b;},0)/occs.length : null;
    var avgRpi = rpis.length? rpis.reduce(function(a,b){return a+b;},0)/rpis.length : null;
    var kpis=[
      {lbl:YEAR+" revenue (booked)",val:money(revBooked),
        delta:(yoy==null?"":(yoy>=0?"pos":"neg")),deltaTxt:(yoy==null?"":signedPct(yoy)+" YoY")},
      {lbl:"Full-year pace",val:money(revTotal),delta:"muted",deltaTxt:DATA.listings.length+" listings"},
      {lbl:"Avg occupancy (booked)",val:pct(avgOcc),delta:"muted",deltaTxt:"listing avg"},
      {lbl:"Avg RevPAR Index",val:(avgRpi==null?"\\u2014":Math.round(avgRpi)),
        delta:(avgRpi>=100?"pos":"neg"),deltaTxt:(avgRpi>=100?"above market":"below market")},
    ];
    document.getElementById("kpis").innerHTML = kpis.map(function(k){
      return '<div class="kpi"><div class="lbl">'+k.lbl+'</div><div class="val">'+k.val+'</div>'
        +'<div class="delta '+(k.delta||"")+'">'+(k.deltaTxt||"")+'</div></div>';
    }).join("");
    document.getElementById("ov-year").textContent=YEAR;
  }

  // ---- portfolio summary table ----
  function listingAgg(l){
    var revBooked=0, revTotal=0, stlyBooked=0, occs=[], rpis=[];
    l.months.forEach(function(m){
      revTotal+=m.revenue||0;
      if(booked(m)){ revBooked+=m.revenue||0; stlyBooked+=m.revenueStly||0;
        if(m.occ!=null)occs.push(m.occ); if(m.revparIndex!=null&&m.revparIndex>0)rpis.push(m.revparIndex); }
    });
    return {
      name:l.name, city:l.city, bedrooms:l.bedrooms,
      revBooked:revBooked, revTotal:revTotal,
      yoy: stlyBooked?((revBooked-stlyBooked)/stlyBooked*100):null,
      occ: occs.length?occs.reduce(function(a,b){return a+b;},0)/occs.length:null,
      rpi: rpis.length?rpis.reduce(function(a,b){return a+b;},0)/rpis.length:null,
    };
  }
  function renderPortfolio(){
    var rows=DATA.listings.map(listingAgg);
    var cols=[
      {k:"name",t:"Listing",fmt:function(r){return '<b>'+esc(r.name)+'</b><div class="muted" style="font-weight:400;font-size:12px">'+esc(r.city||"")+(r.bedrooms?" \\u00b7 "+r.bedrooms+" br":"")+'</div>';},left:true},
      {k:"revBooked",t:"Booked",fmt:function(r){return money(r.revBooked);}},
      {k:"revTotal",t:"Pace (yr)",fmt:function(r){return money(r.revTotal);}},
      {k:"yoy",t:"Rev YoY",fmt:function(r){return r.yoy==null?'<span class="muted">\\u2014</span>':'<span class="pill '+(r.yoy>=0?"pos":"neg")+'">'+signedPct(r.yoy)+'</span>';}},
      {k:"occ",t:"Avg Occ",fmt:function(r){return pct(r.occ);}},
      {k:"rpi",t:"Avg RPI",fmt:function(r){return r.rpi==null?"\\u2014":'<span class="'+(r.rpi>=100?"pos":"neg")+'">'+Math.round(r.rpi)+'</span>';}},
    ];
    sortableTable("tbl-portfolio",cols,rows,"revBooked",false);
  }

  // ---- listings tab (same rows, its own sortable table) ----
  function renderListings(){
    var rows=DATA.listings.map(listingAgg);
    var cols=[
      {k:"name",t:"Listing",fmt:function(r){return '<b>'+esc(r.name)+'</b>';},left:true},
      {k:"city",t:"Market",fmt:function(r){return '<span class="muted">'+esc(r.city||"")+'</span>';},left:true},
      {k:"bedrooms",t:"BR",fmt:function(r){return r.bedrooms||"\\u2014";}},
      {k:"revBooked",t:"Booked rev",fmt:function(r){return money(r.revBooked);}},
      {k:"revTotal",t:"Full-year pace",fmt:function(r){return money(r.revTotal);}},
      {k:"yoy",t:"Rev YoY",fmt:function(r){return r.yoy==null?'<span class="muted">\\u2014</span>':'<span class="pill '+(r.yoy>=0?"pos":"neg")+'">'+signedPct(r.yoy)+'</span>';}},
      {k:"occ",t:"Avg Occ",fmt:function(r){return pct(r.occ);}},
      {k:"rpi",t:"Avg RPI",fmt:function(r){return r.rpi==null?"\\u2014":'<span class="'+(r.rpi>=100?"pos":"neg")+'">'+Math.round(r.rpi)+'</span>';}},
    ];
    sortableTable("tbl-listings",cols,rows,"revTotal",false);
  }

  // ---- generic sortable table ----
  function sortableTable(id,cols,rows,sortKey,asc){
    var state={key:sortKey,asc:!!asc};
    function draw(){
      var sorted=rows.slice().sort(function(a,b){
        var x=a[state.key], y=b[state.key];
        if(typeof x==="string"){ x=x||""; y=y||""; return state.asc?x.localeCompare(y):y.localeCompare(x); }
        x=x==null?-Infinity:x; y=y==null?-Infinity:y;
        return state.asc?x-y:y-x;
      });
      var thead='<thead><tr>'+cols.map(function(c){
        var cls=(c.k===state.key?("sorted"+(state.asc?" asc":"")):"");
        return '<th class="'+cls+'" data-k="'+c.k+'">'+c.t+'</th>';
      }).join("")+'</tr></thead>';
      var tbody='<tbody>'+sorted.map(function(r){
        return '<tr>'+cols.map(function(c){
          return '<td class="'+(c.left?"":"mono")+'">'+c.fmt(r)+'</td>';
        }).join("")+'</tr>';
      }).join("")+'</tbody>';
      var el=document.getElementById(id);
      el.innerHTML=thead+tbody;
      el.querySelectorAll("th").forEach(function(th){
        th.addEventListener("click",function(){
          var k=th.getAttribute("data-k");
          if(state.key===k) state.asc=!state.asc; else { state.key=k; state.asc=false; }
          draw();
        });
      });
    }
    draw();
  }

  // ---- market position (per selected listing) ----
  function renderRpi(l){
    var h=300, ms=l.months, max=0; ms.forEach(function(m){ if(m.revparIndex)max=Math.max(max,m.revparIndex); });
    max=niceMax(Math.max(max,120));
    var pw=plotW(), plotH=h-PADT-PADB, slot=pw/12, bw=Math.min(30,slot*0.44);
    var s=svgOpen(h)+gridY(h,4,function(v){return Math.round(v);},max);
    // parity line at 100
    var yPar=PADT+plotH-(plotH*100/max);
    s+='<line x1="'+PADL+'" y1="'+yPar+'" x2="'+(W-PADR)+'" y2="'+yPar+'" stroke="#c7d2ce" stroke-dasharray="4 4"/>';
    ms.forEach(function(m,i){
      var cx=PADL+slot*i+slot/2, v=m.revparIndex||0, bh=max?plotH*v/max:0, y=PADT+plotH-bh;
      var fill = v===0?"#dfe6e3":(v>=100?"var(--emerald)":"var(--neg)");
      var tip='<b>'+m.label+' '+YEAR+'</b>'+ttRow("RevPAR Index",v?Math.round(v):"\\u2014")
        +ttRow("Occ",pct(m.occ))+ttRow("Mkt Occ",pct(m.marketOcc));
      s+='<rect class="bar" x="'+(cx-bw/2)+'" y="'+y+'" width="'+bw+'" height="'+Math.max(0,bh)+'" rx="4" fill="'+fill+'" data-tip="'+esc(tip)+'"/>';
    });
    s+=xLabels(h,ms.map(function(m){return m.label;}))+'</svg>';
    document.getElementById("chart-rpi").innerHTML=s;
  }

  function renderOcc(l){
    var h=280, ms=l.months, max=100;
    var pw=plotW(), plotH=h-PADT-PADB, slot=pw/12;
    var s=svgOpen(h)+gridY(h,4,function(v){return Math.round(v)+"%";},max);
    function line(key,color){
      var pts=ms.map(function(m,i){ var cx=PADL+slot*i+slot/2; var v=m[key]||0; return cx+","+(PADT+plotH-plotH*v/max); });
      return '<polyline points="'+pts.join(" ")+'" fill="none" stroke="'+color+'" stroke-width="2.5"/>';
    }
    s+=line("marketOcc","#c7d2ce");
    s+=line("occ","var(--emerald)");
    ms.forEach(function(m,i){
      var cx=PADL+slot*i+slot/2, y=PADT+plotH-plotH*(m.occ||0)/max;
      var tip='<b>'+m.label+' '+YEAR+'</b>'+ttRow("Listing occ",pct(m.occ))+ttRow("Market occ",pct(m.marketOcc))
        +ttRow("Gap",signedPp((m.occ||0)-(m.marketOcc||0)));
      s+='<circle class="dot" cx="'+cx+'" cy="'+y+'" r="5" fill="#fff" stroke="var(--emerald)" stroke-width="2.5" data-tip="'+esc(tip)+'"/>';
    });
    s+=xLabels(h,ms.map(function(m){return m.label;}))+'</svg>';
    document.getElementById("chart-occ").innerHTML=s;
    document.querySelector("#view-market .legend");
  }

  function renderAdr(l){
    var h=280, ms=l.months, max=0; ms.forEach(function(m){ max=Math.max(max,m.adr||0,m.marketAdr||0); });
    max=niceMax(max);
    var pw=plotW(), plotH=h-PADT-PADB, slot=pw/12, bw=Math.min(13,slot*0.32);
    var s=svgOpen(h)+gridY(h,4,function(v){return "$"+Math.round(v);},max);
    ms.forEach(function(m,i){
      var cx=PADL+slot*i+slot/2;
      var groups=[{v:m.adr,fill:"var(--emerald)",lbl:"Listing ADR"},{v:m.marketAdr,fill:"var(--mint)",lbl:"Market ADR"}];
      groups.forEach(function(g,gi){
        var x=cx-bw-1+gi*(bw+2), bh=max?plotH*(g.v||0)/max:0, y=PADT+plotH-bh;
        var prem = (m.marketAdr&&m.adr!=null)?((m.adr-m.marketAdr)/m.marketAdr*100):null;
        var tip='<b>'+m.label+' '+YEAR+'</b>'+ttRow("Listing ADR",money(m.adr))+ttRow("Market ADR",money(m.marketAdr))
          +ttRow("Premium",prem==null?"\\u2014":signedPct(prem));
        s+='<rect class="bar" x="'+x+'" y="'+y+'" width="'+bw+'" height="'+Math.max(0,bh)+'" rx="3" fill="'+g.fill+'" data-tip="'+esc(tip)+'"/>';
      });
    });
    s+=xLabels(h,ms.map(function(m){return m.label;}))+'</svg>';
    document.getElementById("chart-adr").innerHTML=s;
  }

  function renderPosition(l){
    var rows=l.months.map(function(m){
      return {
        mn:m.monthNum, label:m.label, rpi:m.revparIndex, occ:m.occ, mocc:m.marketOcc,
        gap:(m.occ!=null&&m.marketOcc!=null)?(m.occ-m.marketOcc):null,
        adr:m.adr, madr:m.marketAdr,
        prem:(m.marketAdr&&m.adr!=null)?((m.adr-m.marketAdr)/m.marketAdr*100):null,
        yoy:m.revenueYoy,
      };
    });
    var cols=[
      {k:"mn",t:"Month",fmt:function(r){return '<b>'+r.label+'</b>';},left:true},
      {k:"rpi",t:"RPI",fmt:function(r){return r.rpi==null?"\\u2014":'<span class="'+(r.rpi>=100?"pos":(r.rpi>0?"neg":"muted"))+'">'+Math.round(r.rpi)+'</span>';}},
      {k:"occ",t:"Occ",fmt:function(r){return pct(r.occ);}},
      {k:"mocc",t:"Mkt Occ",fmt:function(r){return '<span class="muted">'+pct(r.mocc)+'</span>';}},
      {k:"gap",t:"Occ Gap",fmt:function(r){return r.gap==null?"\\u2014":'<span class="'+(r.gap>=0?"pos":"neg")+'">'+signedPp(r.gap)+'</span>';}},
      {k:"adr",t:"ADR",fmt:function(r){return money(r.adr);}},
      {k:"madr",t:"Mkt ADR",fmt:function(r){return '<span class="muted">'+money(r.madr)+'</span>';}},
      {k:"prem",t:"ADR Prem.",fmt:function(r){return r.prem==null?"\\u2014":'<span class="'+(r.prem>=0?"pos":"neg")+'">'+signedPct(r.prem)+'</span>';}},
      {k:"yoy",t:"Rev YoY",fmt:function(r){return r.yoy==null?'<span class="muted">\\u2014</span>':'<span class="pill '+(r.yoy>=0?"pos":"neg")+'">'+signedPct(r.yoy)+'</span>';}},
    ];
    // default: calendar order (by month number)
    sortableTable("tbl-position",cols,rows,"mn",true);
  }

  function renderMarket(idx){
    var l=DATA.listings[idx];
    document.getElementById("sel-meta").textContent=(l.city||"")+(l.bedrooms?" \\u00b7 "+l.bedrooms+" bedrooms":"");
    renderRpi(l); renderOcc(l); renderAdr(l); renderPosition(l);
  }

  // ---- tabs ----
  document.getElementById("tabs").addEventListener("click",function(e){
    var b=e.target.closest(".tab"); if(!b) return;
    var v=b.getAttribute("data-view");
    document.querySelectorAll(".tab").forEach(function(t){t.classList.toggle("active",t===b);});
    document.querySelectorAll(".view").forEach(function(s){s.classList.toggle("active",s.id==="view-"+v);});
  });

  // ---- selector ----
  var sel=document.getElementById("sel");
  sel.innerHTML=DATA.listings.map(function(l,i){return '<option value="'+i+'">'+esc(l.name)+'</option>';}).join("");
  sel.addEventListener("change",function(){ renderMarket(+sel.value); });

  // ---- initial render ----
  renderKpis(); renderPacing(); renderPortfolio(); renderListings(); renderMarket(0);
})();
</script>
</body>
</html>`;
}
