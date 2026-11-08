/* Страница урока: подсветка кода, редакторы, запуск Python в браузере, проверка задач,
   квиз, кейс и очки. Прогресс хранится в браузере (Progress из site.js). */
const LESSON = JSON.parse(document.getElementById("lesson-data").textContent);
const HINT_COST = LESSON.hint_cost, RUN_TIMEOUT = 30000;

/* ---------- прогресс этого урока ---------- */
const store = Progress.load();
const me = store.days[LESSON.day] ||= { quiz: {}, tasks: {}, code: {}, caseText: "", caseDone: false, finished: false, xp: 0 };
me.seen ||= {};
me.out ||= {};  // последний вывод каждой задачи: виден, когда ученик вернётся в урок

// очки задачи: подсказка, открытая до решения, снимает HINT_COST
const taskXp = t => Math.max(0, t.xp - (me.tasks[t.id]?.hint ? HINT_COST : 0));
function earned() {
  const quiz = Object.entries(me.quiz).filter(([i, pick]) => LESSON.quiz[i] === pick).length * LESSON.quiz_xp / LESSON.quiz.length;
  const tasks = LESSON.tasks.reduce((s, t) => s + (me.tasks[t.id]?.ok ? taskXp(t) : 0), 0);
  return Math.round(quiz + tasks + (me.caseDone ? LESSON.case_xp : 0));
}
function solvedCount() { return LESSON.tasks.filter(t => me.tasks[t.id]?.ok).length; }
const caseClosed = () => !LESSON.case_xp || me.caseDone || me.caseGaveUp;
function canFinish() { return solvedCount() === LESSON.tasks.length && caseClosed(); }

// журнал очков по датам: store.xpLog["2026-11-05"]["3"] = сколько XP урок 3 принёс в этот день.
// Нужен странице «Мой прогресс» для графика роста и «лучше, чем вчера».
// Очки, набранные до появления журнала, не имеют даты — страница прогресса покажет их как стартовые.
me.xpLogged ??= me.xp || 0;
let wasFinished = !!me.finished;
Track.send("lesson_open", LESSON.day);
// галочки в оглавлении у блоков с заданиями: квиз — ответил на все вопросы, практика — решены все задачи,
// кейс — ответ принят (если открыл пример ответа, кейс не решён и галочки нет), «Завершить» — урок пройден
function markBlocks() {
  const full = {
    quiz: LESSON.quiz.every((_, i) => me.quiz[i] != null),
    practice: solvedCount() === LESSON.tasks.length,
    case: !!me.caseDone,
    finish: !!me.finished,
  };
  Object.entries(full).forEach(([id, ok]) => document.querySelector(`.outline a[href="#${id}"]`)?.classList.toggle("done", ok));
}
function save() {
  me.xp = earned();
  const delta = me.xp - me.xpLogged;
  if (delta) {
    const log = ((store.xpLog ||= {})[Activity.key()] ||= {});
    log[LESSON.day] = (log[LESSON.day] || 0) + delta;
    me.xpLogged = me.xp;
  }
  // всё решено — урок завершается сам, нажимать кнопку не обязательно
  if (canFinish() && !me.finished) {
    me.finished = true;
    me.finishedOn = Activity.key();    // день, когда урок закрыт: в календаре он будет цвета ранга
    toast(`Урок пройден! ${me.xp} XP`);
  }
  if (me.finished && (!wasFinished || delta)) Track.result(LESSON.day, me.xp, me.finishedOn);
  if (me.finished && !wasFinished) Track.send("lesson_finish", LESSON.day);
  wasFinished = !!me.finished;
  Progress.save(store);
  $("#xpNow").textContent = `${me.xp} / ${LESSON.xp} XP`;
  $("#tasksNow").textContent = `${solvedCount()} из ${LESSON.tasks.length}`;
  $("#xpBar").style.width = `${Math.min(100, me.xp / LESSON.xp * 100)}%`;
  const fin = $("#finishBtn");
  fin.disabled = !canFinish() || me.finished;
  const left = [];
  if (solvedCount() < LESSON.tasks.length) left.push(`задач: ${LESSON.tasks.length - solvedCount()}`);
  if (!caseClosed()) left.push("кейс");
  $("#finishNote").textContent = me.finished
    ? `Урок пройден: ${me.xp} XP. Можно возвращаться и решать заново.`
    : left.length ? `Осталось решить — ${left.join(", ")}.` : "Всё готово, можно закрывать урок.";
  if (me.finished) fin.textContent = "✓ Урок пройден";
  renderGoal();
  markBlocks();
}

