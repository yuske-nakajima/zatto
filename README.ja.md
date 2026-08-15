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
デスクトップでは、ファイルパネル右側の区切りをドラッグして幅を調整できます。
区切りをダブルクリックすると、既定の幅へ戻ります。
フォルダー表示でフォルダー行を削除すると、その配下で開いているすべてのエントリをセッションから外します。
ディスク上のファイルとフォルダーは削除しません。

## 使い方

コマンドラインでファイルを指定せず、ビューアーだけを開くこともできます。

```bash
npx @yuske-nakajima/zatto
```

macOSでファイルを追加する場合は、**+ Add**、**Select HTML files**、または
<kbd>Command</kbd>+<kbd>O</kbd>から、複数の`.html`または`.htm`ファイルを選択できます。
既存のファイル選択操作とキーボードショートカットの動作は変わりません。

フォルダーから追加する場合は、独立した**Add folder…**ボタンを使います。
追加範囲は、選択したフォルダー直下のみ、または子孫フォルダーを含む範囲です。
範囲を決めた後、macOSのネイティブフォルダーダイアログで対象を選びます。
`.html`と`.htm`は大文字と小文字を区別せず、相対パスの決定的な順序で追加されます。
登録済みのパスは重複追加しません。シンボリックリンクは対象外です。
ディスク上のファイルとフォルダーは変更しません。

どちらのネイティブダイアログも絶対パスをローカルの`zatto`サーバーへ渡します。
そのため、相対アセットの表示とライブリロードを維持できます。

複数のHTMLファイルを追加する場合は、ファイルパスを続けて指定します。

```bash
npx @yuske-nakajima/zatto page.html report.html
```

起動済みの`zatto`へファイルを追加する場合も、同じコマンドを実行します。
実行ディレクトリやNode.js環境が異なる場合も、OSユーザーごとに同じサーバーへ合流します。

```bash
npx @yuske-nakajima/zatto another-page.html
```

開いているファイルと表示順をセッションJSONへ保存します。

```bash
npx @yuske-nakajima/zatto --export saved-session.json
```

保存したセッションで、開いているファイルを全置換します。

```bash
npx @yuske-nakajima/zatto --import saved-session.json
```

ファイルパネルの**Import session…**と**Export session…**も利用できます。
インポートでは、ファイル一覧の全置換または未登録パスの末尾への追加を選べます。
全置換では先頭のファイルを選択し、検索状態を解除します。
追加では既存エントリ、選択、検索状態を維持します。
エクスポートでは、表示順またはパス順を選べます。ファイルパネルの表示順は変わりません。

セッションJSONには絶対パスが入り、ユーザー名などのローカル情報を含む場合があります。
同じコンピューターでの復元を目的とした形式であり、共有には適しません。

## 組み込みドキュメント

フッター左側の**Docs**を選ぶと、メイン領域の3つ目の表示として組み込みドキュメントが開きます。
ドキュメントを開いても、セッションエントリの作成や選択は発生しません。

Getting started、CLI、API、GUI/API mappingの4ページを切り替えられます。
既定の表示言語は英語です。言語切り替えから、すべてのページを日本語で表示できます。
選択したページと言語は、URLの`doc`と`lang`へ保存されます。
再読み込みやブラウザーの「戻る」「進む」でも同じドキュメント表示を復元できます。

## AIエージェント向けインターフェース

起動中の`zatto`で開いているパスを、HTML本文を自動送信せずにAIエージェントから取得できます。

```bash
zatto agent usage
zatto agent context --json
```

コンテキストには、選択中のファイル、表示順の全ファイル、現在の`preview`、`search`、`docs`表示が含まれます。
ビューアーが起動していない場合はエラーを返し、自動起動しません。

標準入出力で動作する、汎用の読み取り専用MCPサーバーも提供します。
製品に依存しない接続情報は`zatto mcp usage`で確認できます。
MCPクライアントからは`zatto mcp serve`を起動するように設定します。
クライアント固有のセットアップや設定の自動変更は行いません。

ローカルパスには個人情報が含まれる場合があります。
HTMLは信頼できない入力として扱い、本文を外部サービスへ送信する前にユーザーの承認を得てください。

## オプション

| オプション | 説明 |
| --- | --- |
| `--port <n>` | 初回起動時の希望ポートを指定。既定値は`6280` |
| `--no-open` | ブラウザーを自動で開かずに起動 |
| `--stop` | OSユーザーの常駐サーバーを停止 |
| `--import <file>` | セッションJSONを読み込み、セッションを全置換 |
| `--export <file>` | セッションをセッションJSONへ保存 |
| `-h`, `--help` | ヘルプを表示 |
| `-v`, `--version` | バージョンを表示 |

