import type { Appearance } from '../../core/types';
import {
  BODY_TYPES, CLEAT_COLORS, FACE_PRESETS, FACIAL_HAIR, GLOVE_COLORS, HAIR_COLORS, HAIR_STYLES, HELMET_STYLES, SKIN_TONES, SLEEVES, VISORS,
} from '../../game/render/playerModel';
import { Picker } from './common';

const cyc = (v: number, n: number, d: number) => (v + d + n) % n;

export function AppearanceEditor({ app, onChange }: { app: Appearance; onChange: (a: Appearance) => void }) {
  const set = (p: Partial<Appearance>) => onChange({ ...app, ...p });
  const acc = (k: keyof Appearance['accessories']) => onChange({ ...app, accessories: { ...app.accessories, [k]: !app.accessories[k] } });
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="col" style={{ gap: 6 }}>
        <span className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Skin tone</span>
        <div className="swatches">
          {SKIN_TONES.map((c, i) => <button key={c} aria-label={`skin ${i + 1}`} className={app.skin === i ? 'on' : ''} style={{ background: c }} onClick={() => set({ skin: i })} />)}
        </div>
      </div>
      <div className="grid g2">
        <Picker label="Face" value={FACE_PRESETS[app.face]} onPrev={() => set({ face: cyc(app.face, FACE_PRESETS.length, -1) })} onNext={() => set({ face: cyc(app.face, FACE_PRESETS.length, 1) })} />
        <Picker label="Body type" value={BODY_TYPES[app.body]} onPrev={() => set({ body: cyc(app.body, BODY_TYPES.length, -1) })} onNext={() => set({ body: cyc(app.body, BODY_TYPES.length, 1) })} />
        <Picker label="Hair" value={HAIR_STYLES[app.hair]} onPrev={() => set({ hair: cyc(app.hair, HAIR_STYLES.length, -1) })} onNext={() => set({ hair: cyc(app.hair, HAIR_STYLES.length, 1) })} />
        <Picker label="Facial hair" value={FACIAL_HAIR[app.facialHair]} onPrev={() => set({ facialHair: cyc(app.facialHair, FACIAL_HAIR.length, -1) })} onNext={() => set({ facialHair: cyc(app.facialHair, FACIAL_HAIR.length, 1) })} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Hair color</span>
        <div className="swatches">
          {HAIR_COLORS.map((c, i) => <button key={c} aria-label={`hair color ${i + 1}`} className={app.hairColor === i ? 'on' : ''} style={{ background: c }} onClick={() => set({ hairColor: i })} />)}
        </div>
      </div>
      <div className="divider" />
      <h4>Equipment</h4>
      <div className="grid g2">
        <Picker label="Helmet / facemask" value={HELMET_STYLES[app.helmet]} onPrev={() => set({ helmet: cyc(app.helmet, HELMET_STYLES.length, -1) })} onNext={() => set({ helmet: cyc(app.helmet, HELMET_STYLES.length, 1) })} />
        <Picker label="Visor" value={VISORS[app.visor]} onPrev={() => set({ visor: cyc(app.visor, VISORS.length, -1) })} onNext={() => set({ visor: cyc(app.visor, VISORS.length, 1) })} />
        <Picker label="Gloves" value={GLOVE_COLORS[app.gloves]} onPrev={() => set({ gloves: cyc(app.gloves, GLOVE_COLORS.length, -1) })} onNext={() => set({ gloves: cyc(app.gloves, GLOVE_COLORS.length, 1) })} />
        <Picker label="Cleats" value={CLEAT_COLORS[app.cleats]} onPrev={() => set({ cleats: cyc(app.cleats, CLEAT_COLORS.length, -1) })} onNext={() => set({ cleats: cyc(app.cleats, CLEAT_COLORS.length, 1) })} />
        <Picker label="Sleeves" value={SLEEVES[app.sleeves]} onPrev={() => set({ sleeves: cyc(app.sleeves, SLEEVES.length, -1) })} onNext={() => set({ sleeves: cyc(app.sleeves, SLEEVES.length, 1) })} />
      </div>
      <div className="row wrap">
        {(['eyeBlack', 'wristbands', 'towel', 'neckRoll'] as const).map((k) => (
          <button key={k} className={`btn sm ${app.accessories[k] ? 'primary' : ''}`} onClick={() => acc(k)}>
            {{ eyeBlack: 'Eye Black', wristbands: 'Wristbands', towel: 'Towel', neckRoll: 'Neck Roll' }[k]}
          </button>
        ))}
      </div>
      <div className="tiny dim">Equipment is cosmetic and does not affect gameplay.</div>
    </div>
  );
}
