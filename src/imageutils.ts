export function safe_image_url(u: string) {
  return /^https:&#x2F;&#x2F;(i\.ibb\.co|i\.imgur\.com)&#x2F;[-#;\.\w]{3,200}$/.test(
    u,
  );
}