/* Карточка «Цель урока». Каждая часть — доля сделанного (прочитано, отвечено, решено),
   общий процент — взвешенная сумма частей: задачи весят больше всего, потому что на них уходит больше времени.
   Без кейса его вес делится между остальными частями. Пересчёт идёт сразу после каждого действия. */
const GOAL_WEIGHT = { theory: 15, quiz: 15, tasks: 50, case: 20 };
function renderGoal() {
  const share = {
    theory: LESSON.theory.filter(id => me.seen[id]).length / LESSON.theory.length,
    quiz: LESSON.quiz.filter((_, i) => me.quiz[i] != null).length / LESSON.quiz.length,
    tasks: solvedCount() / LESSON.tasks.length,
  };
  if (LESSON.case_xp) share.case = me.caseDone ? 1 : 0;
  let sum = 0, weight = 0;
  for (const [part, value] of Object.entries(share)) { sum += value * GOAL_WEIGHT[part]; weight += GOAL_WEIGHT[part]; }
  document.querySelectorAll(".goal-steps [data-step]").forEach(a => {
    const pct = Math.round(share[a.dataset.step] * 100);
    a.querySelector("b").textContent = `${pct}%`;
    a.querySelector("em").style.width = `${pct}%`;
    a.classList.toggle("full", pct === 100);
  });
  // 100% только когда всё сделано: округление не должно «дорисовывать» последний процент
  const exact = sum / weight * 100;
  const total = exact >= 100 ? 100 : Math.min(99, Math.round(exact));
  $("#goalPct").textContent = `${total}%`;
  $("#goalRing").style.setProperty("--p", total);
}

/* ---------- подсветка примеров ---------- */
function colorize(pre) {
  if (!window.CodeMirror || !CodeMirror.runMode) return;
  const src = pre.textContent;
  pre.textContent = "";
  CodeMirror.runMode(src, "python", pre);
}
document.querySelectorAll("pre[data-cm]").forEach(colorize);

/* ---------- Python в браузере ---------- */
const Py = {
  worker: null, ready: null, seq: 0, waiting: new Map(),
  status(text, state) {
    const el = $("#pyStatus");
    el.textContent = text;
    el.dataset.state = state;
  },
  start() {
    if (this.ready) return this.ready;
    this.status("Загружаем Python и pandas… Это один раз, около 10–20 секунд.", "load");
    this.worker = new Worker(LESSON.worker, { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          this.status(`Python готов · pandas ${data.version}`, "ok");
          resolve();
        } else if (data.type === "fail" && !data.id) {
          reject(new Error(data.message));
        } else if (data.type === "progress") {
          this.waiting.get(data.id)?.progress();
        } else {
          const w = this.waiting.get(data.id);
          if (w) { this.waiting.delete(data.id); w.done(data.type === "fail" ? { err: data.message } : data); }
        }
      };
      this.worker.onerror = e => reject(new Error(e.message || "ошибка загрузки"));
      setTimeout(() => reject(new Error("загрузка Python длится слишком долго")), 120000);
    }).catch(e => {
      this.status("Не удалось загрузить Python. Проверь интернет и нажми «Запустить» ещё раз.", "err");
      this.reset();
      throw e;
    });
    const files = LESSON.datasets.map(name => ({ name, url: new URL(LESSON.data + name, location.href).href }));
    this.worker.postMessage({ type: "init", files });
    return this.ready;
  },
  reset() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
    this.waiting.forEach(w => w.done({ err: "Python перезапущен." }));
    this.waiting.clear();
  },
  async run(code, extra) {
    // CDN иногда обрывает загрузку пакетов: пробуем до трёх раз
    for (let attempt = 1; ; attempt++) {
      try { await this.start(); break; } catch (e) { if (attempt === 3) throw e; }
    }
    const id = ++this.seq;
    const setup = extra ? `${LESSON.setup}\n${extra}` : LESSON.setup;
    return new Promise(resolve => {
      const stop = () => {
        this.waiting.delete(id);
        this.reset();
        this.status("Python перезапущен после слишком долгого запуска.", "err");
        resolve({ out: "", err: "Код выполнялся дольше 30 секунд и был остановлен.\n\n💡 Возможно, в коде бесконечный цикл." });
      };
      let timer = setTimeout(stop, RUN_TIMEOUT);
      this.waiting.set(id, {
        done: r => {
          clearTimeout(timer);
          if ($("#pyStatus").dataset.state === "load") this.status("Python готов", "ok");
          resolve(r);
        },
        // воркер докачивает библиотеку (scipy, matplotlib…): это дольше обычного запуска
        progress: () => {
          clearTimeout(timer);
          timer = setTimeout(stop, 4 * RUN_TIMEOUT);
          this.status("Загружаем дополнительную библиотеку… Это один раз.", "load");
        },
      });
      this.worker.postMessage({ type: "run", id, setup, code });
    });
  },
};

