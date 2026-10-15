/**
 * QR deep-link check-in — `/b/:qrToken`.
 * Party-size matrix, bucket highlight, wait estimate, issue pass.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { guestCopy } from '@luotdi/shared';
import {
  BraunChassis,
  GridCell,
  KeycapButton,
  SegmentedMatrix,
  type SegmentedMatrixValue,
  TabularMetric,
} from '@luotdi/ui-braun';
import { useZaloIdentity } from '../hooks/useZaloIdentity';
import { apiFetch } from '../lib/api';

type BranchBucket = {
  id: string;
  prefix: string;
  labelVi?: string;
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
  const identity = useZaloIdentity();
  const { customerName, ready } = identity;

  const [branch, setBranch] = useState<BranchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paxCount, setPaxCount] = useState<SegmentedMatrixValue>(2);
  const [issuing, setIssuing] = useState(false);
  const [serviceBucketId, setServiceBucketId] = useState<string | null>(null);

  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(`/api/branches/by-qr/${encodeURIComponent(qrToken)}`);
        if (!res.ok) {
          if (!cancelled) setError('Không tìm thấy chi nhánh.');
          return;
        }
        const data = (await res.json()) as BranchPayload;
        if (!cancelled) setBranch(data);
      } catch {
        if (!cancelled) setError('Không tải được chi nhánh.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  const isServiceType = branch?.routingMode === 'SERVICE_TYPE';

  // PARTY_SIZE: bucket by pax. SERVICE_TYPE: the guest picks a service
  // (default first) — pax ranges are meaningless there (e.g. clinic 1–1).
  const matched = useMemo(() => {
    if (!branch) return undefined;
    if (branch.routingMode === 'SERVICE_TYPE') {
      return (
        branch.buckets.find((b) => b.id === serviceBucketId) ?? branch.buckets[0]
      );
    }
    return matchBucket(branch.buckets, paxCount);
  }, [branch, paxCount, serviceBucketId]);

  const issuePass = useCallback(async () => {
    if (!branch || !ready || issuing) return;
    setIssuing(true);
    try {
      // Identity travels as the Bearer JWT (apiFetch); never in the body.
      const res = await apiFetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branch.id,
          ...(isServiceType && matched
            ? { bucketId: matched.id, paxCount: 1 }
            : { paxCount }),
          customerName,
        }),
      });
      if (!res.ok) {
        setError('Không lấy được số.');
        return;
      }
      const ticket = (await res.json()) as { id: string };
      navigate(`/ticket/${ticket.id}`);
    } catch {
      setError('Không lấy được số.');
    } finally {
      setIssuing(false);
    }
  }, [
    branch,
    ready,
    issuing,
    paxCount,
    isServiceType,
    matched,
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
        <p className="font-mono text-xs text-graphite tabular">Đang tải.</p>
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

      <GridCell label="01">
        {isServiceType ? (
          <>
            <p className="mb-2 font-sans text-sm text-carbon">
              {guestCopy.chooseService}
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {branch.buckets.map((b) => (
                <KeycapButton
                  key={b.id}
                  role="radio"
                  aria-checked={matched?.id === b.id}
                  variant={matched?.id === b.id ? 'danger' : 'secondary'}
                  onClick={() => setServiceBucketId(b.id)}
                >
                  {b.labelVi ?? b.prefix}
                </KeycapButton>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 font-sans text-sm text-carbon">
              {guestCopy.partySize}
            </p>
            <SegmentedMatrix value={paxCount} onChange={setPaxCount} />
          </>
        )}
      </GridCell>

      <GridCell label="02">
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
            <span
              data-testid="no-bucket"
              className="font-sans text-sm text-graphite"
            >
              {guestCopy.noBucketForParty}
            </span>
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

      {identity.status === 'error' ? (
        <div data-testid="identity-error" className="flex items-center gap-3">
          <p className="font-sans text-xs text-signal-orange">
            {guestCopy.authFailed}
          </p>
          <KeycapButton variant="secondary" onClick={identity.retry}>
            {guestCopy.retry}
          </KeycapButton>
        </div>
      ) : null}

      <KeycapButton
        variant="primary"
        disabled={!ready || issuing || !matched}
        aria-busy={identity.status === 'loading' || issuing || undefined}
        onClick={() => {
          void issuePass();
        }}
      >
        {identity.status === 'loading' ? guestCopy.signingIn : guestCopy.issuePass}
      </KeycapButton>
    </BraunChassis>
  );
}
