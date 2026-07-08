// 데이터 로드·컬럼 매핑·조인·파생변수
window.DataLayer = (function () {
  const NOW = new Date();

  // 헤더 정규화: 소문자, 공백/괄호/번호접두 제거
  function norm(h) {
    return String(h || "")
      .toLowerCase()
      .replace(/^\s*\d+\s*\.\s*/, "")      // "96. smi" → "smi"
      .replace(/\([^)]*\)/g, "")           // 괄호 내용 제거
      .replace(/[\s_\-/]/g, "");           // 공백·기호 제거
  }

  // 동의어(정규화된 형태)로 컬럼 찾기 — 정확일치 우선, 없으면 부분포함
  function pick(headers, synonyms) {
    const nh = headers.map(norm);
    const ns = synonyms.map(norm);
    for (const s of ns) { const i = nh.indexOf(s); if (i >= 0) return headers[i]; }
    for (let i = 0; i < nh.length; i++) if (ns.some((s) => nh[i].includes(s) && s.length >= 2)) return headers[i];
    return null;
  }

  const EX_SYN = {
    member_key: ["member_key", "회원키", "memberid", "userid", "user_id", "아이디", "id", "회원id"],
    sex: ["sex", "성별", "gender"],
    birth: ["birth", "생년월일", "birthday", "생년", "생일"],
    exercise_dt: ["exercise_dt", "운동일시", "운동일", "date", "일시", "생성일자", "측정일시", "운동시간", "datetime"],
    machine: ["machine", "운동종류", "기기", "종목", "exercise"],
    max_force: ["max_force", "최대힘", "최대", "maxforce", "peakforce"],
    avg_force: ["avg_force", "평균힘", "평균", "avgforce"],
    reps: ["reps", "횟수", "count", "rep"],
    volume: ["volume", "볼륨", "vol"],
  };

  const IB_SYN = {
    member_key: ["member_key", "회원키", "memberid", "userid", "user_id", "아이디", "id", "회원id"],
    sex: ["sex", "성별", "gender"],
    birth: ["birth", "생년월일", "birthday", "생년"],
    age: ["age", "연령", "나이"],
    test_date: ["test_date", "측정일", "검사일", "testdate", "testdatetime", "일시", "측정일시"],
    SMI: ["smi"],
    SMM: ["smm", "골격근량", "skeletalmusclemass"],
    FFM: ["ffm", "fatfreemass", "제지방량"],
    PBF: ["pbf", "percentbodyfat", "체지방률"],
    BFM: ["bfm", "bodyfatmass", "체지방량"],
    VFL: ["vfl", "visceralfatlevel", "내장지방"],
    BMI: ["bmi"],
    weight: ["weight", "체중", "몸무게"],
    BMR: ["bmr", "basalmetabolicrate", "기초대사량"],
    BMC: ["bmc", "bonemineralcontent", "골무기질"],
  };

  function buildMap(headers, syn) {
    const m = {};
    for (const k in syn) m[k] = pick(headers, syn[k]);
    return m;
  }

  function num(v) {
    if (v === undefined || v === null) return NaN;
    const s = String(v).replace(/[^0-9.\-]/g, "");
    if (s === "" || s === "-" || s === ".") return NaN;
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  function parseDate(v) {
    if (!v) return null;
    let s = String(v).trim();
    // "2022.03.18 11:05:50" 또는 "2022-03-18" 또는 "2022/03/18"
    s = s.replace(/\./g, "-").replace(/\//g, "-");
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function ageFrom(birth, ref) {
    const b = parseDate(birth);
    if (!b) return NaN;
    const r = ref || NOW;
    let a = r.getFullYear() - b.getFullYear();
    const mm = r.getMonth() - b.getMonth();
    if (mm < 0 || (mm === 0 && r.getDate() < b.getDate())) a--;
    return a;
  }

  function ageBand(age) {
    if (!isFinite(age)) return "미상";
    if (age < 60) return "60세 미만";
    if (age < 70) return "60대";
    if (age < 80) return "70대";
    return "80대+";
  }
  const BAND_ORDER = ["60세 미만", "60대", "70대", "80대+", "미상"];

  function normSex(v) {
    const s = String(v || "").trim().toUpperCase();
    if (s.startsWith("M") || s.includes("남")) return "M";
    if (s.startsWith("F") || s.includes("여") || s.startsWith("W")) return "F";
    return "";
  }

  // 기기명 → 신체 부위 분류 (상체/하체/몸통/유산소/기타)
  function bodyRegion(name) {
    const s = String(name || "").toLowerCase();
    if (/유산소|treadmill|런닝|러닝|bike|cycle|자전거|걷기|walk|elliptical|일립티컬|스텝퍼|stepper|rowing machine|로잉머신/.test(s)) return "유산소";
    if (/leg|레그|squat|스쿼트|calf|카프|hip|힙|abduct|adduct|외전|내전|thigh|대퇴|둔근|glute|하체|lunge|런지|hamstring|무릎|knee/.test(s)) return "하체";
    if (/chest|가슴|체스트|shoulder|숄더|어깨|deltoid|lat|랫|pulldown|pull.?down|\brow\b|시티드로우|로우|curl|컬|tricep|bicep|이두|삼두|pec|펙|\bfly\b|플라이|press|프레스|arm|팔|등|back(?!.*ext)|풀업|pull.?up|dip|딥/.test(s)) return "상체";
    if (/abdom|복부|복근|torso|토르소|허리|core|코어|back ?ext|백.?익스|rotary|로타리|lumbar|요추/.test(s)) return "몸통";
    return "기타";
  }
  const REGION_ORDER = ["상체", "하체", "몸통", "기타", "유산소"];

  // 기기별 max_force 분포로 표준화(z점수) 부여 — 병합 분석용
  function attachZScores(rows) {
    const by = {};
    rows.forEach((r) => { if (isFinite(r.max_force)) (by[r.machine] = by[r.machine] || []).push(r.max_force); });
    const stats = {};
    for (const m in by) stats[m] = { mean: Stats.mean(by[m]), sd: Stats.sd(by[m]) };
    rows.forEach((r) => {
      if (isFinite(r.max_force)) {
        const s = stats[r.machine];
        r.z = s && isFinite(s.sd) && s.sd > 0 ? (r.max_force - s.mean) / s.sd : 0;
      } else r.z = NaN;
    });
    return rows;
  }

  // 원본 객체배열 → 표준화 레코드
  function normalizeExercise(headers, data) {
    const m = buildMap(headers, EX_SYN);
    const rows = [];
    for (const r of data) {
      const dt = parseDate(r[m.exercise_dt]);
      const mk = m.member_key ? String(r[m.member_key]).trim() : "";
      const mf = m.max_force ? num(r[m.max_force]) : NaN;
      if (!mk || !dt) continue;
      const machine = (m.machine ? String(r[m.machine]).trim() : "미상") || "미상";
      rows.push({
        member_key: mk,
        sex: normSex(m.sex ? r[m.sex] : ""),
        birth: m.birth ? r[m.birth] : "",
        dt,
        machine,
        region: bodyRegion(machine),
        max_force: mf,
        avg_force: m.avg_force ? num(r[m.avg_force]) : NaN,
        reps: m.reps ? num(r[m.reps]) : NaN,
        volume: m.volume ? num(r[m.volume]) : NaN,
      });
    }
    attachZScores(rows);
    return { map: m, rows };
  }

  function normalizeInbody(headers, data) {
    const m = buildMap(headers, IB_SYN);
    const rows = [];
    for (const r of data) {
      const dt = parseDate(r[m.test_date]);
      const mk = m.member_key ? String(r[m.member_key]).trim() : "";
      if (!mk) continue;
      const rec = { member_key: mk, sex: normSex(m.sex ? r[m.sex] : ""), dt };
      ["SMI", "SMM", "FFM", "PBF", "BFM", "VFL", "BMI", "weight", "BMR", "BMC"].forEach((k) => {
        rec[k] = m[k] ? num(r[m[k]]) : NaN;
      });
      let age = m.age ? num(r[m.age]) : NaN;
      if (!isFinite(age) && m.birth) age = ageFrom(r[m.birth], dt);
      rec.age = age;
      rec.age_band = ageBand(age);
      rows.push(rec);
    }
    return { map: m, rows };
  }

  // 개인×기기 단위 요약(근력 기울기·경과·세션수 등)
  function buildPersonMachine(exRows) {
    const key = (r) => r.member_key + "||" + r.machine;
    const groups = {};
    for (const r of exRows) {
      if (!isFinite(r.max_force)) continue;
      (groups[key(r)] = groups[key(r)] || []).push(r);
    }
    const out = [];
    for (const k in groups) {
      const g = groups[k].sort((a, b) => a.dt - b.dt);
      const [member_key, machine] = k.split("||");
      const first = g[0].dt, last = g[g.length - 1].dt;
      const days = g.map((r) => (r.dt - first) / 86400000);
      const forces = g.map((r) => r.max_force);
      const lr = Stats.linreg(days, forces);
      const slopePerMonth = lr.slope * 30; // 힘/월
      out.push({
        member_key, machine, sex: g[0].sex,
        age: ageFrom(g[0].birth, last) || NaN,
        sessions: g.length,
        firstDate: first, lastDate: last,
        tenureMonths: (last - first) / 86400000 / 30.44,
        baseline: forces[0], latest: forces[forces.length - 1],
        change: forces[forces.length - 1] - forces[0],
        slopePerMonth,
        forces, days, records: g,
      });
    }
    return out;
  }

  // 개인 단위 요약(연간 세션수·유산소 여부 등)
  function buildPersons(exRows) {
    const groups = {};
    for (const r of exRows) (groups[r.member_key] = groups[r.member_key] || []).push(r);
    const persons = {};
    for (const mk in groups) {
      const g = groups[mk].sort((a, b) => a.dt - b.dt);
      const spanDays = Math.max(1, (g[g.length - 1].dt - g[0].dt) / 86400000);
      // 세션 = 같은 날짜(하루) 기준 카운트
      const days = new Set(g.map((r) => r.dt.toISOString().slice(0, 10)));
      const sessionDays = days.size;
      const sessionsPerYear = sessionDays / (spanDays / 365.25);
      const machines = new Set(g.map((r) => r.machine));
      const aerobicYN = [...machines].some((mm) => bodyRegion(mm) === "유산소");
      // 부위별 세션수·선호 부위
      let upper = 0, lower = 0;
      g.forEach((r) => { if (r.region === "상체") upper++; else if (r.region === "하체") lower++; });
      let regionPref = "기타";
      if (upper + lower > 0) {
        if (upper > lower * 1.5) regionPref = "상체 위주";
        else if (lower > upper * 1.5) regionPref = "하체 위주";
        else regionPref = "상하체 균형";
      }
      persons[mk] = {
        member_key: mk, sex: g[0].sex, age: ageFrom(g[0].birth, g[g.length - 1].dt),
        firstDate: g[0].dt, lastDate: g[g.length - 1].dt,
        sessionDays, sessionsPerYear, machines: [...machines], aerobicYN,
        upperSessions: upper, lowerSessions: lower, regionPref,
      };
    }
    return persons;
  }
  const PREF_ORDER = ["상체 위주", "하체 위주", "상하체 균형", "기타"];

  function freqGroup(perYear) {
    if (!isFinite(perYear)) return "미상";
    if (perYear < 12) return "<12회/년";
    if (perYear < 36) return "12–35회/년";
    if (perYear < 72) return "36–71회/년";
    return "72회+/년";
  }
  const FREQ_ORDER = ["<12회/년", "12–35회/년", "36–71회/년", "72회+/년", "미상"];

  function sarcopenia(smi, sex) {
    if (!isFinite(smi)) return null;
    const cut = sex === "M" ? 7.0 : sex === "F" ? 5.7 : null;
    if (cut == null) return null;
    return smi < cut;
  }

  async function fetchCsv(url) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    return CSV.toObjects(text);
  }

  return {
    fetchCsv, normalizeExercise, normalizeInbody,
    buildPersonMachine, buildPersons,
    bodyRegion, attachZScores, REGION_ORDER, PREF_ORDER,
    ageBand, BAND_ORDER, freqGroup, FREQ_ORDER, sarcopenia, ageFrom,
    _pick: pick, _norm: norm,
  };
})();
