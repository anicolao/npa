import { BspTree } from "./bsp";
import type { ScanningData, Star } from "./galaxy";

let lastGalaxy: ScanningData | null = null;
let playerMap: { [puid: number]: Star[] } = {};
let bsp: BspTree;

export function isWithinRange(
  puid: number,
  range: number,
  star: Star,
  galaxy: ScanningData,
): boolean {
  if (galaxy !== lastGalaxy || bsp === undefined) {
    lastGalaxy = galaxy;
    bsp = new BspTree(galaxy.stars);
    playerMap = {};
    for (const sk in galaxy.stars) {
      if (playerMap[galaxy.stars[sk].puid] === undefined) {
        playerMap[galaxy.stars[sk].puid] = [];
      }
      playerMap[galaxy.stars[sk].puid].push(galaxy.stars[sk]);
    }
  }
  const inRange = bsp.findMany(playerMap[puid], range);
  for (const candidate of inRange) {
    if (candidate.uid == star.uid) {
      return true;
    }
  }
  return false;
}
