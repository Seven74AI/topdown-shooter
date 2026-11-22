#!/usr/bin/env bash
# Story 2.2: build and (re)start the game on the VPS. Run from anywhere inside the repo checkout
# (/root/topdown-shooter):
#
#   deploy/deploy.sh              # deploy origin/master
#   deploy/deploy.sh <git-ref>    # deploy a branch, tag or sha
#
# Images are tagged topdown-server:<sha> and topdown-web:<sha> and labelled org.topdown.app=topdown;
# the last KEEP_IMAGES of each are kept, and only our labelled images are ever pruned.
#
# Every attempt is appended to deploy/deploy-history.log as `<utc-time> <sha> ok|failed`. Only an
# `ok` deploy (stack up, health 200, and the server container runs this sha's image) counts as known
# good: rollback.sh goes back to the newest `ok` sha. A failed deploy does NOT roll back by itself
# (so the failure can be looked at); it prints the logs and the exact rollback command, and exits 1.
# On success it also writes deploy/.env (GIT_SHA=<sha>), so plain `docker compose -f
# deploy/docker-compose.yml ps|logs|down` work by hand and refer to the deployed images.
# See docs/deploy.md.
#
# Everything runs inside main(): bash reads a script while running it, and the checkout below may
# replace this very file, so the whole script must be parsed before anything runs.
set -euo pipefail

main() {
	local ref="${1:-origin/master}"
	local keep="${KEEP_IMAGES:-5}"
	local health_url="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"
	local health_wait="${HEALTH_WAIT_S:-30}"
	local repo sha
	# REPO_DIR: set by rollback.sh, which runs a copy of this script from a temp file.
	repo="${REPO_DIR:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}"
	cd "$repo"
	COMPOSE=(docker compose -f deploy/docker-compose.yml)
	HISTORY="deploy/deploy-history.log"

	echo "==> git fetch origin"
	git fetch origin
	# Resolve before checking out, so a sha from deploy-history.log works too.
	sha="$(git rev-parse --short=12 "${ref}^{commit}")"
	echo "==> checking out ${ref} (${sha}) as a detached HEAD"
	git checkout --detach "$sha"
	export GIT_SHA="$sha"
	# Story 2.10: the 4-phone test day only (`ALLOW_TEST_SCENARIOS=1 deploy/deploy.sh <ref>`); the
	# compose file reads it from this environment, default 0. Exported explicitly so it is never lost.
	export ALLOW_TEST_SCENARIOS="${ALLOW_TEST_SCENARIOS:-0}"
	echo "==> ALLOW_TEST_SCENARIOS=${ALLOW_TEST_SCENARIOS}"

	if docker image inspect "topdown-server:${sha}" "topdown-web:${sha}" >/dev/null 2>&1; then
		echo "==> images for ${sha} already exist, skipping the build"
	else
		echo "==> building topdown-server:${sha} and topdown-web:${sha}"
		if ! "${COMPOSE[@]}" build; then
			# The running stack was not touched: the old version keeps serving.
			record "$sha" failed
			echo "!! build of ${sha} failed. The running stack is unchanged." >&2
			print_rollback_hint "$sha"
			exit 1
		fi
	fi

	echo "==> starting the stack (rooms on the old server get \"Server restarting\")"
	# `up -d` itself exits non-zero when the new server never turns healthy (web depends_on
	# service_healthy); that is a failed deploy too, and must still get the diagnostics below.
	local up_ok=1
	"${COMPOSE[@]}" up -d --remove-orphans || up_ok=""

	local ok=""
	if [[ -n "$up_ok" ]]; then
		echo "==> waiting up to ${health_wait} s for ${health_url}"
		for _ in $(seq 1 "$health_wait"); do
			if curl -fsS "$health_url" >/dev/null 2>&1; then
				ok=1
				break
			fi
			sleep 1
		done
	fi
	# Health must come from THIS sha, not from an old container left running.
	local running=""
	running="$(docker inspect --format '{{.Config.Image}}' "$("${COMPOSE[@]}" ps -q server 2>/dev/null)" 2>/dev/null || true)"
	if [[ -n "$ok" && "$running" != "topdown-server:${sha}" ]]; then
		echo "!! health answered, but the server container runs '${running}', not topdown-server:${sha}" >&2
		ok=""
	fi

	if [[ -z "$ok" ]]; then
		record "$sha" failed
		if [[ -z "$up_ok" ]]; then
			echo "!! docker compose up -d failed for ${sha} (the server did not become healthy?)" >&2
		else
			echo "!! ${health_url} did not answer within ${health_wait} s for ${sha}" >&2
		fi
		echo "--- docker compose ps -a" >&2
		"${COMPOSE[@]}" ps -a >&2 || true
		echo "--- server container state" >&2
		docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} restarts={{.RestartCount}} oom_killed={{.State.OOMKilled}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}' \
			"$("${COMPOSE[@]}" ps -aq server 2>/dev/null)" >&2 2>/dev/null || true
		echo "--- docker compose logs --tail=100 server web" >&2
		"${COMPOSE[@]}" logs --no-color --tail=100 server web >&2 || true
		echo "!! The site is probably DOWN now (web waits for a healthy server)." >&2
		print_rollback_hint "$sha"
		exit 1
	fi
	curl -fsS "$health_url"
	echo

	record "$sha" ok
	printf 'GIT_SHA=%s\n' "$sha" >deploy/.env
	# Never prune the current sha or the previous known-good one (the default rollback target).
	local prev_good
	prev_good="$(last_good_except "$sha")"
	prune_images topdown-server "$keep" "$sha" "$prev_good"
	prune_images topdown-web "$keep" "$sha" "$prev_good"
	docker image prune -f --filter label=org.topdown.app=topdown >/dev/null || true # our dangling layers only

	echo "==> deployed ${sha}"
}

# Appends `<utc-time> <sha> <status>` to the history log.
record() {
	echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 $2" >>"$HISTORY"
}

# The newest `ok` sha in the history that is not $1 (lines without a status are old `ok` lines).
last_good_except() {
	[[ -f "$HISTORY" ]] || return 0
	awk -v skip="$1" '($3 == "" || $3 == "ok") && $2 != skip { s = $2 } END { if (s != "") print s }' "$HISTORY"
}

print_rollback_hint() {
	local good
	good="$(last_good_except "$1")"
	if [[ -n "$good" ]]; then
		echo "!! last known-good deploy: ${good}. To go back to it, run:" >&2
		echo "!!   deploy/rollback.sh ${good}" >&2
	else
		echo "!! there is no earlier known-good deploy in ${HISTORY}." >&2
		echo "!! To bring back the old static site, run the one-line revert in docs/deploy.md › If anything fails." >&2
	fi
}

# Removes all but the newest `keep` tags of `repo` (never `current` or `previous`), so the 23 GB disk
# doesn't fill. Only images with our label are considered.
prune_images() {
	local repo="$1" keep="$2" current="$3" previous="${4:-}"
	local tags
	# Newest first by creation time; the format sorts as text.
	tags="$(docker image ls "$repo" --filter label=org.topdown.app=topdown --format '{{.CreatedAt}}	{{.Tag}}' | sort -r | cut -f2 | grep -v '^<none>$' || true)"
	local n=0 tag
	while IFS= read -r tag; do
		[[ -z "$tag" ]] && continue
		n=$((n + 1))
		if ((n > keep)) && [[ "$tag" != "$current" && "$tag" != "$previous" ]]; then
			echo "==> removing old image ${repo}:${tag}"
			docker image rm "${repo}:${tag}" >/dev/null || true
		fi
	done <<<"$tags"
}

main "$@"
