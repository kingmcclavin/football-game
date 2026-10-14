import { useEffect, useRef, useState } from 'react';
import { deleteSlot, exportSlot, importToSlot, lastSlot, listSlots, loadCareer, SLOTS, type SlotInfo } from '../../core/save';
import { store, useApp } from '../store';
import { Modal } from '../components/common';
import { LEAGUE_NAME } from '../../data/teams';

export function MainMenu() {
  const app = useApp();
  const [slots, setSlots] = useState<(SlotInfo | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [newSlot, setNewSlot] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const importSlot = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = async () => setSlots(await listSlots());
  useEffect(() => { void refresh(); }, [app.version]);

  const last = lastSlot();
  const lastInfo = last !== null ? slots[last] : null;

  const open = async (slot: number) => {
    setBusy(true);
    setErr(null);
    try {
      const save = await loadCareer(slot);
      store.loadCareer(save.career, save.league);
      const c = save.career;
      store.go(c.phase === 'retired' ? 'retired' : c.phase === 'combine' ? 'combine' : c.phase === 'draft' ? 'draft' : c.phase === 'awards' ? 'awards' : c.phase === 'contract' || c.phase === 'progression' ? 'offseason' : 'hub');
    } catch (e) {
      setErr(`Could not load slot ${slot + 1}: ${(e as Error).message}. You can delete it or import a backup.`);
    }
    setBusy(false);
  };

  const exportIt = async (slot: number) => {
    try {
      const json = await exportSlot(slot);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gridiron-legacy-slot${slot + 1}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      await importToSlot(importSlot.current, text);
      store.toast(`Imported into slot ${importSlot.current + 1}`);
      await refresh();
    } catch (e) {
      setErr(`Import failed: ${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const firstEmpty = slots.findIndex((s) => !s);

  return (
    <div className="menu">
      <div style={{ width: 'min(520px, 100%)' }} className="col fadein">
        <div>
          <div className="logo">Gridiron<span>Legacy</span></div>
          <div className="stripes" />
          <div className="muted">Create a player. Earn the job. Build a Hall of Fame career in the {LEAGUE_NAME}.</div>
        </div>
        {err && <div className="card" style={{ borderColor: 'var(--bad)' }}><span className="bad">{err}</span></div>}
        {lastInfo && !lastInfo.corrupt && (
          <button className="btn primary big block" disabled={busy} onClick={() => open(lastInfo.slot)}>
            Continue Career
            <span className="small" style={{ fontFamily: 'var(--body)', textTransform: 'none', fontWeight: 600, opacity: 0.85 }}>{lastInfo.name}</span>
          </button>
        )}
        <button className={`btn big block ${lastInfo ? '' : 'primary'}`} onClick={() => (firstEmpty >= 0 ? store.go('create', { slot: firstEmpty }) : setNewSlot(true))}>New Career</button>
        <div className="card">
          <h3>Career Slots</h3>
          <div className="col">
            {Array.from({ length: SLOTS }).map((_, i) => {
              const s = slots[i];
              return (
                <div className="slot" key={i}>
                  <div className="badge">{i + 1}</div>
                  <div className="grow">
                    {s ? (
                      <>
                        <div style={{ fontWeight: 700 }}>{s.name}</div>
                        <div className="tiny muted">{s.corrupt ? 'Unreadable save' : s.summary} {s.updated ? `• ${new Date(s.updated).toLocaleDateString()}` : ''}</div>
                      </>
                    ) : <div className="muted">Empty slot</div>}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {s ? (
                      <>
                        <button className="btn sm primary" onClick={() => open(i)} disabled={busy || s.corrupt}>Load</button>
                        <button className="btn sm" title="Export save" onClick={() => exportIt(i)}>{'⤓'}</button>
                        <button className="btn sm danger" title="Delete" onClick={() => setConfirmDel(i)}>{'✕'}</button>
                      </>
                    ) : (
                      <>
                        <button className="btn sm" onClick={() => store.go('create', { slot: i })}>New</button>
                        <button className="btn sm" title="Import save" onClick={() => { importSlot.current = i; fileRef.current?.click(); }}>{'⤒'}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        <div className="row">
          <button className="btn grow" onClick={() => store.go('help')}>How to Play</button>
          <button className="btn grow" onClick={() => store.setSettings({ sound: !app.settings.sound })}>Sound: {app.settings.sound ? 'On' : 'Off'}</button>
        </div>
        <div className="tiny dim center">All teams, players and logos are fictional. Saves are stored on this device.</div>
      </div>
      {confirmDel !== null && (
        <Modal onClose={() => setConfirmDel(null)}>
          <h2>Delete career?</h2>
          <p className="muted">Slot {confirmDel + 1} ({slots[confirmDel]?.name}) will be permanently deleted from this device. Export it first if you want a backup.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirmDel(null)}>Cancel</button>
            <button className="btn danger grow" onClick={async () => { await deleteSlot(confirmDel); setConfirmDel(null); await refresh(); store.toast('Career deleted'); }}>Delete</button>
          </div>
        </Modal>
      )}
      {newSlot && (
        <Modal onClose={() => setNewSlot(false)}>
          <h2>All slots are full</h2>
          <p className="muted">Choose a slot to overwrite. The existing career in that slot will be replaced when you start the new one.</p>
          <div className="col">
            {slots.map((s, i) => (
              <button key={i} className="option" onClick={() => { setNewSlot(false); store.go('create', { slot: i }); }}>Slot {i + 1}: {s?.name}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
