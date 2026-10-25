/*
 * 営業日誌 ← Google カレンダーの取り次ぎ
 * 題名に ⭐（★）が付いた予定だけを、直近90日〜今日の分だけ渡します。
 *
 * 置き方（最初に1回だけ）
 * 1. https://script.google.com を開き「新しいプロジェクト」
 * 2. 中身を全部消して、このファイルを丸ごと貼り付け、保存
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員 → 「デプロイ」
 * 4. 許可を求められたら自分のアカウントで「許可」
 * 5. 出てきた「ウェブアプリのURL」をコピーし、営業日誌の 設定 → カレンダー に貼る
 *
 * URL を知っている人だけが ⭐ の予定を見られます。URL は人に渡さないでください。
 */
function doGet() {
  var STAR = /[⭐★🌟]/;
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var from = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  var to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var day = function (d) { return Utilities.formatDate(d, tz, "yyyy-MM-dd") };
  var out = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    cal.getEvents(from, to).forEach(function (e) {
      var title = e.getTitle() || "";
      if (!STAR.test(title)) return;
      var s = e.getStartTime(), en = e.getEndTime();
      // 終わりは次の日の0時が入っているので、1分戻して最後の日にする
      var last = new Date(en.getTime() - 60 * 1000);
      out.push({ uid: e.getId() + "@" + day(s), title: title, start: day(s), end: day(last < s ? s : last),
        desc: e.getDescription() || "", loc: e.getLocation() || "" });
    });
  });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
