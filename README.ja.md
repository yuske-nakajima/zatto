# zatto

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-white.png">
    <img src="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-black.png" alt="zatto" width="240">
  </picture>
</p>

[English](./README.md)

インストールせずに、ローカルのHTMLファイルをまとめて閲覧できます。

```bash
npx @yuske-nakajima/zatto file.html
```

`zatto`は複数のHTMLファイルを1つのセッションにまとめるローカルビューアーです。
ブラウザー上のファイルパネルから、表示するファイルを切り替えられます。

## 使い方

複数のHTMLファイルを追加する場合は、ファイルパスを続けて指定します。

```bash
npx @yuske-nakajima/zatto page.html report.html
```

起動済みの`zatto`へファイルを追加する場合も、同じコマンドを実行します。

```bash
npx @yuske-nakajima/zatto another-page.html
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
npx @yuske-nakajima/zatto --port 7000 page.html
```

ブラウザーを自動で開かない場合は、`--no-open`を指定します。

```bash
npx @yuske-nakajima/zatto --no-open page.html
```

## 常駐サーバーの停止

`zatto`のサーバーは、コマンドの終了後もバックグラウンドで動作します。
次回の実行時は同じサーバーへファイルを追加します。

既定ポートのサーバーを停止する場合:

```bash
npx @yuske-nakajima/zatto --stop
```

指定したポートのサーバーを停止する場合:

```bash
npx @yuske-nakajima/zatto --port 7000 --stop
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

## リリース

初回公開は、npmへログインした端末の`main`ブランチから実行します。

```bash
pnpm verify:package
npm publish --access public
```

初回公開後、GitHub ActionsをnpmのTrusted Publisherとして登録します。

```bash
npm trust github @yuske-nakajima/zatto \
  --file release.yml \
  --repo yuske-nakajima/zatto \
  --allow-publish
```

以降のリリースでは`package.json`のバージョンを更新し、変更を`main`へマージします。
その後、Release workflowを手動で実行します。

```bash
gh workflow run release.yml --ref main
```

workflowは品質チェックとパッケージ検証を実行します。
検証に成功すると、npmへの公開、バージョンタグの作成、GitHub Releaseの作成を進めます。

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
