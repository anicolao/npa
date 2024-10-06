import { BspTree } from "./bsp";
import type { ScanningData, Star } from "./galaxy";

let lastGalaxy: ScanningData | null = null;
let playerMap: { [puid: number]: Star[] } = {};
let bsp: BspTree;

export function getWithinRange(
  puid: number,
  range: number,
  galaxy: ScanningData,
): Star[] {
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
  return inRange;
}
