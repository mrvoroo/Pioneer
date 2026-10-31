// The 3D backdrop: one field of glowing particles that tells the student's journey.
// It assembles into the Petronas Towers, then a school, a car on the road, the Riyadh office,
// the globe with the flight to Kuala Lumpur, a university, a graduation cap and a shield.
import * as THREE from '../vendor/three.module.min.js';

const MORPH_SECONDS = 1.9;
const SHAPES = ['towers', 'school', 'car', 'office', 'globe', 'campus', 'cap', 'shield', 'sky'];
const TAU = Math.PI * 2;

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Riyadh -> Kuala Lumpur, drawn on a globe that faces the camera between the two cities.
const RUH = [24.71, 46.67], KUL = [2.75, 101.7];
const GLOBE_R = 2.0, LON0 = 74, LAT0 = 12;
function onGlobe(lat, lon, rad = GLOBE_R) {
  const la = (lat - LAT0) * Math.PI / 180, lo = (lon - LON0) * Math.PI / 180;
  return new THREE.Vector3(rad * Math.cos(la) * Math.sin(lo), rad * Math.sin(la), rad * Math.cos(la) * Math.cos(lo));
}
const A = onGlobe(...RUH), B = onGlobe(...KUL);
function arcPoint(t) {
  const p = new THREE.Vector3().copy(A).lerp(B, t).normalize();
  return p.multiplyScalar(GLOBE_R + 0.08 + Math.sin(Math.PI * t) * 0.75);
}

