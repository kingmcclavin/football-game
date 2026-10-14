import { useEffect, useRef, useState } from 'react';
import type { KickParams } from '../../game/engine/PlaySim';
import { input } from '../../game/input/Input';

/**
 * Three-tap kick meter: aim (punts/kickoffs), power, accuracy.
 * The needle speed is affected by the "Ice in the Veins" ability.
 */
export function KickMeter({ kind, distance, speedMult, onDone }: { kind: 'fg' | 'xp' | 'punt' | 'kickoff'; distance?: number; speedMult: number; onDone: (p: KickParams) => void }) {
  const [phase, setPhase] = useState<'aim' | 'power' | 'accuracy' | 'done'>(kind === 'punt' || kind === 'kickoff' ? 'aim' : 'power');
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(0);
  const [acc, setAcc] = useState(0);
  const t0 = useRef(performance.now());
  const locked = useRef<{ power: number }>({ power: 0 });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = (performance.now() - t0.current) / 1000;
      if (phaseRef.current === 'power') {
        const period = 1.5 / speedMult;
        const k = (t % period) / period;
        setPower(k < 0.5 ? k * 2 : 2 - k * 2);
      } else if (phaseRef.current === 'accuracy') {
        const period = 1.0 / speedMult;
        setAcc(Math.sin((t / period) * Math.PI * 2));
      } else if (phaseRef.current === 'aim') {
        const j = input.move();
        if (Math.abs(j.x) > 0.2) setAim((a) => Math.max(-1, Math.min(1, a + j.x * 0.03)));
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [speedMult]);

  const tap = () => {
    if (phase === 'aim') { setPhase('power'); t0.current = performance.now(); }
    else if (phase === 'power') { locked.current.power = power; setPhase('accuracy'); t0.current = performance.now(); }
    else if (phase === 'accuracy') {
      setPhase('done');
      onDone({ power: locked.current.power, accuracy: acc, aim });
    }
  };

  useEffect(() => {
    const off = input.onAction((a) => { if (a === 'snap' || a === 'action' || a === 'kick') tap(); });
    return () => off();
  });

  const title = { fg: `${distance ?? ''}-yard field goal`, xp: 'Extra point', punt: 'Punt', kickoff: 'Kickoff' }[kind];
  return (
    <div className="panelov" style={{ background: 'transparent', alignItems: 'flex-end', paddingBottom: 'calc(30px + var(--safe-b))' }}>
      <div className="box meter col" style={{ gap: 10, background: 'rgba(8,12,22,0.9)' }}>
        <div className="row between"><h3>{title}</h3><span className="chip">{phase === 'aim' ? 'Step 1: Aim' : phase === 'power' ? 'Step 2: Power' : phase === 'accuracy' ? 'Step 3: Accuracy' : 'Kick!'}</span></div>
        {(kind === 'punt' || kind === 'kickoff') && (
          <div className="col" style={{ gap: 4 }}>
            <span className="tiny muted">Direction (joystick / arrows or slider)</span>
            <input type="range" min={-100} max={100} value={Math.round(aim * 100)} disabled={phase !== 'aim'} onChange={(e) => setAim(Number(e.target.value) / 100)} />
          </div>
        )}
        <div className="track">
          <div className="fill" style={{ width: `${(phase === 'power' ? power : locked.current.power) * 100}%` }} />
        </div>
        <div className="track" style={{ opacity: phase === 'accuracy' || phase === 'done' ? 1 : 0.4 }}>
          <div className="acc" />
          <div className="needle" style={{ left: `calc(${50 + acc * 48}% - 2px)` }} />
        </div>
        <button className="btn primary big block" onPointerDown={(e) => { e.preventDefault(); tap(); }}>
          {phase === 'aim' ? 'Set Aim' : phase === 'power' ? 'Lock Power' : phase === 'accuracy' ? 'Kick!' : '…'}
        </button>
        <div className="tiny dim center">Tap the button (or press Space) to lock each meter. Stop the accuracy needle inside the green zone.</div>
      </div>
    </div>
  );
}
