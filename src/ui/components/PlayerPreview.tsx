import { useEffect, useState } from 'react';
import type { Appearance } from '../../core/types';
import { bodyDataUrl, portraitDataUrl } from '../../game/pixel/sprites';

/** Pixel-art preview of the player: animated full-body sprite plus a close-up portrait. */
export function PlayerPreview({ app, teamId, num, helmet, ht, wt, uniform = 'home' }: { app: Appearance; teamId: number; num: number; helmet: boolean; ht: number; wt: number; uniform?: 'home' | 'away' | 'alt' }) {
  const [frame, setFrame] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(1);
  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 8), 160);
    return () => window.clearInterval(id);
  }, []);
  const running = frame < 4;
  const body = bodyDataUrl(app, teamId, uniform, running ? frame : -1, facing);
  const face = portraitDataUrl(app, teamId, num, helmet, uniform === 'alt' ? 'alt' : 'home');
  const tall = Math.max(0.85, Math.min(1.15, ht / 74));
  return (
    <div className="preview pixelbox" onClick={() => setFacing((f) => (f === 1 ? -1 : 1))} role="img" aria-label="player preview">
      <img className="pix" src={face} alt="" style={{ width: 128, height: 128 }} />
      <img className="pix" src={body} alt="" style={{ width: 96 * (wt > 260 ? 1.08 : 1), height: 96 * tall }} />
      <div className="tiny muted">#{num} · {Math.floor(ht / 12)}'{ht % 12}" · {wt} lb</div>
    </div>
  );
}