function buildShape(name, n, r) {
  const out = new Float32Array(n * 3);
  const flow = new Float32Array(n);
  const set = (i, x, y, z) => { out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z; };
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const boxes = (list) => {
    const faces = [];
    list.forEach(([x0, x1, y0, y1, z0, z1, only]) => {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const all = [
        ['f', dx * dy, (u, v) => [x0 + u * dx, y0 + v * dy, z1]], ['b', dx * dy, (u, v) => [x0 + u * dx, y0 + v * dy, z0]],
        ['t', dx * dz, (u, v) => [x0 + u * dx, y1, z0 + v * dz]], ['d', dx * dz, (u, v) => [x0 + u * dx, y0, z0 + v * dz]],
        ['l', dy * dz, (u, v) => [x0, y0 + u * dy, z0 + v * dz]], ['r', dy * dz, (u, v) => [x1, y0 + u * dy, z0 + v * dz]]];
      all.forEach((f) => { if (!only || only.includes(f[0])) faces.push([f[1], f[2]]); });
    });
    const total = faces.reduce((a, f) => a + f[0], 0);
    return () => {
      let k = r() * total, i = 0;
      while (k > faces[i][0] && i < faces.length - 1) k -= faces[i++][0];
      return faces[i][1](r(), r());
    };
  };
  const line = (a, b, j = 0.02) => { const u = r(); return [a[0] + (b[0] - a[0]) * u + g() * j, a[1] + (b[1] - a[1]) * u + g() * j, a[2] + (b[2] - a[2]) * u + g() * j]; };
  const ground = (i, y, R) => { const th = r() * TAU, rad = Math.sqrt(r()) * R; set(i, Math.cos(th) * rad, y + g() * 0.02, Math.sin(th) * rad * 0.6); };

  if (name === 'towers') {
    // The Petronas Twin Towers: eight-pointed floor plans, stepped setbacks, spires and the skybridge.
    for (let i = 0; i < n; i++) {
      const k = i % 40;
      if (k < 32) {
        const cx = (i % 2 ? -1 : 1) * 0.95;
        let y = -2.9 + Math.pow(r(), 0.9) * 5.2;
        const h = (y + 2.9) / 5.2;
        const rb = h > 0.93 ? 0.2 : h > 0.87 ? 0.29 : h > 0.8 ? 0.38 : h > 0.72 ? 0.46 : h > 0.62 ? 0.54 : 0.62;
        if (r() < 0.45) y = Math.round(y / 0.085) * 0.085;
        const th = r() * TAU;
        const rad = rb * (0.86 + 0.16 * Math.pow(Math.abs(Math.cos(4 * th)), 4));
        set(i, cx + Math.cos(th) * rad, y, Math.sin(th) * rad);
      } else if (k < 34) {
        const cx = (i % 2 ? -1 : 1) * 0.95, t = r(), y = 2.3 + t * 1.15, rad = 0.07 * (1 - t) + 0.01, th = r() * TAU;
        set(i, cx + Math.cos(th) * rad, y, Math.sin(th) * rad);
      } else if (k < 36) {
        if (r() < 0.6) { const p = line([-0.42, 0.02, 0], [0.42, 0.02, 0], 0.035); set(i, ...p); }
        else { const s = r() < 0.5 ? -1 : 1; const p = line([s * 0.42, 0.0, 0], [s * 0.62, -0.75, 0], 0.025); set(i, ...p); }
      } else ground(i, -2.95, 3.6);
    }
    for (let i = 0; i < n; i++) out[i * 3 + 1] -= 0.15;
  } else if (name === 'school') {
    // A school: main wing, raised entrance with pediment and clock, windows, flag and the gate.
    const wings = boxes([[-2.4, 2.4, -2.4, -0.7, -0.55, 0.55], [-0.75, 0.75, -2.4, -0.1, -0.7, 0.7]]);
    const winX = [-2.0, -1.55, -1.1, 1.1, 1.55, 2.0];
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 42) { const p = wings(); set(i, p[0] + g() * 0.01, p[1] + g() * 0.01, p[2] + g() * 0.01); }
      else if (k < 50) { const v = r(), hw = 0.82 * (1 - v); set(i, (r() * 2 - 1) * hw, -0.1 + v * 0.78, 0.71); }
      else if (k < 53) { const th = r() * TAU; set(i, Math.cos(th) * 0.17, 0.22 + Math.sin(th) * 0.17, 0.73); }
      else if (k < 70) {
        const wx = winX[Math.floor(r() * winX.length)], wy = r() < 0.5 ? -1.95 : -1.25, e = Math.floor(r() * 4), u = r();
        const w = 0.26, hh = 0.38;
        const p = e === 0 ? [wx - w / 2 + u * w, wy] : e === 1 ? [wx - w / 2 + u * w, wy + hh] : e === 2 ? [wx - w / 2, wy + u * hh] : [wx + w / 2, wy + u * hh];
        set(i, p[0], p[1], 0.57);
      } else if (k < 73) { const u = r(); set(i, -0.3 + u * 0.6, -2.4 + (r() < 0.5 ? 0 : 0.85), 0.72); if (r() < 0.5) { out[i * 3] = r() < 0.5 ? -0.3 : 0.3; out[i * 3 + 1] = -2.4 + r() * 0.85; } }
      else if (k < 77) { set(i, 2.95 + g() * 0.015, -2.4 + r() * 3.5, 0.3); }
      else if (k < 83) { const u = r(), v = r(); set(i, 2.95 + u * 0.8, 0.75 + v * 0.45 + Math.sin(u * 5) * 0.06, 0.3 + Math.sin(u * 4) * 0.08); }
      else if (k < 92) {
        const q = r();
        if (q < 0.45) { const s = r() < 0.5 ? -1 : 1; set(i, s * 1.1 + g() * 0.06, -2.4 + r() * 1.1, 1.7 + g() * 0.06); }
        else if (q < 0.7) { const a = r() * Math.PI; set(i, Math.cos(a) * 1.1, -1.3 + Math.sin(a) * 0.4, 1.7); }
        else { const s = r() < 0.5 ? -1 : 1, x = s * (1.25 + r() * 2.0); set(i, x, -2.4 + (r() < 0.3 ? 0.45 : r() * 0.45), 1.7); }
      } else ground(i, -2.42, 3.8);
    }
    for (let i = 0; i < n; i++) out[i * 3 + 1] += 0.25;
  } else if (name === 'car') {
    // A car heading to the office, on a road whose lane markings stream past (flow = 1).
    const body = boxes([[-1.75, 1.75, -0.75, -0.15, -0.72, 0.72]]);
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 34) { const p = body(); set(i, p[0], p[1], p[2]); }
      else if (k < 52) {
        // Cabin: a trapezoid prism, front (windshield) towards -x.
        const v = r(), y = -0.15 + v * 0.62, x0 = -1.0 + v * 0.5, x1 = 0.95 - v * 0.35, face = r();
        if (face < 0.4) set(i, x0 + r() * (x1 - x0), y, r() < 0.5 ? -0.64 : 0.64);
        else if (face < 0.6) set(i, x0 + r() * (x1 - x0), 0.47, (r() - 0.5) * 1.28);
        else if (face < 0.8) set(i, x0, y, (r() - 0.5) * 1.28);
        else set(i, x1, y, (r() - 0.5) * 1.28);
      } else if (k < 68) {
        const cx = r() < 0.5 ? -1.08 : 1.08, cz = r() < 0.5 ? -0.74 : 0.74, th = r() * TAU, rr = r() < 0.75 ? 0.36 : r() * 0.3;
        set(i, cx + Math.cos(th) * rr, -0.78 + Math.sin(th) * rr, cz + g() * 0.04);
      } else if (k < 71) { set(i, -1.78, -0.42 + g() * 0.05, (r() < 0.5 ? -1 : 1) * (0.5 + g() * 0.05)); }
      else {
        flow[i] = 1;
        const q = r(), x = (r() - 0.5) * 12;
        if (q < 0.35) set(i, x, -1.16, (r() < 0.5 ? -1 : 1) * 1.7 + g() * 0.02);
        else if (q < 0.65) { const d = Math.floor((x + 6) / 0.9) * 0.9 - 6 + r() * 0.5; set(i, d, -1.16, g() * 0.03); }
        else if (q < 0.85) set(i, x, -1.16 + g() * 0.01, (r() - 0.5) * 3.4);
        else set(i, x, -0.9 + r() * 1.6, (r() - 0.5) * 3.6);
      }
    }
  } else if (name === 'office') {
    // Kingdom Centre, Riyadh: a tapering tower that opens into a parabolic arch with a skybridge on top.
    const W = 1.05, D = 0.42, yB = -2.2, yT = 2.55, yS = 0.55;
    const outer = (y) => W * (1 - 0.18 * ((y - yB) / (yT - yB)));
    const inner = (y) => (y <= yS ? 0 : outer(y) * 0.86 * Math.sqrt((y - yS) / (yT - yS)));
    const podium = boxes([[-2.2, 2.2, -2.7, -2.2, -1.0, 1.0]]);
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 62) {
        let x, y, o, hi;
        do { y = yB + r() * (yT - yB); o = outer(y); hi = inner(y); x = (r() * 2 - 1) * o; } while (Math.abs(x) < hi);
        if (r() < 0.4) y = Math.round(y / 0.11) * 0.11;
        const zf = D * Math.sqrt(Math.max(0, 1 - (x / o) ** 2)) * (1 - 0.3 * (y - yB) / (yT - yB));
        set(i, x, y, (r() < 0.5 ? -1 : 1) * zf);
      } else if (k < 72) {
        const y = yS + r() * (yT - yS), s = r() < 0.5 ? -1 : 1, edge = r() < 0.5 ? inner(y) : outer(y);
        set(i, s * edge, y, (r() - 0.5) * 0.3);
      } else if (k < 78) { const y = 1.98 + r() * 0.13, hw = inner(2.03); set(i, (r() * 2 - 1) * hw, y, (r() - 0.5) * 0.25); }
      else if (k < 88) { const p = podium(); set(i, p[0], p[1], p[2]); }
      else ground(i, -2.7, 4.0);
    }
  } else if (name === 'globe') {
    // The globe with the Riyadh -> Kuala Lumpur route raised above it.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 55) {
        const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
        set(i, Math.cos(th) * rad * GLOBE_R, y * GLOBE_R, Math.sin(th) * rad * GLOBE_R);
      } else if (k < 70) {
        if (r() < 0.5) { const la = (Math.round((r() * 2 - 1) * 5) / 6) * Math.PI / 2, lo = r() * TAU; set(i, GLOBE_R * Math.cos(la) * Math.cos(lo), GLOBE_R * Math.sin(la), GLOBE_R * Math.cos(la) * Math.sin(lo)); }
        else { const lo = Math.round(r() * 12) / 12 * TAU, la = (r() - 0.5) * Math.PI; set(i, GLOBE_R * Math.cos(la) * Math.cos(lo), GLOBE_R * Math.sin(la), GLOBE_R * Math.cos(la) * Math.sin(lo)); }
      } else if (k < 86) { const p = arcPoint(r()); set(i, p.x + g() * 0.02, p.y + g() * 0.02, p.z + g() * 0.02); }
      else if (k < 94) {
        const c = r() < 0.5 ? A : B, s = c.clone().normalize(), rad = Math.pow(r(), 1.5) * 0.28;
        const t1 = new THREE.Vector3(0, 1, 0).cross(s).normalize(), t2 = s.clone().cross(t1);
        const th = r() * TAU, p = c.clone().multiplyScalar(1.01).addScaledVector(t1, Math.cos(th) * rad).addScaledVector(t2, Math.sin(th) * rad);
        set(i, p.x, p.y, p.z);
      } else { const th = r() * TAU, ph = Math.acos(2 * r() - 1), rad = GLOBE_R * (1.12 + r() * 0.08); set(i, rad * Math.sin(ph) * Math.cos(th), rad * Math.cos(ph), rad * Math.sin(ph) * Math.sin(th)); }
    }
  } else if (name === 'campus') {
    // A university hall: steps, a colonnade, the pediment and a dome.
    const pick = boxes([
      [-2.7, 2.7, -2.75, -2.55, -1.35, 1.35], [-2.5, 2.5, -2.55, -2.35, -1.2, 1.2], [-2.3, 2.3, -2.35, -2.15, -1.05, 1.05],
      [-2.2, 2.2, -2.15, -0.35, -0.95, 0.55, ['f', 'l', 'r']], [-2.35, 2.35, -0.35, 0.05, -1.05, 1.0]]);
    const cols = [-1.95, -1.4, -0.85, -0.3, 0.3, 0.85, 1.4, 1.95];
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 34) { const p = pick(); set(i, p[0], p[1], p[2]); }
      else if (k < 56) { const cx = cols[Math.floor(r() * cols.length)], th = r() * TAU; set(i, cx + Math.cos(th) * 0.13, -2.15 + r() * 1.8, 0.85 + Math.sin(th) * 0.13); }
      else if (k < 66) { const v = r(), hw = 2.35 * (1 - v); set(i, (r() * 2 - 1) * hw, 0.05 + v * 0.8, 1.0); if (r() < 0.3) { out[i * 3] = (r() < 0.5 ? -1 : 1) * hw; } }
      else if (k < 72) { const th = r() * TAU; set(i, Math.cos(th) * 0.85, 0.05 + r() * 0.45, -0.2 + Math.sin(th) * 0.85); }
      else if (k < 88) { const th = r() * TAU, ph = Math.acos(r()), rad = 0.95; set(i, rad * Math.sin(ph) * Math.cos(th), 0.5 + rad * Math.cos(ph), -0.2 + rad * Math.sin(ph) * Math.sin(th)); if (r() < 0.3) out[i * 3 + 1] = 0.5 + Math.round((out[i * 3 + 1] - 0.5) / 0.16) * 0.16; }
      else if (k < 92) { const th = r() * TAU, y = 1.42 + r() * 0.65, rad = y > 1.8 ? 0.04 : 0.15; set(i, Math.cos(th) * rad, y, -0.2 + Math.sin(th) * rad); }
      else ground(i, -2.78, 4.0);
    }
    for (let i = 0; i < n; i++) out[i * 3 + 1] += 0.25;
  } else if (name === 'cap') {
    // A graduation cap with its tassel, and sparks rising around it (flow = 2).
    const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4), tilt = -0.28;
    const rot = (x, y, z) => { const xr = x * c - z * s, zr = x * s + z * c; return [xr, y * Math.cos(tilt) - zr * Math.sin(tilt), y * Math.sin(tilt) + zr * Math.cos(tilt)]; };
    const corner = rot(1.5, 0.62, 1.5);
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 40) {
        const q = r(); let x = (r() * 2 - 1) * 1.5, z = (r() * 2 - 1) * 1.5, y = 0.62 + (r() < 0.5 ? 0.05 : -0.05);
        if (q < 0.3) { if (r() < 0.5) x = (r() < 0.5 ? -1 : 1) * 1.5; else z = (r() < 0.5 ? -1 : 1) * 1.5; y = 0.57 + r() * 0.1; }
        set(i, ...rot(x, y, z));
      } else if (k < 64) {
        const th = r() * TAU, y = -0.55 + r() * 1.1, rad = 1.0 + 0.08 * (1 - (y + 0.55) / 1.1);
        set(i, ...rot(Math.cos(th) * rad, y, Math.sin(th) * rad * 0.92));
      } else if (k < 66) { const th = r() * TAU, rad = r() * 0.12; set(i, ...rot(Math.cos(th) * rad, 0.7, Math.sin(th) * rad)); }
      else if (k < 70) { const p = line(rot(0, 0.7, 0), corner, 0.015); set(i, ...p); }
      else if (k < 76) { const t = r(); set(i, corner[0] + Math.sin(t * 2) * 0.05, corner[1] - t * 1.4, corner[2] + g() * 0.02); }
      else if (k < 82) { const t = r(), th = r() * TAU, rad = 0.05 + t * 0.17; set(i, corner[0] + Math.cos(th) * rad, corner[1] - 1.4 - t * 0.55, corner[2] + Math.sin(th) * rad); }
      else { flow[i] = 2; const th = r() * TAU, rad = 1.6 + r() * 2.2; set(i, Math.cos(th) * rad, -3 + r() * 6, Math.sin(th) * rad * 0.7); }
    }
    for (let i = 0; i < n; i++) out[i * 3 + 1] += 0.2;
  } else if (name === 'shield') {
    // A shield with a check mark: the promise to parents.
    const bez = (t, p0, p1, p2, p3) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
    const edge = (t) => {
      if (t < 0.3) { const u = t / 0.3, x = -1.7 + u * 3.4; return [x, 1.75 + 0.18 * Math.cos(x / 1.7 * Math.PI / 2) ]; }
      const u = (t - 0.3) / 0.7, side = u < 0.5 ? 1 : -1, v = u < 0.5 ? u * 2 : (1 - u) * 2;
      return [side * bez(v, 1.7, 1.75, 0.6, 0), bez(v, 1.75, -0.4, -1.6, -2.4)];
    };
    const prof = [];
    for (let t = 0; t <= 1.0001; t += 0.005) prof.push([bez(t, 1.75, -0.4, -1.6, -2.4), bez(t, 1.7, 1.75, 0.6, 0)]);
    const halfW = (y) => { let best = prof[0], bd = 9; for (const q of prof) { const d = Math.abs(q[0] - y); if (d < bd) { bd = d; best = q; } } return best[1]; };
    const inside = (x, y) => y <= 1.75 && y >= -2.4 && Math.abs(x) <= halfW(y);
    for (let i = 0; i < n; i++) {
      const k = i % 100;
      if (k < 40) { const [x, y] = edge(r()); const sc = r() < 0.6 ? 1 : 0.86; set(i, x * sc + g() * 0.02, y * sc + (sc < 1 ? -0.05 : 0) + g() * 0.02, g() * 0.06); }
      else if (k < 70) { let x, y; do { x = (r() * 2 - 1) * 1.7; y = -2.4 + r() * 4.2; } while (!inside(x, y)); set(i, x, y, g() * 0.12 - 0.1); }
      else if (k < 95) { const p = r() < 0.35 ? line([-0.85, -0.05, 0.25], [-0.2, -0.75, 0.25], 0.05) : line([-0.2, -0.75, 0.25], [1.0, 0.8, 0.25], 0.05); set(i, ...p); }
      else { const th = r() * TAU, ph = Math.acos(2 * r() - 1), rad = 2.8 + r() * 0.8; set(i, rad * Math.sin(ph) * Math.cos(th), rad * Math.cos(ph) * 0.9, rad * Math.sin(ph) * Math.sin(th) * 0.4); }
    }
    for (let i = 0; i < n; i++) out[i * 3 + 1] += 0.25;
  } else {
    // sky: a calm spiral of stars behind the form.
    for (let i = 0; i < n; i++) {
      if (i % 5 === 0) { set(i, (r() - 0.5) * 14, (r() - 0.5) * 9, (r() - 0.5) * 6); continue; }
      const arm = i % 3, rad = Math.pow(r(), 0.7) * 3.6, th = rad * 1.4 + (arm / 3) * TAU, sp = 0.3 * (1 - rad / 4);
      set(i, Math.cos(th) * rad + g() * sp, g() * 0.15, Math.sin(th) * rad + g() * sp);
    }
  }
  return { pos: out, flow };
}

