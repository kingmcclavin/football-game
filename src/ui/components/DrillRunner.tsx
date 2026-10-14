import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '../store';
import { DrillController, type DrillKind } from '../../game/DrillController';
import { GameHud } from './GameHud';

/** Full-screen 3D drill session. */
export function DrillRunner({ kind, combine, onDone, onQuit }: { kind: DrillKind; combine?: boolean; onDone: (score: number) => void; onQuit: () => void }) {
  const app = useApp();
  const ref = useRef<HTMLCanvasElement>(null);
  const [ctl, setCtl] = useState<DrillController | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const { league, career, settings } = store.get();
    if (!league || !career) return;
    let c: DrillController;
    try {
      c = new DrillController(league, career, settings, kind, onDone, combine);
      c.mount(ref.current!);
    } catch (e) {
      setErr((e as Error).message || 'WebGL unavailable');
      return;
    }
    setCtl(c);
    return () => c.unmount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  return (
    <div className="gamewrap">
      <canvas ref={ref} />
      {ctl && <GameHud ctl={ctl} settings={app.settings} onQuit={onQuit} />}
      {err && <div className="panelov"><div className="box col center"><h2>3D unavailable</h2><p className="muted">{err}</p><button className="btn primary" onClick={() => onDone(50)}>Skip with average score</button></div></div>}
    </div>
  );
}
