import { useEffect, useMemo, useRef, useState } from 'react';
import type { HudState } from '../../game/GameController';
import type { KickParams } from '../../game/engine/PlaySim';
import { input, type ActionName } from '../../game/input/Input';
import { TEAMS } from '../../data/teams';
import { FORMATIONS, type DefPlay, type OffPlay } from '../../data/playbook';
import { ActionButton, Joystick, SprintButton } from './TouchControls';
import { KickMeter } from './KickMeter';
import { PlayDiagram, TeamLogo, statSummary } from './common';
import type { Pos, Settings } from '../../core/types';
import { store } from '../store';

export interface Playable {
  hud: HudState;
  audible(): void;
  toggleFlip(): void;
  subscribe(fn: (h: HudState) => void): () => void;
  start(): void;
  snap(): void;
  choosePlay(id: string): void;
  kickWith(p: KickParams): void;
  continueAfterResult(): void;
  continueFromDrive(): void;
  cycleCamera(): void;
  callTimeout(): void;
  simToEnd(): void;
  finish(): void;
  kickSpeed: number;
  title: string;
  isDrill?: boolean;
  userPos: Pos;
  userSlotHint?: string;
  aimBegin(cx: number, cy: number): boolean;
  aimMove(cx: number, cy: number): void;
  aimEnd(cx: number, cy: number): void;
  aimCancel(): void;
}

const finePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