function buildPlane(n, r) {
  const out = new Float32Array(n * 3);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  for (let i = 0; i < n; i++) {
    const k = i % 10; let x, y, z;
    if (k < 4) { x = (r() - 0.5) * 1.0; const rad = 0.07 * (1 - Math.pow(Math.abs(x) * 2, 4)); const th = r() * TAU; y = Math.cos(th) * rad; z = Math.sin(th) * rad; }
    else if (k < 8) { const u = r(), span = (r() * 2 - 1); x = 0.08 - Math.abs(span) * 0.18 + u * 0.12; y = 0; z = span * 0.55; }
    else { const span = r() * 2 - 1; x = -0.42 + r() * 0.08; y = span < -0.3 ? 0.05 + r() * 0.18 : 0; z = span * 0.2; }
    out[i * 3] = x + g() * 0.01; out[i * 3 + 1] = y + g() * 0.01; out[i * 3 + 2] = z + g() * 0.01;
  }
  return out;
}

const vertex = /* glsl */`
  attribute float aRand;
  attribute vec3 aTo;
  attribute float aFlow;
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  uniform float uDir;
  varying float vRand;
  varying float vDepth;
  varying float vFlow;
  vec3 flowed(vec3 p, float f, float t) {
    if (f > 0.5 && f < 1.5) p.x = mod(p.x + t * 2.2 * uDir + 6.0, 12.0) - 6.0;
    if (f > 1.5) p.y = mod(p.y + t * 0.55 + aRand * 6.0 + 3.0, 6.0) - 3.0;
    return p;
  }
  void main() {
    float k = clamp((uProgress - aRand * 0.35) / 0.65, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 to = flowed(aTo, aFlow, uTime);
    vec3 p = mix(position, to, k);
    float t = uTime * 0.6 + aRand * 20.0;
    p += vec3(sin(t), cos(t * 1.3), sin(t * 0.7)) * 0.022;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.55 + aRand * 0.9) * uPixel * (10.0 / -mv.z);
    vRand = aRand;
    vFlow = aFlow;
    vDepth = clamp((-mv.z - 4.0) / 8.0, 0.0, 1.0);
  }
`;

