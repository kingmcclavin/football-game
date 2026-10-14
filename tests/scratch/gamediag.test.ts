import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { simulateGame } from '../../src/game/engine/gameLoop';

it('gamediag', () => {
  const league = generateLeague(7);
  const res: Record<string, number> = {};
  let plays = 0, pass = 0, cmp = 0, py = 0, rush = 0, ry = 0, sacks = 0, ints = 0, n = 40;
  for (let i = 0; i < n; i++) {
    const g = simulateGame(league, i % 32, (i + 5) % 32, { seed: i + 1 });
    for (const d of g.lastDrives) res[d.result] = (res[d.result] ?? 0) + 1;
    plays += g.lastDrives.reduce((a, d) => a + d.plays, 0);
    for (const id in g.box) { const b = g.box[id]; pass += b.passAtt ?? 0; cmp += b.passCmp ?? 0; py += b.passYds ?? 0; rush += b.rushAtt ?? 0; ry += b.rushYds ?? 0; sacks += b.sacks ?? 0; ints += b.ints ?? 0; }
  }
  console.log(res, { playsPerGame: plays / n, cmp: (cmp / pass).toFixed(2), ypa: (py / pass).toFixed(1), ypc: (ry / rush).toFixed(1), passPG: pass / n, rushPG: rush / n, sacksPG: sacks / n, intsPG: ints / n });
});
