import Link from 'next/link';
import { signOut } from './actions.js';
import Logo from './Logo.js';

// Top bar + content area for signed-in admin pages.
export default function Shell({ crumb, children }) {
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/admin">
          <Logo />
          <span className="crumb">
            Dashboard Manager{crumb ? <> / <b>{crumb}</b></> : null}
          </span>
        </Link>
        <form className="inline" action={signOut}>
          <button className="btn ghost small" type="submit">Sign out</button>
        </form>
      </header>
      <main>{children}</main>
    </>
  );
}
