import { store, useApp } from '../store';
import { Section, TopBar } from '../components/common';
import { ControlsGuide } from '../components/GameHud';
import { useState } from 'react';
import { PLAYABLE, POS_LABEL, POS_LIST } from '../../data/positions';

export function Help() {
  const { career, settings } = useApp();
  const [guide, setGuide] = useState(false);
  return (
    <div className="col" style={{ gap: 14, padding: career ? 0 : 16, maxWidth: 1000, margin: '0 auto' }}>
      <TopBar title="How to Play" back={career ? 'hub' : 'menu'} />
      <Section title="The career loop">
        <ol className="small" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Create your player and choose a Rookie or Established start.</li>
          <li>Rookies run a combine drill and get drafted; preseason games are your audition.</li>
          <li>Each week: optional training, then game day. You play your own snaps in 3D; the rest of the game is simulated.</li>
          <li>Earn XP from games, objectives and drills. Spend skill points on attributes and abilities.</li>
          <li>Coach trust and your rating move you up the depth chart: Practice Squad → Backup → Rotation → Starter.</li>
          <li>Make the playoffs, win the Crown Bowl, collect awards, then handle contracts in the offseason.</li>
          <li>Play as many seasons as you like, then retire and see your Hall of Fame verdict.</li>
        </ol>
      </Section>
      <Section title="Positions">
        {POS_LIST.map((p) => <div key={p} className="small news"><b>{POS_LABEL[p]}</b> — {PLAYABLE[p].note}</div>)}
      </Section>
      <Section title="Tips">
        <ul className="small" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li>QB: receiver buttons turn green when open. Tap for a touch pass over defenders, hold for a bullet into tight windows.</li>
          <li>Ball carriers: time jukes and spins just before contact; protect the ball in traffic.</li>
          <li>Receivers: press CATCH as the ball arrives for an aggressive catch, especially when contested.</li>
          <li>Defenders: the yellow ring is your zone. Tackle when close; dive tackles cover more ground but can whiff.</li>
          <li>Trust 60+ unlocks the full playbook for quarterbacks; 70+ lets any player request plays.</li>
        </ul>
        <button className="btn" onClick={() => setGuide(true)}>Controls guide</button>
        {!career && <button className="btn primary" style={{ marginLeft: 8 }} onClick={() => store.go('menu')}>Main menu</button>}
      </Section>
      {guide && <ControlsGuide onClose={() => setGuide(false)} settings={settings} />}
    </div>
  );
}
