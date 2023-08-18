import { computeCombatOutcomes, StarState } from "./combatcalc";
import { dist, ScanningData } from "./galaxy";
import { logCount } from "./npaserver";
import { clone } from "./patch";

export interface TimeMachineData {
  futureTime: boolean;
}

export function futureTime(
  galaxy: ScanningData,
  tickOffset: number
): ScanningData {
  const newState: ScanningData & TimeMachineData = {
    ...galaxy,
    futureTime: true,
  };
  if (tickOffset <= 0) {
    console.error("Future time machine going backwards NIY");
    logCount("error_back_to_the_future");
    return newState;
  }
  const fleets = { ...newState.fleets };
  for (let i = 0; i < tickOffset; ++i) {
    const staroutcomes: { [k: string]: StarState } = {};
    computeCombatOutcomes(newState, staroutcomes);
    newState.tick += 1;
    const players = newState.players;
    const stars = { ...newState.stars };
    for (const sk in stars) {
      const star = stars[sk];
      if (star.v === "1") {
        if (star.i > 0) {
          const ticksPerDay = newState.production_rate;
          const industry = star.i;
          const manufacturing = players[star.puid].tech.manufacturing.level;
          const production = (industry * (manufacturing + 5)) / ticksPerDay;
          const newStar = { ...star };
          newStar.st += production + newStar.c;
          newStar.c = newStar.st - Math.floor(newStar.st);
          newStar.st = Math.floor(newStar.st);
          newStar.totalDefenses += newStar.st - star.st;
          stars[sk] = newStar;
        }
      }
    }
    newState.stars = stars;
    for (const fk in fleets) {
      if (fleets[fk].o.length > 0) {
        const newFleet = { ...fleets[fk] };
        const [delay, destUid, action, argument] = fleets[fk].o[0];
        const destination = stars[destUid];
        const [destX, destY] = [
          parseFloat(destination.x),
          parseFloat(destination.y),
        ];
        const [lx, ly] = [newFleet.x, newFleet.y];
        if (newFleet.etaFirst > 1) {
          const [x, y] = [parseFloat(newFleet.x), parseFloat(newFleet.y)];
          const [dx, dy] = [destX - x, destY - y];
          const speed = newState.fleet_speed * (newFleet.warpSpeed ? 3 : 1);
          const factor = speed / Math.sqrt(dx * dx + dy * dy);
          const [sx, sy] = [dx * factor, dy * factor];
          newFleet.x = String(x + sx);
          newFleet.y = String(y + sy);
          newFleet.etaFirst -= 1;
          newFleet.eta -= 1;
        } else {
          newFleet.x = String(destX);
          newFleet.y = String(destY);
          newFleet.o = newFleet.o.slice(1);
          /*
              if (destination.puid !== staroutcomes[destUid].puid) {
                const newStar = {...destination, puid: staroutcomes[destUid].puid};
                stars[destUid] = newStar;
              }
              */
          if (newFleet.o.length > 0) {
            const nextDestUid = fleets[fk].o[0][1];
            const nextDestination = stars[nextDestUid];
            newFleet.warpSpeed =
              nextDestination.ga === destination.ga ? nextDestination.ga : 0;
            const speed = newState.fleet_speed * (newFleet.warpSpeed ? 3 : 1);
            newFleet.etaFirst = Math.ceil(
              dist(destination, nextDestination) / speed
            );
          } else {
            newFleet.etaFirst = 0;
          }
          // TODO: put us in orbit
        }
        [newFleet.lx, newFleet.ly] = [lx, ly];
        fleets[fk] = newFleet;
      } else if (fleets[fk].orbiting) {
        // apply star combat outcome if any
        
      }
    }
  }
  newState.fleets = fleets;
  return newState;
}
