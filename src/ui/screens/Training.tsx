import { store, useApp } from '../store';
import { TopBar, Section, Bar } from '../components/common';
import { DrillRunner } from '../components/DrillRunner';
import { DRILL_INFO, drillFor } from '../../game/DrillController';
import { applyTraining, trainingAvailable, userPlayer } from '../../career/career';
import { clamp } from '../../core/util';

export function Training() {
  const { league, career, params } = useApp();
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const kind = drillFor(p.pos);
  const info = DRILL_INFO[kind];
  const available = trainingAvailable(league, career);

  if (params.drill) {
    return (
      <DrillRunner
        kind={kind}
        onQuit={() => store.go('training')}
        onDone={async (score) => {
          if (params.practice) { store.toast(`Practice score: ${score}`); store.go('training'); return; }
          const r = applyTraining(league, career, score);
          await store.commit();
          store.toast(`Drill score ${score}: +${r.xp} XP, trust ${r.trust >= 0 ? '+' : ''}${r.trust}`);
          store.go('hub');
        }}
      />
    );
  }

  const recover = async () => {
    career.fatigue = clamp(career.fatigue - 30, 0, 100);
    career.trainingDoneWeek = league.season * 1000 + league.week;
    await store.commit();
    store.toast('Recovery day: fatigue reduced');
    store.go('hub');
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Training" sub="One session per week. Optional, but the best way to earn XP and coach trust between games." />
      {!available && <div className="card"><b>You've already trained this week.</b><div className="muted small">Come back after your next game. You can still practice for fun below (no rewards).</div></div>}
      <div className="grid g2 stack">
        <Section title={info.name}>
          <p className="muted">{info.desc}</p>
          <div className="small muted">Five live reps • scored 0–100 • rewards scale with your score and fatigue</div>
          <div style={{ marginTop: 10 }}>
            <div className="row between small"><span>Fatigue</span><b>{Math.round(career.fatigue)}</b></div>
            <Bar value={career.fatigue} />
          </div>
          <button className="btn primary big block" style={{ marginTop: 12 }} onClick={() => store.go('training', { drill: true })} disabled={!available}>Start Drill</button>
          {!available && <button className="btn block" style={{ marginTop: 8 }} onClick={() => store.go('training', { drill: true, practice: true })}>Practice (no rewards)</button>}
        </Section>
        <Section title="Recovery Session">
          <p className="muted">Skip the drill and spend the week in the training room: ice baths, film and stretching.</p>
          <div className="small muted">−30 fatigue. Fatigue lowers your speed slightly on game day and reduces training XP.</div>
          <button className="btn block" style={{ marginTop: 12 }} disabled={!available} onClick={recover}>Recover</button>
        </Section>
      </div>
    </div>
  );
}
