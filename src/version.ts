export const version_info = {
  hash: process.env.VITE_NPA_COMMIT_HASH ?? "unknown",
  date: process.env.VITE_NPA_VERSION_DATE ?? "",
  status: process.env.VITE_NPA_GIT_STATUS ?? "",
  version: process.env.VITE_NPA_VERSION ?? "0.0.0",
  display: process.env.VITE_NPA_VERSION_STRING ?? "",
};

export function getVersion() {
  if (version_info.display.length > 0) return version_info.display;

  const caution = version_info.status.length > 0 ? "⚠" : "";
  const date = version_info.status.length > 0 ? `${version_info.date} ` : "";
  return `Neptune's Pride Agent v${version_info.version} (${date}${caution}${version_info.hash})`;
}
