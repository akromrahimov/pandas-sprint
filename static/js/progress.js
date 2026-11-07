/* Страница «Мой прогресс». Все цифры считаются из прогресса в браузере (Progress и Activity из site.js):
   store.days[N]       — урок N: очки (xp), закрыт ли (finished), когда закрыт (finishedOn), ответы квиза, задачи, кейс;
   store.xpLog[дата]   — сколько XP принёс каждый урок в этот день (пишет lesson.js);
   store.activity[дата] — минуты на странице каждого урока и был ли ответ в квизе (для календаря). */
const COURSE = JSON.parse(document.getElementById("course-data").textContent);
const HINT = COURSE.hint_cost;
const DAYS = COURSE.days;
const store = Progress.load();
const S = d => (store.days || {})[d] || null;
const xpOf = d => S(d)?.xp || 0;
const MAX_TOTAL = DAYS.reduce((s, p) => s + p.max, 0);

/* ---------- ранги: доля от максимума урока ---------- */
const R = [
  { n: "Без ранга", gen: "ранга", c: "#3B3566", min: 0, ico: "—" },
  { n: "Росток", gen: "«Ростка»", c: "#43D19B", min: 112 / 160, ico: "I" },
  { n: "Следопыт данных", gen: "«Следопыта данных»", c: "#38BDF8", min: 125 / 160, ico: "II" },
  { n: "Укротитель таблиц", gen: "«Укротителя таблиц»", c: "#A78BFA", min: 135 / 160, ico: "III" },
  { n: "Алхимик данных", gen: "«Алхимика данных»", c: "#FF5CB0", min: 145 / 160, ico: "IV" },
  { n: "Легенда Pandas", gen: "«Легенды»", c: "#FFCA00", min: 155 / 160, ico: "👑" },
];
// порог ранга i для урока с максимумом max: 160 → 112/125/135/145/155, 240 → 168/188/203/218/233, 400 → 280/313/338/363/388
const thr = (i, max) => Math.ceil(R[i].min * max - 1e-9);
const rankOf = (p, x) => { let r = 0; for (let i = 1; i < R.length; i++) if (x >= thr(i, p.max)) r = i; return r; };

