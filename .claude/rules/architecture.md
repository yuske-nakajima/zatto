# 操作の共通化と通信契約

YOU MUST 変更前に `docs/architecture.md` を読み、責務と通信経路を確認すること。
YOU MUST 業務操作、入力検証、ワークスペースとサーバー識別子の照合、更新通知を共通Commandsへ集約すること。
YOU MUST CLI、Web UI、MCPの内部呼び出しに共有RPCクライアントと共有メソッド契約を使うこと。
YOU MUST 型、メソッド名、業務エラーを入口ごとに重複定義しないこと。
YOU MUST 操作を追加するときは、共有契約、Commands、必要な呼び出し元、回帰テスト、同梱の英日APIドキュメントを同じPRで更新すること。
YOU MUST HTTP受付に業務操作を実装せず、JSON-RPCのメッセージ処理とCommandsへの委譲を担当させること。
YOU MUST REST操作ルートや、CLI・MCPからStoreを直接変更する別経路を追加しないこと。
YOU MUST 旧サーバーの診断用health読取りを、通常の操作通信や互換RESTハンドラーへ拡張しないこと。
YOU MUST 永続化後の通知、保存失敗時の原子性、開始元ワークスペースの捕捉、ネイティブ選択の排他を維持すること。
YOU MUST JSON-RPC、WebSocketイベント、静的なファイル配信、外部向けstdio MCPの責務を区別すること。
YOU MUST サーバー、通信方式、永続化、操作層の責務を変更するアーキテクチャ選定では、実装前にユーザーとの壁打ちで合意すること。
YOU MUST 合意した設計と実装が変わる場合、Issueを正として横断ドキュメントとエージェント向けルールも更新すること。
YOU MUST 変更履歴はリリースPRの `CHANGELOG.md` を正本として同梱ページとGitHub Releaseへ反映すること。通常ビルドにネットワーク依存を追加しないこと。