// Python начинаем грузить заранее, когда ученик подходит к задачам
const practice = document.getElementById("practice");
new IntersectionObserver((entries, obs) => {
  if (entries.some(e => e.isIntersecting)) { Py.start().catch(() => {}); obs.disconnect(); }
}, { rootMargin: "800px 0px" }).observe(practice);

/* ---------- задачи ---------- */
const editors = {};
const norm = s => s.replace(/\s+/g, " ").trim();

// Две Series подряд pandas печатает без пустой строки, и они сливаются в одну.
// Ставим пустую строку после строки «dtype: …», если за ней начинается следующий вывод.
const DTYPE_LINE = /^(Name: .*, )?(Length: \d+, )?dtype: \S+$/;
function spaceOutputs(text) {
  const lines = text.split("\n");
  return lines.map((l, i) => (DTYPE_LINE.test(l.trim()) && lines[i + 1]?.trim() ? l + "\n" : l)).join("\n");
}
document.querySelectorAll("pre.exp").forEach(pre => (pre.textContent = spaceOutputs(pre.textContent)));

function showOutput(task, text, kind, keep = true) {
  const pane = task.querySelector("[data-got]");
  const pre = document.createElement("pre");
  pre.className = "got" + (kind ? " " + kind : "");
  pre.dataset.got = "";
  pre.textContent = kind ? text : spaceOutputs(text);
  pane.replaceWith(pre);
  // текст вывода запоминаем (картинки графиков — нет: они большие, после возврата график появится при запуске)
  if (!keep) return;
  me.out[task.dataset.task] = { text: text.slice(0, 6000), kind: kind || "" };
  Progress.save(store);
}

function showVerdictOk(task, t, st) {
  const verdict = task.querySelector("[data-verdict]");
  verdict.hidden = false;
  verdict.className = "verdict ok";
  verdict.innerHTML = `<b>Верно!</b> Вывод совпадает с правильным ответом. Задача засчитана: ${taskXp(t)} XP${st.hint ? ` (${t.xp} − ${HINT_COST} за подсказку)` : ""}.`;
}

function renderTask(task) {
  const t = LESSON.tasks.find(x => x.id === task.dataset.task);
  const st = me.tasks[t.id] || {};
  const state = task.querySelector("[data-state]");
  state.textContent = st.ok ? `✓ решена · ${taskXp(t)} XP` : "не решена";
  state.classList.toggle("ok", !!st.ok);
  // подсказку можно закрывать и открывать сколько угодно: XP снимается только за первое открытие
  const opened = st.hint || st.peek;
  const shown = !task.querySelector("[data-hint]").hidden;
  const hintBtn = task.querySelector('[data-act="hint"]');
  hintBtn.textContent = shown ? "💡 Скрыть подсказку" : opened ? "💡 Показать подсказку" : st.ok ? "💡 Подсказка" : `💡 Подсказка · −${HINT_COST} XP`;
  hintBtn.title = opened ? "Подсказка уже открывалась — повторный просмотр бесплатный" : "";
  hintBtn.classList.toggle("used", !!opened);
  const answer = task.querySelector("[data-answer]");
  if (answer) answer.hidden = !st.ok;
}

function toggleExpected(task, show) {
  const pane = task.querySelector("[data-exp]");
  const btn = task.querySelector('[data-act="exp"]');
  pane.hidden = !show;
  task.querySelector(".cmp").classList.toggle("two", show);
  btn.setAttribute("aria-pressed", String(show));
  btn.textContent = show ? "🎯 Скрыть ожидаемый результат" : "🎯 Ожидаемый результат";
}

