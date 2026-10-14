import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Appearance } from '../../core/types';
import { PlayerModel } from '../../game/render/playerModel';
import { uniformFor } from '../../game/render/scene';
import { TEAMS } from '../../data/teams';

/** Interactive 3D preview of the player's appearance (drag to rotate). */
export function PlayerPreview({ app, teamId, num, helmet, ht, wt, uniform = 'home' }: { app: Appearance; teamId: number; num: number; helmet: boolean; ht: number; wt: number; uniform?: 'home' | 'away' | 'alt' }) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef<{ model: PlayerModel; renderer: THREE.WebGLRenderer; yaw: number; drag: number | null } | null>(null);

  useEffect(() => {
    const el = ref.current!;
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      el.textContent = '3D preview unavailable on this device.';
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight('#ffffff', '#3b4d6b', 1.4));
    const d = new THREE.DirectionalLight('#ffffff', 1.6);
    d.position.set(2, 4, 3);
    scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: '#16233f' }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const model = new PlayerModel();
    scene.add(model.root);
    state.current = { model, renderer, yaw: 0.4, drag: null };
    let raf = 0;
    let t = 0;
    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      cam.aspect = r.width / Math.max(1, r.height);
      cam.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 1 / 60;
      const st = state.current!;
      if (st.drag === null) st.yaw += 0.004;
      model.root.rotation.y = st.yaw;
      model.animate('idle', t, 0, 1 / 60);
      const focusY = st.model.root.scale.y * 1.05;
      cam.position.set(0, focusY + 0.25, 5.6);
      cam.lookAt(0, focusY, 0);
      renderer.render(scene, cam);
    };
    loop();
    const down = (e: PointerEvent) => { state.current!.drag = e.clientX; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      const st = state.current!;
      if (st.drag === null) return;
      st.yaw += (e.clientX - st.drag) * 0.012;
      st.drag = e.clientX;
    };
    const up = () => { state.current!.drag = null; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.forceContextLoss?.();
      el.removeChild(canvas);
      state.current = null;
    };
  }, []);

  useEffect(() => {
    const st = state.current;
    if (!st) return;
    const team = TEAMS[teamId] ?? { ...TEAMS[0], primary: '#2f3b55', secondary: '#c9d2e3', accent: '#ffffff' };
    st.model.setUniform(uniformFor(team, uniform), num);
    st.model.setAppearance({ ...app }, 0, helmet, ht, wt);
    // force glove/cleat team colour refresh
    st.model.setAppearance({ ...app, accessories: { ...app.accessories } }, 1, helmet, ht, wt);
  }, [app, teamId, num, helmet, ht, wt, uniform]);

  return <div className="preview3d" ref={ref} />;
}
