/* Общие мелочи для всех страниц: уведомление, копирование команд, переключатель ОС. */
const $ = s => document.querySelector(s);

function toast(text) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2400);
}

// копирует текст; возвращает true, если получилось
async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Скопировано");
    return true;
  } catch (e) {
    if (!fallbackEl) return false;
    const r = document.createRange();
    r.selectNodeContents(fallbackEl);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    if (ok) { s.removeAllRanges(); toast("Скопировано"); } else toast("Выделено, нажми Ctrl+C");
    return ok;
  }
}

// кнопка на миг показывает, что действие выполнено
function flash(button, text) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = text;
  button.classList.add("copied");
  clearTimeout(button._t);
  button._t = setTimeout(() => { button.textContent = button.dataset.label; button.classList.remove("copied"); }, 1600);
}

document.addEventListener("click", async e => {
  const b = e.target.closest(".cmd button");
  if (!b) return;
  const pre = b.parentElement.querySelector("pre");
  if (!(await copyText(pre.textContent, pre))) return;
  // значок «копировать» на секунду превращается в галочку
  b.classList.add("done");
  b.setAttribute("aria-label", "Скопировано");
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.classList.remove("done"); b.setAttribute("aria-label", "Копировать"); }, 1600);
});

/* подсветка команд терминала: команда, флаги (-m), строки в кавычках, названия библиотек */
function highlightShell(pre) {
  const lines = pre.textContent.split("\n");
  pre.replaceChildren(...lines.flatMap((line, li) => {
    const parts = [];
    let first = true, afterInstall = false;
    for (const tok of line.match(/"[^"]*"|'[^']*'|\s+|[^\s]+/g) || []) {
      let cls = "";
      if (/^\s+$/.test(tok)) cls = "";
      else if (first) { cls = "sh-cmd"; first = false; }
      else if (/^["']/.test(tok)) cls = "sh-str";
      else if (tok.startsWith("-")) cls = "sh-flag";
      else if (afterInstall) cls = "sh-pkg";
      if (tok === "install") afterInstall = true;
      parts.push(cls ? Object.assign(document.createElement("span"), { className: cls, textContent: tok }) : document.createTextNode(tok));
    }
    return li < lines.length - 1 ? [...parts, document.createTextNode("\n")] : parts;
  }));
}
const highlightAll = () => document.querySelectorAll(".cmd pre").forEach(highlightShell);
highlightAll();

function setOS(os) {
  document.querySelectorAll(".os button[data-os]").forEach(x => x.setAttribute("aria-pressed", x.dataset.os === os ? "true" : "false"));
  document.querySelectorAll("pre[data-win]").forEach(p => (p.textContent = p.dataset[os]));
  document.querySelectorAll("[data-os-text]").forEach(el => (el.innerHTML = el.dataset[os]));
  highlightAll();
}
document.querySelectorAll(".os").forEach(group =>
  group.addEventListener("click", e => {
    const b = e.target.closest("button[data-os]");
    if (b) setOS(b.dataset.os);
  })
);
if (document.querySelector(".os") && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setOS("mac");

/* ---------- главная: живые мини-экраны в «Кому подойдёт курс» ---------- */
(function liveMocks() {
  const cards = document.querySelectorAll(".who-card");
  if (!cards.length) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // код в ноутбуке «печатается» по буквам
  function type(el) {
    const text = el.dataset.full ??= el.textContent;
    if (calm) { el.textContent = text; return; }
    clearInterval(el._t);
    el.textContent = "";
    el.classList.add("typing");
    let i = 0;
    el._t = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(el._t); el.classList.remove("typing"); }
    }, 38);
  }

  function play(card) {
    card.classList.add("in");
    card.querySelectorAll("[data-type]").forEach(type);
  }
  // при наведении анимация проигрывается заново
  function replay(card) {
    card.classList.remove("in");
    void card.offsetWidth;
    play(card);
  }

  if (!("IntersectionObserver" in window)) { cards.forEach(play); return; }
  const seen = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting && !e.target.classList.contains("in")) play(e.target);
  }), { threshold: 0.35 });
  cards.forEach(c => {
    seen.observe(c);
    c.addEventListener("mouseenter", () => { if (c.classList.contains("in")) replay(c); });
  });
})();

/* ---------- главная: карточки «Очки за курс» ---------- */
document.querySelectorAll(".xp-card").forEach(card => card.addEventListener("click", e => {
  const r = card.getBoundingClientRect(), w = document.createElement("span");
  w.className = "ripple";
  w.style.left = (e.clientX ? e.clientX - r.left : r.width / 2) + "px";
  w.style.top = (e.clientY ? e.clientY - r.top : r.height / 2) + "px";
  card.appendChild(w);
  setTimeout(() => w.remove(), 700);
  card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
  card.classList.toggle("open");
  card.setAttribute("aria-expanded", card.classList.contains("open"));
}));

/* ---------- прогресс ученика: хранится в браузере ---------- */
const Progress = {
  KEY: "pandas-sprint:v1",
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || { days: {} }; } catch (e) { return { days: {} }; }
  },
  save(data) {
    if (ProgressSync.locked) return;   // идёт перезагрузка после объединения с облаком: старые данные страницы не записываем
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (e) { /* приватный режим: работаем без сохранения */ }
    ProgressSync.listeners.forEach(f => f(data));
  },
};

/* ---------- объединение прогресса двух устройств (для входа через Google) ----------
   merge(local, cloud): ничего не теряем — решённая задача, ответ, закрытый урок, минуты и очки по дням
   берутся с того устройства, где их больше. auth.js подписывается на сохранения через listeners. */
