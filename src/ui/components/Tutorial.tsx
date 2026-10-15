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
    { title: 'Win the toss, call the play', text: ['Call heads or tails before kickoff. Win it and choose to receive or kick.', 'Before each snap pick a call: Quick Pass, Deep Shot, Play Action, Screen, Run Inside or Run Outside (or the Coach\'s Call). More plays unlock as you level up.', 'Press SNAP (or Space).'] },
    { title: 'Slingshot passing', text: ['After the snap, press anywhere and PULL BACK, away from where you want the ball to go.', 'An arc shows the throw and an X marks where it lands. Pull farther to throw farther. Time slows down while you aim.', 'Release to throw. The ball goes where the arc shows; lead your receiver into open grass. A green ring means a receiver will get there.'] },
    { title: 'Run after the catch', text: ['Whoever has the ball runs for the end zone automatically. Drag up or down anywhere to steer (arrow keys work too).', 'Swipe up or down quickly to juke. Tap SPIN, STIFF ARM or DIVE when a tackler closes in.', 'Your defense plays itself: their drives are simulated and summarized.'] },
    COMMON_END,
  ],
  RB: [] as Step[],
  REC: [] as Step[],
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

TUTORIALS.RB = [{ title: 'You run the offense', text: ['On your snaps you control the whole offense, Retro style: you throw every pass and steer whoever has the ball.', 'Your own player is marked with a blinking arrow. Get them the ball to fill your stat line.'] }, ...TUTORIALS.QB];
TUTORIALS.REC = TUTORIALS.RB;

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
