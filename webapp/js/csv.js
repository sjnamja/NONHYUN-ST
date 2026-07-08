// CSV 파서 — 따옴표/줄바꿈/쉼표 포함 필드 처리
window.CSV = (function () {
  function parse(text) {
    if (!text) return [];
    // BOM 제거
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* skip */ }
        else field += c;
      }
    }
    // 마지막 필드/행
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  // 헤더 있는 CSV → 객체 배열
  function toObjects(text) {
    const rows = parse(text).filter((r) => r.some((c) => String(c).trim() !== ""));
    if (rows.length === 0) return { headers: [], data: [] };
    const headers = rows[0].map((h) => String(h).trim());
    const data = rows.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i] !== undefined ? String(r[i]).trim() : ""; });
      return o;
    });
    return { headers, data };
  }

  return { parse, toObjects };
})();
