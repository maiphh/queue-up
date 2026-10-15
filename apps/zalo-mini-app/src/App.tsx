import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { resolveInitialRoute } from './lib/initialRoute';
import {
  BranchCheckInPage,
  LivePassPage,
  MarketplacePage,
} from './pages';

/**
 * MemoryRouter: inside Zalo the page is served under a Zalo-controlled path
 * (h5.zdn.vn/zapps/<appId>/...), so BrowserRouter routes never match without
 * an exact basename. Memory routing is path-independent; the initial route
 * comes from launch params. The Zalo action bar is hidden (app-config.json),
 * so we render our own back button.
 */
function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';
  return (
    <header className="zma-header">
      {canGoBack ? (
        <button type="button" aria-label="Quay lại" onClick={() => navigate(-1)}>
          ‹
        </button>
      ) : null}
      <span>LượtĐi</span>
    </header>
  );
}

export function App({ initialPath }: { initialPath?: string } = {}) {
  return (
    <MemoryRouter initialEntries={[initialPath ?? resolveInitialRoute()]}>
      <main className="d-root zma-shell">
        <Header />
        <Routes>
          <Route path="/" element={<MarketplacePage />} />
          <Route path="/b/:qrToken" element={<BranchCheckInPage />} />
          <Route path="/ticket/:ticketId" element={<LivePassPage />} />
        </Routes>
      </main>
    </MemoryRouter>
  );
}
