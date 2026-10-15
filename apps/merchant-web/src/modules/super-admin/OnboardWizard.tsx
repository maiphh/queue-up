import type { InputHTMLAttributes } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import { adminCopy as a } from '@luotdi/shared';

type Form = {
  clientName: string; brandName: string; industryType: string; branchName: string; district: string; address: string;
  tvSlug: string; graceMins: number; routingMode: 'PARTY_SIZE' | 'SERVICE_TYPE'; planTier: 'FREE' | 'PRO';
};
type Created = { branchId: string; tvSlug: string; walkInQrUrl: string };

const INDUSTRIES = ['RESTAURANT', 'CAFE', 'CLINIC', 'SALON', 'BANK', 'HOSPITAL'] as const;
const SERVICE_INDUSTRIES = new Set(['CLINIC', 'HOSPITAL', 'BANK', 'SALON']);
export const TV_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/** "Bún Chả Hương Liên" + "Lê Văn Hưu" → "huong-lien-lvh" (last two brand words + branch initials). */
export function suggestTvSlug(brand: string, branch: string): string {
  const b = slugify(brand).split('-').filter(Boolean).slice(-2).join('-');
  const br = slugify(branch).split('-').filter(Boolean).map((w) => (/^\d+$/.test(w) ? w : w[0])).join('');
  return [b, br].filter(Boolean).join('-').slice(0, 40);
}
const initials = (s: string) => s.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'L';

