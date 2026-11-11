// Sorting algorithms as generators of operations. Each one sorts `a` in place and yields
// { op: "compare", i, j } | { op: "swap", i, j } | { op: "set", i, value }.

export function* bubble(a) {
  for (let n = a.length; n > 1; n--) {
    let swapped = false;
    for (let i = 1; i < n; i++) {
      yield { op: "compare", i: i - 1, j: i };
      if (a[i - 1] > a[i]) {
        [a[i - 1], a[i]] = [a[i], a[i - 1]];
        swapped = true;
        yield { op: "swap", i: i - 1, j: i };
      }
    }
    if (!swapped) return;
  }
}

export function* insertion(a) {
  for (let i = 1; i < a.length; i++) {
    for (let j = i; j > 0; j--) {
      yield { op: "compare", i: j - 1, j };
      if (a[j - 1] <= a[j]) break;
      [a[j - 1], a[j]] = [a[j], a[j - 1]];
      yield { op: "swap", i: j - 1, j };
    }
  }
}

export function* selection(a) {
  for (let i = 0; i < a.length - 1; i++) {
    let m = i;
    for (let j = i + 1; j < a.length; j++) {
      yield { op: "compare", i: m, j };
      if (a[j] < a[m]) m = j;
    }
    if (m !== i) {
      [a[i], a[m]] = [a[m], a[i]];
      yield { op: "swap", i, j: m };
    }
  }
}

export function* quick(a, lo = 0, hi = a.length - 1) {
  if (lo >= hi) return;
  const mid = (lo + hi) >> 1;
  [a[mid], a[hi]] = [a[hi], a[mid]];
  yield { op: "swap", i: mid, j: hi };
  const pivot = a[hi];
  let p = lo;
  for (let i = lo; i < hi; i++) {
    yield { op: "compare", i, j: hi };
    if (a[i] < pivot) {
      [a[i], a[p]] = [a[p], a[i]];
      yield { op: "swap", i, j: p };
      p++;
    }
  }
  [a[p], a[hi]] = [a[hi], a[p]];
  yield { op: "swap", i: p, j: hi };
  yield* quick(a, lo, p - 1);
  yield* quick(a, p + 1, hi);
}

export function* merge(a, lo = 0, hi = a.length) {
  if (hi - lo < 2) return;
  const mid = (lo + hi) >> 1;
  yield* merge(a, lo, mid);
  yield* merge(a, mid, hi);
  const left = a.slice(lo, mid), right = a.slice(mid, hi);
  let i = 0, j = 0, k = lo;
  while (i < left.length && j < right.length) {
    yield { op: "compare", i: lo + i, j: mid + j };
    a[k] = left[i] <= right[j] ? left[i++] : right[j++];
    yield { op: "set", i: k, value: a[k] };
    k++;
  }
  while (i < left.length) {
    a[k] = left[i++];
    yield { op: "set", i: k, value: a[k] };
    k++;
  }
  while (j < right.length) {
    a[k] = right[j++];
    yield { op: "set", i: k, value: a[k] };
    k++;
  }
}

export function* heap(a) {
  const n = a.length;
  function* sift(start, end) {
    let root = start;
    while (2 * root + 1 < end) {
      let child = 2 * root + 1;
      if (child + 1 < end) {
        yield { op: "compare", i: child, j: child + 1 };
        if (a[child] < a[child + 1]) child++;
      }
      yield { op: "compare", i: root, j: child };
      if (a[root] >= a[child]) return;
      [a[root], a[child]] = [a[child], a[root]];
      yield { op: "swap", i: root, j: child };
      root = child;
    }
  }
  for (let s = (n >> 1) - 1; s >= 0; s--) yield* sift(s, n);
  for (let end = n - 1; end > 0; end--) {
    [a[0], a[end]] = [a[end], a[0]];
    yield { op: "swap", i: 0, j: end };
    yield* sift(0, end);
  }
}

export const ALGORITHMS = { bubble, insertion, selection, quick, merge, heap };

/** Values 1..size in the requested starting order. */
export function initialArray(size, order, rng) {
  let a = Array.from({ length: size }, (_, i) => i + 1);
  if (order === "few-unique") a = a.map((v) => Math.ceil((v / size) * 5) * Math.ceil(size / 5));
  const shuffle = () => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  };
  if (order === "random" || order === "few-unique") shuffle();
  else if (order === "reversed") a.reverse();
  else if (order === "nearly-sorted") {
    for (let k = 0; k < Math.max(1, Math.floor(size / 20)); k++) {
      const i = Math.floor(rng() * size), j = Math.min(size - 1, i + 1 + Math.floor(rng() * 3));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return a;
}
