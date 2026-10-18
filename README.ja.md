# zatto

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-white.png">
    <img src="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-black.png" alt="zatto" width="240">
  </picture>
</p>

[English](./README.md)

<p align="center">
  <a href="./media/zatto-pv-ja.mp4"><img src="./media/zatto-pv-ja.gif" alt="zattoの20秒動画を見る：ローカルHTMLを、ひとつのタブで。" width="800"></a>
</p>

インストールせずに、ローカルのHTMLとMarkdownのファイルをまとめて閲覧できます。

```bash
npx @yuske-nakajima/zatto file.html
```

`zatto`は複数のHTMLファイルを1つのセッションにまとめるローカルビューアーです。
ブラウザー上のファイルパネルから、表示するファイルを切り替えられます。
デスクトップでは、ファイルパネル右側の区切りをドラッグして幅を調整できます。
区切りをダブルクリックすると、既定の幅へ戻ります。
フォルダー表示でフォルダー行を削除すると、その配下で開いているすべてのエントリをセッションから外します。
ディスク上のファイルとフォルダーは削除しません。
各フォルダー行には、子孫を含めて開いているファイル数を表示します。
プレビュー上部から、選択中のファイルをセッションから外すこともできます。

## ワークスペース

ファイル一覧の上にある **Workspace** で、名前付きのファイル群を切り替えます。
**New workspace** は空のワークスペースを作成して選択し、**Rename** は名前を変更します。
**Delete** は確認後にワークスペースを削除します。実ファイルは削除せず、最低1件を維持します。

ファイル群とドラッグ操作で決めたListの順序は、サーバーの再起動後も復元します。
単一セッション形式のデータは **Default** に移行します。
選択中のワークスペースは全タブとCLIで共有し、`zatto file.html` もそこへ追加します。
切り替え時は検索を解除し、利用可能な先頭ファイルを選択します。
List/Folders/Favorites、パネル開閉、パネル幅はブラウザーの共通設定です。
インポート、エクスポート、Agentコンテキストは選択中のワークスペースを対象にします。
交換ファイルはversion 1の単一ファイル群形式を維持します。


## お気に入り

**List**、**Folders**、**Favorites**の各ファイル行にある星で、お気に入りを切り替えます。
星はワークスペースごとに保存され、サーバーの再起動後も残ります。
**Favorites** は星付きのファイルを元のList順で表示し、通常の並び順は変更しません。
プレビュー中のファイルの星を外しても、プレビューは維持します。

並べ替えはListで操作します。Favoritesでは **Clear All** を無効にしています。
ワークスペース全体の削除操作はListかFoldersへ戻って実行します。
星とFavoritesはキーボードで操作でき、表示方式はURL履歴、再読み込み、保存済み設定に対応します。
検索はワークスペース内の全ファイルが対象です。

交換ファイルはパスだけを保存します。全置換インポートは星を解除し、追加インポートは既存の星を保持します。
ファイルを一覧から削除して再登録した場合も、星は解除されます。


## 使い方

コマンドラインでファイルを指定せず、ビューアーだけを開くこともできます。

```bash
npx @yuske-nakajima/zatto
```

macOSでファイルを追加する場合は、**+ Add**、**Select HTML or Markdown files**、または
<kbd>Command</kbd>+<kbd>O</kbd>から、複数の`.html`、`.htm`、`.md`、`.markdown`ファイルを選択できます。

Markdownファイルは閲覧専用で表示し、GitHub形式の表、タスクリスト、コードブロックに対応します。
タスクリストのチェックだけはプレビューで切り替えられ、`[ ]`または`[x]`だけをファイルへ書き戻します。表示後にファイルが変更されていた場合は書き込みません。
ライト・ダークのテーマはシステムの設定に従い、`mermaid`のコードブロックは図として描画します。
相対パスの画像とリンクはファイルのフォルダーを基点に解決します。
テーマと図の描画処理は同梱しているため、通信は不要です。

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

標準出力の先頭行は、接続先のトップURLです。ファイル指定時は、タイトルと直接選択用URLを続けて表示します。
組ごとに空行で区切り、URLは独立した行に表示します。

```text
http://127.0.0.1:6280/

Page
http://127.0.0.1:6280/?entry=page-id

Report
http://127.0.0.1:6280/?entry=report-id
```

ポートは実際の接続先に合わせます。登録済みファイルは同じリンクを返し、重複引数は指定順に1回だけ表示します。
タイトルは省略せず、制御文字と改行は空白へ置換します。パイプ経由でも装飾は付きません。
ファイル指定なしではトップURLだけを表示します。ブラウザーを自動で開く条件は、URL出力によって変わりません。

