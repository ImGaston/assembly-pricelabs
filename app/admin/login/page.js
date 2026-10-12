import { login } from '../actions.js';
import Logo from '../Logo.js';

export default function LoginPage({ searchParams }) {
  return (
    <div className="login">
      <div className="card">
        <div className="logo"><Logo /></div>
        <form action={login}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" autoFocus />
          </div>
          {searchParams?.error && <p className="notice err">Wrong password.</p>}
          <button className="btn full" type="submit">Sign In</button>
        </form>
        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>Dashboard Manager · internal</p>
      </div>
    </div>
  );
}
