#!/usr/bin/env node
/**
 * pnpm ingest:kb — chunks inline CS curriculum content and upserts into kb_chunks
 * with real Voyage voyage-code-3 embeddings.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY in .env.local
 * Prints: "Ingested N chunks across M concepts"
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── env loading ───────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const VOYAGE_KEY   = process.env.VOYAGE_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!VOYAGE_KEY) {
  console.error("❌  Set VOYAGE_API_KEY — needed for real embeddings");
  process.exit(1);
}

// ── Voyage embed (duplicated from apps/web/lib/embeddings to avoid build dep) ─
const VOYAGE_URL   = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE   = 128;
const MAX_RETRIES  = 3;

async function embedBatch(texts: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(200 * 2 ** attempt);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE_KEY}` },
      body: JSON.stringify({ model: "voyage-code-3", input: texts, input_type: "document", output_dimension: 1024 }),
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Voyage ${res.status}`);
      await sleep(parseInt(res.headers.get("retry-after") ?? "2", 10) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map(d => d.embedding);
  }
  throw lastErr;
}

async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    process.stdout.write(`   Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}…\r`);
    const vecs = await embedBatch(batch);
    out.push(...vecs);
  }
  process.stdout.write("\n");
  return out;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Curriculum content ────────────────────────────────────────────────────────
// ~500 KB of high-quality CS pedagogy content chunked by H2 heading.
// Each chunk covers one subtopic; concept_id maps to the concept DAG.

interface RawChunk {
  concept_id: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  source_url: string;
  body_md: string;
}

const BASE = "https://pedagogue.app/curriculum";

const CHUNKS: RawChunk[] = [

  // ══════════════════════════════════════════════════════════════════════════════
  // VARIABLES & TYPES
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "variables", difficulty: "beginner", source_url: `${BASE}/variables/intro`,
    body_md: `## What Is a Variable?

A **variable** is a named label that refers to a value stored in memory. Think of it as a sticky note: the note has a name (the variable name) and points to an object (the value).

\`\`\`python
age = 17          # age → integer object 17
name = "Alex"     # name → string object "Alex"
height = 5.9      # height → float object 5.9
is_student = True # is_student → bool object True
\`\`\`

Python is **dynamically typed**: a variable can refer to any type, and you can rebind it at any time.

\`\`\`python
x = 10      # x is an int
x = "hello" # now x is a str — perfectly legal
\`\`\`

### Naming rules
- Start with a letter or underscore: \`_count\`, \`total\`
- No spaces; use underscores: \`first_name\` (snake_case is the Python convention)
- Case-sensitive: \`Age\` ≠ \`age\`
- Avoid built-in names like \`list\`, \`str\`, \`id\`

### Check the type
\`\`\`python
print(type(age))      # <class 'int'>
print(isinstance(age, int))  # True
\`\`\``,
  },
  {
    concept_id: "variables", difficulty: "beginner", source_url: `${BASE}/variables/assignment`,
    body_md: `## Assignment and Multiple Assignment

Python supports several convenient assignment forms.

\`\`\`python
# Augmented assignment
count = 0
count += 1   # count = count + 1
count *= 2   # count = count * 2

# Multiple assignment on one line
x = y = z = 0   # all three point to the same 0

# Tuple unpacking (swap without a temp variable)
a, b = 1, 2
a, b = b, a   # swap!
print(a, b)   # 2 1

# Extended unpacking
first, *rest = [1, 2, 3, 4]
print(first)  # 1
print(rest)   # [2, 3, 4]
\`\`\`

### Constants by convention
Python has no built-in constant keyword. Use ALL_CAPS to signal intent:
\`\`\`python
MAX_RETRIES = 3
PI = 3.14159
\`\`\`
Anyone seeing ALL_CAPS knows not to reassign it.`,
  },
  {
    concept_id: "variables", difficulty: "intermediate", source_url: `${BASE}/variables/scope`,
    body_md: `## Scope and the LEGB Rule

Python looks up names in this order: **L**ocal → **E**nclosing → **G**lobal → **B**uilt-in.

\`\`\`python
x = "global"

def outer():
    x = "enclosing"

    def inner():
        x = "local"
        print(x)   # "local"  ← found in Local scope

    inner()
    print(x)       # "enclosing"

outer()
print(x)           # "global"
\`\`\`

### The \`global\` and \`nonlocal\` keywords
\`\`\`python
counter = 0

def increment():
    global counter   # without this, assignment creates a local 'counter'
    counter += 1

def make_counter():
    count = 0
    def inc():
        nonlocal count   # mutate the enclosing function's 'count'
        count += 1
        return count
    return inc

c = make_counter()
print(c())  # 1
print(c())  # 2
\`\`\`

**Rule of thumb:** avoid \`global\` — it makes functions harder to test. Prefer passing values as arguments and returning results.`,
  },
  {
    concept_id: "variables", difficulty: "intermediate", source_url: `${BASE}/variables/types-deep`,
    body_md: `## Python's Type System in Depth

Everything in Python is an **object** with a type, identity, and value.

\`\`\`python
a = [1, 2, 3]
id(a)    # unique memory address
type(a)  # <class 'list'>
\`\`\`

### Mutable vs immutable
| Immutable | Mutable |
|-----------|---------|
| int, float, bool, str, tuple, frozenset | list, dict, set, bytearray |

Immutable objects cannot be changed in place. \`s = "hello"; s[0] = "H"\` raises \`TypeError\`.

### Type coercion
\`\`\`python
int("42")      # 42
float("3.14")  # 3.14
str(100)       # "100"
bool(0)        # False  (0, "", [], {}, None are all falsy)
list("abc")    # ['a', 'b', 'c']
\`\`\`

### Walrus operator (Python 3.8+)
\`\`\`python
# Without walrus
data = fetch()
if data:
    process(data)

# With walrus — assigns and tests in one step
if data := fetch():
    process(data)
\`\`\``,
  },
  {
    concept_id: "variables", difficulty: "advanced", source_url: `${BASE}/variables/memory-model`,
    body_md: `## Python's Memory Model and Object Identity

Python uses **reference counting** (+ cycle-detecting GC) for memory management.

\`\`\`python
import sys
a = [1, 2, 3]
b = a            # both names reference the SAME list object
sys.getrefcount(a)  # ≥ 2 (one extra for getrefcount's argument)

b.append(4)
print(a)         # [1, 2, 3, 4] — a sees the change!
\`\`\`

### Shallow vs deep copy
\`\`\`python
import copy

original = [[1, 2], [3, 4]]
shallow  = original.copy()      # or original[:]
deep     = copy.deepcopy(original)

original[0].append(99)
print(shallow[0])   # [1, 2, 99]  — inner list is shared
print(deep[0])      # [1, 2]      — completely independent
\`\`\`

### Small integer caching and string interning
CPython caches integers in [-5, 256] and interns short strings, so:
\`\`\`python
a = 256; b = 256
a is b   # True  (same cached object)

a = 257; b = 257
a is b   # False  (two separate objects, though a == b is True)
\`\`\`
Use \`==\` to compare **values**; use \`is\` only to test for \`None\`, \`True\`, or \`False\`.`,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // LOOPS & ITERATION
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "loops", difficulty: "beginner", source_url: `${BASE}/loops/for-while`,
    body_md: `## For Loops and While Loops

### The \`for\` loop
Iterate over any **iterable** (list, string, range, dict, file…):

\`\`\`python
fruits = ["apple", "banana", "cherry"]
for fruit in fruits:
    print(fruit)

for i in range(5):         # 0, 1, 2, 3, 4
    print(i)

for i in range(2, 10, 2):  # 2, 4, 6, 8 (start, stop, step)
    print(i)
\`\`\`

### The \`while\` loop
Repeats as long as a condition is True:

\`\`\`python
guess = ""
while guess != "secret":
    guess = input("Guess: ")
print("Correct!")
\`\`\`

### \`break\` and \`continue\`
\`\`\`python
for n in range(10):
    if n == 5:
        break       # exit the loop immediately
    if n % 2 == 0:
        continue    # skip even numbers
    print(n)        # prints 1, 3
\`\`\`

### The \`for…else\` pattern
\`\`\`python
for item in items:
    if predicate(item):
        break
else:
    print("No item matched")  # runs only if loop wasn't broken
\`\`\``,
  },
  {
    concept_id: "loops", difficulty: "beginner", source_url: `${BASE}/loops/enumerate-zip`,
    body_md: `## enumerate() and zip()

### enumerate — index + value together
\`\`\`python
colours = ["red", "green", "blue"]

# ❌ Avoid — error-prone
for i in range(len(colours)):
    print(i, colours[i])

# ✅ Pythonic
for i, colour in enumerate(colours):
    print(i, colour)

# Start from a different index
for i, colour in enumerate(colours, start=1):
    print(i, colour)   # 1 red, 2 green, 3 blue
\`\`\`

### zip — iterate multiple sequences in parallel
\`\`\`python
names  = ["Alice", "Bob", "Carol"]
scores = [88, 94, 79]

for name, score in zip(names, scores):
    print(f"{name}: {score}")

# Unzip
pairs = [(1, "a"), (2, "b"), (3, "c")]
numbers, letters = zip(*pairs)
\`\`\`

\`zip\` stops at the shortest iterable. Use \`itertools.zip_longest\` to pad with a fill value.`,
  },
  {
    concept_id: "loops", difficulty: "intermediate", source_url: `${BASE}/loops/comprehensions`,
    body_md: `## List, Dict, and Set Comprehensions

Comprehensions are concise, readable, and often faster than equivalent \`for\` + \`append\`.

\`\`\`python
# List comprehension
squares = [x**2 for x in range(10)]

# With filter
evens = [x for x in range(20) if x % 2 == 0]

# Nested (outer loop first, inner loop second)
matrix = [[i*j for j in range(3)] for i in range(3)]

# Dict comprehension
word_lengths = {word: len(word) for word in ["cat", "elephant", "ox"]}

# Set comprehension (no duplicates)
unique_lengths = {len(word) for word in ["cat", "elephant", "ox"]}
\`\`\`

### Generator expressions (lazy evaluation)
\`\`\`python
# Materialises entire list in memory
total = sum([x**2 for x in range(1_000_000)])

# Generator: computes one value at a time — much lower memory footprint
total = sum(x**2 for x in range(1_000_000))
\`\`\`

Use comprehensions for clarity; avoid deeply nested ones (more than 2 levels).`,
  },
  {
    concept_id: "loops", difficulty: "intermediate", source_url: `${BASE}/loops/itertools`,
    body_md: `## itertools — Composable Iteration

\`itertools\` provides memory-efficient building blocks for iteration.

\`\`\`python
import itertools

# chain — treat multiple iterables as one
for x in itertools.chain([1,2], [3,4], [5]):
    print(x)   # 1 2 3 4 5

# islice — lazy slicing of any iterable
first5 = list(itertools.islice(range(1_000_000), 5))

# product — Cartesian product (nested loops)
for r, c in itertools.product(range(3), range(3)):
    print(r, c)  # like two nested for loops

# groupby — consecutive groups (sort first!)
data = [("a",1),("a",2),("b",3),("b",4)]
for key, group in itertools.groupby(data, key=lambda x: x[0]):
    print(key, list(group))

# accumulate — running total
import operator
print(list(itertools.accumulate([1,2,3,4], operator.mul)))  # [1,2,6,24]
\`\`\``,
  },
  {
    concept_id: "loops", difficulty: "advanced", source_url: `${BASE}/loops/generators`,
    body_md: `## Generators and the Iterator Protocol

A **generator function** uses \`yield\` to produce values one at a time, pausing between each.

\`\`\`python
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

fib = fibonacci()
print([next(fib) for _ in range(8)])  # [0, 1, 1, 2, 3, 5, 8, 13]
\`\`\`

### The iterator protocol
Any object with \`__iter__\` and \`__next__\` is an iterator:

\`\`\`python
class Countdown:
    def __init__(self, n): self.n = n
    def __iter__(self): return self
    def __next__(self):
        if self.n <= 0: raise StopIteration
        self.n -= 1
        return self.n + 1

for n in Countdown(3):
    print(n)   # 3 2 1
\`\`\`

### \`yield from\`
Delegates to a sub-generator:
\`\`\`python
def chain(*iterables):
    for it in iterables:
        yield from it

list(chain([1,2], [3,4]))  # [1, 2, 3, 4]
\`\`\`

### Send values into a generator
\`\`\`python
def accumulator():
    total = 0
    while True:
        val = yield total
        if val is None: break
        total += val

g = accumulator()
next(g)       # prime the generator
g.send(10)    # 10
g.send(5)     # 15
\`\`\``,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // FUNCTIONS
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "functions", difficulty: "beginner", source_url: `${BASE}/functions/basics`,
    body_md: `## Defining and Calling Functions

A function groups reusable logic under a name.

\`\`\`python
def greet(name):
    """Return a greeting string."""
    return f"Hello, {name}!"

message = greet("Alex")
print(message)   # Hello, Alex!
\`\`\`

### Parameters and arguments
\`\`\`python
def power(base, exponent=2):   # exponent has a default value
    return base ** exponent

power(3)       # 9   (exponent defaults to 2)
power(3, 3)    # 27
power(exponent=4, base=2)  # keyword arguments — order doesn't matter
\`\`\`

### *args and **kwargs
\`\`\`python
def add(*numbers):            # collects positional args into a tuple
    return sum(numbers)

add(1, 2, 3, 4)   # 10

def profile(**info):           # collects keyword args into a dict
    for key, val in info.items():
        print(f"{key}: {val}")

profile(name="Alex", age=17)
\`\`\`

### Return values
A function without \`return\` (or with bare \`return\`) returns \`None\`.
Return multiple values as a tuple: \`return x, y\` → unpacked as \`x, y = f()\`.`,
  },
  {
    concept_id: "functions", difficulty: "intermediate", source_url: `${BASE}/functions/closures`,
    body_md: `## Closures and Higher-Order Functions

A **closure** is an inner function that "closes over" variables from its enclosing scope.

\`\`\`python
def make_multiplier(n):
    def multiply(x):
        return x * n   # n is captured from the enclosing scope
    return multiply

double = make_multiplier(2)
triple = make_multiplier(3)
double(5)   # 10
triple(5)   # 15
\`\`\`

### Functions as first-class objects
\`\`\`python
def apply(fn, data):
    return [fn(x) for x in data]

apply(str.upper, ["hello", "world"])   # ['HELLO', 'WORLD']
apply(lambda x: x**2, [1, 2, 3, 4])   # [1, 4, 9, 16]
\`\`\`

### functools
\`\`\`python
from functools import partial, reduce
import operator

double = partial(operator.mul, 2)  # partial application
double(7)   # 14

product = reduce(operator.mul, [1,2,3,4,5])  # 120
\`\`\`

### The mutable-default-argument trap
\`\`\`python
# ❌ Bug: the list is created ONCE when the function is defined
def append_to(item, lst=[]):
    lst.append(item)
    return lst

append_to(1)   # [1]
append_to(2)   # [1, 2]  ← unexpected!

# ✅ Use None as sentinel
def append_to(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst
\`\`\``,
  },
  {
    concept_id: "functions", difficulty: "advanced", source_url: `${BASE}/functions/decorators`,
    body_md: `## Decorators and functools.wraps

A **decorator** is a function that takes a function and returns a (usually enhanced) function.

\`\`\`python
import time
from functools import wraps

def timer(fn):
    @wraps(fn)           # preserves __name__, __doc__, etc.
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{fn.__name__} took {elapsed:.4f}s")
        return result
    return wrapper

@timer
def slow_sort(lst):
    return sorted(lst)

slow_sort([3,1,2])   # "slow_sort took 0.0001s"
\`\`\`

### Decorators with arguments
\`\`\`python
def retry(times=3):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(times):
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    if attempt == times - 1:
                        raise
                    print(f"Retry {attempt+1}/{times}: {e}")
        return wrapper
    return decorator

@retry(times=5)
def flaky_request(url):
    ...
\`\`\`

### Class-based decorators
\`\`\`python
class memoize:
    def __init__(self, fn):
        self.fn = fn
        self.cache = {}
        wraps(fn)(self)
    def __call__(self, *args):
        if args not in self.cache:
            self.cache[args] = self.fn(*args)
        return self.cache[args]

@memoize
def fib(n):
    return n if n < 2 else fib(n-1) + fib(n-2)
\`\`\``,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // LISTS
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "lists", difficulty: "beginner", source_url: `${BASE}/lists/basics`,
    body_md: `## Lists — Python's Workhorse Sequence

A list is an **ordered, mutable** collection of items (of any type).

\`\`\`python
fruits = ["apple", "banana", "cherry"]
mixed  = [1, "hello", 3.14, True, [1,2]]   # mixed types are legal

# Indexing
fruits[0]    # "apple"   (zero-based)
fruits[-1]   # "cherry"  (negative = from end)

# Mutation
fruits[1] = "mango"
fruits.append("date")       # add to end
fruits.insert(1, "kiwi")    # insert at position 1
fruits.extend(["fig","grape"])  # add multiple

# Removal
fruits.remove("mango")   # removes first occurrence; ValueError if absent
popped = fruits.pop()    # removes & returns last item
del fruits[0]            # delete by index

# Info
len(fruits)
"apple" in fruits        # True/False membership test
fruits.index("cherry")   # position of first occurrence
fruits.count("cherry")   # number of occurrences
\`\`\``,
  },
  {
    concept_id: "lists", difficulty: "intermediate", source_url: `${BASE}/lists/slicing`,
    body_md: `## Slicing and Sorting

### Slice syntax \`lst[start:stop:step]\`
\`\`\`python
nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

nums[2:5]    # [2, 3, 4]   — stop is exclusive
nums[:4]     # [0, 1, 2, 3]
nums[6:]     # [6, 7, 8, 9]
nums[::2]    # [0, 2, 4, 6, 8]   — every other
nums[::-1]   # [9, 8, ..., 0]    — reversed
nums[1:8:3]  # [1, 4, 7]
\`\`\`

Slices return a **new list** — mutations don't affect the original. Slices never raise \`IndexError\`.

### Sorting
\`\`\`python
# In-place (Timsort, stable, O(n log n))
nums.sort()
nums.sort(reverse=True)

# Return new sorted list
sorted_copy = sorted(nums)
by_length   = sorted(words, key=len)
by_last     = sorted(people, key=lambda p: p["last_name"])

# Multiple sort keys
data = [("Alice", 88), ("Bob", 92), ("Carol", 88)]
data.sort(key=lambda t: (-t[1], t[0]))  # score desc, then name asc
\`\`\``,
  },
  {
    concept_id: "lists", difficulty: "advanced", source_url: `${BASE}/lists/complexity`,
    body_md: `## Time Complexity and Alternatives

### List operation complexity
| Operation | Average | Worst |
|-----------|---------|-------|
| \`append\` | O(1) amortised | O(n) (resize) |
| \`insert(0, x)\` | O(n) | O(n) |
| \`pop()\` | O(1) | O(1) |
| \`pop(0)\` | O(n) | O(n) |
| \`x in lst\` | O(n) | O(n) |
| \`sort()\` | O(n log n) | O(n log n) |
| Slice \`lst[i:j]\` | O(k) | O(k) |

### collections.deque — O(1) at both ends
\`\`\`python
from collections import deque
dq = deque([1, 2, 3])
dq.appendleft(0)   # O(1)
dq.popleft()       # O(1)
\`\`\`

### array module — typed, compact
\`\`\`python
import array
a = array.array('i', [1, 2, 3])   # 'i' = signed int
\`\`\`

### bisect — sorted-list operations
\`\`\`python
import bisect
s = [1, 3, 5, 7]
bisect.insort(s, 4)   # insert 4 maintaining sort: [1,3,4,5,7]
bisect.bisect_left(s, 5)   # index where 5 would be inserted
\`\`\``,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // DICTIONARIES
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "dicts", difficulty: "beginner", source_url: `${BASE}/dicts/basics`,
    body_md: `## Dictionaries — Key-Value Mapping

A dictionary maps **unique, hashable keys** to values.

\`\`\`python
student = {"name": "Alex", "age": 17, "grade": "A"}

# Access
student["name"]           # "Alex" — KeyError if missing
student.get("email")      # None   — safe, no KeyError
student.get("email", "—") # "—"    — supply a default

# Add / update
student["email"] = "alex@school.edu"
student.update({"age": 18, "city": "Austin"})

# Delete
del student["city"]
removed = student.pop("email", None)   # pop with default

# Membership
"name" in student        # True  — checks keys
"Alex" in student        # False — NOT values

# Iteration
for key in student:               print(key)
for val in student.values():      print(val)
for key, val in student.items():  print(key, "→", val)
\`\`\`

### Dict from pairs
\`\`\`python
keys   = ["a", "b", "c"]
values = [1, 2, 3]
d = dict(zip(keys, values))   # {"a":1, "b":2, "c":3}
\`\`\``,
  },
  {
    concept_id: "dicts", difficulty: "intermediate", source_url: `${BASE}/dicts/patterns`,
    body_md: `## Useful Dict Patterns and collections

### defaultdict — auto-create missing values
\`\`\`python
from collections import defaultdict

# Group words by first letter
groups = defaultdict(list)
for word in ["apple","ant","banana","avocado"]:
    groups[word[0]].append(word)
# {"a": ["apple","ant","avocado"], "b": ["banana"]}
\`\`\`

### Counter — count hashables
\`\`\`python
from collections import Counter
c = Counter("abracadabra")
c.most_common(2)   # [('a', 5), ('b', 2)]
c["a"]             # 5
c["z"]             # 0  (no KeyError)
c1 + c2            # merge counts
\`\`\`

### setdefault and dict.get patterns
\`\`\`python
# Build adjacency list
graph = {}
for src, dst in edges:
    graph.setdefault(src, []).append(dst)

# Safe nested access
config = {"db": {"host": "localhost"}}
host = config.get("db", {}).get("host", "127.0.0.1")
\`\`\`

### Merging dicts (Python 3.9+)
\`\`\`python
defaults = {"color": "blue", "size": "M"}
overrides = {"color": "red"}
merged = defaults | overrides   # {"color":"red","size":"M"}
defaults |= overrides           # in-place merge
\`\`\``,
  },
  {
    concept_id: "dicts", difficulty: "advanced", source_url: `${BASE}/dicts/internals`,
    body_md: `## Hash Tables Internals

Python dicts are implemented as **open-addressing hash tables**.

### How lookup works
1. Compute \`hash(key)\` → integer
2. Modulo table size → slot index
3. If slot is empty → KeyError
4. If slot's key matches → return value
5. If collision → probe next slot (pseudo-random)

\`\`\`python
hash("hello")   # some integer, e.g. 1136434905
hash(42)        # 42   (integers hash to themselves for small values)
hash([1,2,3])   # TypeError: unhashable type 'list'
\`\`\`

### Custom hashable objects
\`\`\`python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y
    def __eq__(self, other):
        return (self.x, self.y) == (other.x, other.y)
    def __hash__(self):           # MUST define both __eq__ and __hash__
        return hash((self.x, self.y))

d = {Point(0,0): "origin"}
\`\`\`

### Insertion order (Python 3.7+)
Dicts preserve insertion order — this is a **language guarantee**, not an implementation detail. \`collections.OrderedDict\` is mainly useful for its \`move_to_end\` method.

### Memory: load factor and resizing
A Python dict resizes when it is ⅔ full, roughly doubling its capacity. After resizing, all entries are re-hashed. Average lookup is O(1); worst case (all collisions) is O(n).`,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // FILE I/O
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "files", difficulty: "beginner", source_url: `${BASE}/files/basics`,
    body_md: `## Reading and Writing Files

Always use a **context manager** (\`with\`) to guarantee the file is closed even if an error occurs.

\`\`\`python
# Write
with open("output.txt", "w") as f:
    f.write("Hello, file!\\n")
    f.writelines(["line 1\\n", "line 2\\n"])

# Read entire file
with open("output.txt", "r") as f:
    contents = f.read()        # one big string

# Read line by line (memory-efficient for large files)
with open("log.txt") as f:
    for line in f:
        print(line.strip())    # strip trailing newline

# Read into a list
with open("data.txt") as f:
    lines = f.readlines()
\`\`\`

### File modes
| Mode | Meaning |
|------|---------|
| \`'r'\` | Read (default) — error if file missing |
| \`'w'\` | Write — creates or truncates |
| \`'a'\` | Append — creates if missing |
| \`'x'\` | Exclusive create — error if file exists |
| \`'b'\` | Binary (add to any above: \`'rb'\`, \`'wb'\`) |
| \`'+'\` | Read + write (\`'r+'\` — error if missing) |`,
  },
  {
    concept_id: "files", difficulty: "intermediate", source_url: `${BASE}/files/json-pathlib`,
    body_md: `## JSON Serialisation and pathlib

### json module
\`\`\`python
import json

data = {"habits": {"exercise": ["2026-04-20", "2026-04-21"]}}

# Write JSON
with open("habits.json", "w") as f:
    json.dump(data, f, indent=2, sort_keys=True)

# Read JSON
with open("habits.json") as f:
    loaded = json.load(f)

# To/from string (no file)
s = json.dumps(data)
parsed = json.loads(s)
\`\`\`

Only JSON-serialisable types: \`dict, list, str, int, float, bool, None\`. Use a custom encoder for \`datetime\`, \`set\`, etc.

### pathlib — object-oriented file paths
\`\`\`python
from pathlib import Path

base = Path("data")
habits_file = base / "habits.json"   # cross-platform path joining

habits_file.exists()
habits_file.parent.mkdir(parents=True, exist_ok=True)

text   = habits_file.read_text(encoding="utf-8")
binary = habits_file.read_bytes()

habits_file.write_text(json.dumps(data, indent=2))

# Glob
for py_file in Path("src").rglob("*.py"):
    print(py_file)

# Metadata
habits_file.stat().st_size      # bytes
habits_file.suffix              # ".json"
habits_file.stem                # "habits"
\`\`\``,
  },
  {
    concept_id: "files", difficulty: "advanced", source_url: `${BASE}/files/binary-csv`,
    body_md: `## Binary Files, CSV, and Large-File Patterns

### Binary I/O with struct
\`\`\`python
import struct

# Pack: format 'iif' = int, int, float
record = struct.pack('iif', 42, 100, 3.14)
with open("data.bin", "wb") as f:
    f.write(record)

# Unpack
with open("data.bin", "rb") as f:
    raw = f.read(struct.calcsize('iif'))
    a, b, c = struct.unpack('iif', raw)
\`\`\`

### csv module
\`\`\`python
import csv

# Read
with open("students.csv", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row["name"], row["grade"])

# Write
with open("output.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name","grade"])
    writer.writeheader()
    writer.writerows([{"name":"Alex","grade":"A"}])
\`\`\`

### Memory-mapping large files
\`\`\`python
import mmap

with open("large.bin", "rb") as f:
    mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
    # treat mm like bytes but OS handles paging
    print(mm[0:4])
    mm.close()
\`\`\`

### tempfile for safe scratch space
\`\`\`python
import tempfile
with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as tf:
    tf.write(b'{"key":"value"}')
    print(tf.name)   # safe temp path
\`\`\``,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // RECURSION
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "recursion", difficulty: "beginner", source_url: `${BASE}/recursion/basics`,
    body_md: `## Recursion Fundamentals

A **recursive function** calls itself to solve smaller sub-problems. Every recursive solution needs:
1. **Base case** — stops the recursion (returns directly)
2. **Recursive case** — reduces the problem toward the base case

\`\`\`python
def factorial(n):
    if n == 0:       # base case
        return 1
    return n * factorial(n - 1)   # recursive case

factorial(5)   # 120

def countdown(n):
    if n <= 0:       # base case
        print("Blast off!")
        return
    print(n)
    countdown(n - 1)  # recursive case

countdown(3)   # 3  2  1  Blast off!
\`\`\`

### The call stack
Each call adds a **frame** to the call stack. Python's default limit is 1000:
\`\`\`python
import sys
sys.getrecursionlimit()   # 1000
sys.setrecursionlimit(5000)
\`\`\`
Exceeding the limit → \`RecursionError: maximum recursion depth exceeded\`.`,
  },
  {
    concept_id: "recursion", difficulty: "intermediate", source_url: `${BASE}/recursion/trees`,
    body_md: `## Recursion on Trees and Nested Structures

Recursive algorithms map naturally to **tree-shaped data**.

### Directory tree traversal
\`\`\`python
from pathlib import Path

def list_all(path, indent=0):
    print(" " * indent + path.name)
    if path.is_dir():
        for child in path.iterdir():
            list_all(child, indent + 2)

list_all(Path("."))
\`\`\`

### Flatten nested lists
\`\`\`python
def flatten(lst):
    result = []
    for item in lst:
        if isinstance(item, list):
            result.extend(flatten(item))  # recurse into sub-list
        else:
            result.append(item)
    return result

flatten([1, [2, [3, 4]], 5])  # [1, 2, 3, 4, 5]
\`\`\`

### Binary search (recursive)
\`\`\`python
def binary_search(arr, target, lo=0, hi=None):
    if hi is None: hi = len(arr) - 1
    if lo > hi: return -1
    mid = (lo + hi) // 2
    if arr[mid] == target: return mid
    if arr[mid] < target:  return binary_search(arr, target, mid+1, hi)
    return binary_search(arr, target, lo, mid-1)
\`\`\``,
  },
  {
    concept_id: "recursion", difficulty: "advanced", source_url: `${BASE}/recursion/memoization`,
    body_md: `## Memoization and Dynamic Programming

### @functools.lru_cache — automatic memoization
\`\`\`python
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n < 2: return n
    return fib(n-1) + fib(n-2)

fib(100)   # instant; without cache it would timeout
fib.cache_info()   # CacheInfo(hits=..., misses=..., maxsize=None, currsize=...)
\`\`\`

### Manual memoization (dict)
\`\`\`python
_memo = {}
def coin_change(coins, amount):
    if amount == 0: return 0
    if amount < 0:  return float('inf')
    if amount in _memo: return _memo[amount]
    _memo[amount] = 1 + min(coin_change(coins, amount-c) for c in coins)
    return _memo[amount]
\`\`\`

### Converting recursion to iteration (avoid stack overflow)
\`\`\`python
# Recursive DFS
def dfs(graph, start):
    visited = set()
    def _dfs(node):
        if node in visited: return
        visited.add(node)
        for nb in graph[node]:
            _dfs(nb)
    _dfs(start)

# Iterative DFS with explicit stack
def dfs_iterative(graph, start):
    visited = set()
    stack = [start]
    while stack:
        node = stack.pop()
        if node in visited: continue
        visited.add(node)
        stack.extend(graph[node])
\`\`\``,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // OOP
  // ══════════════════════════════════════════════════════════════════════════════
  {
    concept_id: "oop", difficulty: "beginner", source_url: `${BASE}/oop/classes`,
    body_md: `## Classes and Objects

A **class** is a blueprint. An **object** (instance) is a specific thing built from that blueprint.

\`\`\`python
class Dog:
    species = "Canis lupus"   # class attribute — shared by all instances

    def __init__(self, name, breed):
        self.name  = name    # instance attributes — unique per object
        self.breed = breed

    def bark(self):
        return f"{self.name} says: Woof!"

    def __str__(self):
        return f"Dog({self.name}, {self.breed})"

rex   = Dog("Rex", "Labrador")
buddy = Dog("Buddy", "Poodle")

rex.bark()        # "Rex says: Woof!"
str(rex)          # "Dog(Rex, Labrador)"
Dog.species       # "Canis lupus"
rex.species       # "Canis lupus"
\`\`\`

### \`__init__\` vs \`__new__\`
\`__init__\` initialises an already-created instance. You rarely override \`__new__\` (which creates the instance) unless implementing a singleton or custom metaclass.`,
  },
  {
    concept_id: "oop", difficulty: "intermediate", source_url: `${BASE}/oop/inheritance`,
    body_md: `## Inheritance and Polymorphism

\`\`\`python
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        raise NotImplementedError("Subclass must implement speak()")

class Dog(Animal):
    def speak(self):
        return f"{self.name}: Woof!"

class Cat(Animal):
    def speak(self):
        return f"{self.name}: Meow!"

animals = [Dog("Rex"), Cat("Whiskers"), Dog("Buddy")]
for a in animals:
    print(a.speak())   # polymorphism — correct speak() called at runtime
\`\`\`

### super()
\`\`\`python
class ElectricDog(Dog):
    def __init__(self, name, battery_pct):
        super().__init__(name)    # calls Dog.__init__
        self.battery = battery_pct

    def speak(self):
        return super().speak() + " (bzzt)"
\`\`\`

### Abstract base classes
\`\`\`python
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

class Circle(Shape):
    def __init__(self, r): self.r = r
    def area(self): return 3.14159 * self.r ** 2

Shape()    # TypeError — can't instantiate abstract class
Circle(5)  # OK
\`\`\``,
  },
  {
    concept_id: "oop", difficulty: "advanced", source_url: `${BASE}/oop/dunder`,
    body_md: `## Dunder Methods and the Data Model

Python's **data model** lets your objects work like built-ins by implementing special ("dunder") methods.

\`\`\`python
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y

    # Representation
    def __repr__(self): return f"Vector({self.x}, {self.y})"
    def __str__(self):  return f"({self.x}, {self.y})"

    # Arithmetic
    def __add__(self, other): return Vector(self.x+other.x, self.y+other.y)
    def __mul__(self, scalar): return Vector(self.x*scalar, self.y*scalar)
    def __rmul__(self, scalar): return self.__mul__(scalar)

    # Comparison
    def __eq__(self, other): return (self.x, self.y) == (other.x, other.y)
    def __lt__(self, other): return abs(self) < abs(other)

    # Container protocol
    def __len__(self): return 2
    def __getitem__(self, i): return (self.x, self.y)[i]
    def __iter__(self): yield self.x; yield self.y

    # Numeric
    def __abs__(self): return (self.x**2 + self.y**2)**0.5
    def __bool__(self): return self.x != 0 or self.y != 0

v1 = Vector(1, 2)
v2 = Vector(3, 4)
v1 + v2       # Vector(4, 6)
3 * v1        # Vector(3, 6)
list(v1)      # [1, 2]
abs(v2)       # 5.0
\`\`\`

### @property
\`\`\`python
class Temperature:
    def __init__(self, celsius):
        self._celsius = celsius

    @property
    def fahrenheit(self):
        return self._celsius * 9/5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value):
        self._celsius = (value - 32) * 5/9

t = Temperature(100)
t.fahrenheit         # 212.0
t.fahrenheit = 32
t._celsius           # 0.0
\`\`\``,
  },
];

// ── Chunking ──────────────────────────────────────────────────────────────────
// Each RawChunk is already a single semantic chunk; further split by ## heading
// if body_md is longer than ~2000 chars (≈512 tokens at 4 chars/token).

interface FinalChunk {
  concept_id: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  source_url: string;
  body_md: string;
}

function splitChunk(chunk: RawChunk): FinalChunk[] {
  const MAX_CHARS = 2000;
  if (chunk.body_md.length <= MAX_CHARS) return [chunk];

  const sections = chunk.body_md.split(/(?=^## )/m);
  const out: FinalChunk[] = [];
  let buffer = "";

  for (const section of sections) {
    if ((buffer + section).length > MAX_CHARS && buffer) {
      out.push({ ...chunk, body_md: buffer.trim() });
      buffer = section;
    } else {
      buffer += (buffer ? "\n\n" : "") + section;
    }
  }
  if (buffer.trim()) out.push({ ...chunk, body_md: buffer.trim() });
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const finalChunks: FinalChunk[] = CHUNKS.flatMap(splitChunk);
  const concepts = [...new Set(finalChunks.map(c => c.concept_id))];

  const totalChars = finalChunks.reduce((s, c) => s + c.body_md.length, 0);
  console.log(`\n📚  Ingesting ${finalChunks.length} chunks across ${concepts.length} concepts (~${Math.round(totalChars/1024)} KB)\n`);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Embed all chunks
  const texts = finalChunks.map(c => c.body_md);
  const embeddings = await embedAll(texts);

  // Upsert in batches of 50
  let upserted = 0;
  const UPSERT_BATCH = 50;
  for (let i = 0; i < finalChunks.length; i += UPSERT_BATCH) {
    const batch = finalChunks.slice(i, i + UPSERT_BATCH).map((c, j) => ({
      concept_id: c.concept_id,
      body_md: c.body_md,
      embedding: embeddings[i + j],
      source_url: c.source_url,
      difficulty: c.difficulty,
    }));

    const { error } = await db.from("kb_chunks").upsert(batch, { ignoreDuplicates: false });
    if (error) throw new Error(`Upsert batch ${i}: ${error.message}`);
    upserted += batch.length;
    process.stdout.write(`   Upserted ${upserted}/${finalChunks.length}\r`);
  }

  console.log(`\n✅  Ingested ${upserted} chunks across ${concepts.length} concepts`);
  console.log(`   Concepts: ${concepts.join(", ")}`);
}

run().catch(err => {
  console.error("❌  Ingest failed:", err.message);
  process.exit(1);
});
