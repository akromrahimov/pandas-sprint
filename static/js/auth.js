/* Вход через Google и сохранение прогресса в облаке (Firebase Auth + Firestore).
   Подключается, только если в content/course.yaml заполнен site.firebase.

   Как это работает:
   • Прогресс по-прежнему живёт в браузере (Progress из site.js) — сайт работает и без входа.
   • После входа прогресс этого браузера объединяется с облачным (ProgressSync.merge): ничего не теряется,
     даже если ученик начал курс без входа или занимался на двух устройствах.
   • Дальше каждое сохранение отправляется в облако — не чаще раза в 2 минуты и сразу, когда ученик уходит со страницы.
   • В облаке у каждого ученика один документ progress/{uid}; правила Firestore пускают туда только его самого. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const cfg = JSON.parse(document.getElementById("firebase-config").textContent);
const app = initializeApp(cfg);
const auth = getAuth(app);
auth.languageCode = "ru";
const db = getFirestore(app);
const { Progress, ProgressSync } = window;

const OWNER = "pandas-sprint:owner";       // чей прогресс сейчас в этом браузере (uid последнего вошедшего)
const PUSH_EVERY = 120 * 1000;             // не чаще одной записи в облако за 2 минуты
let user = null, pending = false, lastPush = 0, timer = null;

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
  del: k => { try { localStorage.removeItem(k); } catch (e) { /* приватный режим */ } },
};

/* ---------- кнопка в шапке и окошко аккаунта ---------- */
const box = document.querySelector("[data-auth]");
const btn = box.querySelector(".auth-btn"), pop = box.querySelector(".auth-pop");
const stateEl = box.querySelector("[data-auth-state]");
btn.addEventListener("click", () => { pop.hidden = !pop.hidden; btn.setAttribute("aria-expanded", !pop.hidden); });
document.addEventListener("click", e => { if (!box.contains(e.target)) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") pop.hidden = true; });

function setState(text, cls = "") { stateEl.textContent = text; stateEl.className = "auth-state " + cls; }
// рисует шапку (AuthView из site.js) и запоминает профиль: на следующей странице аватар появится сразу,
// без мигания кнопки «Войти», пока Firebase проверяет вход
function render() {
  const profile = user ? { name: user.displayName || "", email: user.email || "", photo: user.photoURL || "" } : null;
  AuthView.remember(profile);
  AuthView.paint(profile);
}

/* ---------- вход и выход ---------- */
async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    if (e.code === "auth/unauthorized-domain") return toast("Этот адрес сайта не разрешён в настройках Firebase");
    toast("Не получилось войти. Попробуй ещё раз");
  }
}
document.querySelectorAll("[data-auth-login]").forEach(b => b.addEventListener("click", login));
box.querySelector("[data-auth-logout]").addEventListener("click", async () => {
  await push(true);                        // сначала дописываем последние изменения
  await flushTrack();
  ls.del(VISIT);                           // следующий вход этого ученика — новый вход, даже в тот же день
  await signOut(auth);
  pop.hidden = true;
  toast("Ты вышел. Прогресс остался и в этом браузере, и в аккаунте");
});

/* ---------- облако ---------- */
const ref = () => doc(db, "progress", user.uid);
const plain = d => JSON.stringify(ProgressSync.forCloud(d));

async function push(now = false) {
  clearTimeout(timer); timer = null;
  if (!user || (!pending && !now)) return;
  pending = false; lastPush = Date.now();
  setState("Сохраняю…");
  try {
    await setDoc(ref(), { data: plain(Progress.load()), updated: serverTimestamp() });
    setState("✓ Прогресс сохранён", "ok");
  } catch (e) {
    pending = true;
    setState("Нет связи — сохраню позже", "err");
  }
}
function schedule() {
  if (!user) return;
  pending = true;
  if (timer) return;
  timer = setTimeout(push, Math.max(3000, lastPush + PUSH_EVERY - Date.now()));
}
ProgressSync.listeners.push(schedule);
// ученик закрывает вкладку или переключается — отправляем сразу, не дожидаясь двух минут
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && pending) push(); });

