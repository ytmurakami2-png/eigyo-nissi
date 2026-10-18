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
