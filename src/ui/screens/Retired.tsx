import { store, useApp } from '../store';
import { Section, TeamLogo, statSummary } from '../components/common';
import { userPlayer } from '../../career/career';
import { AWARD_LABEL } from '../../league/season';
import { TEAMS } from '../../data/teams';
import { fmtMoney } from '../../core/util';
import { POS_LABEL } from '../../data/positions';

export function Retired() {
  const { league, career } = useApp();
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const s = career.retiredSummary;
  if (!s) return <div className="empty">Still active.</div>;
  const counts: Record<string, number> = {};
  for (const a of s.awards) counts[a.key] = (counts[a.key] ?? 0) + 1;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="hero center">
        <span className="chip gold">Career Retrospective</span>
        <h1 style={{ marginTop: 8 }}>{p.first} {p.last}</h1>
        <div className="muted">{POS_LABEL[p.pos]} • {s.seasons} seasons • {s.games} games • Final OVR {s.finalOvr}</div>
        <div className="legacy" style={{ marginTop: 10 }}>{s.tier}</div>
        <div className="muted">Legacy score {s.legacyScore}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>{s.teams.map((t) => <TeamLogo key={t} id={t} size={44} />)}</div>
      </div>
      <div className="grid g3">
        <div className="card center"><div className="stat"><span className="v">{s.championships}</span><span className="l">Championships</span></div></div>
        <div className="card center"><div className="stat"><span className="v">{fmtMoney(s.earnings)}</span><span className="l">Career earnings</span></div></div>
        <div className="card center"><div className="stat"><span className="v">{s.bestSeason}</span><span className="l">Best season</span></div></div>
      </div>
      <Section title="Career Statistics"><div>{statSummary(p.pos, s.career)}</div></Section>
      <div className="grid g2 stack">
        <Section title="Awards">{Object.keys(counts).length === 0 ? <div className="muted">No major awards.</div> : Object.entries(counts).map(([k, n]) => <div key={k} className="small news">{n}x {AWARD_LABEL[k as keyof typeof AWARD_LABEL]}</div>)}</Section>
        <Section title="Records Held">{s.records.length === 0 ? <div className="muted">None.</div> : s.records.map((r) => <div key={r} className="small news">{r}</div>)}</Section>
      </div>
      {career.milestones.length > 0 && <Section title="Memorable Moments">{career.milestones.slice(-15).map((m) => <div key={m} className="small news">{m}</div>)}</Section>}
      <Section title="Season by Season">{career.seasonLog.map((x) => <div key={x.season} className="small news">{x.season} • {TEAMS[x.teamId]?.abbr} • OVR {x.ovr} • {x.teamRecord} • {x.result}{x.awards.length ? ` • ${x.awards.length} award${x.awards.length > 1 ? 's' : ''}` : ''}</div>)}</Section>
      <Section title="Teams Represented">{s.teams.map((t) => <div key={t} className="small">{TEAMS[t].city} {TEAMS[t].name}</div>)}</Section>
      <button className="btn primary big block" onClick={async () => { await store.save(); store.closeCareer(); }}>Return to Main Menu</button>
    </div>
  );
}