/* ---------- учёт действий в базе SQL (backend/track.mjs) ----------
   Посредник проверяет вход по токену Firebase и записывает данные. Ошибки сюда не выходят: учёт не должен мешать учёбе. */
const TRACK_URL = document.getElementById("firebase-config").dataset.track;
const VISIT = "pandas-sprint:visit";       // кто и в какой день уже отмечен как вошедший
const TRACK_DELAY = 4000;                  // действия отправляем пачкой: через 4 секунды после первого
const { Track } = window;
let trackTimer = null, token = null;

const hasTrack = () => Track.events.length || Track.results.size;

async function refreshToken() {
  const r = await user.getIdTokenResult();
  token = { value: r.token, exp: Date.parse(r.expirationTime) };
}
function postTrack() {
  const body = JSON.stringify({ events: Track.events.splice(0, 50), results: [...Track.results.values()] });
  Track.results.clear();
  // keepalive: запрос дойдёт, даже если ученик уже перешёл на другую страницу
  fetch(TRACK_URL, {
    method: "POST", keepalive: true, body,
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
  }).catch(() => {});
  if (Track.events.length) scheduleTrack();
}
async function flushTrack() {
  clearTimeout(trackTimer); trackTimer = null;
  if (!user || !Track.active || !hasTrack()) return;
  try { await refreshToken(); } catch (e) { return; }   // нет связи: действия подождут следующей отправки
  if (user && hasTrack()) postTrack();
}
function scheduleTrack() {
  if (!user || !Track.active || trackTimer) return;
  trackTimer = setTimeout(flushTrack, TRACK_DELAY);
}
Track.notify = scheduleTrack;
// при уходе со страницы ждать новый токен некогда: если текущий ещё действует, отправляем сразу
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || !user || !Track.active || !hasTrack()) return;
  if (token && Date.now() < token.exp - 60000) { clearTimeout(trackTimer); trackTimer = null; postTrack(); }
  else flushTrack();
});
// вход отмечаем раз в день; вместе с ним отправляем все закрытые уроки — так в базу попадает и прежний прогресс
async function trackVisit(u, data) {
  const stamp = `${u.uid}|${Activity.key()}`;
  if (ls.get(VISIT) === stamp) return;
  Track.send("login");
  Object.entries(data.days || {}).forEach(([day, s]) => { if (s.finished) Track.result(Number(day), s.xp || 0, s.finishedOn); });
  await flushTrack();
  if (!hasTrack()) ls.set(VISIT, stamp);   // нет связи: отметим вход при следующем открытии страницы
}

onAuthStateChanged(auth, async u => {
  user = u;
  render();
  if (!u) { Track.stop(); return; }
  setState("Загружаю прогресс…");
  let cloud = null;
  try {
    const snap = await getDoc(ref());
    if (snap.exists()) cloud = JSON.parse(snap.data().data);
  } catch (e) {
    setState("Нет связи с облаком", "err");
    return;
  }
  const local = Progress.load();
  const owner = ls.get(OWNER);
  let merged;
  if (owner && owner !== u.uid) {
    // в браузере прогресс другого аккаунта (он уже сохранён в его облаке): чужие очки не смешиваем
    if (!confirm(`В этом браузере открыт прогресс другого аккаунта. Показать здесь прогресс аккаунта ${u.email || ""}? Прогресс другого аккаунта останется в его облаке.`)) {
      await signOut(auth);
      return;
    }
    merged = cloud || { days: {} };
  } else {
    merged = ProgressSync.merge(local, cloud);   // прогресс, набранный без входа, добавляется к аккаунту
  }
  ls.set(OWNER, u.uid);
  Track.active = true;
  refreshToken().catch(() => {});
  await trackVisit(u, merged);
  scheduleTrack();
  const changedHere = !ProgressSync.same(merged, local);
  const changedCloud = !cloud || !ProgressSync.same(ProgressSync.forCloud(merged), ProgressSync.forCloud(cloud));
  if (changedHere) Progress.save(merged);
  if (changedCloud) await push(true);
  else setState("✓ Прогресс сохранён", "ok");
  if (changedHere) {
    // страница уже нарисована по старым данным — перерисовываем; пока идёт перезагрузка, ничего старого не сохраняем
    ProgressSync.locked = true;
    location.reload();
  }
});
