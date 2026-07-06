#!/bin/bash
# Stop フック: TS/TSX ファイルに未コミットの変更がある場合のみ
# lint + typecheck + test を実行し、失敗したら exit 2 で Claude に差し戻す。
# （exit 2 の stderr は Claude へのフィードバックとして送られ、自動修正を促す）

input=$(cat)

# stop_hook_active が true（すでに Stop フックからの継続中）の場合は
# 無限ループ防止のためチェックをスキップして停止を許可する
# （jq がない環境では文字列マッチにフォールバックし、無限ループ防止を維持する）
if command -v jq > /dev/null 2>&1; then
  if echo "$input" | jq -e '.stop_hook_active == true' > /dev/null 2>&1; then
    exit 0
  fi
elif [[ "$input" == *'"stop_hook_active":true'* ]]; then
  exit 0
fi

# 作業ディレクトリを決定する。EnterWorktree でセッションが worktree に入っている場合、
# 変更は worktree 側にのみ現れ、メイン checkout（CLAUDE_PROJECT_DIR）の git status には出ない。
# そのためフック stdin の cwd（セッションの現在ディレクトリ＝worktree に追従）を優先する。
# cwd が取れない場合は CLAUDE_PROJECT_DIR → . の順にフォールバックする（従来挙動）。
work_dir=""
if command -v jq > /dev/null 2>&1; then
  work_dir=$(echo "$input" | jq -r '.cwd // empty' 2>/dev/null)
fi
cd "${work_dir:-${CLAUDE_PROJECT_DIR:-.}}" || exit 0

# 変更された TS/TSX ファイルがなければスキップ
# （-uall: 未追跡ディレクトリ内のファイルも個別に列挙 / quotePath 無効化: 非 ASCII ファイル名の引用を防ぐ）
if ! git -c core.quotePath=false status --porcelain -uall 2>/dev/null | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

errors=""

if ! lint_output=$(npm run lint 2>&1); then
  errors="${errors}【lint エラー】以下を修正してください:
${lint_output}

"
fi

if ! type_output=$(npm run typecheck 2>&1); then
  errors="${errors}【typecheck エラー】以下を修正してください:
${type_output}

"
fi

if ! test_output=$(npm run test 2>&1); then
  errors="${errors}【テスト失敗】以下を修正してください:
${test_output}

"
fi

if [ -n "$errors" ]; then
  printf "%s" "$errors" >&2
  exit 2
fi

exit 0
