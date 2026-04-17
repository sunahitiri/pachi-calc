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

```bash
npm install
npm run dev
```

http://localhost:5173 を開く。

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
