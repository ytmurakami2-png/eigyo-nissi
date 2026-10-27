// カレンダーの予定のうち、題名に⭐（★）が付いた物を日誌の記録にする。
// 毎朝 supabase/cron.sql で全員分を、アプリからは本人の分だけを呼ぶ。一度入れた予定は記録を消しても入れ直さない。
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const STAR = /[⭐★🌟]️?/gu;
const DAY = 86400000, JST = 9 * 3600000;
const jstDay = (ms: number) => new Date(ms + JST).toISOString().slice(0, 10);
const addDay = (s: string, n: number) => jstDay(Date.parse(s + "T00:00:00+09:00") + n * DAY);

// .ics の日時 → 日本の日付。終日の終わりは翌日が入っているので1日戻す
function icsDay(v: string, isEnd = false) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/);
  if (!m) return "";
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return isEnd ? addDay(d, -1) : d;
  // 時刻付き：Z は世界時、それ以外は書いてある時刻をそのまま日本の時刻とみなす
  let ms = Date.parse(`${d}T${m[4]}:${m[5]}:${m[6]}${m[7] ? "Z" : "+09:00"}`);
  if (isEnd) ms -= 60000;
  return jstDay(ms);
}
const unesc = (s = "") => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

type Ev = { uid: string; title: string; start: string; end: string; desc: string; loc: string };
function parseICS(text: string): Ev[] {
  const out: Ev[] = [];
  let ev: Record<string, string> | null = null;
  for (const ln of text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    if (ln === "BEGIN:VEVENT") { ev = {}; continue }
    if (ln === "END:VEVENT") {
      if (ev?.DTSTART && ev.STATUS !== "CANCELLED") {
        const s = icsDay(ev.DTSTART), e = ev.DTEND ? icsDay(ev.DTEND, true) : s;
        out.push({ uid: (ev.UID || "") + (ev["RECURRENCE-ID"] ? "@" + ev["RECURRENCE-ID"] : ""), title: unesc(ev.SUMMARY),
          start: s, end: e < s ? s : e, desc: unesc(ev.DESCRIPTION), loc: unesc(ev.LOCATION) });
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

// アプリの calendar.js の toRecords と同じ形の記録にする
function toRecords(events: Ev[], from: string, to: string) {
  return events.filter(e => e.title.search(STAR) >= 0 && e.start >= from && e.start <= to).map(e => {
    const title = e.title.replace(STAR, "").replace(/^[\s　]+|[\s　]+$/g, "");
    const key = "cal-" + (e.uid || e.start + "-" + title);
    return { key, rec: { id: key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120), date: e.start, end: e.end > e.start ? e.end : "",
      client: title, style: "", purpose: "", note: [e.loc ? "場所：" + e.loc : "", e.desc].filter(Boolean).join("\n"),
      dest: "", exps: [], fromCal: true } };
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // 毎朝の呼び出しは service role の鍵で全員分。アプリからはログインした本人の分だけ
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let only: string | null = null;
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    const { data } = await db.auth.getUser(token);
    if (!data.user) return json({ error: "ログインしてください" }, 401);
    only = data.user.id;
  }
  let q = db.from("calendar_feeds").select("user_id,url,done");
  if (only) q = q.eq("user_id", only);
  const { data: feeds, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const today = jstDay(Date.now()), result: Record<string, number | string> = {};
  for (const f of feeds || []) {
    try {
      const r = await fetch(f.url.trim().replace(/^webcal:/i, "https:"), { redirect: "follow" });
      if (!r.ok) throw new Error("http-" + r.status);
      const done = new Set<string>(f.done || []);
      const cand = toRecords(parseICS(await r.text()), addDay(today, -90), today).filter(x => !done.has(x.key));
      const { data: have } = await db.from("records").select("id").in("id", cand.length ? cand.map(x => x.rec.id) : [""]);
      const exist = new Set((have || []).map(x => x.id));
      const now = Date.now(), add = cand.filter(x => !exist.has(x.rec.id));
      if (add.length) {
        const { error: e } = await db.from("records").insert(add.map(x => ({ id: x.rec.id, user_id: f.user_id,
          data: { ...x.rec, createdAt: now, updatedAt: now } })));
        if (e) throw e;
      }
      cand.forEach(x => done.add(x.key));
      await db.from("calendar_feeds").update({ done: [...done], checked_at: new Date().toISOString() }).eq("user_id", f.user_id);
      result[f.user_id] = add.length;
    } catch (e) { result[f.user_id] = "error: " + String((e as Error)?.message || e).slice(0, 80) }
  }
  return json(only ? { added: result[only] ?? 0 } : result);
});
