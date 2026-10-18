/* 旅費規程のファイルを Claude に読ませて、アプリの規程の形にする。
   データ保存（Supabase）につないでいれば read-rules を通し、つないでいなければこの端末に入れた鍵で直接たのむ。 */
const RulesAI = (() => {
  const KEY = "eigyo-aikey";
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
  // supabase/functions/read-rules/index.ts と同じ形
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

  const b64 = buf => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) };

  // Word(.docx) の本文だけを取り出す
  async function docxText(buf) {
    const v = new DataView(buf), u = new Uint8Array(buf);
    let e = u.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("type");
    let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true);
    for (let i = 0; i < n; i++) {
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true),
        xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
      if (name === "word/document.xml") {
        const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), raw = u.subarray(start, start + size);
        const data = method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
        return new TextDecoder().decode(data).replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
      }
      p += 46 + nl + xl + cl;
    }
    throw new Error("type");
  }
  // 写真は長い辺 2000px までに縮める
  async function shrink(file) {
    const img = await createImageBitmap(file), k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return (c.toDataURL("image/jpeg", .85)).split(",")[1];
  }
  // ファイルを Claude に渡す形にする
  async function part(file) {
    const name = file.name || "", type = file.type || "";
    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      if (file.size > 30e6) throw new Error("size");
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(await file.arrayBuffer()) } };
    }
    if (type.startsWith("image/")) return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await shrink(file) } };
    if (/\.docx$/i.test(name)) return { type: "text", text: "【規程の本文】\n" + await docxText(await file.arrayBuffer()) };
    if (type.startsWith("text/") || /\.txt$/i.test(name)) return { type: "text", text: "【規程の本文】\n" + await file.text() };
    throw new Error("type");
  }
  const getKey = () => { try { return localStorage.getItem(KEY) || "" } catch (e) { return "" } };
  const setKey = k => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY) } catch (e) {} };

  async function direct(p) {
    const key = getKey(); if (!key) throw new Error("nokey");
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01", "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-5-5", max_tokens: 8000, fallbacks: "default",
          output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
          messages: [{ role: "user", content: [p, { type: "text", text: PROMPT }] }],
        }),
      });
    } catch (e) { throw new Error("net") }
    if (res.status === 401 || res.status === 403) { setKey(""); throw new Error("badkey") }
    if (!res.ok) throw new Error(res.status === 413 ? "size" : "fail");
    const m = await res.json();
    if (m.stop_reason === "refusal") throw new Error("refusal");
    if (m.stop_reason === "max_tokens") throw new Error("long");
    return JSON.parse(m.content.filter(b => b.type === "text").map(b => b.text).join(""));
  }
  return { part, direct, getKey, setKey };
})();