リンクは選択中のワークスペースから対象を選びます。開くときは登録先のワークスペースを選択してください。
リンクによるワークスペースの自動切り替えは行いません。登録解除や全置換後は、そのエントリのリンクが無効になります。
存在しないパスなど、追加時に除外したパスは標準エラーへ表示します。
受理した追加要求は、全件を除外した場合も終了状態0を維持します。
ディレクトリ引数は展開せず、読取りエラーは追加全体を中止して終了状態1を返します。
通信、保存、引数のエラーも終了状態1です。フォルダーの追加には**Add folder…**を使ってください。

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

コンテキストには、選択中のファイルと表示順の全ファイルについて、候補選定用の信頼できないタイトルと、識別に使う絶対パスが含まれます。
現在の`preview`、`search`、`docs`表示も取得できます。
`preview`以外でも、選択中のファイルはセッション上の選択を表します。
タイトルは、空白の統一、Unicode制御文字・書式制御文字の削除、Unicodeコードポイント単位で200文字への制限を行います。
正規化後に空の場合はファイル名を使います。
ビューアーが起動していない場合はエラーを返し、自動起動しません。

標準入出力で動作する、汎用のMCPサーバーも提供します。
製品に依存しない接続情報は`zatto mcp usage`で確認できます。
MCPクライアントからは`zatto mcp serve`を起動するように設定します。
クライアント固有のセットアップや設定の自動変更は行いません。

| ツール | 用途 |
| --- | --- |
| `get_context` / `get_active_file` / `list_open_files` | 選択中のファイル、選択中ワークスペースのファイル、現在の表示を取得 |
| `list_workspaces` | 全ワークスペースと選択中のワークスペースを取得 |
| `list_workspace_files` | ワークスペースを切り替えずに、任意のワークスペースのファイルをList順・星・選択状態付きで取得 |
| `add_files` | 絶対パスを任意のワークスペース（省略時は選択中）へ登録し、パスごとの結果と閲覧URLを返す |
| `remove_files` | 任意のワークスペースからファイルを外す。ディスク上のファイルは削除しない |
| `create_workspace` | 選択を変えずに空のワークスペースを作成する |
| `update_files` | 任意のワークスペースで星とList上の位置（1始まり）を変更する |
| `list_review_threads` / `reply_review_thread` / `create_review_thread` / `resolve_review_thread` | ファイルのコメントのスレッドを読む・返信する・作る・解決する |

MCPツールはビューアーを自動起動せず、起動していない場合はエラーを返します。

LLMと資料について話すときは、ビューアーで**Ask an LLM to review**を押してコピーした依頼文（動いているzattoのCLIを絶対パスで示します）をLLMの会話に貼るか、LLMに`zatto review <file> --session <id>`をバックグラウンドで実行してもらいます。
コマンドは待ち続け、ファイルにコメントや返信を書くたびに1行のJSONを出力します。LLMは`zatto review reply`または`reply_review_thread`で答えます。
zattoが再起動しても再接続し、**Finish review**で終了します。ファイル一覧には未解決と解決済みのスレッド数を表示します。
コメントには画像を貼り付けかドロップで添付でき、LLMにはローカルのファイルパスで渡します。

MCPクライアントへ一度登録して使います。
グローバルにインストールした場合は、`npx -y @yuske-nakajima/zatto`の代わりに`zatto`を使います。

```sh
# Claude Code
claude mcp add zatto -- npx -y @yuske-nakajima/zatto mcp serve
# Codex
codex mcp add zatto -- npx -y @yuske-nakajima/zatto mcp serve
```

stdioサーバーを起動できるほかのクライアントでは、次のコマンドと引数を設定します。

```json
{
  "command": "npx",
  "args": ["-y", "@yuske-nakajima/zatto", "mcp", "serve"]
}
```

ローカルパスには個人情報が含まれる場合があります。
タイトルとHTMLは信頼できない入力として扱い、本文を外部サービスへ送信する前にユーザーの承認を得てください。

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

RemotionのコンポジションをStudioでプレビューします。

```bash
pnpm video:studio
```

英語版と日本語版のPVを、1920×1080のMP4として生成します。
どちらも25秒・30fps・無音で、共通のタイムラインを使います。

```bash
pnpm video:render
```

生成先は英語版が`media/zatto-pv.mp4`、日本語版が`media/zatto-pv-ja.mp4`です。
片方だけ生成する場合は、`pnpm video:render:en`または`pnpm video:render:ja`を使います。

## リリース