export function OnboardWizard({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({
    clientName: '', brandName: '', industryType: 'RESTAURANT', branchName: '', district: '', address: '',
    tvSlug: '', graceMins: 10, routingMode: 'PARTY_SIZE', planTier: 'FREE',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const tvSlug = slugTouched ? f.tvSlug : suggestTvSlug(f.brandName, f.branchName);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  const stepFields: (keyof Form)[][] = [['clientName'], ['brandName'], ['branchName', 'district', 'address', 'tvSlug'], []];
  function validate(i: number): boolean {
    const e: Record<string, string> = {};
    for (const k of stepFields[i]!) {
      if (k === 'tvSlug') { if (!TV_SLUG_RE.test(tvSlug)) e.tvSlug = a.slugInvalid; }
      else if (!String(f[k]).trim()) e[k] = a.required;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    setSaving(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, tvSlug, clientName: f.clientName.trim(), brandName: f.brandName.trim(), branchName: f.branchName.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as Created & { fields?: Record<string, string>; code?: string };
      if (!res.ok) {
        if (j.fields) {
          setErrors(j.fields);
          if (j.fields.tvSlug || j.fields.graceMins) setStep(2);
        }
        setSubmitError(a.createError);
        return;
      }
      setCreated(j);
    } catch {
      setSubmitError(a.createError);
    } finally {
      setSaving(false);
    }
  }

  const industryLabel = a.industry[f.industryType as keyof typeof a.industry];
  const chips = useMemo(() => [
    step > 0 && f.clientName ? a.chipClient(f.clientName) : null,
    step > 1 && f.brandName ? a.chipBrand(f.brandName, industryLabel) : null,
    step > 2 && f.branchName ? a.chipBranch(f.branchName) : null,
  ].filter(Boolean) as string[], [step, f.clientName, f.brandName, f.branchName, industryLabel]);

  const field = (k: keyof Form, label: string, hint?: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="r4-fl">
      {label}
      <input className="r4-inp" aria-label={label} aria-invalid={!!errors[k]} value={String(k === 'tvSlug' ? tvSlug : f[k])}
        onChange={(e) => { if (k === 'tvSlug') { setSlugTouched(true); set('tvSlug', e.target.value); } else set(k, e.target.value as never); }} {...extra} />
      {errors[k] ? <span className="r4-em">{errors[k]}</span> : hint ? <small>{hint}</small> : null}
    </label>
  );

  if (created) {
    const tvUrl = `${window.location.origin}/tv/${created.tvSlug}`;
    return (
      <div className="cc-main r4-main" data-testid="onboard-success">
        <div className="r4-card r4-center" style={{ minHeight: 480 }}>
          <BeVe pose="thanks" size={170} />
          <b style={{ fontSize: 26 }}>{a.successTitle(f.brandName)}</b>
          <p>{a.successBody}</p>
          <div className="r4-row r4-wrap" style={{ justifyContent: 'center' }}>
            <Link className="d-pill d-pill-go" to={`/manage/${created.branchId}`}>{a.openFloor}</Link>
            <Link className="d-pill" to={`/manage/${created.branchId}/qr`}>{a.printQr}</Link>
            <button type="button" className="d-pill" onClick={() => { void navigator.clipboard?.writeText(tvUrl).then(() => setCopied(true), () => undefined); }}>{copied ? a.copied : a.copyTv}</button>
            <span className="d-pill" aria-disabled="true" title={a.addBranchHint} style={{ opacity: 0.5 }}>{a.addBranch}</span>
          </div>
          <span className="r4-mono">{tvUrl}</span>
          <button type="button" className="d-btn-text" style={{ width: 'auto' }} onClick={onCancel}>{a.backToList}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cc-main r4-main">
      <header className="cc-top">
        <div>
          <h1 className="r4-title" style={{ fontSize: 26 }}>{a.wizardTitle}</h1>
          <span className="d-muted" style={{ fontSize: 13 }}>{a.wizardSub}</span>
        </div>
        <span className="cc-sp" />
        <button type="button" className="d-pill" onClick={onCancel}>{a.cancel}</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(280px, 1fr)', gap: 18, alignItems: 'start' }}>
        <form
          className="r4-card"
          data-testid="onboard-form"
          style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 500 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate(step)) return;
            if (step < 3) setStep(step + 1);
            else void submit();
          }}
        >
          <div className="d-steps" aria-label={a.wizardSub}>
            {a.steps.map((s, i) => (
              <div key={s} className="d-step" data-state={i < step ? 'done' : i === step ? 'now' : 'todo'} aria-current={i === step ? 'step' : undefined}>
                <i>{i < step ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : i === step ? i + 1 : ''}</i>{s}
              </div>
            ))}
          </div>
          {chips.length ? <div className="r4-row r4-wrap">{chips.map((c) => <span key={c} className="r4-sc r4-sc-n">{c}</span>)}</div> : null}
          <h2 className="r4-title">{a.stepTitles[step]}</h2>

          {step === 0 ? field('clientName', a.clientName, a.clientNameHint, { autoFocus: true }) : null}
          {step === 1 ? (
            <>
              {field('brandName', a.brandName, a.brandNameHint, { autoFocus: true })}
              <div className="r4-fl">
                {a.industryLabel}
                <div className="r4-seg" role="group" aria-label={a.industryLabel}>
                  {INDUSTRIES.map((i) => (
                    <button key={i} type="button" aria-pressed={f.industryType === i} onClick={() => { set('industryType', i); set('routingMode', SERVICE_INDUSTRIES.has(i) ? 'SERVICE_TYPE' : 'PARTY_SIZE'); }}>{a.industry[i]}</button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
                {field('branchName', a.branchName, a.branchNameHint, { autoFocus: true })}
                {field('district', a.district)}
              </div>
              {field('address', a.address)}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
                {field('tvSlug', a.tvSlug, a.tvSlugHint, { className: 'r4-inp r4-mono' })}
                <div className="r4-fl">
                  {a.graceMins}
                  <span className="r4-step" style={{ alignSelf: 'flex-start' }}>
                    <button type="button" aria-label={`${a.graceMins} −`} disabled={f.graceMins <= 3} onClick={() => set('graceMins', f.graceMins - 1)}>−</button>
                    <output aria-label={a.graceMins}>{f.graceMins}</output>
                    <button type="button" aria-label={`${a.graceMins} +`} disabled={f.graceMins >= 30} onClick={() => set('graceMins', f.graceMins + 1)}>+</button>
                  </span>
                  {errors.graceMins ? <span className="r4-em">{errors.graceMins}</span> : <small>{a.minutes}</small>}
                </div>
              </div>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <span className="d-label">{a.routing}</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['PARTY_SIZE', 'SERVICE_TYPE'] as const).map((m) => (
                  <button key={m} type="button" className="r4-card r4-choice" aria-pressed={f.routingMode === m} onClick={() => set('routingMode', m)}>
                    <b style={{ font: '700 17px var(--d-font-display)' }}>{m === 'PARTY_SIZE' ? a.routePax : a.routeService}</b>
                    <p>{m === 'PARTY_SIZE' ? a.routePaxBody : a.routeServiceBody}</p>
                  </button>
                ))}
              </div>
              <span className="d-label">{a.plan}</span>
              <div className="r4-seg" role="group" aria-label={a.plan}>
                <button type="button" aria-pressed={f.planTier === 'FREE'} onClick={() => set('planTier', 'FREE')}>{a.planFree}</button>
                <button type="button" aria-pressed={f.planTier === 'PRO'} onClick={() => set('planTier', 'PRO')}>{a.planPro}</button>
              </div>
            </>
          ) : null}

          {submitError ? <p className="cc-error" role="alert">{submitError}</p> : null}
          <span className="r4-sp" />
          <div className="r4-row">
            {step > 0 ? <button type="button" className="d-pill" onClick={() => setStep(step - 1)}>‹ {a.back}</button> : null}
            <span className="r4-sp" />
            <button type="submit" className="d-btn d-btn-yellow" style={{ width: 'auto', padding: '0 24px' }} disabled={saving}>
              {saving ? a.saving : step < 3 ? `${a.next(a.steps[step + 1]!)} ›` : a.submit}
            </button>
          </div>
        </form>

        <aside style={{ display: 'grid', gap: 14 }} data-testid="onboard-preview">
          <span className="d-label">{a.previewTitle}</span>
          <div className="r4-card" style={{ display: 'grid', gap: 10 }}>
            <div className="r4-row">
              <span className="r4-logo" style={{ background: 'var(--d-navy)', color: 'var(--d-yellow)', width: 40, height: 40, fontSize: 13 }} aria-hidden="true">{initials(f.brandName)}</span>
              <div>
                <b style={{ font: '700 15px var(--d-font-display)' }}>{[f.brandName || a.brandName, f.branchName].filter(Boolean).join(' · ')}</b>
                <div className="d-muted" style={{ fontSize: 12 }}>{[f.district, f.routingMode === 'PARTY_SIZE' ? 'Bàn A · 1–2 khách' : (f.branchName || a.routeService)].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="r4-row"><span className="r4-sc r4-sc-g"><i />{a.previewOpen}</span><span className="r4-sc r4-sc-y">{a.previewWaiting}</span></div>
            <div className="r4-row" style={{ alignItems: 'center' }}>
              <BeVe pose="idle" size={46} />
              <span className="d-bubble" style={{ font: '500 13px/1.4 var(--d-font-body)' }}>{a.previewBubble}</span>
            </div>
            <span className="d-btn d-btn-green" aria-hidden="true" style={{ textAlign: 'center' }}>{a.previewCta}</span>
          </div>
          <div style={{ padding: '0 6px' }}>
            <b style={{ font: '700 14px var(--d-font-display)' }}>{a.afterTitle}</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '500 13px/1.6 var(--d-font-body)' }}>{a.after.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
