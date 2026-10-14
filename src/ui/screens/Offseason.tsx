import { useState } from 'react';
import { store, useApp } from '../store';
import { Modal, RoleBadge, Section, TeamLogo } from '../components/common';
import { acceptOffer, declineOffers, retire, runUserOffseason, userPlayer, ROLE_LABEL } from '../../career/career';
import { TEAMS } from '../../data/teams';
import { fmtMoney } from '../../core/util';
import { teamRatings } from '../../league/depth';

export function Offseason() {
  const { league, career } = useApp();
  const [notes, setNotes] = useState<string[] | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const offers = career.offers ?? [];
  const mustSign = p.contract.years <= 0;

  const accept = async (i: number) => { acceptOffer(league, career, i); await store.commit(); };
  const decline = async () => { if (declineOffers(league, career)) await store.commit(); };
  const nextSeason = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const n = runUserOffseason(league, career);
    await store.commit();
    setBusy(false);
    setNotes(n);
  };
  const doRetire = async () => {
    retire(league, career);
    await store.commit();
    store.go('retired');
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="hero">
        <span className="chip gold">Offseason {league.season}</span>
        <h1 style={{ marginTop: 6 }}>{career.phase === 'contract' ? (career.offerKind === 'extension' ? 'Extension Offer' : mustSign ? 'Free Agency' : 'Contract Status') : 'Ready for Next Season'}</h1>
        <div className="muted">Age {p.age} • OVR {p.ovr} • Reputation {Math.round(career.reputation)} • {p.contract.years} year{p.contract.years === 1 ? '' : 's'} left at {fmtMoney(p.contract.salary)}</div>
      </div>

      {career.phase === 'contract' && (
        <Section title={mustSign ? 'Offers on the table' : 'Your options'}>
          {offers.length === 0 && (mustSign ? <div className="bad">No team has made an offer. You can retire, or wait for a camp invite (re-sign at the minimum below).</div> : <div className="muted">No extension offered this year. Keep producing.</div>)}
          <div className="grid g2 stack">
            {offers.map((o, i) => {
              const r = teamRatings(league, league.teams[o.teamId]);
              return (
                <div key={i} className="card">
                  <div className="row"><TeamLogo id={o.teamId} size={44} /><div className="grow"><b>{TEAMS[o.teamId].city} {TEAMS[o.teamId].name}</b><div className="tiny muted">Team OVR {r.ovr} • {league.teams[o.teamId].history.slice(-1)[0]?.result ?? ''}</div></div>{o.teamId === p.teamId && <span className="chip team">Current</span>}</div>
                  <div className="row wrap" style={{ marginTop: 8, gap: 14 }}>
                    <div className="stat"><span className="v">{fmtMoney(o.salary)}</span><span className="l">per year</span></div>
                    <div className="stat"><span className="v">{o.years}</span><span className="l">years</span></div>
                    <div className="stat"><span className="v">{fmtMoney(o.bonus)}</span><span className="l">bonus</span></div>
                  </div>
                  <div className="row" style={{ marginTop: 8, gap: 6 }}><span className="small muted">Projected role:</span><RoleBadge role={o.projectedRole} /></div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>{o.note}</div>
                  <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => accept(i)}>Sign</button>
                </div>
              );
            })}
          </div>
          {!mustSign && <button className="btn block" style={{ marginTop: 10 }} onClick={decline}>{offers.length ? 'Decline and play out my contract' : 'Continue'}</button>}
          {mustSign && offers.length === 0 && (
            <button className="btn block" style={{ marginTop: 10 }} onClick={async () => {
              career.offers = [{ teamId: Math.max(0, p.teamId), years: 1, salary: 0.9, bonus: 0, projectedRole: 'BK', note: 'Veteran minimum camp invite.' }];
              await accept(0);
            }}>Accept a veteran-minimum camp invite</button>
          )}
        </Section>
      )}

      {career.phase === 'progression' && (
        <Section title="Start the next season">
          <p className="muted">The league will process retirements, the draft and free agency, you will age a year, and a new schedule will be generated. Your progress is saved first.</p>
          <button className="btn primary big block" disabled={busy} onClick={nextSeason}>{busy ? 'Processing offseason…' : `Begin Season ${league.season + 1}`}</button>
        </Section>
      )}

      <Section title="Retirement">
        <p className="muted small">Hang up the cleats and see your career retrospective and Hall of Fame verdict. This ends the career (the save remains viewable).</p>
        <button className="btn danger" onClick={() => setConfirmRetire(true)}>Retire</button>
      </Section>

      {notes && (
        <Modal>
          <h2>Welcome to {league.season}</h2>
          {notes.map((n, i) => <div key={i} className="news">{n}</div>)}
          <div className="small muted">Team: {TEAMS[p.teamId].city} {TEAMS[p.teamId].name} • Role: {ROLE_LABEL[career.role]}</div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => { setNotes(null); store.go('hub'); }}>To Training Camp</button>
        </Modal>
      )}
      {confirmRetire && (
        <Modal onClose={() => setConfirmRetire(false)}>
          <h2>Retire now?</h2>
          <p className="muted">This ends your playing career after {career.seasonLog.length} season{career.seasonLog.length === 1 ? '' : 's'}.</p>
          <div className="row"><button className="btn grow" onClick={() => setConfirmRetire(false)}>Keep playing</button><button className="btn danger grow" onClick={doRetire}>Retire</button></div>
        </Modal>
      )}
    </div>
  );
}