async function runTask(task, check) {
  const id = task.dataset.task;
  const t = LESSON.tasks.find(x => x.id === id);
  const buttons = task.querySelectorAll('[data-act="run"],[data-act="check"]');
  const note = task.querySelector("[data-runnote]");
  buttons.forEach(b => (b.disabled = true));
  task.querySelector(check ? '[data-act="check"]' : '[data-act="run"]').classList.add("busy");
  note.textContent = Py.ready ? "Выполняется…" : "Загружаем Python…";
  let r;
  try {
    r = await Py.run(editors[id].get(), t.setup);
  } catch (e) {
    r = { out: "", err: "Не удалось загрузить Python. Проверь интернет и попробуй ещё раз." };
  }
  buttons.forEach(b => { b.disabled = false; b.classList.remove("busy"); });
  note.textContent = "Ctrl+Enter — запустить";
  const out = (r.out || "").replace(/\s+$/, "");
  if (r.err) {
    showOutput(task, (out ? out + "\n\n" : "") + r.err, "err");
    if (check) toast("Сначала исправь ошибку в коде");
    return;
  }
  const images = r.images || [];
  showOutput(task, out || (images.length ? "" : "(код ничего не вывел — добавь print() или поставь нужное выражение последней строкой)"));
  const gallery = task.querySelector("[data-got-img]");
  gallery.replaceChildren(...images.map(b64 => Object.assign(document.createElement("img"), { src: `data:image/png;base64,${b64}`, alt: "Твой график" })));
  gallery.hidden = !images.length;
  if (!check) return;

  const missing = t.keys.filter(k => !norm(out).includes(norm(k)));
  if (t.figure && !images.length) missing.push("график (вызови .plot() или plt…)");
  const verdict = task.querySelector("[data-verdict]");
  verdict.hidden = false;
  if (missing.length) {
    verdict.className = "verdict bad";
    verdict.innerHTML = "<b>Пока не совпадает.</b> В твоём выводе не нашлось: ";
    missing.forEach((k, i) => {
      const c = document.createElement("code");
      c.textContent = k;
      verdict.append(i ? ", " : "", c);
    });
    verdict.append(". Открой «🎯 Ожидаемый результат» и сравни со своим выводом.");
    return;
  }
  const st = me.tasks[id] ||= {};
  if (!st.ok) {
    st.ok = true;
    Track.send("task_solved", LESSON.day, id);
    toast(`Верно! +${taskXp(t)} XP`);
  }
  st.xp = taskXp(t);
  showVerdictOk(task, t, st);
  renderTask(task);
  save();
}

/* Строки вида «# твой код» — не текст, а подсказка-призрак: исчезает, когда пишешь в этой строке,
   и появляется снова, если строку очистить. Обычный код и комментарии-задания остаются как есть. */
const GHOST = /^(\s*)#\s*(твой код|твой ответ|продолжи|допиши|пиши здесь)(?![а-яё\w]).*$/i;
const stripGhosts = code => code.split("\n").map(l => l.replace(GHOST, "$1")).join("\n");

function mountGhosts(cm, starter) {
  const ghosts = [];
  starter.split("\n").forEach((line, i) => {
    if (GHOST.test(line)) ghosts.push({ handle: cm.getLineHandle(i), text: line.trim(), mark: null });
  });
  const update = () => ghosts.forEach(g => {
    const n = cm.getLineNumber(g.handle);
    const empty = n != null && cm.getLine(n).trim() === "";
    if (empty && !g.mark) {
      const span = document.createElement("span");
      span.className = "cm-ghost";
      span.textContent = g.text;
      g.mark = cm.setBookmark({ line: n, ch: cm.getLine(n).length }, { widget: span, insertLeft: true });
    } else if (!empty && g.mark) {
      g.mark.clear();
      g.mark = null;
    }
  });
  update();
  cm.on("change", update);
  return () => { cm.off("change", update); ghosts.forEach(g => g.mark && g.mark.clear()); };
}

