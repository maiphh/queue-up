import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { managerCopy as m } from '@luotdi/shared';
import { ManagerShell } from './ManagerRail';

const s = m.settings;

export type Settings = {
  allowRemoteQueue: boolean; openTime: string | null; closeTime: string | null; autoPauseWaitMins: number | null;
  graceMins: number; shortcutsEnabled: boolean; znsAlmostThreshold: number; znsCallEnabled: boolean;
  tvTts: boolean; tvVoice: string; tvChime: boolean; tvMascot: boolean; tvStatic: boolean;
  walletBalanceVnd: number; merchantName: string;
};
type Editable = Omit<Settings, 'walletBalanceVnd' | 'merchantName'>;
const KEYS: (keyof Editable)[] = [
  'allowRemoteQueue', 'openTime', 'closeTime', 'autoPauseWaitMins', 'graceMins', 'shortcutsEnabled',
  'znsAlmostThreshold', 'znsCallEnabled', 'tvTts', 'tvVoice', 'tvChime', 'tvMascot', 'tvStatic',
];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZNS_PRICE_VND = 400;

/** Client-side mirror of the API's validateSettingsPatch hints. */
export function validateSettings(v: Editable): Record<string, string> {
  const e: Record<string, string> = {};
  const intIn = (n: number | null, lo: number, hi: number) => n != null && Number.isInteger(n) && n >= lo && n <= hi;
  if (!intIn(v.graceMins, 3, 30)) e.graceMins = s.errGrace;
  if (!intIn(v.znsAlmostThreshold, 1, 5)) e.znsAlmostThreshold = s.errThreshold;
  if (v.autoPauseWaitMins !== null && !intIn(v.autoPauseWaitMins, 15, 180)) e.autoPauseWaitMins = s.errAutoPause;
  if (v.openTime !== null || v.closeTime !== null) {
    if (!HHMM.test(v.openTime ?? '') || !HHMM.test(v.closeTime ?? '')) e.openTime = s.errTime;
    else if (v.openTime === v.closeTime) e.openTime = s.errTimeSame;
  }
  return e;
}

