import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '../store';
import { GameController } from '../../game/GameController';
import { GameHud } from '../components/GameHud';

export function GameScreen() {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctl, setCtl] = useState<GameController | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const gameId = app.params.gameId as string;

  useEffect(() => {
    const { league, career, settings } = store.get();
    if (!league || !career) return;
    const game = league.schedule.find((g) => g.id === gameId);
    if (!game || game.played) { store.go('hub'); return; }
    let c: GameController;
    try {
      c = new GameController(league, career, game, settings, async (recap) => {
        await store.commit();
        store.go('postgame', { recap });
      });
      c.mount(canvasRef.current!);
    } catch (e) {
      setErr((e as Error).message || 'Could not start the game renderer.');
      return;
    }
    setCtl(c);
    document.body.style.overflow = 'hidden';
    return () => {
      c.unmount();
      document.body.style.overflow = '';
    };
  }, [gameId]);

  const quit = () => {
    if (!ctl) { store.go('hub'); return; }
    ctl.simToEnd();
  };

  return (
    <div className="gamewrap" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} />
      {ctl && <GameHud ctl={ctl} settings={app.settings} onQuit={quit} />}
      {err && (
        <div className="panelov"><div className="box col center"><h2>Game unavailable</h2><p className="muted">{err}</p><button className="btn primary" onClick={() => store.go('hub')}>Back</button></div></div>
      )}
    </div>
  );
}
