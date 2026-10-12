'use client';

import { useState } from 'react';

// The readonly input works without JS (select + copy by hand); the button is an enhancement.
export default function CopyLink({ url }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row-actions">
      <input className="link" type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn ghost xs"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <a className="btn ghost xs" href={url} target="_blank" rel="noreferrer">Open</a>
    </div>
  );
}
