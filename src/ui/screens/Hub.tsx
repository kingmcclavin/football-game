import { useState } from 'react';
import { store, useApp } from '../store';
import { Bar, Modal, Portrait, RoleBadge, Section, TeamLogo, statSummary } from '../components/common';
import {
  phaseLabel, resolveEvent, simEmptyWeek, simUserGame, teamRecordFor, trainingAvailable, userGameThisWeek, userPlayer, nextUserGame,
} from '../../career/career';
import { xpForLevel } from '../../career/progression';
import { seasonProgress } from '../../career/objectives';
import { TEAMS, teamName } from '../../data/teams';
import { POS_LABEL, archetypeById } from '../../data/positions';
import { fmtMoney, ordinal } from '../../core/util';
import { computeRecords, divisionStandings, recStr } from '../../league/standings';
import { weekLabel } from '../../league/schedule';

export function Hub() {
  const { league, career } = useApp();
  const [eventResult, setEventResult] = useState<string | null>(null);
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const team = p.teamId >= 0 ? TEAMS[p.teamId] : null;
  const game = career.phase === 'season' ? userGameThisWeek(league, career) : undefined;
  const upcoming = nextUserGame(league, career);
  const opp = game ? (game.home === p.teamId ? game.away : game.home) : upcoming ? (upcoming.home === p.teamId ? upcoming.away : upcoming.home) : null;
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const div = team ? divisionStandings(recs, team.conf, team.div) : [];
  const divRank = div.findIndex((r) => r.id === p.teamId) + 1;
  const seasonLine = p.stats[league.season] ?? {};
  const lastRecaps = career.recaps.slice(-3).reverse();

  const play = () => {
    if (!game) return;
    store.go('game', { gameId: game.id });
  };
  const sim = async () => {
    if (!game) return;
    const recap = simUserGame(league, career, game);
    await store.commit();
    store.go('postgame', { recap });
  };
  const advance = async () => {
    simEmptyWeek(league, career);
    await store.commit();
    if (career.phase === 'awards') store.go('awards');
  };

  let primary: JSX.Element;
  if (career.phase === 'awards') primary = <button className="btn gold big block" onClick={() => store.go('awards')}>Season Awards & Recap</button>;
  else if (career.phase === 'contract' || career.phase === 'progression') primary = <button className="btn gold big block" onClick={() => store.go('offseason')}>Continue Offseason</button>;
  else if (career.phase === 'retired') primary = <button className="btn gold big block" onClick={() => store.go('retired')}>Career Retrospective</button>;
  else if (game) {
    const inactive = career.role === 'PS' && !game.preseason;
    primary = (
      <div className="col">
        <div className="row">
          {opp !== null && <TeamLogo id={opp} size={52} />}
          <div className="grow">
            <div className="small muted">{weekLabel(game.week)} {game.preseason ? '(Preseason)' : ''}</div>
            <h2>{game.home === p.teamId ? 'vs' : '@'} {opp !== null ? teamName(opp) : ''}</h2>
            <div className="small muted">{opp !== null ? `${teamRecordFor(league, opp)} • ${TEAMS[game.home].stadium}` : ''}</div>
          </div>
        </div>
        {inactive ? (
          <>
            <div className="small warn">You are on the practice squad and inactive this week. Train hard to earn a promotion.</div>
            <button className="btn primary big block" onClick={sim}>Simulate Game</button>
          </>
        ) : (
          <div className="row">
            <button className="btn primary big grow" onClick={play}>Play Game</button>
            <button className="btn" onClick={sim}>Sim</button>
          </div>
        )}
        {trainingAvailable(league, career) && <button className="btn block" onClick={() => store.go('training')}>{'⚡'} Weekly Training (optional)</button>}
      </div>
    );
  } else {
    primary = (
      <div className="col">
        <div className="muted">{league.phase === 'playoffs' ? 'Your team is not playing this round.' : 'No game for your team this week.'}</div>
        <button className="btn primary big block" onClick={advance}>Advance {league.phase === 'playoffs' ? 'Playoff Round' : 'Week'}</button>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="hero">
        <div className="row" style={{ alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
          <Portrait app={career.appearance} teamId={p.teamId} num={p.num} size={92} />
          <div className="grow">
            <div className="row wrap" style={{ gap: 6 }}>
              {team && <span className="chip team">{team.city} {team.name}</span>}
              <RoleBadge role={career.role} />
              <span className="chip">{phaseLabel(league)} • {league.season}</span>
            </div>
            <h1 style={{ marginTop: 6 }}>{p.first} {p.last}</h1>
            <div className="muted small">#{p.num} • {POS_LABEL[p.pos]} • {archetypeById(p.archetype)?.name} • Age {p.age} • Year {p.yearsPro + 1}</div>
            <div className="row" style={{ marginTop: 8, gap: 16 }}>
              <div className="stat"><span className="v">Lv {career.level}</span><span className="l">{career.xp}/{xpForLevel(career.level)} XP</span></div>
              <div className="stat"><span className="v">{career.sp}</span><span className="l">Skill pts</span></div>
              <div className="stat"><span className="v">{fmtMoney(p.contract.salary)}</span><span className="l">{p.contract.years} yr left</span></div>
            </div>
            <div style={{ marginTop: 8, maxWidth: 360 }}><Bar value={career.xp} max={xpForLevel(career.level)} /></div>
          </div>
          <div className="ovr center">{p.ovr}<small>OVR</small></div>
        </div>
      </div>

      <div className="grid g2 stack">
        <div className="card accent">
          <h3>Next Up</h3>
          {primary}
        </div>
        <div className="card">
          <h3>Coach & Locker Room</h3>
          <div className="col" style={{ gap: 8 }}>
            <div><div className="row between small"><span>Coach trust</span><b>{Math.round(career.trust)}</b></div><Bar value={career.trust} green /></div>
            <div><div className="row between small"><span>Reputation</span><b>{Math.round(career.reputation)}</b></div><Bar value={career.reputation} /></div>
            <div><div className="row between small"><span>Fatigue</span><b className={career.fatigue > 60 ? 'bad' : ''}>{Math.round(career.fatigue)}</b></div><Bar value={career.fatigue} /></div>
            <div className="tiny dim">Trust earns snaps, audible rights at 60+ (QB) and play requests at 70+. It grows with objectives, smart play and wins.</div>
          </div>
        </div>
      </div>

      <div className="grid g2 stack">
        <Section title="This Week's Objectives">
          {career.objectives.map((o) => (
            <div className="obj" key={o.id}><div className="ck" /> <div className="grow"><div>{o.text}</div><div className="tiny muted">+{o.xp} XP • +{o.trust} trust</div></div></div>
          ))}
          <div className="divider" />
          <h4>Season Goals</h4>
          {career.seasonGoals.map((o) => {
            const v = seasonProgress(o, seasonLine);
            return (
              <div key={o.id} style={{ marginTop: 8 }}>
                <div className="row between small"><span>{o.text}</span><b>{v}/{o.target}</b></div>
                <Bar value={o.stat === 'sacksAllowed' ? Math.max(0, o.target - v) : v} max={o.target} green />
              </div>
            );
          })}
        </Section>
        <Section title={team ? `${team.name} • ${recStr(recs[p.teamId])}` : 'Team'} right={<button className="btn sm" onClick={() => store.go('league')}>Standings</button>}>
          {team && <div className="small muted" style={{ marginBottom: 8 }}>{ordinal(divRank)} in {team.conf === 0 ? 'LC' : 'FC'} {['East', 'North', 'South', 'West'][team.div]} • Coach {league.teams[p.teamId].coach}</div>}
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>Team</th><th className="n">W-L</th><th className="n">PF</th><th className="n">PA</th></tr></thead>
              <tbody>
                {div.map((r) => (
                  <tr key={r.id} className={r.id === p.teamId ? 'me' : ''}><td><div className="row" style={{ gap: 6 }}><TeamLogo id={r.id} size={20} />{TEAMS[r.id].name}</div></td><td className="n">{recStr(r)}</td><td className="n">{r.pf}</td><td className="n">{r.pa}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>Season: {statSummary(p.pos, seasonLine)}</div>
        </Section>
      </div>

      <div className="grid g2 stack">
        <Section title="Recent Performance" right={<button className="btn sm" onClick={() => store.go('stats')}>All stats</button>}>
          {lastRecaps.length === 0 && <div className="muted small">No games yet. Your first snaps are waiting.</div>}
          {lastRecaps.map((r) => (
            <div key={r.gameId} className="news">
              <div className="row between"><span className="h">{r.us > r.them ? 'W' : r.us < r.them ? 'L' : 'T'} {r.us}-{r.them} {r.home ? 'vs' : '@'} {TEAMS[r.opp].abbr}</span><span className="chip">Grade {r.grade || '—'}</span></div>
              <div className="small muted">{statSummary(p.pos, r.line)} • +{r.xp} XP • trust {r.trustDelta >= 0 ? '+' : ''}{r.trustDelta}</div>
            </div>
          ))}
        </Section>
        <Section title="League News" right={<button className="btn sm" onClick={() => store.go('league', { tab: 'news' })}>More</button>}>
          {league.news.slice(0, 5).map((n) => (
            <div key={n.id} className="news"><div className="h">{n.title}</div><div className="small muted">{n.body}</div></div>
          ))}
        </Section>
      </div>

      {career.pendingEvent && !eventResult && (
        <Modal>
          <span className="chip gold">Career Decision</span>
          <h2 style={{ marginTop: 8 }}>{career.pendingEvent.title}</h2>
          <p className="muted">{career.pendingEvent.body}</p>
          <div className="col">
            {career.pendingEvent.choices.map((c, i) => (
              <button key={c.label} className="option" onClick={async () => { const r = resolveEvent(league, career, i); setEventResult(r); await store.commit(); }}>
                <b>{c.label}</b><div className="small muted">{c.detail}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {eventResult && (
        <Modal onClose={() => setEventResult(null)}>
          <h2>Decision made</h2>
          <p className="muted">{eventResult}</p>
          <button className="btn primary block" onClick={() => setEventResult(null)}>OK</button>
        </Modal>
      )}
    </div>
  );
}
