// Admin look mirrors the RevFactor Hub (shadcn "radix-luma", neutral base, Geist),
// not the client-dashboard brand tokens. Values copied from revfactor-hub/app/globals.css;
// keep them in sync by hand (this app has no Tailwind).
export const adminCss = `
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --primary: oklch(0.508 0.118 165.612);
    --primary-foreground: oklch(0.979 0.021 166.113);
    --secondary: oklch(0.967 0.001 286.375);
    --secondary-foreground: oklch(0.21 0.006 285.885);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --sidebar: oklch(0.985 0 0);
    --rim: inset 0 1px 0 0 oklch(1 0 0 / 0.65), inset 0 -1px 0 0 oklch(0.145 0 0 / 0.05), 0 0 0 1px oklch(0.145 0 0 / 0.06);
    --elev-1: 0 1px 2px -1px oklch(0.145 0 0 / 0.06), 0 2px 8px -2px oklch(0.145 0 0 / 0.08);
    --logo-light: block;
    --logo-dark: none;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: oklch(0.145 0 0);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.205 0 0);
      --primary: oklch(0.432 0.095 166.913);
      --secondary: oklch(0.274 0.006 286.033);
      --secondary-foreground: oklch(0.985 0 0);
      --muted: oklch(0.269 0 0);
      --muted-foreground: oklch(0.708 0 0);
      --destructive: oklch(0.704 0.191 22.216);
      --border: oklch(1 0 0 / 10%);
      --input: oklch(1 0 0 / 15%);
      --ring: oklch(0.556 0 0);
      --sidebar: oklch(0.205 0 0);
      --rim: inset 0 1px 0 0 oklch(1 0 0 / 0.1), inset 0 -1px 0 0 oklch(0 0 0 / 0.35), 0 0 0 1px oklch(1 0 0 / 0.1);
      --elev-1: 0 1px 2px -1px oklch(0 0 0 / 0.4), 0 2px 8px -2px oklch(0 0 0 / 0.35);
      --logo-light: none;
      --logo-dark: block;
    }
  }

  * { box-sizing: border-box; }
  html { -webkit-font-smoothing: antialiased; }
  body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
  .admin-root { font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif; min-height: 100vh; }
  a { color: inherit; }
  code, .mono { font-family: var(--font-geist-mono), ui-monospace, monospace; }

  .logo-light { display: var(--logo-light); }
  .logo-dark { display: var(--logo-dark); }

  /* Shell: top bar + content, like the Hub's authenticated layout */
  .topbar { position: sticky; top: 0; z-index: 10; height: 3.5rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 24px; background: color-mix(in oklab, var(--background) 80%, transparent); backdrop-filter: blur(14px) saturate(1.6); border-bottom: 1px solid var(--border); }
  .topbar .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
  .topbar .brand img { height: 22px; width: auto; }
  .topbar .crumb { font-size: 14px; font-weight: 500; color: var(--muted-foreground); }
  .topbar .crumb b { color: var(--foreground); font-weight: 500; }
  main { padding: 24px; max-width: 1280px; margin: 0 auto; }

  .page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
  h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
  .muted { color: var(--muted-foreground); }
  .page-head p { margin: 4px 0 0; }

  .card { background: var(--card); border-radius: 1.625rem; box-shadow: var(--rim), var(--elev-1); padding: 24px; margin-bottom: 24px; overflow: hidden; }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
  .card-title { font-size: 16px; font-weight: 500; margin: 0; }
  .card-desc { font-size: 13px; color: var(--muted-foreground); margin: 4px 0 0; }

  /* Table (shadcn) */
  .scroll { overflow-x: auto; margin: 0 -24px; padding: 0 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { height: 40px; padding: 0 8px; text-align: left; font-weight: 500; color: var(--muted-foreground); white-space: nowrap; border-bottom: 1px solid color-mix(in oklab, var(--foreground) 6%, transparent); }
  td { padding: 8px; vertical-align: middle; border-bottom: 1px solid color-mix(in oklab, var(--foreground) 6%, transparent); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: color-mix(in oklab, var(--foreground) 4%, transparent); }
  .cell-title { font-weight: 500; }
  .cell-sub { font-size: 12px; color: var(--muted-foreground); }

  /* Badge (shadcn) */
  .pill { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; border: 1px solid transparent; text-transform: capitalize; }
  .pill.beta { background: var(--primary); color: var(--primary-foreground); }
  .pill.stable { background: var(--secondary); color: var(--secondary-foreground); }
  .pill.off { background: color-mix(in oklab, var(--destructive) 10%, transparent); color: var(--destructive); }
  .pill.mock { border-color: var(--border); color: var(--foreground); }

  /* Button (shadcn) */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid transparent; font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; text-decoration: none; background: var(--primary); color: var(--primary-foreground); transition: background-color .15s, transform .1s; }
  .btn:hover { background: color-mix(in oklab, var(--primary) 80%, transparent); }
  .btn:active { transform: translateY(1px) scale(0.97); }
  .btn.ghost { background: var(--background); color: var(--foreground); border-color: var(--border); }
  .btn.ghost:hover { background: var(--muted); }
  .btn.small { height: 32px; padding: 0 12px; font-size: 13px; }
  .btn.xs { height: 24px; padding: 0 10px; font-size: 12px; }
  .btn.full { width: 100%; }
  .btn:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 30%, transparent); }

  .row-actions { display: flex; gap: 6px; align-items: center; flex-wrap: nowrap; }
  form.inline { display: inline; margin: 0; }

  /* Inputs (shadcn) */
  label { display: block; font-size: 14px; font-weight: 500; margin: 0 0 8px; }
  .field { margin-bottom: 16px; }
  label.check { display: flex; align-items: center; gap: 8px; font-weight: 500; }
  label.check input { width: 16px; height: 16px; accent-color: var(--primary); }
  input[type=text], input[type=password], input[type=date], select, textarea { width: 100%; height: 36px; padding: 4px 12px; font: inherit; font-size: 14px; color: var(--foreground); background: color-mix(in oklab, var(--input) 50%, transparent); border: 1px solid transparent; border-radius: 1.375rem; }
  select { appearance: none; padding-right: 32px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23888' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
  textarea { height: auto; min-height: 96px; padding: 12px; border-radius: 1rem; resize: vertical; }
  textarea.mono { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 13px; }
  ::placeholder { color: var(--muted-foreground); }
  .hint { font-size: 12px; color: var(--muted-foreground); margin-top: 6px; }
  .link { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 12px; min-width: 220px; height: 32px !important; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } main { padding: 16px; } .topbar { padding: 0 16px; } }

  .notice { font-size: 14px; padding: 10px 14px; border-radius: 1rem; margin-bottom: 16px; }
  .notice.ok { background: color-mix(in oklab, var(--primary) 10%, transparent); color: var(--primary); }
  .notice.err { background: color-mix(in oklab, var(--destructive) 10%, transparent); color: var(--destructive); }
  .actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
  .back { display: inline-block; font-size: 14px; color: var(--muted-foreground); text-decoration: none; margin-bottom: 12px; }
  .back:hover { color: var(--foreground); }

  /* Login: centered card, like the Hub */
  .login { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .login .card { width: 100%; max-width: 384px; margin: 0; }
  .login .logo { display: flex; justify-content: center; margin: 4px 0 20px; }
  .login .logo img { width: 200px; height: auto; }
`;
