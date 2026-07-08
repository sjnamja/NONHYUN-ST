// 앱 오케스트레이션
(function () {
  const LS = { ex: "sf_exercise_url", ib: "sf_inbody_url" };
  const state = {
    exRows: [], ibRows: [], pm: [], persons: {},
    machines: [], selValue: "group:all", mode: "demo",
    bodyPref: "all",
    exMap: null, ibMap: null,
  };

  const $ = (s) => document.querySelector(s);
  const el = (id) => document.getElementById(id);

  function toast(msg) {
    const t = el("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 3000);
  }
  function setBadge(mode) {
    const b = el("modeBadge");
    if (mode === "live") { b.textContent = "● 실데이터"; b.className = "badge live"; }
    else if (mode === "demo") { b.textContent = "데모 모드"; b.className = "badge demo"; }
    else { b.textContent = "오류"; b.className = "badge error"; }
  }

  function urls() {
    const cfg = window.APP_CONFIG || {};
    return {
      ex: localStorage.getItem(LS.ex) || cfg.EXERCISE_CSV_URL || "",
      ib: localStorage.getItem(LS.ib) || cfg.INBODY_CSV_URL || "",
    };
  }

  // ---------- 데이터 로드 ----------
  async function load() {
    const u = urls();
    el("dataStatus").textContent = "데이터 불러오는 중…";
    try {
      let ex, ib;
      if (u.ex) {
        ex = await DataLayer.fetchCsv(u.ex);
        ib = u.ib ? await DataLayer.fetchCsv(u.ib) : { headers: [], data: [] };
        state.mode = "live";
      } else {
        const d = Demo.build();
        ex = d.exercise; ib = d.inbody;
        state.mode = "demo";
      }
      ingest(ex, ib);
      setBadge(state.mode);
      renderAll();
      const src = state.mode === "live" ? "스프레드시트" : "데모 데이터";
      el("dataStatus").textContent =
        `${src} · 운동로그 ${state.exRows.length.toLocaleString()}행 · 인바디 ${state.ibRows.length.toLocaleString()}행 · 회원 ${Object.keys(state.persons).length}명`;
    } catch (e) {
      console.error(e);
      setBadge("error");
      el("dataStatus").textContent = "불러오기 실패: " + e.message + " — ⚙ 설정에서 URL을 확인하세요.";
      toast("데이터 로드 실패: " + e.message);
    }
  }

  function ingest(ex, ib) {
    const en = DataLayer.normalizeExercise(ex.headers, ex.data);
    const inb = DataLayer.normalizeInbody(ib.headers, ib.data);
    state.exMap = en.map; state.ibMap = inb.map;
    state.exRows = en.rows;
    state.ibRows = inb.rows;
    state.pm = DataLayer.buildPersonMachine(en.rows);
    state.persons = DataLayer.buildPersons(en.rows);
    // 기기 목록(근력, max_force 있는 것)
    const set = {};
    en.rows.forEach((r) => { if (isFinite(r.max_force)) set[r.machine] = (set[r.machine] || 0) + 1; });
    state.machines = Object.keys(set).sort((a, b) => set[b] - set[a]);
    // 부위 존재 여부
    const hasUpper = en.rows.some((r) => r.region === "상체" && isFinite(r.max_force));
    const hasLower = en.rows.some((r) => r.region === "하체" && isFinite(r.max_force));
    const groupOpts =
      `<optgroup label="종합 (부위별·병합)">` +
      `<option value="group:all">전체 기기(병합) · 표준화</option>` +
      (hasUpper ? `<option value="group:상체">상체 전체 · 표준화</option>` : "") +
      (hasLower ? `<option value="group:하체">하체 전체 · 표준화</option>` : "") +
      `</optgroup>`;
    const machineOpts =
      `<optgroup label="개별 기기">` +
      state.machines.map((m) => `<option value="machine:${esc(m)}">${esc(m)} · ${DataLayer.bodyRegion(m)}</option>`).join("") +
      `</optgroup>`;
    const sel = el("machineSelect");
    sel.innerHTML = groupOpts + machineOpts;
    // 이전 선택 유지, 없으면 기본값
    const values = Array.from(sel.options).map((o) => o.value);
    if (!values.includes(state.selValue)) state.selValue = values.includes("group:all") ? "group:all" : (values[0] || "");
    sel.value = state.selValue;
  }

  // 선택(종합 그룹 또는 개별 기기) → {sel, rows(measure 포함), series}
  function context() {
    const v = state.selValue || "group:all";
    let sel, rows;
    if (v.startsWith("group:")) {
      const grp = v.slice(6);
      sel = { isGroup: true, group: grp, label: grp === "all" ? "전체 기기(병합)" : grp + " 전체", unit: "표준화 근력(z)", dec: 2 };
      rows = state.exRows
        .filter((r) => isFinite(r.z) && (grp === "all" || r.region === grp))
        .map((r) => Object.assign({}, r, { measure: r.z }));
    } else {
      const name = v.startsWith("machine:") ? v.slice(8) : v;
      sel = { isGroup: false, machine: name, label: name, unit: "최대힘", dec: 1 };
      rows = state.exRows
        .filter((r) => r.machine === name && isFinite(r.max_force))
        .map((r) => Object.assign({}, r, { measure: r.max_force }));
    }
    return { sel, rows, series: buildSeries(rows) };
  }

  // rows(measure 포함) → 개인별 시계열 요약
  function buildSeries(rows) {
    const groups = {};
    rows.forEach((r) => { if (isFinite(r.measure)) (groups[r.member_key] = groups[r.member_key] || []).push(r); });
    const out = [];
    for (const mk in groups) {
      const g = groups[mk].sort((a, b) => a.dt - b.dt);
      const first = g[0].dt, last = g[g.length - 1].dt;
      const days = g.map((r) => (r.dt - first) / 86400000);
      const vals = g.map((r) => r.measure);
      const lr = Stats.linreg(days, vals);
      out.push({
        member_key: mk, sex: g[0].sex, birth: g[0].birth,
        sessions: g.length, firstDate: first, lastDate: last,
        tenureMonths: (last - first) / 86400000 / 30.44,
        baseline: vals[0], latest: vals[vals.length - 1], change: vals[vals.length - 1] - vals[0],
        slopePerMonth: lr.slope * 30, forces: vals, records: g,
      });
    }
    return out;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---------- 렌더 ----------
  function renderAll() {
    renderOverview();
    renderRq1(); renderRq2(); renderRq3(); renderRq4();
    renderBody(); renderBodyRegion();
  }

  // ----- 개요 -----
  function renderOverview() {
    const nMembers = Object.keys(state.persons).length;
    const nSessions = new Set(state.exRows.map((r) => r.member_key + r.dt.toISOString().slice(0, 10))).size;
    const perYear = Object.values(state.persons).map((p) => p.sessionsPerYear).filter(isFinite);
    const medFreq = perYear.length ? Stats.median(perYear) : NaN;
    // 근감소증
    const latestByMember = latestInbody();
    let risk = 0, total = 0;
    Object.values(latestByMember).forEach((r) => {
      const s = DataLayer.sarcopenia(r.SMI, r.sex);
      if (s !== null) { total++; if (s) risk++; }
    });
    const riskPct = total ? Math.round((risk / total) * 100) : 0;

    el("kpis").innerHTML = [
      kpi(nMembers, "참여 회원 수"),
      kpi(nSessions.toLocaleString(), "총 운동 세션(일)"),
      kpi(isFinite(medFreq) ? medFreq.toFixed(0) : "–", "중앙 연간 참여(회/년)"),
      kpi(total ? riskPct + "%" : "–", "근감소증 위험군 비율"),
      kpi(state.ibRows.length.toLocaleString(), "InBody 측정 건수"),
    ].join("");

    // 월별 세션
    const byMonth = {};
    state.exRows.forEach((r) => { const k = r.dt.toISOString().slice(0, 7); byMonth[k] = byMonth[k] || new Set(); byMonth[k].add(r.member_key + r.dt.toISOString().slice(0, 10)); });
    const months = Object.keys(byMonth).sort();
    Charts.render("chSessions", {
      type: "bar",
      data: { labels: months, datasets: [{ label: "세션(일)", data: months.map((m) => byMonth[m].size), backgroundColor: Charts.color(0, .8) }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });

    // 근감소증 도넛
    Charts.render("chSarco", {
      type: "doughnut",
      data: { labels: ["위험군", "정상"], datasets: [{ data: [risk, Math.max(0, total - risk)], backgroundColor: [Charts.color(3, .85), Charts.color(1, .85)] }] },
      options: {},
    });

    // 연령대×성별 참여 분포
    const bands = DataLayer.BAND_ORDER;
    const cntF = {}, cntM = {};
    Object.values(state.persons).forEach((p) => {
      const b = DataLayer.ageBand(p.age);
      if (p.sex === "M") cntM[b] = (cntM[b] || 0) + 1; else cntF[b] = (cntF[b] || 0) + 1;
    });
    Charts.render("chDemo", {
      type: "bar",
      data: {
        labels: bands,
        datasets: [
          { label: "여성", data: bands.map((b) => cntF[b] || 0), backgroundColor: Charts.color(6, .8) },
          { label: "남성", data: bands.map((b) => cntM[b] || 0), backgroundColor: Charts.color(5, .8) },
        ],
      },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
    });
  }
  function kpi(v, l) { return `<div class="kpi"><div class="val">${v}</div><div class="lbl">${l}</div></div>`; }

  function latestInbody() {
    const by = {};
    state.ibRows.forEach((r) => {
      if (!by[r.member_key] || (r.dt && by[r.member_key].dt && r.dt > by[r.member_key].dt)) by[r.member_key] = r;
    });
    return by;
  }
  function firstInbody() {
    const by = {};
    state.ibRows.forEach((r) => {
      if (!by[r.member_key] || (r.dt && by[r.member_key].dt && r.dt < by[r.member_key].dt)) by[r.member_key] = r;
    });
    return by;
  }

  // ----- RQ1 -----
  function renderRq1() {
    const { sel, rows } = context();
    const dec = sel.dec;
    setSelHint("rq1Hint", sel);
    const bands = ["60대", "70대", "80대+", "60세 미만"];
    // 각 행의 연령대(측정 시점 기준) + 측정값(measure)
    const tag = rows.map((r) => ({ f: r.measure, sex: r.sex, band: DataLayer.ageBand(DataLayer.ageFrom(r.birth, r.dt)) }));

    // 막대: 연령대별 중앙값(성별)
    const usedBands = bands.filter((b) => tag.some((t) => t.band === b));
    const medOf = (sex, b) => {
      const arr = tag.filter((t) => t.sex === sex && t.band === b).map((t) => t.f);
      return arr.length ? Stats.median(arr) : null;
    };
    Charts.render("chRq1Bar", {
      type: "bar",
      data: {
        labels: usedBands,
        datasets: [
          { label: "여성 중앙값", data: usedBands.map((b) => medOf("F", b)), backgroundColor: Charts.color(6, .8) },
          { label: "남성 중앙값", data: usedBands.map((b) => medOf("M", b)), backgroundColor: Charts.color(5, .8) },
        ],
      },
      options: { scales: { y: { beginAtZero: !sel.isGroup, title: { display: true, text: sel.unit } } } },
    });

    // 백분위표
    const ps = [10, 25, 50, 75, 90];
    let html = `<thead><tr><th class="name">성별·연령대</th><th>N</th>${ps.map((p) => `<th>P${p}</th>`).join("")}</tr></thead><tbody>`;
    let any = false;
    [["F", "여성"], ["M", "남성"]].forEach(([sx, sxL]) => {
      usedBands.forEach((b) => {
        const arr = tag.filter((t) => t.sex === sx && t.band === b).map((t) => t.f);
        if (arr.length < 1) return;
        any = true;
        html += `<tr><td class="name">${sxL} · ${b}</td><td>${arr.length}</td>${ps.map((p) => `<td>${Stats.percentile(arr, p).toFixed(dec)}</td>`).join("")}</tr>`;
      });
    });
    html += "</tbody>";
    el("tblRq1").innerHTML = any ? html : `<tbody><tr><td class="empty">데이터가 부족합니다.</td></tr></tbody>`;

    // 개인 위치 조회
    const members = [...new Set(rows.map((r) => r.member_key))].sort();
    el("rq1Member").innerHTML = `<option value="">회원 선택…</option>` + members.map((m) => `<option>${esc(m)}</option>`).join("");
    el("rq1Result").textContent = "";
    el("rq1Member").onchange = (e) => {
      const mk = e.target.value; if (!mk) { el("rq1Result").textContent = ""; return; }
      const mine = rows.filter((r) => r.member_key === mk).sort((a, b) => a.dt - b.dt);
      const latest = mine[mine.length - 1];
      const band = DataLayer.ageBand(DataLayer.ageFrom(latest.birth, latest.dt));
      const peers = tag.filter((t) => t.sex === latest.sex && t.band === band).map((t) => t.f).sort((a, b) => a - b);
      const below = peers.filter((v) => v < latest.measure).length;
      const pct = peers.length ? Math.round((below / peers.length) * 100) : NaN;
      el("rq1Result").innerHTML = `최근 ${sel.unit} <b>${latest.measure.toFixed(dec)}</b> · 동년배(${latest.sex === "M" ? "남" : "여"}·${band}) 중 <b>상위 ${isFinite(pct) ? 100 - pct : "–"}%</b> (백분위 ${isFinite(pct) ? pct : "–"})`;
    };
  }

  // 선택 대상 안내 문구
  function setSelHint(id, sel) {
    const e = el(id); if (!e) return;
    e.textContent = sel.isGroup
      ? `‘${sel.label}’ — 기기별로 표준화(z점수)한 근력을 합산해 분석합니다. 0=해당 그룹 평균, +1=1표준편차 위.`
      : `‘${sel.label}’ 기기 · 원 단위(최대힘)로 분석합니다.`;
  }

  // ----- RQ2 -----
  function renderRq2() {
    const { sel, series } = context();
    setSelHint("rq2Hint", sel);
    const pm = series.filter((p) => p.sessions >= 2 && isFinite(p.slopePerMonth));
    const slopes = pm.map((p) => p.slopePerMonth);
    // 히스토그램
    const hist = histogram(slopes, 12);
    Charts.render("chRq2Hist", {
      type: "bar",
      data: { labels: hist.labels, datasets: [{ label: "인원", data: hist.counts, backgroundColor: Charts.color(0, .8) }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: `월당 ${sel.unit} 변화` } }, y: { beginAtZero: true } } },
    });
    // 향상/유지/감소 (임계: ±0.3 힘/월, 데이터 스케일 상대)
    const thr = Math.max(0.2, Stats.sd(slopes) * 0.3 || 0.2);
    let up = 0, keep = 0, down = 0;
    slopes.forEach((s) => { if (s > thr) up++; else if (s < -thr) down++; else keep++; });
    Charts.render("chRq2Pie", {
      type: "doughnut",
      data: { labels: ["향상", "유지", "감소"], datasets: [{ data: [up, keep, down], backgroundColor: [Charts.color(1, .85), Charts.color(2, .85), Charts.color(3, .85)] }] },
      options: {},
    });
    // 빈도군별 평균 기울기
    const fg = {};
    pm.forEach((p) => {
      const per = state.persons[p.member_key] ? state.persons[p.member_key].sessionsPerYear : NaN;
      const g = DataLayer.freqGroup(per);
      (fg[g] = fg[g] || []).push(p.slopePerMonth);
    });
    const order = DataLayer.FREQ_ORDER.filter((g) => fg[g]);
    Charts.render("chRq2Freq", {
      type: "bar",
      data: { labels: order, datasets: [{ label: "평균 월당 변화", data: order.map((g) => Stats.mean(fg[g])), backgroundColor: order.map((_, i) => Charts.color(i, .8)) }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: `평균 기울기(${sel.isGroup ? "z" : "힘"}/월)` } } } },
    });
    el("rq2Note").textContent =
      `[${sel.label}] 분석 대상 ${pm.length}명(2회 이상 측정). 향상 ${up} · 유지 ${keep} · 감소 ${down}명. 기울기가 양(+)이면 근력 향상, 0 부근이면 유지, 음(−)이면 감소. (임계 ±${thr.toFixed(2)}/월)`;
  }

  // ----- RQ3 -----
  function renderRq3() {
    const { sel, series } = context();
    setSelHint("rq3Hint", sel);
    const pm = series.filter((p) => p.records.length >= 2);
    // 개인 내 표준화(z): 각 개인의 측정값을 평균0/표준편차1로 → 절대수준 차이 제거하고 '변화 모양'만
    const pts = [];
    pm.forEach((p) => {
      const f = p.forces, m = Stats.mean(f), s = Stats.sd(f);
      if (!isFinite(s) || s === 0) return;
      p.records.forEach((r) => {
        const monthsIn = (r.dt - p.firstDate) / 86400000 / 30.44;
        pts.push({ x: +monthsIn.toFixed(2), y: +((r.measure - m) / s).toFixed(3) });
      });
    });
    if (pts.length < 6) {
      Charts.render("chRq3", { type: "scatter", data: { datasets: [{ label: "관측", data: pts, backgroundColor: Charts.color(0, .5) }] }, options: {} });
      el("rq3Note").textContent = "정체기 추정을 위한 데이터가 부족합니다(누적되면 자동 갱신).";
      return;
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const seg = Stats.segmented(xs, ys);
    // 적합선 좌표
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    let line;
    if (seg.single || seg.bp == null) {
      line = [{ x: xmin, y: seg.intercept + seg.slopeBefore * xmin }, { x: xmax, y: seg.intercept + seg.slopeBefore * xmax }];
    } else {
      const yAtBp = seg.intercept + seg.slopeBefore * seg.bp;
      line = [
        { x: xmin, y: seg.intercept + seg.slopeBefore * xmin },
        { x: seg.bp, y: yAtBp },
        { x: xmax, y: yAtBp + seg.slopeAfter * (xmax - seg.bp) },
      ];
    }
    Charts.render("chRq3", {
      type: "scatter",
      data: {
        datasets: [
          { label: "관측(개인 내 표준화)", data: pts, backgroundColor: Charts.color(0, .35), pointRadius: 3 },
          { label: "적합선(분절회귀)", data: line, type: "line", borderColor: Charts.color(3, 1), borderWidth: 3, pointRadius: seg.bp != null ? [0, 5, 0] : 0, pointBackgroundColor: Charts.color(3, 1), fill: false, showLine: true },
        ],
      },
      options: { scales: { x: { title: { display: true, text: "운동 시작 후 경과(개월)" } }, y: { title: { display: true, text: "표준화 최대힘(z)" } } } },
    });
    if (seg.bp != null) {
      const trend = seg.slopeAfter <= seg.slopeBefore * 0.4 ? "이후 향상률이 둔화(정체 경향)" : "이후에도 상승 지속";
      el("rq3Note").textContent =
        `추정 변곡점 ≈ 시작 후 ${seg.bp.toFixed(1)}개월. 변곡 이전 기울기 ${seg.slopeBefore.toFixed(2)}/월 → 이후 ${seg.slopeAfter.toFixed(2)}/월 (${trend}). ※ 개인 내 표준화 값 기준의 근사 추정입니다.`;
    } else {
      el("rq3Note").textContent = `뚜렷한 변곡점이 확인되지 않았습니다(단일 추세, 기울기 ${seg.slopeBefore.toFixed(2)}/월).`;
    }
  }

  // ----- RQ4 -----
  function renderRq4() {
    const { sel, series } = context();
    setSelHint("rq4Hint", sel);
    const pm = series.filter((p) => p.sessions >= 2 && isFinite(p.change));
    const fg = {};
    pm.forEach((p) => {
      const per = state.persons[p.member_key] ? state.persons[p.member_key].sessionsPerYear : NaN;
      const g = DataLayer.freqGroup(per);
      (fg[g] = fg[g] || []).push(p.change);
    });
    const order = DataLayer.FREQ_ORDER.filter((g) => fg[g] && g !== "미상");
    Charts.render("chRq4", {
      type: "bar",
      data: { labels: order, datasets: [{ label: "평균 근력 변화량", data: order.map((g) => Stats.mean(fg[g])), backgroundColor: order.map((_, i) => Charts.color(i, .8)) }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: `${sel.unit} 변화(마지막−처음)` } } } },
    });
    // 표 + 최저군 대비 t검정
    const base = order[0] ? fg[order[0]] : null;
    let html = `<thead><tr><th class="name">빈도군</th><th>N</th><th>평균 변화</th><th>표준편차</th><th>최저군 대비 p*</th></tr></thead><tbody>`;
    order.forEach((g) => {
      const arr = fg[g];
      let p = "";
      if (base && g !== order[0]) { const w = Stats.welch(arr, base); p = isFinite(w.p) ? w.p.toFixed(3) : "–"; }
      html += `<tr><td class="name">${g}</td><td>${arr.length}</td><td>${Stats.mean(arr).toFixed(2)}</td><td>${(Stats.sd(arr) || 0).toFixed(2)}</td><td>${p || "(기준)"}</td></tr>`;
    });
    html += "</tbody>";
    el("tblRq4").innerHTML = html;
    // 유의 임계 탐색
    let threshold = null;
    if (base) {
      for (let i = 1; i < order.length; i++) {
        const w = Stats.welch(fg[order[i]], base);
        if (isFinite(w.p) && w.p < 0.05 && Stats.mean(fg[order[i]]) > Stats.mean(base)) { threshold = order[i]; break; }
      }
    }
    el("rq4Note").innerHTML = threshold
      ? `최저 빈도군 대비 <b>${threshold}</b> 구간부터 근력 변화가 통계적으로 유의(p&lt;0.05)하게 커집니다. * 웰치 t검정 근사값(참고용, 정밀추론은 혼합모형 권장).`
      : `아직 빈도군 간 유의한 차이가 확인되지 않았습니다(데이터 누적 시 재판정). * p는 참고용 근사값입니다.`;
  }

  // 운동 부위 참여 기준으로 회원 포함 여부
  function prefMatch(mk) {
    if (state.bodyPref === "all") return true;
    const p = state.persons[mk];
    return p && p.regionPref === state.bodyPref;
  }

  // ----- 체성분 -----
  function renderBody() {
    const first = firstInbody(), last = latestInbody();
    // SMI 변화(첫→최근) — 선택한 운동부위 참여자만
    const deltas = [];
    Object.keys(last).forEach((mk) => {
      if (!prefMatch(mk)) return;
      if (first[mk] && isFinite(first[mk].SMI) && isFinite(last[mk].SMI) && first[mk] !== last[mk]) {
        deltas.push(last[mk].SMI - first[mk].SMI);
      }
    });
    const smiUp = deltas.filter((d) => d > 0.05).length, smiKeep = deltas.filter((d) => Math.abs(d) <= 0.05).length, smiDown = deltas.filter((d) => d < -0.05).length;
    Charts.render("chBodySmi", {
      type: "doughnut",
      data: { labels: ["SMI 증가", "유지", "감소"], datasets: [{ data: [smiUp, smiKeep, smiDown], backgroundColor: [Charts.color(1, .85), Charts.color(2, .85), Charts.color(3, .85)] }] },
      options: {},
    });
    // 유산소 병행 여부별 PBF·VFL 변화 (선택 운동부위 참여자만)
    const groups = { aero: { pbf: [], vfl: [] }, non: { pbf: [], vfl: [] } };
    Object.keys(last).forEach((mk) => {
      if (!prefMatch(mk) || !first[mk] || first[mk] === last[mk]) return;
      const person = state.persons[mk];
      const key = person && person.aerobicYN ? "aero" : "non";
      if (isFinite(first[mk].PBF) && isFinite(last[mk].PBF)) groups[key].pbf.push(last[mk].PBF - first[mk].PBF);
      if (isFinite(first[mk].VFL) && isFinite(last[mk].VFL)) groups[key].vfl.push(last[mk].VFL - first[mk].VFL);
    });
    Charts.render("chBodyAero", {
      type: "bar",
      data: {
        labels: ["체지방률 변화(%p)", "내장지방레벨 변화"],
        datasets: [
          { label: "유산소 병행", data: [Stats.mean(groups.aero.pbf) || 0, Stats.mean(groups.aero.vfl) || 0], backgroundColor: Charts.color(0, .8) },
          { label: "근력만", data: [Stats.mean(groups.non.pbf) || 0, Stats.mean(groups.non.vfl) || 0], backgroundColor: Charts.color(4, .8) },
        ],
      },
      options: { scales: { y: { title: { display: true, text: "변화량(감소가 유리)" } } } },
    });
    const prefLabel = state.bodyPref === "all" ? "전체" : state.bodyPref + " 참여자";
    el("bodyNote").textContent = state.ibRows.length
      ? `[${prefLabel}] 2회 이상 측정자 ${deltas.length}명의 SMI 변화와, 유산소 병행(${groups.aero.pbf.length}명)·근력만(${groups.non.pbf.length}명)의 체지방·내장지방 변화 비교. 혈압은 InBody에 미기록이라 대사지표로 대체 평가합니다.`
      : `InBody 데이터가 없습니다. 인바디 CSV 링크를 ⚙ 설정에 연결하세요.`;
  }

  // ----- 운동 부위별 InBody 변화 비교 -----
  function renderBodyRegion() {
    const first = firstInbody(), last = latestInbody();
    const prefs = ["상체 위주", "하체 위주", "상하체 균형"];
    const metrics = [
      { key: "SMI", label: "SMI 변화" },
      { key: "SMM", label: "골격근량 변화" },
      { key: "PBF", label: "체지방률 변화" },
      { key: "VFL", label: "내장지방 변화" },
    ];
    // pref → metric → 변화량 배열
    const acc = {}; prefs.forEach((pf) => { acc[pf] = {}; metrics.forEach((m) => (acc[pf][m.key] = [])); });
    const counts = { "상체 위주": new Set(), "하체 위주": new Set(), "상하체 균형": new Set() };
    Object.keys(last).forEach((mk) => {
      const p = state.persons[mk]; if (!p || !first[mk] || first[mk] === last[mk]) return;
      const pf = p.regionPref; if (!acc[pf]) return;
      counts[pf].add(mk);
      metrics.forEach((m) => {
        if (isFinite(first[mk][m.key]) && isFinite(last[mk][m.key])) acc[pf][m.key].push(last[mk][m.key] - first[mk][m.key]);
      });
    });
    Charts.render("chBodyRegion", {
      type: "bar",
      data: {
        labels: metrics.map((m) => m.label),
        datasets: prefs.map((pf, i) => ({
          label: `${pf}(${counts[pf].size}명)`,
          data: metrics.map((m) => +(Stats.mean(acc[pf][m.key]) || 0).toFixed(2)),
          backgroundColor: Charts.color(i, .8),
        })),
      },
      options: { scales: { y: { title: { display: true, text: "첫 측정 → 최근 변화량" } } } },
    });
    el("bodyRegionNote").textContent =
      "운동 로그의 상체/하체 세션 비율로 회원을 분류(상체>하체×1.5 → 상체 위주 등)한 뒤, 부위별로 InBody 변화를 비교합니다. 근육 지표(SMI·골격근량)는 증가가, 지방 지표(체지방률·내장지방)는 감소가 유리합니다.";
  }

  function histogram(arr, bins) {
    if (!arr.length) return { labels: [], counts: [] };
    const mn = Math.min(...arr), mx = Math.max(...arr);
    if (mn === mx) return { labels: [mn.toFixed(2)], counts: [arr.length] };
    const w = (mx - mn) / bins;
    const counts = new Array(bins).fill(0);
    arr.forEach((v) => { let b = Math.floor((v - mn) / w); if (b >= bins) b = bins - 1; counts[b]++; });
    const labels = counts.map((_, i) => (mn + w * (i + 0.5)).toFixed(2));
    return { labels, counts };
  }

  // ---------- 이벤트 ----------
  function initEvents() {
    // 탭
    el("tabs").addEventListener("click", (e) => {
      const t = e.target.closest(".tab"); if (!t) return;
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      document.querySelector(`.panel[data-panel="${t.dataset.tab}"]`).classList.add("active");
    });
    // 분석 대상(그룹/기기) 선택 — RQ 탭 갱신
    el("machineSelect").addEventListener("change", (e) => {
      state.selValue = e.target.value;
      renderRq1(); renderRq2(); renderRq3(); renderRq4();
    });
    // 인바디 운동부위 필터 — 체성분 탭 갱신
    el("bodyRegionSelect").addEventListener("change", (e) => {
      state.bodyPref = e.target.value; renderBody();
    });
    // 새로고침
    el("reloadBtn").addEventListener("click", load);
    // 설정 모달
    const modal = el("settingsModal");
    const openS = () => { const u = urls(); el("inpExercise").value = u.ex; el("inpInbody").value = u.ib; modal.hidden = false; };
    el("settingsBtn").addEventListener("click", openS);
    el("cancelSettings").addEventListener("click", () => (modal.hidden = true));
    el("saveSettings").addEventListener("click", () => {
      const ex = el("inpExercise").value.trim(), ib = el("inpInbody").value.trim();
      if (ex) localStorage.setItem(LS.ex, ex); else localStorage.removeItem(LS.ex);
      if (ib) localStorage.setItem(LS.ib, ib); else localStorage.removeItem(LS.ib);
      modal.hidden = true; toast("저장했습니다. 불러오는 중…"); load();
    });
    el("useDemo").addEventListener("click", () => {
      localStorage.removeItem(LS.ex); localStorage.removeItem(LS.ib);
      modal.hidden = true; toast("데모 데이터로 표시합니다."); load();
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  }

  // ---------- 시작 ----------
  window.addEventListener("DOMContentLoaded", () => {
    if (typeof Chart === "undefined") {
      el("dataStatus").textContent = "차트 라이브러리를 불러오지 못했습니다(인터넷 연결 확인).";
    }
    initEvents();
    load();
  });
})();
