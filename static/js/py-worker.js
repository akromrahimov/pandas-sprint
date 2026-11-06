/* Python в браузере (Pyodide) в отдельном потоке: страница не зависает,
   а зациклившийся код можно остановить, просто перезапустив воркер.
   Запускается как module-воркер: import() грузит Pyodide с CDN через обычный CORS-запрос. */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const RUNNER = `
import ast, base64, io, json, os, sys, traceback
os.environ["MPLBACKEND"] = "Agg"
import pandas as pd

pd.set_option("display.width", 120)
pd.set_option("display.max_columns", 20)

FILE = "<твой код>"
TIPS = {
    "NameError": "Python не знает такое имя. Проверь опечатку и то, что переменная создана выше.",
    "KeyError": "Нет колонки или метки с таким именем. Проверь написание и кавычки.",
    "AttributeError": "У этого объекта нет такого метода или свойства. Проверь название.",
    "SyntaxError": "Ошибка в записи кода: проверь скобки, кавычки, запятые и двоеточия.",
    "IndentationError": "Лишний или недостающий отступ в начале строки.",
    "FileNotFoundError": "Файл не найден. Проверь имя файла: оно должно совпадать с названием в уроке.",
}

def _format_error(e):
    msg = f"{type(e).__name__}: {e}"
    line = getattr(e, "lineno", None) if isinstance(e, SyntaxError) else None
    if line is None:
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == FILE]
        line = frames[-1].lineno if frames else None
    if "is not callable" in str(e) and "tuple" in str(e):
        tip = "Похоже, лишние скобки: shape — свойство, пишется без ()."
    else:
        tip = TIPS.get(type(e).__name__, "")
    head = f"Ошибка в строке {line}" if line else "Ошибка"
    return head + "\\n" + msg + ("\\n\\n💡 " + tip if tip else "")

def _figures():
    """Графики matplotlib превращаем в PNG, чтобы показать их под выводом."""
    if "matplotlib.pyplot" not in sys.modules:
        return []
    plt = sys.modules["matplotlib.pyplot"]
    images = []
    for n in plt.get_fignums():
        b = io.BytesIO()
        plt.figure(n).savefig(b, format="png", dpi=90, bbox_inches="tight")
        images.append(base64.b64encode(b.getvalue()).decode())
    plt.close("all")
    return images

def _is_plot(value):
    return type(value).__module__.startswith("matplotlib") or (
        isinstance(value, (list, tuple)) and value and type(value[0]).__module__.startswith("matplotlib"))

def run(setup, code):
    buf = io.StringIO()
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = io.StringIO()  # вывод подготовки (загрузка файла, прошлые шаги) не показываем
    env = {"__name__": "__main__"}
    err = None
    try:
        exec(setup, env)
        sys.stdout = sys.stderr = buf
        tree = ast.parse(code, FILE, "exec")
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, FILE, "exec"), env)
        if last is not None:
            value = eval(compile(last, FILE, "eval"), env)
            if value is not None and not _is_plot(value):
                # как в Jupyter: значение последней строки выводится само; числа numpy — просто числом
                print(value if type(value).__module__ == "numpy" and getattr(value, "ndim", 1) == 0 else repr(value))
    except Exception as e:
        err = _format_error(e)
    finally:
        sys.stdout, sys.stderr = old
    out = buf.getvalue()
    if len(out) > 20000:
        out = out[:20000] + "\\n… вывод обрезан"
    try:
        images = _figures()
    except Exception:
        images = []
    return json.dumps({"out": out, "err": err, "images": images}, ensure_ascii=False)
`;

let py = null;
const loaded = new Set();

// Библиотеки кроме pandas (scipy, matplotlib, duckdb…) грузим, только когда код их использует
async function loadLibraries(id, src) {
  const need = [];
  if (/\.plot\b|\.hist\(|\bplt\b|matplotlib/.test(src)) need.push("matplotlib");
  if (/excel/i.test(src)) need.push("openpyxl");
  const fresh = need.filter(p => !loaded.has(p));
  const imports = /^\s*(import|from)\s+(scipy|duckdb|pyarrow|statsmodels|matplotlib|sqlite3)/m.test(src);
  if (!fresh.length && !imports) return;
  self.postMessage({ type: "progress", id });
  await py.loadPackagesFromImports(src);
  for (const p of fresh) {
    if (p === "openpyxl") {
      await py.loadPackage("micropip");
      await py.pyimport("micropip").install("openpyxl");
    } else {
      await py.loadPackage(p);
    }
    loaded.add(p);
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
      py = await loadPyodide({ indexURL: PYODIDE });
      await py.loadPackage(["pandas"]);
      for (const f of data.files) {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`не удалось скачать ${f.name}`);
        py.FS.writeFile(f.name, new Uint8Array(await res.arrayBuffer()));
      }
      py.runPython(RUNNER);
      self.postMessage({ type: "ready", version: py.runPython("pd.__version__") });
    } else if (data.type === "run") {
      await loadLibraries(data.id, data.setup + "\n" + data.code);
      const run = py.globals.get("run");
      const result = JSON.parse(run(data.setup, data.code));
      run.destroy();
      self.postMessage({ type: "result", id: data.id, ...result });
    }
  } catch (e) {
    self.postMessage({ type: "fail", id: data.id, message: String(e && e.message || e) });
  }
};
