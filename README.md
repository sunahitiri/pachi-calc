# パチンコ期待値計算

スマホで使えるパチンコ期待値計算アプリ。機種ごとの回転数・投資額を記録して期待値を自動計算。

## 機能

- 日付・機種・回転数・投資額の記録
- 機種ごとのボーダーから期待値を自動計算
- 1Kあたりの回転数表示
- 記録はスマホ内（localStorage）に保存
- 機種の追加・編集・削除
- モバイル最適化されたUI

## ローカル開発

Node.js 24以降を使用する。

```bash
npm install
npm run dev
```

http://localhost:5173 を開く。

ローカルでは Vite 内の `/api/dmm` がDMMから直接ページを取得するため、別のAPI起動は不要。

## iPhoneのDMM自動取得

GitHub Pagesの画面から、専用のCloudflare Workers APIを呼び出してDMMの機種ページを取得する。
ブラウザからDMMを直接読む際のCORS制限や、従来の公開プロキシの停止に依存しない構成。
遊技記録は送信せず、機種番号だけをAPIに送信する。APIはDMMの機種ページ以外を取得できない。

### 初回のAPI公開

1. Cloudflareアカウントを作成し、プロジェクトのフォルダーで `npx wrangler login` を実行する。
2. `wrangler.jsonc` の `ALLOWED_ORIGINS` を公開サイトのオリジンに合わせる。現在は `https://sunahitiri.github.io`。
3. `npm run dmm:deploy` を実行し、表示された `https://pachi-calc-dmm.<サブドメイン>.workers.dev` を控える。
4. 現在の公開先は `https://pachi-calc-dmm.pachi-calc.workers.dev`。別のURLに変更する場合は、GitHubリポジトリの Settings → Secrets and variables → Actions → Variables で、`DMM_PROXY_URL` にそのAPIのURLを設定する。
5. GitHub Actionsの「Deploy to GitHub Pages」を実行して画面を再公開する。

公開済みAPIから機種5094の取得を確認済み。DMMへの要求にはアプリ名のUser-Agentを明示する。
DMMが取得を拒否した場合は、HTTPエラーを表示する。
APIを再公開してもブラウザに保存した遊技記録には影響しない。

### ローカルで公開APIを使う場合

`.env.example` を参考に `.env.local` を作成し、`VITE_DMM_PROXY_URL` に公開APIのURLを設定する。
その場合は `wrangler.jsonc` の `ALLOWED_ORIGINS` にローカルのオリジンも追加してAPIを再公開する。
複数のオリジンはカンマで区切る。ワイルドカードは使用しない。

### 動作確認

自動取得で `https://p-town.dmm.com/machines/5094` を入力すると、次の数値が編集フォームに入る。

- 機種名: e Re:ゼロから始める異世界生活 鬼がかり2
- 大当り確率: 349.9
- 初当り1回あたりの期待出玉: 5,391玉
- 参考ボーダー: 16.3回転

数値は確認時点のDMM掲載内容。取得結果の端末内キャッシュは24時間で更新する。
API未設定時やDMMが取得を拒否した場合は、手動貼り付けも利用できる。

## ビルド

```bash
npm run build
```

## GitHub Pagesデプロイ

1. このリポジトリを GitHub にプッシュ
2. リポジトリの Settings → Pages で「Source: GitHub Actions」を選択
3. main ブランチにpushすると自動デプロイ

URLは `https://<username>.github.io/<repo-name>/` になります。

## データ

- 機種データ、記録データはすべてブラウザのlocalStorageに保存
- 複数端末での同期はなし
- プライベートモードだとデータが保存されません

## iPhoneでの使い方

1. SafariでGitHub PagesのURLを開く
2. 共有ボタン → 「ホーム画面に追加」でアプリのように使える
