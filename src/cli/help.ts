import { DEFAULT_PORT } from "../server/index.js";

/** Command-line usage and option reference. */
export const HELP_TEXT = `Usage: zatto [options] [file...]

ローカル HTML ファイルを zatto セッションへ追加します。ファイルを省略するとビューアーを開きます。

標準出力の先頭行はトップURLです。ファイル指定時は、タイトルと直接URLの組を空行で区切って続けます。
登録できなかったパスは標準エラーへ表示します。

Commands:
  agent <usage|context> AIエージェント向けの利用方法とコンテキストを表示する
  mcp <usage|serve>     MCPの接続情報を表示またはstdioサーバーを起動する
  review <file>         ファイルをレビュー中にし、ユーザーのコメントを待ち続ける

Options:
  --port <n>      初回起動時のサーバーポート (default: ${DEFAULT_PORT})
  --host <addr>   初回起動時に、外の端末からの閲覧をこのアドレスでも受け付ける
  --no-open       ブラウザを自動で開かない
  --stop          常駐サーバーを停止する
  --import <file> セッションJSONを読み込んで全置換する
  --export <file> セッションJSONを書き出す
  -h, --help      ヘルプを表示する
  -v, --version   バージョンを表示する`;
