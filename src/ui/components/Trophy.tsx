import { useEffect, useRef } from 'react';
import { TEAMS, CHAMPIONSHIP_NAME } from '../../data/teams';
import { drawLogo, drawText, textWidth } from '../../game/pixel/sprites';

/** Pixel-art championship trophy with falling confetti, drawn on a tiny canvas and upscaled. */
export function Trophy({ teamId, mvp, size = 4 }: { teamId: number; mvp?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const W = 96, H = 96;
    const t = TEAMS[teamId] ?? TEAMS[0];
    const cols = ['#ffd23f', '#ff5a5a', '#3ddc84', '#4aa3ff', '#ffffff', t.primary, t.secondary];
    const bits = Array.from({ length: 50 }, (_, i) => ({ x: (i * 37) % W, y: -((i * 53) % H), v: 10 + (i % 7) * 4, c: cols[i % cols.length] }));
    const logo = document.createElement('canvas');
    logo.width = 16;
    logo.height = 16;
    const lg = logo.getContext('2d');
    if (lg) drawLogo(lg, t, 0, 0, 16);
    let raf = 0;
    let last = performance.now();
    let time = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#1b1442';
      g.fillRect(0, 0, W, H);
      // spotlight
      g.fillStyle = 'rgba(255,240,180,0.08)';
      for (let y = 0; y < H; y++) { const w = 10 + y * 0.45; g.fillRect(W / 2 - w, y, w * 2, 1); }
      // pedestal
      g.fillStyle = '#3b2a1a'; g.fillRect(30, 78, 36, 10);
      g.fillStyle = '#5a3f26'; g.fillRect(32, 78, 32, 2);
      g.fillStyle = '#d9a521'; g.fillRect(36, 82, 24, 2);
      // stem & base
      const gold = '#f2c230', shade = '#b8860b', hi = '#fff3a8';
      g.fillStyle = shade; g.fillRect(38, 72, 20, 6);
      g.fillStyle = gold; g.fillRect(40, 72, 16, 5);
      g.fillStyle = shade; g.fillRect(45, 56, 6, 16);
      g.fillStyle = gold; g.fillRect(46, 56, 3, 16);
      // cup
      g.fillStyle = shade; g.fillRect(32, 26, 32, 4);
      for (let i = 0; i < 26; i++) {
        const w = Math.round(16 - (i * i) / 60);
        g.fillStyle = shade; g.fillRect(48 - w, 28 + i, w * 2, 1);
        g.fillStyle = gold; g.fillRect(48 - w + 1, 28 + i, w * 2 - 3, 1);
        g.fillStyle = hi; g.fillRect(48 - w + 3, 28 + i, 2, 1);
      }
      // handles
      g.fillStyle = shade;
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? 26 : 64;
        g.fillRect(x0, 30, 6, 2); g.fillRect(s < 0 ? x0 : x0 + 4, 30, 2, 12); g.fillRect(x0, 40, 6, 2);
      }
      // team logo on the cup
      g.drawImage(logo, 40, 32);
      // sparkle
      if (Math.floor(time * 3) % 2 === 0) { g.fillStyle = '#fff'; g.fillRect(38, 30, 1, 3); g.fillRect(37, 31, 3, 1); }
      // confetti
      for (const b of bits) {
        b.y += b.v * dt;
        if (b.y > H) b.y -= H + 10;
        g.fillStyle = b.c;
        g.fillRect(Math.round(b.x + Math.sin(time * 2 + b.v) * 2), Math.round(b.y), 2, 2);
      }
      const label = 'CHAMPIONS';
      drawText(g, label, Math.round(W / 2 - textWidth(label) / 2), 6, '#ffd23f');
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [teamId]);
  const t = TEAMS[teamId];
  return (
    <div className="trophy">
      <canvas ref={ref} width={96} height={96} style={{ width: 96 * size, height: 96 * size, maxWidth: '80vw', aspectRatio: '1' }} aria-label="championship trophy" />
      {t && <h1>{t.city} {t.name}</h1>}
      <div className="warn">{CHAMPIONSHIP_NAME} Champions</div>
      {mvp && <div className="muted">{CHAMPIONSHIP_NAME} MVP: <b className="warn">{mvp}</b></div>}
    </div>
  );
}
