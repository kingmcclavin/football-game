import { useEffect, useRef, useState } from 'react';
import { input } from '../../game/input/Input';

/**
 * Floating virtual joystick: touch anywhere in the left part of the screen.
 * Writes a normalized vector into the shared InputManager.
 */
export function Joystick({ lefty, scale }: { lefty: boolean; scale: number }) {
  const zone = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);
  const R = 60 * scale;

  useEffect(() => () => { input.joy = { x: 0, y: 0 }; }, []);

  const onDown = (e: React.PointerEvent) => {
    if (pid.current !== null) return;
    pid.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setOrigin({ x: e.clientX, y: e.clientY });
    setKnob({ x: 0, y: 0 });
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    if (pid.current !== e.pointerId || !origin) return;
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    const dead = 0.12;
    let jx = dx / R, jy = -dy / R;
    const m = Math.hypot(jx, jy);
    if (m < dead) { jx = 0; jy = 0; }
    input.joy = { x: jx, y: jy };
    e.preventDefault();
  };
  const onUp = (e: React.PointerEvent) => {
    if (pid.current !== e.pointerId) return;
    pid.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    input.joy = { x: 0, y: 0 };
  };

  const size = 150 * scale;
  const style: React.CSSProperties = origin
    ? { position: 'fixed', left: origin.x - size / 2, top: origin.y - size / 2, width: size, height: size, bottom: 'auto' }
    : { width: size, height: size };
  return (
    <>
      <div
        ref={zone}
        style={{ position: 'absolute', top: '18%', bottom: 0, [lefty ? 'right' : 'left']: 0, width: '46%', touchAction: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />
      <div className={`joy ${lefty ? 'lefty' : ''}`} style={{ ...style, pointerEvents: 'none', opacity: origin ? 1 : 0.55 }}>
        <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)`, width: 62 * scale, height: 62 * scale, margin: `${-31 * scale}px 0 0 ${-31 * scale}px` }} />
      </div>
    </>
  );
}

export function ActionButton({ label, keyHint, big, onPress, scale }: { label: string; keyHint?: string; big?: boolean; onPress: () => void; scale: number }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      className={`abtn ${big ? 'big' : ''} ${pressed ? 'pressed' : ''}`}
      style={{ transform: `scale(${scale})`, transformOrigin: 'bottom right' }}
      onPointerDown={(e) => { e.preventDefault(); setPressed(true); onPress(); }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
      {keyHint && <small>{keyHint}</small>}
    </button>
  );
}
