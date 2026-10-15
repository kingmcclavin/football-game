import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '../store';
import { GameController } from '../../game/GameController';
import { GameHud } from '../components/GameHud';
import { exhibition } from '../exhibition';

export function GameScreen() {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctl, setCtl] = useState<GameController | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const gameId = app.params.gameId as string;
  const isExh = !!app.params.exhibition;
  const back = isExh ? 'exhibition' : 'hub';

  useEffect(() => {
    const { settings } = store.get();
    const league = isExh ? exhibition.league : store.get().league;
    const career = isExh ? exhibition.career : store.get().career;
    if (!league || !career) { if (isExh) store.go('exhibition'); return; }
    const game = isExh ? exhibition.game : league.schedule.find((g) => g.id === gameId);
    if (!game || game.played) { store.go(back); return; }
    let c: GameController;
    try {
      c = isExh
        ? new GameController(league, career, game, settings, (recap) => store.go('exhibition', { recap }), { allSnaps: true, title: 'Exhibition' })
        : new GameController(league, career, game, settings, async (recap) => {
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
  }, [gameId, isExh]);

  const quit = () => {
    if (!ctl) { store.go(back); return; }
    ctl.simToEnd();
  };

  return (
    <div className="gamewrap" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} />
      {ctl && <GameHud ctl={ctl} settings={app.settings} onQuit={quit} />}
      {err && (
        <div className="panelov"><div className="box col center"><h2>Game unavailable</h2><p className="muted">{err}</p><button className="btn primary" onClick={() => store.go(back)}>Back</button></div></div>
      )}
    </div>
  );
}
