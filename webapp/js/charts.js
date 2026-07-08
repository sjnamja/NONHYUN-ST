// 차트 렌더링 (Chart.js). 캔버스별 인스턴스 재사용/파기 관리.
window.Charts = (function () {
  const registry = {};
  function color(i, a = 1) {
    const palette = [
      [37, 99, 235], [16, 185, 129], [245, 158, 11], [239, 68, 68],
      [139, 92, 246], [14, 165, 233], [236, 72, 153], [100, 116, 139],
    ];
    const c = palette[i % palette.length];
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  function tick() {
    const dark = document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return dark ? "#cbd5e1" : "#334155";
  }
  function grid() {
    const dark = document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return dark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.15)";
  }

  function render(id, cfg) {
    const el = document.getElementById(id);
    if (!el) return;
    if (registry[id]) registry[id].destroy();
    cfg.options = cfg.options || {};
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;
    cfg.options.plugins = cfg.options.plugins || {};
    cfg.options.plugins.legend = cfg.options.plugins.legend || { labels: { color: tick() } };
    // 축 색상
    const sc = cfg.options.scales || {};
    for (const k in sc) {
      sc[k].ticks = Object.assign({ color: tick() }, sc[k].ticks || {});
      sc[k].grid = Object.assign({ color: grid() }, sc[k].grid || {});
      if (sc[k].title) sc[k].title.color = tick();
    }
    cfg.options.scales = sc;
    registry[id] = new Chart(el.getContext("2d"), cfg);
  }

  function destroyAll() { for (const k in registry) { registry[k].destroy(); delete registry[k]; } }

  return { render, destroyAll, color };
})();
