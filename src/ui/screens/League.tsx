import { useState } from 'react';
import type { League, StatKey } from '../../core/types';
import { store, useApp } from '../store';
import { Section, TeamLogo, TopBar } from '../components/common';
import { CHAMPIONSHIP_NAME, CONFERENCES, CONF_ABBR, DIVISIONS, TEAMS, teamName } from '../../data/teams';
import { computeRecords, conferenceSeeds, divisionStandings, recStr, winPct } from '../../league/standings';
import { PLAYOFF_WEEK_BASE, weekLabel } from '../../league/schedule';
import { AWARD_LABEL, RECORD_LABEL } from '../../league/season';
import { userPlayer } from '../../career/career';
import { teamRatings } from '../../league/depth';

type Tab = 'standings' | 'schedule' | 'bracket' | 'news' | 'records' | 'history' | 'teams';

export function LeagueScreen() {
  const app = useApp();
  const { league, career } = app;
  const initial: Tab = (app.params.tab as Tab) ?? (app.screen === 'schedule' ? 'schedule' : app.screen === 'bracket' ? 'bracket' : 'standings');
  const [tab, setTab] = useState<Tab>(initial);
  const [view, setView] = useState<'div' | 'conf'>('div');
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const tabs: [Tab, string][] = [['standings', 'Standings'], ['schedule', 'Schedule'], ['bracket', 'Playoffs'], ['news', 'News'], ['records', 'Records'], ['history', 'History'], ['teams', 'Teams']];
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="League" sub={`${league.season} season • ${league.phase === 'offseason' ? 'Offseason' : weekLabel(league.week)}`} />
      <div className="tabs">{tabs.map(([id, l]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
      {tab === 'standings' && <Standings league={league} myTeam={p.teamId} view={view} setView={setView} />}
      {tab === 'schedule' && <Schedule league={league} myTeam={p.teamId} />}
      {tab === 'bracket' && <Bracket league={league} myTeam={p.teamId} />}
      {tab === 'news' && (
        <Section title="News">
          {league.news.map((n) => <div key={n.id} className="news"><div className="row between"><span className="h">{n.title}</span><span className="tiny dim">{n.season} {n.week > 0 || n.week < 0 ? weekLabel(n.week) : ''}</span></div><div className="small muted">{n.body}</div></div>)}
        </Section>
      )}
      {tab === 'records' && <Records league={league} me={p.id} />}
      {tab === 'history' && (
        <Section title="Champions & Award Winners">
          {league.history.length === 0 && <div className="empty">History will be written at the end of the season.</div>}
          {league.history.slice().reverse().map((h) => (
            <div key={h.season} className="news">
              <div className="row between"><b>{h.season}</b>{h.champion >= 0 && <span className="row" style={{ gap: 6 }}><TeamLogo id={h.champion} size={22} />{teamName(h.champion)} <span className="chip gold">{CHAMPIONSHIP_NAME}</span></span>}</div>
              <div className="small muted">{(['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY'] as const).map((k) => h.awardNames[k] ? `${k}: ${h.awardNames[k]}` : '').filter(Boolean).join(' • ')}</div>
            </div>
          ))}
          {league.hallOfFame.length > 0 && (
            <>
              <div className="divider" />
              <h4>Hall of Fame</h4>
              {league.hallOfFame.slice().sort((a, b) => b.score - a.score).map((h) => <div key={h.id} className="small">{h.name} ({h.pos}) • legacy {h.score} • class of {h.inducted}</div>)}
            </>
          )}
        </Section>
      )}
      {tab === 'teams' && (
        <div className="grid g3">
          {TEAMS.map((t) => {
            const r = teamRatings(league, league.teams[t.id]);
            return (
              <button key={t.id} className="option" onClick={() => store.go('team', { teamId: t.id })}>
                <div className="row"><TeamLogo id={t.id} size={38} /><div className="grow"><b>{t.city} {t.name}</b><div className="tiny muted">{CONF_ABBR[t.conf]} {DIVISIONS[t.div]} • OVR {r.ovr}</div></div></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Standings({ league, myTeam, view, setView }: { league: League; myTeam: number; view: 'div' | 'conf'; setView: (v: 'div' | 'conf') => void }) {
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const table = (ids: number[], seedOf?: (id: number) => number) => (
    <div className="tablewrap"><table className="t">
      <thead><tr><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">T</th><th className="n">PCT</th><th className="n">PF</th><th className="n">PA</th><th className="n">DIV</th><th className="n">STRK</th></tr></thead>
      <tbody>{ids.map((id) => {
        const r = recs[id];
        return (
          <tr key={id} className={id === myTeam ? 'me' : ''}>
            <td><div className="row" style={{ gap: 6 }}>{seedOf && <span className="tiny muted" style={{ width: 14 }}>{seedOf(id) || ''}</span>}<TeamLogo id={id} size={20} /><span>{TEAMS[id].city} {TEAMS[id].name}</span></div></td>
            <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{r.t}</td><td className="n">{winPct(r.w, r.l, r.t).toFixed(3).replace(/^0/, '')}</td><td className="n">{r.pf}</td><td className="n">{r.pa}</td><td className="n">{r.dw}-{r.dl}</td><td className="n">{r.streak}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
  return (
    <div className="col">
      <div className="seg" style={{ alignSelf: 'flex-start' }}><button className={view === 'div' ? 'on' : ''} onClick={() => setView('div')}>Divisions</button><button className={view === 'conf' ? 'on' : ''} onClick={() => setView('conf')}>Conference / Playoff Picture</button></div>
      {[0, 1].map((c) => (
        <Section key={c} title={CONFERENCES[c]}>
          {view === 'div'
            ? <div className="col">{DIVISIONS.map((d, di) => <div key={d}><h4 style={{ margin: '6px 0' }}>{CONF_ABBR[c]} {d}</h4>{table(divisionStandings(recs, c, di).map((r) => r.id))}</div>)}</div>
            : (() => {
              const seeds = conferenceSeeds(recs, c);
              const rest = recs.filter((r) => TEAMS[r.id].conf === c && !seeds.includes(r.id)).sort((a, b) => winPct(b.w, b.l, b.t) - winPct(a.w, a.l, a.t)).map((r) => r.id);
              return <>{table(seeds, (id) => seeds.indexOf(id) + 1)}<div className="tiny dim" style={{ margin: '6px 0' }}>Seeds 1–4 are division leaders, 5–7 wild cards. Seed 1 earns a bye.</div>{table(rest)}</>;
            })()}
        </Section>
      ))}
    </div>
  );
}

function Schedule({ league, myTeam }: { league: League; myTeam: number }) {
  const [onlyMine, setOnlyMine] = useState(true);
  const games = league.schedule.filter((g) => g.season === league.season && (!onlyMine || g.home === myTeam || g.away === myTeam)).sort((a, b) => a.week - b.week);
  const weeks = Array.from(new Set(games.map((g) => g.week)));
  return (
    <Section title="Schedule" right={<div className="seg"><button className={onlyMine ? 'on' : ''} onClick={() => setOnlyMine(true)}>My Team</button><button className={!onlyMine ? 'on' : ''} onClick={() => setOnlyMine(false)}>All Games</button></div>}>
      {onlyMine ? (
        <div className="tablewrap"><table className="t"><thead><tr><th>Week</th><th>Opponent</th><th>Result</th></tr></thead><tbody>
          {games.map((g) => {
            const home = g.home === myTeam;
            const opp = home ? g.away : g.home;
            const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
            return (
              <tr key={g.id} className={g.week === league.week && !g.played ? 'hl' : ''}>
                <td>{weekLabel(g.week)}</td>
                <td><div className="row" style={{ gap: 6 }}>{home ? 'vs' : '@'} <TeamLogo id={opp} size={20} />{TEAMS[opp].city} {TEAMS[opp].name}</div></td>
                <td className={g.played ? (us > them ? 'good' : us < them ? 'bad' : '') : 'muted'}>{g.played ? `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}${g.ot ? ' OT' : ''}` : '—'}</td>
              </tr>
            );
          })}
        </tbody></table></div>
      ) : (
        weeks.map((w) => (
          <div key={w} style={{ marginBottom: 10 }}>
            <h4 style={{ margin: '6px 0' }}>{weekLabel(w)}</h4>
            <div className="grid g3">
              {games.filter((g) => g.week === w).map((g) => (
                <div key={g.id} className="bgame">
                  <div className={`tm ${g.played ? (g.as > g.hs ? 'w' : 'l') : ''}`}><span className="row" style={{ gap: 5 }}><TeamLogo id={g.away} size={16} />{TEAMS[g.away].abbr}</span><span>{g.played ? g.as : ''}</span></div>
                  <div className={`tm ${g.played ? (g.hs > g.as ? 'w' : 'l') : ''}`}><span className="row" style={{ gap: 5 }}><TeamLogo id={g.home} size={16} />{TEAMS[g.home].abbr}</span><span>{g.played ? g.hs : ''}</span></div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Section>
  );
}

function Bracket({ league, myTeam }: { league: League; myTeam: number }) {
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const seeds = league.seeds ?? [conferenceSeeds(recs, 0), conferenceSeeds(recs, 1)];
  const projected = !league.seeds;
  const rounds = [1, 2, 3, 4];
  const seedLabel = (id: number) => {
    for (const s of seeds) { const i = s.indexOf(id); if (i >= 0) return i + 1; }
    return '';
  };
  const gamesIn = (r: number) => league.schedule.filter((g) => g.season === league.season && g.round === r);
  return (
    <Section title={projected ? 'Projected Playoff Picture' : `Road to the ${CHAMPIONSHIP_NAME}`}>
      {projected && (
        <div className="grid g2 stack">
          {[0, 1].map((c) => (
            <div key={c}>
              <h4>{CONFERENCES[c]}</h4>
              {seeds[c].map((id, i) => <div key={id} className={`bgame ${id === myTeam ? 'hl' : ''}`}><div className="tm"><span className="row" style={{ gap: 6 }}><b>{i + 1}</b><TeamLogo id={id} size={18} />{TEAMS[id].city} {TEAMS[id].name}</span><span>{recStr(recs[id])}</span></div></div>)}
            </div>
          ))}
        </div>
      )}
      {!projected && (
        <div className="bracket">
          {rounds.map((r) => (
            <div key={r}>
              <h4 style={{ marginBottom: 8 }}>{weekLabel(PLAYOFF_WEEK_BASE + r)}</h4>
              {r === 1 && [0, 1].map((c) => <div key={c} className="bgame"><div className="tm w"><span className="row" style={{ gap: 5 }}><b>1</b><TeamLogo id={seeds[c][0]} size={16} />{TEAMS[seeds[c][0]].abbr}</span><span className="tiny muted">BYE</span></div></div>)}
              {gamesIn(r).map((g) => (
                <div key={g.id} className="bgame" style={g.home === myTeam || g.away === myTeam ? { borderColor: 'var(--team2)' } : undefined}>
                  {[g.away, g.home].map((id) => {
                    const sc = id === g.home ? g.hs : g.as;
                    const other = id === g.home ? g.as : g.hs;
                    return <div key={id} className={`tm ${g.played ? (sc > other ? 'w' : 'l') : ''}`}><span className="row" style={{ gap: 5 }}><b>{seedLabel(id)}</b><TeamLogo id={id} size={16} />{TEAMS[id].abbr}</span><span>{g.played ? sc : ''}</span></div>;
                  })}
                </div>
              ))}
              {gamesIn(r).length === 0 && <div className="tiny dim">TBD</div>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Records({ league, me }: { league: League; me: string }) {
  const scopes = [['game', 'Single Game'], ['season', 'Single Season'], ['career', 'Career'], ['playoffGame', 'Playoff Game']] as const;
  return (
    <div className="grid g2 stack">
      {scopes.map(([k, label]) => (
        <Section key={k} title={`${label} Records`}>
          <div className="tablewrap"><table className="t"><thead><tr><th>Record</th><th className="n">Value</th><th>Holder</th></tr></thead><tbody>
            {Object.entries(league.records[k]).map(([stat, r]) => r && (
              <tr key={stat} className={r.playerId === me ? 'me' : ''}><td>{RECORD_LABEL[stat as StatKey] ?? stat}</td><td className="n">{r.value}</td><td>{r.name} <span className="tiny muted">{TEAMS[r.teamId]?.abbr} {r.season}</span></td></tr>
            ))}
          </tbody></table></div>
          {Object.keys(league.records[k]).length === 0 && <div className="empty small">No records yet.</div>}
        </Section>
      ))}
      <Section title="Team Records">
        <div className="small">Most wins in a season: {league.records.team.mostWins ? `${league.records.team.mostWins.value} — ${league.records.team.mostWins.name} (${league.records.team.mostWins.season})` : '—'}</div>
        <div className="small">Most points in a game: {league.records.team.mostPointsGame ? `${league.records.team.mostPointsGame.value} — ${league.records.team.mostPointsGame.name} (${league.records.team.mostPointsGame.season})` : '—'}</div>
      </Section>
      <Section title="Award Names">
        <div className="tiny muted">{Object.values(AWARD_LABEL).join(' • ')}</div>
      </Section>
    </div>
  );
}