/** Drag-to-aim passing surface: drag from anywhere toward the target, release to throw. Tap a receiver for a quick pass. */
function AimZone({ ctl, lefty }: { ctl: Playable; lefty: boolean }) {
  const pid = useRef<number | null>(null);
  const style: React.CSSProperties = finePointer
    ? { position: 'absolute', inset: 0, touchAction: 'none' }
    : { position: 'absolute', top: '12%', bottom: 0, [lefty ? 'left' : 'right']: 0, width: '54%', touchAction: 'none' };
  return (
    <div
      className="aimzone"
      style={style}
      onPointerDown={(e) => {
        if (pid.current !== null) return;
        if (!ctl.aimBegin(e.clientX, e.clientY)) return;
        pid.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => { if (pid.current === e.pointerId) ctl.aimMove(e.clientX, e.clientY); }}
      onPointerUp={(e) => { if (pid.current !== e.pointerId) return; pid.current = null; ctl.aimEnd(e.clientX, e.clientY); }}
      onPointerCancel={() => { pid.current = null; ctl.aimCancel(); }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

export function GameHud({ ctl, settings, onQuit }: { ctl: Playable; settings: Settings; onQuit: () => void }) {
  const [hud, setHud] = useState<HudState>(ctl.hud);
  const [paused, setPaused] = useState(false);
  const [showGuide, setShowGuide] = useState(() => settings.showGuide && hud0(ctl) === 'pregame');
  const [filter, setFilter] = useState<string>('all');
  useEffect(() => ctl.subscribe(setHud), [ctl]);
  useEffect(() => input.onAction((a) => { if (a === 'pause') setPaused((p) => !p); }), []);
  const scale = settings.controlScale;
  const lefty = settings.leftHanded;
  const drag = settings.passScheme !== 'buttons';
  const press = (id: ActionName | 'snap') => {
    if (id === 'snap') ctl.snap();
    else input.emit(id);
  };
  const H = TEAMS[hud.home], A = TEAMS[hud.away];
  const possHome = hud.poss === hud.home;
  const tapContinue = () => {
    if (hud.mode === 'result') ctl.continueAfterResult();
  };
  const formations = useMemo(() => {
    if (!hud.playcall) return [];
    return Array.from(new Set(hud.playcall.options.map((o) => ('formation' in o ? o.formation : ''))));
  }, [hud.playcall]);

  return (
    <div className="hud">
      {/* Scorebug */}
      <div className="scorebug">
        <div className={`tm ${!possHome && hud.mode !== 'pregame' ? 'poss' : ''}`} style={{ background: A.primary }}><span>{A.abbr}</span><span className="sc">{hud.score[1]}</span></div>
        <div className={`tm ${possHome && hud.mode !== 'pregame' ? 'poss' : ''}`} style={{ background: H.primary }}><span>{H.abbr}</span><span className="sc">{hud.score[0]}</span></div>
        <div className="mid"><span>{hud.final ? 'FINAL' : `${hud.quarter} ${hud.clock}`}</span>
          <div className="to">{[0, 1, 2].map((i) => <i key={i} className={i < hud.timeouts[hud.userTeam === hud.home ? 0 : 1] ? '' : 'used'} />)}</div>
        </div>
        {!hud.final && hud.down && <div className="dd">{hud.down}{hud.ballOn ? ` • ${hud.ballOn}` : ''}</div>}
      </div>
      <div className="hudtop">
        <button className="iconbtn" aria-label="pause" onClick={() => setPaused(true)}>{'⏸'}</button>
        <button className="iconbtn" aria-label="camera" onClick={() => ctl.cycleCamera()}>{'🎥'}</button>
      </div>
      <div className="rotate-hint">Rotate to landscape for the best view</div>

      {/* Result banner */}
      {hud.banner && (hud.mode === 'result' || hud.mode === 'presnap' || hud.mode === 'drive') && (
        <div className={`banner ${hud.banner.tone}`}>
          <div className="t">{hud.banner.title}</div>
          <div className="s">{hud.banner.sub}</div>
        </div>
      )}
      {hud.mode === 'result' && <div className="tapzone" onPointerDown={tapContinue}><div className="assign" style={{ bottom: 'calc(20px + var(--safe-b))' }}><b>Tap to continue</b>{hud.lastPlay}</div></div>}

      {/* Pregame */}
      {hud.mode === 'pregame' && (
        <div className="panelov">
          <div className="box col center" style={{ maxWidth: 520 }}>
            <div className="row" style={{ justifyContent: 'center', gap: 20 }}>
              <div className="col" style={{ alignItems: 'center' }}><TeamLogo id={hud.away} size={70} /><b>{A.city}</b><span className="small muted">{A.name}</span></div>
              <h2 className="muted">@</h2>
              <div className="col" style={{ alignItems: 'center' }}><TeamLogo id={hud.home} size={70} /><b>{H.city}</b><span className="small muted">{H.name}</span></div>
            </div>
            <h2>{ctl.title}</h2>
            <div className="small muted">{H.stadium}{H.dome ? ' (dome)' : ''}</div>
            <button className="btn primary big block" onClick={() => ctl.start()}>{ctl.isDrill ? 'Start Drill' : 'Kick Off'}</button>
            {!ctl.isDrill && <button className="btn block" onClick={() => ctl.simToEnd()}>Simulate Game</button>}
            <button className="btn ghost block" onClick={() => setShowGuide(true)}>Controls Guide</button>
          </div>
        </div>
      )}

      {/* Play call */}
      {hud.mode === 'playcall' && hud.playcall && (
        <div className="panelov">
          <div className="box col">
            <div className="row between wrap">
              <div><h3>{hud.playcall.side === 'off' ? 'Call a Play' : 'Defensive Call'}</h3><div className="tiny muted">{hud.playcall.reason}</div></div>
              <div className="row">
                {hud.playcall.side === 'off' && <button className={`btn sm ${hud.flip ? 'primary' : ''}`} onClick={() => ctl.toggleFlip()}>⇆ Flip {hud.flip ? 'On' : 'Off'}</button>}
                <button className="btn primary" onClick={() => ctl.choosePlay(hud.playcall!.suggestion)}>Coach's Call</button>
              </div>
            </div>
            {formations.length > 1 && (
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
                {formations.map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{FORMATIONS[f]?.name ?? f}</button>)}
              </div>
            )}
            <div className="plays">
              {hud.playcall.options.filter((o) => filter === 'all' || ('formation' in o && o.formation === filter)).map((o) => {
                const off = 'assign' in o;
                return (
                  <button key={o.id} className={`playcard ${o.id === hud.playcall!.suggestion ? 'sug' : ''}`} onClick={() => ctl.choosePlay(o.id)}>
                    {off ? <PlayDiagram play={o as OffPlay} highlight={ctl.userSlotHint} /> : <PlayDiagram def={o as DefPlay} />}
                    <div className="nm">{o.name}</div>
                    <div className="tiny muted">{off ? FORMATIONS[(o as OffPlay).formation].name : (o as DefPlay).desc.slice(0, 40)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Kick meter */}
      {hud.mode === 'kickmeter' && hud.kick && <KickMeter kind={hud.kick.kind} distance={hud.kick.distance} speedMult={ctl.kickSpeed} onDone={(p) => ctl.kickWith(p)} />}

      {/* Drive summary */}
      {hud.mode === 'drive' && (
        <div className="panelov">
          <div className="box col" style={{ maxWidth: 560 }}>
            <h3>{hud.summaryTitle || 'While you were on the sideline'}</h3>
            <div className="ticker">{hud.ticker.map((t, i) => <div key={i} className={t.startsWith('★') ? 'sc' : ''}>{t}</div>)}</div>
            <button className="btn primary big block" onClick={() => ctl.continueFromDrive()}>{hud.summaryTitle === 'Halftime' ? 'Start Second Half' : 'Back on the Field'}</button>
          </div>
        </div>
      )}

      {/* Final */}
      {hud.mode === 'final' && (
        <div className="panelov">
          <div className="box col center" style={{ maxWidth: 520 }}>
            <h1>{ctl.isDrill ? 'Drill Complete' : 'Final'}</h1>
            {!ctl.isDrill && <h2>{A.abbr} {hud.score[1]} – {H.abbr} {hud.score[0]}</h2>}
            {hud.recap && !ctl.isDrill && <div className="muted">{statSummary(ctl.userPos, hud.recap.line)}</div>}
            {hud.recap && !ctl.isDrill && <div className="row" style={{ justifyContent: 'center' }}><span className="chip gold">Grade {hud.recap.grade}</span><span className="chip">+{hud.recap.xp} XP</span></div>}
            {hud.recap && ctl.isDrill && <div className="legacy">{hud.recap.grade}/100</div>}
            <button className="btn primary big block" onClick={() => ctl.finish()}>Continue</button>
          </div>
        </div>
      )}

      {/* Live / pre-snap controls */}
      {(hud.mode === 'live' || hud.mode === 'presnap') && (
        <>
          {hud.mode === 'live' && drag && hud.receivers.length > 0 && <AimZone ctl={ctl} lefty={lefty} />}
          {hud.mode === 'live' && hud.userOnField && !(finePointer && drag && hud.receivers.length > 0) && <Joystick lefty={lefty} scale={scale} />}
          {hud.mode === 'live' && drag && hud.canThrow && <div className="aimhint">Drag toward a receiver &amp; release to throw · Tap a receiver for a quick pass</div>}
          {hud.mode === 'presnap' && (
            <div className="assign"><b>{hud.playName || 'Ready'}{hud.playClock > 0 ? ` • Play clock ${hud.playClock}` : ''}</b>{hud.assignment}</div>
          )}
          {hud.mode === 'presnap' && hud.canAudible && (
            <div className="hudtop right" style={{ top: 'calc(56px + var(--safe-t))' }}><button className="btn sm" onClick={() => ctl.audible()}>Audible</button></div>
          )}
          {hud.receivers.length > 0 && hud.mode === 'live' && !drag ? (
            <div className="recv" style={lefty ? { right: 'auto', left: 14, alignItems: 'flex-start' } : undefined}>
              {hud.charge > 0 && <div className="charge"><i style={{ width: `${hud.charge * 100}%` }} /></div>}
              <div className="rlist">
                {hud.receivers.map((r, i) => (
                  <button key={r.idx} className={`rbtn ${r.open > 3 ? 'g' : r.open > 1.5 ? 'y' : 'r'}`} style={{ transform: `scale(${scale})` }}
                    onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); input.receiver(i, 'down'); }}
                    onPointerUp={() => input.receiver(i, 'up')} onContextMenu={(e) => e.preventDefault()} disabled={!hud.canThrow}>
                    {r.label}<small>{r.name}</small>
                  </button>
                ))}
              </div>
              <div className="row">{hud.buttons.map((b) => <ActionButton key={b.id} label={b.label} keyHint={b.key} big={b.big} scale={scale} onPress={() => press(b.id)} />)}</div>
            </div>
          ) : (
            <div className={`actions ${lefty ? 'lefty' : ''}`}>
              {hud.buttons.map((b) => <ActionButton key={b.id} label={b.label} keyHint={b.key} big={b.big} scale={scale} onPress={() => press(b.id)} />)}
              {hud.mode === 'live' && hud.userOnField && <SprintButton scale={scale} />}
            </div>
          )}
          {hud.mode === 'live' && !hud.userOnField && <div className="assign">Watching the play…</div>}
        </>
      )}

      {/* Pause */}
      {paused && (
        <div className="modalbg">
          <div className="modal col">
            <h2>Paused</h2>
            <div className="small muted">{hud.matchup} • {hud.quarter} {hud.clock} • Your grade so far: {hud.grade || '—'} ({hud.snaps} snaps)</div>
            <button className="btn primary big block" onClick={() => setPaused(false)}>Resume</button>
            <button className="btn block" onClick={() => ctl.cycleCamera()}>Camera: {hud.camMode}</button>
            {!ctl.isDrill && <button className="btn block" onClick={() => { ctl.callTimeout(); setPaused(false); }}>Call Timeout</button>}
            <button className="btn block" onClick={() => setShowGuide(true)}>Controls Guide</button>
            {!ctl.isDrill && <button className="btn block" onClick={() => { setPaused(false); ctl.simToEnd(); }}>Simulate Rest of Game</button>}
            <button className="btn danger block" onClick={onQuit}>{ctl.isDrill ? 'Quit Drill' : 'Quit (game will be simulated)'}</button>
          </div>
        </div>
      )}
      {showGuide && <ControlsGuide onClose={() => { setShowGuide(false); if (settings.showGuide) store.setSettings({ showGuide: false }); }} settings={settings} />}
    </div>
  );
}

const hud0 = (ctl: Playable) => ctl.hud.mode;

export function ControlsGuide({ onClose, settings }: { onClose: () => void; settings: Settings }) {
  const k = (c: string) => c.replace('Key', '').replace('ShiftLeft', 'Shift').replace('Escape', 'Esc');
  const km = settings.keys;
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Controls</h2>
        <div className="grid g2 stack" style={{ marginTop: 10 }}>
          <div>
            <h4>Touch</h4>
            <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Touch & drag anywhere on the left side to move. Push fully to sprint.</li>
              <li>QB: hold a receiver button to charge a bullet pass, tap for a touch pass. Push the stick while releasing to lead the receiver.</li>
              <li>Receiver colors show separation: green open, yellow tight, red covered.</li>
              <li>Ball carrier: Juke, Spin, Stiff Arm, Dive, Protect.</li>
              <li>Receiver: press Catch as the ball arrives (aggressive catch).</li>
              <li>Defense: Tackle when close (dive tackle), Swat to play the ball, Shed to beat blocks.</li>
              <li>Kicks: tap to set aim, power and accuracy.</li>
            </ul>
          </div>
          <div>
            <h4>Keyboard</h4>
            <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
              <li><span className="kbd">{k(km.up)}{k(km.left)}{k(km.down)}{k(km.right)}</span> / arrows: move, <span className="kbd">{k(km.sprint)}</span> sprint</li>
              <li><span className="kbd">{k(km.snap)}</span> snap / continue / lock kick meter</li>
              <li><span className="kbd">1</span>–<span className="kbd">5</span> hold & release to throw to a receiver</li>
              <li><span className="kbd">{k(km.juke)}</span> juke <span className="kbd">{k(km.spin)}</span> spin <span className="kbd">{k(km.stiff)}</span> stiff arm <span className="kbd">{k(km.dive)}</span> dive <span className="kbd">{k(km.protect)}</span> protect</li>
              <li><span className="kbd">{k(km.action)}</span> context action (catch / tackle / shed / punch)</li>
              <li><span className="kbd">{k(km.swat)}</span> swat <span className="kbd">{k(km.throwAway)}</span> throw away <span className="kbd">{k(km.camera)}</span> camera <span className="kbd">{k(km.pause)}</span> pause</li>
            </ul>
          </div>
        </div>
        <button className="btn primary block" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
