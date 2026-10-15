import { useEffect, useState } from 'react';
import {
  applyDevActorPreset,
  DEV_ACTOR_CHANGE_EVENT,
  DEV_ACTOR_PRESETS,
  matchDevActorPreset,
  readDevActor,
  type DevActorPreset,
} from './actor';

const FALLBACK_PRESET: DevActorPreset = DEV_ACTOR_PRESETS[0]!;

function currentPreset(): DevActorPreset {
  return matchDevActorPreset(readDevActor()) ?? FALLBACK_PRESET;
}

/** Dev-only persona switcher. Hidden by App chrome on /tv/* paths. */
export function DevActorSwitch() {
  const [presetId, setPresetId] = useState(() => currentPreset().id);

  useEffect(() => {
    const sync = () => setPresetId(currentPreset().id);
    window.addEventListener(DEV_ACTOR_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener(DEV_ACTOR_CHANGE_EVENT, sync);
    };
  }, []);

  const active =
    DEV_ACTOR_PRESETS.find((p) => p.id === presetId) ?? FALLBACK_PRESET;

  return (
    <div
      data-testid="dev-actor-switch"
      className="border-b border-grid bg-panel px-4 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          Dev actor
        </p>
        <select
          aria-label="Chọn actor"
          className="min-h-[48px] border border-grid border-b-carbon bg-panel px-3 font-sans text-sm text-carbon rounded-none"
          value={active.id}
          onChange={(event) => {
            const next = DEV_ACTOR_PRESETS.find(
              (p) => p.id === event.target.value,
            );
            if (!next) return;
            applyDevActorPreset(next);
            setPresetId(next.id);
          }}
        >
          {DEV_ACTOR_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        {active.email ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            {active.email}
          </span>
        ) : null}
      </div>
    </div>
  );
}
