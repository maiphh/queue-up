import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import '../modules/host-pos/call-console.css';
import '../components/r4.css';
import { devHeadersEnabled, devStaffLogin, homeFor, staffLogin, type StaffSession } from '../auth/staffSession';
import { DEV_ACTOR_PRESETS, writeDevActor } from '../dev/actor';

export const loginCopy = {
  title: 'Đăng nhập LượtĐi',
  sub: 'Dành cho admin, client và quản lý chi nhánh',
  email: 'Email',
  password: 'Mật khẩu',
  submit: 'Đăng nhập',
  busy: 'Đang đăng nhập…',
  devTitle: 'Bản thử nghiệm · đăng nhập nhanh',
};

/** Only same-origin app paths are accepted as ?next= (no open redirect). */
function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dev = devHeadersEnabled();

  const done = (s: StaffSession) => navigate(safeNext(params.get('next')) ?? homeFor(s.staff), { replace: true });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await staffLogin(email.trim(), password);
    setBusy(false);
    if (r.ok) done(r.session);
    else setError(r.message);
  }

  async function quick(presetEmail: string, actor: (typeof DEV_ACTOR_PRESETS)[number]['actor']) {
    setError(null);
    const r = await devStaffLogin(presetEmail);
    if (r.ok) {
      writeDevActor(actor);
      done(r.session);
    } else setError(r.message);
  }

  return (
    <div className="d-root" data-page="login" style={{ minHeight: '100vh', background: '#f6f4ea', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form className="r4-card" onSubmit={(e) => void submit(e)} style={{ width: 'min(420px, 100%)', display: 'grid', gap: 12 }} aria-label={loginCopy.title}>
        <div className="r4-row">
          <span className="cc-logo" style={{ margin: 0 }}>L</span>
          <div>
            <h1 className="r4-title" style={{ fontSize: 24 }}>{loginCopy.title}</h1>
            <span className="d-muted">{loginCopy.sub}</span>
          </div>
          <span className="r4-sp" />
          <BeVe pose={error ? 'offline' : 'idle'} size={52} />
        </div>
        <label className="d-label" htmlFor="login-email">{loginCopy.email}</label>
        <input id="login-email" className="r4-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="d-label" htmlFor="login-pw">{loginCopy.password}</label>
        <input id="login-pw" className="r4-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p role="alert" className="r4-err" data-testid="login-error">{error}</p> : null}
        <button type="submit" className="d-pill d-pill-go" disabled={busy}>{busy ? loginCopy.busy : loginCopy.submit}</button>
        {dev ? (
          <div data-testid="dev-quick-login" style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            <span className="r4-sc r4-sc-y">{loginCopy.devTitle}</span>
            <div className="r4-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {DEV_ACTOR_PRESETS.filter((p) => p.email).map((p) => (
                <button key={p.id} type="button" className="d-pill" onClick={() => void quick(p.email!, p.actor)}>{p.label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