ポートを指定して起動する場合は、次のように実行します。
他のアプリケーションが使用中の場合は、OSが割り当てたポートで起動します。
`zatto`が起動済みの場合、`--port`の指定に関係なく同じサーバーへ合流します。

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

サーバーを停止する場合:

```bash
npx @yuske-nakajima/zatto --stop
```

## サーバーの組み込み

アプリケーションは、パッケージ内部の`dist`構成に依存せず、公開サーバーを解決できます。

```js
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverEntry = require.resolve("@yuske-nakajima/zatto/server");
```

ESMからは同じサブパスの`startServer`と`DEFAULT_PORT`も利用できます。
実行可能なエントリーは`--port`、`--instance-id`、`--runtime-file`を受け取ります。
`SIGTERM`を送ると、サーバーを停止してruntime recordとlockを削除します。

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

以降のリリースでは[バージョニング方針](https://github.com/yuske-nakajima/zatto/blob/main/docs/versioning.md)に従います。
`package.json`を正本としてバージョンを更新し、テストとスクリプトの固定値も同期します。
変更を`main`へマージした後、Release workflowを手動で実行します。

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

一時的なセッションファイルとruntime fileを使い、サーバーをフォアグラウンドで起動:

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
ZATTO_RUNTIME_FILE=/tmp/zatto-server.json \
  node dist/server/index.js --port 6280
```

別のターミナルからHTMLファイルを追加:

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
ZATTO_RUNTIME_FILE=/tmp/zatto-server.json \
  node bin/zatto.js --no-open page.html
```

ヘルスチェックとセッションの確認:

```bash
ZATTO_PORT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/zatto-server.json')).port")
ZATTO_INSTANCE_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/zatto-server.json')).instanceId")
curl "http://127.0.0.1:${ZATTO_PORT}/api/health"
curl "http://127.0.0.1:${ZATTO_PORT}/api/session"
curl "http://127.0.0.1:${ZATTO_PORT}/api/session/export"
```

HTMLファイルをAPIから追加:

```bash
curl -X POST "http://127.0.0.1:${ZATTO_PORT}/api/session/add" \
  -H 'content-type: application/json' \
  --data "{\"paths\":[\"$PWD/page.html\"]}"
```

ネイティブフォルダーピッカーを開き、選択したフォルダーからHTMLを追加します。
`direct`は直下のみ、`recursive`はツリー配下すべてを対象にします。
このAPIは、管理対象サーバーがmacOSのフォルダーピッカーを提供する場合に利用できます。

```bash
# 直下のみ
curl -X POST "http://127.0.0.1:${ZATTO_PORT}/api/session/pick-directory" \
  -H 'content-type: application/json' \
  -H "x-zatto-instance-id: ${ZATTO_INSTANCE_ID}" \
  --data '{"mode":"direct"}'

# ツリー配下すべて
curl -X POST "http://127.0.0.1:${ZATTO_PORT}/api/session/pick-directory" \
  -H 'content-type: application/json' \
  -H "x-zatto-instance-id: ${ZATTO_INSTANCE_ID}" \
  --data '{"mode":"recursive"}'
```

`GET /api/session`で取得したIDを、表示順ですべて指定して並べ替え:

```bash
curl -X PATCH "http://127.0.0.1:${ZATTO_PORT}/api/session/order" \
  -H 'content-type: application/json' \
  --data '{"ids":["<entry-id-2>","<entry-id-1>"]}'
```

検証済みのセッションJSONをインポートします。
サーバー識別子により、接続先が変わったブラウザーやCLIからの置き換えを防ぎます。
`?mode=merge`を付けると、既存エントリを維持して未登録パスを末尾へ追加します。
`mode`を省略すると、CLI互換のためセッションを全置換します。

```bash
curl -X PUT "http://127.0.0.1:${ZATTO_PORT}/api/session" \
  -H 'content-type: application/json' \
  -H "x-zatto-instance-id: ${ZATTO_INSTANCE_ID}" \
  --data "$(cat saved-session.json)"
```

管理対象のサーバーを停止:

```bash
ZATTO_RUNTIME_FILE=/tmp/zatto-server.json \
  node bin/zatto.js --stop
```

## ライセンス

[MIT License](LICENSE)

## 謝辞

`zatto`は、`.md`をブラウザーで束ねて読めるMarkdownビューアー
[k1LoW/mo](https://github.com/k1LoW/mo)に着想を得ています。

その「ファイルを束ねて閲覧する」体験をHTMLに持ち込んだのが`zatto`です。
素晴らしい先行ツールに感謝します。`mo`はMITライセンスで公開されています。
