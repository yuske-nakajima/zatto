# zatto

ローカルの HTML ファイルをセッションにまとめ、ブラウザで切り替えて確認するビューアーです。

この README は利用・開発・動作確認に使うコマンドをまとめています。公開パッケージ向けの説明は Issue #5 で整備します。

## セットアップと確認

```bash
pnpm install
pnpm build
pnpm test
pnpm check
```

フォーマットを適用する場合:

```bash
pnpm format
```

## CLI

HTML ファイルを追加して起動:

```bash
node bin/zatto.js ./page.html
```

複数の HTML ファイルを追加:

```bash
node bin/zatto.js ./page.html ./report.html
```

ブラウザを自動で開かずに起動:

```bash
node bin/zatto.js --no-open ./page.html
```

ポートを指定:

```bash
node bin/zatto.js --port 6281 ./page.html
```

常駐サーバーを停止:

```bash
node bin/zatto.js --stop
node bin/zatto.js --port 6281 --stop
```

ヘルプとバージョン:

```bash
node bin/zatto.js --help
node bin/zatto.js --version
```

## 開発時の起動

フロントエンドをビルドし、サーバーをフォアグラウンドで起動:

```bash
pnpm build:web
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
  node --import tsx/esm src/server/index.ts --port 6280
```

別のターミナルから HTML ファイルを追加:

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
  node bin/zatto.js --no-open ./page.html
```

## API の確認

ヘルスチェックとセッション取得:

```bash
curl http://127.0.0.1:6280/api/health
curl http://127.0.0.1:6280/api/session
```

HTML ファイルを追加:

```bash
curl -X POST http://127.0.0.1:6280/api/session/add \
  -H 'content-type: application/json' \
  --data "{\"paths\":[\"$PWD/page.html\"]}"
```

`GET /api/session` で取得した ID を、表示したい順番ですべて指定して並べ替え:

```bash
curl -X PATCH http://127.0.0.1:6280/api/session/order \
  -H 'content-type: application/json' \
  --data '{"ids":["<entry-id-2>","<entry-id-1>"]}'
```

サーバーを停止:

```bash
curl -X POST http://127.0.0.1:6280/api/shutdown
```
