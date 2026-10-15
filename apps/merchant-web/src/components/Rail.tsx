import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import '../modules/host-pos/call-console.css';
import './r4.css';

const ICON: Record<string, ReactNode> = {
  counter: <path d="M4 18h16M6 18V9l6-4 6 4v9M10 18v-5h4v5" />,
  history: (<><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>),
  tv: (<><rect x="3" y="5" width="18" height="12" rx="3" /><path d="M9 21h6" /></>),
  qr: (<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>),
  reports: <path d="M5 19V11M10 19V6M15 19v-9M20 19v-4" />,
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>),
  brands: (<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12.5h2M3 9h18" /></>),
  clients: (<><circle cx="9" cy="9" r="3.5" /><path d="M3 19c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5M16 6.5a3 3 0 010 5.5M18 14.8c1.4.6 2.4 2 2.8 4.2" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  system: <path d="M4 6h16v10H9l-5 4z" />,
};

export function RailIcon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

export type RailItem = {
  id: string;
  icon: string;
  label: string;
  /** Internal route, or external (new tab) when `external`. */
  to?: string;
  external?: boolean;
  /** Placeholder: rendered disabled with a "Sắp có" title. */
  placeholder?: boolean;
  onClick?: () => void;
};

/** Navy rail with Bé Vé idle in the corner (the one mascot allowed on staff views). */
export function Rail({ items, active, mascot = true }: { items: RailItem[]; active: string; mascot?: boolean }) {
  return (
    <nav className="cc-rail r4-no-print" aria-label="Điều hướng">
      <span className="cc-logo">L</span>
      {items.map((it) => {
        const cls = it.id === active ? 'cc-nav cc-nav-on' : 'cc-nav';
        const body = (<><RailIcon name={it.icon} />{it.label}</>);
        if (it.placeholder) {
          return (
            <span key={it.id} className={cls} aria-disabled="true" title="Sắp có" style={{ opacity: 0.55 }}>
              {body}
            </span>
          );
        }
        if (it.onClick) {
          return (
            <button key={it.id} type="button" className={cls} onClick={it.onClick} aria-current={it.id === active ? 'page' : undefined}>
              {body}
            </button>
          );
        }
        if (it.external) {
          return (
            <a key={it.id} className={cls} href={it.to} target="_blank" rel="noreferrer">
              {body}
            </a>
          );
        }
        return (
          <Link key={it.id} className={cls} to={it.to ?? '#'} aria-current={it.id === active ? 'page' : undefined}>
            {body}
          </Link>
        );
      })}
      <span className="r4-rail-sp" />
      {mascot ? <BeVe pose="idle" size={44} /> : null}
    </nav>
  );
}