const fragment = /* glsl */`
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform vec3 uD;
  uniform float uOpacity;
  varying float vRand;
  varying float vDepth;
  varying float vFlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 1.7);
    // Graduation gold for most of the field, tropical teal and a little night blue for depth.
    vec3 col = mix(uA, uB, smoothstep(0.0, 0.35, vRand));
    col = mix(col, uC, smoothstep(0.74, 0.86, vRand));
    col = mix(col, uD, smoothstep(0.95, 1.0, vRand));
    if (vFlow > 1.5) col = mix(uA, vec3(1.0), 0.4);
    gl_FragColor = vec4(col, glow * uOpacity * (1.0 - vDepth * 0.55));
  }
`;

export function createWorld(canvas, { reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (_) {
    canvas.remove();
    return null;
  }
  const small = window.matchMedia('(max-width: 760px)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4;
  const N = small || weak ? 6500 : 14000;
  const pixel = Math.min(window.devicePixelRatio || 1, small ? 1.4 : 1.75);
  renderer.setPixelRatio(pixel);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const shapes = {};
  SHAPES.forEach((s, i) => { shapes[s] = buildShape(s, N, rand(101 + i * 17)); });

  const from = new Float32Array(N * 3);
  const start = rand(3);
  for (let i = 0; i < from.length; i++) from[i] = (start() - 0.5) * 22;
  let target = shapes.towers;
  const to = new Float32Array(target.pos);
  const flow = new Float32Array(target.flow);

  const geometry = new THREE.BufferGeometry();
  const fromAttr = new THREE.BufferAttribute(from, 3), toAttr = new THREE.BufferAttribute(to, 3), flowAttr = new THREE.BufferAttribute(flow, 1);
  geometry.setAttribute('position', fromAttr);
  geometry.setAttribute('aTo', toAttr);
  geometry.setAttribute('aFlow', flowAttr);
  const rnd = new Float32Array(N);
  const rr = rand(42);
  for (let i = 0; i < N; i++) rnd[i] = rr();
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 14);

  const css = getComputedStyle(document.documentElement);
  const color = (v, fb) => new THREE.Color((css.getPropertyValue(v) || fb).trim() || fb);
  const uniforms = {
    uTime: { value: 0 }, uProgress: { value: 0 }, uSize: { value: small ? 3.3 : 2.9 }, uPixel: { value: pixel },
    uOpacity: { value: 0.95 }, uDir: { value: 1 },
    uA: { value: color('--p-a', '#ffe7b0') }, uB: { value: color('--p-b', '#f5b942') },
    uC: { value: color('--p-c', '#19c3b1') }, uD: { value: color('--p-d', '#6d8dff') }
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms });
  const points = new THREE.Points(geometry, material);
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  // The aeroplane that flies the route on the globe scene.
  const planeGeo = new THREE.BufferGeometry();
  const PN = small ? 700 : 1400;
  planeGeo.setAttribute('position', new THREE.BufferAttribute(buildPlane(PN, rand(9)), 3));
  const planeMat = new THREE.PointsMaterial({ size: small ? 0.035 : 0.028, color: 0xffe7b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const plane = new THREE.Points(planeGeo, planeMat);
  plane.scale.setScalar(0.32);
  group.add(plane);
  const rider = { t: 0, on: false, op: 0 };

  const state = { x: 0, y: 0, scale: 1, opacity: 0.95, rotY: 0, drive: 0, flipX: 1 };
  const goal = { x: 0, y: 0, scale: 1, opacity: 0.95, mode: 'spin', yaw: 0, drive: 0, flipX: 1 };
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2; mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });

  const clock = new THREE.Clock();
  const cpuFlowed = (j, f, t) => {
    if (f > 0.5 && f < 1.5) { let x = to[j] + t * 2.2 * uniforms.uDir.value + 6; x = ((x % 12) + 12) % 12 - 6; return [x, to[j + 1], to[j + 2]]; }
    if (f > 1.5) { const i = j / 3; let y = to[j + 1] + t * 0.55 + rnd[i] * 6 + 3; y = ((y % 6) + 6) % 6 - 3; return [to[j], y, to[j + 2]]; }
    return [to[j], to[j + 1], to[j + 2]];
  };

  function retarget(next) {
    const p = uniforms.uProgress.value, t = uniforms.uTime.value;
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      let k = Math.min(1, Math.max(0, (p - rnd[i] * 0.35) / 0.65));
      k = k * k * (3 - 2 * k);
      const tt = cpuFlowed(j, flow[i], t);
      from[j] += (tt[0] - from[j]) * k; from[j + 1] += (tt[1] - from[j + 1]) * k; from[j + 2] += (tt[2] - from[j + 2]) * k;
    }
    to.set(next.pos); flow.set(next.flow);
    target = next;
    fromAttr.needsUpdate = toAttr.needsUpdate = flowAttr.needsUpdate = true;
    uniforms.uProgress.value = reduced ? 1 : 0;
  }

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let running = true;
  function frame() {
    if (!running) return;
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = clock.elapsedTime;
    uniforms.uTime.value = t;
    const u = uniforms.uProgress;
    if (u.value < 1) u.value = Math.min(1, u.value + Math.min(raw, 0.25) / MORPH_SECONDS);

    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    for (const key of ['x', 'y', 'scale', 'opacity', 'drive', 'flipX']) state[key] += (goal[key] - state[key]) * 0.06;
    if (goal.mode === 'spin') state.rotY += dt * 0.16;
    else state.rotY += wrap(goal.yaw + Math.sin(t * 0.35) * 0.12 - state.rotY) * 0.05;

    group.position.set(state.x + state.drive, state.y, 0);
    group.scale.set(state.scale * state.flipX, state.scale, state.scale);
    group.rotation.y = state.rotY + mouse.x * 0.3;
    group.rotation.x = 0.1 + mouse.y * 0.15;
    uniforms.uOpacity.value = state.opacity;

    rider.op += ((rider.on ? 1 : 0) - rider.op) * 0.08;
    planeMat.opacity = rider.op * state.opacity;
    plane.visible = rider.op > 0.01;
    if (plane.visible) {
      const tt = Math.min(0.999, Math.max(0.001, rider.t));
      const p = arcPoint(tt), q = arcPoint(Math.min(1, tt + 0.01));
      plane.position.copy(p);
      plane.up.copy(p).normalize();
      plane.lookAt(q);
      plane.rotateY(-Math.PI / 2);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (reduced) { uniforms.uProgress.value = 1; renderer.render(scene, camera); }
  else requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    const was = running;
    running = !document.hidden && !reduced;
    if (running && !was) { clock.getDelta(); requestAnimationFrame(frame); }
  });

  const renderStatic = () => {
    group.position.set(goal.x + goal.drive, goal.y, 0); group.scale.set(goal.scale * goal.flipX, goal.scale, goal.scale);
    group.rotation.set(0.1, goal.mode === 'spin' ? 0.5 : goal.yaw, 0);
    uniforms.uOpacity.value = goal.opacity; renderer.render(scene, camera);
  };

  return {
    morph(name, opts = {}) {
      if (shapes[name] && shapes[name] !== target) retarget(shapes[name]);
      Object.assign(goal, { mode: 'spin', yaw: 0, drive: 0, flipX: 1 }, opts);
      if ('dir' in opts) uniforms.uDir.value = opts.dir;
      rider.on = name === 'globe';
      if (reduced) { uniforms.uProgress.value = 1; renderStatic(); }
    },
    drive(v) { goal.drive = v; if (reduced) renderStatic(); },
    fly(t) { rider.t = t; }
  };
}
