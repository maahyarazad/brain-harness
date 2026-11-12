/** First `terms` values of Recamán's sequence: 0, 1, 3, 6, 2, 7, 13, … */
export function recaman(terms) {
  const out = [];
  const seen = new Set();
  let a = 0;
  for (let n = 0; n < terms; n++) {
    if (n > 0) {
      const back = a - n;
      a = back > 0 && !seen.has(back) ? back : a + n;
    }
    out.push(a);
    seen.add(a);
  }
  return out;
}
