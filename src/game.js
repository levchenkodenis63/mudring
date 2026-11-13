'use strict';
/* ===== MUD RING — кольцевая гонка: состояния, интерфейс, ввод ===== */
(function () {
  const C = MR.C;
  const cv = document.getElementById('game'), ov = document.getElementById('overlay');
  RN.init(cv);
  window.addEventListener('resize', () => RN.resize());

  /* ---------- состояние ---------- */
  const LOOKS = [
    { body: '#e2661c', body2: '#f2913c', accent: '#ff8a3d', rack: '#2a2a30', stripe: '#f4f1e6', jersey: '#f4f1e6', jersey2: '#e2661c', pants: '#1d1f27', helmet: '#1c1c22', helmet2: '#ff7a1f', snorkel: '#2b2b31' },
    { body: '#1f3f7a', body2: '#2e59a8', accent: '#4f7fe0', rack: '#24262e', stripe: '#eae7dd', jersey: '#2e59a8', jersey2: '#eae7dd', pants: '#1b1d24', helmet: '#15161b', helmet2: '#4f7fe0', snorkel: '#232328' },
    { body: '#9d1f22', body2: '#c22b2f', accent: '#e0393c', rack: '#2a2a30', stripe: '#1a1a1f', jersey: '#c22b2f', jersey2: '#1a1a1f', pants: '#20222a', helmet: '#121216', helmet2: '#e0393c', snorkel: '#2b2b31' },
    { body: '#5d6b3a', body2: '#78894b', accent: '#a8bf63', rack: '#24261f', stripe: '#2a2c24', jersey: '#78894b', jersey2: '#d8d3b6', pants: '#23251d', helmet: '#1a1c17', helmet2: '#a8bf63', snorkel: '#282a22' },
    { body: '#e0b418', body2: '#f2cf46', accent: '#ffd94a', rack: '#2a2a30', stripe: '#1b1b20', jersey: '#f2cf46', jersey2: '#1b1b20', pants: '#1e1f26', helmet: '#17171b', helmet2: '#ffd94a', snorkel: '#2b2b31' },
    { body: '#e3e0d5', body2: '#f6f4ec', accent: '#ff6a1f', rack: '#2a2a30', stripe: '#ff6a1f', jersey: '#f6f4ec', jersey2: '#ff6a1f', pants: '#1c1e26', helmet: '#17171b', helmet2: '#ff6a1f', snorkel: '#e3e0d5' },
    { body: '#26413c', body2: '#37635a', accent: '#52a396', rack: '#202423', stripe: '#d6d2c2', jersey: '#37635a', jersey2: '#d6d2c2', pants: '#1c2220', helmet: '#151917', helmet2: '#52a396', snorkel: '#232827' },
    { body: '#6c2a72', body2: '#8d3a95', accent: '#c063cb', rack: '#262130', stripe: '#e8dceb', jersey: '#8d3a95', jersey2: '#e8dceb', pants: '#221d28', helmet: '#191420', helmet2: '#c063cb', snorkel: '#2a2331' }
  ];
  const LOOK = LOOKS[0];
  const NAMES = ['Болотный', 'Дизель', 'Профессор', 'Барс', 'Механик', 'Шторм', 'Тапок', 'Кувалда', 'Вихрь', 'Гряземес', 'Сапёр', 'Боцман'];
  const SKILL = { easy: [0.10, 0.40], normal: [0.36, 0.72], hard: [0.66, 1.0], extreme: [0.66, 1.0] };
  const BOTS = 7, GRID = 1.7;     // соперников и шаг стартовой сетки, м
  const DIFFNAME = { easy: 'Новички', normal: 'Любители', hard: 'Профи', extreme: 'Экстрим' };
  const TIME_LIMIT = 900;         // больше 15 минут — заезд снят
  const G = {
    screen: 'menu', track: null, lanes: [null, null], lane: 0, pass: 0, me: null,
    t: 0, pre: 0, lights: 0, lightA: 0, started: false, pen: 0, fs: false,
    particles: [], splats: [], msgs: [], diff: 'normal', laps: [], endT: 0, ended: false, failWhy: '',
    bots: [], place: 0, split: null
  };
  window.__MRG = G;
  const isExtreme = () => G.diff === 'extreme';

  /* ---------- ввод ---------- */
  const input = { gas: false };
  const dbg = { auto: false };
  window.__auto = (v) => { dbg.auto = v; };
  const GASKEYS = ['ArrowUp', 'KeyW', 'Space', 'KeyD', 'ArrowRight'];
  const typing = (e) => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (GASKEYS.includes(e.code) || e.code === 'ArrowDown' || e.code === 'KeyS') e.preventDefault();
    if (GASKEYS.includes(e.code)) input.gas = true;
    if (e.code === 'KeyE' && !e.repeat) winchAction();                 // лебёдка с клавиатуры
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { const b = ov.querySelector('.btn.primary'); if (b) b.click(); }
  });
  addEventListener('keyup', (e) => { if (GASKEYS.includes(e.code)) input.gas = false; });
  addEventListener('blur', () => { input.gas = false; });
  // тап по столбику — лебёдка, в остальное место экрана — газ
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (hitPost(e.clientX, e.clientY)) { winchAction(); return; }
    input.gas = true;
  });
  addEventListener('pointerup', () => { input.gas = false; });
  addEventListener('pointercancel', () => { input.gas = false; });
  if (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches) {
    document.body.classList.add('touch');
  }
  const sndBtn = document.getElementById('snd');
  sndBtn.classList.add('on');
  function firstTouch() { SFX.resume(); }
  addEventListener('pointerdown', firstTouch, { once: false });
  addEventListener('keydown', firstTouch);
  sndBtn.addEventListener('click', (e) => { e.stopPropagation(); SFX.resume(); const on = SFX.toggle(); sndBtn.classList.toggle('muted', !on); });
  const ped = document.getElementById('gasped');
  ped.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.gas = true; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => ped.addEventListener(t, () => { input.gas = false; }));
  // телефон: частые и долгие нажатия не должны выделять текст и открывать меню «Скопировать/Вставить»
  [ped, cv].forEach((el) => {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dragstart', (e) => e.preventDefault());
  });
  document.addEventListener('selectstart', (e) => { if (!typing(e)) e.preventDefault(); });

  /* ---------- утилиты интерфейса ---------- */
  function show(html, cls) { ov.innerHTML = '<div class="panel' + (cls ? ' ' + cls : '') + '">' + html + '</div>'; ov.classList.add('on'); }
  function hide() { ov.classList.remove('on'); if (ov.innerHTML) setTimeout(() => { if (!ov.classList.contains('on')) ov.innerHTML = ''; }, 220); }
  const fmt = (t) => (t === null || t === undefined || !isFinite(t) ? '—' : t.toFixed(2));
  const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escAttr = escHtml;
  function msg(text, col, big) {
    G.msgs.push({ text, col, big: big !== false, life: 1.5, max: 1.5 });
    if (G.msgs.length > 4) G.msgs.shift();
  }

  /* ---------- лебёдка ---------- */
  const me = () => (G.me ? G.me.r : null);
  // по какому столбику сейчас можно тапнуть: зацепить (подъехал к стенке) или отцепить (вытянул наверх)
  function winchCue() {
    const r = me();
    if (!r || !r.spot || G.screen !== 'racing' || G.ended || r.broken || r.drowned) return null;
    const sp = r.spot;
    if (!r.cable && r.x >= sp.x0 - C.WINCH_REACH) return { lane: G.lane, id: sp.id, mode: 'attach', sp };
    if (r.cable && r.atTop) return { lane: G.lane, id: sp.id, mode: 'detach', sp };
    return null;
  }
  function hitPost(cx, cy) {
    const r = me();
    if (!r || !r.spot || G.screen !== 'racing') return false;
    const p = RN.toScreen(G.track, G.lane, r.spot.post, 0.7);
    return Math.hypot(cx - p.X, cy - p.Y) <= p.R * 1.25;
  }
  function winchAction() {
    const r = me();
    if (!r || G.screen !== 'racing' || G.ended) return;
    const res = MR.winchTap(r);
    if (res === 'attach') { msg('ТРОС ЗАЦЕПЛЕН', '#7dffa8', false); SFX.clean(); }
    else if (res === 'detach') { msg('ТРОС ОТЦЕПЛЕН — ВПЕРЁД!', '#7dffa8', false); SFX.ui(); }
    else if (res === 'far') msg('Подъедь ближе к стенке', '#ffd23e', false);
    else if (res === 'busy') msg('Сначала вытяни наверх', '#ffd23e', false);
  }

  /* ---------- таблица рекордов ---------- */
  const REC = { tab: 'local', diff: null, req: 0 };
  const LEVELS = [['easy', 'Новички'], ['normal', 'Любители'], ['hard', 'Профи'], ['extreme', 'Экстрим'], ['all', 'Абсолют']];
  function recRows(list, freshTs, showLevel, start) {
    return list.map((r, i) => {
      i += start || 0;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      const cls = ['top1', 'top2', 'top3'][i] || '';
      const isFresh = !!freshTs && r.ts === freshTs;
      const meta = [];
      if (showLevel && r.d) meta.push(DIFFNAME[r.d] || 'Любители');
      if (r.p) meta.push(r.p + '-е место');
      if (r.b) meta.push('лучший круг ' + Number(r.b).toFixed(2));
      const badge = r.me ? 'это ты' : isFresh ? 'новый' : '';
      return `<div class="rec-row ${cls}${r.me || isFresh ? ' fresh' : ''}">
          <span class="pl">${medal}</span>
          <span class="who"><b>${escHtml(r.n)}</b>${badge ? '<span class="badge">' + badge + '</span>' : ''}
            <span class="meta">${escHtml(meta.join(' · '))}</span></span>
          <span class="tm">${Number(r.t).toFixed(2)}</span>
        </div>`;
    }).join('');
  }
  function recordsScreen(opts) {
    opts = opts || {};
    if (opts.tab) REC.tab = opts.tab;
    if (opts.diff) REC.diff = opts.diff;
    if (!REC.diff) REC.diff = G.diff;
    if (!STORE.online) REC.tab = 'local';
    const diff = REC.diff, abs = diff === 'all', lvl = abs ? 'абсолют' : (DIFFNAME[diff] || '').toLowerCase();
    G.screen = 'records';
    const req = ++REC.req;
    const global = REC.tab === 'global';

    const tabs = `<div class="rec-tabs">${STORE.online ? `<div class="seg" data-rec="tab">
        <button data-v="local" class="${global ? '' : 'on'}">Мои</button>
        <button data-v="global" class="${global ? 'on' : ''}">Все игроки</button></div>` : ''}
      <div class="seg" data-rec="diff">${LEVELS.map(([v, t]) =>
        `<button data-v="${v}" class="${diff === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;

    let kicker, sub, body, note;
    if (!global) {
      const all = STORE.records;
      const list = abs ? all : all.filter((r) => r.d === diff);
      kicker = 'мои рекорды · ' + lvl + (list.length ? ' · лучшее ' + list[0].t.toFixed(2) : '');
      sub = 'время двух кругов · ' + (abs ? `${list.length} из 20` : `результатов: ${list.length}`);
      body = recRows(list, opts.fresh, abs) || `<div class="empty">${all.length ? 'На этом уровне пока нет результатов.' : 'Пока пусто.'}<br>Проедь два круга — результат попадёт сюда.</div>`;
      note = !STORE.persistent ? 'Браузер запретил локальное хранилище: рекорды не сохранятся после перезагрузки.'
        : STORE.online ? 'Твои рекорды хранятся в этом браузере. В общую таблицу уходит лучший результат на каждом уровне.'
        : 'Рекорды хранятся в этом браузере (localStorage).';
    } else {
      kicker = 'общая таблица · ' + lvl;
      sub = 'лучший результат каждого игрока · время двух кругов';
      body = '<div class="empty">Загружаю общую таблицу…</div>';
      note = abs ? 'Абсолют — лучший результат каждого игрока на любом уровне.'
        : 'У каждого игрока здесь одна строка — его лучший результат на этом уровне.';
    }
    show(`
      <div class="kicker" id="rec-kicker">${escHtml(kicker)}</div>
      <h2>Лучшие результаты</h2>
      ${tabs}
      <div class="sub" id="rec-sub">${escHtml(sub)}</div>
      <div class="table" id="rec-table">${body}</div>
      <div class="sub small">${escHtml(note)}</div>
      <div class="rowbtns">
        ${global ? '' : '<button class="btn" id="btn-rec-clear">ОЧИСТИТЬ</button>'}
        <button class="btn primary" id="btn-rec-back">НАЗАД</button>
      </div>
    `, 'records');
    ov.querySelectorAll('[data-rec] button').forEach((b) => b.addEventListener('click', () =>
      recordsScreen(b.parentNode.dataset.rec === 'tab' ? { tab: b.dataset.v } : { diff: b.dataset.v })));
    document.getElementById('btn-rec-back').addEventListener('click', () => { REC.req++; hide(); menu(); });
    const clr = document.getElementById('btn-rec-clear');
    if (clr) clr.addEventListener('click', () => {
      if (clr.dataset.armed === '1') { STORE.clear(); hide(); setTimeout(() => recordsScreen(), 120); return; }
      clr.dataset.armed = '1'; clr.textContent = 'ТОЧНО ОЧИСТИТЬ?'; clr.style.color = '#ff8a6a';
    });

    if (global) {
      // общая таблица грузится страницами по 20 строк: «Показать ещё» внизу списка
      const rows = [];
      let mine = null, count = 0;
      const render = () => {
        const tbl = document.getElementById('rec-table'); if (!tbl) return;
        let html = recRows(rows, null, abs) || `<div class="empty">${abs ? 'Пока никто не записал результат.' : 'На этом уровне ещё никто не записал результат.'}<br>Будь первым!</div>`;
        if (rows.length < count) html += `<button class="btn more" id="btn-rec-more">ПОКАЗАТЬ ЕЩЁ · ${rows.length} из ${count}</button>`;
        if (mine && !rows.some((r) => r.me)) {
          html += `<div class="rec-row fresh"><span class="pl">${mine.rank}</span>
            <span class="who"><b>${escHtml(mine.n)}</b><span class="badge">это ты</span>
              <span class="meta">твоё место${abs && mine.d ? ' · ' + escHtml(DIFFNAME[mine.d] || '') : ''}</span></span>
            <span class="tm">${Number(mine.t).toFixed(2)}</span></div>`;
        }
        const keep = tbl.scrollTop;
        tbl.innerHTML = html;
        tbl.scrollTop = keep;
        const more = document.getElementById('btn-rec-more');
        if (more) more.addEventListener('click', () => {
          more.disabled = true; more.textContent = 'ЗАГРУЖАЮ…';
          load(rows.length);
        });
      };
      const load = (offset) => {
        const p = offset ? STORE.globalTop(diff, offset) : STORE.syncBest().then(() => STORE.globalTop(diff));
        return p.then((res) => {
          if (req !== REC.req || G.screen !== 'records') return;
          const tbl = document.getElementById('rec-table'); if (!tbl) return;
          if (!res.ok) {
            if (offset) { const more = document.getElementById('btn-rec-more'); if (more) { more.disabled = false; more.textContent = 'НЕ ЗАГРУЗИЛОСЬ · ЕЩЁ РАЗ'; } return; }
            tbl.innerHTML = `<div class="empty">Не удалось загрузить общую таблицу${res.error === 'timeout' ? ' (сервер не ответил)' : ''}.<br>Проверь интернет и попробуй ещё раз.</div>`;
            return;
          }
          if (offset && res.offset !== offset) { count = rows.length; render(); return; }
          rows.length = offset;
          rows.push(...res.top);
          count = res.count;
          mine = res.mine || (rows.some((r) => r.me) ? null : mine);
          render();
          const sb = document.getElementById('rec-sub');
          if (sb) sb.textContent = `лучший результат каждого игрока · игроков: ${res.count}`;
          const k = document.getElementById('rec-kicker');
          if (k && rows.length) k.textContent = 'общая таблица · ' + lvl + ' · рекорд ' + Number(rows[0].t).toFixed(2);
        });
      };
      load(0);
    }
  }

  /* ---------- меню ---------- */
  function menu() {
    if (window.__mrUpdate && window.__mrReload) { window.__mrReload(); return; }   // вышла новая версия (PWA)
    G.screen = 'menu'; G.lights = 0;
    STORE.syncBest();
    G.track = MR.makeTrack(1);
    G.lanes = [null, null]; G.me = null;
    RN.view.cam = -1.3;
    show(`
      <h1 class="logo">MUD<span>RING</span></h1>
      <div class="sub">квадроспорт · кольцевая гонка с водными препятствиями</div>
      <div class="rules">
        <div class="rule"><b>2 круга</b> по трассе из грязевых ванн: верхняя дорожка → нижняя → верхняя → нижняя. Побеждает время.</div>
        <div class="rule"><b>Лебёдка на крутых выездах.</b> Тапни по столбику — трос зацеплен, газом в зелёной зоне вытягивай наверх, тапни ещё раз — отцепи.</div>
        <div class="rule"><b>Перекрутил на лебёдке</b> — мотор глохнет, квадроцикл откатывается в лужу. В воде газ тоже держи в зелёной зоне.</div>
      </div>
      <div class="namefield"><span>Твоё имя</span>
        <input id="pname" type="text" maxlength="14" autocomplete="off" spellcheck="false"
               placeholder="Гонщик" value="${escAttr(STORE.name || '')}">
        <div class="hint-line"><span>до 14 символов · попадёт в таблицу рекордов</span></div>
      </div>
      <div class="opts">
        <div class="opt"><span>Уровень</span>
          <div class="seg" data-opt="d"><button data-v="easy">Новички</button><button data-v="normal">Любители</button><button data-v="hard">Профи</button><button data-v="extreme">Экстрим</button></div>
        </div>
      </div>
      <div class="sub small" id="lvl-note"></div>
      <div class="rowbtns">
        <button class="btn" id="btn-records">РЕЗУЛЬТАТЫ</button>
        <button class="btn primary" id="btn-start">СТАРТ</button>
      </div>
      <div class="install" id="install"></div>
      <div class="keys">Газ: <kbd>↑</kbd> <kbd>W</kbd> или <kbd>Space</kbd> (удерживай) · лебёдка: тап по столбику или <kbd>E</kbd> · <kbd>Enter</kbd> — далее</div>
    `);
    const note = document.getElementById('lvl-note');
    const NOTES = {
      easy: 'Широкая зелёная зона — привыкнуть к воде и лебёдке.',
      normal: 'Зелёная зона поуже.',
      hard: 'Узкая зелёная зона в воде и на лебёдке.',
      extreme: 'Как «Профи», плюс: заглох в воде — заводи сам (отпусти и нажми газ), иначе утонешь; заглох на лебёдке два раза подряд — обрыв троса. Тогда время не засчитывается.'
    };
    const seg = ov.querySelector('.seg[data-opt="d"]');
    const sync = () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === G.diff));
      note.textContent = NOTES[G.diff];
    };
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { G.diff = b.dataset.v; sync(); }));
    sync();
    const nameInp = document.getElementById('pname');
    nameInp.addEventListener('change', () => { STORE.name = nameInp.value; nameInp.value = STORE.name; });
    nameInp.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); STORE.name = nameInp.value; nameInp.value = STORE.name; nameInp.blur(); startFlow(); }
    });
    document.getElementById('btn-records').addEventListener('click', () => { STORE.name = nameInp.value; recordsScreen(); });
    document.getElementById('btn-start').addEventListener('click', () => { STORE.name = nameInp.value; nameInp.value = STORE.name; startFlow(); });
    installLine();
  }

  /* ---------- установка как приложение (PWA, только в сборке на https) ---------- */
  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; installLine(); });
  addEventListener('appinstalled', () => { installEvt = null; installLine(); });
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function installLine() {
    const el = document.getElementById('install');
    if (!el) return;
    const pwa = !!document.querySelector('link[rel="manifest"]') && location.protocol === 'https:';
    if (!pwa || standalone() || (!installEvt && !isIOS())) { el.innerHTML = ''; return; }
    el.innerHTML = `<button class="instbtn" id="btn-install">📲 ${installEvt ? 'Установить игру как приложение' : 'Как установить игру на iPhone'}</button>`;
    document.getElementById('btn-install').addEventListener('click', () => {
      if (installEvt) {
        const ev = installEvt;
        ev.prompt();
        ev.userChoice.finally(() => { installEvt = null; installLine(); });
      } else {
        el.innerHTML = '<div class="insthint">В <b>Safari</b> нажми «Поделиться» <span class="ico">⬆︎</span> внизу экрана → ' +
          '<b>«На экран „Домой“»</b>. Игра появится иконкой и будет открываться на весь экран, даже без интернета.' +
          ' <a href="install.html#ios" target="_blank">Инструкция с картинками →</a></div>';
      }
    });
  }

  /* ---------- «Экстрим»: вопрос по регламенту ---------- */
  // вопросы — questions.json; в сборке встроены в <script id="mr-questions">
  let QUESTIONS = null;
  function loadQuestions() {
    if (QUESTIONS) return Promise.resolve(QUESTIONS);
    const el = document.getElementById('mr-questions');
    const ok = (list) => Array.isArray(list) ? list.filter((q) => q && q.question && Array.isArray(q.answers) &&
      q.answers.length >= 2 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.answers.length) : [];
    try {
      const txt = el ? el.textContent.trim() : '';
      if (txt) return Promise.resolve(QUESTIONS = ok(JSON.parse(txt)));
    } catch (e) { console.warn('questions: bad inline JSON', e); }
    const src = el && el.dataset.src;
    if (!src) return Promise.resolve(QUESTIONS = []);
    return fetch(src).then((r) => r.json()).then((j) => (QUESTIONS = ok(j)))
      .catch((e) => { console.warn('questions: load failed', e); return []; });
  }
  function questionScreen(onPass) {
    G.screen = 'question';
    loadQuestions().then((list) => {
      if (G.screen !== 'question') return;
      if (!list.length) { onPass(); return; }     // вопросов нет — пропускаем
      const q = list[Math.floor(Math.random() * list.length)];
      const order = q.answers.map((_, i) => i).sort(() => Math.random() - 0.5);
      show(`
        <div class="hero-bg"></div>
        <div class="hero-in">
          <div class="hero-top"></div>
          <div class="kicker">Экстрим · допуск к старту</div>
          <h2>Вопрос по регламенту</h2>
          <div class="sub q-text">${escHtml(q.question)}</div>
          <div class="qa">${order.map((i) => `<button data-i="${i}">${escHtml(q.answers[i])}</button>`).join('')}</div>
          <div class="sub small" id="q-res">Ответишь верно — допуск к старту. Ошибёшься — снова на главную.</div>
        </div>
      `, 'hero judge');
      const btns = ov.querySelectorAll('.qa button');
      btns.forEach((b) => b.addEventListener('click', () => {
        if (G.screen !== 'question') return;
        G.screen = 'questionDone';
        const right = +b.dataset.i === q.correct;
        btns.forEach((x) => { x.disabled = true; if (+x.dataset.i === q.correct) x.classList.add('ok'); });
        const res = document.getElementById('q-res');
        if (right) {
          res.innerHTML = '<b style="color:#7dffa8">Верно! Допущен к старту.</b>';
          setTimeout(() => { hide(); setTimeout(onPass, 150); }, 900);
        } else {
          b.classList.add('bad');
          res.innerHTML = '<b style="color:#ff8a6a">Неверно — к старту не допущен.</b>';
          setTimeout(() => { hide(); setTimeout(menu, 150); }, 2200);
        }
      }));
    });
  }

  // старт с главной: на «Экстриме» сначала вопрос по регламенту
  function startFlow() {
    if (isExtreme()) questionScreen(readyScreen); else readyScreen();
  }

  /* ---------- старт ---------- */
  function readyScreen() {
    const seed = 1 + Math.floor(Math.random() * 5);
    G.track = MR.makeTrack(seed);
    G.pass = 0; G.lane = C.PASSES[0]; G.laps = []; G.failWhy = '';
    const r = MR.newRider();
    r.zw = MR.ZW[G.diff]; r.extreme = isExtreme();
    G.me = { r, look: LOOK, name: STORE.name || 'ВЫ', player: true };
    // масстарт: 8 квадроциклов сеткой за стартовой линией, место игрока в сетке — случайное
    const rnd = MR.rng(Date.now() % 1e9), sk = SKILL[G.diff];
    const names = NAMES.slice().sort(() => rnd() - 0.5);
    const slots = []; for (let i = 0; i <= BOTS; i++) slots.push(i);
    slots.sort(() => rnd() - 0.5);
    r.x = C.START - slots[0] * GRID;
    G.bots = [];
    for (let i = 0; i < BOTS; i++) {
      const br = MR.newRider();
      br.zw = MR.ZW[G.diff]; br.extreme = isExtreme(); br.x = C.START - slots[i + 1] * GRID;
      const brnd = MR.rng(Math.floor(rnd() * 1e9) + i);
      G.bots.push({ r: br, ai: MR.makeAI(sk[0] + (sk[1] - sk[0]) * brnd(), brnd, isExtreme()), name: names[i], look: LOOKS[1 + i],
        lane: C.PASSES[0], pass: 0, total: null, out: '', pen: 0 });
    }
    G.place = 0; G.split = null;
    G.lanes = [null, null]; G.lanes[G.lane] = G.me;
    G.pen = 0; G.fs = false; G.t = 0; G.pre = 0; G.lights = 1; G.lightA = 1;
    G.started = false; G.ended = false; G.endT = 0;
    G.particles = []; G.splats = []; G.msgs = [];
    const nW = G.track.winches[0].length * 2 + G.track.winches[1].length * 2;
    show(`
      <div class="hero-bg"></div>
      <div class="hero-in">
        <div class="hero-top"></div>
        <div class="kicker">${escHtml(DIFFNAME[G.diff])} · масстарт ${BOTS + 1} квадроциклов · 2 круга · лебёдок: ${nW}</div>
        <h2>${escHtml(STORE.name ? STORE.name + ', готов?' : 'Готов?')}</h2>
        <div class="sub">Масстарт с <b>верхней дорожки</b>, ты в сетке <b>${slots[0] + 1}-м</b>. Финишная арка — переход на другую дорожку, после четвёртого отрезка — финиш. Соперники — полупрозрачные, столкновений нет. Газ только после зелёного: фальстарт +2.00 с.</div>
        <div class="sub small">${isExtreme()
          ? '<b>Экстрим:</b> заглох в воде — отпусти газ и нажми снова, иначе через ' + C.DROWN + ' с утонешь. Два заглоха подряд на лебёдке — обрыв троса. В обоих случаях время не засчитывается.'
          : 'На крутом выезде без лебёдки не подняться: подъедь к стенке и тапни по столбику (или <kbd>E</kbd>). Наверху тапни ещё раз — отцепи трос.'}</div>
        <button class="btn primary" id="btn-go">ГОТОВ</button>
        <div class="credit">фото: MUD RACING</div>
      </div>
    `, 'hero');
    G.screen = 'ready';
    RN.view.cam = -1.3;
    document.getElementById('btn-go').addEventListener('click', () => {
      hide(); G.screen = 'countdown'; G.pre = 0; G.lights = 1; G.lightA = 1; G.t = 0;
    });
  }
  function startRace() {
    G.started = true; G.t = 0; G.lights = 3; SFX.light(3);
    G.me.r.go = true;
    for (const b of G.bots) { b.r.go = true; b.pen = b.ai.fs ? C.PENALTY : 0; }
    if (G.fs) { G.pen = C.PENALTY; msg('ФАЛЬСТАРТ +2.00', '#ff5a4a', true); RN.view.shake = 0.6; }
    G.screen = 'racing';
  }

  /* ---------- события заезда ---------- */
  function handleEvents(r) {
    for (const ev of r.ev) {
      if (ev.t === 'entry') {
        if (ev.kind === 'clean') { SFX.clean(); msg('ЧИСТО!', '#7dffa8', false); burst(r, 16, 'light'); }
        else if (ev.kind === 'flood') { SFX.flood(); msg('ПЕРЕЛИВ! −25% хода', '#ff7a5a', false); RN.view.shake = 0.45; burst(r, 26, 'mud'); splat(); }
        else { msg('малый газ — тонет', '#ffd23e', false); SFX.splash(r.v); burst(r, 8, 'light'); }
      } else if (ev.t === 'overheat') {
        msg(ev.dead ? 'ЗАГЛОХ! Отпусти газ и жми снова' : 'ЗАГЛОХ! −1.6 с', '#ff5a4a', false);
        RN.view.shake = 0.55; splat(); SFX.overheat(); burst(r, 10, 'dark');
      } else if (ev.t === 'restart') {
        msg('ЗАВЁЛСЯ!', '#7dffa8', false);
      } else if (ev.t === 'drown') {
        SFX.flood(); msg('УТОНУЛ', '#ff5a4a', true); RN.view.shake = 0.8; splat(); burst(r, 30, 'mud');
      } else if (ev.t === 'bump') {
        msg('Крутой выезд — нужна лебёдка!', '#ffd23e', false); RN.view.shake = 0.35; burst(r, 12, 'mud');
      } else if (ev.t === 'winchstall') {
        SFX.overheat(); RN.view.shake = 0.5; splat(); burst(r, 14, 'mud');
        msg(isExtreme() && ev.n === 1 ? 'ЗАГЛОХ НА ЛЕБЁДКЕ! Ещё раз — обрыв троса' : 'ЗАГЛОХ НА ЛЕБЁДКЕ — откат', '#ff5a4a', false);
      } else if (ev.t === 'break') {
        SFX.flood(); RN.view.shake = 1; msg('ОБРЫВ ТРОСА!', '#ff5a4a', true);
      } else if (ev.t === 'top') {
        SFX.ui(); msg('НАВЕРХУ! Отцепи трос', '#7dffa8', false);
      } else if (ev.t === 'land') {
        burst(r, 8, 'light');
      }
    }
    r.ev.length = 0;
  }
  function burst(r, n, kind) {
    for (let i = 0; i < n; i++) {
      const sp = kind === 'mud' ? 5.5 : kind === 'dark' ? 4 : 3.2;
      G.particles.push({
        l: G.lane, x: r.x + (Math.random() - 0.4) * 0.5, y: 0.15 + Math.random() * 0.5,
        vx: -r.v * 0.35 - Math.random() * sp, vy: 1.5 + Math.random() * sp,
        life: 0.45 + Math.random() * 0.55, max: 1, s: 0.025 + Math.random() * 0.06,
        c: kind === 'light' ? 'rgba(238,236,226,.9)' : kind === 'dark' ? 'rgba(70,60,42,.95)' : 'rgba(112,96,62,.95)'
      });
    }
  }
  function splat() {
    G.splats.push({
      x: 0.15 + Math.random() * 0.7, y: 0.2 + Math.random() * 0.55, r: 70 + Math.random() * 110,
      a: 1, c: 'rgba(96,80,52,.92)', seed: Math.random() * 99, drip: 0.9
    });
    if (G.splats.length > 6) G.splats.shift();
  }

  /* ---------- соперники ---------- */
  const SPAN = () => G.track.finish - C.START;
  const progress = (pass, x) => pass * SPAN() + (x - C.START);
  function stepBot(b, dt, t) {
    const r = b.r;
    if (b.total !== null || b.out) return;
    const a = MR.aiStep(b.ai, r, G.track, t, dt);
    if (a.tap) MR.winchTap(r);
    MR.stepRider(r, G.track, b.lane, a.gas, dt, t);
    for (const ev of r.ev) {
      if ((ev.t === 'break' || ev.t === 'drown') && !b.out) {
        b.out = ev.t === 'break' ? 'обрыв троса' : 'утонул';
        if (G.screen === 'racing' && !G.ended) msg(b.name + ': ' + b.out, '#ffd23e', false);
      }
    }
    r.ev.length = 0;
    if (r.fin) {
      if (b.pass < C.PASSES.length - 1) {
        b.pass++; b.ai.pass = b.pass; b.lane = C.PASSES[b.pass];
        r.fin = false; r.x = C.START; r.entered = [false, false, false]; r.done = {};
        r.cable = false; r.atTop = false; r.spot = null; r.roll = 0;
      } else b.total = r.time + b.pen;
    }
    if (!b.out && b.total === null && t > TIME_LIMIT) b.out = 'не уложился';
  }
  // игрок финишировал — оставшиеся соперники доезжают «за кадром»
  function finishBots() {
    let t = G.t;
    while (t < TIME_LIMIT + 1 && G.bots.some((b) => b.total === null && !b.out)) {
      t += C.DT;
      for (const b of G.bots) stepBot(b, C.DT, t);
    }
  }
  // текущие места: финишировавшие по времени, остальные — по пройденной дистанции, сошедшие в конце
  function standings() {
    const r = G.me.r;
    const all = [{ me: true, name: G.me.name, total: G.ended && !G.failWhy ? r.time + G.pen : null, out: G.failWhy ? 'сошёл' : '', prog: progress(G.pass, r.x), look: LOOK }]
      .concat(G.bots.map((b) => ({ me: false, name: b.name, total: b.total, out: b.out, prog: progress(b.pass, b.r.x), look: b.look })));
    const key = (e) => e.out ? 3e6 - e.prog : e.total !== null ? e.total : 1e6 - e.prog;
    return all.sort((a, b) => key(a) - key(b));
  }
  function liveHud() {
    const st = standings(), i = st.findIndex((e) => e.me);
    G.place = i + 1;
    // отрыв в метрах до ближайшего: впереди (если не лидер) или позади (если лидер)
    const mine = st[i].prog, ahead = st.slice(0, i).filter((e) => !e.out && e.total === null).pop();
    const behind = st.slice(i + 1).find((e) => !e.out);
    G.split = ahead ? ahead.prog - mine : behind ? -(mine - behind.prog) : null;
  }

  /* финишная арка: переход на другую дорожку или финиш */
  function passDone(r) {
    if (G.pass === 1) G.laps.push(r.time);                       // конец первого круга
    if (G.pass < C.PASSES.length - 1) {
      G.pass++;
      const next = C.PASSES[G.pass];
      G.lanes = [null, null]; G.lanes[next] = G.me; G.lane = next;
      r.fin = false; r.x = C.START; r.entered = [false, false, false]; r.done = {};
      r.cable = false; r.atTop = false; r.spot = null; r.roll = 0;
      G.particles = [];
      RN.view.cam = r.x;
      msg(G.pass === 2 ? 'КРУГ 2' : 'НИЖНЯЯ ДОРОЖКА', '#fff', true);
      SFX.light(2);
      return;
    }
    G.laps.push(r.time - G.laps[0]);
    G.ended = true; G.endT = 0;
    msg('ФИНИШ ' + (r.time + G.pen).toFixed(2), '#7dffa8', true);
    SFX.finish();
  }

  /* ---------- экраны итогов ---------- */
  function finishScreen() {
    G.screen = 'final';
    const r = G.me.r, total = r.time + G.pen, best = Math.min(...G.laps);
    const ts = Date.now();
    const st = standings(), place = st.findIndex((x) => x.me) + 1, win = st[0];
    const rank = STORE.add({ n: G.me.name, t: total, d: G.diff, b: best, p: place, ts });
    const lvl = DIFFNAME[G.diff];
    const title = place === 1 ? 'ПОБЕДА!' : place <= 3 ? 'ПОДИУМ' : place + ' МЕСТО';
    const col = place === 1 ? '#7dffa8' : place <= 3 ? '#ffd23e' : '#ff8a6a';
    const rows = st.map((x, i) => `<div class="res-row ${x.me ? 'me' : ''} ${i === 0 ? 'win' : ''}">
        <span class="pl">${x.out ? '—' : i + 1}</span><b>${escHtml(x.name)}</b>
        <span class="tot">${x.out ? '<i class="pen">' + escHtml(x.out) + '</i>' : fmt(x.total)}</span>
        <span class="diff">${x.out ? '' : i === 0 ? '🏆' : '+' + (x.total - win.total).toFixed(2)}</span></div>`).join('');
    show(`
      <div class="kicker" style="color:${col}">${title} · ${place} из ${st.length} · ${escHtml(lvl)}</div>
      <h2>${total.toFixed(2)}</h2>
      <div class="sub">время двух кругов: ${fmt(G.laps[0])} + ${fmt(G.laps[1])}${G.pen ? ` · фальстарт +${G.pen.toFixed(2)}` : ''}</div>
      <div class="table final">${rows}</div>
      <div class="sub small">Лебёдок: <b>${r.winches}</b> · заглохов на лебёдке: <b>${r.wstalls}</b> · перегревов: <b>${r.heats}</b> · чистых входов в воду: <b>${r.clean}</b></div>
      ${rank ? `<div class="sub small" style="color:${rank === 1 ? '#7dffa8' : '#ffd23e'}">
        ${rank === 1 ? '🏆 Новый личный рекорд!' : 'Результат записан в таблицу: ' + rank + '-е место.'}
        ${STORE.persistent ? '' : ' (не сохранится — браузер блокирует хранилище)'}</div>` : ''}
      ${STORE.online ? '<div class="sub small" id="net-status">Общая таблица…</div>' : ''}
      <div class="rowbtns">
        <button class="btn" id="btn-rec">РЕКОРДЫ</button>
        <button class="btn primary" id="btn-again">ЕЩЁ РАЗ</button>
      </div>`);
    document.getElementById('btn-again').addEventListener('click', menu);
    document.getElementById('btn-rec').addEventListener('click', () => { hide(); setTimeout(() => recordsScreen({ fresh: ts, tab: 'local', diff: G.diff }), 130); });
    if (STORE.online) {
      const diff = G.diff;
      const top = STORE.records.find((x) => x.d === diff);
      const isBest = !!top && top.ts === ts;
      STORE.syncBest().then((sync) => {
        const st = document.getElementById('net-status');
        if (!st || G.screen !== 'final') return;
        const res = sync.results[diff];
        if (isBest && res && res.ok) {
          st.style.color = res.rank === 1 || res.absRank === 1 ? '#7dffa8' : '';
          st.innerHTML = `🌍 Общая таблица · ${escHtml(lvl)}: <b>${res.rank}-е место</b>` + (res.rank === 1 ? ' — лучший среди всех!' : '') + ` · Абсолют: <b>${res.absRank}-е</b>`;
        } else if (isBest || !sync.ok) {
          st.textContent = 'Нет связи с сервером — результат отправится в общую таблицу позже.';
        } else {
          st.textContent = top ? `В общую таблицу (${lvl}) идёт только твой лучший результат на уровне — ${top.t.toFixed(2)}.` : '';
        }
      });
    }
  }
  function failScreen() {
    G.screen = 'fail';
    const why = G.failWhy === 'break' ? ['Обрыв троса', 'Два раза подряд заглох на лебёдке — трос не выдержал.']
      : G.failWhy === 'drown' ? ['Утонул', 'Мотор заглох в воде и не завёлся за ' + C.DROWN + ' с.']
      : ['Время вышло', 'Заезд длился дольше ' + Math.round(TIME_LIMIT / 60) + ' минут.'];
    show(`
      <div class="hero-bg"></div>
      <div class="hero-in">
        <div class="hero-top"></div>
        <div class="kicker">${escHtml(DIFFNAME[G.diff])} · отрезок ${G.pass + 1} из 4</div>
        <h2>${why[0]}</h2>
        <div class="sub">${why[1]} Время не засчитывается.</div>
        <div class="rowbtns">
          <button class="btn" id="btn-menu">МЕНЮ</button>
          <button class="btn primary" id="btn-again">ЕЩЁ РАЗ</button>
        </div>
      </div>
    `, 'hero fail');
    document.getElementById('btn-menu').addEventListener('click', menu);
    document.getElementById('btn-again').addEventListener('click', () => { hide(); setTimeout(startFlow, 130); });
  }

  /* ---------- обновление ---------- */
  function update(dt) {
    const e = G.me, r = e ? e.r : null;
    if (G.screen === 'countdown') {
      G.pre += dt;
      const L = G.pre < 0.9 ? 1 : G.pre < 1.9 ? 2 : 3;
      if (L !== G.lights) { G.lights = L; SFX.light(L); }
      if (input.gas && !G.started && G.pre > 0.35) G.fs = true;
      if (G.pre >= 1.9) startRace();
      MR.stepRider(r, G.track, G.lane, input.gas, dt, 0);
      r.ev.length = 0;
      for (const b of G.bots) { MR.stepRider(b.r, G.track, b.lane, false, dt, 0); b.r.ev.length = 0; }
    } else if (G.screen === 'racing') {
      if (!G.ended) G.t += dt;
      let gas = input.gas;
      if (dbg.auto) {                       // автопилот для проверок
        gas = r.rpm < r.lo + (r.hi - r.lo) * 0.85;
        const cue = winchCue();
        if (cue && (cue.mode === 'detach' || r.x > cue.sp.x0 - 1)) winchAction();
      }
      MR.stepRider(r, G.track, G.lane, gas, dt, G.t);
      handleEvents(r);
      if (!G.ended) for (const b of G.bots) stepBot(b, dt, G.t);
      if (r.fin && !G.ended) passDone(r);
      if (!G.ended) liveHud();
      if (!r.air && r.depth > 0.05 && r.v > 3 && Math.random() < 0.7) burst(r, 1, 'light');
      if (G.lightA > 0) G.lightA = Math.max(0, G.lightA - dt * 0.7);
      // конец заезда: финиш, обрыв троса, утонул, лимит времени
      if (!G.ended && (r.broken || r.drowned || G.t > TIME_LIMIT)) {
        G.ended = true; G.endT = 0;
        G.failWhy = r.broken ? 'break' : r.drowned ? 'drown' : 'time';
      }
      if (G.ended) {
        G.endT += dt;
        if (G.endT > (G.failWhy ? 1.8 : 1.4)) { if (G.failWhy) failScreen(); else { finishBots(); finishScreen(); } }
      }
    }
    // звук двигателя
    if (r && (G.screen === 'racing' || G.screen === 'countdown')) SFX.engine(r.rpm, r.gas, r.d > 0.02);
    else SFX.engineOff();
    if (ov.classList.contains('on')) ped.classList.remove('show');
    else ped.classList.add('show');
    // камера
    if (r) RN.view.cam += (r.x - RN.view.cam) * Math.min(1, dt * 7);
    // частицы
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt; if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99;
      if (p.y < -0.1) p.life = 0;
    }
    const capP = RN.ppm < 55 ? 220 : 500;
    if (G.particles.length > capP) G.particles.splice(0, G.particles.length - capP);
    for (let i = G.splats.length - 1; i >= 0; i--) { G.splats[i].a -= dt * 0.55; if (G.splats[i].a <= 0) G.splats.splice(i, 1); }
    for (let i = G.msgs.length - 1; i >= 0; i--) { G.msgs[i].life -= dt; if (G.msgs[i].life <= 0) G.msgs.splice(i, 1); }
    RN.view.shake = Math.max(0, RN.view.shake - dt * 2.2);
  }

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    RN.view.dt = dt;
    update(dt);
    const r = G.me ? G.me.r : null;
    let hint = '';
    if (G.screen === 'racing' && r && !G.ended) {
      const sp = r.spot;
      if (r.dead) hint = r.deadT < C.RESTART ? 'ЗАГЛОХ В ВОДЕ — отпусти газ…' : 'ЖМИ ГАЗ — заводи, пока не утонул!';
      else if (r.cable && r.atTop) hint = 'Тапни по столбику — отцепи трос';
      else if (r.cable && r.roll > 0) hint = 'Заглох — откат в лужу';
      else if (r.cable && r.cut > 0) hint = 'Мотор заглох — жди';
      else if (r.cable) hint = 'Лебёдка: держи газ в зелёной зоне';
      else if (sp && r.x >= sp.x0 - C.WINCH_REACH) hint = 'Крутой выезд — тапни по столбику (или E)';
      else if (r.cut > 0) hint = 'ДВИГАТЕЛЬ ЗАГЛОХ — жди';
      else if (r.d > 0.02) hint = 'Держи газ в зелёной зоне тахометра';
      else {
        const nearWater = MR.nextBathDist(G.track, r.x) < 9;
        hint = nearWater && r.rpm > r.hi - 0.05 ? 'Перед водой сбрось обороты!' : nearWater ? 'Сейчас вода — газ в зелёную зону' : 'По песку — газ в пол';
      }
    }
    const lap = G.pass < 2 ? 1 : 2;
    RN.render({
      track: G.track || MR.makeTrack(1), t: G.t, lanes: G.lanes, pl: G.lane,
      place: G.screen === 'racing' ? G.place : 0, rivals: BOTS + 1, split: G.screen === 'racing' && !G.ended ? G.split : null,
      ghosts: G.bots.length && (G.screen === 'racing' || G.screen === 'countdown') ? G.bots.map((b) => ({ r: b.r, look: b.look, name: b.name, lane: b.lane, out: !!b.out || b.total !== null })) : null,
      particles: G.particles, splats: G.splats, msgs: G.msgs,
      lights: G.lights, lightA: G.lightA, pen: G.pen,
      label: r ? `Круг ${lap}/2 · ${G.lane === 0 ? 'верхняя' : 'нижняя'} дорожка` : '',
      pass: G.pass, passes: r ? `отрезок ${G.pass + 1} из 4` : '',
      cue: winchCue(),
      hud: G.screen === 'racing' || G.screen === 'countdown', tags: true, hint
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  menu();
})();
