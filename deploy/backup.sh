#!/usr/bin/env bash
# Story 7.1 (NFR13): nightly backup of the progress database. Run by cron on the VPS (docs/deploy.md › Database):
#
#   30 3 * * * /root/topdown-shooter/deploy/backup.sh >> /root/backups/topdown/backup.log 2>&1
#
# 1. `pg_dump -Fc` from the running postgres container into /root/backups/topdown/YYYY-MM-DD.dump (written to a
#    .partial file first, so a failed dump never replaces a good one);
# 2. deletes local dumps older than 14 days;
# 3. copies the new dump off the VPS (decision 7.1 D7: a Cloudflare R2 bucket) with rclone, to BACKUP_REMOTE
#    (e.g. `r2:topdown-backups`, an rclone remote Hermes configures once), and deletes remote copies older than 14 days.
#    Without BACKUP_REMOTE (or rclone) the local dump is kept and the script exits 2, so cron's mail/log shows it.
#
# Settings (environment or deploy/backup.env, not in git): BACKUP_DIR, BACKUP_REMOTE, KEEP_DAYS.
set -euo pipefail

main() {
	local repo
	repo="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
	cd "$repo"
	# shellcheck disable=SC1091
	[[ -f deploy/backup.env ]] && source deploy/backup.env
	local dir="${BACKUP_DIR:-/root/backups/topdown}"
	local keep="${KEEP_DAYS:-14}"
	local remote="${BACKUP_REMOTE:-}"
	local day file
	day="$(date +%F)"
	file="${dir}/${day}.dump"
	mkdir -p "$dir"
	chmod 700 "$dir"

	echo "$(date -u +%FT%TZ) ==> dumping the topdown database to ${file}"
	# GIT_SHA is only needed for compose to parse the file; the dump talks to the running container.
	GIT_SHA="${GIT_SHA:-none}" docker compose -f deploy/docker-compose.yml exec -T postgres \
		pg_dump -U topdown -d topdown -Fc >"${file}.partial"
	if [[ ! -s "${file}.partial" ]]; then
		echo "!! the dump is empty; keeping the previous backups" >&2
		rm -f "${file}.partial"
		exit 1
	fi
	mv "${file}.partial" "$file"
	chmod 600 "$file"
	echo "==> $(du -h "$file" | cut -f1) written"

	# Keep KEEP_DAYS days: files strictly older than that many days are deleted.
	find "$dir" -maxdepth 1 -name '*.dump' -type f -mtime "+$((keep - 1))" -print -delete

	if [[ -z "$remote" ]] || ! command -v rclone >/dev/null 2>&1; then
		echo "!! no off-VPS copy: set BACKUP_REMOTE (rclone remote, decision 7.1 D7: Cloudflare R2) and install rclone" >&2
		exit 2
	fi
	echo "==> copying to ${remote}"
	rclone copyto "$file" "${remote}/${day}.dump"
	# Re-review L-R1 (checked with rclone 1.68.2): `--min-age 14d` keeps the same 14 dumps as `find -mtime +13` locally.
	rclone delete --min-age "${keep}d" --include '*.dump' "$remote"
	echo "$(date -u +%FT%TZ) ==> backup ${day} done"
}

main "$@"
