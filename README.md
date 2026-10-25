# 営業日誌

株式会社CSS の営業日誌・出張旅費・承認・月の出力を1つにしたWebアプリ。スマホのホーム画面に置いて使う（PWA）。

## 中身

- `index.html` `app.css` `app.js` … 画面と計算
- `data.js` … 保存先。`config.js` が空ならこの端末だけ、入っていれば Supabase
- `supabase/schema.sql` … データベースの作り方（Supabase の SQL Editor で1回実行）
- `sw.js` `manifest.webmanifest` `icons/` … ホーム画面用
- `vendor/` … PDF（html2pdf.js 0.10.1）、Excel（xlsx 0.18.5）、Supabase（supabase-js 2.45.4）

ビルドは不要。フォルダをそのまま静的ホスティングに置けば動く。

## 初めて置く時

1. Supabase でプロジェクトを作り、`supabase/schema.sql` を SQL Editor で実行する
2. Settings → API の「Project URL」と「anon public」キーを `config.js` に入れる
3. 静的ホスティングに置く
4. **最初に登録した人が管理者になる**ので、社長が最初に「はじめて使う」から登録する
5. 社員は同じアドレスを開き「はじめて使う」から登録。社長の「設定 → 社員と等級」に出てくる

## 権限

- 社員：自分の記録だけ読み書き。承認済みの記録は変えられない
- 管理者：全員の記録を読み、承認・差し戻し、旅費規程と等級を決める

## 規程の読み取り（設定 → 規程を読み込む）

PDF・写真・Word・文字のファイルを Claude に読ませて、規程の画面に入れます（保存は確かめてから）。

1. Supabase の Edge Functions に `supabase/functions/read-rules` を置く（`supabase functions deploy read-rules`）
2. Supabase の Secrets に `ANTHROPIC_API_KEY` を入れる

データ保存につないでいない時は、設定で一度だけ Anthropic の鍵（sk-ant-…）を入れると、その端末から直接読み取ります（鍵はその端末にだけ残ります）。

## カレンダーの取り込み（設定 → カレンダー）

題名に ⭐（★）を付けた予定だけを、日誌の記録として入れます（直近90日〜今日）。一度入れた予定は、記録を消しても入れ直しません。

- Google カレンダー：`calendar/google-apps-script.gs` を Apps Script にウェブアプリとして置き、その URL を貼って「つなぐ」。以後、アプリを開くたびに入ります
- それ以外：カレンダーから書き出した `.ics` を「ファイル」で選ぶ
