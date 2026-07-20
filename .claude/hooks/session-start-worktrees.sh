#!/bin/bash
# SessionStart フック: マージ済み PR に対応する worktree（stale worktree）を検知し、
# セッション冒頭で /land による後片付けを促す。
# gh が使えない・オフライン等の場合は何もしない（フェイルオープン）。

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# worktree が 1 つもなければ何もしない
worktrees=$(git worktree list --porcelain 2>/dev/null | grep -c '^worktree .*\.claude/worktrees/') || true
[ "${worktrees:-0}" -eq 0 ] && exit 0

# マージ済み PR の head ブランチ一覧（1 回の API 呼び出しに抑える）
merged=$(gh pr list --state merged --limit 100 --json headRefName -q '.[].headRefName' 2>/dev/null)
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
