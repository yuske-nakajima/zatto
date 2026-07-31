# zatto

インストールせずに、ローカルの HTML ファイルをまとめて閲覧できます。

```bash
npx zatto file.html
```

`zatto`は複数の HTML ファイルを1つのセッションにまとめるローカルビューアーです。
ブラウザー上のファイルパネルから、表示するファイルを切り替えられます。

## 使い方

複数の HTML ファイルを追加する場合は、ファイルパスを続けて指定します。

```bash
npx zatto page.html report.html
```

起動済みの`zatto`へファイルを追加する場合も、同じコマンドを実行します。

```bash
npx zatto another-page.html
```

## オプション

| オプション | 説明 |
| --- | --- |
| `--port <n>` | サーバーの起点ポートを指定。既定値は`6280` |
| `--no-open` | ブラウザーを自動で開かずに起動 |
| `--stop` | 指定ポートで動作する常駐サーバーを停止 |
| `-h`, `--help` | ヘルプを表示 |
| `-v`, `--version` | バージョンを表示 |

ポートを指定して起動する場合は、次のように実行します。

```bash
npx zatto --port 7000 page.html
```

ブラウザーを自動で開かない場合は、`--no-open`を指定します。

```bash
npx zatto --no-open page.html
```

## 常駐サーバーの停止

`zatto`のサーバーは、コマンドの終了後もバックグラウンドで動作します。
次回の実行時は同じサーバーへファイルを追加します。

既定ポートのサーバーを停止する場合:

```bash
npx zatto --stop
```

指定したポートのサーバーを停止する場合:

```bash
npx zatto --port 7000 --stop
```

## 開発

Node.jsとpnpmのバージョンはmiseで管理しています。

```bash
mise install
pnpm install
```

品質チェック:

```bash
pnpm check
pnpm test
pnpm build
```

フォーマット:

```bash
pnpm format
```

npmパッケージの内容と、別ディレクトリへ展開したCLIを検証:

```bash
pnpm verify:package
```

## デバッグ

フロントエンドとNode.jsのコードをビルド:

```bash
pnpm build
```

一時的なセッションファイルを使い、サーバーをフォアグラウンドで起動:

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
  node dist/server/index.js --port 6280
```

別のターミナルからHTMLファイルを追加:

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
  node bin/zatto.js --no-open page.html
```

ヘルスチェックとセッションの確認:

```bash
curl http://127.0.0.1:6280/api/health
curl http://127.0.0.1:6280/api/session
```

HTMLファイルをAPIから追加:

```bash
curl -X POST http://127.0.0.1:6280/api/session/add \
  -H 'content-type: application/json' \
  --data "{\"paths\":[\"$PWD/page.html\"]}"
```

`GET /api/session`で取得したIDを、表示順ですべて指定して並べ替え:

```bash
curl -X PATCH http://127.0.0.1:6280/api/session/order \
  -H 'content-type: application/json' \
  --data '{"ids":["<entry-id-2>","<entry-id-1>"]}'
```

サーバーをAPIから停止:

```bash
curl -X POST http://127.0.0.1:6280/api/shutdown
```

## ライセンス

[MIT License](LICENSE)

## 謝辞

`zatto`は、`.md`をブラウザーで束ねて読めるMarkdownビューアー
[k1LoW/mo](https://github.com/k1LoW/mo)に着想を得ています。

その「ファイルを束ねて閲覧する」体験をHTMLに持ち込んだのが`zatto`です。
素晴らしい先行ツールに感謝します。`mo`はMITライセンスで公開されています。
