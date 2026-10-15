import { store, useApp } from '../store';
import { Section, TopBar } from '../components/common';
import { ControlsGuide } from '../components/GameHud';
import { useState } from 'react';
import { Tutorial, type TutorialKey } from '../components/Tutorial';
import { PLAYABLE, POS_LABEL, POS_LIST } from '../../data/positions';

export function Help() {
  const { career, settings } = useApp();
  const [guide, setGuide] = useState(false);
  const [tut, setTut] = useState<TutorialKey | null>(null);
  return (
    <div className="col" style={{ gap: 14, padding: career ? 0 : 16, maxWidth: 1000, margin: '0 auto' }}>
      <TopBar title="How to Play" back={career ? 'hub' : 'menu'} />
      <Section title="The career loop">
        <ol className="small" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Create your player and choose a Rookie, Established or Undrafted start.</li>
          <li>Rookies run a combine drill and get drafted; preseason games are your audition.</li>
          <li>Each week: optional training, then game day. You play your own snaps on the pixel field; the rest of the game is simulated.</li>
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
          <li>Offense (QB, RB, WR, TE careers): on your snaps you run the offense. Pick a call, snap, then press anywhere and pull back to aim the arc; release to throw. Time slows while you aim. Tap a receiver for a quick pass.</li>
          <li>Whoever has the ball runs automatically: drag up/down to steer, swipe to juke, and use Spin, Stiff Arm and Dive. Your defense is simulated.</li>
          <li>Defensive careers (LB, DB, DL) play their own defensive snaps with the joystick; kickers use the kick meter.</li>
          <li>Receivers: press CATCH as the ball arrives for an aggressive catch, especially when contested.</li>
          <li>Defenders: the yellow ring is your zone. Tackle when close; dive tackles cover more ground but can whiff.</li>
          <li>Trust 60+ unlocks the full playbook for quarterbacks; 70+ lets any player request plays. Some plays also need a higher career level.</li>
        </ul>
        <button className="btn" onClick={() => setGuide(true)}>Controls guide</button>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <span className="small muted">Replay tutorial:</span>
          {([['QB', 'Quarterback'], ['RB', 'Running back'], ['REC', 'Receiver / TE'], ['DEF', 'Defense'], ['K', 'Kicker']] as [TutorialKey, string][]).map(([k, l]) => <button key={k} className="btn sm" onClick={() => setTut(k)}>{l}</button>)}
        </div>
        {!career && <button className="btn primary" style={{ marginLeft: 8 }} onClick={() => store.go('menu')}>Main menu</button>}
      </Section>
      {tut && <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}><Tutorial which={tut} onClose={() => setTut(null)} /></div>}
      {guide && <ControlsGuide onClose={() => setGuide(false)} settings={settings} />}
    </div>
  );
}
