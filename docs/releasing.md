# リリース運用

## 承認と公開の流れ

```text
通常PRをmainへマージ
  → release-pleaseがリリースPRを作成・更新
  → バージョンとCHANGELOG.mdをレビュー
  → リリースPRをマージ
  → GitHub Releaseの下書きとタグを作成
  → タグのコミットで品質チェックと配布物検証
  → 検証したtarballをnpmへ公開
  → GitHub Releaseを公開
```

リリースPRのマージを公開の承認として扱います。
通常PRをマージしただけではnpmへ公開しません。
複数の通常PRを、1つのリリースPRへまとめられます。

release-pleaseはConventional Commitsから次の版と変更履歴を生成します。
通常PRでは`package.json`のバージョンを手動で加算しません。
版の判断は[バージョニング方針](versioning.md)に従います。

## 変更履歴に含めること

`CHANGELOG.md`の各リリース節を、GitHub Releaseとアプリ内Docsの共通の原本にします。
リリースPRでは、次の情報が利用者に伝わるか確認してください。

- 利用者向けの機能追加と、挙動が変わる不具合修正
- 非互換な契約、削除する機能、必要な移行操作
- 実行環境の変更と、利用者に影響する依存性・セキュリティ修正
- 詳細を確認できるPRやIssueへのリンク

個々のテスト結果、内部変数の変更、公開物へ影響しないCIの調整は列挙しません。
PRのタイトルだけで移行手順が伝わらない場合は、リリースPRの該当節へ補足します。
リリースPRが更新されたら、最新の差分で文章を確認してからマージしてください。

v1.2.0までの17件は、GitHub Releasesの本文を原文で引き継ぎます。
以降はリリースPRの文章を正本にし、公開後にGitHubから取得して作り直す循環を設けません。
英日Docsの本文は同じ原文を使い、見出しなどの案内だけを各言語で表示します。

`node scripts/update-changelog.mjs`と通常ビルドは、ローカルの原本からページを生成します。
GitHubへの接続は不要です。ページは配布版までの履歴を表示します。
アプリへ「未公開」などの公開状態を固定で埋め込みません。

## GitHubとnpmの設定

GitHubのSettings → Actions → Generalで、`Allow GitHub Actions to create and approve pull requests`を有効にします。
この設定はPR作成とレビュー承認の許可が一体で、リポジトリ全体へ適用されます。
Release workflowではリリースPRの作成に使い、自動のレビュー承認は実装しません。
workflowの`GITHUB_TOKEN`へ、PR・Release・CI起動に必要な権限を指定します。
個人用アクセストークンは不要です。

`GITHUB_TOKEN`で作ったPRでは、通常の`pull_request`イベントからCIが起動しません。
このため、リリースPRのコミットを指定してCIを明示的に起動します。
ブランチが更新された場合は、異なるコミットに対する成功を流用しません。

npmのTrusted Publisherには、次の組合せを登録します。

- リポジトリ: `yuske-nakajima/zatto`
- workflow: `release.yml`
- 公開対象: `@yuske-nakajima/zatto`

Release workflowはOIDCで公開します。npmの長期トークンをSecretsへ追加する必要はありません。
Trusted Publisherの設定変更はnpmの管理権限が必要です。

## 導入時の2.0.0

v1.2.0を公開済みの起点としてmanifestへ記録します。
RPC移行の通常PRでは、公開契約の非互換変更をConventional Commitsの`!`で明示します。
そのマージから作成するリリースPRが、`package.json`とmanifestを2.0.0へ更新します。
開発途中の`package.json`が1.2.0でも、RPCを1系として公開する意味ではありません。
2.0.0のリリースPRを経由して公開します。

旧サーバーの停止とCLIの更新手順は、2.0.0の変更履歴にも含めます。
永続形式version 2と交換形式version 1は維持します。

## 失敗時の再試行

Release workflowの失敗ログで、タグと失敗した段階を確認します。
品質チェックやnpm公開が失敗した場合、GitHub Releaseは下書きのままです。
問題を修正したコードを同じタグへ上書きせず、配布コードの修正は次のリリースPRへ含めます。
認証設定や一時的な通信障害を解消した場合は、同じタグで再試行できます。

```bash
gh workflow run release.yml --ref main -f tag=v2.0.0
```

再試行は既存のリリースとタグのコミットを対象にし、任意のmainを公開しません。
同じ版がnpmへ公開済みの場合は、tarballの整合性を照合します。
同一ならnpm公開を省略して後続を再開し、異なる内容なら停止します。
タグの付け直しや、同じ版への異なる内容の公開はしません。

公開完了は、Actionsの成功、npm上の対象版、GitHub Releaseの公開状態で確認します。
ユーザーへは、通常PRのマージ後にリリースPRを案内します。
リリースPRのマージ後には公開結果を案内し、失敗時は対象タグと再試行手順を伝えます。