通常PRを`main`へマージすると、release-pleaseがリリース用PRを作成・更新します。
そのPRのバージョンと`CHANGELOG.md`を確認し、マージすると公開処理が始まります。
通常PRではバージョンを変えず、Conventional Commitsで変更種別を伝えます。
非互換変更には`!`または`BREAKING CHANGE:`を付けます。

Release workflowはGitHub Releaseの下書きとタグを作成し、タグの配布物を検証します。
検証したtarballをnpmへ公開してから、GitHub Releaseを公開します。
承認した変更履歴は、GitHub Releaseとアプリ内Docsの両方に使います。
公開に失敗したときは、対象タグを指定して再試行できます。

GitHub ActionsによるPR作成の許可と、npmのTrusted Publisher設定が必要です。
Trusted Publisherの対象は、このリポジトリの`release.yml`です。個人用トークンは使いません。
設定、確認する文章の範囲、再試行の手順は[リリース運用](https://github.com/yuske-nakajima/zatto/blob/main/docs/releasing.md)を参照してください。
版の選定は[バージョニング方針](https://github.com/yuske-nakajima/zatto/blob/main/docs/versioning.md)に従います。

## 3.0.0への更新

3.0.0では、ファイルを変更・エクスポートするRPC操作で、対象ワークスペースの`workspaceId`が必須になり、サーバーの通信バージョンが4になります。
パッケージを更新しても、稼働中の2.xサーバーは動き続けます。3.0.0の`zatto --stop`で停止してから`zatto`を起動してください。
停止するまで、3.0.0のCLIは2.xサーバーへ操作を送りません。
保存済みワークスペース、星、並び順と交換ファイルは引き継ぎます。

## 2.0.0への更新と内部設計

2.0.0はREST操作APIを廃止し、CLI、Web UI、MCPの内部通信をJSON-RPCへ統一します。
更新前に`zatto --stop`でサーバーを停止してください。
更新済みの場合は`npx --yes @yuske-nakajima/zatto@1.2.0 --stop`で旧サーバーを停止し、新版の`zatto`を起動します。
旧サーバーを検出した新版CLIは、登録や新規起動を中止し、記録削除や自動killをせず移行手順を案内します。
保存済みワークスペース、星、並び順と交換ファイルは引き継ぎます。
runtime recordがなく旧サーバーが独自ポートを使う場合は、停止コマンドへ`--port <検出したポート>`を付けます。

アプリ内Docsに変更履歴を同梱し、ロゴの下にはインストール済みの版を表示します。
設計と機能追加の手順は[アーキテクチャ](https://github.com/yuske-nakajima/zatto/blob/main/docs/architecture.md)にまとめています。
エージェントは`AGENTS.md`から`.claude/rules/`を読み、共通Commandsと共有RPC契約を使って拡張します。
アーキテクチャの選定を変える場合は、実装前にユーザーとの壁打ちで合意します。

### 同梱Changelogの更新

`CHANGELOG.md`を、リリースノートと英日Docsページの正本として使います。
v1.2.0までの17リリースは原文を引き継ぎ、以降の履歴はリリースPRで追加します。
英日どちらのページでも、変更履歴の本文は原文の言語を維持します。
`node scripts/update-changelog.mjs`でオフライン生成でき、ビルド時にも再生成します。
未公開版のメモや公開状態を示す固定文言は、別のデータとして持ちません。
通常のビルドとインストール済みzattoはGitHubへの接続を必要としません。

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

操作APIはHTTP上のJSON-RPC 2.0です。REST操作ルートは提供しません。
実際のポートをruntime fileから読み、要求を送ります。

```bash
ZATTO_PORT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/zatto-server.json')).port")
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"server.health","params":{}}'
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"session.get","params":{}}'
```

登録は`session.add`へ`{ "workspaceId": "...", "paths": [...] }`、並べ替えは`session.reorder`へ全IDを送ります。
`session.removeMany`は既知のID群を原子的に一覧から外し、実ファイルは残します。
ファイルを変更・エクスポートする操作は、対象のワークスペースを`workspaceId`で必ず指定します。選択中でないワークスペースも指定できます。
ネイティブ選択、インポート、停止ではサーバーの`instanceId`を引数で照合します。
成功結果は`result`、失敗は`error.code`と`error.data`へ返します。
全32メソッドの引数、結果、エラーと呼び出し例は、アプリ内DocsのAPIページで確認できます。

ネイティブフォルダー選択ではserver.healthのinstanceIdを使います。プレースホルダーを置き換えて実行してください。

```bash
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"session.pickDirectory","params":{"instanceId":"<server-instance-id>","mode":"direct"}}'
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":4,"method":"session.pickDirectory","params":{"instanceId":"<server-instance-id>","mode":"recursive"}}'
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
