import { useMemo, useState } from 'react';
import type { Appearance, Difficulty, Pos } from '../../core/types';
import { ARCHETYPES, CREATE_LABEL, CREATE_POS, POS_BODY, POS_LABEL, PLAYABLE, archetypesFor } from '../../data/positions';
import { CONFERENCES, DIVISIONS, TEAMS } from '../../data/teams';
import { createCareer, defaultAppearance } from '../../career/career';
import { saveCareer } from '../../core/save';
import { heightStr } from '../../core/util';
import { DIFF_LABEL } from '../../game/engine/mods';
import { store, useApp } from '../store';
import { TeamLogo } from '../components/common';
import { PlayerPreview } from '../components/PlayerPreview';
import { AppearanceEditor } from '../components/AppearanceEditor';
import { FIRST_NAMES, LAST_NAMES } from '../../data/names';

const STEPS = ['Position', 'Appearance', 'Bio', 'Career', 'Confirm'];
const DEFAULT_NUM: Record<Pos, number> = { QB: 7, RB: 28, WR: 11, TE: 85, OL: 72, DE: 94, DT: 99, LB: 54, CB: 24, S: 32, K: 3, P: 9 };

export function CreateCareer() {
  const app = useApp();
  const slot = (app.params.slot as number | undefined) ?? 0;
  const [quick, setQuick] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState<Pos>('QB');
  const [arch, setArch] = useState(archetypesFor('QB')[0].id);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [num, setNum] = useState(7);
  const [ht, setHt] = useState(75);
  const [wt, setWt] = useState(222);
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance());
  const [helmet, setHelmet] = useState(true);
  const [mode, setMode] = useState<'rookie' | 'established' | 'undrafted'>('rookie');
  const [team, setTeam] = useState<number | 'draft'>('draft');
  const [diff, setDiff] = useState<Difficulty>(app.settings.difficulty);
  const [qmin, setQmin] = useState(app.settings.quarterMinutes);
  const [olSlot, setOlSlot] = useState<'OT' | 'OG'>('OG');
  const [busy, setBusy] = useState(false);

  const pickPos = (p: Pos) => {
    setPos(p);
    setArch(archetypesFor(p)[0].id);
    setNum(DEFAULT_NUM[p]);
    const b = POS_BODY[p];
    setHt(Math.round((b.ht[0] + b.ht[1]) / 2));
    setWt(Math.round((b.wt[0] + b.wt[1]) / 2 / 5) * 5);
  };

  const randomName = () => {
    setFirst(FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]);
    setLast(LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]);
  };

  const start = async (useQuick: boolean) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const { league, career } = createCareer({
      first: first || 'Rookie', last: last || 'Player', pos, archetype: arch, num, ht, wt, appearance,
      startMode: useQuick ? 'established' : mode, teamChoice: team, difficulty: diff, quarterMinutes: qmin, slot, olSlot,
    });
    store.setSettings({ difficulty: diff, quarterMinutes: qmin });
    store.loadCareer(career, league);
    try { await saveCareer(career, league); } catch (e) { store.toast(`Save failed: ${(e as Error).message}`); }
    setBusy(false);
    store.go(career.phase === 'combine' ? 'combine' : 'hub');
  };

  const previewTeam = typeof team === 'number' ? team : -1;
  const body = POS_BODY[pos];
  const archetype = useMemo(() => ARCHETYPES.find((a) => a.id === arch)!, [arch]);

  const posGrid = (
    <div className="grid g4 stack" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {CREATE_POS.map((p) => (
        <button key={p} className={`option ${pos === p ? 'on' : ''}`} onClick={() => pickPos(p)}>
          <div className="row between"><b style={{ fontFamily: 'var(--display)', fontSize: '0.9rem' }}>{p === 'CB' ? 'DB' : p === 'DE' ? 'DL' : p}</b>{['QB', 'RB', 'WR'].includes(p) && <span className="chip gold">Featured</span>}</div>
          <div className="small muted">{CREATE_LABEL[p] ?? POS_LABEL[p]}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>{PLAYABLE[p].note}</div>
        </button>
      ))}
    </div>
  );

  if (quick === null) {
    return (
      <div className="menu">
        <div className="col fadein" style={{ width: 'min(560px, 100%)' }}>
          <h1>New Career</h1>
          <div className="muted">Slot {slot + 1}</div>
          <button className="option" onClick={() => setQuick(true)}>
            <h3>{'⚡'} Quick Start</h3>
            <div className="muted small">Pick a position and name, get drafted as an established prospect, and play your first game in under a minute.</div>
          </button>
          <button className="option" onClick={() => setQuick(false)}>
            <h3>{'★'} Full Creation</h3>
            <div className="muted small">Choose archetype, customize your look and gear, pick a rookie or established start, select your team or enter the draft.</div>
          </button>
          <button className="btn ghost" onClick={() => store.go('menu')}>Back</button>
        </div>
      </div>
    );
  }

  if (quick) {
    return (
      <div className="menu" style={{ alignItems: 'flex-start' }}>
        <div className="col fadein" style={{ width: 'min(860px, 100%)' }}>
          <div className="row between"><h1>Quick Start</h1><button className="btn sm" onClick={() => setQuick(null)}>Back</button></div>
          <div className="grid g2 stack">
            <label className="field">First name<input type="text" value={first} maxLength={16} onChange={(e) => setFirst(e.target.value)} placeholder="First" /></label>
            <label className="field">Last name<input type="text" value={last} maxLength={18} onChange={(e) => setLast(e.target.value)} placeholder="Last" /></label>
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={randomName}>Random name</button>
          <h3>Position</h3>
          {posGrid}
          <button className="btn primary big block" disabled={busy} onClick={() => start(true)}>{busy ? 'Building league…' : 'Start Career'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="menu" style={{ alignItems: 'flex-start' }}>
      <div className="col fadein" style={{ width: 'min(1000px, 100%)' }}>
        <div className="row between wrap">
          <h1>Create Player</h1>
          <div className="seg">{STEPS.map((s, i) => <button key={s} className={step === i ? 'on' : ''} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}</div>
        </div>

        {step === 0 && (
          <div className="col">
            {posGrid}
            <h3>Archetype</h3>
            <div className="grid g3">
              {archetypesFor(pos).map((a) => (
                <button key={a.id} className={`option ${arch === a.id ? 'on' : ''}`} onClick={() => setArch(a.id)}>
                  <b>{a.name}</b>
                  <div className="small muted">{a.desc}</div>
                  <div className="tiny dim" style={{ marginTop: 6 }}>Cheaper upgrades: {a.focus.join(', ').toUpperCase()}</div>
                </button>
              ))}
            </div>
            <div className="tiny dim">Archetypes shape starting ratings and make some upgrades cheaper. You can still develop any attribute.</div>
          </div>
        )}

        {step === 1 && (
          <div className="grid g2 stack" style={{ alignItems: 'start' }}>
            <div className="col">
              <PlayerPreview app={appearance} teamId={previewTeam} num={num} helmet={helmet} ht={ht} wt={wt} />
              <div className="row"><button className="btn sm" onClick={() => setHelmet(!helmet)}>{helmet ? 'Remove helmet' : 'Put on helmet'}</button><span className="tiny dim">Tap the preview to turn around</span></div>
            </div>
            <div className="card"><AppearanceEditor app={appearance} onChange={setAppearance} /></div>
          </div>
        )}

        {step === 2 && (
          <div className="card col">
            <div className="grid g2 stack">
              <label className="field">First name<input type="text" value={first} maxLength={16} onChange={(e) => setFirst(e.target.value)} placeholder="First" /></label>
              <label className="field">Last name<input type="text" value={last} maxLength={18} onChange={(e) => setLast(e.target.value)} placeholder="Last" /></label>
            </div>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={randomName}>Random name</button>
            <label className="field">Jersey number: {num}<input type="range" min={0} max={99} value={num} onChange={(e) => setNum(Number(e.target.value))} /></label>
            <label className="field">Height: {heightStr(ht)}<input type="range" min={body.ht[0] - 2} max={body.ht[1] + 2} value={ht} onChange={(e) => setHt(Number(e.target.value))} /></label>
            <label className="field">Weight: {wt} lbs<input type="range" min={body.wt[0] - 15} max={body.wt[1] + 15} step={5} value={wt} onChange={(e) => setWt(Number(e.target.value))} /></label>
            <div className="tiny dim">Heavier players gain strength but lose a little speed. Taller receivers jump higher.</div>
            {pos === 'OL' && (
              <div className="col"><span className="small muted">Line spot</span><div className="seg"><button className={olSlot === 'OG' ? 'on' : ''} onClick={() => setOlSlot('OG')}>Guard</button><button className={olSlot === 'OT' ? 'on' : ''} onClick={() => setOlSlot('OT')}>Tackle</button></div></div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="col">
            <div className="grid g3">
              <button className={`option ${mode === 'rookie' ? 'on' : ''}`} onClick={() => setMode('rookie')}>
                <h3>Rookie Prospect</h3>
                <div className="small muted">Start around 60 OVR. Perform at the combine, get drafted, fight for a roster spot from the bottom of the depth chart.</div>
              </button>
              <button className={`option ${mode === 'established' ? 'on' : ''}`} onClick={() => setMode('established')}>
                <h3>Established Prospect</h3>
                <div className="small muted">Start around 72 OVR as a high pick on a bigger contract, close to a starting role.</div>
              </button>
              <button className={`option ${mode === 'undrafted' ? 'on' : ''}`} onClick={() => setMode('undrafted')}>
                <h3>Undrafted Free Agent</h3>
                <div className="small muted">Start around 57 OVR on a one-year minimum deal. Begin on the practice squad and earn every snap.</div>
              </button>
            </div>
            <div className="card">
              <div className="row between wrap"><h3>Team</h3>
                <button className={`btn sm ${team === 'draft' ? 'primary' : ''}`} onClick={() => setTeam('draft')}>{'🎲'} {mode === 'undrafted' ? 'Best camp invite (random team)' : 'Enter the draft (random team)'}</button>
              </div>
              {[0, 1].map((c) => (
                <div key={c} style={{ marginTop: 8 }}>
                  <h4>{CONFERENCES[c]}</h4>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginTop: 6 }}>
                    {TEAMS.filter((t) => t.conf === c).sort((a, b) => a.div - b.div).map((t) => (
                      <button key={t.id} className={`option ${team === t.id ? 'on' : ''}`} onClick={() => setTeam(t.id)} style={{ padding: 8 }}>
                        <div className="row"><TeamLogo id={t.id} size={34} /><div className="grow"><div className="small" style={{ fontWeight: 700 }}>{t.city}</div><div className="tiny muted">{t.name} • {DIVISIONS[t.div]}</div></div></div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid g2 stack">
              <div className="card col">
                <h3>Difficulty</h3>
                <div className="seg">{(['rookie', 'pro', 'allpro', 'elite'] as Difficulty[]).map((d) => <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>{DIFF_LABEL[d]}</button>)}</div>
                <div className="tiny dim">Higher levels sharpen AI reactions, pursuit angles, coverage and tackling technique.</div>
              </div>
              <div className="card col">
                <h3>Quarter length: {qmin} min</h3>
                <input type="range" min={2} max={15} value={qmin} onChange={(e) => setQmin(Number(e.target.value))} />
                <div className="tiny dim">Accelerated clock. 5 minutes is about 15–25 snaps for your unit.</div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid g2 stack" style={{ alignItems: 'start' }}>
            <PlayerPreview app={appearance} teamId={previewTeam} num={num} helmet ht={ht} wt={wt} />
            <div className="card col">
              <h2>{first || 'Rookie'} {last || 'Player'}</h2>
              <div className="row wrap"><span className="chip team">#{num}</span><span className="chip">{CREATE_LABEL[pos] ?? POS_LABEL[pos]}</span><span className="chip">{archetype.name}</span><span className="chip">{heightStr(ht)}, {wt} lbs</span></div>
              <div className="divider" />
              <div>Start: <b>{mode === 'rookie' ? 'Rookie Prospect (combine + draft)' : mode === 'undrafted' ? 'Undrafted Free Agent' : 'Established Prospect'}</b></div>
              <div>Team: <b>{team === 'draft' ? (mode === 'undrafted' ? 'Best camp invite' : 'Decided by the draft') : `${TEAMS[team].city} ${TEAMS[team].name}`}</b></div>
              <div>Difficulty: <b>{DIFF_LABEL[diff]}</b> • Quarters: <b>{qmin} min</b></div>
              <button className="btn primary big block" disabled={busy} onClick={() => start(false)}>{busy ? 'Building league…' : 'Begin Career'}</button>
            </div>
          </div>
        )}

        <div className="row between">
          <button className="btn" onClick={() => (step === 0 ? setQuick(null) : setStep(step - 1))}>Back</button>
          {step < STEPS.length - 1 && <button className="btn primary" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</button>}
        </div>
      </div>
    </div>
  );
}
