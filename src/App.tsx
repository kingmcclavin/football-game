import { useEffect, type ReactNode } from 'react';
import { store, useApp, type Screen } from './ui/store';
import { MainMenu } from './ui/screens/MainMenu';
import { CreateCareer } from './ui/screens/CreateCareer';
import { Hub } from './ui/screens/Hub';
import { GameScreen } from './ui/screens/GameScreen';
import { Postgame } from './ui/screens/Postgame';
import { Training } from './ui/screens/Training';
import { Progression } from './ui/screens/Progression';
import { StatsScreen } from './ui/screens/Stats';
import { LeagueScreen } from './ui/screens/League';
import { DepthChart } from './ui/screens/DepthChart';
import { PlaybookScreen } from './ui/screens/Playbook';
import { Contracts } from './ui/screens/Contracts';
import { History } from './ui/screens/History';
import { SettingsScreen } from './ui/screens/Settings';
import { Customize } from './ui/screens/Customize';
import { Combine } from './ui/screens/Combine';
import { DraftReveal } from './ui/screens/DraftReveal';
import { Awards } from './ui/screens/Awards';
import { Offseason } from './ui/screens/Offseason';
import { Retired } from './ui/screens/Retired';
import { Help } from './ui/screens/Help';
import { TeamScreen } from './ui/screens/Team';
import { audio } from './audio/audio';

const NAV: { id: Screen; label: string; ic: string }[] = [
  { id: 'hub', label: 'Home', ic: '⌂' },
  { id: 'training', label: 'Training', ic: '⚡' },
  { id: 'progression', label: 'Player', ic: '★' },
  { id: 'stats', label: 'Stats', ic: '☰' },
  { id: 'league', label: 'League', ic: '⚑' },
  { id: 'depth', label: 'Depth Chart', ic: '≡' },
  { id: 'playbook', label: 'Playbook', ic: '✎' },
  { id: 'contracts', label: 'Contract', ic: '$' },
  { id: 'history', label: 'Career', ic: '⧗' },
  { id: 'customize', label: 'Appearance', ic: '☺' },
  { id: 'settings', label: 'Settings', ic: '⚙' },
];
const BOTTOM: Screen[] = ['hub', 'training', 'progression', 'league', 'history'];

function Shell({ children }: { children: ReactNode }) {
  const s = useApp();
  return (
    <div className="shell">
      <nav className="sidenav">
        <div className="brand">GRIDIRON <span>LEGACY</span></div>
        {NAV.map((n) => (
          <button key={n.id} className={`navbtn ${s.screen === n.id ? 'active' : ''}`} onClick={() => store.go(n.id)}>
            <span className="ic">{n.ic}</span>{n.label}
          </button>
        ))}
        <div className="divider" />
        <button className="navbtn" onClick={() => store.go('help')}><span className="ic">?</span>How to Play</button>
        <button className="navbtn" onClick={async () => { await store.save(); store.closeCareer(); }}><span className="ic">{'↩'}</span>Save &amp; Exit</button>
      </nav>
      <main className="main fadein" key={s.screen}>{children}</main>
      <nav className="bottomnav">
        {BOTTOM.map((id) => {
          const n = NAV.find((x) => x.id === id)!;
          return (
            <button key={id} className={s.screen === id ? 'active' : ''} onClick={() => store.go(id)}>
              <span className="ic">{n.ic}</span>{n.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function App() {
  const s = useApp();
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    audio.setVolume(s.settings.volume, s.settings.sound, s.settings.music);
    store.applyTheme();
    return () => window.removeEventListener('pointerdown', unlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Chiptune in menus; the stadium crowd takes over during games and drills.
    const inGame = s.screen === 'game' || s.screen === 'combine' || (s.screen === 'training' && !!s.params.drill);
    audio.music(inGame ? null : s.screen === 'menu' || s.screen === 'create' ? 'menu' : 'hub');
  }, [s.screen, s.params.drill]);
  const needsCareer = !['menu', 'create', 'help'].includes(s.screen);
  if (needsCareer && (!s.career || !s.league)) return <MainMenu />;
  let body: ReactNode;
  switch (s.screen) {
    case 'menu': return <>{<MainMenu />}{s.toast && <div className="toast">{s.toast}</div>}</>;
    case 'create': return <CreateCareer />;
    case 'combine': return <Combine />;
    case 'game': return <GameScreen />;
    case 'draft': body = <DraftReveal />; break;
    case 'hub': body = <Hub />; break;
    case 'postgame': body = <Postgame />; break;
    case 'training': body = s.params.drill ? null : <Training />; if (s.params.drill) return <Training />; break;
    case 'progression': body = <Progression />; break;
    case 'stats': body = <StatsScreen />; break;
    case 'league': case 'standings': case 'schedule': case 'bracket': body = <LeagueScreen />; break;
    case 'depth': body = <DepthChart />; break;
    case 'playbook': body = <PlaybookScreen />; break;
    case 'contracts': body = <Contracts />; break;
    case 'history': body = <History />; break;
    case 'settings': body = <SettingsScreen />; break;
    case 'customize': body = <Customize />; break;
    case 'awards': body = <Awards />; break;
    case 'offseason': body = <Offseason />; break;
    case 'retired': body = <Retired />; break;
    case 'help': body = s.career ? <Help /> : <div className="main"><Help /></div>; if (!s.career) return body; break;
    case 'team': body = <TeamScreen />; break;
    default: body = <Hub />;
  }
  return (
    <>
      <Shell>{body}</Shell>
      {s.toast && <div className="toast">{s.toast}</div>}
    </>
  );
}
