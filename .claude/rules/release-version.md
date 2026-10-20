# リリースPRとバージョン

YOU MUST `package.json` の `version` を配布版の正本として扱うこと。
YOU MUST 通常の機能・修正PRではバージョンを加算せず、release-pleaseが作成するリリースPRで更新すること。
YOU MUST PRのタイトルとsquashコミットにConventional Commitsを使い、公開契約の非互換変更には `!` または `BREAKING CHANGE:` を付けること。
YOU MUST GitHubのマージ設定を、squashだけ・コミットのタイトルはPRタイトル・本文は空のまま保つこと。マージコミットでマージすると変更履歴に同じ行が2つ入る。
YOU MUST 後方互換な機能追加は `feat`、修正は `fix` とし、公開物の文書・内部処理の変更もリリース設定の対象種別で分類すること。
YOU MUST リリースPRでは `package.json`、`.release-please-manifest.json`、`CHANGELOG.md` の版と内容を照合すること。
YOU MUST 同梱ChangelogとGitHub Releaseの本文を、リリースPRで承認した `CHANGELOG.md` の該当節から生成すること。
YOU MUST 通常ビルドにGitHubへの接続を追加せず、履歴をオフラインで生成すること。
YOU MUST バージョンの固定値をテストや検証スクリプトへ重複定義しないこと。
YOU MUST 公開済みのバージョンとタグを付け直さず、詳細は `docs/versioning.md` と `docs/releasing.md` に従うこと。

## リリースの案内

YOU MUST 通常PRの作成時に、リリース要否と変更種別をユーザーへ説明すること。
YOU MUST 通常PRのmainマージを確認したら、自動生成されたリリースPRの状態を確認して案内すること。
YOU MUST リリースPRのマージを確認したら、Release workflowとnpmの公開状況を確認すること。
YOU MUST 公開失敗時は実行ログと対象タグを確認し、同じタグの再試行手順を案内すること。
YOU MUST ユーザーからの催促を待たず、該当する作業の報告に次の操作を含めること。
