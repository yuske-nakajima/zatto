# Changelog

## [3.4.0](https://github.com/yuske-nakajima/zatto/compare/v3.3.1...v3.4.0) (2026-10-20)


### Features

* --host で外の端末からの閲覧を受け付ける（トークン認証・閲覧のみ） ([ee57dfd](https://github.com/yuske-nakajima/zatto/commit/ee57dfdc889bed52dbdfb868077050890e3783af))
* --host で外の端末からの閲覧を受け付ける（トークン認証・閲覧のみ） ([9296301](https://github.com/yuske-nakajima/zatto/commit/9296301bc1d20d03a5c9cf9afccbe00b4e265573)), closes [#104](https://github.com/yuske-nakajima/zatto/issues/104)

## [3.3.1](https://github.com/yuske-nakajima/zatto/compare/v3.3.0...v3.3.1) (2026-10-20)


### Bug Fixes

* **server:** Host ヘッダーと WebSocket の Origin を検証して DNS rebinding を防ぐ ([37eb8e6](https://github.com/yuske-nakajima/zatto/commit/37eb8e665a3748a35365c13b028b451fe4c853b4))
* **server:** Host ヘッダーと WebSocket の Origin を検証して DNS rebinding を防ぐ ([46790e1](https://github.com/yuske-nakajima/zatto/commit/46790e19f82f83809df6816967adebd05d499e22)), closes [#103](https://github.com/yuske-nakajima/zatto/issues/103)

## [3.3.0](https://github.com/yuske-nakajima/zatto/compare/v3.2.1...v3.3.0) (2026-10-20)


### Features

* **review:** 開いているタブがあれば zatto review は新しいタブを開かずそのタブにファイルを表示する ([29b0aed](https://github.com/yuske-nakajima/zatto/commit/29b0aed18d243f84ec1d8766b3903c27808cd576))
* **review:** 開いているタブがあれば zatto review は新しいタブを開かずそのタブにファイルを表示する ([3aa947c](https://github.com/yuske-nakajima/zatto/commit/3aa947c5fe7018ada2583360a85a264236524daf))

## [3.2.1](https://github.com/yuske-nakajima/zatto/compare/v3.2.0...v3.2.1) (2026-10-18)


### Documentation

* **media:** READMEの英日のGIF・ポスター・コマ一覧とaltを25秒のPVに合わせる ([1c0d2fc](https://github.com/yuske-nakajima/zatto/commit/1c0d2fc7848f376d32ec1f4a9cff0fa6882be339))
* **video:** PVをAIの資料へのコメントと返事を中心にした25秒の構成に作り直す ([3e44bdc](https://github.com/yuske-nakajima/zatto/commit/3e44bdcdca0ea1314647d69cfd28dbc594d5b064))
* **video:** PVをAIの資料へのコメントと返事を中心に作り直し、40秒の機能紹介を加える ([3114a0d](https://github.com/yuske-nakajima/zatto/commit/3114a0d3aaa8f34787cae4eacb5af087c6e5bbe0))
* **video:** 機能を一通り見せる40秒の英日の機能紹介動画を加える ([9d413c4](https://github.com/yuske-nakajima/zatto/commit/9d413c41f216f888d91ef1c66f470770194d7843))

## [3.2.0](https://github.com/yuske-nakajima/zatto/compare/v3.1.0...v3.2.0) (2026-10-18)


### Features

* **review:** LLMへの依頼文に動いているzattoのCLIを絶対パスで入れる ([463a952](https://github.com/yuske-nakajima/zatto/commit/463a95247abe8408596f76feeb73891d51a5d7ef)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** コメント・返信のたびにLLMのセッションへ届け、画面からレビューを始める ([fc5b5e4](https://github.com/yuske-nakajima/zatto/commit/fc5b5e4f3bf4eab5018da232f5ebd2918b216e99)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** コメントの表示を整え、画像の添付と配信状態を加える ([a67fb2c](https://github.com/yuske-nakajima/zatto/commit/a67fb2c5948931aa93a032ba8650571018d77b46)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** スレッドをチャットの吹き出しで表示し、返信した LLM をアバターで示す ([b0de57f](https://github.com/yuske-nakajima/zatto/commit/b0de57f2cbb8ee0d91647749bf9cb199f666f0d5)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** プレビューの文章にコメントのスレッドを立て、LLMと確認をやり取りする ([880302a](https://github.com/yuske-nakajima/zatto/commit/880302a3aefc39439dd0c56cb750351e3f490cee))
* **review:** プレビューの文章にコメントのスレッドを立て、LLMと確認をやり取りする ([880ce6a](https://github.com/yuske-nakajima/zatto/commit/880ce6a3c03b8f61d1e42fc9230298546ab51186)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** やり取りの場所と LLM の動きを見失わないようにする ([b86494b](https://github.com/yuske-nakajima/zatto/commit/b86494b2e0e165caaa645779c4f20ae2a4cf7222)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** リンクで移った先のページを登録して選び直し、コメントできるようにする ([321a02a](https://github.com/yuske-nakajima/zatto/commit/321a02a9abab64469916076c91ea7cd892db4825)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** レビューを始めたときに、まだ答えていないスレッドをまとめて送る ([519dccc](https://github.com/yuske-nakajima/zatto/commit/519dccc78b9b624562229076c6c4fea105b47b45)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** 不明な LLM のアバターを「？」のない絵柄にする ([8069386](https://github.com/yuske-nakajima/zatto/commit/8069386f2c7a316069eb090faa1cd6c469325c13)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** 待機を常駐させ、LLMへの依頼をコピーで渡す ([65add5a](https://github.com/yuske-nakajima/zatto/commit/65add5a291e4074548a88f2a9b3aa6ff6718f328)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** 未読の返信の件数とファイルの一覧をステータスバーに出し、隠れたスレッドを既読にしない ([1eaadc9](https://github.com/yuske-nakajima/zatto/commit/1eaadc99d1dcfcaabd846954bde151ef4aa2edb0)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** 未読の返信をスレッドの単位で数える ([755d2ee](https://github.com/yuske-nakajima/zatto/commit/755d2eee5d0d797bcdf0bd1a1bbf72c04023ab6d)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)
* **review:** 直した文章へスレッドを付け直し、付け直し忘れの返信を差し戻す ([f5f5d91](https://github.com/yuske-nakajima/zatto/commit/f5f5d919e32be7100ce83a68bda23aff9992a368)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)


### Bug Fixes

* **review:** 同じセッションでつなぎ直したときに、レビューのクライアントを補う ([5971993](https://github.com/yuske-nakajima/zatto/commit/5971993a190c63d2fae48de0cc37cc2444c91567)), closes [#94](https://github.com/yuske-nakajima/zatto/issues/94)

## [3.1.0](https://github.com/yuske-nakajima/zatto/compare/v3.0.0...v3.1.0) (2026-10-17)


### Features

* **view:** Markdownのタスクリストのチェックをプレビューから切り替える ([1fe1871](https://github.com/yuske-nakajima/zatto/commit/1fe1871d82569183b8f81dce7dc2a105c802911b)), closes [#67](https://github.com/yuske-nakajima/zatto/issues/67)
* **view:** Markdownファイルを閲覧専用で表示する ([0071905](https://github.com/yuske-nakajima/zatto/commit/0071905f1dc61ed5123741ce1b37df1e605288d3))
* **view:** Markdownファイルを閲覧専用で表示する ([16e8b30](https://github.com/yuske-nakajima/zatto/commit/16e8b30aef131344b704dd04141fe6aeda0468e4)), closes [#67](https://github.com/yuske-nakajima/zatto/issues/67)


### Bug Fixes

* **view:** Mermaidの構文エラー時に既定のエラー図を残さない ([e44c5c5](https://github.com/yuske-nakajima/zatto/commit/e44c5c5c703238e28cdc7b1f4a459b7dde4e88bd))

## [3.0.0](https://github.com/yuske-nakajima/zatto/compare/v2.1.0...v3.0.0) (2026-10-17)


### ⚠ BREAKING CHANGES

* **mcp:** session.add / setFavorite / reorder / remove / removeMany / clear / import / export / pickFiles / pickDirectory と agentContext.set は workspaceId（対象ワークスペース）が必須になった。読取り操作は workspaceId を 受け付けない。稼働中の 2.x サーバーは 3.0.0 の zatto --stop で停止してから 起動し直す必要がある。

### Features

* **mcp:** MCPからのファイル削除・ワークスペース作成・整理を追加 ([19cda07](https://github.com/yuske-nakajima/zatto/commit/19cda074912890ac20fbc181ca322fd42bd7775b)), closes [#87](https://github.com/yuske-nakajima/zatto/issues/87)

## [2.1.0](https://github.com/yuske-nakajima/zatto/compare/v2.0.0...v2.1.0) (2026-10-17)


### Features

* **mcp:** ワークスペースの整理状態の参照とファイル登録を追加 ([54e0134](https://github.com/yuske-nakajima/zatto/commit/54e0134c489b3d51082d23c2a78bc46bd63dd2d2))
* **mcp:** ワークスペースの整理状態の参照とファイル登録を追加 ([d474e03](https://github.com/yuske-nakajima/zatto/commit/d474e03b2a26adbe3a61c98f0b8a003ae107446a)), closes [#71](https://github.com/yuske-nakajima/zatto/issues/71)


### Documentation

* **mcp:** MCPクライアントへの登録例を追加 ([1053983](https://github.com/yuske-nakajima/zatto/commit/105398305687604be4ce8877a31e887ff741d8ac)), closes [#71](https://github.com/yuske-nakajima/zatto/issues/71)

## [2.0.0](https://github.com/yuske-nakajima/zatto/compare/v1.2.0...v2.0.0) (2026-10-17)


### ⚠ BREAKING CHANGES

* **rpc:** REST操作APIを廃止し、POST /rpcへ移行する。 旧サーバーは旧版CLIで停止してから2.0.0を起動する必要がある。 ワークスペースと交換ファイルの保存形式は維持する。

### Features

* **changelog:** 変更履歴の正本から同梱ページを生成 ([d9e9067](https://github.com/yuske-nakajima/zatto/commit/d9e906736f60811d79015c37847966774a122dfa))
* **docs:** 変更履歴とロゴ下のバージョンを表示 ([bb28a66](https://github.com/yuske-nakajima/zatto/commit/bb28a66a8c88f5b1020dce81467c606db8049587))
* **rpc:** 操作通信を共通CommandsとJSON-RPCへ統一 ([9e806f0](https://github.com/yuske-nakajima/zatto/commit/9e806f07129392e8f3a8b1bc73530d85cd97ae86)), closes [#75](https://github.com/yuske-nakajima/zatto/issues/75)

## [1.2.0](https://github.com/yuske-nakajima/zatto/releases/tag/v1.2.0) (2026-10-17)

## What's Changed
* feat(cli): 指定ファイルのタイトルと直接URLを表示する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/74


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v1.1.0...v1.2.0

## [1.1.0](https://github.com/yuske-nakajima/zatto/releases/tag/v1.1.0) (2026-10-17)

## What's Changed
* feat(favorites): 星付きファイルの保存と一覧表示を追加する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/73


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v1.0.0...v1.1.0

## [1.0.0](https://github.com/yuske-nakajima/zatto/releases/tag/v1.0.0) (2026-10-17)

## What's Changed
* feat(workspaces): ワークスペースを追加し1.0.0へ更新する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/72


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.6.1...v1.0.0

## [0.6.1](https://github.com/yuske-nakajima/zatto/releases/tag/v0.6.1) (2026-09-15)

## What's Changed
* feat: add bilingual zatto promotional videos by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/60
* chore(deps): 依存性を更新し脆弱性 GHSA 12件を解消 by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/62


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.6.0...v0.6.1

## [0.6.0](https://github.com/yuske-nakajima/zatto/releases/tag/v0.6.0) (2026-08-18)

## What's Changed
* feat: フォルダーとプレビューのファイル操作を統一する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/56


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.5.0...v0.6.0

## [0.5.0](https://github.com/yuske-nakajima/zatto/releases/tag/v0.5.0) (2026-08-15)

## What's Changed
* feat: AIエージェント向けコンテキストCLIとMCPを追加する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/53


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.4.0...v0.5.0

## [0.4.0](https://github.com/yuske-nakajima/zatto/releases/tag/v0.4.0) (2026-08-15)

## What's Changed
* feat: 組み込みドキュメントを英語と日本語で表示する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/51


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.3.0...v0.4.0

## [0.3.0](https://github.com/yuske-nakajima/zatto/releases/tag/v0.3.0) (2026-08-14)

## What's Changed
* feat: フォルダー配下のHTMLを範囲指定して追加する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/49


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.2.0...v0.3.0

## [0.2.0](https://github.com/yuske-nakajima/zatto/releases/tag/v0.2.0) (2026-08-14)

## What's Changed
* feat: フォルダー配下のセッション項目を一括削除する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/47


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.7...v0.2.0

## [0.1.7](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.7) (2026-08-12)

## What's Changed
* fix: ページ内検索のIME対応とversion方針を整備する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/45


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.6...v0.1.7

## [0.1.6](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.6) (2026-08-12)

## What's Changed
* feat: セッションJSONのインポートとエクスポートを追加する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/42


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.5...v0.1.6

## [0.1.5](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.5) (2026-08-08)

## What's Changed
* feat: 操作説明ステータスバーとWebアプリアイコンを追加する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/39


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.4...v0.1.5

## [0.1.4](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.4) (2026-08-08)

## What's Changed
* feat: HTML検索と履歴ナビゲーションを追加する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/36


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.3...v0.1.4

## [0.1.3](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.3) (2026-08-05)

## What's Changed
* feat: publish the server entry point by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/35


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.2...v0.1.3

## [0.1.2](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.2) (2026-08-04)

## What's Changed
* feat: macOSのブラウザー画面からHTMLファイルを追加できるようにする by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/31
* feat: サイドバーの幅を調整できるようにする by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/33


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.1...v0.1.2

## [0.1.1](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.1) (2026-07-31)

## What's Changed
* Coordinate one zatto server per OS user by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/28


**Full Changelog**: https://github.com/yuske-nakajima/zatto/compare/v0.1.0...v0.1.1

## [0.1.0](https://github.com/yuske-nakajima/zatto/releases/tag/v0.1.0) (2026-07-31)

## What's Changed
* feat: add server foundation by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/6
* feat: add CLI entrypoint by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/7
* feat: add web viewer and live reload by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/8
* feat: add file panel views and ordering by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/11
* feat: apply web UI branding and English copy by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/12
* chore: add CI and dependency management by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/13
* feat: add file panel utilities by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/18
* Web UIのデザインとドラッグプレビューを更新する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/21
* 選択中のエントリをURLに保持する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/22
* フォルダービューを折りたたみ可能なディレクトリツリーにする by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/25
* npmパッケージとして配布できる構成を整備する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/24
* npm公開時にCLIエントリが削除されないようにする by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/26
* npmパッケージをユーザースコープで公開する by @yuske-nakajima in https://github.com/yuske-nakajima/zatto/pull/27

## New Contributors
* @yuske-nakajima made their first contribution in https://github.com/yuske-nakajima/zatto/pull/6

**Full Changelog**: https://github.com/yuske-nakajima/zatto/commits/v0.1.0