const ProgressSync = {
  locked: false,
  listeners: [],
  merge(a, b) {
    a ||= { days: {} }; b ||= { days: {} };
    const keys = (x, y) => new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
    const map = (x, y, f) => { const o = {}; keys(x, y).forEach(k => (o[k] = x?.[k] == null ? y[k] : y?.[k] == null ? x[k] : f(x[k], y[k]))); return o; };
    const maxNum = (x, y) => map(x, y, Math.max);
    const day = (x, y) => {
      const best = (x.xp || 0) >= (y.xp || 0) ? x : y, other = best === x ? y : x;
      return {
        ...other, ...best,
        quiz: { ...other.quiz, ...best.quiz },
        tasks: map(x.tasks, y.tasks, (p, q) => ({ ...q, ...p, ok: !!(p.ok || q.ok), hint: !!(p.hint || q.hint), peek: !!(p.peek || q.peek) })),
        code: { ...other.code, ...best.code },
        out: { ...other.out, ...best.out },
        seen: { ...other.seen, ...best.seen },
        caseText: best.caseText || other.caseText || "",
        caseDone: !!(x.caseDone || y.caseDone),
        caseGaveUp: !!(x.caseGaveUp || y.caseGaveUp),
        finished: !!(x.finished || y.finished),
        finishedOn: [x.finishedOn, y.finishedOn].filter(Boolean).sort()[0],
        xp: Math.max(x.xp || 0, y.xp || 0),
        // сколько очков урока уже записано в журнал по дням; если ни на одном устройстве не записано — не придумываем
        ...(x.xpLogged != null || y.xpLogged != null ? { xpLogged: Math.max(x.xpLogged ?? 0, y.xpLogged ?? 0) } : {}),
      };
    };
    return {
      ...b, ...a,
      days: map(a.days, b.days, day),
      activity: map(a.activity, b.activity, (x, y) => ({ sec: maxNum(x.sec, y.sec), quiz: !!(x.quiz || y.quiz) })),
      xpLog: map(a.xpLog, b.xpLog, maxNum),
    };
  },
  // одинаковы ли два прогресса по смыслу: порядок ключей не важен, false / "" / {} — то же, что «нет значения»
  canon(v) {
    if (Array.isArray(v)) return v.map(x => this.canon(x));
    if (!v || typeof v !== "object") return v;
    const o = {};
    Object.keys(v).sort().forEach(k => {
      const c = this.canon(v[k]);
      if (c === undefined || c === null || c === false || c === "" || (typeof c === "object" && !Array.isArray(c) && !Object.keys(c).length)) return;
      o[k] = c;
    });
    return o;
  },
  same(a, b) { return JSON.stringify(this.canon(a)) === JSON.stringify(this.canon(b)); },
  // в облако не отправляем вывод задач (out): он может быть большим (таблицы, картинки), а нужен только на этом устройстве
  forCloud(data) {
    const days = {};
    Object.entries(data.days || {}).forEach(([k, d]) => { const { out, ...rest } = d; days[k] = rest; });
    return { ...data, days };
  },
};
window.ProgressSync = ProgressSync;


window.Progress = Progress;

/* ---------- учёт занятий по дням (для календаря и «Занимался») ----------
   store.activity["2026-11-04"] = { sec: { "1": 1250, "2": 300 }, quiz: true }
   sec — сколько секунд ученик реально провёл на странице каждого урока в этот день, quiz — ответил ли хотя бы на один вопрос квиза.
   День считается днём занятий, если на странице ОДНОГО урока набралось 30 минут или был ответ в квизе.
   Дата — местная (по часам ученика), поэтому в полночь начинается новый день и счёт идёт с нуля. */
const Activity = {
  MIN_SEC: 30 * 60,
  key(d = new Date()) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  day(store, key = this.key()) {
    store.activity ||= {};
    return (store.activity[key] ||= { sec: {}, quiz: false });
  },
  counted(a) {
    return !!a && (a.quiz || Object.values(a.sec || {}).some(s => s >= this.MIN_SEC));
  },
};

// статусы уроков на странице программы, прогресс по курсу и мои очки на главной
(function showProgress() {
  const days = Progress.load().days;
  const cards = document.querySelectorAll("[data-day] [data-status]");
  cards.forEach(pill => {
    const card = pill.closest("[data-day]");
    const d = days[card.dataset.day];
    if (!d || !d.xp && !d.finished) return;
    pill.textContent = d.finished ? `✓ Завершён · ${d.xp} XP` : `в процессе · ${d.xp} XP`;
    pill.classList.add(d.finished ? "done" : "partial");
    card.classList.toggle("is-done", !!d.finished);
  });
  const total = Object.values(days).reduce((s, d) => s + (d.xp || 0), 0);
  const finished = Object.values(days).filter(d => d.finished).length;
  const box = document.querySelector("[data-course-progress]");
  if (box && cards.length && (total || finished)) {
    box.hidden = false;
    box.querySelector("[data-cp-text]").textContent = `Пройдено ${finished} из ${cards.length}`;
    box.querySelector("[data-cp-xp]").textContent = `${total} XP`;
    box.querySelector("[data-cp-bar]").style.width = `${finished / cards.length * 100}%`;
  }
  const done = document.querySelector("[data-course-done]");
  if (done && cards.length && finished === cards.length) done.hidden = false;
  const my = document.querySelector("[data-my-xp]");
  if (my && total) {
    my.hidden = false;
    my.textContent = `у тебя уже ${total} XP`;
  }
})();
