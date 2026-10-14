import { useSyncExternalStore } from 'react';
import type { Career, League, Settings } from '../core/types';
import { loadSettings, saveCareer, saveSettings } from '../core/save';
import { audio } from '../audio/audio';
import { TEAMS } from '../data/teams';

export type Screen =
  | 'menu' | 'create' | 'combine' | 'draft' | 'hub' | 'game' | 'postgame' | 'training' | 'progression' | 'stats' | 'schedule'
  | 'standings' | 'bracket' | 'depth' | 'playbook' | 'contracts' | 'history' | 'settings' | 'customize' | 'awards' | 'offseason'
  | 'retired' | 'league' | 'help' | 'team';

export interface AppState {
  screen: Screen;
  params: Record<string, unknown>;
  league: League | null;
  career: Career | null;
  settings: Settings;
  version: number;
  toast: string | null;
  saving: boolean;
  lastSaveError: string | null;
}

type Listener = () => void;

class Store {
  state: AppState = {
    screen: 'menu', params: {}, league: null, career: null, settings: loadSettings(), version: 0, toast: null, saving: false, lastSaveError: null,
  };
  private listeners = new Set<Listener>();
  private toastTimer: number | undefined;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  get = () => this.state;
  private emit() {
    this.listeners.forEach((l) => l());
  }
  set(p: Partial<AppState>) {
    this.state = { ...this.state, ...p };
    this.emit();
  }
  go(screen: Screen, params: Record<string, unknown> = {}) {
    audio.click();
    this.set({ screen, params });
    window.scrollTo?.(0, 0);
  }
  /** Re-render after in-place mutation of league/career. */
  touch() {
    this.set({ version: this.state.version + 1 });
    this.applyTheme();
  }
  async save() {
    const { career, league } = this.state;
    if (!career || !league) return;
    this.set({ saving: true });
    try {
      await saveCareer(career, league);
      this.set({ saving: false, lastSaveError: null });
    } catch (e) {
      this.set({ saving: false, lastSaveError: (e as Error).message });
      this.toast('Save failed: ' + (e as Error).message);
    }
  }
  /** Mutate + re-render + persist (checkpoint). */
  async commit() {
    this.touch();
    await this.save();
  }
  setSettings(s: Partial<Settings>) {
    const settings = { ...this.state.settings, ...s };
    saveSettings(settings);
    audio.setVolume(settings.volume, settings.sound);
    this.set({ settings });
  }
  toast(msg: string) {
    this.set({ toast: msg });
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.set({ toast: null }), 2600);
  }
  loadCareer(career: Career, league: League) {
    this.set({ career, league, version: this.state.version + 1 });
    this.applyTheme();
  }
  closeCareer() {
    this.set({ career: null, league: null, screen: 'menu', params: {} });
    this.applyTheme();
  }
  applyTheme() {
    const { career, league } = this.state;
    const root = document.documentElement;
    const p = career && league ? league.players[career.playerId] : null;
    const t = p && p.teamId >= 0 ? TEAMS[p.teamId] : null;
    root.style.setProperty('--team', t ? t.primary : '#2f6fed');
    root.style.setProperty('--team2', t ? t.secondary : '#f5c542');
  }
}

export const store = new Store();

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
