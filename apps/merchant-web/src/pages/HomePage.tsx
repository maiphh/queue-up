import { Navigate, useNavigate } from 'react-router-dom';
import { devHeadersEnabled, homeFor, readStaffSession } from '../auth/staffSession';
import { BeVe, type BeVePose } from '@luotdi/design-d';
import '../modules/host-pos/call-console.css';
import '../components/r4.css';
import { writeDevActor, type DevActor } from '../dev/actor';

type Door = { n: string; tag: string; title: string; blurb: string; email: string; cta: string; pose: BeVePose; actor: DevActor; to: string; primary?: boolean };

const DOORS: Door[] = [
  { n: '01', tag: 'Nền tảng', title: 'Admin', blurb: 'Thêm client, xem mọi chi nhánh, đổi gói.', email: 'admin@luotdi.vn', cta: 'Vào admin', pose: 'idle', actor: { role: 'PLATFORM_ADMIN' }, to: '/admin' },
  { n: '02', tag: 'Tài khoản', title: 'Client', blurb: 'Thương hiệu, chi nhánh, bàn và ví Zalo.', email: 'client@antam.vn', cta: 'Vào client', pose: 'thanks', actor: { role: 'CLIENT_ADMIN', clientId: 'client-an-tam' }, to: '/client' },
  { n: '03', tag: 'Tại quầy', title: 'Quản lý', blurb: 'Gọi số, khách tại quầy, TV và mã QR.', email: 'manager@pho-nh.vn', cta: 'Vào quản lý', pose: 'excited', actor: { role: 'BRANCH_MANAGER', branchId: 'branch-pho-d1' }, to: '/manage/branch-pho-d1', primary: true },
];

/** Dev-only role door (M0). Production signs in with Zalo and redirects by role. */
export function HomePage() {
  const navigate = useNavigate();
  if (!devHeadersEnabled()) {
    const s = readStaffSession();
    return <Navigate to={s ? homeFor(s.staff) : '/login'} replace />;
  }
  return (
    <div className="d-root" data-page="home" style={{ minHeight: '100vh', background: '#f6f4ea', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ display: 'grid', gap: 22, justifyItems: 'center', width: 'min(1000px, 100%)' }}>
        <div className="r4-row">
          <span className="cc-logo" style={{ margin: 0 }}>L</span>
          <div>
            <h1 className="r4-title" style={{ fontSize: 30 }}>LượtĐi</h1>
            <span className="d-muted">Bạn đăng nhập với vai trò nào?</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, width: '100%' }}>
          {DOORS.map((d) => (
            <section key={d.title} className="r4-card" style={d.primary ? { borderColor: 'var(--d-navy)', boxShadow: '0 5px 0 var(--d-navy)' } : undefined}>
              <div className="r4-row" style={{ alignItems: 'flex-start' }}>
                <span className="d-label">{d.n} · {d.tag}</span>
                <span className="r4-sp" />
                <BeVe pose={d.pose} size={52} />
              </div>
              <h2 className="r4-title" style={{ fontSize: 22, marginTop: 6 }}>{d.title}</h2>
              <p style={{ margin: '6px 0', font: '500 14.5px var(--d-font-body)' }}>{d.blurb}</p>
              <p className="r4-mono" style={{ margin: '0 0 12px', color: 'var(--d-muted)', fontSize: 12 }}>{d.email}</p>
              <button type="button" className={d.primary ? 'd-pill d-pill-go' : 'd-pill'} onClick={() => { writeDevActor(d.actor); navigate(d.to); }}>{d.cta} ›</button>
            </section>
          ))}
        </div>
        <span className="r4-sc r4-sc-y">Chỉ hiện ở bản thử nghiệm · bản thật đăng nhập bằng email và vào thẳng trang theo vai trò</span>
        <button type="button" className="d-pill" onClick={() => navigate('/login')}>Đăng nhập bằng email</button>
      </div>
    </div>
  );
}
