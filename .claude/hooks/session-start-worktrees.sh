#!/bin/bash
# SessionStart フック: マージ済み PR に対応する worktree（stale worktree）を検知し、
# セッション冒頭で /land による後片付けを促す。
# gh が使えない・オフライン等の場合は何もしない（フェイルオープン）。

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# worktree が 1 つもなければ何もしない
worktrees=$(git worktree list --porcelain 2>/dev/null | grep -c '^worktree .*\.claude/worktrees/') || true
[ "${worktrees:-0}" -eq 0 ] && exit 0

# マージ済み PR の head ブランチ一覧（1 回の API 呼び出しに抑える。
# --limit 100 は意図的な制限: stale worktree は通常直近マージ分のみが対象で、
# 100 件より古いケースは取りこぼしても次回以降の検知 or 手動 /land で回収可能
# というフェイルオープン設計の一部。SessionStart は毎セッション起動されるため、
# ネットワーク不調時に体感の起動遅延が出ないよう pr-created.sh と同じ自前
# watchdog を適用する（macOS 標準環境に timeout コマンドがないため）
gh_out=$(mktemp)
gh pr list --state merged --limit 100 --json headRefName -q '.[].headRefName' >"$gh_out" 2>/dev/null &
gh_pid=$!
# watchdog の stdout/stderr は切り離す（孤児化した sleep がフックの出力パイプを
# 保持し続けると、読み手側が sleep 終了まで待たされるため）
( sleep 10; kill "$gh_pid" 2>/dev/null ) >/dev/null 2>&1 &
watchdog_pid=$!
wait "$gh_pid" 2>/dev/null
kill "$watchdog_pid" 2>/dev/null
wait "$watchdog_pid" 2>/dev/null
merged=$(cat "$gh_out" 2>/dev/null)
rm -f "$gh_out"
[ -z "$merged" ] && exit 0

stale=""
while IFS= read -r wt; do
  path="${wt#worktree }"
  case "$path" in *".claude/worktrees/"*) ;; *) continue ;; esac
  br=$(git -C "$path" branch --show-current 2>/dev/null)
  [ -z "$br" ] && continue
  if printf '%s\n' "$merged" | grep -qxF "$br"; then
    stale="${stale}- ${path##*/} (${br})\n"
  fi
done <<EOF
$(git worktree list --porcelain 2>/dev/null | grep '^worktree ')
EOF

[ -z "$stale" ] && exit 0

jq -n --arg list "$(printf '%b' "$stale")" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("マージ済み PR に対応する worktree が残っています:\n" + $list + "後片付けには /land <Issue番号> が使えます。ユーザーが別の作業を依頼した場合はそちらを優先し、このリストは冒頭で 1 行だけ知らせてください。")
  }
}'
