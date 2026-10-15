import { useState } from 'react';
import type { Difficulty, GameRecap, Pos } from '../../core/types';
import { CREATE_LABEL, CREATE_POS, POS_LABEL, archetypesFor, calcOvr } from '../../data/positions';
import { CONFERENCES, TEAMS } from '../../data/teams';
import { createCareer, defaultAppearance, userPlayer } from '../../career/career';
import { clamp } from '../../core/util';
import { DIFF_LABEL } from '../../game/engine/mods';
import { store, useApp } from '../store';
import { TeamLogo, statSummary } from '../components/common';
import { exhibition } from '../exhibition';

const NUM: Partial<Record<Pos, number>> = { QB: 7, RB: 28, WR: 11, TE: 85, LB: 54, CB: 24, DE: 94, K: 3 };
const LEVELS = [{ id: 'rookie', label: 'Rookie · 62', delta: -11 }, { id: 'pro', label: 'Pro · 73', delta: 0 }, { id: 'star', label: 'Star · 88', delta: 15 }] as const;

/** Quick one-off game for testing: no career, nothing saved. */
export function ExhibitionScreen() {
  const app = useApp();
  const last = app.params.recap as GameRecap | undefined;
  const prev = exhibition.setup;
  const [pos, setPos] = useState<Pos>(prev?.pos ?? 'QB');
  const [team, setTeam] = useState(prev?.team ?? 0);
  const [opp, setOpp] = useState(prev?.opp ?? 1);
  const [home, setHome] = useState(prev?.home ?? true);
  const [level, setLevel] = useState<(typeof LEVELS)[number]['id']>(prev?.level ?? 'pro');
  const [diff, setDiff] = useState<Difficulty>(prev?.difficulty ?? app.settings.difficulty);
  const [qmin, setQmin] = useState(prev?.quarterMinutes ?? app.settings.quarterMinutes);
  const lastPos = prev?.pos ?? pos;
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<'team' | 'opp' | null>(null);

  const play = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const { league, career } = createCareer({
      first: 'Exhibition', last: 'Player', pos, archetype: archetypesFor(pos)[0].id, num: NUM[pos] ?? 10, ht: 74, wt: 215,
      appearance: defaultAppearance(), startMode: 'established', teamChoice: team, difficulty: diff, quarterMinutes: qmin, slot: -1,
    });
    const p = userPlayer(league, career);
    const delta = LEVELS.find((l) => l.id === level)!.delta;
    for (const k of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[k] = clamp((p.attrs[k] ?? 60) + delta, 30, 99);
    p.ovr = calcOvr(p.pos, p.attrs);
    career.role = 'ST';
    career.trust = 80;
    const game = { id: `exh-${Date.now()}`, season: league.season, week: 1, home: home ? team : opp, away: home ? opp : team, hs: 0, as: 0, played: false };
    exhibition.league = league;
    exhibition.career = career;
    exhibition.game = game;
    exhibition.setup = { pos, team, opp, home, level, difficulty: diff, quarterMinutes: qmin };
    setBusy(false);
    store.go('game', { exhibition: true });
  };

  const teamGrid = (cur: number, other: number, set: (id: number) => void) => (
    <div className="col">
      {[0, 1].map((c) => (
        <div key={c}>
          <h4>{CONFERENCES[c]}</h4>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', marginTop: 6 }}>
            {TEAMS.filter((t) => t.conf === c).map((t) => (
              <button key={t.id} disabled={t.id === other} className={`option ${cur === t.id ? 'on' : ''} ${t.id === other ? 'disabled' : ''}`} style={{ padding: 6 }} onClick={() => { set(t.id); setPicking(null); }}>
                <div className="row"><TeamLogo id={t.id} size={28} /><span className="small">{t.city}</span></div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="menu" style={{ alignItems: 'flex-start' }}>
      <div className="col fadein" style={{ width: 'min(860px, 100%)' }}>
        <div className="row between"><h1>Exhibition</h1><button className="btn sm" onClick={() => store.go('menu')}>Back</button></div>
        <div className="muted small">A single game for practice and testing. Nothing is saved and no career is affected. You play every snap.</div>

        {last && (
          <div className="card col">
            <span className={`chip ${last.us > last.them ? 'good' : 'bad'}`} style={{ alignSelf: 'flex-start' }}>{last.us > last.them ? 'VICTORY' : last.us === last.them ? 'TIE' : 'DEFEAT'} {last.us}–{last.them}</span>
            <div className="small">{lastPos}: {statSummary(lastPos, last.line)} • Grade {last.grade || '—'}</div>
          </div>
        )}

        <div className="card col">
          <h3>Position</h3>
          <div className="seg">{CREATE_POS.map((p) => <button key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p === 'CB' ? 'DB' : p === 'DE' ? 'DL' : p}</button>)}</div>
          <div className="tiny dim">{CREATE_LABEL[pos] ?? POS_LABEL[pos]}. QB, RB, WR and TE use the arcade offense (slingshot passing).</div>
          <h3>Your rating</h3>
          <div className="seg">{LEVELS.map((l) => <button key={l.id} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>{l.label}</button>)}</div>
        </div>

        <div className="grid g2 stack">
          <button className="option" onClick={() => setPicking(picking === 'team' ? null : 'team')}>
            <div className="tiny muted">YOUR TEAM</div>
            <div className="row"><TeamLogo id={team} size={40} /><b>{TEAMS[team].city} {TEAMS[team].name}</b></div>
          </button>
          <button className="option" onClick={() => setPicking(picking === 'opp' ? null : 'opp')}>
            <div className="tiny muted">OPPONENT</div>
            <div className="row"><TeamLogo id={opp} size={40} /><b>{TEAMS[opp].city} {TEAMS[opp].name}</b></div>
          </button>
        </div>
        {picking && <div className="card">{picking === 'team' ? teamGrid(team, opp, setTeam) : teamGrid(opp, team, setOpp)}</div>}

        <div className="card col">
          <div className="row wrap">
            <span className="small muted">Venue</span>
            <div className="seg"><button className={home ? 'on' : ''} onClick={() => setHome(true)}>Home</button><button className={!home ? 'on' : ''} onClick={() => setHome(false)}>Away</button></div>
          </div>
          <span className="small muted">Difficulty</span>
          <div className="seg">{(['rookie', 'pro', 'allpro', 'elite'] as Difficulty[]).map((d) => <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>{DIFF_LABEL[d]}</button>)}</div>
          <label className="field">Quarter length: {qmin} min<input type="range" min={1} max={15} value={qmin} onChange={(e) => setQmin(Number(e.target.value))} /></label>
        </div>
        <button className="btn primary big block" disabled={busy} onClick={play}>{busy ? 'Setting up…' : 'Play Exhibition'}</button>
      </div>
    </div>
  );
}
