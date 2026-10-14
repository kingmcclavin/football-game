import { useState } from 'react';
import { useApp } from '../store';
import { PlayDiagram, TopBar } from '../components/common';
import { DEF_PLAYS, FORMATIONS, OFF_PLAYS } from '../../data/playbook';
import { userPlayer } from '../../career/career';
import { isDefense } from '../../data/positions';

export function PlaybookScreen() {
  const { league, career } = useApp();
  const p = league && career ? userPlayer(league, career) : null;
  const [side, setSide] = useState<'off' | 'def'>(p && isDefense(p.pos) ? 'def' : 'off');
  const hint = p ? ({ QB: 'QB', RB: 'RB', WR: 'X', TE: 'TE1', OL: career?.olSlot === 'OT' ? 'LT' : 'LG' } as Record<string, string>)[p.pos] : undefined;
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Playbook" sub="Every play your team runs. Your assignment is highlighted in gold." right={<div className="seg"><button className={side === 'off' ? 'on' : ''} onClick={() => setSide('off')}>Offense</button><button className={side === 'def' ? 'on' : ''} onClick={() => setSide('def')}>Defense</button></div>} />
      {side === 'off' && Object.values(FORMATIONS).map((f) => (
        <div key={f.id} className="card">
          <h3>{f.name} <span className="tiny muted">({f.personnel} personnel)</span></h3>
          <div className="plays">
            {OFF_PLAYS.filter((pl) => pl.formation === f.id).map((pl) => (
              <div key={pl.id} className="playcard"><PlayDiagram play={pl} highlight={hint} /><div className="nm">{pl.name}</div><div className="tiny muted">{pl.desc}</div><div className="row wrap" style={{ gap: 4, marginTop: 4 }}>{pl.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div></div>
            ))}
          </div>
        </div>
      ))}
      {side === 'def' && (
        <div className="plays">
          {DEF_PLAYS.map((d) => <div key={d.id} className="playcard"><PlayDiagram def={d} /><div className="nm">{d.name}</div><div className="tiny muted">{d.desc}</div></div>)}
        </div>
      )}
    </div>
  );
}