document.querySelectorAll(".task").forEach(task => {
  const id = task.dataset.task;
  const ta = task.querySelector("textarea.editor");
  const starter = task.querySelector("[data-starter]").content.textContent;
  const clean = stripGhosts(starter);
  const fresh = me.code[id] == null;
  ta.value = fresh ? clean : me.code[id];
  let saveTimer;
  const remember = value => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (value === clean) delete me.code[id]; else me.code[id] = value;  // нетронутый код не храним
      Progress.save(store);
    }, 400);
  };
  if (window.CodeMirror) {
    const cm = CodeMirror.fromTextArea(ta, {
      mode: "python", lineNumbers: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity,
      extraKeys: {
        Tab: c => c.replaceSelection("    "),
        "Ctrl-Enter": () => runTask(task, false), "Cmd-Enter": () => runTask(task, false),
        "Shift-Enter": () => runTask(task, false),
      },
    });
    let unghost = fresh ? mountGhosts(cm, starter) : () => {};
    cm.on("change", () => remember(cm.getValue()));
    cm.on("focus", () => Py.start().catch(() => {}));
    editors[id] = {
      get: () => cm.getValue(),
      set: v => cm.setValue(v),
      reset: () => { unghost(); cm.setValue(clean); unghost = mountGhosts(cm, starter); },
    };
  } else {
    ta.addEventListener("input", () => remember(ta.value));
    editors[id] = { get: () => ta.value, set: v => (ta.value = v), reset: () => (ta.value = clean) };
  }
  // вернулся в урок: показываем прошлый вывод и отметку «верно»
  const last = me.out[id], st = me.tasks[id];
  if (last) {
    const t = LESSON.tasks.find(x => x.id === id);
    showOutput(task, last.text + (t.figure && !last.kind ? "\n\n(нажми ▶ Запустить, чтобы снова увидеть график)" : ""), last.kind, false);
  }
  if (st?.ok) showVerdictOk(task, LESSON.tasks.find(x => x.id === id), st);
  renderTask(task);
});

