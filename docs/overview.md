# zatto 概要

## ゴール

zatto は、ローカルの HTML ファイルを手で集めて 1 つのセッションに束ね、`localhost` 上で履歴付きに閲覧するための CLI ツールである。`file:///` を都度開く代わりに、同じ画面で HTML を切り替えながら確認する用途を想定する。

## 用語

- セッション: 閲覧対象のエントリ一覧を保持する状態全体
- エントリ: 1 つの HTML ファイルを指す要素。`id`、絶対パス、表示名、追加時刻を持つ
- 合流: CLI が既存サーバーに接続し、新しいパスだけをセッションへ追加する挙動
- ビュー配信: エントリの HTML 本体と、その相対アセットを `localhost` 配下で配信すること

## アーキテクチャ

```text
+-------------+        HTTP         +------------------+        HTTP / iframe        +----------------+
| CLI         | --------------->   | Server           | -------------------------> | Front (SPA)    |
| - runtime参照|                    | - Session 管理   |                            | - Sidebar      |
| - 合流      |                    | - HTML / asset   |                            | - Viewer       |
| - --stop    |                    | - 永続化         |                            | - Live reload  |
|             |                    | - HTML 検索      |                            | - Search       |
|             |                    |                  |                            | - Status bar   |
+-------------+                    +------------------+                            +----------------+
```

## 既定値と保存先

- ポート番号: `6280`
- サーバー情報の保存先: `~/.config/zatto/server.json`
- セッション保存先: `~/.config/zatto/session.json`
- 開発時のサーバー情報上書き: `ZATTO_RUNTIME_FILE`
- 開発時の保存先上書き: `ZATTO_SESSION_FILE`

## ディレクトリ構成

```text
src/
  cli/
    index.ts
  shared/
    protocol.ts
  server/
    app.ts
    index.ts
    realtime.ts
    session.ts
    view.ts
    watch.ts
  web/
    App.tsx
    index.html
    main.tsx
    styles.css
  meta.ts
bin/
  zatto.js
test/
  cli.test.ts
  server.test.ts
  watch.test.ts
  web.test.tsx
docs/
  overview.md
```

## 設計判断

| 論点 | 決定 |
|---|---|
| アセット監視の範囲 | HTML 本体のみ監視する |
| ファイル変更の debounce | 150〜300ms を入れる。Issue #4 実装時は 200ms とする |
| リロード方式 | フロント主導（WS `file:changed` を受けて iframe を reload） |
| `<title>` 抽出 | 表示名に HTML の `<title>` を使い、無ければファイル名を使う |
| サーバーの寿命 | 自動終了しない。停止は `zatto --stop` のみ |
| サーバーの多重起動 | OSユーザーごとに1プロセスとする。サーバーが保持するlockとruntime recordで合流先を決める |
| ポート競合 | 初回起動時の希望ポートが使用中なら、OSが割り当てたポートをruntime recordへ保存する |
| CLI互換性 | health APIの`protocolVersion`と`instanceId`で接続対象を検証する |
| サーバーの公開契約 | Node.jsアプリケーションは`@yuske-nakajima/zatto/server`から実行ファイルと起動APIを解決する |
| セッションの永続化 | v1 に含め、追加・削除のたびに `~/.config/zatto/session.json` へ保存する。開発時は `ZATTO_SESSION_FILE` で保存先を上書きできる |
| エントリの削除 | ユーザーの明示操作のみ。個別削除と全削除の両方を用意する |
| ブラウザーからのファイル追加 | macOS のローカルサーバーがネイティブのファイルダイアログを開き、選択した HTML の絶対パスを既存のセッション追加処理へ渡す。ブラウザーへ公開される API はサーバー識別子を検証する |
| HTML 検索 | セッションへ登録した HTML の生データをサーバー側で固定文字列検索する。検索結果はファイルと行ごとにまとめ、プレビューとの往復中も SPA が検索状態を保持する |
| プレビュー内検索 | iframe にフォーカスがある間だけブラウザーの検索ショートカットを受け取り、可視テキストを固定文字列検索する。状態は URL や履歴へ保存せず、CSS Custom Highlight API が使えない場合は利用不能として扱う |
| 操作説明 | Zatto の操作要素にポインターまたはキーボードフォーカスがある間、画面下部のステータスバーへ短い説明を表示する。iframe 内の HTML 要素は対象外とする |

### 検索ナビゲーション

検索画面、検索語、選択中のエントリ、結果位置は URL から復元する。
ファイルパネルの `List` / `Folders` と開閉状態も URL から復元し、検索やエントリ選択と同じブラウザー履歴で移動する。
`fileView=folders` は内部の `directories` 表示へ対応し、URL に `fileView` がなければ `list`、`panel` がなければ開いた状態として扱う。
検索画面とプレビューの移動はブラウザー履歴へ追加し、入力中は現在の履歴だけを更新する。
結果一覧のスクロール位置と折りたたみ状態は、各履歴の `history.state` に保存する。
検索結果から開いたプレビューは表示テキストを選択し、該当位置までスクロールする。
表示位置を一意に証明できない場合や、属性・非表示領域・スクリプトだけに一致する場合は、通常のプレビュー表示へフォールバックする。
プレビュー内の走査量と一致件数には上限を設け、上限を超えた場合は選択を変更しない。
