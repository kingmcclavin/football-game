import { useState } from 'react';
import type { Difficulty } from '../../core/types';
import { store, useApp } from '../store';
import { Section, TopBar } from '../components/common';
import { DIFF_LABEL } from '../../game/engine/mods';
import { DEFAULT_KEYS } from '../../core/save';
import { input } from '../../game/input/Input';

const KEY_LABELS: Record<string, string> = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', sprint: 'Sprint', snap: 'Snap / continue', juke: 'Juke', spin: 'Spin', stiff: 'Stiff arm',
  dive: 'Dive', action: 'Context action', swat: 'Swat', protect: 'Protect ball', throwAway: 'Throw away', camera: 'Camera', pause: 'Pause',
};

export function SettingsScreen() {
  const { settings, career } = useApp();
  const [binding, setBinding] = useState<string | null>(null);
  const set = store.setSettings.bind(store);
  const bindKey = (action: string) => {
    setBinding(action);
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      set({ keys: { ...store.get().settings.keys, [action]: e.code } });
      setBinding(null);
      window.removeEventListener('keydown', h, true);
    };
    window.addEventListener('keydown', h, true);
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Settings" back={career ? 'hub' : 'menu'} />
      <div className="grid g2 stack">
        <Section title="Gameplay">
          <div className="col">
            <span className="small muted">Difficulty (applies to this career)</span>
            <div className="seg">{(['rookie', 'pro', 'allpro', 'elite'] as Difficulty[]).map((d) => (
              <button key={d} className={(career?.difficulty ?? settings.difficulty) === d ? 'on' : ''} onClick={() => { set({ difficulty: d }); if (career) { career.difficulty = d; void store.commit(); } }}>{DIFF_LABEL[d]}</button>
            ))}</div>
            <label className="field">Quarter length: {career?.quarterMinutes ?? settings.quarterMinutes} min
              <input type="range" min={2} max={15} value={career?.quarterMinutes ?? settings.quarterMinutes} onChange={(e) => { const v = Number(e.target.value); set({ quarterMinutes: v }); if (career) { career.quarterMinutes = v; void store.commit(); } }} />
            </label>
            <label className="field">Game speed: {settings.playSpeed.toFixed(2)}x
              <input type="range" min={0.6} max={1.5} step={0.05} value={settings.playSpeed} onChange={(e) => set({ playSpeed: Number(e.target.value) })} />
            </label>
            <label className="row small"><input type="checkbox" checked={settings.autoContinue} onChange={(e) => set({ autoContinue: e.target.checked })} /> Auto-continue after plays</label>
            {career && (
              <div className="col"><span className="small muted">Uniform</span><div className="seg">{(['home', 'alt'] as const).map((u) => <button key={u} className={career.uniform === u ? 'on' : ''} onClick={() => { career.uniform = u; void store.commit(); }}>{u === 'home' ? 'Primary' : 'Alternate'}</button>)}</div></div>
            )}
          </div>
        </Section>
        <Section title="Display & Sound">
          <div className="col">
            <span className="small muted">Graphics quality</span>
            <div className="seg">{(['low', 'medium', 'high'] as const).map((q) => <button key={q} className={settings.graphics === q ? 'on' : ''} onClick={() => set({ graphics: q })}>{q}</button>)}</div>
            <span className="small muted">Default camera</span>
            <div className="seg">{(['broadcast', 'chase', 'wide'] as const).map((q) => <button key={q} className={settings.camera === q ? 'on' : ''} onClick={() => set({ camera: q })}>{q}</button>)}</div>
            <label className="row small"><input type="checkbox" checked={settings.sound} onChange={(e) => set({ sound: e.target.checked })} /> Sound effects</label>
            <label className="field">Volume<input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => set({ volume: Number(e.target.value) })} /></label>
          </div>
        </Section>
        <Section title="Touch Controls">
          <div className="col">
            <label className="field">Control size: {Math.round(settings.controlScale * 100)}%<input type="range" min={0.75} max={1.35} step={0.05} value={settings.controlScale} onChange={(e) => set({ controlScale: Number(e.target.value) })} /></label>
            <label className="row small"><input type="checkbox" checked={settings.leftHanded} onChange={(e) => set({ leftHanded: e.target.checked })} /> Left-handed layout (buttons on the left)</label>
            <label className="row small"><input type="checkbox" checked={input.autoSprint} onChange={(e) => { input.autoSprint = e.target.checked; store.touch(); }} /> Auto-sprint at full stick</label>
          </div>
        </Section>
        <Section title="Keyboard" right={<button className="btn sm" onClick={() => set({ keys: { ...DEFAULT_KEYS } })}>Reset</button>}>
          <div className="col" style={{ gap: 4 }}>
            {Object.keys(KEY_LABELS).map((k) => (
              <div key={k} className="row between small">
                <span>{KEY_LABELS[k]}</span>
                <button className="btn sm" onClick={() => bindKey(k)}>{binding === k ? 'Press a key…' : (settings.keys[k] ?? '').replace('Key', '')}</button>
              </div>
            ))}
            <div className="tiny dim">Arrow keys always move. Number keys 1–5 throw to receivers.</div>
          </div>
        </Section>
      </div>
    </div>
  );
}
