import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { managerCopy as m } from '@luotdi/shared';
import { Rail } from '../../components/Rail';

export type ManagerSection = 'counter' | 'history' | 'qr' | 'reports' | 'settings';

export function ManagerRail({ branchId, active }: { branchId: string; active: ManagerSection }) {
  const base = `/manage/${branchId}`;
  return (
    <Rail
      active={active}
      items={[
        { id: 'counter', icon: 'counter', label: m.nav.counter, to: base },
        { id: 'history', icon: 'history', label: m.nav.history, to: `${base}/history` },
        { id: 'tv', icon: 'tv', label: m.nav.tv, to: `/tv/branch/${branchId}`, external: true },
        { id: 'qr', icon: 'qr', label: m.nav.qr, to: `${base}/qr` },
        { id: 'reports', icon: 'reports', label: m.nav.reports, to: `${base}/reports` },
        { id: 'settings', icon: 'settings', label: m.nav.settings, to: `${base}/settings` },
      ]}
    />
  );
}

type Head = { name: string; isPaused: boolean } | null;

/** Branch name + open/paused for the sub-page header (public TV payload, cheap). */
export function useBranchHead(branchId: string | undefined): Head {
  const [head, setHead] = useState<Head>(null);
  useEffect(() => {
    if (!branchId) return;
    let live = true;
    fetch(`/api/branches/${branchId}/tv`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { branchName?: string; name?: string; isPaused?: boolean } | null) => {
        if (live && j) setHead({ name: j.branchName ?? j.name ?? '', isPaused: !!j.isPaused });
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [branchId]);
  return head;
}

/** Shared frame for /manage/:id/* sub-pages. */
export function ManagerShell({ branchId, active, title, sub, actions, children, page }: {
  branchId: string; active: ManagerSection; title: string; sub?: string; actions?: ReactNode; children: ReactNode; page: string;
}) {
  const head = useBranchHead(branchId);
  return (
    <div data-page={page} className="d-root cc-app">
      <ManagerRail branchId={branchId} active={active} />
      <div className="cc-main r4-main">
        <header className="cc-top">
          <div className="cc-branch">
            <small>Chi nhánh</small>
            <h1>{head?.name || '…'}</h1>
          </div>
          <h2 className="r4-title">{title}{sub ? <small>{sub}</small> : null}</h2>
          <span className="cc-sp" />
          {head ? (
            <span className={head.isPaused ? 'd-pill' : 'd-pill d-pill-green'} role="status">
              <i className="cc-dot" />{head.isPaused ? m.statusPaused : m.statusOpen}
            </span>
          ) : null}
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}