document.addEventListener("click", e => {
  const b = e.target.closest(".task [data-act]");
  if (!b) return;
  const task = b.closest(".task");
  const id = task.dataset.task;
  const st = me.tasks[id] ||= {};
  const act = b.dataset.act;
  if (act === "run") runTask(task, false);
  if (act === "check") runTask(task, true);
  if (act === "reset") {
    editors[id].reset();
    toast("Код вернулся к началу");
  }
  if (act === "exp") toggleExpected(task, task.querySelector("[data-exp]").hidden);
  if (act === "hint") {
    const box = task.querySelector("[data-hint]");
    if (!box.hidden) { box.hidden = true; renderTask(task); return; }  // закрыть: ничего не стоит
    if (!st.hint && !st.peek) {
      // подсказка одна; штраф только за первое открытие и только пока задача не решена
      if (st.ok) st.peek = true; else { st.hint = true; toast(`Подсказка открыта: −${HINT_COST} XP за эту задачу`); }
      Track.send("hint_open", LESSON.day, id);
      save();
    }
    box.hidden = false;
    renderTask(task);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

/* ---------- квиз ---------- */
function answerQuiz(qz, pick) {
  const right = Number(qz.dataset.a);
  qz.querySelectorAll(".opt").forEach(o => {
    const i = Number(o.dataset.i);
    o.disabled = true;
    if (i === right) { o.classList.add("right"); o.querySelector(".mark").textContent = "✓"; }
    else if (i === pick) { o.classList.add("wrong"); o.querySelector(".mark").textContent = "✗"; }
    else o.classList.add("dim");
  });
  qz.querySelector(".why").hidden = false;
}
document.querySelectorAll(".qz[data-q]").forEach(qz => {
  const q = qz.dataset.q;
  if (me.quiz[q] != null) answerQuiz(qz, me.quiz[q]);
  qz.addEventListener("click", e => {
    const b = e.target.closest(".opt");
    if (!b || b.disabled) return;
    me.quiz[q] = Number(b.dataset.i);
    Activity.day(store).quiz = true;   // ответ в квизе — этот день уже считается днём занятий
    Track.send("quiz_answer", LESSON.day, `q${q}`);
    answerQuiz(qz, me.quiz[q]);
    if (me.quiz[q] === Number(qz.dataset.a)) toast(`Верно! +${LESSON.quiz_xp / LESSON.quiz.length} XP`);
    save();
  });
});

/* ---------- кейс ----------
   Ответ пишут своими словами, поэтому слова не сравниваются. Проверка в два шага:
   1) цифры: каждое число из ответа ищем среди правильных результатов урока (с допуском на округление),
      обязательные факты должны быть названы, а число «рядом, но не то» считается ошибкой;
   2) смысл: короткие вопросы о выводе ответа — верный вывод можно сказать любыми словами. */
const MONTHS = /^\s*(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i;

// все числа из текста: «1 200», «49,9%», «85,5 тыс.», «2.1 млн», «0.499» — с вариантами прочтения
function readNumbers(text) {
  const src = text.replace(/[   ]/g, " ").replace(/[−–]/g, "-");
  const re = /\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
  const found = [];
  let m;
  while ((m = re.exec(src))) {
    const raw = m[0];
    const after = src.slice(re.lastIndex, re.lastIndex + 12);
    // кусок даты или времени (2026-09-01, 23:35) — не число из анализа
    if (/\d[-:\/]$/.test(src.slice(Math.max(0, m.index - 2), m.index)) || /^[-:\/]\d/.test(after)) continue;
    const unit = (after.match(/^\s*(%|тыс|млн|млрд|k\b|к\b)/i) || [, ""])[1].toLowerCase();
    const mult = { "тыс": 1e3, k: 1e3, "к": 1e3, "млн": 1e6, "млрд": 1e9 }[unit] || 1;
    const compact = raw.replace(/ /g, "");
    // «1,200» или «1.200» без единиц может быть и тысячей, и дробью — проверим оба прочтения
    const variants = /^\d{1,3}[.,]\d{3}$/.test(compact) && mult === 1
      ? [Number(compact.replace(/[.,]/, "")), Number(compact.replace(",", "."))]
      : [Number(compact.replace(",", "."))];
    const digits = compact.replace(/^0+|[.,]/g, "").replace(/0+$/, "").length || 1;
    found.push({
      raw: raw + (unit === "%" ? "%" : unit ? " " + unit : ""),
      values: variants.map(v => v * mult),
      pct: unit === "%",
      // сколько значащих цифр написал ученик: «108 тыс» точнее «100 тыс»
      step: mult * 10 ** (Math.floor(Math.log10(Math.max(Number(compact.replace(",", ".")), 1e-9))) - digits + 1),
      neutral: !unit && /^\d+$/.test(compact) && (Number(compact) <= 10 || (Number(compact) >= 1990 && Number(compact) <= 2035) || MONTHS.test(after)),
    });
  }
  return found;
}

// совпадает ли число ученика с правильным значением с учётом округления
function sameNumber(n, value, isPct) {
  const candidates = n.values.flatMap(v => (isPct && !n.pct && v < 1.5 ? [v, v * 100] : [v]));
  return candidates.some(v => {
    const diff = Math.abs(v - value), rel = diff / Math.max(Math.abs(value), 1e-9);
    return rel <= 0.02 || (diff <= n.step / 2 + 1e-9 && rel <= 0.05);
  });
}

const caseCheckBtn = document.getElementById("caseCheck");
if (caseCheckBtn) {
  const C = LESSON.case_check;
  const answer = document.getElementById("caseAnswer");
  const nums = document.getElementById("caseNums");
  const logic = document.getElementById("caseLogic");
  const verdict = document.getElementById("caseVerdict");
  const model = document.getElementById("caseModel");
  const modelBtn = document.getElementById("caseModelBtn");
  // все правильные числа урока: факты + цифры из примера ответа
  const known = [...C.facts.map(f => ({ name: f.name, value: Number(f.value), pct: !!f.pct })),
                 ...readNumbers(LESSON.case_model).flatMap(n => n.values.map(v => ({ name: "", value: v, pct: n.pct })))];

  const say = (kind, html) => { verdict.hidden = false; verdict.className = `verdict ${kind}`; verdict.innerHTML = html; };
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* Пример ответа. Пока кейс не решён, первое открытие стоит XP за кейс (нужно подтвердить вторым нажатием).
     После решения или после того, как пример уже открывали, его можно скрывать и показывать свободно. */
  let confirmGiveUp = false;
  const free = () => me.caseDone || me.caseGaveUp;
  function renderModelBtn() {
    modelBtn.textContent = !model.hidden ? "Скрыть пример ответа"
      : free() ? "Показать пример ответа"
      : confirmGiveUp ? `Точно показать? XP за кейс (${LESSON.case_xp}) не начислится` : "Показать пример ответа (без XP)";
    modelBtn.classList.toggle("warn", confirmGiveUp && model.hidden && !free());
  }
  const showModel = (open = true) => { model.hidden = !open; confirmGiveUp = false; renderModelBtn(); };
  modelBtn.addEventListener("click", () => {
    if (!model.hidden) return showModel(false);
    if (free()) return showModel(true);
    if (!confirmGiveUp) { confirmGiveUp = true; return renderModelBtn(); }
    me.caseGaveUp = true;
    showModel(true);
    save();
  });

  // ответы на вопросы о смысле показываем отмеченными, когда кейс уже решён
  function markLogicSolved() {
    logic.hidden = false;
    logic.querySelectorAll(".qz").forEach(qz => { qz.dataset.pick = qz.dataset.a; answerQuiz(qz, Number(qz.dataset.a)); });
  }

  function checkNumbers(text) {
    const found = readNumbers(text);
    const rows = [], errors = [];
    C.facts.forEach(f => {
      const hit = found.find(n => sameNumber(n, Number(f.value), f.pct));
      rows.push(hit ? `<li class="ok">✓ ${esc(f.name)}: <b>${esc(hit.raw)}</b></li>` : `<li class="bad">✗ ${esc(f.name)}: в ответе не нашли это число</li>`);
      if (!hit) errors.push(f.name);
    });
    found.filter(n => !n.neutral && !known.some(k => sameNumber(n, k.value, k.pct))).forEach(n => {
      // число близко к правильному, но не совпадает — скорее всего ошибка в расчёте
      const near = known.filter(k => k.name).find(k => n.values.some(v => Math.abs(v - k.value) / Math.max(Math.abs(k.value), 1e-9) <= 0.3));
      if (near) {
        rows.push(`<li class="bad">✗ <b>${esc(n.raw)}</b> — похоже на «${esc(near.name)}», но не совпадает с результатом задач</li>`);
        errors.push(n.raw);
      } else {
        rows.push(`<li class="warn">? <b>${esc(n.raw)}</b> — такого числа нет в результатах урока. Если оно посчитано верно, всё в порядке; если нет — убери его</li>`);
      }
    });
    nums.hidden = false;
    nums.innerHTML = `<p><b>Шаг 1 · Цифры</b></p><ul>${rows.join("")}</ul>`;
    return errors.length === 0;
  }

  function resetLogic() {
    logic.querySelectorAll(".qz").forEach(qz => {
      delete qz.dataset.pick;
      qz.querySelector(".why").hidden = true;
      qz.querySelectorAll(".opt").forEach(o => { o.disabled = false; o.className = "opt"; o.querySelector(".mark").textContent = ""; });
    });
  }

  function finishLogic() {
    const qs = [...logic.querySelectorAll(".qz")];
    if (qs.some(q => q.dataset.pick == null)) return;
    const wrong = qs.filter(q => q.dataset.pick !== q.dataset.a);
    if (wrong.length) {
      say("bad", `<b>Цифры верные, но вывод расходится с ними</b> в ${wrong.length} из ${qs.length} вопросов. Прочитай пояснение под вопросом, поправь текст и нажми «Проверить ответ» ещё раз.`);
      return;
    }
    if (!me.caseRight) Track.send("case_submit", LESSON.day);
    me.caseRight = true;
    if (me.caseGaveUp && !me.caseDone) {
      // пример уже был открыт до решения: ответ верный, но очки не начисляются
      say("ok", "<b>Ответ верный!</b> XP за кейс не начислены, потому что пример ответа был открыт раньше.");
    } else {
      if (!me.caseDone) toast(`Кейс засчитан: +${LESSON.case_xp} XP`);
      me.caseDone = true;
      say("ok", `<b>Ответ принят!</b> Цифры совпадают с результатами задач, вывод верный. +${LESSON.case_xp} XP.`);
    }
    showModel(true);
    save();
  }

  // варианты перемешиваются при каждой загрузке: правильный не всегда первый
  logic.querySelectorAll(".opts").forEach(box => {
    const opts = [...box.children];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    box.append(...opts);
  });

  logic.addEventListener("click", e => {
    const b = e.target.closest(".opt");
    if (!b || b.disabled) return;
    const qz = b.closest(".qz");
    qz.dataset.pick = b.dataset.i;
    answerQuiz(qz, Number(b.dataset.i));
    finishLogic();
  });

  // вернулся в урок: твой текст, проверка цифр и итог видны как были
  answer.value = me.caseText || "";
  answer.addEventListener("input", () => { me.caseText = answer.value; Progress.save(store); });
  if (me.caseDone || me.caseRight) {
    if (me.caseText) checkNumbers(me.caseText);
    markLogicSolved();
    say("ok", me.caseDone
      ? `<b>Кейс засчитан: ${LESSON.case_xp} XP.</b> Можешь переписать ответ и проверить снова — очки сохранятся.`
      : "<b>Ответ верный.</b> XP за кейс не начислены: пример ответа был открыт раньше.");
  }
  showModel(false);

  caseCheckBtn.addEventListener("click", () => {
    const text = answer.value.trim();
    if (text.length < 40) {
      toast("Сначала напиши свой ответ: хотя бы 2–3 предложения");
      answer.focus();
      return;
    }
    me.caseText = answer.value;
    Progress.save(store);
    resetLogic();
    if (!checkNumbers(text)) {
      logic.hidden = true;
      say("bad", "<b>Пока не принято: проблема в цифрах.</b> Найди нужные значения в выводе своих задач, поправь текст и проверь снова.");
      return;
    }
    logic.hidden = false;
    say("info", "<b>Цифры в порядке.</b> Теперь шаг 2: ответь на вопросы о выводе своего ответа.");
    logic.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

}

/* ---------- завершение урока ---------- */
$("#finishBtn").addEventListener("click", () => {
  if (!canFinish()) return;
  me.finished = true;
  me.finishedOn ||= Activity.key();
  save();
  toast(`Урок пройден! ${me.xp} XP`);
});

/* ---------- шпаргалка ---------- */
const copyCheat = document.getElementById("copyCheat");
if (copyCheat) copyCheat.addEventListener("click", () => {
  copyText(LESSON.cheat.map(([code, what]) => `${code}  # ${what}`).join("\n"));
  flash(copyCheat, "✓ Скопировано");
});

/* ---------- оглавление: отмечаем прочитанные разделы, отметки не пропадают ---------- */
// Брифинг, теория и ловушки отмечаются, когда ученик до них долистал.
// Квиз, практика, кейс и «Завершить» — только когда блок полностью сделан (markBlocks), не при прокрутке.
const BLOCKS = ["quiz", "practice", "case", "finish"];
const links = new Map([...document.querySelectorAll(".outline a")].map(a => [a.getAttribute("href").slice(1), a])
  .filter(([id]) => !BLOCKS.includes(id)));
const markSeen = id => {
  links.get(id)?.classList.add("done");
  if (me.seen[id]) return;
  me.seen[id] = true;
  save();
};
Object.keys(me.seen).forEach(id => links.get(id)?.classList.add("done"));
// раздел считается прочитанным, когда его начало поднялось в верхнюю половину экрана (работает и для очень длинных разделов)
let seenTimer;
function checkSeen() {
  const line = (window.innerHeight || document.documentElement.clientHeight) * 0.5;
  links.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top < line) markSeen(id);
  });
}
window.addEventListener("scroll", () => {
  clearTimeout(seenTimer);
  seenTimer = setTimeout(checkSeen, 150);
}, { passive: true });
checkSeen();

/* ---------- время на странице урока ----------
   Считаем только «живое» время:
   • вкладка открыта на экране и окно браузера активно (две открытые вкладки не считаются дважды);
   • ученик что-то делал в последние 5 минут: двигал мышь, листал, печатал (Win+L, ушёл от компьютера — счёт стоит);
   • между отметками прошло не больше 30 секунд: если ноутбук закрыли, он уснул или выключился, этот промежуток выбрасывается.
   Время копится за день по этому уроку: вышел на главную и вернулся — счёт продолжается с того же места.
   В полночь по часам ученика начинается новый день, и время считается с нуля. */
const TICK = 5000, IDLE = 5 * 60 * 1000, MAX_GAP = 30000;
let lastTick = Date.now(), lastInput = Date.now(), unsaved = 0;
["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"].forEach(ev =>
  addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
function flushActivity() {
  if (unsaved) { Progress.save(store); unsaved = 0; }
}
setInterval(() => {
  const now = Date.now(), gap = now - lastTick;
  lastTick = now;
  if (document.visibilityState !== "visible" || !document.hasFocus()) return;
  if (gap > MAX_GAP || now - lastInput > IDLE) return;
  const a = Activity.day(store);                      // день берётся в момент отметки: после 00:00 — уже новый
  a.sec[LESSON.day] = Math.round((a.sec[LESSON.day] || 0) + gap / 1000);
  unsaved++;
  if (unsaved >= 6) flushActivity();                  // сохраняем раз в полминуты, а не каждые 5 секунд
}, TICK);
document.addEventListener("visibilitychange", () => {
  lastTick = Date.now();                              // время, пока вкладка была скрыта, не считается
  if (document.visibilityState === "hidden") flushActivity();
});
addEventListener("pagehide", flushActivity);

/* ---------- SQL → pandas: отдельное окно ---------- */
const sqlDialog = document.getElementById("sqlDialog");
if (sqlDialog) {
  document.querySelectorAll("[data-open-sql]").forEach(b => b.addEventListener("click", () => sqlDialog.showModal()));
  sqlDialog.addEventListener("click", e => {
    if (e.target === sqlDialog || e.target.closest("[data-close-sql]")) sqlDialog.close();
  });
}

save();
