#!/usr/bin/env bash
# Rewrite bobthefrog history: replace each commit's DESCRIPTION (body) with a
# random Model/Quant/Config line from the 15-option list. Subject lines are
# untouched. Author/committer/dates are preserved.
#
# Usage:
#   btf-rewrite-history.sh preview   # print what each message would become
#   btf-rewrite-history.sh apply     # actually rewrite via git filter-branch
set -euo pipefail
cd /Users/robertkarl/Code/bobthefrog

FILTER=/tmp/btf-msg-filter.sh

cat > "$FILTER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
MODELS=(
  "Qwen 3.8 27B" "Qwen 3.8 27B" "Qwen 3.8 27B" "Qwen 3.8 27B" "Qwen 3.8 27B"
  "Qwen 3 30B A3B (MoE)" "QFN"
  "Gemma 3 12B" "Gemma 3 12B"
  "Mistral Small 24B" "Phi-4 14B" "Llama 3.1 8B"
  "Granite 3.3 7B" "Granite 2.0 13B" "Granite 2.0 7B"
)
QUANTS=(
  "exl3 (~2.2 bpw)" "exl3 (~2.2 bpw)" "Bonsai 2 (custom quant)" "Bonsai 2 (custom quant)" "IQ3_XXS"
  "IQ3_XXS" "Q3"
  "Q6_K" "Q4_K_M"
  "Q3_K_M" "Q5_K_M" "Q5_K_M"
  "Q6_K" "Q4_K_M" "Q8_0"
)
CONFIGS=(
  "exllamav3 · 3090 · medium" "exllamav3 · 3090 · low"
  "llama.cpp · 4090 · medium" "llama.cpp · 4090 · xhigh" "llama.cpp · 16 GB · medium"
  "llama.cpp · 16 GB · medium" "llama.cpp · 16 GB · medium"
  "llama.cpp · 1070Ti · medium" "llama.cpp · 1070Ti · medium"
  "llama.cpp · 3090 · medium" "llama.cpp · 1070Ti · medium" "llama.cpp · 1070Ti · medium"
  "llama.cpp · 1070Ti · medium" "llama.cpp · 1070Ti · medium" "llama.cpp · 1070Ti · medium"
)
i=$(( RANDOM % 15 ))
# keep the subject (first line), drop the old body, append the random option
IFS= read -r subject
while IFS= read -r _; do :; done
printf '%s\n\nModel: %s · Quant: %s · Config: %s\n' \
  "$subject" "${MODELS[$i]}" "${QUANTS[$i]}" "${CONFIGS[$i]}"
EOF
chmod +x "$FILTER"

mode="${1:-preview}"

if git status --porcelain | grep -q '^[^?]'; then
  echo "ERROR: working tree has modified/staged files. Commit or stash first." >&2
  exit 1
fi

case "$mode" in
  preview)
    # Newest-first; each message is run through the same random filter.
    for c in $(git rev-list master); do
      git log -1 --format='%B' "$c" | "$FILTER"
      echo "────"
    done
    ;;
  apply)
    git filter-branch -f --msg-filter "$FILTER" master
    # drop the backup refs filter-branch leaves behind
    git for-each-ref refs/original/ --format='%(refname)' \
      | xargs -n1 git update-ref -d
    echo
    echo "Rewritten. New log:"
    git log --format='%h %s' master
    echo
    echo "NOTE: origin/master still points at the old history."
    echo "Force-push only when you explicitly confirm."
    ;;
  *)
    echo "usage: $0 {preview|apply}" >&2
    exit 1
    ;;
esac