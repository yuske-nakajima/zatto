import { DEFAULT_PORT } from "../server/index.js";

/** Command-line usage and option reference. */
export const HELP_TEXT = `Usage: zatto [options] [file...]

ローカル HTML ファイルを zatto セッションへ追加します。ファイルを省略するとビューアーを開きます。

Commands:
  agent <usage|context> AIエージェント向けの利用方法とコンテキストを表示する
  mcp <usage|serve>     MCPの接続情報を表示またはstdioサーバーを起動する

Options:
  --port <n>      初回起動時のサーバーポート (default: ${DEFAULT_PORT})
  --no-open       ブラウザを自動で開かない
  --stop          常駐サーバーを停止する
  --import <file> セッションJSONを読み込んで全置換する
  --export <file> セッションJSONを書き出す
  -h, --help      ヘルプを表示する
  -v, --version   バージョンを表示する`;
