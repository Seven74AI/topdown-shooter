#!/usr/bin/env bash
# Story 2.2: go back to an earlier deploy.
#
#   deploy/rollback.sh          # the deploy before the current one (from deploy/deploy-history.log)
#   deploy/rollback.sh <sha>    # a specific sha (any git ref works)
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
		current="$(tail -n 1 "$history" | cut -d' ' -f2)"
		# The newest entry that is not the current sha.
		target="$(cut -d' ' -f2 "$history" | grep -vx "$current" | tail -n 1 || true)"
		if [[ -z "$target" ]]; then
			echo "!! no earlier deploy than ${current} in ${history}: pass a sha" >&2
			exit 1
		fi
		echo "==> current ${current}, rolling back to ${target}"
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
