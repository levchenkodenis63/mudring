'use strict';
/* ===== MUD RING — ядро: трасса, физика, лебёдка (без DOM) ===== */
const MR = (function () {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const C = {
    DT: 1 / 120,
    WATER: -0.22,   // уровень воды относительно песка, м
    FLOAT: 1.0,     // глубина, с которой квадроцикл всплывает, м
    STEP: 0.1,
    X0: -30,
    START: -1.3,    // положение центра квадроцикла на старте (линия старта x=0)
    PENALTY: 2.0,   // штраф за фальстарт, с
    IDLE: 0.12,
    WB: 1.45,       // колёсная база
    WR: 0.44,       // радиус колеса
    TLIMIT: 90,
    // «Экстрим»: заглох в воде — мотор сам не заводится
    RESTART: 0.8,   // завести снова (отпустить и нажать газ) можно не раньше, с
    DROWN: 2.0,     // мотор стоит в воде столько — квадроцикл тонет, с
    // кольцо: 4 прохода — верхняя, нижняя, верхняя, нижняя дорожка (2 круга)
    PASSES: [0, 1, 0, 1],
    // лебёдка на крутых выездах из воды
    WINCH_V: 1.0,       // скорость подтягивания в зелёной зоне, м/с
    WINCH_REACH: 4.0,   // зацепить трос можно с расстояния до стенки, м
    WINCH_ZONE: [0.46, 0.74],   // зелёная зона оборотов при работе лебёдкой (до поправки уровня)
    WINCH_HEAT: 5.0,    // как быстро греется мотор при перекруте на лебёдке
    ROLLBACK: 2.6,      // заглох на лебёдке — откат назад в лужу, м
    BREAK_STALLS: 2     // «Экстрим»: столько заглоханий подряд на одной лебёдке — обрыв троса
  };
  // ширина зелёной зоны игрока по уровням: на столько расширяется зона с каждой стороны (боты — без поправки)
  const ZW = { easy: 0.08, normal: 0.04, hard: 0, extreme: 0 };
  // «Экстрим»: резина на заезд. zw — поправка зелёной зоны (в воде и на лебёдке), water — скорость в воде,
  // slope — доля штрафа за подъём, winch — скорость лебёдки, drive — столько заглохов подряд в воде ломают привод (0 — не ломают)
  const TYRES = {
    mudlite: { name: 'MudLite', zw: 0.05, water: 0.92, slope: 1, winch: 1, drive: 0 },
    assassinator: { name: 'Assassinator', zw: -0.04, water: 1.08, slope: 0.6, winch: 1.15, drive: 2 }
  };
  const NO_TYRE = { zw: 0, water: 1, slope: 1, winch: 1, drive: 0 };
  const tyreOf = (r) => r.tyre || NO_TYRE;
  const zwOf = (r) => r.zw + tyreOf(r).zw;

  // равномерное перемешивание (Фишер — Йейтс); sort(() => rnd() - 0.5) даёт перекос
  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- Трасса ---------- */
  function makeTrack(seed) {
    const rnd = rng(seed), R = (a, b) => a + (b - a) * rnd();
    const WALL = 1.7, TOP = 0.55, PLAT = 1.8, DOWN = 1.0;   // PLAT + DOWN < 3 м — меньше самой короткой перемычки   // стенка выезда: длина подъёма, высота, площадка, спуск
    const baths = [], gaps = [];
    let x = 5.5;
    for (let i = 0; i < 3; i++) {
      const L = Math.round(R(30, 36));
      baths.push({ x0: x, x1: x + L });
      x += L;
      if (i < 2) {
        const g = Math.round(R(3, 5) * 2) / 2;
        gaps.push({ x0: x, x1: x + g });
        x += g;
      }
    }
    const finish = x + 7;
    const end = finish + 45;
    const n = Math.ceil((end - C.X0) / C.STEP) + 1;
    const lanes = [], winches = [];
    for (let l = 0; l < 2; l++) {
      // крутые выезды: 1–2 из трёх ванн на каждой дорожке
      const order = [0, 1, 2];
      for (let i = 2; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
      const steep = order.slice(0, rnd() < 0.5 ? 1 : 2).sort();
      const feats = [];
      baths.forEach((b) => {
        const f = { b, base: R(0.62, 0.82), g: [] };
        const np = rnd() < 0.55 ? 2 : 1;
        const used = [];
        for (let k = 0; k < np; k++) {
          let c, tries = 0;
          do { c = R(b.x0 + 7, b.x1 - 8); tries++; } while (used.some((u) => Math.abs(u - c) < 7) && tries < 30);
          used.push(c);
          f.g.push({ c, s: R(1.6, 2.8), a: R(0.5, 0.75) });      // яма
        }
        let c, tries = 0;
        do { c = R(b.x0 + 6, b.x1 - 7); tries++; } while (used.some((u) => Math.abs(u - c) < 6) && tries < 30);
        f.g.push({ c, s: R(1.8, 3.0), a: -R(0.3, 0.42) });        // отмель
        feats.push(f);
      });
      const h = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const xx = C.X0 + i * C.STEP;
        let y = 0;
        for (const f of feats) {
          const b = f.b;
          if (xx > b.x0 && xx < b.x1) {
            let dpt = f.base;
            for (const g of f.g) dpt += g.a * Math.exp(-((xx - g.c) ** 2) / (2 * g.s * g.s));
            dpt = Math.max(0.3, dpt);
            const env = Math.min(smooth((xx - b.x0) / 2.4), smooth((b.x1 - xx) / 3.2));
            y = -dpt * env;
          }
        }
        let onWall = false;
        for (const bi of steep) {
          const b = baths[bi], f = feats[bi], w0 = b.x1 - WALL;
          if (xx < w0 - 0.6 || xx > b.x1 + PLAT + DOWN) continue;
          onWall = true;
          if (xx < w0) y = Math.min(y, -f.base * 0.9);                                   // дно перед стенкой не мелеет
          else if (xx < b.x1) y = lerp(-f.base, TOP, smooth((xx - w0) / WALL));          // крутой подъём
          else if (xx < b.x1 + PLAT) y = TOP;                                             // площадка со столбиком
          else y = lerp(TOP, 0, smooth((xx - b.x1 - PLAT) / DOWN));                        // спуск на песок
        }
        for (const g of gaps) {
          if (onWall) break;
          const c = (g.x0 + g.x1) / 2, s = (g.x1 - g.x0) / 3.2;
          y += 0.3 * Math.exp(-((xx - c) ** 2) / (2 * s * s));
        }
        y += 0.16 * Math.exp(-((xx - (baths[0].x0 - 1.1)) ** 2) / (2 * 0.8 * 0.8));
        h[i] = y;
      }
      lanes.push({ h, n });
      // лебёдка: x0 — дальше без троса не проехать, x1 — квадроцикл наверху, post — столбик
      winches.push(steep.map((bi) => {
        const b = baths[bi];
        return { id: l * 3 + bi, bath: bi, x0: b.x1 - WALL - 0.75, x1: b.x1 + 0.05, post: b.x1 + 1.65 };   // наверху бампер не доходит до столбика
      }));
    }
    return { seed, baths, gaps, finish, end, lanes, winches };
  }

  function hAt(lane, x) {
    const f = (x - C.X0) / C.STEP;
    const i = Math.floor(f);
    if (i < 0) return lane.h[0];
    if (i >= lane.n - 1) return lane.h[lane.n - 1];
    const t = f - i;
    return lane.h[i] * (1 - t) + lane.h[i + 1] * t;
  }
  function bathAt(track, x) {
    for (let i = 0; i < 3; i++) { const b = track.baths[i]; if (x >= b.x0 && x <= b.x1) return i; }
    return -1;
  }
  function depthAt(track, l, x) {
    if (bathAt(track, x) < 0) return 0;
    return Math.max(0, C.WATER - hAt(track.lanes[l], x));
  }
  function groundAt(track, l, x) {
    const h = hAt(track.lanes[l], x);
    if (bathAt(track, x) < 0) return h;
    return Math.max(h, C.WATER - C.FLOAT);
  }
  function nextBathDist(track, x) {
    for (let i = 0; i < 3; i++) { const b = track.baths[i]; if (b.x0 >= x) return b.x0 - x; }
    return 1e9;
  }
  function zone(d, w) {
    w = w || 0;
    if (d <= 0.02) return [Math.max(C.IDLE + 0.05, 0.55 - w), 1.0];
    return [Math.max(C.IDLE + 0.05, lerp(0.52, 0.36, d) - w), Math.min(1, lerp(0.88, 0.60, d) + w)];
  }
  function winchZone(w) {
    w = w || 0;
    return [C.WINCH_ZONE[0] - w, Math.min(0.97, C.WINCH_ZONE[1] + w)];
  }

  /* ---------- Гонщик / физика ---------- */
  function newRider() {
    return {
      x: C.START, v: 0, y: 0, vy: 0, fly: false, air: false,
      rpm: C.IDLE, heat: 0, dig: 0, cut: 0, go: false, fin: false, time: 0,
      lo: 0.55, hi: 1, d: 0, depth: 0, spin: false, float: false,
      wheel: 0, pitch: 0, entered: [false, false, false], ev: [],
      top: 0, react: null, clean: 0, floods: 0, heats: 0, gas: false,
      extreme: false, dead: false, deadT: 0, prevGas: false, drowned: false, sinkT: 0,
      zw: 0,                                   // поправка ширины зелёной зоны (уровень)
      spot: null, cable: false, atTop: false,  // лебёдка: ближайший выезд, трос зацеплен, наверху
      roll: 0, winchStalls: 0, broken: false, done: {}, blocked: false, winches: 0, wstalls: 0,
      tyre: null, waterStalls: 0, driveOut: false   // «Экстрим»: резина, заглохи подряд в воде, сломан привод
    };
  }

  function stepRider(r, track, l, gas, dt, t) {
    // утонул: только медленно уходит под воду
    if (r.drowned) {
      r.sinkT += dt; r.v = 0; r.gas = false; r.spin = false;
      r.rpm = Math.max(C.IDLE, r.rpm - dt);
      if (r.sinkT < 2.5) r.y -= 0.45 * dt;
      r.pitch += (0.18 - r.pitch) * Math.min(1, dt * 2);
      return;
    }
    // привод сломан: стоит в воде, мотор глохнет
    if (r.driveOut) {
      r.v = 0; r.gas = false; r.spin = false;
      r.rpm = Math.max(C.IDLE, r.rpm - dt);
      return;
    }
    const pressed = gas, fresh = pressed && !r.prevGas;
    r.prevGas = pressed;
    const depth = depthAt(track, l, r.x);
    const d = clamp(depth / C.FLOAT, 0, 1);
    r.d = d; r.depth = depth; r.float = depth > C.FLOAT;
    if (d <= 0.02 && !r.dead) r.waterStalls = 0;     // выехал из воды — счёт заглохов подряд сначала
    const ty = tyreOf(r);
    if (r.dead) {
      // «Экстрим»: заглох в воде — завести можно только новым нажатием газа
      r.deadT += dt; r.cut = 1; gas = false;
      if (r.deadT >= C.RESTART && fresh) {
        r.dead = false; r.cut = 0; r.ev.push({ t: 'restart' });
      } else if (d > 0.02 && r.deadT >= C.DROWN) {
        r.dead = false; r.cut = 0; r.drowned = true; r.sinkT = 0; r.v = 0;
        r.ev.push({ t: 'drown' });
        return;
      } else if (d <= 0.02 && r.deadT >= 1.6) {
        r.dead = false; r.cut = 0;   // выкатился из воды — заводится как обычно
      }
    } else if (r.cut > 0) { r.cut -= dt; gas = false; }
    if (r.fin) gas = false;
    r.gas = gas;
    // ближайший ещё не пройденный выезд с лебёдкой
    const ws = track.winches ? track.winches[l] : null;
    r.spot = null;
    if (ws) for (const sp of ws) if (!r.done[sp.id] && r.x > sp.x0 - 12 && r.x <= sp.x1 + 0.01) { r.spot = sp; break; }
    if (r.spot && r.cable && r.go) { winchStep(r, track, l, gas, dt); return; }
    const z = zone(d, zwOf(r)), lo = z[0], hi = z[1];
    r.lo = lo; r.hi = hi;

    if (gas) r.rpm += (r.air ? 1.5 : 0.9) * dt; else r.rpm -= 0.8 * dt;
    r.rpm = clamp(r.rpm, C.IDLE, 1);

    if (!r.go) { r.v = 0; r.spin = false; return; }

    const over = Math.max(0, r.rpm - hi);
    let eff;
    if (r.rpm < lo) eff = 0.88 * clamp((r.rpm - C.IDLE) / (lo - C.IDLE), 0, 1);
    else if (r.rpm <= hi) eff = 0.88 + 0.12 * (r.rpm - lo) / (hi - lo);
    else eff = Math.max(0.3, 1 - over * 4.5);

    const inWater = d > 0.02;
    if (!r.air) {
      r.spin = over > 0;
      if (over > 0) {
        if (inWater) r.dig = Math.min(1, r.dig + over * 3.5 * dt);
        r.heat += (0.10 + over * 2.5) * dt;
      } else {
        r.dig = Math.max(0, r.dig - 0.9 * dt);
        r.heat = Math.max(0, r.heat - 0.11 * dt);
      }
      if (r.heat >= 1 && r.cut <= 0 && !r.dead && !r.fin) {
        r.heat = 0.6; r.heats++;
        if (r.extreme && inWater) { r.dead = true; r.deadT = 0; r.cut = 1; r.waterStalls++; }
        else r.cut = 1.6;
        r.ev.push({ t: 'overheat', dead: r.dead, n: r.waterStalls });
        if (r.dead && ty.drive && r.waterStalls >= ty.drive) {      // Assassinator: привод не выдержал
          r.dead = false; r.driveOut = true; r.v = 0;
          r.ev.push({ t: 'drive' });
          return;
        }
      }
      const gF = groundAt(track, l, r.x + 0.6), gR = groundAt(track, l, r.x - 0.6);
      const slope = (gF - gR) / 1.2;
      let vmax = inWater ? lerp(10.5, 4.6, Math.pow(d, 0.8)) * ty.water : 15;
      if (slope > 0) vmax *= 1 - 0.45 * ty.slope * Math.min(1, slope / 0.5);
      const vt = vmax * eff * (1 - 0.45 * r.dig);
      let a;
      if (vt > r.v) a = Math.min((vt - r.v) * (inWater ? 1.8 : 1.2), inWater ? 5.5 : 7.5);
      else a = (vt - r.v) * (inWater ? 1.0 + 1.8 * d : 0.45);
      if (!r.float) a -= 9.8 * slope / Math.hypot(1, slope) * 0.55;
      if (r.fin) a -= 7;
      r.v += a * dt;
      if (gas && r.rpm > 0.3 && r.v < 0.9) r.v = 0.9;
    } else {
      r.spin = false;
    }
    if (r.v < 0) r.v = 0;
    if (r.v > r.top) r.top = r.v;

    /* продольное и вертикальное движение */
    r.x += r.v * dt;
    if (r.spot && !r.cable && r.x > r.spot.x0) {          // крутой выезд: без лебёдки не подняться
      r.x = r.spot.x0;
      if (r.v > 0.5) r.ev.push({ t: 'bump', p: r.v });
      r.v = 0; r.blocked = true;
    } else if (!r.spot) r.blocked = false;
    const g2 = groundAt(track, l, r.x);
    if (r.fly) {
      r.vy -= 9.8 * dt;
      r.y += r.vy * dt;
      if (r.y <= g2) {
        const impact = -r.vy;
        r.y = g2; r.fly = false; r.vy = 0;
        if (impact > 1.6) r.ev.push({ t: 'land', p: impact });
      }
    } else {
      const nvy = (g2 - r.y) / dt;
      if (nvy < r.vy - 9.8 * dt * 1.6 && r.v > 2.5) {
        r.fly = true;
        r.vy = Math.min(r.vy, 6) - 9.8 * dt;
        r.y += r.vy * dt;
        if (r.y < g2) { r.y = g2; r.fly = false; r.vy = nvy; }
      } else { r.y = g2; r.vy = clamp(nvy, -12, 12); }
    }
    r.air = r.fly && (r.y - g2 > 0.05);

    /* вход в воду */
    const bi = bathAt(track, r.x);
    if (bi >= 0 && !r.entered[bi] && !r.air) {
      const dep = depthAt(track, l, r.x);
      if (dep > 0.1) {
        r.entered[bi] = true;
        const zz = zone(clamp(dep / C.FLOAT, 0, 1), zwOf(r));
        let kind;
        if (r.rpm > zz[1] + 0.02) { kind = 'flood'; r.v *= 0.74; r.heat = Math.min(0.97, r.heat + 0.12); r.floods++; }
        else if (r.rpm >= zz[0] - 0.06) { kind = 'clean'; r.v *= 0.94; r.clean++; }
        else { kind = 'soft'; r.v *= 0.87; }
        r.ev.push({ t: 'entry', kind, p: r.v });
      }
    }

    /* наклон корпуса и вращение колёс */
    let pt;
    if (r.air) pt = clamp(r.vy * 0.05, -0.3, 0.22);
    else pt = Math.atan2(groundAt(track, l, r.x + C.WB / 2) - groundAt(track, l, r.x - C.WB / 2), C.WB);
    r.pitch += (pt - r.pitch) * Math.min(1, dt * 12);
    r.wheel += ((r.spin || r.air ? Math.max(r.v, r.rpm * 22) : r.v) / C.WR) * dt;

    if (!r.fin && r.x >= track.finish) {
      r.fin = true;
      r.time = t - (r.x - track.finish) / Math.max(r.v, 0.5);
    }
  }

  /* ---------- лебёдка ---------- */
  // трос зацеплен: квадроцикл тянет лебёдка, скорость зависит от оборотов.
  // В зелёной зоне — тянет, ниже — сползает обратно, выше — мотор греется и глохнет (откат в лужу).
  function winchStep(r, track, l, gas, dt) {
    const sp = r.spot;
    const z = winchZone(zwOf(r)), lo = z[0], hi = z[1], wv = C.WINCH_V * tyreOf(r).winch;
    r.lo = lo; r.hi = hi;
    if (r.cut > 0 || r.atTop) gas = r.atTop ? gas : false;
    if (r.cut > 0) r.cut -= dt;
    r.gas = gas;
    if (gas) r.rpm += 0.9 * dt; else r.rpm -= 0.8 * dt;
    r.rpm = clamp(r.rpm, C.IDLE, 1);
    r.d = clamp(depthAt(track, l, r.x) / C.FLOAT, 0, 1); r.depth = depthAt(track, l, r.x);
    let v = 0;
    if (r.atTop) {
      v = 0;                                                   // наверху: держит трос, ждём отцепления
      r.heat = Math.max(0, r.heat - 0.2 * dt);
    } else if (r.roll > 0) {
      v = -3.2;                                                // откат после заглохания
      if (r.x <= r.roll) { r.roll = 0; v = 0; }
    } else if (r.cut > 0) {
      v = 0;
    } else {
      const over = Math.max(0, r.rpm - hi);
      if (r.rpm < lo) v = C.WINCH_V * (0.75 * (r.rpm - C.IDLE) / (lo - C.IDLE) - 0.35);   // мало оборотов — сползает
      else v = wv * (over > 0 ? Math.max(0.35, 1 - over * 3) : 1);
      if (over > 0) r.heat += (0.35 + over * C.WINCH_HEAT) * dt;
      else r.heat = Math.max(0, r.heat - 0.25 * dt);
      if (r.heat >= 1) {                                       // перекрутил — заглох, трос ослаб, откат
        r.heat = 0.55; r.cut = 1.6; r.heats++; r.wstalls++; r.winchStalls++;
        r.roll = Math.max(sp.x0 - C.ROLLBACK, r.x - C.ROLLBACK);
        r.ev.push({ t: 'winchstall', n: r.winchStalls });
        if (r.extreme && r.winchStalls >= C.BREAK_STALLS) { r.broken = true; r.ev.push({ t: 'break' }); }
      }
    }
    r.v = Math.max(0, v);
    r.x += v * dt;
    if (r.x >= sp.x1 && !r.atTop) { r.x = sp.x1; r.atTop = true; r.winchStalls = 0; r.ev.push({ t: 'top' }); }
    r.spin = !r.atTop && gas && r.rpm > lo;
    r.y = groundAt(track, l, r.x); r.vy = 0; r.fly = false; r.air = false;
    const pt = Math.atan2(groundAt(track, l, r.x + C.WB / 2) - groundAt(track, l, r.x - C.WB / 2), C.WB);
    r.pitch += (pt - r.pitch) * Math.min(1, dt * 10);
    r.wheel += (Math.abs(v) / C.WR) * dt;
  }
  /* зацепить / отцепить трос — тап по столбику. Возвращает, что произошло. */
  function winchTap(r) {
    const sp = r.spot;
    if (!sp || r.fin || r.drowned || r.broken || r.driveOut) return 'none';
    if (!r.cable) {
      if (r.air || r.x < sp.x0 - C.WINCH_REACH) return 'far';
      r.cable = true; r.atTop = false; r.roll = 0; r.winchStalls = 0; r.v = 0; r.winches++;
      return 'attach';
    }
    if (!r.atTop) return 'busy';
    r.cable = false; r.atTop = false; r.done[sp.id] = true; r.spot = null; r.v = 0; r.blocked = false;
    return 'detach';
  }

  /* ---------- соперники (ИИ) ---------- */
  // skill 0..1; rnd — свой генератор у каждого бота; extreme — бот тоже может утонуть и оборвать трос
  function makeAI(skill, rnd, extreme) {
    const s = clamp(skill + (rnd() - 0.5) * 0.12, 0.05, 1);
    return {
      skill: s, rnd, pass: 0, n: 0, nT: 0, nt: 0, w: null, stalls: 0,
      react: 0.17 + rnd() * 0.42 * (1.25 - s),
      aim: 0.42 + 0.42 * s,                  // куда в зелёной зоне целится
      amp: 0.17 - 0.13 * s,                  // разброс газа
      fs: rnd() < 0.05 * (1 - s),
      careful: rnd() < 0.35 + 0.6 * s,       // сбрасывает газ перед водой
      restartAt: C.RESTART + 0.1 + rnd() * 0.5,
      // «Экстрим»: изредка перекручивает в воде, глохнет и не успевает завестись
      sink: extreme && rnd() < 0.06 * (1.15 - s) ? { pass: Math.floor(rnd() * 4), bath: Math.floor(rnd() * 3) } : null
    };
  }
  // решение бота на кадр: { gas, tap } (tap — тап по столбику лебёдки)
  function aiStep(ai, r, track, t, dt) {
    const rnd = ai.rnd, none = { gas: false, tap: false };
    if (!r.go || t < (ai.fs ? 0 : ai.react)) return none;
    ai.nt -= dt;
    if (ai.nt <= 0) { ai.nt = 0.25 + rnd() * 0.5; ai.nT = (rnd() * 2 - 1) * ai.amp; }
    ai.n += (ai.nT - ai.n) * Math.min(1, dt * 6);
    const sinkNow = !!ai.sink && ai.sink.pass === ai.pass;
    if (r.dead) return { gas: !sinkNow && r.deadT >= ai.restartAt, tap: false };
    const sp = r.spot;
    if (sp && (r.cable || r.x >= sp.x0 - 0.6)) {
      if (!ai.w || ai.w.id !== sp.id) {
        // на каждой лебёдке: пауза до тапа, сколько раз перекрутит (ошибки), пауза наверху
        const mist = rnd() < 0.25 * (1.1 - ai.skill) ? (rnd() < 0.3 ? 2 : 1) : 0;
        ai.w = { id: sp.id, wait: 0.2 + rnd() * 0.6 * (1.2 - ai.skill), mist, top: 0.25 + rnd() * 0.7 * (1.2 - ai.skill) };
      }
      const w = ai.w;
      if (!r.cable) { w.wait -= dt; return { gas: false, tap: w.wait <= 0 }; }
      if (r.atTop) { w.top -= dt; return { gas: false, tap: w.top <= 0 }; }
      if (r.wstalls !== ai.stalls) { ai.stalls = r.wstalls; if (w.mist > 0) w.mist--; }
      if (r.cut > 0 || r.roll > 0) return none;
      const target = w.mist > 0 ? 1 : r.lo + (r.hi - r.lo) * ai.aim + ai.n * 0.6;
      return { gas: r.rpm < target, tap: false };
    }
    if (sinkNow && bathAt(track, r.x) === ai.sink.bath && r.d > 0.3) return { gas: true, tap: false };
    let target = r.lo + (r.hi - r.lo) * ai.aim + ai.n;
    if (sp && r.x > sp.x0 - 3) target = Math.min(target, r.lo);          // подъезжает к стенке — сбрасывает
    if (r.d <= 0.02 && ai.careful) {
      const dist = nextBathDist(track, r.x);
      if (dist < Math.max(2.2, r.v * 0.32)) target = Math.min(target, 0.8 + ai.n * 0.5);
    }
    if (r.air) target = Math.min(target, ai.careful ? 0.7 : 0.95);
    return { gas: r.rpm < target, tap: false };
  }

  return { C, ZW, TYRES, clamp, lerp, smooth, rng, shuffle, makeTrack, hAt, bathAt, depthAt, groundAt, nextBathDist, zone, winchZone,
    newRider, stepRider, winchTap, makeAI, aiStep };
})();
if (typeof module !== 'undefined') module.exports = MR;
