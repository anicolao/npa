export function safe_image_url(u: string) {
  return /^https:&#x2F;&#x2F;(i\.ibb\.co|i\.imgur\.com)&#x2F;[-#;\.\w&]{3,200}$/.test(
    u,
  );
}

export function youtube(u: string) {
  return /^https:&#x2F;&#x2F;www\.youtube\.com&#x2F;watch\?v=[-\w]{6,50}$/.test(
    u,
  );
}
