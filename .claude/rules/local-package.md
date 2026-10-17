# リポジトリ内での zatto の起動

このリポジトリの中では、`npx @yuske-nakajima/zatto` がレジストリではなく手元のパッケージを指し、`sh: zatto: command not found` で失敗する。
general プラグインが同梱する zatto MCP（`plugin:general:zatto`）も同じ理由で、このリポジトリで開いたセッションでは `CONNECTION_CLOSED` になる。ほかのリポジトリでは起きない。

YOU MUST このリポジトリでの zatto MCP の接続失敗を、認証や公開状態の問題と判断しないこと。
YOU MUST 開発中の CLI・MCP は、`pnpm run build` の後に `node bin/zatto.js` で起動すること（MCP は `node bin/zatto.js mcp serve`）。
YOU MUST 公開版をこのリポジトリの中で試すときは `npx -y --package=@yuske-nakajima/zatto@<版> zatto ...` と版を明示するか、リポジトリの外で実行すること。
YOU MUST ユーザーが使用中のサーバーを開発中のビルドで起動し直す場合は、事前に合意を得ること。
