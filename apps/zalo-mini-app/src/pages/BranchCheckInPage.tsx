/**
 * QR deep-link check-in — `/b/:qrToken`.
 * Party-size matrix, bucket highlight, wait estimate, ISSUE QUEUE PASS.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BraunChassis,
  GridCell,
  KeycapButton,
  SegmentedMatrix,
  type SegmentedMatrixValue,
  TabularMetric,
} from '@luotdi/ui-braun';
import { useZaloIdentity } from '../hooks/useZaloIdentity';

type BranchBucket = {
  id: string;
  prefix: string;
  minPax: number;
  maxPax: number;
  partiesWaiting: number;
  estimatedWaitMins: number;
};

type BranchPayload = {
  id: string;
  name: string;
  district: string;
  city: string;
  routingMode: string;
  category: string;
  buckets: BranchBucket[];
};

function matchBucket(
  buckets: BranchBucket[],
  paxCount: number,
): BranchBucket | undefined {
  return buckets.find((b) => paxCount >= b.minPax && paxCount <= b.maxPax);
}

export function BranchCheckInPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();
  const { zaloUserId, customerName, ready } = useZaloIdentity();

  const [branch, setBranch] = useState<BranchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paxCount, setPaxCount] = useState<SegmentedMatrixValue>(2);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/branches/by-qr/${qrToken}`);
        if (!res.ok) {
          if (!cancelled) setError('Branch not found');
          return;
        }
        const data = (await res.json()) as BranchPayload;
        if (!cancelled) setBranch(data);
      } catch {
        if (!cancelled) setError('Failed to load branch');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  const matched = useMemo(
    () => (branch ? matchBucket(branch.buckets, paxCount) : undefined),
    [branch, paxCount],
  );

  const issuePass = useCallback(async () => {
    if (!branch || !ready || issuing) return;
    setIssuing(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branch.id,
          paxCount,
          zaloUserId,
          customerName,
        }),
      });
      if (!res.ok) {
        setError('Could not issue pass');
        return;
      }
      const ticket = (await res.json()) as { id: string };
      navigate(`/ticket/${ticket.id}`);
    } catch {
      setError('Could not issue pass');
    } finally {
      setIssuing(false);
    }
  }, [
    branch,
    ready,
    issuing,
    paxCount,
    zaloUserId,
    customerName,
    navigate,
  ]);

  if (error && !branch) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!branch) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-xs text-graphite tabular">LOADING</p>
      </BraunChassis>
    );
  }

  return (
    <BraunChassis className="m-4 flex flex-col gap-3 p-4">
      <header>
        <h1 className="font-sans text-xl font-semibold text-carbon">
          {branch.name}
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          {branch.district} / {branch.city}
        </p>
      </header>

      <GridCell label="01 / SELECT PARTY SIZE">
        <SegmentedMatrix value={paxCount} onChange={setPaxCount} />
      </GridCell>

      <GridCell label="02 / MATCHED BUCKET">
        <div className="flex items-end gap-4">
          {matched ? (
            <span
              data-testid="matched-bucket"
              data-active="true"
              className="font-mono text-4xl font-semibold tabular text-carbon"
            >
              {matched.prefix}
            </span>
          ) : (
            <span className="font-mono text-sm text-graphite">—</span>
          )}
          {matched ? (
            <TabularMetric
              size="lg"
              value={`${matched.estimatedWaitMins} min`}
            />
          ) : null}
        </div>
      </GridCell>

      {error ? (
        <p className="font-mono text-xs text-signal-orange">{error}</p>
      ) : null}

      <KeycapButton
        variant="primary"
        disabled={!ready || issuing || !matched}
        onClick={() => {
          void issuePass();
        }}
      >
        ISSUE QUEUE PASS
      </KeycapButton>
    </BraunChassis>
  );
}
