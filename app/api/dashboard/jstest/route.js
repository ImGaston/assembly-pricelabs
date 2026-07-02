/**
 * TEMPORARY JS-capability probe — NOT part of the product.
 *
 * The real dashboard is intentionally no-JS (AGENTS.md rule #1). Before we
 * consider adding client-side JS (sortable tables, richer charts), we need to
 * know whether Assembly's iframe actually *runs* JS or embeds us in a
 * restrictive `sandbox`. This page renders under /api/dashboard/* so it inherits
 * the exact same iframe headers as the dashboard (see vercel.json), then reports
 * on-screen whether JS executed, whether we're framed, and whether a sandbox is
 * restricting us.
 *
 * How to use: deploy, embed https://<host>/api/dashboard/jstest in Assembly as
 * a test embed, open it as a client. The page tells you the verdict on screen.
 * DELETE this file once the question is answered.
 *
 * This is a static segment, so Next.js routes it here instead of [slug]/route.js
 * — no DB, no token, no impact on the production route. The folder must NOT start
 * with "_": Next.js treats "_name" as a private folder and excludes it from
 * routing (the request would fall through to [slug] → 404).
 */

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>JS probe</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a2b3c; background: #f6f8fa;
  }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .card { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .banner { font-size: 20px; font-weight: 700; padding: 16px 20px; border-radius: 12px; margin-bottom: 16px; }
  .pending { background: #fff4d6; color: #7a5b00; }
  .ok { background: #d8f5e3; color: #0a6b34; }
  .bad { background: #fddcdc; color: #8a1414; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 4px; vertical-align: top; }
  td:first-child { color: #667; width: 180px; }
  td:last-child { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  code { background: #eef1f4; padding: 1px 6px; border-radius: 4px; }
  button { font: inherit; font-weight: 600; padding: 8px 16px; border: 0; border-radius: 8px;
           background: #1a73e8; color: #fff; cursor: pointer; }
  /* CSS-only animation — runs even if JS is blocked, for comparison */
  .bar { transform-origin: bottom; animation: grow .8s ease-out both; }
  .bar:nth-child(2){animation-delay:.1s}.bar:nth-child(3){animation-delay:.2s}
  .bar:nth-child(4){animation-delay:.3s}.bar:nth-child(5){animation-delay:.4s}
  @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
</style>
</head>
<body>
  <!-- If scripts are blocked, this is what the user sees -->
  <noscript>
    <div class="banner bad">❌ JS BLOCKED — &lt;noscript&gt; is active. Assembly's iframe is not running scripts (likely a sandbox without allow-scripts).</div>
  </noscript>

  <div id="status" class="banner pending">⏳ Waiting for JS… if this never changes, JS did not run.</div>

  <h1>Assembly iframe · JS capability probe</h1>

  <div class="card">
    <table>
      <tr><td>JS executed</td><td id="r-js">—</td></tr>
      <tr><td>Still running (clock)</td><td id="r-clock">—</td></tr>
      <tr><td>Inside an iframe</td><td id="r-framed">—</td></tr>
      <tr><td>window.origin</td><td id="r-origin">—</td></tr>
      <tr><td>Storage access</td><td id="r-storage">—</td></tr>
      <tr><td>Parent URL (referrer)</td><td id="r-referrer">—</td></tr>
      <tr><td>DOM interaction</td><td id="r-interact">— (click the button)</td></tr>
    </table>
  </div>

  <div class="card">
    <p style="margin-top:0">CSS animation (works without JS) + a JS-driven re-sort:</p>
    <svg id="chart" viewBox="0 0 260 120" width="260" height="120">
      <g id="bars">
        <rect class="bar" x="10"  y="30"  width="30" height="80" rx="3" fill="#1a73e8"/>
        <rect class="bar" x="60"  y="70"  width="30" height="40" rx="3" fill="#1a73e8"/>
        <rect class="bar" x="110" y="10"  width="30" height="100" rx="3" fill="#1a73e8"/>
        <rect class="bar" x="160" y="50"  width="30" height="60" rx="3" fill="#1a73e8"/>
        <rect class="bar" x="210" y="85"  width="30" height="25" rx="3" fill="#1a73e8"/>
      </g>
    </svg>
    <div style="margin-top:12px"><button id="sort">Sort bars (JS test)</button></div>
  </div>

  <script>
    (function () {
      function set(id, txt, cls) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = txt;
        if (cls) el.style.color = cls;
      }
      var GREEN = "#0a6b34", RED = "#8a1414";

      // 1. JS ran at all.
      var banner = document.getElementById("status");
      banner.className = "banner ok";
      banner.textContent = "✅ JS IS RUNNING inside this frame.";
      set("r-js", "yes", GREEN);

      // 2. Keep-alive clock — proves JS keeps executing, not just once.
      setInterval(function () {
        set("r-clock", "yes · " + new Date().toLocaleTimeString());
      }, 1000);

      // 3. Are we framed?
      var framed = false;
      try { framed = window.self !== window.top; } catch (e) { framed = true; }
      set("r-framed", framed ? "yes" : "no (open standalone?)", framed ? GREEN : RED);

      // 4. Origin — "null" means a sandboxed opaque origin (no allow-same-origin).
      var origin = "?";
      try { origin = String(window.origin); } catch (e) { origin = "(threw)"; }
      set("r-origin", origin, origin === "null" ? RED : GREEN);

      // 5. Storage — throws under sandbox without allow-same-origin.
      try {
        window.localStorage.setItem("__probe", "1");
        window.localStorage.removeItem("__probe");
        set("r-storage", "allowed", GREEN);
      } catch (e) {
        set("r-storage", "blocked (" + e.name + ")", RED);
      }

      // 6. Parent URL.
      var ref = document.referrer || "(none)";
      set("r-referrer", ref);

      // 7. DOM interaction — click handler re-sorts the bars by height.
      document.getElementById("sort").addEventListener("click", function () {
        var g = document.getElementById("bars");
        var bars = Array.prototype.slice.call(g.children);
        bars.sort(function (a, b) {
          return (+b.getAttribute("height")) - (+a.getAttribute("height"));
        });
        bars.forEach(function (bar, i) {
          bar.setAttribute("x", 10 + i * 50);
        });
        set("r-interact", "yes · sorted at " + new Date().toLocaleTimeString(), GREEN);
      });

      // Log to console too (Assembly troubleshooting mentions the console).
      try {
        console.log("[js-probe] running · framed=" + framed + " · origin=" + origin + " · referrer=" + ref);
      } catch (e) {}
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
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
