import { BrowserRouter, Route, Routes } from 'react-router-dom';
import {
  BranchCheckInPage,
  LivePassPage,
  MarketplacePage,
} from './pages';

export function App() {
  return (
    <BrowserRouter>
      <main className="min-h-screen bg-chassis text-carbon font-sans">
        <header className="border-b border-grid bg-ink px-4 py-3 text-panel">
          <h1 className="font-mono text-sm tracking-widest tabular">LUOTDI</h1>
        </header>
        <Routes>
          <Route path="/" element={<MarketplacePage />} />
          <Route path="/b/:qrToken" element={<BranchCheckInPage />} />
          <Route path="/ticket/:ticketId" element={<LivePassPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
