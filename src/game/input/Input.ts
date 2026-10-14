// Unified keyboard + touch input. Touch UI components write into this object;
// the game controller reads it every frame.
import { DEFAULT_KEYS } from '../../core/save';

export type ActionName =
  | 'snap' | 'juke' | 'spin' | 'stiff' | 'truck' | 'dive' | 'protect' | 'slide' | 'catch' | 'swat' | 'tackle' | 'shed' | 'punch'
  | 'fair' | 'kneel' | 'throwAway' | 'camera' | 'pause' | 'action' | 'kick';

export class InputManager {
  keys = new Set<string>();
  joy = { x: 0, y: 0 }; // virtual joystick (-1..1, y up)
  sprintTouch = false;
  autoSprint = true;
  keyMap: Record<string, string> = { ...DEFAULT_KEYS };
  private listeners: ((a: ActionName) => void)[] = [];
  private receiverListeners: ((idx: number, phase: 'down' | 'up') => void)[] = [];
  private attached = false;

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (this.keys.has(e.code)) return;
    this.keys.add(e.code);
    const km = this.keyMap;
    const map: [string, ActionName][] = [
      [km.snap, 'snap'], [km.juke, 'juke'], [km.spin, 'spin'], [km.stiff, 'stiff'], [km.dive, 'dive'], [km.action, 'action'],
      [km.swat, 'swat'], [km.protect, 'protect'], [km.throwAway, 'throwAway'], [km.camera, 'camera'], [km.pause, 'pause'],
    ];
    for (const [code, act] of map) if (code === e.code) { this.emit(act); e.preventDefault(); }
    const num = /^Digit([1-5])$/.exec(e.code);
    if (num) { this.receiverListeners.forEach((l) => l(Number(num[1]) - 1, 'down')); e.preventDefault(); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    const num = /^Digit([1-5])$/.exec(e.code);
    if (num) this.receiverListeners.forEach((l) => l(Number(num[1]) - 1, 'up'));
  };

  private onBlur = () => {
    this.keys.clear();
    this.joy = { x: 0, y: 0 };
  };

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.listeners = [];
    this.receiverListeners = [];
  }

  onAction(fn: (a: ActionName) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  onReceiver(fn: (idx: number, phase: 'down' | 'up') => void) {
    this.receiverListeners.push(fn);
    return () => { this.receiverListeners = this.receiverListeners.filter((l) => l !== fn); };
  }

  emit(a: ActionName) {
    this.listeners.forEach((l) => l(a));
  }

  receiver(idx: number, phase: 'down' | 'up') {
    this.receiverListeners.forEach((l) => l(idx, phase));
  }

  /** Screen-space move vector: x = right, y = up/forward, magnitude 0..1. */
  move(): { x: number; y: number; sprint: boolean } {
    const km = this.keyMap;
    let x = 0, y = 0;
    if (this.keys.has(km.up) || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has(km.down) || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has(km.right) || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has(km.left) || this.keys.has('ArrowLeft')) x -= 1;
    const kbd = x !== 0 || y !== 0;
    if (kbd) {
      const n = Math.hypot(x, y);
      x /= n; y /= n;
    } else {
      x = this.joy.x;
      y = this.joy.y;
    }
    const mag = Math.hypot(x, y);
    const sprint = this.keys.has(km.sprint) || this.keys.has('ShiftRight') || this.sprintTouch || (!kbd && this.autoSprint && mag > 0.92);
    return { x, y, sprint };
  }
}

export const input = new InputManager();
