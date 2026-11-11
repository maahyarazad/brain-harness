/** Rows of Pascal's triangle with every entry taken mod n. Yields Uint16Array rows. */
export function* pascalModRows(rows, n) {
  let prev = new Uint16Array([1 % n]);
  yield prev;
  for (let r = 1; r < rows; r++) {
    const row = new Uint16Array(r + 1);
    row[0] = 1 % n;
    row[r] = 1 % n;
    for (let k = 1; k < r; k++) row[k] = (prev[k - 1] + prev[k]) % n;
    yield row;
    prev = row;
  }
}
