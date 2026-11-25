#!/usr/bin/env bash
# Story 7.1: restore test. Restores a dump into a SCRATCH database (`topdown_restore_test`) inside the running
# postgres container, prints the row counts, then drops the scratch database. The live database is never touched.
#
#   deploy/restore.sh                       # the newest dump in /root/backups/topdown
#   deploy/restore.sh /path/to/2026-12-01.dump
#
# A real restore (after a disaster) is a manual, documented step: docs/deploy.md › Database › Restore.
set -euo pipefail

main() {
	local repo
	repo="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
	cd "$repo"
	local dir="${BACKUP_DIR:-/root/backups/topdown}"
	local dump="${1:-}"
	if [[ -z "$dump" ]]; then
		dump="$(ls -1t "$dir"/*.dump 2>/dev/null | head -n 1 || true)"
	fi
	if [[ -z "$dump" || ! -s "$dump" ]]; then
		echo "!! no dump to restore (looked in ${dir})" >&2
		exit 1
	fi
	# Globals, not locals: the EXIT trap below runs after main has returned.
	scratch="topdown_restore_test"
	COMPOSE=(env GIT_SHA="${GIT_SHA:-none}" docker compose -f deploy/docker-compose.yml)
	psql() { "${COMPOSE[@]}" exec -T postgres psql -U topdown -v ON_ERROR_STOP=1 "$@"; }

	# Review N2: drop the scratch database whatever happens (a failed pg_restore exits early under set -e).
	trap 'psql -d postgres -c "DROP DATABASE IF EXISTS ${scratch}" >/dev/null 2>&1 || true' EXIT
	echo "==> restoring ${dump} into the scratch database ${scratch}"
	psql -d postgres -c "DROP DATABASE IF EXISTS ${scratch}" -c "CREATE DATABASE ${scratch}"
	"${COMPOSE[@]}" exec -T postgres pg_restore -U topdown -d "$scratch" --no-owner --exit-on-error <"$dump"
	echo "==> row counts in the restored copy"
	psql -d "$scratch" -c "SELECT 'accounts' AS t, count(*) FROM accounts UNION ALL SELECT 'progress', count(*) FROM progress UNION ALL SELECT 'migrations', count(*) FROM drizzle.__drizzle_migrations"
	echo "==> row counts in the live database (for comparison)"
	psql -d topdown -c "SELECT 'accounts' AS t, count(*) FROM accounts UNION ALL SELECT 'progress', count(*) FROM progress"
	echo "==> restore test OK (the scratch database is dropped on exit)"
}

main "$@"
