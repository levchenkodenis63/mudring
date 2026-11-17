const MR = require('../src/core.js'), C = MR.C;
function run(seed, policy, opts = {}) {
  const tr = MR.makeTrack(seed); const r = MR.newRider(); r.go = true; r.zw = MR.ZW[opts.diff || 'normal']; r.extreme = !!opts.extreme;
  let t = 0, pass = 0, l = C.PASSES[0]; const log = []; let bumps = 0;
  while (t < 600) {
    t += C.DT;
    const act = policy(r, t);
    if (act.tap) { const res = MR.winchTap(r); if (res !== 'none' && res !== 'busy') log.push(res + '@' + t.toFixed(1)); }
    MR.stepRider(r, tr, l, act.gas, C.DT, t);
    for (const e of r.ev) { if (e.t === 'bump') bumps++; if (['winchstall', 'break', 'top', 'drown'].includes(e.t)) log.push(e.t + '@' + t.toFixed(1)); }
    r.ev.length = 0;
    if (r.broken || r.drowned) return { res: r.broken ? 'BROKEN' : 'DROWNED', t: t.toFixed(1), log: log.join(' ') };
    if (r.fin) {
      if (pass < 3) { pass++; l = C.PASSES[pass]; r.fin = false; r.x = C.START; r.entered = [false, false, false]; r.done = {}; }
      else return { res: 'FINISH', t: r.time.toFixed(2), winches: r.winches, stalls: r.wstalls, bumps };
    }
  }
  return { res: 'TIMEOUT', x: r.x.toFixed(1), pass, blocked: r.blocked, log: log.slice(-6).join(' ') };
}
const good = (k = 0.85) => (r) => {
  const tap = (!!r.spot && !r.cable && r.x > r.spot.x0 - 1) || (r.cable && r.atTop);
  return { tap, gas: r.rpm < r.lo + (r.hi - r.lo) * k };
};
for (const s of [1, 2, 3, 4, 5]) console.log('seed', s, 'good:', JSON.stringify(run(s, good())));
console.log('never taps   :', JSON.stringify(run(3, (r) => ({ tap: false, gas: r.rpm < r.lo + (r.hi - r.lo) * 0.85 }))));
console.log('full gas wnch:', JSON.stringify(run(3, (r) => ({ tap: (!!r.spot && !r.cable && r.x > r.spot.x0 - 1) || (r.cable && r.atTop), gas: r.cable ? true : r.rpm < r.lo + (r.hi - r.lo) * 0.85 }))));
console.log('full gas EXTR:', JSON.stringify(run(3, (r) => ({ tap: (!!r.spot && !r.cable && r.x > r.spot.x0 - 1) || (r.cable && r.atTop), gas: r.cable ? true : r.rpm < r.lo + (r.hi - r.lo) * 0.85 }), { extreme: true, diff: 'extreme' })));
for (const d of ['easy', 'normal', 'hard']) { const z = MR.winchZone(MR.ZW[d]), zw = MR.zone(0.6, MR.ZW[d]); console.log(d, 'winch zone', z.map((v) => v.toFixed(2)).join('–'), ' water(0.6) zone', zw.map((v) => v.toFixed(2)).join('–')); }

// боты: 40 заездов на каждом уровне — время, лебёдки, заглохи, сходы
for (const [diff, tyre] of [['easy'], ['normal'], ['hard'], ['extreme', 'mudlite'], ['extreme', 'assassinator']]) {
  const SK = { easy: [0.10, 0.40], normal: [0.36, 0.72], hard: [0.66, 1.0], extreme: [0.66, 1.0] }[diff];
  let fin = 0, tsum = 0, tmin = 1e9, tmax = 0, stalls = 0, broke = 0, drown = 0, drive = 0, stuck = 0;
  for (let i = 0; i < 40; i++) {
    const rnd = MR.rng(1000 + i * 7), tr = MR.makeTrack(1 + (i % 5));
    const ai = MR.makeAI(SK[0] + (SK[1] - SK[0]) * rnd(), rnd, diff === 'extreme');
    const r = MR.newRider(); r.extreme = diff === 'extreme'; r.go = true; r.tyre = tyre ? MR.TYRES[tyre] : null;
    let t = 0, l = C.PASSES[0];
    while (t < 900) {
      t += C.DT;
      const a = MR.aiStep(ai, r, tr, t, C.DT);
      if (a.tap) MR.winchTap(r);
      MR.stepRider(r, tr, l, a.gas, C.DT, t); r.ev.length = 0;
      if (r.broken || r.drowned || r.driveOut) break;
      if (r.fin) { if (ai.pass < 3) { ai.pass++; l = C.PASSES[ai.pass]; r.fin = false; r.x = C.START; r.entered = [false, false, false]; r.done = {}; } else break; }
    }
    stalls += r.wstalls;
    if (r.fin) { fin++; tsum += r.time; tmin = Math.min(tmin, r.time); tmax = Math.max(tmax, r.time); }
    else if (r.broken) broke++; else if (r.drowned) drown++; else if (r.driveOut) drive++; else stuck++;
  }
  console.log(`bots ${(diff + (tyre ? ' ' + tyre : '')).padEnd(21)} finished ${fin}/40 avg ${(tsum / fin).toFixed(1)} [${tmin.toFixed(1)}–${tmax.toFixed(1)}] winch stalls ${stalls} broken ${broke} drowned ${drown} drive ${drive} stuck ${stuck}`);
}
