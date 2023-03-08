export function isSafari(): boolean {
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
    return true;
  }
  return false;
}
