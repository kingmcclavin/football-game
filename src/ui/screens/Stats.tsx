import { useState } from 'react';
import type { StatKey, StatLine } from '../../core/types';
import { useApp } from '../store';
import { Section, TopBar, statColumns, statVal, TeamLogo } from '../components/common';
import { userPlayer } from '../../career/career';
import { careerLine } from '../../league/season';
import { TEAMS } from '../../data/teams';
import { weekLabel } from '../../league/schedule';

const LEADER_CATS: { key: StatKey; label: string }[] = [
  { key: 'passYds', label: 'Passing Yards' }, { key: 'passTD', label: 'Passing TD' }, { key: 'rushYds', label: 'Rushing Yards' }, { key: 'rushTD', label: 'Rushing TD' },
  { key: 'recYds', label: 'Receiving Yards' }, { key: 'rec', label: 'Receptions' }, { key: 'recTD', label: 'Receiving TD' }, { key: 'sacks', label: 'Sacks' },
  { key: 'tackles', label: 'Tackles' }, { key: 'ints', label: 'Interceptions' }, { key: 'fgM', label: 'Field Goals' },
];

export function StatsScreen() {
  const { league, career } = useApp();
  const [tab, setTab] = useState<'season' | 'career' | 'log' | 'leaders'>('season');
  const [cat, setCat] = useState<StatKey>('passYds');
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const cols = statColumns(p.pos);
  const seasons = Object.keys(p.stats).map(Number).sort();
  const total = careerLine(p);
  const post = careerLine(p, true);
  const row = (label: string, l: StatLine, cls = '') => (
    <tr className={cls} key={label}><td>{label}</td>{cols.map((c) => <td key={c.key} className="n">{statVal(l, c.key)}</td>)}</tr>
  );
  const leaders = Object.values(league.players)
    .filter((x) => x.teamId >= 0 && (x.stats[league.season]?.[cat] ?? 0) > 0)
    .sort((a, b) => (b.stats[league.season]?.[cat] ?? 0) - (a.stats[league.season]?.[cat] ?? 0))
    .slice(0, 15);
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Statistics" sub={`${p.first} ${p.last} • ${p.pos}`} />
      <div className="tabs">
        {(['season', 'career', 'log', 'leaders'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ season: 'This Season', career: 'Career', log: 'Game Log', leaders: 'League Leaders' }[t]}</button>)}
      </div>
      {tab === 'season' && (
        <Section title={`${league.season} Season`}>
          <div className="tablewrap"><table className="t"><thead><tr><th></th>{cols.map((c) => <th key={c.key} className="n">{c.label}</th>)}</tr></thead>
            <tbody>{row('Regular season', p.stats[league.season] ?? {}, 'me')}{p.post[league.season] && row('Playoffs', p.post[league.season])}</tbody></table></div>
        </Section>
      )}
      {tab === 'career' && (
        <Section title="Career by Season">
          <div className="tablewrap"><table className="t"><thead><tr><th>Season</th>{cols.map((c) => <th key={c.key} className="n">{c.label}</th>)}</tr></thead>
            <tbody>
              {seasons.map((s) => row(`${s} ${TEAMS[career.seasonLog.find((x) => x.season === s)?.teamId ?? p.teamId]?.abbr ?? ''}`, p.stats[s]))}
              {row('Career', total, 'me')}
              {Object.keys(post).length > 0 && row('Playoffs', post, 'hl')}
            </tbody></table></div>
        </Section>
      )}
      {tab === 'log' && (
        <Section title="Game Log">
          {career.recaps.length === 0 && <div className="empty">No games played yet.</div>}
          <div className="tablewrap"><table className="t"><thead><tr><th>Game</th><th>Result</th><th className="n">GRD</th>{cols.filter((c) => c.key !== 'gp').map((c) => <th key={c.key} className="n">{c.label}</th>)}</tr></thead>
            <tbody>
              {career.recaps.slice().reverse().map((r) => (
                <tr key={r.gameId}><td>{r.season} {weekLabel(r.week)} {r.home ? 'vs' : '@'} {TEAMS[r.opp].abbr}</td><td className={r.us > r.them ? 'good' : r.us < r.them ? 'bad' : ''}>{r.us > r.them ? 'W' : r.us < r.them ? 'L' : 'T'} {r.us}-{r.them}</td><td className="n">{r.grade || '—'}</td>
                  {cols.filter((c) => c.key !== 'gp').map((c) => <td key={c.key} className="n">{statVal(r.line, c.key)}</td>)}</tr>
              ))}
            </tbody></table></div>
        </Section>
      )}
      {tab === 'leaders' && (
        <Section title={`${league.season} League Leaders`}>
          <div className="tabs">{LEADER_CATS.map((c) => <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>{c.label}</button>)}</div>
          <div className="tablewrap"><table className="t"><thead><tr><th>#</th><th>Player</th><th>Team</th><th className="n">{LEADER_CATS.find((c) => c.key === cat)?.label}</th></tr></thead>
            <tbody>
              {leaders.map((x, i) => (
                <tr key={x.id} className={x.user ? 'me' : ''}><td>{i + 1}</td><td>{x.first} {x.last} <span className="tiny muted">{x.pos}</span></td><td><div className="row" style={{ gap: 6 }}><TeamLogo id={x.teamId} size={18} />{TEAMS[x.teamId].abbr}</div></td><td className="n">{x.stats[league.season]?.[cat] ?? 0}</td></tr>
              ))}
            </tbody></table></div>
          {leaders.length === 0 && <div className="empty">No stats recorded yet this season.</div>}
        </Section>
      )}
    </div>
  );
}
