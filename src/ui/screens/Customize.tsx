import { useState } from 'react';
import { store, useApp } from '../store';
import { TopBar } from '../components/common';
import { PlayerPreview } from '../components/PlayerPreview';
import { AppearanceEditor } from '../components/AppearanceEditor';
import { userPlayer } from '../../career/career';

export function Customize() {
  const { league, career } = useApp();
  const [helmet, setHelmet] = useState(true);
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Appearance & Gear" sub="Changes are cosmetic and saved automatically." />
      <div className="grid g2 stack" style={{ alignItems: 'start' }}>
        <div className="col">
          <PlayerPreview app={career.appearance} teamId={p.teamId} num={p.num} helmet={helmet} ht={p.ht} wt={p.wt} uniform={career.uniform === 'alt' ? 'alt' : 'home'} />
          <div className="row"><button className="btn sm" onClick={() => setHelmet(!helmet)}>{helmet ? 'Remove helmet' : 'Put on helmet'}</button>
            <div className="seg">{(['home', 'alt'] as const).map((u) => <button key={u} className={career.uniform === u ? 'on' : ''} onClick={() => { career.uniform = u; void store.commit(); }}>{u === 'home' ? 'Primary' : 'Alternate'}</button>)}</div>
          </div>
        </div>
        <div className="card"><AppearanceEditor app={career.appearance} onChange={(a) => { career.appearance = a; void store.commit(); }} /></div>
      </div>
    </div>
  );
}
