import type { GameRecap } from '../../core/types';
import { store, useApp } from '../store';
import { TeamLogo, statSummary, statColumns, statVal, Section } from '../components/common';
import { TEAMS } from '../../data/teams';
import { userPlayer } from '../../career/career';
import { weekLabel } from '../../league/schedule';

export function Postgame() {
  const { league, career, params } = useApp();
  if (!league || !career) return null;
  const recap = (params.recap as GameRecap | undefined) ?? career.recaps[career.recaps.length - 1];
  if (!recap) return <div className="empty">No recent game.</div>;
  const p = userPlayer(league, career);
  const game = league.schedule.find((g) => g.id === recap.gameId);
  const won = recap.us > recap.them;
  const cols = statColumns(p.pos).filter((c) => c.key !== 'gp');
  const next = () => {
    if (career.phase === 'awards') store.go('awards');
    else store.go('hub');
  };
  // box score: top performers of both teams from season stats are not stored per game; show the user's line + team result
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="hero">
        <div className="row between wrap" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <span className={`chip ${won ? 'good' : 'bad'}`}>{won ? 'VICTORY' : recap.us === recap.them ? 'TIE' : 'DEFEAT'}</span>
            <h1 style={{ marginTop: 6 }}>{recap.us} – {recap.them}</h1>
            <div className="muted">{weekLabel(recap.week)} {recap.home ? 'vs' : '@'} {TEAMS[recap.opp].city} {TEAMS[recap.opp].name}{game?.ot ? ' (OT)' : ''}</div>
          </div>
          <div className="row">
            <TeamLogo id={p.teamId} size={60} />
            <span className="muted">vs</span>
            <TeamLogo id={recap.opp} size={60} />
          </div>
        </div>
      </div>
      <div className="grid g3">
        <div className="card center"><div className="stat"><span className="v" style={{ fontSize: '2.6rem' }}>{recap.grade || '—'}</span><span className="l">Game grade</span></div></div>
        <div className="card center"><div className="stat"><span className="v" style={{ fontSize: '2.6rem' }}>+{recap.xp}</span><span className="l">XP earned</span></div></div>
        <div className="card center"><div className="stat"><span className={`v ${recap.trustDelta >= 0 ? 'good' : 'bad'}`} style={{ fontSize: '2.6rem' }}>{recap.trustDelta >= 0 ? '+' : ''}{recap.trustDelta}</span><span className="l">Coach trust</span></div></div>
      </div>
      <Section title="Your Stat Line">
        <div className="muted" style={{ marginBottom: 8 }}>{statSummary(p.pos, recap.line)}</div>
        <div className="tablewrap"><table className="t"><thead><tr>{cols.map((c) => <th key={c.key} className="n">{c.label}</th>)}</tr></thead><tbody><tr className="me">{cols.map((c) => <td key={c.key} className="n">{statVal(recap.line, c.key)}</td>)}</tr></tbody></table></div>
      </Section>
      <div className="grid g2 stack">
        <Section title="Objectives">
          {recap.objectives.map((o) => (
            <div className="obj" key={o.text}><div className={`ck ${o.done ? 'done' : 'fail'}`}>{o.done ? '✓' : '✕'}</div><div className="grow">{o.text}<div className="tiny muted">{o.done ? `+${o.xp} XP` : 'Missed'}</div></div></div>
          ))}
        </Section>
        <Section title="Notes">
          {recap.notes.length === 0 && <div className="muted small">Solid, steady work.</div>}
          {recap.notes.map((n, i) => <div key={i} className="news small">{n}</div>)}
          <div className="divider" />
          <div className="small muted">Role: <b>{career.role}</b> • Trust now {Math.round(career.trust)} • Level {career.level} ({career.sp} skill points to spend)</div>
          {career.sp > 0 && <button className="btn sm gold" style={{ marginTop: 8 }} onClick={() => store.go('progression')}>Spend skill points</button>}
        </Section>
      </div>
      <button className="btn primary big block" onClick={next}>Continue</button>
    </div>
  );
}
