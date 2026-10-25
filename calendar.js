/* カレンダーの予定のうち、題名に⭐（★）が付いたものだけを日誌の記録にする */
const Cal = (() => {
  const STAR = /[⭐★🌟]️?/u;
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const addDay = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d) };

  // .ics の日時 → 日本の日付。終日の終わりは翌日が入っているので1日戻す
  function icsDate(v, isEnd) {
    const m = String(v || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/);
    if (!m) return { day: "", allDay: false };
    if (!m[4]) { const s = `${m[1]}-${m[2]}-${m[3]}`; return { day: isEnd ? addDay(s, -1) : s, allDay: true } }
    const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (isEnd && d.getHours() === 0 && d.getMinutes() === 0) d.setMinutes(-1);
    return { day: ymd(d), allDay: false };
  }
  const unesc = s => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

  function parseICS(text) {
    const lines = String(text).replace(/\r?\n[ \t]/g, "").split(/\r?\n/), out = [];
    let ev = null;
    for (const ln of lines) {
      if (ln === "BEGIN:VEVENT") { ev = {}; continue }
      if (ln === "END:VEVENT") {
        if (ev && ev.DTSTART && ev.STATUS !== "CANCELLED") {
          const s = icsDate(ev.DTSTART), e = ev.DTEND ? icsDate(ev.DTEND, true) : s;
          out.push({ uid: (ev.UID || "") + (ev["RECURRENCE-ID"] ? "@" + ev["RECURRENCE-ID"] : ""), title: unesc(ev.SUMMARY),
            start: s.day, end: e.day < s.day ? s.day : e.day, desc: unesc(ev.DESCRIPTION), loc: unesc(ev.LOCATION) });
        }
        ev = null; continue;
      }
      if (!ev) continue;
      const i = ln.indexOf(":"); if (i < 0) continue;
      const key = ln.slice(0, i).split(";")[0].toUpperCase();
      if (!(key in ev)) ev[key] = ln.slice(i + 1);
    }
    return out;
  }

  // Google の取り次ぎ（Apps Script）が返す JSON か .ics の文字を読む
  function parse(text) {
    const t = String(text || "").trim();
    if (t.startsWith("[") || t.startsWith("{")) { const d = JSON.parse(t); return (Array.isArray(d) ? d : d.events || []) }
    if (/BEGIN:VCALENDAR/.test(t)) return parseICS(t);
    throw new Error("not-calendar");
  }

  // ⭐ の予定 → 記録。from〜to の日付の物だけ。同じ予定は同じ id になる
  function toRecords(events, from, to) {
    return events.filter(e => STAR.test(e.title || "") && e.start && e.start >= from && e.start <= to).map(e => {
      const title = String(e.title).replace(new RegExp(STAR.source, "gu"), "").replace(/^[\s　]+|[\s　]+$/g, "");
      const note = [e.loc ? "場所：" + e.loc : "", e.desc || ""].filter(Boolean).join("\n");
      const key = "cal-" + (e.uid || e.start + "-" + title);
      return { key, rec: { id: key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120), date: e.start, end: e.end && e.end > e.start ? e.end : "",
        client: title, style: "", purpose: "", note, dest: "", exps: [], fromCal: true } };
    });
  }

  async function fetchUrl(url) {
    const u = String(url).trim().replace(/^webcal:/i, "https:");
    const r = await fetch(u, { redirect: "follow", cache: "no-store" });
    if (!r.ok) throw new Error("http-" + r.status);
    return parse(await r.text());
  }

  return { parse, toRecords, fetchUrl, addDay };
})();
