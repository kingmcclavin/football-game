import { useState } from 'react';
import type { Pos } from '../../core/types';
import { useApp } from '../store';
import { RoleBadge, Section, TopBar } from '../components/common';
import { userPlayer } from '../../career/career';
import { POS_LABEL, POS_LIST, STARTERS } from '../../data/positions';
import { TEAMS } from '../../data/teams';
import { teamRatings } from '../../league/depth';

export function DepthChart() {
  const { league, career } = useApp();
  const [pos, setPos] = useState<Pos | null>(null);
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  if (p.teamId < 0) return <div className="empty">You are a free agent.</div>;
  const team = league.teams[p.teamId];
  const show = pos ?? p.pos;
  const r = teamRatings(league, team);
  const ids = team.depth[show] ?? [];
  const myIdx = (team.depth[p.pos] ?? []).indexOf(p.id);
  const ahead = myIdx > 0 ? league.players[(team.depth[p.pos] ?? [])[myIdx - 1]] : null;
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Depth Chart" sub={`${TEAMS[p.teamId].city} ${TEAMS[p.teamId].name} • Team OVR ${r.ovr} (OFF ${Math.round(r.off)} / DEF ${Math.round(r.def)})`} right={<RoleBadge role={career.role} />} />
      <div className="card accent">
        <div className="row between wrap">
          <div><b>Your spot:</b> {POS_LABEL[p.pos]} #{myIdx + 1} of {(team.depth[p.pos] ?? []).length} • {STARTERS[p.pos]} starter{STARTERS[p.pos] > 1 ? 's' : ''} at this position</div>
          {ahead && <div className="small muted">Next up the chart: {ahead.first} {ahead.last} (OVR {ahead.ovr}). Beat him with OVR + coach trust (each 10 trust ≈ 1.2 OVR).</div>}
        </div>
      </div>
      <div className="tabs">{POS_LIST.map((x) => <button key={x} className={show === x ? 'on' : ''} onClick={() => setPos(x)}>{x}</button>)}</div>
      <Section title={POS_LABEL[show]}>
        <div className="tablewrap"><table className="t"><thead><tr><th>#</th><th>Player</th><th className="n">OVR</th><th className="n">Age</th><th className="n">Jersey</th><th>Status</th></tr></thead><tbody>
          {ids.map((id, i) => {
            const x = league.players[id];
            if (!x) return null;
            return <tr key={id} className={x.user ? 'me' : ''}><td>{i + 1}</td><td>{x.first} {x.last}</td><td className="n">{x.ovr}</td><td className="n">{x.age}</td><td className="n">{x.num}</td><td>{i < STARTERS[show] ? 'Starter' : i < STARTERS[show] + 1 ? 'Rotation' : 'Reserve'}</td></tr>;
          })}
        </tbody></table></div>
      </Section>
    </div>
  );
}
