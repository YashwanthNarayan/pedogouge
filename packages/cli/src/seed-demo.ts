#!/usr/bin/env node
/**
 * pnpm seed:demo — seeds a full demo session into Supabase.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env / .env.local
 * Prints the session UUID at the end → paste into .env.local as DEMO_SESSION_ID
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local from repo root
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function randomHalfvec(): number[] {
  // 1024-dim placeholder until Voyage ingest (T3-04) replaces these
  return Array.from({ length: 1024 }, () => (Math.random() * 2 - 1) * 0.1);
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function stableHash(files: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
  );
  return sha256(JSON.stringify(sorted));
}

async function run() {
  console.log("🌱  Seeding demo session…\n");

  // ── 1. Ensure a demo user exists ────────────────────────────────────────────
  const demoEmail = "demo-student@pedagogue.dev";
  let userId: string;

  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("email", demoEmail)
    .single();

  if (existing) {
    userId = existing.id as string;
    console.log(`   Found existing demo user ${userId}`);
  } else {
    const { data: authUser, error: authErr } = await db.auth.admin.createUser({
      email: demoEmail,
      password: "Demo1234!",
      email_confirm: true,
    });
    if (authErr) throw new Error(`Create auth user: ${authErr.message}`);
    userId = authUser.user!.id;

    const { error: uErr } = await db.from("users").insert({
      id: userId,
      email: demoEmail,
      display_name: "Alex (Demo Student)",
      role: "student",
      birthdate: "2007-03-15",
    });
    if (uErr) throw new Error(`Insert user: ${uErr.message}`);
    console.log(`   Created demo user ${userId}`);
  }

  // ── 2. Session ───────────────────────────────────────────────────────────────
  const blueprint = {
    title: "Habit Tracker with Streaks",
    summary: "A Python CLI app that tracks daily habits and calculates streak counts using file I/O, dictionaries, and functions.",
    features: [
      { id: "f1", name: "Add habit", userStory: "As a user I can add a named habit", acceptanceCriteria: ["habit stored in JSON file"], complexity: "easy", conceptIds: ["files", "dicts"] },
      { id: "f2", name: "Log completion", userStory: "As a user I can mark a habit done today", acceptanceCriteria: ["date stamped", "no duplicates"], complexity: "medium", conceptIds: ["dicts", "lists"] },
      { id: "f3", name: "View streak", userStory: "As a user I can see my current streak", acceptanceCriteria: ["consecutive-day algorithm correct"], complexity: "medium", conceptIds: ["loops", "functions"] },
      { id: "f4", name: "List habits", userStory: "As a user I can list all habits with streak counts", acceptanceCriteria: ["sorted by streak desc"], complexity: "easy", conceptIds: ["lists", "loops"] },
      { id: "f5", name: "Reset habit", userStory: "As a user I can reset a habit's history", acceptanceCriteria: ["confirmation prompt"], complexity: "trivial", conceptIds: ["dicts", "files"] },
    ],
    dataModels: [
      { name: "Habit", fields: [{ name: "name", type: "str" }, { name: "completions", type: "list[str]" }] },
    ],
    apiSurface: [],
    conceptGraph: [
      { id: "variables", name: "Variables & Types", prerequisites: [], estimatedMinutes: 20 },
      { id: "loops", name: "Loops & Iteration", prerequisites: ["variables"], estimatedMinutes: 30 },
      { id: "functions", name: "Functions", prerequisites: ["variables"], estimatedMinutes: 40 },
      { id: "lists", name: "Lists & Slicing", prerequisites: ["variables", "loops"], estimatedMinutes: 30 },
      { id: "dicts", name: "Dictionaries", prerequisites: ["lists"], estimatedMinutes: 35 },
      { id: "files", name: "File I/O & JSON", prerequisites: ["dicts"], estimatedMinutes: 30 },
      { id: "recursion", name: "Recursion", prerequisites: ["functions"], estimatedMinutes: 50 },
      { id: "oop", name: "OOP — Classes & Objects", prerequisites: ["functions", "dicts"], estimatedMinutes: 60 },
    ],
    scopedMvp: ["f1", "f2", "f3", "f4"],
    ambiguities: ["Should streaks reset at midnight local time or UTC?"],
    recommendedLanguage: "python" as const,
    starterRepo: {
      files: [
        { path: "main.py", content: "# Habit Tracker\nimport json\nfrom habits import load_habits, save_habits\n\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()\n" },
        { path: "habits.py", content: "import json, os\nHABITS_FILE = 'habits.json'\n\ndef load_habits():\n    if not os.path.exists(HABITS_FILE):\n        return {}\n    with open(HABITS_FILE) as f:\n        return json.load(f)\n\ndef save_habits(habits):\n    with open(HABITS_FILE, 'w') as f:\n        json.dump(habits, f, indent=2)\n" },
        { path: "tests/test_streak.py", content: "import pytest\nfrom habits import calculate_streak\n\ndef test_empty_streak():\n    assert calculate_streak([]) == 0\n\ndef test_single_day():\n    assert calculate_streak(['2026-04-21']) == 1\n" },
      ],
      testCmd: "pytest tests/",
    },
  };

  const { data: sess, error: sErr } = await db.from("sessions").insert({
    user_id: userId,
    project_idea: "Build a habit tracker with daily streaks",
    blueprint_json: blueprint,
    workspace_root: "/tmp/pedagogue-demo/habit-tracker",
  }).select("id").single();
  if (sErr) throw new Error(`Insert session: ${sErr.message}`);
  const sessionId = sess!.id as string;
  console.log(`   Created session ${sessionId}`);

  // ── 3. Concept nodes ─────────────────────────────────────────────────────────
  const concepts: Array<{ id: string; name: string; prerequisites: string[]; mastery: number; decay: number }> = [
    { id: "variables", name: "Variables & Types", prerequisites: [], mastery: 0.82, decay: 0.05 },
    { id: "loops", name: "Loops & Iteration", prerequisites: ["variables"], mastery: 0.61, decay: 0.08 },
    { id: "functions", name: "Functions", prerequisites: ["variables"], mastery: 0.74, decay: 0.06 },
    { id: "lists", name: "Lists & Slicing", prerequisites: ["variables", "loops"], mastery: 0.55, decay: 0.09 },
    { id: "dicts", name: "Dictionaries", prerequisites: ["lists"], mastery: 0.43, decay: 0.1 },
    { id: "files", name: "File I/O & JSON", prerequisites: ["dicts"], mastery: 0.31, decay: 0.12 },
    { id: "recursion", name: "Recursion", prerequisites: ["functions"], mastery: 0.18, decay: 0.15 },
    { id: "oop", name: "OOP — Classes & Objects", prerequisites: ["functions", "dicts"], mastery: 0.09, decay: 0.18 },
  ];

  const posGrid = [
    [100, 100], [300, 50], [300, 200], [500, 50],
    [500, 200], [700, 200], [500, 350], [700, 350],
  ];

  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i]!;
    const [x, y] = posGrid[i] ?? [i * 100, 200];
    const { error } = await db.from("concept_nodes").insert({
      id: c.id,
      session_id: sessionId,
      name: c.name,
      prerequisites: c.prerequisites,
      mastery_score: c.mastery,
      decay_rate: c.decay,
      last_tested_at: new Date(Date.now() - Math.random() * 3_600_000).toISOString(),
      struggle_pattern: c.mastery < 0.3 ? "conceptual_gap" : c.mastery < 0.5 ? "integration" : "none",
      x, y,
      embedding: randomHalfvec(),
    });
    if (error) throw new Error(`Insert concept_node ${c.id}: ${error.message}`);
  }
  console.log(`   Seeded ${concepts.length} concept nodes`);

  // Edges
  for (const c of concepts) {
    for (const prereq of c.prerequisites) {
      await db.from("concept_edges").insert({ session_id: sessionId, from_node: prereq, to_node: c.id });
    }
  }
  console.log(`   Seeded concept edges`);

  // ── 4. KB chunks (3 per concept, placeholder embeddings) ────────────────────
  const difficulties = ["beginner", "intermediate", "advanced"] as const;
  const chunkBodies: Record<string, string[]> = {
    variables: [
      "A **variable** is a named container for a value. In Python you assign with `=`: `x = 5`. Python is dynamically typed — the same name can hold different types at different times.",
      "**Scope** determines where a variable is visible. Variables defined inside a function are *local*; those at module level are *global*. Use `global x` only when you must mutate a module-level name from inside a function.",
      "Python's **memory model** is reference-based. `a = [1,2,3]; b = a` means both `a` and `b` point to the same list object. Mutating via `b.append(4)` affects `a` too. Use `b = a.copy()` or `b = a[:]` to get an independent copy.",
    ],
    loops: [
      "A `for` loop iterates over any iterable: `for item in my_list:`. Use `range(n)` to loop `n` times. Avoid `for i in range(len(lst))` when you only need values — prefer `for item in lst`.",
      "**Nested loops** multiply: two loops each of length `n` give O(n²) operations. `break` exits the innermost loop; `continue` skips to the next iteration. `for…else` runs the `else` block only if the loop wasn't broken.",
      "**Generators** are lazy iterables: `(x*x for x in range(1000))` computes values on demand, saving memory. `yield` turns a function into a generator. Use `itertools` (chain, islice, product) for composable iteration without materializing lists.",
    ],
    functions: [
      "Define functions with `def name(params):`. Functions are first-class objects — you can pass them as arguments. Default arguments are evaluated *once* at definition time: `def f(lst=[])` is a common gotcha.",
      "**Higher-order functions** take or return functions. `map(fn, iterable)`, `filter(pred, iterable)`, and `sorted(iterable, key=fn)` are built-in. **Closures** capture variables from the enclosing scope: the inner function remembers `x` even after the outer returns.",
      "**Decorators** wrap a function to extend its behaviour: `@timer` above `def my_func` replaces `my_func` with `timer(my_func)`. Use `functools.wraps` to preserve the original function's `__name__` and `__doc__`. Stack multiple decorators (applied bottom-up).",
    ],
    lists: [
      "Python lists are ordered, mutable sequences. Index from 0; negative indices count from the end (`lst[-1]` is last). Core methods: `append`, `extend`, `insert`, `remove`, `pop`, `sort`, `reverse`.",
      "**Slicing** `lst[start:stop:step]` returns a new list. Omit bounds freely: `lst[:3]` is the first three, `lst[::2]` every other element. Slices never raise IndexError. **List comprehensions** `[expr for x in it if cond]` are idiomatic and faster than equivalent `for` + `append`.",
      "`list.sort()` is in-place (Timsort, O(n log n), stable). `sorted()` returns a new list. For O(1) append/pop from both ends use `collections.deque`. Understand time complexity: `in` on a list is O(n); on a `set` it's O(1).",
    ],
    dicts: [
      "Dictionaries map unique **keys** to values. Keys must be hashable (strings, numbers, tuples of hashables). Access: `d[key]` (raises KeyError if missing) or `d.get(key, default)` (safe). Iterate: `d.items()`, `d.keys()`, `d.values()`.",
      "`collections.defaultdict(list)` auto-creates missing keys. `collections.Counter` counts hashables. Dict comprehensions: `{k: v for k, v in pairs}`. Merging in Python 3.9+: `merged = a | b`. `dict.setdefault(key, default)` sets and returns the default only if key absent.",
      "Dicts are implemented as **hash tables**: average O(1) lookup. A hash collision occurs when two keys have the same hash; Python resolves via open addressing. In Python 3.7+ dicts preserve insertion order (guaranteed, not just CPython detail).",
    ],
    files: [
      "Open files with `open(path, mode)` where mode is `'r'` (read), `'w'` (write, truncates), `'a'` (append), `'rb'`/`'wb'` (binary). Always use a **context manager**: `with open(path) as f:` — it closes the file even if an exception is raised.",
      "`json.load(f)` parses JSON from a file object; `json.dump(obj, f, indent=2)` serialises. `pathlib.Path` gives an OO interface: `Path('data') / 'habits.json'` builds paths safely. `path.exists()`, `path.read_text()`, `path.write_text()` cover most needs.",
      "Binary files store raw bytes — images, PDFs, pickled objects. `struct.pack` / `struct.unpack` read/write fixed-width binary records. `csv.reader` / `csv.DictReader` parse CSV with correct quoting. For large files, iterate line-by-line rather than loading fully into memory.",
    ],
    recursion: [
      "A recursive function calls itself. Every recursive solution needs a **base case** (stops the recursion) and a **recursive case** (reduces the problem). Classic example: `def factorial(n): return 1 if n == 0 else n * factorial(n-1)`.",
      "Recursion maps naturally to tree structures. DFS over a directory tree, parsing nested JSON, and tree search are all cleaner recursive than iterative. Python's default recursion limit is 1000 (`sys.setrecursionlimit`). Deep recursion → `RecursionError`.",
      "**Memoization** caches results of expensive recursive calls: `@functools.lru_cache(maxsize=None)`. Dynamic programming rewrites recursive solutions iteratively to avoid stack overflow and improve cache locality. Tail-call optimisation is *not* performed by CPython — convert deep tail recursion to a loop.",
    ],
    oop: [
      "A **class** is a blueprint; an **object** is an instance. `__init__(self, ...)` initialises instance attributes. `self` refers to the instance. Class attributes are shared across instances; instance attributes are per-object.",
      "**Inheritance**: `class Dog(Animal)` gives Dog all of Animal's methods. `super().__init__(...)` calls the parent constructor. **Polymorphism**: different classes can implement the same method name; Python calls the right version at runtime (duck typing).",
      "**Special methods** (`__str__`, `__repr__`, `__len__`, `__eq__`, `__lt__`) make objects behave like built-ins. `@property` turns a method into an attribute. `@classmethod` receives the class as first arg; `@staticmethod` receives neither class nor instance — use for utility functions.",
    ],
  };

  let chunkCount = 0;
  for (const concept of concepts) {
    const bodies = chunkBodies[concept.id] ?? [];
    for (let d = 0; d < 3; d++) {
      const { error } = await db.from("kb_chunks").insert({
        concept_id: concept.id,
        body_md: bodies[d] ?? `Placeholder content for ${concept.name} at level ${d}`,
        embedding: randomHalfvec(),
        difficulty: difficulties[d],
        source_url: `https://pedagogue.app/curriculum/${concept.id}`,
      });
      if (error) throw new Error(`Insert kb_chunk: ${error.message}`);
      chunkCount++;
    }
  }
  console.log(`   Seeded ${chunkCount} KB chunks`);

  // ── 5. Editor snapshots (chain-linked) ───────────────────────────────────────
  const fileVersions: Array<Record<string, string>> = [
    { "main.py": "# Habit Tracker\ndef main():\n    pass\n\nmain()" },
    { "main.py": "import json\n\ndef main():\n    habits = {}\n    print(habits)\n\nmain()" },
    { "main.py": "import json\n\nHABITS = 'habits.json'\n\ndef load():\n    try:\n        with open(HABITS) as f:\n            return json.load(f)\n    except FileNotFoundError:\n        return {}\n\nmain()" },
    { "main.py": "import json\n\nHABITS = 'habits.json'\n\ndef load():\n    try:\n        with open(HABITS) as f:\n            return json.load(f)\n    except FileNotFoundError:\n        return {}\n\ndef save(h):\n    with open(HABITS, 'w') as f:\n        json.dump(h, f)\n\ndef main():\n    h = load()\n    print(h)\n\nmain()" },
    { "main.py": "import json\nfrom datetime import date\n\nHABITS = 'habits.json'\n\ndef load():\n    try:\n        with open(HABITS) as f:\n            return json.load(f)\n    except FileNotFoundError:\n        return {}\n\ndef save(h):\n    with open(HABITS, 'w') as f:\n        json.dump(h, f, indent=2)\n\ndef add(name):\n    h = load()\n    h[name] = []\n    save(h)\n\ndef log(name):\n    h = load()\n    today = str(date.today())\n    if today not in h.get(name, []):\n        h[name].append(today)\n    save(h)\n\ndef main():\n    add('exercise')\n    log('exercise')\n    print(load())\n\nmain()" },
    { "main.py": "import json\nfrom datetime import date, timedelta\n\nHABITS = 'habits.json'\n\ndef load():\n    try:\n        with open(HABITS) as f: return json.load(f)\n    except FileNotFoundError: return {}\n\ndef save(h):\n    with open(HABITS,'w') as f: json.dump(h,f,indent=2)\n\ndef add(name):\n    h=load(); h[name]=[]; save(h)\n\ndef log(name):\n    h=load(); today=str(date.today())\n    if today not in h.get(name,[]): h[name].append(today)\n    save(h)\n\ndef streak(name):\n    h=load(); days=sorted(h.get(name,[]),reverse=True)\n    if not days: return 0\n    count=1\n    for i in range(len(days)-1):\n        if date.fromisoformat(days[i])-date.fromisoformat(days[i+1])==timedelta(1):\n            count+=1\n        else: break\n    return count\n\ndef main():\n    add('exercise'); log('exercise')\n    print('Streak:', streak('exercise'))\n\nmain()" },
    { "main.py": "import json, sys\nfrom datetime import date, timedelta\n\nHABITS='habits.json'\n\ndef load():\n    try:\n        with open(HABITS) as f: return json.load(f)\n    except FileNotFoundError: return {}\n\ndef save(h):\n    with open(HABITS,'w') as f: json.dump(h,f,indent=2)\n\ndef add(n): h=load(); h[n]=[]; save(h)\ndef log(n):\n    h=load(); t=str(date.today())\n    if t not in h.get(n,[]): h[n].append(t)\n    save(h)\n\ndef streak(n):\n    days=sorted(load().get(n,[]),reverse=True)\n    if not days: return 0\n    c=1\n    for i in range(len(days)-1):\n        if date.fromisoformat(days[i])-date.fromisoformat(days[i+1])==timedelta(1): c+=1\n        else: break\n    return c\n\ncmd=sys.argv[1] if len(sys.argv)>1 else 'list'\nif cmd=='add': add(sys.argv[2])\nelif cmd=='log': log(sys.argv[2])\nelif cmd=='streak': print(streak(sys.argv[2]))\nelse: print(load())\n", "tests/test_streak.py": "from main import streak, add, log\n\ndef test_no_habit(): assert streak('x')==0\n" },
    { "main.py": "import json, sys\nfrom datetime import date, timedelta\n\nHABITS='habits.json'\n\ndef load():\n    try:\n        with open(HABITS) as f: return json.load(f)\n    except FileNotFoundError: return {}\n\ndef save(h):\n    with open(HABITS,'w') as f: json.dump(h,f,indent=2)\n\ndef add(n): h=load(); h.setdefault(n,[]); save(h)\ndef log(n):\n    h=load(); t=str(date.today())\n    if t not in h.get(n,[]): h[n].append(t)\n    save(h)\n\ndef streak(n):\n    days=sorted(load().get(n,[]),reverse=True)\n    if not days: return 0\n    c=1\n    for i in range(len(days)-1):\n        diff=date.fromisoformat(days[i])-date.fromisoformat(days[i+1])\n        if diff.days==1: c+=1\n        else: break\n    return c\n\nif __name__=='__main__':\n    cmd=sys.argv[1] if len(sys.argv)>1 else 'list'\n    if cmd=='add': add(sys.argv[2])\n    elif cmd=='log': log(sys.argv[2])\n    elif cmd=='streak': print(streak(sys.argv[2]))\n    else:\n        h=load()\n        for name,days in h.items(): print(f'{name}: {streak(name)}-day streak')\n", "tests/test_streak.py": "from main import streak\nimport pytest\n\ndef test_no_habit(): assert streak('x')==0\ndef test_streak_one(): assert True  # seeded\n" },
    { "main.py": "import json, sys\nfrom datetime import date, timedelta\nfrom pathlib import Path\n\nHABITS=Path('habits.json')\n\ndef load(): return json.loads(HABITS.read_text()) if HABITS.exists() else {}\ndef save(h): HABITS.write_text(json.dumps(h,indent=2))\n\ndef add(n): h=load(); h.setdefault(n,[]); save(h)\ndef log(n):\n    h=load(); t=str(date.today())\n    if t not in h.get(n,[]): h[n].append(t)\n    save(h)\n\ndef streak(n):\n    days=sorted(load().get(n,[]),reverse=True)\n    if not days: return 0\n    c=1\n    for i in range(len(days)-1):\n        if (date.fromisoformat(days[i])-date.fromisoformat(days[i+1])).days==1: c+=1\n        else: break\n    return c\n\nif __name__=='__main__':\n    cmd=sys.argv[1] if len(sys.argv)>1 else 'list'\n    match cmd:\n        case 'add': add(sys.argv[2])\n        case 'log': log(sys.argv[2])\n        case 'streak': print(streak(sys.argv[2]))\n        case _:\n            for n,_ in load().items(): print(f'{n}: streak={streak(n)}')\n", "tests/test_streak.py": "from main import streak\n\ndef test_empty(): assert streak('x')==0\ndef test_single(tmp_path, monkeypatch):\n    monkeypatch.chdir(tmp_path)\n    from main import add, log\n    add('run'); log('run')\n    assert streak('run')==1\n" },
    { "main.py": "\"\"\"Habit Tracker — final version for demo\"\"\"\nimport json, sys\nfrom datetime import date, timedelta\nfrom pathlib import Path\n\nHABITS = Path('habits.json')\n\ndef load() -> dict: return json.loads(HABITS.read_text()) if HABITS.exists() else {}\ndef save(h: dict) -> None: HABITS.write_text(json.dumps(h, indent=2))\n\ndef add(name: str) -> None:\n    h = load(); h.setdefault(name, []); save(h)\n    print(f'✓ Habit \"{name}\" added')\n\ndef log_today(name: str) -> None:\n    h = load(); today = str(date.today())\n    if today in h.get(name, []):\n        print(f'Already logged today for \"{name}\"'); return\n    h[name].append(today); save(h)\n    print(f'✓ Logged \"{name}\" for {today} (streak: {streak(name)})')\n\ndef streak(name: str) -> int:\n    days = sorted(load().get(name, []), reverse=True)\n    if not days: return 0\n    count = 1\n    for i in range(len(days) - 1):\n        delta = date.fromisoformat(days[i]) - date.fromisoformat(days[i+1])\n        if delta.days == 1: count += 1\n        else: break\n    return count\n\ndef list_all() -> None:\n    h = load()\n    if not h: print('No habits yet. Run: python main.py add <name>'); return\n    for name in sorted(h, key=streak, reverse=True):\n        bar = '█' * streak(name)\n        print(f'{name:20} {streak(name):3d}-day streak  {bar}')\n\nif __name__ == '__main__':\n    match sys.argv[1] if len(sys.argv) > 1 else 'list':\n        case 'add':    add(sys.argv[2])\n        case 'log':    log_today(sys.argv[2])\n        case 'streak': print(streak(sys.argv[2]))\n        case 'list':   list_all()\n        case cmd:      print(f'Unknown command: {cmd}')\n", "tests/test_streak.py": "from pathlib import Path\nimport pytest\n\ndef test_empty_streak(tmp_path, monkeypatch):\n    monkeypatch.chdir(tmp_path)\n    from main import streak\n    assert streak('running') == 0\n\ndef test_single_day_streak(tmp_path, monkeypatch):\n    monkeypatch.chdir(tmp_path)\n    from main import add, log_today, streak\n    add('running'); log_today('running')\n    assert streak('running') == 1\n\ndef test_two_day_streak(tmp_path, monkeypatch):\n    from datetime import date, timedelta\n    monkeypatch.chdir(tmp_path)\n    import main, json\n    main.add('running')\n    yesterday = str(date.today() - timedelta(1))\n    h = main.load(); h['running'].append(yesterday); main.save(h)\n    main.log_today('running')\n    assert main.streak('running') == 2\n" },
  ];

  let prevHash = "";
  let snapshotCount = 0;
  const baseTs = Date.now() - 10 * 30_000; // 10 snapshots at 30s intervals
  for (let i = 0; i < fileVersions.length; i++) {
    const files = fileVersions[i]!;
    const thisHash = stableHash(files);
    const ts = new Date(baseTs + i * 30_000).toISOString();
    const { error } = await db.from("editor_snapshots").insert({
      session_id: sessionId,
      ts,
      files_json: files,
      diff_from_prev: i === 0 ? null : { changed: Object.keys(files) },
      prev_hash: prevHash,
      this_hash: thisHash,
    });
    if (error) throw new Error(`Insert snapshot ${i}: ${error.message}`);
    prevHash = thisHash;
    snapshotCount++;
  }
  console.log(`   Seeded ${snapshotCount} editor snapshots (chain-linked)`);

  // ── 6. AST diagnostics ──────────────────────────────────────────────────────
  const diags = [
    { file: "main.py", line: 5, column_num: 8, rule_id: "for-in-len", severity: "warning", message: "Use `for item in lst` instead of `for i in range(len(lst))`", concept_id: "loops" },
    { file: "main.py", line: 12, column_num: 4, rule_id: "bare-except", severity: "warning", message: "Bare `except:` catches all exceptions including KeyboardInterrupt; use `except Exception:`", concept_id: "files" },
    { file: "main.py", line: 18, column_num: 0, rule_id: "mutable-default", severity: "error", message: "Mutable default argument `def f(lst=[])` is evaluated once at definition time", concept_id: "functions" },
    { file: "main.py", line: 24, column_num: 8, rule_id: "dict-get-default", severity: "hint", message: "Use `d.get(key, default)` instead of `if key in d: d[key]` pattern", concept_id: "dicts" },
    { file: "tests/test_streak.py", line: 3, column_num: 0, rule_id: "missing-assertion", severity: "info", message: "Test function body contains no `assert` statement", concept_id: "functions" },
  ];

  for (const d of diags) {
    const { error } = await db.from("ast_diagnostics").insert({ session_id: sessionId, ts: new Date().toISOString(), ...d });
    if (error) throw new Error(`Insert diagnostic: ${error.message}`);
  }
  console.log(`   Seeded ${diags.length} AST diagnostics`);

  // ── 7. Interventions ─────────────────────────────────────────────────────────
  const interventions = [
    { concept_id: "loops", tier: 1, content_md: "💡 You've used `range(len(lst))` again. Try `for item in lst` — it's more Pythonic and avoids off-by-one errors.", outcome: "acknowledged", delivery_channel: "chat" },
    { concept_id: "loops", tier: 2, content_md: "**Quick check:** When would you use `enumerate(lst)` instead of `range(len(lst))`?\n\n- A) When you need the index and the value\n- B) When you need to modify the list in-place\n- C) When the list is empty", outcome: "correct", delivery_channel: "chat" },
    { concept_id: "files", tier: 3, content_md: "## File I/O — Micro-lesson\n\nYour `open()` call isn't in a `with` block. If an exception happens, the file stays open.\n\n```python\n# ❌ Risky\nf = open('data.json')\ndata = json.load(f)\nf.close()  # never reached if json.load raises\n\n# ✅ Safe\nwith open('data.json') as f:\n    data = json.load(f)  # file closes automatically\n```\n\nContext managers call `__exit__` even on exceptions.", outcome: "lesson_viewed", delivery_channel: "notebook" },
  ];

  for (const iv of interventions) {
    const { error } = await db.from("interventions").insert({ session_id: sessionId, ts: new Date().toISOString(), ...iv });
    if (error) throw new Error(`Insert intervention: ${error.message}`);
  }
  console.log(`   Seeded ${interventions.length} interventions`);

  // ── 8. Credential (test-key signed placeholder) ──────────────────────────────
  const vcSubject = {
    projectTitle: "Habit Tracker with Streaks",
    conceptsDemonstrated: concepts.slice(0, 5).map(c => ({ id: c.id, name: c.name, masteryScore: c.mastery })),
    competencyRadar: { variables: 0.82, loops: 0.61, functions: 0.74, lists: 0.55, dicts: 0.43 },
    proofOfStruggle: [
      { errorSignature: "for-in-len@main.py:5", fixDiff: "-for i in range(len(days)):\n+for day in days:", defenseAnswerId: "q1" },
    ],
    interviewSummary: {
      phases: [
        { phase: "blueprint_interrogation", questions: 4 },
        { phase: "bug_injection", questions: 3 },
        { phase: "counterfactual", questions: 2 },
      ],
      overallRubric: { correctness: 0.78, reasoningDepth: 0.65, tradeoffAwareness: 0.72 },
    },
  };

  const demoJwt = `demo.${Buffer.from(JSON.stringify(vcSubject)).toString("base64url")}.placeholder-sig`;
  const vcJson = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "PedagogueCompletionCredential"],
    issuer: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://pedagogue.app"}/issuer`,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: `did:pedagogue:${userId}`, ...vcSubject },
    proof: { type: "DataIntegrityProof", cryptosuite: "eddsa-2022", proofValue: "DEMO_ONLY_NOT_REAL" },
  };

  const { error: credErr } = await db.from("credentials").insert({
    session_id: sessionId,
    jwt: demoJwt,
    radar_json: vcSubject.competencyRadar,
    proof_of_struggle_json: vcSubject.proofOfStruggle,
    vc_json: vcJson,
  });
  if (credErr) throw new Error(`Insert credential: ${credErr.message}`);
  console.log(`   Seeded demo credential`);

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log(`
✅  Demo session seeded successfully!

   Session ID: ${sessionId}
   User ID:    ${userId}
   Email:      ${demoEmail}  /  password: Demo1234!

Add to .env.local:
   DEMO_SESSION_ID=${sessionId}
`);
}

run().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
