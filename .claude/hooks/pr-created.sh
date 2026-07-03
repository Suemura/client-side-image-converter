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
    additionalContext: ("PR #" + $pr + " (" + $url + ") が作成されました。ハーネスの自動レビューフローを開始してください:\n1. general-purpose サブエージェントを起動し、.claude/commands/review-pr.md の手順（Read で読むこと）に従って PR #" + $pr + " のレビューとインラインコメントの投稿を行わせる\n2. レビュー完了後、別の general-purpose サブエージェントを起動し、.claude/commands/resolve-pr-comments.md の手順（Read で読むこと）に従って PR #" + $pr + " のレビューコメント対応を行わせる\n3. 対応結果のサマリーをユーザーに報告する")
  }
}'
