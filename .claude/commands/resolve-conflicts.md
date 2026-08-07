---
description: >-
  PR ブランチのマージコンフリクトを origin/main のマージ取り込みで解消し、
  lint / typecheck / test を通して push する。「コンフリクト解消して」
  「コンフリクト直して」「コンフリクト起きてる」「マージできない」と
  言われたら使う。
argument-hint: "[PR番号 | ブランチ名]"
---

PR ブランチのコンフリクトを解消し、検証して push してください。

対象: $ARGUMENTS

このコマンドは「origin/main の取り込み → コンフリクト解消 → 検証 → push」を定型化する。このリポジトリは rebase ではなく **merge 方式**（`Merge remote-tracking branch 'origin/main' into <branch>`）で履歴を作っているため、それに従う。

## 手順

### 1. 対象ブランチの特定と作業場所

- 引数は PR 番号またはブランチ名（省略時: `gh pr list --state open --json number,title,headRefName,mergeable` からコンフリクト中の PR を探し、複数あれば確認する）
- PR 番号なら `gh pr view {番号} --json headRefName,mergeable,url` でブランチ名を得る
- 作業場所の優先順位:
  1. 対応する worktree（`.claude/worktrees/issue-{番号}/`）が存在 → `EnterWorktree` の `path` 指定で入る
  2. worktree がない → メイン checkout の状態を確認（未コミット変更があれば中断）し、`git switch {ブランチ名}` する
- worktree / checkout に未コミット変更がある場合は中断して確認する

### 2. マージ

```bash
git fetch origin
git merge origin/main
```

コンフリクトが出たら `git status --porcelain` と `git diff` で全コンフリクトファイルを把握する。

### 3. 解消方針

**両側の変更意図を理解してから統合する**こと。機械的にどちらか一方を採用しない。定番パターン:

- **CLAUDE.md / docs/ / README**: 両側の追記を統合する。セクション単位で両方を残し、重複記述は一本化。CLAUDE.md はサイズ予算 20KB（`wc -c`）に注意
- **package-lock.json**: 手で編集しない。`git checkout --theirs package-lock.json`（origin/main 側を採用）した上で、自ブランチが依存を追加している場合のみ `npm install` で再解決する。依存追加がなければ theirs 採用のみでよい
- **package.json**: scripts / dependencies を両側マージ。lockfile と整合させる
- **i18n（`src/i18n/`）**: 両側のキー追加を統合する（キー順は既存に合わせる）
- **ソースコード**: 双方の変更目的（対応 Issue / PR）を `git log` で確認し、両方の意図が生きる形に統合する。判断がつかない場合は中断してユーザーに提示する

### 4. 検証

```bash
npm run lint
npm run typecheck
npm run test
```

3 つすべて成功が完了条件。マージ起因の失敗（型の突き合わせ・テストの期待値）は修正して再実行する。node_modules がない worktree では先に `npm ci`（lockfile 解消後なら `npm install` ではなく再度 `npm ci`）。

### 5. コミットと push

- マージコミットのメッセージはデフォルト（`Merge remote-tracking branch 'origin/main' into <branch>`）のままでよい。解消内容に特記事項があれば本文に日本語で 1-2 行追記する
- `git push` する（force push は禁止・不要。マージ方式なので履歴は前進するだけ）
- push 後、`gh pr view {番号} --json mergeable` で `MERGEABLE` になったことを確認する（GitHub 側の再計算に数秒かかることがある）

### 6. 報告

- 解消したファイルと統合方針の要約（1 ファイル 1 行）
- 検証結果（lint / typecheck / test）
- PR の mergeable 状態

## 中断条件

- 対象 PR / ブランチを特定できない
- 作業場所に未コミット変更がある
- 双方の変更意図が衝突していて統合判断がつかない（両案を提示して確認）
- 検証が解消と無関係な理由で失敗する