const SHORT = { lesson: "урок", proj: "проект", exam: "экзамен" };
// цвета графиков и пути берутся из темы (переменные --pc-* в progress.css): при смене фона в «Настройках» всё перекрашивается
const PC = (k, d) => getComputedStyle(document.documentElement).getPropertyValue("--pc-" + k).trim() || d;
const ON = { lesson: "уроке", proj: "проекте", exam: "экзамене" };       // «15 мин на уроке 3 / на проекте 7»
const name = p => `${p.label} ${p.day}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2]; };
const num = n => Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const href = p => COURSE.root + p.url;

const done = DAYS.filter(p => S(p.day)?.finished);
const nDone = done.length;
const next = DAYS.find(p => !S(p.day)?.finished) || null;
const cnt = [0, 0, 0, 0, 0, 0];
done.forEach(p => cnt[rankOf(p, xpOf(p.day))]++);

/* ---------- даты ---------- */
const key = Activity.key.bind(Activity);
const today = new Date(); today.setHours(0, 0, 0, 0);
const todayK = key(today);
const yest = new Date(today); yest.setDate(yest.getDate() - 1);
const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const fmtYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmtLong = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
const fmtMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

/* ---------- журнал очков по дням ---------- */
const xpLog = store.xpLog || {};
const dayXp = k => Object.values(xpLog[k] || {}).reduce((s, v) => s + v, 0);
const total = DAYS.reduce((s, p) => s + xpOf(p.day), 0);
const logged = Object.keys(xpLog).reduce((s, k) => s + dayXp(k), 0);
const baseline = Math.max(0, total - logged);          // очки, набранные до того, как курс начал записывать даты
const logDates = Object.keys(xpLog).filter(k => dayXp(k) !== 0).sort();

/* ================= Ранги ================= */
(function ranks() {
  const range = i => `${thr(i, 160)}–${i < 5 ? thr(i + 1, 160) - 1 : 160} XP`;
  const w = n => (nDone ? n / nDone * 100 : 0).toFixed(1);
  const body = i => `<div class="ico">${R[i].ico}</div><span class="rg">Ранг ${R[i].ico} · ${range(i)}</span><span class="nm">${R[i].n}</span>` +
    `<span class="ct">${cnt[i]}<small>${plural(cnt[i], ["урок", "урока", "уроков"])}</small></span><div class="pbar"><i style="width:${w(cnt[i])}%"></i></div>`;
  // у всех карточек одна схема: рамка .rk и содержимое .in — поэтому размеры и отступы совпадают
  let h = [1, 2, 3, 4].map(i => `<div class="rk r${i}" style="--c:${R[i].c}"><div class="in">${body(i)}</div></div>`).join("");
  // «Легенда» видна всегда, даже с нулём: ученик сразу видит, к чему идёт
  h += `<div class="rk lgd"><div class="in"><div class="ico"><span>👑</span></div><span class="rg">Ранг V · ${range(5)}</span><span class="nm">Легенда Pandas</span>` +
    `<span class="ct">${cnt[5]}<small>${plural(cnt[5], ["урок", "урока", "уроков"])}</small></span><div class="pbar"><i style="width:${w(cnt[5])}%"></i></div></div></div>`;
  // карточка-воспоминание: закрыта, пока нет ни одной «Легенды»; потом навсегда хранит первую —
  // самую раннюю по дате закрытия (при одинаковой дате — урок с меньшим номером)
  const first = done.filter(p => rankOf(p, xpOf(p.day)) === 5)
    .sort((a, b) => (S(a.day).finishedOn || "9999").localeCompare(S(b.day).finishedOn || "9999") || a.day - b.day)[0];
  if (first) {
    const s = S(first.day), when = s.finishedOn ? fmtYear.format(fromKey(s.finishedOn)).replace(" г.", "") : "";
    h += `<a class="rk memo" href="${href(first)}" title="Открыть ${SHORT[first.type]} ${first.day}"><div class="in"><div class="ico"><span>👑</span><b>1</b></div>` +
      `<span class="rg">Моя первая «Легенда»</span><span class="nm">${name(first)}</span><span class="memo-t">${esc(first.title)}</span>` +
      `<span class="memo-x"><b>${s.xp}</b> из ${first.max} XP${when ? ` · ${when}` : ""}</span></div></a>`;
  } else {
    h += `<div class="rk lgd lockd" title="Откроется вместе с первой «Легендой»"><div class="in"><div class="ico"><span>🔒</span></div><span class="rg">Первая «Легенда»</span><span class="nm">? ? ? ? ?</span>` +
      `<span class="lock-t">Здесь сохранится урок, где ты впервые получишь «Легенду».</span></div></div>`;
  }
  const el = document.getElementById("ranks");
  el.innerHTML = h;
  const sparks = (box, n) => { for (let k = 0; k < n; k++) { const s = document.createElement("i"); s.className = "spark"; s.style.left = Math.random() * 90 + 5 + "%"; s.style.top = Math.random() * 80 + 10 + "%"; s.style.animationDelay = Math.random() * 2.4 + "s"; box.appendChild(s); } };
  el.querySelectorAll(".lgd:not(.lockd) .in").forEach(b => sparks(b, 7));
  el.querySelectorAll(".memo .in").forEach(b => sparks(b, 4));
  el.querySelectorAll(".r4 .in").forEach(b => sparks(b, 3));
  // первая «Легенда» открывается с анимацией один раз — когда ученик впервые видит её здесь
  if (first) {
    // отметка «уже видел» лежит отдельно от прогресса, чтобы открытая вкладка урока её не затёрла
    const SEEN = "pandas-sprint:first-legend-seen";
    let seen = null;
    try { seen = localStorage.getItem(SEEN); } catch (e) { /* приватный режим */ }
    if (seen !== String(first.day)) {
      el.querySelector(".memo").classList.add("reveal");
      try { localStorage.setItem(SEEN, String(first.day)); } catch (e) { /* без сохранения */ }
    }
  }
  // нажатие: волна от пальца и короткая тень цвета ранга — одинаково у всех карточек
  el.addEventListener("click", e => {
    const card = e.target.closest(".rk");
    if (!card) return;
    const box = card.querySelector(".in") || card, r = box.getBoundingClientRect(), w = document.createElement("span");
    w.className = "ripple";
    w.style.left = (e.clientX ? e.clientX - r.left : r.width / 2) + "px";
    w.style.top = (e.clientY ? e.clientY - r.top : r.height / 2) + "px";
    box.appendChild(w); setTimeout(() => w.remove(), 700);
    card.classList.remove("press"); void card.offsetWidth; card.classList.add("press");
    clearTimeout(card._t); card._t = setTimeout(() => card.classList.remove("press"), 550);
  });
})();

/* ================= Зал рангов ================= */
(function hall() {
  const med = document.getElementById("medals"), info = document.getElementById("infoC");
  const started = s => s && (s.xp > 0 || Object.values(s.tasks || {}).some(t => t.ok) || Object.keys(s.quiz || {}).length > 0);
  med.innerHTML = DAYS.map(p => {
    const s = S(p.day), ok = !!s?.finished, r = ok ? rankOf(p, s.xp || 0) : 0;
    const cls = !ok ? (started(s) ? "none wip" : "none") : r === 5 ? "lgd" : "mr" + r;
    return `<button type="button" class="md ${cls}" data-d="${p.day}" style="${ok && r < 5 ? `--c:${R[r].c}` : ""}" aria-label="${name(p)}">` +
      `<b>${ok ? R[r].ico : "?"}</b><small>${SHORT[p.type]} ${p.day}</small></button>`;
  }).join("");
  med.querySelectorAll(".md.mr3,.md.mr4,.md.lgd").forEach(m => m.insertAdjacentHTML("afterbegin", '<span class="glint"></span>'));
  med.querySelectorAll(".md.mr4").forEach(m => [[-4, 22], [90, 74]].forEach(([x, y], i) => m.insertAdjacentHTML("beforeend", `<i class="st p" style="left:${x}%;top:${y}%;animation-delay:${i * .7}s"></i>`)));
  med.querySelectorAll(".md.lgd").forEach(m => [[-6, 18], [88, 8], [96, 70], [4, 84], [50, -8]].forEach(([x, y], i) => m.insertAdjacentHTML("beforeend", `<i class="st" style="left:${x}%;top:${y}%;animation-delay:${i * .35}s"></i>`)));

  const text = p => {
    const s = S(p.day), link = t => ` <a href="${href(p)}">${t} →</a>`;
    if (s?.finished) {
      const x = s.xp || 0, r = rankOf(p, x), when = s.finishedOn ? `, закрыт ${fmtDay.format(fromKey(s.finishedOn))}` : "";
      const rk = r ? `ранг «${R[r].n}»` : `без ранга (нужно от ${thr(1, p.max)} XP)`;
      const more = r < 5 ? ` До ${R[r + 1].gen} не хватило <b>${thr(r + 1, p.max) - x} XP</b>.` : " Это высший ранг!";
      return `<b>${name(p)}</b> · ${x} из ${p.max} XP · ${rk}${when}.${more}${link("Открыть")}`;
    }
    if (started(s)) {
      const solved = p.tasks.filter(t => s.tasks?.[t.id]?.ok).length;
      return `<b>${name(p)}</b> <span class="wip-tag">в процессе</span> ${s.xp || 0} из ${p.max} XP, решено задач ${solved} из ${p.tasks.length}. Закрой урок — здесь появится медаль.${link("Продолжить")}`;
    }
    return `<b>${name(p)}</b> «${esc(p.title)}» ещё впереди. Пройди его — здесь появится медаль.${link("Открыть")}`;
  };
  med.addEventListener("click", e => {
    const m = e.target.closest(".md");
    if (!m) return;
    med.querySelectorAll(".md.sel").forEach(x => x.classList.remove("sel"));
    m.classList.add("sel");
    info.innerHTML = text(DAYS.find(p => p.day === +m.dataset.d));
  });
})();

/* ================= Карточки показателей ================= */
(function kpis() {
  const tXp = dayXp(todayK), yXp = dayXp(key(yest)), diff = tXp - yXp;
  const share = Math.round(total / MAX_TOTAL * 100);
  const active = logDates.length, avg = active ? Math.round(logged / active) : 0;
  const up = t => `<span class="dt"><span class="ar">▲</span>${t}</span>`, flat = t => `<span class="dt flat">${t}</span>`;

  // 1. всего XP
  let more1 = active ? `За ${active} ${plural(active, ["день", "дня", "дней"])} с очками — в среднем <b>${avg} XP</b> в день. ` : "";
  more1 += `Это <b>${share}%</b> всех очков курса (${num(MAX_TOTAL)} XP).`;
  if (baseline && active) more1 += ` Ещё ${baseline} XP набрано раньше, без дат.`;
  const k1 = `<button type="button" class="kpi top"><span class="lb">Всего XP</span><span class="vl">${num(total)}</span>` +
    (tXp > 0 ? up(`+${tXp} сегодня`) : flat("сегодня пока 0")) + `<canvas id="spark" width="96" height="34"></canvas><span class="more">${more1}</span></button>`;

  // 2. сегодня против вчера
  const more2 = diff > 0 ? `Сегодня <b>${tXp} XP</b>, вчера — ${yXp}. Так держать!`
    : tXp === 0 && yXp === 0 ? "Вчера и сегодня очков пока нет. Каждая решённая задача сразу попадёт сюда."
    : diff === 0 ? `Сегодня столько же, сколько вчера: <b>${tXp} XP</b>.`
    : `Вчера было <b>${yXp} XP</b>, сегодня — ${tXp}. До вчерашнего результата не хватает <b>${-diff} XP</b>.`;
  const k2 = `<button type="button" class="kpi"><span class="lb">${diff > 0 ? "Лучше, чем вчера" : "Сегодня и вчера"}</span>` +
    `<span class="vl">${diff > 0 ? "+" : diff < 0 ? "−" : ""}${Math.abs(diff)} XP</span>` +
    (diff > 0 ? up(`${tXp} против ${yXp}`) : flat(`${tXp} против ${yXp}`)) + `<span class="more">${more2}</span></button>`;

  // 3. пройдено
  const pct = Math.round(nDone / DAYS.length * 100);
  const more3 = next ? `Следующий — <b>${name(next)}</b>: ${esc(next.title)}.` : "Все уроки курса пройдены!";
  const k3 = `<button type="button" class="kpi"><span class="lb">Пройдено</span><span class="vl">${nDone}<small> / ${DAYS.length}</small></span>` +
    `<div class="pring" style="--pp:${pct}"><span>${pct}%</span></div><span class="more">${more3}</span></button>`;

  // 4. средний ранг: средняя доля очков по закрытым урокам
  let v4, more4;
  if (nDone) {
    const avgShare = done.reduce((s, p) => s + xpOf(p.day) / p.max, 0) / nDone;
    let r = 0; for (let i = 1; i < R.length; i++) if (avgShare >= R[i].min - 1e-9) r = i;
    const words = R[r].n.split(" ");
    v4 = `<span class="vl vname" style="color:${r ? R[r].c : "var(--muted)"}">${words.join("<br>")}</span>`;
    more4 = `В среднем <b>${num(Math.round(avgShare * 1000) / 10)}%</b> очков урока.` +
      (r < 5 ? ` До ${R[r + 1].gen} — ещё <b>+${num(Math.max(.1, Math.ceil((R[r + 1].min - avgShare) * 1000 - 1e-6) / 10))}%</b>.` : " Это уровень «Легенды»!");
  } else {
    v4 = `<span class="vl" style="color:var(--muted)">—</span>`;
    more4 = "Закрой первый урок — и здесь появится твой средний ранг.";
  }
  const k4 = `<button type="button" class="kpi"><span class="lb">Средний ранг</span>${v4}<span class="more">${more4}</span></button>`;

  const box = document.getElementById("kpis");
  box.innerHTML = k1 + k2 + k3 + k4;
  box.querySelectorAll(".kpi").forEach(k => k.addEventListener("click", e => {
    const r = k.getBoundingClientRect(), w = document.createElement("span");
    w.className = "ripple"; w.style.left = (e.clientX ? e.clientX - r.left : r.width / 2) + "px"; w.style.top = (e.clientY ? e.clientY - r.top : r.height / 2) + "px";
    k.appendChild(w); setTimeout(() => w.remove(), 700);
    k.classList.remove("pop"); void k.offsetWidth; k.classList.add("pop"); k.classList.toggle("open");
    k.setAttribute("aria-expanded", k.classList.contains("open"));
  }));
})();

/* ================= Мой рост ================= */
(function growth() {
  const canvas = document.getElementById("main"), empty = document.getElementById("growthEmpty"), leg = document.getElementById("legB");
  // точки графика: каждый день, когда были очки; очки без даты — первой точкой «раньше»
  const labels = [], perDay = [], legendDay = [];
  if (baseline) { labels.push("раньше"); perDay.push(baseline); legendDay.push(false); }
  logDates.forEach(k => {
    labels.push(fmtShort.format(fromKey(k)).replace(".", ""));
    perDay.push(dayXp(k));
    legendDay.push(done.some(p => S(p.day).finishedOn === k && rankOf(p, xpOf(p.day)) === 5));
  });
  let acc = 0;
  const cum = perDay.map(v => (acc += v));

  // Chart.js грузится отдельно (async): страница рисуется сразу, а графики — как только библиотека готова
  const withChart = run => {
    if (window.Chart) return run();
    const s = document.getElementById("chartjs");
    s?.addEventListener("load", run);
    s?.addEventListener("error", () => { empty.hidden = false; canvas.hidden = true; empty.textContent = "График не загрузился: проверь интернет и обнови страницу."; });
  };
  withChart(() => {
  let sp = null;
  const spark = () => {
    if (cum.length < 2) { document.getElementById("spark")?.remove(); return; }
    sp?.destroy();
    sp = new Chart(document.getElementById("spark"), { type: "line", data: { labels, datasets: [{ data: cum, borderColor: PC("spark", "#FFCA00"), borderWidth: 2, pointRadius: 0, tension: .35 }] },
      options: { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } } });
  };
  spark();

  let grid, tick;
  // пунктирные границы рангов — позади столбиков
  const thresholds = { id: "thr", beforeDatasetsDraw(c) {
    if (c.config._mode !== "less") return;
    const y = c.scales.y, { left, right } = c.chartArea, g = c.ctx;
    R.slice(1).forEach(t => { const yy = y.getPixelForValue(t.min * 100); g.save(); g.strokeStyle = t.c; g.setLineDash([5, 5]); g.globalAlpha = .6; g.beginPath(); g.moveTo(left, yy); g.lineTo(right, yy); g.stroke(); g.restore(); });
  } };
  let ch, first = true, mode0 = "cum";
  function draw(mode) {
    mode0 = mode;
    grid = PC("grid", "#2A2552"); tick = PC("tick", "#A6A2C7");
    const line = PC("chart", "#FF5CB0"), fill = PC("chart-fill", "rgba(255,92,176,.45)"), fill0 = PC("chart-fill0", "rgba(255,92,176,0)");
    // первый график появляется сразу, без «вырастания»; при переключении режимов — короткая анимация
    const animation = first ? false : { duration: 350 };
    first = false;
    if (ch) { ch.destroy(); ch = null; }
    const none = mode === "less" ? !nDone : !cum.length;
    empty.hidden = !none; canvas.hidden = none;
    if (none) {
      empty.textContent = mode === "less" ? "Здесь появятся пройденные уроки: каждый столбик — сколько процентов очков ты в нём набрал."
        : "Здесь появится твой рост, когда наберёшь первые очки в уроке.";
      leg.innerHTML = "";
      return;
    }
    if (mode === "less") {
      const pct = done.map(p => +(xpOf(p.day) / p.max * 100).toFixed(1));
      const low = Math.min(60, Math.floor(Math.min(...pct) / 10) * 10);
      ch = new Chart(canvas, { type: "bar", plugins: [thresholds],
        data: { labels: done.map(p => (p.type === "lesson" ? "У" : p.type === "proj" ? "П" : "Э") + p.day),
          datasets: [{ data: pct, backgroundColor: done.map(p => R[rankOf(p, xpOf(p.day))].c), borderRadius: 6, maxBarThickness: 28 }] },
        options: { animation, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { title: c => name(done[c[0].dataIndex]),
            label: c => { const p = done[c.dataIndex]; return `Закрыт на ${num(c.raw)}% · ${xpOf(p.day)} из ${p.max} XP`; },
            afterLabel: c => { const p = done[c.dataIndex], r = rankOf(p, xpOf(p.day)); return r ? `Ранг «${R[r].n}»` : "Без ранга"; } } } },
          scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { min: low, max: 100, ticks: { color: tick, callback: v => v + "%" }, grid: { color: grid } } } } });
      ch.config._mode = "less"; ch.update();
      leg.innerHTML = [1, 2, 3, 4].map(i => `<span><i style="background:${R[i].c}"></i>${R[i].n}</span>`).join("") + `<span><i class="lg"></i>Легенда Pandas</span><span>пунктир — граница ранга</span>`;
      return;
    }
    const data = mode === "cum" ? cum : perDay;
    // заливка считается по реальной высоте графика, поэтому доходит до низа при любом размере
    const grad = c => { const a = c.chart.chartArea; if (!a) return fill; const gr = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); gr.addColorStop(0, fill); gr.addColorStop(1, fill0); return gr; };
    ch = new Chart(canvas, { type: "line",
      data: { labels, datasets: [{ data, borderColor: line, backgroundColor: grad, fill: true, tension: .35, borderWidth: 3,
        pointRadius: legendDay.map(u => (u ? 8 : 4)), pointBackgroundColor: legendDay.map(u => (u ? "#FFCA00" : line)), pointBorderColor: PC("ptborder", "#17133A"), pointBorderWidth: 2, pointHoverRadius: 10 }] },
      options: { animation, responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false },
        tooltip: { backgroundColor: "#fff", titleColor: "#150458", bodyColor: "#150458", padding: 10,
          callbacks: { label: c => (mode === "cum" ? `всего ${c.raw} XP (+${perDay[c.dataIndex]} за день)` : `${c.raw} XP за день`),
            afterLabel: c => (legendDay[c.dataIndex] ? "👑 получена «Легенда»" : "") } } },
        scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { ticks: { color: tick }, grid: { color: grid }, beginAtZero: true } } } });
    leg.innerHTML = `<span><i style="background:${line}"></i>${mode === "cum" ? "накопленный XP" : "XP за день"}</span><span><i style="background:#FFCA00;border-radius:50%"></i>день, когда получена «Легенда»</span>`;
  }
  draw("cum");
  document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    draw(b.dataset.m);
  }));
  // сменили фон в «Настройках» — перерисовываем графики в новых цветах
  addEventListener("skinchange", () => { spark(); first = true; draw(mode0); });
  });
})();

/* ================= Ближайшая цель =================
   Следующий незакрытый урок. Считаем, сколько очков в нём ещё можно набрать (максимум минус уже потерянное:
   открытые подсказки, ошибки в квизе, кейс, сданный через пример ответа) и какой самый высокий ранг ещё достижим. */
function goalPlan(p) {
  const s = S(p.day) || {}, quiz = s.quiz || {}, tasks = s.tasks || {};
  const per = p.quiz.length ? p.quiz_xp / p.quiz.length : 0;               // цена одного вопроса квиза
  const wrong = p.quiz.filter((a, i) => quiz[i] != null && quiz[i] !== a).length;
  const hints = p.tasks.filter(t => tasks[t.id]?.hint).length;
  const caseLost = !!(p.case_xp && s.caseGaveUp && !s.caseDone);
  const possible = Math.round((p.quiz.length - wrong) * per +
    p.tasks.reduce((a, t) => a + t.xp - (tasks[t.id]?.hint ? Math.min(HINT, t.xp) : 0), 0) + (caseLost ? 0 : p.case_xp));
  let r = 0; for (let i = 1; i < R.length; i++) if (possible >= thr(i, p.max)) r = i;
  const target = r ? thr(r, p.max) : 0;
  const unit = Math.max(HINT, per);                                         // самая дорогая ошибка
  return { s, per, wrong, hints, caseLost, possible, lost: p.max - possible, r, target, slack: possible - target,
    errors: Math.floor((possible - target) / unit), started: (s.xp || 0) > 0 || Object.keys(quiz).length > 0 };
}
(function goal() {
  const box = document.getElementById("goal");
  if (!next) {
    const avg = nDone ? done.reduce((s, p) => s + xpOf(p.day), 0) : 0;
    box.innerHTML = `<span class="t">🏆 Курс пройден!</span><div class="row"><span>«Легенд» собрано</span><b>${cnt[5]} из ${DAYS.length}</b></div>` +
      `<div class="pbar"><i id="goalBar"></i></div><div class="tip">Все ${DAYS.length} уроков закрыты: <b>${num(avg)} XP</b> из ${num(MAX_TOTAL)}. Отличная работа!</div>`;
    document.getElementById("goalBar").style.width = cnt[5] / DAYS.length * 100 + "%";
    return;
  }
  const g = goalPlan(next), cur = g.s.xp || 0;
  // «с одной ошибкой», «с двумя ошибками», «с 5 ошибками»
  const errText = n => `${["", "одной", "двумя", "тремя", "четырьмя"][n] || n} ${n === 1 ? "ошибкой или подсказкой" : "ошибками или подсказками"}`;
  const times = n => `${["", "одного", "двух", "трёх", "четырёх"][n] || n} ${n === 1 ? "раза" : "раз"}`;
  const costs = `Ошибка в квизе стоит ${num(g.per)} XP, подсказка — ${HINT} XP` + (next.case_xp && !g.s.caseDone ? `, а кейс решай сам: пример ответа отнимет ${next.case_xp} XP.` : ".");
  let row, tip;
  if (g.r === 5) {
    const nth = cnt[5] === 0 ? "первую" : `${cnt[5] + 1}-ю`;
    row = `${name(next)} · до «Легенды»`;
    tip = g.errors > 0
      ? `Реши ${SHORT[next.type]} не больше чем с ${errText(g.errors)} — и получишь ${nth} «Легенду». ${costs}`
      : `Чтобы получить ${nth} «Легенду», дальше в этом уроке — без ошибок и подсказок. ${costs}`;
  } else if (g.r > 0) {
    row = `${name(next)} · до ${R[g.r].gen}`;
    tip = `«Легенда» здесь уже недоступна: потеряно ${g.lost} XP. Но ранг «${R[g.r].n}» ещё твой` +
      (g.errors > 0 ? ` — можно ошибиться не больше ${times(g.errors)}.` : ` — дальше без ошибок и подсказок.`);
  } else {
    row = `${name(next)} · закрыть урок`;
    tip = `Ранг в этом уроке уже не получить: потеряно ${g.lost} XP. Закрой его, чтобы идти дальше, — а следующий пройди внимательнее.`;
  }
  const goal = g.r ? g.target : next.max;
  box.innerHTML = `<span class="t">🎯 Ближайшая цель</span><div class="row"><span>${row}</span><b>${goal} XP</b></div>` +
    `<div class="pbar" title="Сейчас ${cur} из ${goal} XP"><i id="goalBar"></i></div><div class="tip">${tip}</div>` +
    `<a class="go" href="${href(next)}">${g.started ? "Продолжить" : "Открыть"} ${SHORT[next.type]} ${next.day} →</a>`;
  document.getElementById("goalBar").style.width = Math.min(100, cur / goal * 100) + "%";
})();

/* ================= Календарь =================
   День занятий — 30 минут на странице одного урока или ответ в квизе (Activity.counted). День, когда урок закрыт, — тоже день занятий.
   Даты считает сам браузер (Date и Intl): любой месяц и год, високосные годы, неделя с понедельника. */
(function calendar() {
  const act = store.activity || {};
  const closedOn = {};
  done.forEach(p => { const k = S(p.day).finishedOn; if (k) (closedOn[k] ||= []).push(p); });
  const studied = k => Activity.counted(act[k]) || !!closedOn[k];
  const firstDay = [...Object.keys(act).filter(k => Activity.counted(act[k])), ...Object.keys(closedOn)].sort()[0];
  const lessonByDay = d => DAYS.find(p => p.day === +d);
  // главный урок дня — тот, на котором провёл больше всего времени
  const topSec = k => Object.entries(act[k]?.sec || {}).sort((a, b) => b[1] - a[1])[0] || null;
  const brk = `<svg class="brk" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15l3-3m2-2l1-1"/><path d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M3 3l18 18"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1-7.127 0a4.972 4.972 0 0 1 0-7.071l.524-.463"/></svg>`;
  const isMiss = k => !!firstDay && k >= firstDay && k < todayK && !studied(k);

  function streak() {
    let n = 0; const d = new Date(today);
    if (!studied(key(d))) d.setDate(d.getDate() - 1);
    while (studied(key(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function tip(k) {
    const d = fromKey(k), t = `<b>${fmtLong.format(d).replace(" г.", "")}${k === todayK ? " · сегодня" : ""}</b>`;
    if (k > todayK) return `${t} — ещё впереди`;
    const xp = dayXp(k), xpT = xp > 0 ? ` За день +${xp} XP.` : "";
    const top = topSec(k), min = top ? Math.floor(top[1] / 60) : 0, topP = top && lessonByDay(top[0]);
    if (closedOn[k]) {
      const list = closedOn[k].map(p => { const x = xpOf(p.day), r = rankOf(p, x); return `${name(p)} закрыт — ${x} XP, ${r ? `ранг «${R[r].n}»` : "без ранга"}`; });
      return `${t}: ${list.join("; ")}.${xpT}`;
    }
    if (studied(k)) {
      const parts = [];
      if (topP && min >= 1) parts.push(`${min} мин на ${ON[topP.type]} ${topP.day}`);
      if (act[k]?.quiz) parts.push("ответы в квизе");
      return `${t}: занимался — ${parts.join(", ") || "урок в процессе"}.${xpT}`;
    }
    if (k === todayK) return `${t}: день ещё не засчитан.`;
    if (isMiss(k)) return `${t}: пропуск.`;
    return `${t}: курс ещё не начат`;
  }

  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    document.getElementById("calTitle").textContent = fmtMonth.format(view).replace(" г.", "");
    const shift = (new Date(y, m, 1).getDay() + 6) % 7;                      // дни прошлого месяца до 1-го числа
    const cells = Math.ceil((shift + new Date(y, m + 1, 0).getDate()) / 7) * 7;
    let h = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w, i) => `<div class="wd ${i > 4 ? "we" : ""}">${w}</div>`).join("");
    let studM = 0, missM = 0;
    for (let i = 0; i < cells; i++) {
      const d = new Date(y, m, 1 - shift + i), k = key(d), out = d.getMonth() !== m, isT = k === todayK;
      const closed = closedOn[k], miss = isMiss(k), st = k <= todayK && studied(k);
      if (!out) { if (st) studM++; if (miss) missM++; }
      let r = 0;
      if (closed) r = Math.max(...closed.map(p => rankOf(p, xpOf(p.day))));
      const cls = ["cd", out && "oth", isT && "today", !isT && closed && "done", !isT && closed && r === 5 && "lg", !isT && !closed && st && "prog", miss && "miss"].filter(Boolean).join(" ");
      h += `<div class="${cls}" data-k="${k}" style="${closed && !isT ? `--c:${R[r].c}` : ""}">${d.getDate()}${miss ? brk : ""}</div>`;
    }
    const grid = document.getElementById("calGrid");
    grid.innerHTML = h;
    document.getElementById("calStats").innerHTML = `<span>🔥 Серия: <b>${streak()} дн.</b></span><span>Занимался: <b>${studM}</b></span><span>Пропусков: <b>${missM}</b></span>`;
  }
  document.getElementById("calGrid").addEventListener("click", e => {
    const c = e.target.closest(".cd");
    if (!c) return;
    document.querySelectorAll("#calGrid .cd.sel").forEach(x => x.classList.remove("sel"));
    c.classList.add("sel");
    document.getElementById("calTip").innerHTML = tip(c.dataset.k);
  });
  document.querySelectorAll(".cal-nav").forEach(b => b.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + Number(b.dataset.step), 1); render(); }));
  document.getElementById("calToday").addEventListener("click", () => {
    view = new Date(today.getFullYear(), today.getMonth(), 1); render();
    document.querySelector(`#calGrid [data-k="${todayK}"]`)?.click();
  });
  render();
})();

