#!/usr/bin/env bash
# Story 2.2: build and (re)start the game on the VPS. Run from anywhere inside the repo checkout
# (/root/topdown-shooter):
#
#   deploy/deploy.sh              # deploy origin/master
#   deploy/deploy.sh <git-ref>    # deploy a branch, tag or sha (a rollback is an older sha)
#
# Images are tagged topdown-server:<sha> and topdown-web:<sha>; the last KEEP_IMAGES of each are
# kept. Every successful deploy is appended to deploy/deploy-history.log (used by rollback.sh).
# See docs/deploy.md.
#
# Everything runs inside main(): bash reads a script while running it, and the checkout below may
# replace this very file, so the whole script must be parsed before anything runs.
set -euo pipefail

main() {
	local ref="${1:-origin/master}"
	local keep="${KEEP_IMAGES:-5}"
	local health_url="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"
	local repo compose sha
	# REPO_DIR: set by rollback.sh, which runs a copy of this script from a temp file.
	repo="${REPO_DIR:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}"
	cd "$repo"
	compose=(docker compose -f deploy/docker-compose.yml)

	echo "==> git fetch origin"
	git fetch origin
	# Resolve before checking out, so a sha from deploy-history.log works too.
	sha="$(git rev-parse --short=12 "${ref}^{commit}")"
	echo "==> checking out ${ref} (${sha}) as a detached HEAD"
	git checkout --detach "$sha"
	export GIT_SHA="$sha"

	if docker image inspect "topdown-server:${sha}" "topdown-web:${sha}" >/dev/null 2>&1; then
		echo "==> images for ${sha} already exist, skipping the build"
	else
		echo "==> building topdown-server:${sha} and topdown-web:${sha}"
		"${compose[@]}" build
	fi

	echo "==> starting the stack (rooms on the old server get \"Server restarting\")"
	"${compose[@]}" up -d --remove-orphans

	echo "==> waiting for ${health_url}"
	local ok=""
	for _ in $(seq 1 30); do
		if curl -fsS "$health_url" >/dev/null 2>&1; then
			ok=1
			break
		fi
		sleep 1
	done
	if [[ -z "$ok" ]]; then
		echo "!! ${health_url} did not answer within 30 s. Logs: ${compose[*]} logs --tail=100 server web" >&2
		"${compose[@]}" ps >&2 || true
		exit 1
	fi
	curl -fsS "$health_url"
	echo

	echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ${sha}" >>deploy/deploy-history.log
	prune_images topdown-server "$sha" "$keep"
	prune_images topdown-web "$sha" "$keep"

	echo "==> deployed ${sha}"
}

# Removes all but the newest `keep` tags of `repo` (never `current`), so the 23 GB disk doesn't fill.
prune_images() {
	local repo="$1" current="$2" keep="$3"
	local tags
	# Newest first by creation time; the format sorts as text.
	tags="$(docker image ls "$repo" --format '{{.CreatedAt}}	{{.Tag}}' | sort -r | cut -f2 | grep -v '^<none>$' || true)"
	local n=0 tag
	while IFS= read -r tag; do
		[[ -z "$tag" ]] && continue
		n=$((n + 1))
		if ((n > keep)) && [[ "$tag" != "$current" ]]; then
			echo "==> removing old image ${repo}:${tag}"
			docker image rm "${repo}:${tag}" >/dev/null || true
		fi
	done <<<"$tags"
	docker image prune -f >/dev/null || true # dangling layers from earlier builds
}

main "$@"
