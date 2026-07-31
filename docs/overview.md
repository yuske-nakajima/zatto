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
| セッションの永続化 | v1 に含め、追加・削除のたびに `~/.config/zatto/session.json` へ保存する。開発時は `ZATTO_SESSION_FILE` で保存先を上書きできる |
| エントリの削除 | ユーザーの明示操作のみ。個別削除と全削除の両方を用意する |
