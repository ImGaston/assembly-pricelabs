'use client';

import { useRef, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Search + filters for the client table. Without JS it is a plain GET form
// (Filter button → ?q=&status=&layout=&variant=); with JS it updates the URL as
// you type / pick, without a full reload. Filtering itself happens server-side.
export default function ClientFilters({ values, statuses, layouts, total, shown }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef(null);
  const formRef = useRef(null);

  function apply() {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(formRef.current)) if (String(v).trim()) params.set(k, String(v).trim());
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}#clients` : `${pathname}#clients`, { scroll: false }));
  }

  function applySoon() {
    clearTimeout(timer.current);
    timer.current = setTimeout(apply, 250);
  }

  const active = ['q', 'status', 'layout', 'variant'].some((k) => values[k]);

  return (
    <form
      ref={formRef}
      className="filters"
      method="get"
      action="/admin#clients"
      onSubmit={(e) => { e.preventDefault(); apply(); }}
    >
      <input
        type="search"
        name="q"
        defaultValue={values.q}
        placeholder="Search name, market or ID…"
        aria-label="Search clients"
        onChange={applySoon}
      />
      <select name="status" defaultValue={values.status} aria-label="Filter by status" onChange={apply}>
        <option value="">All statuses</option>
        {statuses.map((s) => <option key={s} value={s}>{s === 'none' ? 'No status' : s}</option>)}
      </select>
      <select name="layout" defaultValue={values.layout} aria-label="Filter by model" onChange={apply}>
        <option value="">All models</option>
        {layouts.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
      </select>
      <select name="variant" defaultValue={values.variant} aria-label="Filter by variant" onChange={apply}>
        <option value="">All variants</option>
        <option value="stable">Stable</option>
        <option value="beta">Beta</option>
      </select>
      <noscript><button className="btn ghost small" type="submit">Filter</button></noscript>
      {active && <a className="btn ghost small" href="/admin#clients">Clear</a>}
      <span className="muted count" aria-live="polite">{pending ? 'Filtering…' : `${shown} of ${total}`}</span>
    </form>
  );
}
