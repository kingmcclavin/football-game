import { useApp, store } from '../store';
import { Section, TeamLogo, TopBar, statSummary, RoleBadge } from '../components/common';
import { userPlayer, canRetire } from '../../career/career';
import { AWARD_LABEL, careerLine, RECORD_LABEL } from '../../league/season';
import { TEAMS } from '../../data/teams';
import { legacyScore } from '../../league/offseason';
import type { StatKey } from '../../core/types';

export function History() {
  const { league, career } = useApp();
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const awards = p.awards.filter((a) => a.key !== 'CONF_CHAMP');
  const records: string[] = [];
  for (const scope of ['game', 'season', 'career', 'playoffGame'] as const) {
    for (const [k, r] of Object.entries(league.records[scope])) if (r?.playerId === p.id) records.push(`${scope === 'playoffGame' ? 'Playoff game' : scope[0].toUpperCase() + scope.slice(1)}: ${RECORD_LABEL[k as StatKey]} (${r.value})`);
  }
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Career History" sub={`${career.seasonLog.length} completed season${career.seasonLog.length === 1 ? '' : 's'} • Legacy score ${legacyScore(p) + records.length * 5}`} right={canRetire(career) ? <button className="btn danger sm" onClick={() => store.go('offseason')}>Retirement options</button> : undefined} />
      <Section title="Season by Season">
        {career.seasonLog.length === 0 && <div className="empty">Your story is just beginning.</div>}
        {career.seasonLog.slice().reverse().map((s) => (
          <div key={s.season} className="news">
            <div className="row between wrap">
              <div className="row" style={{ gap: 8 }}><TeamLogo id={s.teamId} size={28} /><b>{s.season} {TEAMS[s.teamId]?.name}</b><RoleBadge role={s.role} /><span className="chip">OVR {s.ovr}</span><span className="chip">Age {s.age}</span></div>
              <span className="small muted">{s.teamRecord} • {s.result}</span>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>{statSummary(p.pos, s.line)}</div>
            {s.awards.length > 0 && <div className="row wrap" style={{ marginTop: 4, gap: 4 }}>{s.awards.map((a, i) => <span key={i} className="chip gold">{AWARD_LABEL[a]}</span>)}</div>}
          </div>
        ))}
      </Section>
      <div className="grid g2 stack">
        <Section title="Trophy Case">
          {awards.length === 0 && <div className="muted small">No awards yet.</div>}
          <div className="row wrap" style={{ gap: 6 }}>{awards.map((a, i) => <span key={i} className="chip gold">{a.season} {AWARD_LABEL[a.key]}</span>)}</div>
          <div className="divider" />
          <h4>Records Held</h4>
          {records.length === 0 ? <div className="muted small">None yet.</div> : records.map((r) => <div key={r} className="small">{r}</div>)}
        </Section>
        <Section title="Milestones & Decisions">
          {career.milestones.slice(-12).reverse().map((m) => <div key={m} className="small news">{m}</div>)}
          {career.decisions.slice(-8).reverse().map((d, i) => <div key={i} className="small news">{d.season}: {d.title} — {d.choice}</div>)}
          {career.milestones.length + career.decisions.length === 0 && <div className="muted small">Nothing yet.</div>}
        </Section>
      </div>
      <Section title="Career Totals">
        <div className="muted">{statSummary(p.pos, careerLine(p))}</div>
        <div className="small muted">Playoffs: {statSummary(p.pos, careerLine(p, true))}</div>
      </Section>
    </div>
  );
}