export function diffSettings(a: Editable, b: Editable): Partial<Editable> {
  const out: Record<string, unknown> = {};
  for (const k of KEYS) if (a[k] !== b[k]) out[k] = b[k];
  if ('openTime' in out || 'closeTime' in out) { out.openTime = b.openTime; out.closeTime = b.closeTime; }
  return out as Partial<Editable>;
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button type="button" className="d-toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

function Stepper({ value, min, max, label, error, onChange }: { value: number; min: number; max: number; label: string; error?: string; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div className="r4-step" aria-invalid={!!error}>
        <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <input aria-label={label} inputMode="numeric" value={Number.isNaN(value) ? '' : value} onChange={(e) => onChange(Number.parseInt(e.target.value, 10))} />
        <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
      {error ? <span className="r4-em" role="alert">{error}</span> : null}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="r4-setrow">
      <div className="r4-t"><b>{title}</b>{hint ? <small>{hint}</small> : null}</div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { branchId = '' } = useParams<{ branchId: string }>();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Editable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/manage/${branchId}/settings`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as Settings;
      setSaved(j);
      setDraft(j);
    } catch {
      setLoadError(s.loadError);
    }
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);

  const changes = useMemo(() => (saved && draft ? diffSettings(saved, draft) : {}), [saved, draft]);
  const nChanges = Object.keys(changes).filter((k) => k !== 'closeTime' || !('openTime' in changes)).length;
  const localErrors = useMemo(() => (draft ? validateSettings(draft) : {}), [draft]);
  const errors = { ...(showErrors ? localErrors : {}), ...serverErrors };
  const nErrors = Object.keys(errors).length;

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setServerErrors((e) => {
      const next = { ...e };
      delete next[k];
      if (k === 'closeTime') delete next.openTime;
      return next;
    });
  };

  async function save() {
    if (!draft) return;
    if (Object.keys(localErrors).length) { setShowErrors(true); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/manage/${branchId}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      });
      const j = (await res.json()) as Settings & { fields?: Record<string, string> };
      if (!res.ok) {
        setServerErrors(j.fields ?? { _: s.saveError });
        return;
      }
      setSaved(j); setDraft(j); setShowErrors(false); setServerErrors({});
      setToast(s.saved); setTimeout(() => setToast(null), 2500);
    } catch {
      setServerErrors({ _: s.saveError });
    } finally {
      setSaving(false);
    }
  }

  const firstError = Object.entries(errors)[0];
  return (
    <ManagerShell page="manage-settings" branchId={branchId} active="settings" title={s.title} sub={s.sub}>
      {loadError ? <p className="cc-error" role="alert">{loadError}</p> : null}
      {nErrors ? <p className="cc-error" role="alert" data-testid="settings-error">{s.saveFailed} {firstError?.[0] === '_' ? '' : s.fieldLabel[firstError?.[0] as keyof typeof s.fieldLabel] ?? ''} {firstError?.[1]}</p> : null}
      {draft && saved ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <section className="r4-card">
              <h3>{s.secQueue}</h3>
              <Row title={s.remote} hint={s.remoteHint}><Toggle on={draft.allowRemoteQueue} label={s.remote} onChange={(v) => set('allowRemoteQueue', v)} /></Row>
              <Row title={s.hours} hint={s.hoursHint}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div className="r4-row">
                    <Toggle on={draft.openTime !== null} label={s.hours} onChange={(v) => { set('openTime', v ? '10:00' : null); set('closeTime', v ? '21:30' : null); }} />
                    {draft.openTime !== null ? (
                      <>
                        <input type="time" className="r4-select" aria-label={s.open} aria-invalid={!!errors.openTime} value={draft.openTime ?? ''} onChange={(e) => set('openTime', e.target.value)} />
                        <span>–</span>
                        <input type="time" className="r4-select" aria-label={s.close} aria-invalid={!!errors.openTime} value={draft.closeTime ?? ''} onChange={(e) => set('closeTime', e.target.value)} />
                      </>
                    ) : <span className="d-muted">{s.always}</span>}
                  </div>
                  {errors.openTime ? <span className="r4-em">{errors.openTime}</span> : null}
                </div>
              </Row>
              <Row title={s.autoPause} hint={s.autoPauseHint}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <select className="r4-select" aria-label={s.autoPause} aria-invalid={!!errors.autoPauseWaitMins} value={draft.autoPauseWaitMins ?? ''} onChange={(e) => set('autoPauseWaitMins', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{s.off}</option>
                    {[30, 45, 60, 90, 120].concat(draft.autoPauseWaitMins && ![30, 45, 60, 90, 120].includes(draft.autoPauseWaitMins) ? [draft.autoPauseWaitMins] : []).map((n) => <option key={n} value={n}>{n} phút</option>)}
                  </select>
                  {errors.autoPauseWaitMins ? <span className="r4-em">{errors.autoPauseWaitMins}</span> : null}
                </div>
              </Row>
            </section>
            <section className="r4-card">
              <h3>{s.secCall}</h3>
              <Row title={s.grace} hint={s.graceHint}>
                <Stepper value={draft.graceMins} min={3} max={30} label={s.grace} error={errors.graceMins} onChange={(v) => set('graceMins', v)} />
              </Row>
              <Row title={s.shortcuts} hint={s.shortcutsHint}><Toggle on={draft.shortcutsEnabled} label={s.shortcuts} onChange={(v) => set('shortcutsEnabled', v)} /></Row>
            </section>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <section className="r4-card">
              <h3>{s.secZns}<small>{s.znsPrice}</small></h3>
              <Row title={s.almost} hint={s.almostHint}>
                <Stepper value={draft.znsAlmostThreshold} min={1} max={5} label={s.almost} error={errors.znsAlmostThreshold} onChange={(v) => set('znsAlmostThreshold', v)} />
              </Row>
              <Row title={s.callMsg} hint={s.callMsgHint(saved.merchantName)}><Toggle on={draft.znsCallEnabled} label={s.callMsg} onChange={(v) => set('znsCallEnabled', v)} /></Row>
              <div className="r4-hint" data-testid="settings-wallet">{s.wallet(saved.walletBalanceVnd, Math.floor(saved.walletBalanceVnd / ZNS_PRICE_VND))}</div>
            </section>
            <section className="r4-card">
              <h3>{s.secTv}</h3>
              <Row title={s.tts} hint={s.ttsHint}>
                <div className="r4-row">
                  <Toggle on={draft.tvTts} label={s.tts} onChange={(v) => set('tvTts', v)} />
                  <select className="r4-select" aria-label={s.voice} disabled={!draft.tvTts} value={draft.tvVoice} onChange={(e) => set('tvVoice', e.target.value)}>
                    {Object.entries(s.voices).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
              </Row>
              <Row title={s.chime} hint={s.chimeHint}><Toggle on={draft.tvChime} label={s.chime} onChange={(v) => set('tvChime', v)} /></Row>
              <Row title={s.mascot} hint={s.mascotHint}><Toggle on={draft.tvMascot} label={s.mascot} onChange={(v) => set('tvMascot', v)} /></Row>
              <Row title={s.static} hint={s.staticHint}><Toggle on={draft.tvStatic} label={s.static} onChange={(v) => set('tvStatic', v)} /></Row>
            </section>
          </div>
        </div>
      ) : !loadError ? <div className="r4-skel" style={{ height: 420 }} /> : null}

      {nChanges > 0 || nErrors > 0 ? (
        <div className="r4-savebar" data-testid="settings-savebar">
          <span className="r4-sp">{nErrors ? s.barErrors(nErrors) : s.barChanges(nChanges)}</span>
          <button type="button" className="d-btn-text" onClick={() => { if (saved) setDraft(saved); setServerErrors({}); setShowErrors(false); }}>{s.discard}</button>
          <button type="button" className="d-pill d-pill-go" disabled={saving} onClick={() => void save()}>{s.save}</button>
        </div>
      ) : null}
      {toast ? <div className="cc-toast" role="status">{toast}</div> : null}
    </ManagerShell>
  );
}
