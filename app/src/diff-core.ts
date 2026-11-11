// ═══════════════════════════════════════════════════
// DIFERENCIAS ENTRE VERSIONES (Myers, por líneas) — núcleo puro y tipado
// ═══════════════════════════════════════════════════
// Sin DOM: se puede probar y reutilizar en cualquier sitio. La parte visual está en diff.js.

export type DiffOp = { t: '=' | '+' | '-'; s: string };
export interface DiffResult { ops: DiffOp[] | null; added: number; removed: number }

// Devuelve las operaciones de A a B. Si hay demasiados cambios (> maxD) devuelve null y quien llama
// muestra un resumen en vez del detalle.
export function myersDiff(A: string[], B: string[], maxD = 2500): DiffOp[] | null {
  const N = A.length, M = B.length;
  if (!N && !M) return [];
  const MAX = Math.min(N + M, maxD);
  const off = MAX + 1;
  const V = new Int32Array(2 * MAX + 3);
  V[off + 1] = 0;
  const trace: Int32Array[] = [];
  let found = false, D = 0;
  for (let d = 0; d <= MAX && !found; d++) {
    trace.push(V.slice(off - d - 1, off + d + 2));   // estado al empezar la ronda d: V[k] = snap[k + d + 1]
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      V[off + k] = x;
      if (x >= N && y >= M) { found = true; D = d; break; }
    }
  }
  if (!found) return null;
  const ops: DiffOp[] = [];
  let x = N, y = M;
  for (let d = D; d > 0; d--) {
    const snap = trace[d];
    const get = (k: number): number => snap[k + d + 1];
    const k = x - y;
    const prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
    const prevX = get(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ t: '=', s: A[x - 1] }); x--; y--; }
    if (prevK === k + 1) ops.push({ t: '+', s: B[prevY] }); else ops.push({ t: '-', s: A[prevX] });
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { ops.push({ t: '=', s: A[x - 1] }); x--; y--; }
  return ops.reverse();
}

export function diffText(before: string, after: string): DiffResult {
  const a = before.replace(/\r\n/g, '\n').split('\n');
  const b = after.replace(/\r\n/g, '\n').split('\n');
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const mid = myersDiff(a.slice(s, ea), b.slice(s, eb));
  const head: DiffOp[] = a.slice(0, s).map(l => ({ t: '=', s: l }));
  const tail: DiffOp[] = a.slice(ea).map(l => ({ t: '=', s: l }));
  if (!mid) return { ops: null, added: eb - s, removed: ea - s };
  return { ops: head.concat(mid, tail), added: mid.filter(o => o.t === '+').length, removed: mid.filter(o => o.t === '-').length };
}
