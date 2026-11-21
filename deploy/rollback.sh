#!/usr/bin/env bash
# Story 2.2: go back to an earlier, known-good deploy.
#
#   deploy/rollback.sh          # the newest known-good deploy that is not the current one
#   deploy/rollback.sh <sha>    # a specific sha (any git ref works)
#
# "Known good" = a line `<time> <sha> ok` in deploy/deploy-history.log (deploy.sh writes `ok` only
# after the stack is up and healthy on that sha; failed attempts are logged as `failed` and are
# never chosen). "Current" = the sha of the newest line, ok or failed. So after A ok, B ok, C failed,
# a rollback goes to B; after A ok, B ok, it goes to A.
#
# It runs deploy/deploy.sh with that sha. If the images for it are still on disk (the last 5 are
# kept), nothing is rebuilt and the switch takes a few seconds.
set -euo pipefail

main() {
	local dir target
	dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	target="${1:-}"
	if [[ -z "$target" ]]; then
		local history="${dir}/deploy-history.log"
		if [[ ! -f "$history" ]]; then
			echo "!! no ${history} yet: pass a sha (git log --oneline origin/master)" >&2
			exit 1
		fi
		local current
		current="$(awk 'NF { s = $2 } END { print s }' "$history")"
		# The newest `ok` entry that is not the current sha (lines without a status are old `ok` lines).
		target="$(awk -v skip="$current" '($3 == "" || $3 == "ok") && $2 != skip { s = $2 } END { if (s != "") print s }' "$history")"
		if [[ -z "$target" ]]; then
			echo "!! no known-good deploy other than ${current} in ${history}: pass a sha" >&2
			exit 1
		fi
		echo "==> current ${current}, rolling back to the last known-good ${target}"
	fi
	# Copy the script first: deploy.sh checks out the old commit, which may change this folder.
	local tmp
	tmp="$(mktemp)"
	cp "${dir}/deploy.sh" "$tmp"
	local status=0
	REPO_DIR="$(git -C "$dir" rev-parse --show-toplevel)" bash "$tmp" "$target" || status=$?
	rm -f "$tmp"
	return "$status"
}

main "$@"
