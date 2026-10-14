import { useApp } from '../store';
import { Section, TeamLogo, TopBar } from '../components/common';
import { userPlayer } from '../../career/career';
import { marketValue } from '../../league/players';
import { TEAMS } from '../../data/teams';
import { fmtMoney } from '../../core/util';
import { RECORD_LABEL } from '../../league/season';

export function Contracts() {
  const { league, career } = useApp();
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const c = p.contract;
  const mv = marketValue(p.pos, p.ovr, p.age, career.reputation / 400);
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Contract & Earnings" />
      <div className="hero">
        <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
          {p.teamId >= 0 && <TeamLogo id={p.teamId} size={64} />}
          <div className="grow">
            <h2>{p.teamId >= 0 ? `${TEAMS[p.teamId].city} ${TEAMS[p.teamId].name}` : 'Free Agent'}</h2>
            <div className="row wrap" style={{ marginTop: 8, gap: 18 }}>
              <div className="stat"><span className="v">{fmtMoney(c.salary)}</span><span className="l">per season</span></div>
              <div className="stat"><span className="v">{c.years}</span><span className="l">years remaining</span></div>
              <div className="stat"><span className="v">{fmtMoney(c.bonus)}</span><span className="l">signing bonus</span></div>
              <div className="stat"><span className="v">{fmtMoney(career.earnings)}</span><span className="l">career earnings</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid g2 stack">
        <Section title="Market Outlook">
          <div>Estimated market value: <b>{fmtMoney(mv)}</b> / season</div>
          <div className="small muted" style={{ marginTop: 6 }}>Value is driven by position, overall rating, age and league reputation ({Math.round(career.reputation)}). Strong seasons and awards raise it.</div>
          {c.incentive && <div style={{ marginTop: 8 }} className="chip gold">Incentive: {fmtMoney(c.incentive.bonus)} for {c.incentive.target} {RECORD_LABEL[c.incentive.stat] ?? c.incentive.stat}</div>}
          <div className="small muted" style={{ marginTop: 8 }}>Contract decisions happen in the offseason: extensions for strong performers with two or fewer years left, and free agency when your deal expires.</div>
        </Section>
        <Section title="Contract History">
          {career.decisions.filter((d) => d.title === 'Contract').length === 0 && <div className="muted small">Original contract{p.draft ? ` (drafted ${p.draft.season}, round ${p.draft.round})` : ''}.</div>}
          {career.decisions.filter((d) => d.title === 'Contract').map((d, i) => <div key={i} className="news small">{d.season}: {d.choice}</div>)}
          <div className="divider" />
          <h4>Salary by season</h4>
          {career.seasonLog.map((s) => <div key={s.season} className="small">{s.season} • {TEAMS[s.teamId]?.abbr} • {fmtMoney(s.salary)}</div>)}
        </Section>
      </div>
    </div>
  );
}
