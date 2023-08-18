import { computeCombatOutcomes, StarState } from "./combatcalc";
import { dist, FleetOrder, ScanningData } from "./galaxy";
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
  const stars = { ...newState.stars };
  const fleets = { ...newState.fleets };
  for (let i = 0; i < tickOffset; ++i) {
    const staroutcomes: { [k: string]: StarState } = {};
    computeCombatOutcomes(newState, staroutcomes, newState.tick + 1);
    newState.tick += 1;
    const players = newState.players;
    for (const sk in stars) {
      const star = stars[sk];
      const newStar = { ...star };
      const starstate = staroutcomes[sk];
      if (starstate !== undefined) {
        if (newStar.v === "1") {
          newStar.st = starstate.st;
        }
        newStar.puid = starstate.puid;
        stars[sk] = newStar;
      }
      if (newStar.v === "1" && star.v === "1") {
        if (newStar.i > 0) {
          const ticksPerDay = newState.production_rate;
          const industry = newStar.i;
          const manufacturing = players[star.puid].tech.manufacturing.level;
          const production = (industry * (manufacturing + 5)) / ticksPerDay;
          newStar.st += production + newStar.c;
          newStar.c = newStar.st - Math.floor(newStar.st);
          newStar.st = Math.floor(newStar.st);
          newStar.totalDefenses += newStar.st - star.st;
          stars[sk] = newStar;
        }
      }
    }
    for (const fk in fleets) {
      const newFleet = { ...fleets[fk] };
      if (fleets[fk].o.length > 0) {
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
          newFleet.ouid = undefined;
        } else {
          const newStar = { ...destination };
    
          newFleet.x = String(destX);
          newFleet.y = String(destY);
          newFleet.o = newFleet.o.slice(1);

          // Update fleet as a result of battle
          let starstate = staroutcomes[destUid];
          if (starstate?.fleetStrength[newFleet.uid] !== undefined) {
            newFleet.st = starstate.fleetStrength[newFleet.uid];
          }
          newFleet.ouid = destUid;
          // Process current action
          switch (action) {
            case FleetOrder.Nothing:
              break;
            case FleetOrder.CollectAll:
            case FleetOrder.Collect:
              const amount = action === FleetOrder.CollectAll ? newStar.st : Math.min(newStar.st, argument);
              newFleet.st += amount;
              newStar.st -= amount;
              break;
            default:
              break;
          }
          
          // Process next order
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
          stars[destUid] = newStar;
        }
        [newFleet.lx, newFleet.ly] = [lx, ly];
        fleets[fk] = newFleet;
      } else if (fleets[fk].orbiting) {
        // apply star combat outcome if any
        let starstate = staroutcomes[fleets[fk].ouid];
        if (starstate?.fleetStrength[newFleet.uid] !== undefined) {
          newFleet.st = starstate.fleetStrength[newFleet.uid];
          fleets[fk] = newFleet;
        }
      }
      if (fleets[fk].st === 0) {
        delete fleets[fk];
      }
    }
  }
  newState.stars = stars;
  newState.fleets = fleets;
  return newState;
}
