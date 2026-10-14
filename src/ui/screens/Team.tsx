import { useApp } from '../store';
import { Section, TeamLogo, TopBar } from '../components/common';
import { CONFERENCES, DIVISIONS, TEAMS } from '../../data/teams';
import { teamRatings } from '../../league/depth';
import { POS_LIST, STARTERS } from '../../data/positions';
import { computeRecords, recStr } from '../../league/standings';

export function TeamScreen() {
  const { league, params } = useApp();
  if (!league) return null;
  const id = (params.teamId as number) ?? 0;
  const t = TEAMS[id];
  const ts = league.teams[id];
  const r = teamRatings(league, ts);
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title={`${t.city} ${t.name}`} sub={`${CONFERENCES[t.conf]} ${DIVISIONS[t.div]} • ${recStr(recs[id])}`} back="league" />
      <div className="hero">
        <div className="row" style={{ gap: 16, position: 'relative', zIndex: 1 }}>
          <TeamLogo id={id} size={96} />
          <div className="grow">
            <div className="small muted">{t.history}</div>
            <div className="row wrap" style={{ marginTop: 8, gap: 16 }}>
              <div className="stat"><span className="v">{r.ovr}</span><span className="l">Overall</span></div>
              <div className="stat"><span className="v">{Math.round(r.off)}</span><span className="l">Offense</span></div>
              <div className="stat"><span className="v">{Math.round(r.def)}</span><span className="l">Defense</span></div>
              <div className="stat"><span className="v">{ts.championships}</span><span className="l">Titles</span></div>
              <div className="stat"><span className="v">{Math.round(ts.fanRep)}</span><span className="l">Fan rep</span></div>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>Coach {ts.coach} • {t.offense} offense • {t.defense} defense • {t.stadium} • Rivals: {t.rivals.map((x) => TEAMS[x].name).join(', ')}</div>
          </div>
        </div>
      </div>
      <Section title="Starters">
        <div className="tablewrap"><table className="t"><thead><tr><th>Pos</th><th>Player</th><th className="n">OVR</th><th className="n">Age</th></tr></thead><tbody>
          {POS_LIST.flatMap((pos) => (ts.depth[pos] ?? []).slice(0, STARTERS[pos]).map((pid) => {
            const p = league.players[pid];
            return p ? <tr key={pid} className={p.user ? 'me' : ''}><td>{pos}</td><td>{p.first} {p.last}</td><td className="n">{p.ovr}</td><td className="n">{p.age}</td></tr> : null;
          }))}
        </tbody></table></div>
      </Section>
      {ts.history.length > 0 && <Section title="Recent Seasons">{ts.history.slice(-8).reverse().map((h) => <div key={h.season} className="small">{h.season}: {h.w}-{h.l}{h.t ? `-${h.t}` : ''} • {h.result}</div>)}</Section>}
    </div>
  );
}
