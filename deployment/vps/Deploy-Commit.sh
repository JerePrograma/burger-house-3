#!/usr/bin/env bash
set -euo pipefail

revision=${1:-}
[[ $revision =~ ^[a-f0-9]{40}$ ]] || { echo 'A complete Git commit is required.' >&2; exit 1; }
[[ ${2:-} == '--archive-ready' ]] || { echo 'Prepare the Git archive in releases/<commit>/source.tar.gz first.' >&2; exit 1; }
cd /srv/apps/burger-house
[[ $(pwd -P) == /srv/apps/burger-house ]] || { echo 'Unexpected deployment directory.' >&2; exit 1; }
archive="releases/$revision/source.tar.gz"
[[ -f $archive ]] || { echo 'The committed source archive is missing.' >&2; exit 1; }
tar -tzf "$archive" > "releases/$revision/archive-files.txt"
if grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)(data|\.private|\.vps-private|output)(/|$)|(^|/)\.env|(^|/)secrets\.json$)' "releases/$revision/archive-files.txt"; then
  echo 'Private or unsafe paths found in source archive.' >&2
  exit 1
fi
previous=$(sed -n 's/^BUILD_COMMIT=//p' .env)
[[ $previous =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid previous version.' >&2; exit 1; }
secrets_before=$(sha256sum data/secrets.json | cut -d ' ' -f 1)
sudo /usr/local/sbin/scalaris-app-backup
rollback() {
  result=$?
  if [[ $result -ne 0 ]]; then
    echo 'Deployment failed; attempting to recover the previous image.' >&2
    sed -i "s/^BUILD_COMMIT=.*/BUILD_COMMIT=$previous/" .env
    docker compose up -d --no-build app || true
  fi
  exit "$result"
}
trap rollback EXIT
cp "$archive" source.tar.gz
tar -xzf source.tar.gz
cp deployment/vps/compose.yaml compose.yaml
cp deployment/vps/.dockerignore .dockerignore
sha256sum source.tar.gz > source.sha256
sed -i "s/^BUILD_COMMIT=.*/BUILD_COMMIT=$revision/" .env
docker compose build app
docker compose up -d --wait --wait-timeout 90 app
[[ $(sha256sum data/secrets.json | cut -d ' ' -f 1) == "$secrets_before" ]] || { echo 'Authentication configuration changed unexpectedly.' >&2; exit 1; }
trap - EXIT
printf 'DEPLOYMENT_SUCCESS commit=%s credentials=preserved\n' "$revision"
