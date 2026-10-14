import { store, useApp } from '../store';
import { TeamLogo } from '../components/common';
import { TEAMS } from '../../data/teams';
import { beginSeason, userPlayer, ROLE_LABEL } from '../../career/career';
import { fmtMoney, ordinal } from '../../core/util';

export function DraftReveal() {
  const { league, career } = useApp();
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const d = p.draft;
  const t = TEAMS[p.teamId];
  const go = async () => {
    beginSeason(league, career);
    await store.commit();
    store.go('hub');
  };
  return (
    <div className="col center fadein" style={{ gap: 14, alignItems: 'center', paddingTop: 20 }}>
      <span className="chip gold">The Draft</span>
      <h2 className="muted">With the {d ? ordinal(d.pick) : ''} pick in round {d?.round}, the</h2>
      <TeamLogo id={p.teamId} size={140} />
      <h1>{t.city} {t.name}</h1>
      <h2 className="muted">select {p.first} {p.last}</h2>
      {career.combineScore !== undefined && <div className="chip">Combine score {career.combineScore}/100 • OVR now {p.ovr}</div>}
      <div className="card" style={{ maxWidth: 520, textAlign: 'left' }}>
        <div><b>Rookie contract:</b> {p.contract.years} years, {fmtMoney(p.contract.salary)}/yr{p.contract.bonus ? `, ${fmtMoney(p.contract.bonus)} signing bonus` : ''}</div>
        <div className="muted small" style={{ marginTop: 6 }}>{t.history}</div>
        <div className="muted small" style={{ marginTop: 6 }}>Head coach {league.teams[p.teamId].coach} • {t.offense} offense • {t.defense} defense • {t.stadium}</div>
      </div>
      <button className="btn primary big" onClick={go}>Report to Camp</button>
      <div className="tiny dim">You will start training camp as a {ROLE_LABEL[career.role].toLowerCase()}. Preseason games are your audition.</div>
    </div>
  );
}
