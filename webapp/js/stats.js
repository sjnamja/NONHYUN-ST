// 통계 유틸 — 회귀·백분위·분절회귀·기초통계
window.Stats = (function () {
  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return NaN;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
  }
  function median(a) { return percentile(a, 50); }

  function percentile(a, p) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    if (s.length === 1) return s[0];
    const idx = (p / 100) * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }

  // 단순 선형회귀 y = a + b*x
  function linreg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: NaN, intercept: NaN, r2: NaN, n };
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    if (sxx === 0) return { slope: NaN, intercept: NaN, r2: NaN, n };
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
    return { slope, intercept, r2, n };
  }

  // 다중선형회귀 (정규방정식 + 가우스소거). X: 행렬(각 행=관측, 절편 포함), y: 배열
  function mlr(X, y) {
    const n = X.length, k = X[0].length;
    // A = X'X (k x k), b = X'y (k)
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < k; r++) {
        b[r] += X[i][r] * y[i];
        for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c];
      }
    }
    return solve(A, b); // 계수 배열
  }

  // 가우스소거로 A x = b 풀기
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      // 피벗
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null; // 특이행렬
      [M[col], M[piv]] = [M[piv], M[col]];
      const d = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row) => row[n]);
  }

  // 연속 분절회귀: y = b0 + b1*x + b2*max(0, x-bp)
  // 여러 후보 bp 중 SSE 최소 선택. 반환: {bp, slopeBefore, slopeAfter, intercept}
  function segmented(xs, ys) {
    const n = xs.length;
    if (n < 6) {
      const lr = linreg(xs, ys);
      return { bp: null, slopeBefore: lr.slope, slopeAfter: lr.slope, intercept: lr.intercept, single: true };
    }
    const lo = percentile(xs, 15), hi = percentile(xs, 85);
    const steps = 25;
    let best = null;
    for (let s = 0; s <= steps; s++) {
      const bp = lo + (hi - lo) * (s / steps);
      const X = xs.map((x) => [1, x, Math.max(0, x - bp)]);
      const coef = mlr(X, ys);
      if (!coef) continue;
      let sse = 0;
      for (let i = 0; i < n; i++) {
        const pred = coef[0] + coef[1] * xs[i] + coef[2] * Math.max(0, xs[i] - bp);
        sse += (ys[i] - pred) * (ys[i] - pred);
      }
      if (!best || sse < best.sse) {
        best = { sse, bp, intercept: coef[0], slopeBefore: coef[1], slopeAfter: coef[1] + coef[2] };
      }
    }
    if (!best) {
      const lr = linreg(xs, ys);
      return { bp: null, slopeBefore: lr.slope, slopeAfter: lr.slope, intercept: lr.intercept, single: true };
    }
    return best;
  }

  // 두 그룹 평균차 t검정(웰치) — 간이. 반환 {t, df, p(양측 근사)}
  function welch(a, b) {
    const na = a.length, nb = b.length;
    if (na < 2 || nb < 2) return { t: NaN, df: NaN, p: NaN };
    const ma = mean(a), mb = mean(b), va = sd(a) ** 2, vb = sd(b) ** 2;
    const se = Math.sqrt(va / na + vb / nb);
    if (se === 0) return { t: NaN, df: NaN, p: NaN };
    const t = (ma - mb) / se;
    const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    return { t, df, p: pFromT(Math.abs(t), df) };
  }

  // t분포 양측 p값 근사(정규 근사 + 보정). 정밀추론용 아님, 화면 참고용.
  function pFromT(t, df) {
    // df 큰 경우 정규근사
    const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
    return 2 * (1 - normCdf(z));
  }
  function normCdf(z) {
    // Abramowitz-Stegun 근사
    const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419, c = 0.39894228;
    const az = Math.abs(z);
    const tt = 1 / (1 + p * az);
    const y = c * Math.exp(-az * az / 2) * (b1 * tt + b2 * tt ** 2 + b3 * tt ** 3 + b4 * tt ** 4 + b5 * tt ** 5);
    return z >= 0 ? 1 - y : y;
  }

  return { mean, sd, median, percentile, linreg, mlr, solve, segmented, welch };
})();
