import { ScanningData, SpaceObject, Star } from "./galaxy";

let lastGalaxy: ScanningData | null = null;
let distanceMap: { [star: number]: Star[] } = {};

const distance = function (star1: SpaceObject, star2: SpaceObject) {
  const xoff = +star1.x - +star2.x;
  const yoff = +star1.y - +star2.y;
  return xoff * xoff + yoff * yoff;
};
function rebuildDistanceMap(galaxy: ScanningData) {
  const allStars = Object.keys(galaxy.stars).map((k) => galaxy.stars[k]);
  let sortedStars = [...allStars];
  allStars.forEach((star) => {
    const resorted = [
      ...sortedStars.sort(
        (a: any, b: any) => distance(star, b) - distance(star, a),
      ),
    ].reverse();
    distanceMap[star.uid] = resorted;
  });
}

export function isWithinRange(
  puid: number,
  range: number,
  star: Star,
  galaxy: ScanningData,
): boolean {
  if (galaxy !== lastGalaxy) {
    rebuildDistanceMap(galaxy);
    lastGalaxy = galaxy;
  }
  const rangeSquared = range * range;
  const sortedStars = distanceMap[star.uid];
  for (let i = 0; i < sortedStars.length; ++i) {
    const candidate = sortedStars[i];
    if (candidate.puid === puid) {
      const dist = distance(candidate, star);
      return dist <= rangeSquared;
    }
  }
  return false;
}
