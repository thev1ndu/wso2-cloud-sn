#!/usr/bin/env bash

set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
LABELS_FILE="$(git rev-parse --show-toplevel)/.github/labels.yml"

if [[ ! -f "$LABELS_FILE" ]]; then
  echo "error: labels file not found: $LABELS_FILE" >&2
  exit 1
fi

echo "Syncing labels from $LABELS_FILE -> $REPO"

emit_rows() {
  if command -v yq >/dev/null 2>&1; then
    yq -r '.[] | [.name, .color, .description] | @tsv' "$LABELS_FILE"
  else
    python3 - "$LABELS_FILE" <<'PY'
import sys, yaml
for l in yaml.safe_load(open(sys.argv[1])):
    print("\t".join([l.get("name",""), l.get("color",""), l.get("description","")]))
PY
  fi
}

emit_rows | while IFS=$'\t' read -r name color desc; do
  [[ -z "$name" ]] && continue
  echo "  • $name (#$color)"
  gh label create "$name" -c "$color" -d "$desc" -R "$REPO" --force
done

echo "Done."
