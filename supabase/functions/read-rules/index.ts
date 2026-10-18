// 旅費規程（アプリの rules-ai.js が PDF・写真・文字の形にした物）を読んで、アプリの規程の形にして返す。
// 管理者だけが使える。鍵 ANTHROPIC_API_KEY は Supabase の「Secrets」に入れておく。
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const GRADE = {
  type: "object", additionalProperties: false,
  required: ["name", "dailyStay", "dailyDay", "lodging", "mode"],
  properties: {
    name: { type: "string", description: "等級・役職の名前（例：役員、部長、一般）" },
    dailyStay: { type: "integer", description: "宿泊を伴う出張の日当（1日あたり、円）。定めが無ければ0" },
    dailyDay: { type: "integer", description: "日帰り出張の日当（円）。定めが無ければ0" },
    lodging: { type: "integer", description: "宿泊料（1泊あたり、円）。定めが無ければ0" },
    mode: { type: "string", enum: ["cap", "flat"], description: "宿泊料が実費精算で上限額なら cap、定額支給なら flat" },
  },
};
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["company", "title", "effective", "transport", "carRate", "dayTrip", "dayTripNote", "grades", "notes", "unclear"],
  properties: {
    company: { type: "string", description: "会社名。書いてなければ空文字" },
    title: { type: "string", description: "規程の名前（例：出張旅費規程）" },
    effective: { type: "string", description: "施行日を YYYY-MM-DD で。分からなければ空文字" },
    transport: { type: "string", description: "交通費の決まりを短く（例：実費。新幹線は普通車指定席まで）" },
    carRate: { type: "integer", description: "自家用車を使った時の1kmあたりの単価（円）。定めが無ければ0" },
    dayTrip: { type: "boolean", description: "日帰り出張にも日当を出すか" },
    dayTripNote: { type: "string", description: "日帰り日当の条件（例：片道50km以上）。無ければ空文字" },
    grades: { type: "array", items: GRADE, description: "等級ごとの金額。高い等級から順に" },
    notes: { type: "string", description: "上の項目に入らない大事な定め（支度料、距離の条件、精算期限など）を箇条書きで" },
    unclear: { type: "string", description: "読み取れなかった所や、解釈に迷った所。無ければ空文字" },
  },
};
const PROMPT = `添付は会社の出張旅費規程です。営業日誌アプリに入れるため、決められた形で書き出してください。
- 金額は書いてある通りに。推測で埋めず、定めが無い所は0か空文字にして unclear に書く。
- 日当や宿泊料が地域（東京・大阪など）で変わる場合は、いちばん基本の金額を入れ、地域ごとの違いは notes に書く。
- 文章は日本語で、短く。`;

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 管理者か確かめる
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: admin, error } = await sb.rpc("is_admin");
    if (error || !admin) return json({ error: "admin" }, 403);

    const { part } = await req.json();
    if (!part || !["document", "image", "text"].includes(part.type)) return json({ error: "type" }, 400);
    if (JSON.stringify(part).length > 40_000_000) return json({ error: "size" }, 400);

    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [part, { type: "text", text: PROMPT }] }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") return json({ error: "refusal" }, 422);
    if (res.stop_reason === "max_tokens") return json({ error: "long" }, 422);
    const text = res.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("");
    return json({ rules: JSON.parse(text) });
  } catch (e) {
    console.error(e);
    return json({ error: "fail" }, 500);
  }
});
