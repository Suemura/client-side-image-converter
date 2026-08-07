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

# コンフリクトの早期検知（GitHub 側の mergeable 計算は非同期のため少し待って 1 回だけ確認。
# UNKNOWN や取得失敗・タイムアウトは無視するフェイルオープン。
# 自動レビューフロー指示の出力（下の jq）をネットワーク遅延の巻き添えにしないため、
# gh には watchdog で上限 6 秒を課す（macOS 標準環境に timeout コマンドがないため自前実装）
sleep 3
gh_out=$(mktemp)
gh pr view "$pr_number" --json mergeable -q '.mergeable' >"$gh_out" 2>/dev/null &
gh_pid=$!
# watchdog の stdout/stderr は切り離す（孤児化した sleep がフックの出力パイプを
# 保持し続けると、読み手側が sleep 終了まで待たされるため）
( sleep 6; kill "$gh_pid" 2>/dev/null ) >/dev/null 2>&1 &
watchdog_pid=$!
wait "$gh_pid" 2>/dev/null
kill "$watchdog_pid" 2>/dev/null
wait "$watchdog_pid" 2>/dev/null
mergeable=$(cat "$gh_out" 2>/dev/null)
rm -f "$gh_out"
conflict_note=""
if [ "$mergeable" = "CONFLICTING" ]; then
  conflict_note=$'\n'"注意: この PR は base ブランチとコンフリクトしています。自動レビューフローの完了後に /resolve-conflicts ${pr_number} の手順でコンフリクトを解消してください。"
fi

jq -n --arg url "$url" --arg pr "$pr_number" --arg conflict "$conflict_note" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("PR #" + $pr + " (" + $url + ") が作成されました。ハーネスの自動レビューフローを開始してください:\n1. pr-reviewer サブエージェント（利用できない場合は general-purpose で代替し .claude/commands/review-pr.md を Read させる）を起動し、PR #" + $pr + " のレビューとインラインコメントの投稿を行わせる。起動プロンプトには Issue / タスクの要約・変更ファイル一覧・実装意図を埋め込むこと（エージェントの探索削減のため）\n2. レビュー完了後、pr-comment-resolver サブエージェント（利用できない場合は general-purpose で代替し .claude/commands/resolve-pr-comments.md を Read させる）を起動し、PR #" + $pr + " のレビューコメント対応を行わせる。起動プロンプトには同じく要約・変更ファイル一覧・実装意図を埋め込むこと\n3. 対応結果のサマリーをユーザーに報告する" + $conflict)
  }
}'