/* ================= Путь по курсу ================= */
(function path() {
  const svg = document.getElementById("path"), tipEl = document.getElementById("ptip"), pts = [];
  function render() {
  for (let i = 0; i < DAYS.length; i++) { const row = Math.floor(i / 10), col = i % 10; pts.push([row % 2 ? 970 - col * 100 : 70 + col * 100, 55 + row * 85]); }
  const hereI = next ? DAYS.indexOf(next) : DAYS.length;                     // сколько уроков подряд пройдено с начала
  const poly = p => p.map(q => q.join(",")).join(" ");
  let len = 0; for (let i = 1; i < hereI; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const C = { line: PC("path-line", "#3B3566"), empty: PC("empty", "#110E2C"), emptyText: PC("empty-text", "#A6A2C7"), halo: PC("halo", "#A78BFA"),
    here: PC("here", "#FFCA00"), hereFill: PC("here-fill", "#2A2170"), label: PC("label", "#FFCA00"), labelInk: PC("label-ink", "#150458"), okStroke: PC("ok-stroke", "#F1EEFF") };
  let s = "";
  s += `<polyline points="${poly(pts.slice(Math.max(0, hereI - 1)))}" fill="none" stroke="${C.line}" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/>`;
  if (hereI > 1) s += `<defs><linearGradient id="trail" x1="0" x2="1"><stop offset="0" stop-color="#43D19B"/><stop offset=".5" stop-color="#A78BFA"/><stop offset="1" stop-color="#FF5CB0"/></linearGradient></defs>` +
    `<polyline class="done-line" style="--len:${len}" points="${poly(pts.slice(0, hereI))}" fill="none" stroke="url(#trail)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  DAYS.forEach((p, i) => {
    const [x, y] = pts[i], st = S(p.day), ok = !!st?.finished, r = ok ? rankOf(p, st.xp || 0) : 0, rad = p.max > 160 ? 24 : 19, last = i === DAYS.length - 1, here = p === next;
    const col = ok ? R[r].c : C.empty;
    s += `<g class="st ${r === 5 ? "lg-st" : ""}" data-i="${i}" style="transform-origin:${x}px ${y}px">` +
      `<circle class="halo" cx="${x}" cy="${y}" r="${rad + 10}" fill="${ok ? R[r].c : C.halo}"/>` +
      (here ? `<circle class="here" cx="${x}" cy="${y}" r="${rad}" fill="none" stroke="${C.here}" stroke-width="3"/>` : "") +
      (ok && r < 5 ? `<circle cx="${x}" cy="${y}" r="${rad + 4}" fill="none" stroke="${R[r].c}" stroke-width="2" opacity=".55"/>` : "") +
      `<circle cx="${x}" cy="${y}" r="${rad}" fill="${here ? C.hereFill : col}" stroke="${ok ? (r === 5 ? "#FFF3B0" : C.okStroke) : here ? C.here : C.line}" stroke-width="${r === 5 || here ? 4 : ok ? 2.5 : 2}" ${ok || here ? "" : 'stroke-dasharray="4 4"'}/>` +
      `<text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Unbounded" font-weight="700" font-size="${r === 5 || last ? 17 : 13}" fill="${ok ? "#0E0B22" : here ? C.here : C.emptyText}">${r === 5 ? "👑" : last ? "🏆" : p.day}</text>` +
      (here ? `<g class="here-lab"><rect x="${x - 44}" y="${y - rad - 34}" width="88" height="22" rx="11" fill="${C.label}"/><text x="${x}" y="${y - rad - 19}" text-anchor="middle" font-family="Golos Text" font-weight="700" font-size="12" fill="${C.labelInk}">Ты здесь</text></g>` : "") +
      `</g>`;
  });
  svg.innerHTML = s;
  const tipText = p => {
    const st = S(p.day);
    if (st?.finished) { const r = rankOf(p, st.xp || 0); return `${name(p)} · ${st.xp || 0} XP · ${r ? R[r].n : "без ранга"}`; }
    if (p === next) return `${name(p)} · следующий${st?.xp ? ` · ${st.xp} XP` : ""}`;
    return st?.xp ? `${name(p)} · в процессе · ${st.xp} XP` : `${name(p)} · впереди`;
  };
  svg.querySelectorAll(".st").forEach(g => {
    const i = +g.dataset.i, p = DAYS[i], [x, y] = pts[i];
    g.addEventListener("mouseenter", () => { const k = svg.getBoundingClientRect().width / 1040; tipEl.textContent = tipText(p); tipEl.style.left = x * k + "px"; tipEl.style.top = (y - 26) * k + "px"; tipEl.classList.add("on"); });
    g.addEventListener("mouseleave", () => tipEl.classList.remove("on"));
    g.addEventListener("click", () => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"), st = S(p.day);
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 22); c.setAttribute("fill", "none");
      c.setAttribute("stroke", st?.finished ? R[rankOf(p, st.xp || 0)].c : PC("halo", "#A78BFA")); c.setAttribute("stroke-width", "3"); c.setAttribute("class", "ring-fx");
      svg.appendChild(c); setTimeout(() => c.remove(), 650);
    });
  });
  }
  render();
  addEventListener("skinchange", render);   // новый фон — станции и линия в новых цветах
})();
