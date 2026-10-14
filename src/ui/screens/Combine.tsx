import { useState } from 'react';
import { store, useApp } from '../store';
import { DrillRunner } from '../components/DrillRunner';
import { DRILL_INFO, drillFor } from '../../game/DrillController';
import { runDraft, userPlayer } from '../../career/career';
import { POS_LABEL } from '../../data/positions';

export function Combine() {
  const { league, career } = useApp();
  const [running, setRunning] = useState(false);
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const kind = drillFor(p.pos);
  const finish = async (score: number) => {
    const d = runDraft(league, career, score);
    await store.commit();
    store.go('draft', { ...d, score });
  };
  if (running) return <DrillRunner kind={kind} combine onDone={finish} onQuit={() => setRunning(false)} />;
  return (
    <div className="menu">
      <div className="col fadein" style={{ width: 'min(620px, 100%)' }}>
        <span className="chip gold">Rookie Evaluation</span>
        <h1>The Combine</h1>
        <p className="muted">Scouts from all 32 teams are watching. Your combine drill score shapes where you are drafted and nudges your starting ratings.</p>
        <div className="card">
          <h3>{DRILL_INFO[kind].name}</h3>
          <p className="muted small">{DRILL_INFO[kind].desc}</p>
          <div className="small">{p.first} {p.last} • {POS_LABEL[p.pos]} • OVR {p.ovr}</div>
        </div>
        <button className="btn primary big block" onClick={() => setRunning(true)}>Start Combine Drill</button>
        <button className="btn block" onClick={() => finish(50)}>Skip (average score)</button>
      </div>
    </div>
  );
}
