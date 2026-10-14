import { store, useApp } from '../store';
import { Section, TeamLogo, statSummary } from '../components/common';
import { Trophy } from '../components/Trophy';
import { AWARD_LABEL } from '../../league/season';
import { TEAMS, CHAMPIONSHIP_NAME } from '../../data/teams';
import { toContractPhase, userPlayer } from '../../career/career';
import type { AwardKey } from '../../core/types';

export function Awards() {
  const { league, career } = useApp();
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const h = league.history.find((x) => x.season === league.season) ?? league.history[league.history.length - 1];
  const log = career.seasonLog[career.seasonLog.length - 1];
  const mine = p.awards.filter((a) => a.season === league.season && a.key !== 'CONF_CHAMP');
  const next = async () => {
    toContractPhase(league, career);
    await store.commit();
    store.go('offseason');
  };
  const keys: AwardKey[] = ['FINAL_MVP', 'MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'BEST_QB', 'BEST_RB', 'BEST_WR', 'BEST_TE', 'BEST_OL', 'BEST_DL', 'BEST_LB', 'BEST_DB', 'BEST_K'];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="hero center">
        <span className="chip gold">Season {league.season} Complete</span>
        {h && h.champion >= 0 && h.champion === p.teamId && (
          <div style={{ marginTop: 10 }}><Trophy teamId={h.champion} mvp={h.awardNames.FINAL_MVP} size={3} /></div>
        )}
        {h && h.champion >= 0 && h.champion !== p.teamId && (
          <div className="col" style={{ alignItems: 'center', marginTop: 10, position: 'relative', zIndex: 1 }}>
            <TeamLogo id={h.champion} size={90} />
            <h1>{TEAMS[h.champion].city} {TEAMS[h.champion].name}</h1>
            <div className="muted">{CHAMPIONSHIP_NAME} Champions</div>
            {h.awardNames.FINAL_MVP && <div className="small muted">{CHAMPIONSHIP_NAME} MVP: <b>{h.awardNames.FINAL_MVP}</b></div>}
          </div>
        )}
      </div>
      <div className="grid g2 stack">
        <Section title="Your Season">
          {log && <><div><b>{log.teamRecord}</b> • {log.result}</div><div className="muted small" style={{ marginTop: 6 }}>{statSummary(p.pos, log.line)}</div></>}
          <div className="divider" />
          {mine.length === 0 ? <div className="muted small">No individual awards this season. There's always next year.</div> : <div className="row wrap" style={{ gap: 6 }}>{mine.map((a, i) => <span key={i} className="chip gold">{AWARD_LABEL[a.key]}</span>)}</div>}
          <div className="divider" />
          <h4>Season goals</h4>
          {career.seasonGoals.map((g) => <div key={g.id} className="obj"><div className={`ck ${g.done ? 'done' : 'fail'}`}>{g.done ? '✓' : '✕'}</div><div>{g.text}{g.done && <span className="tiny good"> +{g.xp} XP</span>}</div></div>)}
        </Section>
        <Section title="League Awards">
          {h && keys.map((k) => h.awardNames[k] && <div key={k} className="row between small news"><span className="muted">{AWARD_LABEL[k]}</span><b className={h.awards[k] === p.id ? 'warn' : ''}>{h.awardNames[k]}</b></div>)}
        </Section>
      </div>
      <button className="btn primary big block" onClick={next}>Continue to Offseason</button>
    </div>
  );
}
