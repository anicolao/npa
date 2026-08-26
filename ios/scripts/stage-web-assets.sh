#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/../.." && pwd)"
source_directory="${repository_root}/dist"
destination_directory="${repository_root}/ios/NPAiOS/Resources/Dist"

cd "${repository_root}"

# Key the embedded bundle to the latest commit that changed a production web
# input. This keeps iOS staging stable across iOS-only and documentation-only
# commits while retaining a real Git commit as the displayed source revision.
source_commit="$({
  git log -1 --format=%H -- \
    src static package.json bun.lock tsconfig.json \
    esbuild.baseconfig.ts esbuild.npa.ts bin/version.ts
})"
source_revision="${source_commit:0:12}"
source_date="$(git show -s --format='%ad' --date='format:%d %b %Y %H:%M %z' "${source_commit}")"

VITE_NPA_COMMIT_HASH="${source_revision}" \
VITE_NPA_VERSION_DATE="${source_date}" \
VITE_NPA_GIT_STATUS="" \
  bun run build

for required_asset in intel.js intel.css; do
  [[ -s "${source_directory}/${required_asset}" ]] || {
    printf 'Missing required production asset: %s\n' "${source_directory}/${required_asset}" >&2
    exit 1
  }
done

mkdir -p "${destination_directory}"
rsync --archive --delete "${source_directory}/" "${destination_directory}/"

diff --recursive --brief "${source_directory}" "${destination_directory}"
printf 'Staged production web assets in %s\n' "${destination_directory}"
