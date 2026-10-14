import { useState } from 'react';
import type { Attr } from '../../core/types';
import { store, useApp } from '../store';
import { Bar, Section, TopBar } from '../components/common';
import { userPlayer } from '../../career/career';
import { abilityStatus, buyAbility, canUpgrade, toggleEquip, trainableAttrs, upgradeAttr, upgradeCost, xpForLevel } from '../../career/progression';
import { ATTR_LABEL, POS_ATTRS, archetypeById } from '../../data/positions';
import { abilitiesFor, abilitySlots } from '../../data/abilities';

export function Progression() {
  const { league, career } = useApp();
  const [tab, setTab] = useState<'attrs' | 'abilities'>('attrs');
  if (!league || !career) return null;
  const p = userPlayer(league, career);
  const attrs = trainableAttrs(p);
  const weights = POS_ATTRS[p.pos];
  const arch = archetypeById(p.archetype);
  const up = async (a: Attr) => {
    if (upgradeAttr(career, p, a)) await store.commit();
  };
  const slots = abilitySlots(career.level);
  return (
    <div className="col" style={{ gap: 14 }}>
      <TopBar title="Player Progression" sub={`${arch?.name ?? ''} • Level ${career.level}`} right={<div className="row"><span className="chip gold">{career.sp} skill points</span><span className="chip">OVR {p.ovr}</span></div>} />
      <div className="card">
        <div className="row between small"><span>Level {career.level} → {career.level + 1}</span><b>{career.xp} / {xpForLevel(career.level)} XP</b></div>
        <Bar value={career.xp} max={xpForLevel(career.level)} />
        <div className="tiny dim" style={{ marginTop: 6 }}>Earn XP from games, objectives, training, milestones and awards. Each level grants 3 skill points (+2 bonus every 5 levels).</div>
      </div>
      <div className="tabs"><button className={tab === 'attrs' ? 'on' : ''} onClick={() => setTab('attrs')}>Attributes</button><button className={tab === 'abilities' ? 'on' : ''} onClick={() => setTab('abilities')}>Abilities ({career.equipped.length}/{slots} equipped)</button></div>
      {tab === 'attrs' && (
        <Section title="Attributes" right={<span className="tiny muted">★ = counts toward OVR • discounted for your archetype</span>}>
          {attrs.map((a) => {
            const v = p.attrs[a] ?? 50;
            const cost = upgradeCost(p, a);
            const key = !!weights[a];
            const focus = arch?.focus.includes(a);
            return (
              <div className="attrrow" key={a}>
                <div><div style={{ fontWeight: 600 }}>{ATTR_LABEL[a]} {key && <span className="warn">★</span>}</div>{focus && <div className="tiny good">Archetype focus</div>}</div>
                <div className="v">{v}</div>
                <Bar value={v} max={99} />
                <button className="btn sm primary" disabled={!canUpgrade(career, p, a)} onClick={() => up(a)}>+1 ({cost})</button>
              </div>
            );
          })}
        </Section>
      )}
      {tab === 'abilities' && (
        <div className="grid g2 stack">
          {abilitiesFor(p.pos).map((ab) => {
            const st = abilityStatus(career, p, ab);
            const eq = career.equipped.includes(ab.id);
            return (
              <div key={ab.id} className={`abil ${ab.tier} ${st === 'owned' ? 'owned' : ''}`}>
                <div className="row between"><b>{ab.name}</b><span className="chip">{ab.tier}</span></div>
                <div className="small muted">{ab.desc}</div>
                <div className="tiny dim">Requires level {ab.minLevel}{ab.req ? ` and ${ATTR_LABEL[ab.req.attr]} ${ab.req.min}+` : ''} • Cost {ab.cost} SP</div>
                {st === 'owned' ? (
                  <button className={`btn sm ${eq ? 'primary' : ''}`} onClick={async () => { if (!toggleEquip(career, ab.id)) store.toast(`All ${slots} ability slots are full`); await store.commit(); }}>{eq ? 'Equipped ✓' : 'Equip'}</button>
                ) : (
                  <button className="btn sm gold" disabled={st === 'locked' || career.sp < ab.cost} onClick={async () => { if (buyAbility(career, p, ab.id)) await store.commit(); }}>{st === 'locked' ? 'Locked' : `Unlock (${ab.cost} SP)`}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
