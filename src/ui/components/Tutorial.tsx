import { useState } from 'react';
import type { Pos } from '../../core/types';

interface Step { title: string; text: string[] }

export type TutorialKey = 'QB' | 'RB' | 'REC' | 'DEF' | 'K';

export function tutorialKey(pos: Pos): TutorialKey {
  if (pos === 'QB') return 'QB';
  if (pos === 'RB') return 'RB';
  if (pos === 'WR' || pos === 'TE') return 'REC';
  if (pos === 'K' || pos === 'P') return 'K';
  return 'DEF';
}

const COMMON_END: Step = {
  title: 'Your career',
  text: [
    'You only play the snaps your role earns. Snaps on the sideline are simulated and summarized.',
    'Good grades, objectives and wins raise coach trust: more snaps, a starting job, then audibles and play requests.',
    'Replay this tutorial any time from Pause, Settings or Help.',
  ],
};

export const TUTORIALS: Record<TutorialKey, Step[]> = {
  QB: [
    { title: 'Call the play', text: ['Pick a play from the call sheet or take the Coach\'s Call.', 'More plays unlock as your career level rises.', 'Press SNAP (or Space) when you are ready.'] },
    { title: 'Move in the pocket', text: ['Touch and drag on the LEFT side of the screen to move (WASD / arrows on a keyboard).', 'Step up to avoid edge rushers. Cross the line and you become a runner.'] },
    { title: 'Drag to aim, release to throw', text: ['Press anywhere on the RIGHT side (or anywhere with a mouse) and drag toward where you want the ball.', 'A dotted line shows the throw. Drag farther for a longer, harder pass.', 'A green ring means a receiver is projected to arrive at that spot. Let go to throw.'] },
    { title: 'Quick passes & reads', text: ['Tap a receiver for a quick touch pass. Number tags show separation: green open, yellow tight, red covered.', 'Defenders can deflect or intercept balls thrown into coverage. Under pressure your accuracy drops.', 'Throw Away (T) avoids a sack. Keys 1-5 also throw to receivers.'] },
    COMMON_END,
  ],
  RB: [
    { title: 'Take the handoff', text: ['The handoff is automatic after the snap. Follow the gold path to the hole.', 'Move with the left-side joystick (WASD / arrows). Push it fully or hold SPRINT to run faster.'] },
    { title: 'Make them miss', text: ['JUKE (J) and SPIN (K) beat a tackler right before contact. STIFF ARM (L) shoves one away.', 'DIVE (U) for the extra yard. PROTECT (R) the ball in traffic to avoid fumbles.', 'On pass plays, run your route and press CATCH as the ball arrives.'] },
    COMMON_END,
  ],
  REC: [
    { title: 'Run your route', text: ['Your route is drawn in gold before the snap and you run it automatically.', 'Steer with the left joystick to fight for space. The QB reads the field and looks for you when you are open.'] },
    { title: 'Make the catch', text: ['Press CATCH (E) as the ball arrives to attack it at the high point. A marker shows where the ball will land.', 'After the catch you are the ball carrier: juke, spin, stiff arm and sprint for yards after catch.', 'Tight ends also block on run plays: stay between your man and the runner.'] },
    COMMON_END,
  ],
  DEF: [
    { title: 'Know your assignment', text: ['Before the snap you see your job: rush, man coverage on a receiver, or a zone (yellow ring).', 'Move with the left joystick. You can freelance, but busted coverage gets punished.'] },
    { title: 'Make the play', text: ['TACKLE (E) when you are close to the ball carrier. From a step away it becomes a diving tackle.', 'SWAT (Q) when the ball arrives to break up or intercept a pass.', 'Linemen: SHED (E) to beat a block, then chase the quarterback.'] },
    COMMON_END,
  ],
  K: [
    { title: 'The kick meter', text: ['Tap (or press Space) three times: first to lock the aim, then the power, then the accuracy.', 'Hit the green accuracy window. Wind, distance and pressure make it harder.', 'Kickoffs use the same meter. Kick power decides touchbacks.'] },
    COMMON_END,
  ],
};

export function Tutorial({ which, onClose }: { which: TutorialKey; onClose: () => void }) {
  const steps = TUTORIALS[which];
  const [i, setI] = useState(0);
  const s = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="tutorial" onClick={(e) => e.stopPropagation()}>
      <div className="card col">
        <div className="row between"><span className="chip gold">Tutorial {i + 1}/{steps.length}</span><button className="btn sm ghost" onClick={onClose}>Skip</button></div>
        <h2>{s.title}</h2>
        {s.text.map((t, k) => <div key={k} className="step">{'▸'} {t}</div>)}
        <div className="row between">
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
          <button className="btn primary" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? "Let's play" : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
