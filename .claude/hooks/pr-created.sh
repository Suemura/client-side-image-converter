#!/bin/bash
# PostToolUse フック: gh pr create の成功を検知し、
# 「レビュー → コメント対応」の自動フロー開始をメインエージェントに指示する。
# PR の URL が出力に含まれない場合（作成失敗など）は何もしない。

input=$(cat)

# gh pr create 以外のコマンドでは何もしない（if フィルタのフェイルオープン対策）
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
case "$cmd" in
  "gh pr create"*) ;;
  *) exit 0 ;;
esac

# tool_response から PR の URL を抽出
url=$(printf '%s' "$input" | jq -r '.tool_response | tostring' 2>/dev/null \
  | grep -oE 'https://github\.com/[^"[:space:]\\]+/pull/[0-9]+' | head -1)
[ -z "$url" ] && exit 0

pr_number="${url##*/}"

jq -n --arg url "$url" --arg pr "$pr_number" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("PR #" + $pr + " (" + $url + ") が作成されました。ハーネスの自動レビューフローを開始してください:\n1. pr-reviewer サブエージェント（利用できない場合は general-purpose で代替し .claude/commands/review-pr.md を Read させる）を起動し、PR #" + $pr + " のレビューとインラインコメントの投稿を行わせる。起動プロンプトには Issue / タスクの要約・変更ファイル一覧・実装意図を埋め込むこと（エージェントの探索削減のため）\n2. レビュー完了後、pr-comment-resolver サブエージェント（利用できない場合は general-purpose で代替し .claude/commands/resolve-pr-comments.md を Read させる）を起動し、PR #" + $pr + " のレビューコメント対応を行わせる。起動プロンプトには同じく要約・変更ファイル一覧・実装意図を埋め込むこと\n3. 対応結果のサマリーをユーザーに報告する")
  }
}'
