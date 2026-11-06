import Link from 'next/link';
import { adminSession } from '../../lib/admin-auth.js';
import { signOut } from './actions.js';
import Logo from './Logo.js';

// Top bar + content area for signed-in admin pages.
export default function Shell({ crumb, children }) {
  const session = adminSession();
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/admin">
          <Logo />
          <span className="crumb">
            Dashboard Manager{crumb ? <> / <b>{crumb}</b></> : null}
          </span>
        </Link>
        {session?.via === 'assembly' ? (
          // Signed in by Assembly (Internal-facing URL): sign-out happens in Assembly.
          <span className="muted" style={{ fontSize: 13 }}>{session.identity} · via Assembly</span>
        ) : (
          <form className="inline" action={signOut}>
            <button className="btn ghost small" type="submit">Sign out</button>
          </form>
        )}
      </header>
      <main>{children}</main>
    </>
  );
}
