// 데모 데이터 — 링크가 없을 때 화면 동작 미리보기용 가상 데이터
window.Demo = (function () {
  const MACHINES = ["Seated Chest Press", "Leg Press", "Lat Pulldown", "Leg Extension"];
  // 기기별 기저 힘 스케일(대략)
  const BASE = { "Seated Chest Press": 30, "Leg Press": 80, "Lat Pulldown": 35, "Leg Extension": 55 };

  function rnd(seed) { // 간단 결정적 난수
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function build() {
    const R = rnd(20260707);
    const exercise = [];
    const inbody = [];
    const N = 45;
    const start = new Date(2025, 0, 15).getTime();
    for (let i = 0; i < N; i++) {
      const sex = R() < 0.72 ? "F" : "M"; // 여성 다수
      const age = Math.round(60 + R() * 28); // 60~88
      const byear = 2026 - age;
      const birth = `${byear}-0${1 + Math.floor(R() * 8)}-1${Math.floor(R() * 9)}`;
      const mk = `M${String(1000 + i)}`;
      // 참여 빈도: 사람마다 다르게 (주당 세션수)
      const perWeek = [0.3, 0.6, 1.2, 2.2, 3.2][Math.floor(R() * 5)];
      const months = 4 + Math.floor(R() * 8); // 4~11개월 참여
      const sexF = sex === "M" ? 1.35 : 1.0;
      const ageF = Math.max(0.55, 1 - (age - 60) * 0.012);
      const aerobic = R() < 0.35;
      const focus = ["upper", "lower", "both", "both"][Math.floor(R() * 4)]; // 상체/하체/균형 편중
      const UPPER = { "Seated Chest Press": 1, "Lat Pulldown": 1 };

      // 운동 로그
      const nSessions = Math.max(1, Math.round(perWeek * months * 4.3));
      for (let s = 0; s < nSessions; s++) {
        const t = start + (s / Math.max(1, nSessions - 1)) * months * 30.44 * 86400000;
        const monthsIn = (t - start) / 86400000 / 30.44;
        // 향상 곡선: 초기 급상승 후 정체 (plateau ~ 3~4개월), 빈도 높을수록 향상폭↑
        const gainCap = 0.10 + Math.min(0.35, perWeek * 0.06);
        const gain = gainCap * (1 - Math.exp(-monthsIn / 1.6));
        MACHINES.forEach((mac) => {
          const isUpper = !!UPPER[mac];
          if (focus === "upper" && !isUpper && R() < 0.85) return; // 상체 위주면 하체 드물게
          if (focus === "lower" && isUpper && R() < 0.85) return;  // 하체 위주면 상체 드물게
          if (R() < 0.35) return; // 매 세션 모든 기기를 하진 않음
          const base = BASE[mac] * sexF * ageF;
          const mf = base * (1 + gain) * (0.93 + R() * 0.14);
          const reps = 8 + Math.floor(R() * 8);
          exercise.push({
            member_key: mk, sex, birth,
            exercise_dt: new Date(t).toISOString().slice(0, 19).replace("T", " "),
            machine: mac,
            max_force: +mf.toFixed(1),
            avg_force: +(mf * 0.82).toFixed(1),
            reps, volume: +(mf * reps * 0.6).toFixed(1),
          });
        });
        if (aerobic && R() < 0.5) {
          exercise.push({
            member_key: mk, sex, birth,
            exercise_dt: new Date(t).toISOString().slice(0, 19).replace("T", " "),
            machine: "유산소(Treadmill)", max_force: "", avg_force: "", reps: "", volume: 400 + Math.floor(R() * 300),
          });
        }
      }

      // InBody 2~3회
      const nIB = 2 + (R() < 0.5 ? 1 : 0);
      let smi = (sex === "M" ? 7.2 : 5.9) - (age - 60) * 0.02 + (R() - 0.5) * 0.6;
      let pbf = (sex === "M" ? 24 : 33) + (R() - 0.5) * 6;
      let vfl = 8 + Math.floor(R() * 8);
      // 하체(큰 근육) 위주일수록 골격근 증가 폭↑
      const smiGain = (perWeek > 1.5 ? 0.06 : -0.02) + (focus === "lower" ? 0.05 : focus === "upper" ? 0.01 : 0.03);
      for (let k = 0; k < nIB; k++) {
        const t = start + (k / Math.max(1, nIB)) * months * 30.44 * 86400000;
        smi += smiGain;
        if (aerobic) { pbf -= 0.6; vfl -= 0.4; }
        inbody.push({
          member_key: mk, sex, birth,
          test_date: new Date(t).toISOString().slice(0, 10),
          SMI: +smi.toFixed(2), SMM: +(smi * 3.1).toFixed(1),
          PBF: +pbf.toFixed(1), VFL: Math.max(1, Math.round(vfl)),
          BMI: +(22 + (R() - 0.5) * 5).toFixed(1),
          weight: +(52 + R() * 25).toFixed(1),
          BMR: Math.round(1100 + R() * 350), BMC: +(2.2 + R() * 0.8).toFixed(2),
        });
      }
    }
    return {
      exercise: { headers: Object.keys(exercise[0]), data: exercise },
      inbody: { headers: Object.keys(inbody[0]), data: inbody },
    };
  }

  return { build };
})();
