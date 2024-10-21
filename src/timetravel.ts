import { type StarState, computeCombatOutcomes } from "./combatcalc";
import { isNP4, messageCache } from "./events";
import {
  FleetOrder,
  type ScannedStar,
  type ScanningData,
  addAccessors,
  dist,
  getTech,
  techCost,
} from "./galaxy";
import { logCount } from "./npaserver";

export interface TimeMachineData {
  futureTime: boolean;
}

export function resetAliases() {
  const universe = NeptunesPride.universe;
  const players = NeptunesPride.universe.galaxy.players;
  for (let i = 0; i < messageCache.game_event.length; ++i) {
    const payload = messageCache.game_event[i].payload;
    if (universe.galaxy.tick >= payload.tick) {
      if (payload.template.startsWith("goodbye_to_player")) {
        players[payload.uid].exitTick = payload.tick;
        players[payload.uid].modTick =
          (universe.galaxy.tick - payload.tick) % 4;
      }
    }
  }
  const space = "\u00A0";
  const modSymbols = ["\uD83D\uDCA1", "\uD83D\uDC41", "\u23F3", "\u23F3"];
  //const modSymbols = [ "\u2705", "\uef33\u8fb8", "\u2461", "\u2460" ];
  for (const pk in universe.galaxy.players) {
    const player = universe.galaxy.players[pk];
    player.alias = player.rawAlias.split(space)[0];
    player.rawAlias = player.alias;
    if (player.ai === 1) {
      player.alias += `${space}${modSymbols[player.modTick]} `;
    }
  }
}

function isVisible(star: any): star is ScannedStar {
  return star.v === "1" || star.v === 1;
}
export function futureTime(
  galaxy: ScanningData,
  tickOffset: number,
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
  if (isNP4()) {
    addAccessors("galaxy", newState);
  }
  for (let i = 0; i < tickOffset; ++i) {
    const stars = { ...newState.stars };
    const fleets = { ...newState.fleets };
    const players = { ...newState.players };
    const staroutcomes: { [k: string]: StarState } = {};
    computeCombatOutcomes(newState, staroutcomes, newState.tick + 1);
    newState.tick += 1;
    newState.production_counter += 1;
    newState.now += galaxy.tick_rate * 60 * 1000;
    for (const sk in stars) {
      const star = stars[sk];
      const newStar = { ...star };
      const starstate = staroutcomes[sk];
      if (starstate !== undefined) {
        if (isVisible(newStar)) {
          // combat outcomes happen first, then production.
          newStar.st = starstate.st;
        }
        if (players[newStar.puid] !== undefined)
          players[newStar.puid].total_stars -= 1;
        newStar.puid = starstate.puid;
        if (players[newStar.puid] !== undefined)
          players[newStar.puid].total_stars += 1;
        stars[sk] = newStar;
      }
      if (isVisible(newStar) && isVisible(star)) {
        if (newStar.i > 0) {
          const ticksPerDay = newState.production_rate;
          const industry = newStar.i;
          const manufacturing = getTech(
            players[newStar.puid],
            "manufacturing",
          ).level;
          const manuPlus = isNP4() ? 4 : 5;
          const production =
            (industry * (manufacturing + manuPlus)) / ticksPerDay;
          const partial = newStar.yard !== undefined ? newStar.yard : newStar.c;
          newStar.st += production + partial;
          if (isNP4()) {
            newStar.yard = newStar.st - Math.floor(newStar.st);
          } else {
            newStar.c = newStar.st - Math.floor(newStar.st);
          }
          newStar.st = Math.floor(newStar.st);
          newStar.totalDefenses += newStar.st - star.st;
          stars[sk] = newStar;
        }
      }
    }
    for (const fk in fleets) {
      const newFleet = { ...fleets[fk], l: fleets[fk].loop };
      if (fleets[fk].o.length > 0 && stars[fleets[fk].o[0][1]] !== undefined) {
        const [delay, destUid, action, argument] = fleets[fk].o[0];
        const destination = stars[destUid];
        if (newFleet?.orbiting) {
          if (isVisible(newFleet.orbiting) && isVisible(destination)) {
            newFleet.warpSpeed =
              newFleet.orbiting.ga === destination.ga ? destination.ga : 0;
          }
          newFleet.w = newFleet.warpSpeed;
          if (newFleet.uid === NeptunesPride.universe.selectedFleet?.uid) {
            console.log(
              `Fleet ${newFleet.n} @ warp ${newFleet.w} ETA ${newFleet.etaFirst} to ${destUid}`,
            );
          }
        }
        const [destX, destY] = [
          Number.parseFloat(destination.x),
          Number.parseFloat(destination.y),
        ];
        const [lx, ly] = [newFleet.x, newFleet.y];
        if (newFleet.etaFirst > 1) {
          if (delay > 0) {
            newFleet.o = [...newFleet.o];
            newFleet.o[0] = [delay - 1, destUid, action, argument];
          } else {
            const [x, y] = [
              Number.parseFloat(newFleet.x),
              Number.parseFloat(newFleet.y),
            ];
            const [dx, dy] = [destX - x, destY - y];
            if (newFleet.uid === NeptunesPride.universe.selectedFleet?.uid) {
              console.log(
                `Fleet ${newFleet.n} flying @ warp ${newFleet.w} ETA ${newFleet.etaFirst} to ${destination.n} @ ${dx},${dy} ${newState.fleet_speed}`,
              );
            }
            let speed = newState.fleet_speed * (newFleet.warpSpeed ? 3 : 1);
            if (isNP4()) {
              if (
                newFleet.speed &&
                !Number.isNaN(newFleet.speed) &&
                (newFleet.speed > 0.042 || !newFleet.ouid)
              ) {
                speed = newFleet.speed;
              } else {
                speed = calcSpeedBetweenStars(
                  newFleet.ouid,
                  newFleet.o[0][1],
                  newFleet.puid,
                );
              }
            }
            const factor = speed / Math.sqrt(dx * dx + dy * dy);
            const [sx, sy] = [dx * factor, dy * factor];
            newFleet.x = String(x + sx);
            newFleet.y = String(y + sy);
            newFleet.ouid = isNP4() ? 0 : undefined;
            newFleet.speed = speed;
          }
          newFleet.etaFirst -= 1;
          newFleet.eta -= 1;
        } else {
          const newStar = { ...destination };

          newFleet.x = String(destX);
          newFleet.y = String(destY);
          const firstOrder = newFleet.o[0];
          newFleet.o = newFleet.o.slice(1);
          if (newFleet.l === 1) {
            newFleet.o.push(firstOrder);
          }

          // Update fleet as a result of battle
          const starstate = staroutcomes[destUid];
          if (starstate?.fleetStrength[newFleet.uid] !== undefined) {
            newFleet.st = starstate.fleetStrength[newFleet.uid];
          }
          newFleet.ouid = destUid;
          // Process current action if this player owns the star and fleet is
          // not dead.
          if (
            newFleet.puid === newStar.puid &&
            newFleet.st > 0 &&
            isVisible(newStar)
          ) {
            // Number of ships transfered from carrier to star.
            let transferred = 0;
            switch (action) {
              case FleetOrder.Nothing:
                break;
              case FleetOrder.CollectAll:
                transferred = -newStar.st;
                break;
              case FleetOrder.Collect:
                transferred = -argument;
                break;
              case FleetOrder.CollectAllBut:
                transferred = Math.min(0, -newStar.st + argument);
                break;
              case FleetOrder.DropAll:
                transferred = newFleet.st;
                break;
              case FleetOrder.Drop:
                transferred = argument;
                break;
              case FleetOrder.DropAllBut:
                transferred = Math.max(0, newFleet.st - argument);
                break;
              case FleetOrder.Garrison:
                transferred = -newStar.st + argument;
                break;
            }
            transferred = Math.max(-newStar.st, transferred);
            transferred = Math.min(newFleet.st - 1, transferred);
            newFleet.st -= transferred;
            newStar.st += transferred;
          }

          // Process next order
          if (newFleet.o.length > 0) {
            const nextDestUid = newFleet.o[0][1];
            const nextDestination = stars[nextDestUid];
            if (isVisible(nextDestination) && isVisible(destination)) {
              newFleet.warpSpeed =
                nextDestination.ga === destination.ga ? nextDestination.ga : 0;
            }
            newFleet.w = newFleet.warpSpeed;
            let speed = newState.fleet_speed * (newFleet.warpSpeed ? 3 : 1);
            if (isNP4()) {
              /*
              console.log({
                nextDestUid,
                nextDestination,
                dest: destination.uid,
                f: fleets[fk],
                newFleet,
              });
              */
              speed = calcSpeedBetweenStars(
                destination.uid,
                nextDestination.uid,
                newFleet.puid,
              );
              newFleet.speed = speed;
            }
            newFleet.etaFirst =
              delay + Math.ceil(dist(destination, nextDestination) / speed);
            if (newFleet.uid === NeptunesPride.universe.selectedFleet?.uid) {
              console.log(
                `Fleet ${newFleet.n} @ warp ${newFleet.w} ETA ${newFleet.etaFirst} to ${nextDestination.n}`,
              );
            }
          } else {
            newFleet.etaFirst = 0;
          }
          stars[destUid] = newStar;
        }
        [newFleet.lx, newFleet.ly] = [lx, ly];
        fleets[fk] = newFleet;
      } else if (fleets[fk].orbiting) {
        // apply star combat outcome if any
        const starstate = staroutcomes[fleets[fk].ouid];
        if (starstate?.fleetStrength[newFleet.uid] !== undefined) {
          newFleet.st = starstate.fleetStrength[newFleet.uid];
          fleets[fk] = newFleet;
        }
      }
      if (fleets[fk].st === 0) {
        if (fleets[fk].orbiting) {
          const star: ScannedStar = stars[
            fleets[fk].orbiting.uid
          ] as ScannedStar;
          star.fleetsInOrbit = star.fleetsInOrbit.filter((x) => x.uid !== +fk);
        }
        delete fleets[fk];
      }
    }
    for (const pind in players) {
      if (players[pind].researching !== undefined) {
        players[pind] = { ...players[pind] };
        const player = players[pind];
        player.tech = { ...player.tech };
        addAccessors(player.alias, player);
        player.tech[player.researching] = {
          ...player.tech[player.researching],
        };
        const tech = player.tech[player.researching];
        tech.research += player.total_science;
        const cost = techCost({
          ...tech,
          brr: tech.brr,
          level: tech.level + (isNP4() ? 0 : 1),
        });
        if (tech.research >= cost) {
          tech.research -= cost;
          tech.level += 1;
          player.researching = player.researching_next;
        }
      }
    }
    if (newState.production_counter >= newState.production_rate) {
      for (const pind in players) {
        if (players[pind].cash !== undefined) {
          players[pind] = { ...players[pind] };
          const player = players[pind];
          if (!player.cashPerDay) {
            player.cash +=
              player.total_economy * 10 + 75 * getTech(player, "banking").level;
          } else {
            player.cash += player.cashPerDay;
          }
        }
      }
      newState.production_counter = 0;
    }
    newState.stars = stars;
    newState.fleets = fleets;
    newState.players = players;
  }
  return newState;
}

export function calcSpeedBetweenStars(
  starA: number,
  starB: number,
  puid: number,
) {
  const universe = NeptunesPride.universe;
  const players = universe.galaxy.players;
  const rangeTechLevel = getTech(players[puid], "propulsion").level;
  const a = universe.galaxy.stars[starA];
  const b = universe.galaxy.stars[starB];
  const whDist = universe.starDistance(a, b);
  const normalSpeed = universe.galaxy.fleetSpeed;
  let wormholeSpeed = 0;
  let gateSpeed = 0;
  if (universe.starsWormholed(a, b)) {
    wormholeSpeed = whDist / 24;
  }
  if (universe.starsGated(a, b)) {
    if (universe.galaxy.config.newRng === 1) {
      gateSpeed = normalSpeed * Math.sqrt(rangeTechLevel + 3);
    } else {
      gateSpeed = normalSpeed * 3;
    }
  }

  /*
  console.log("CALC: ", {
    normalSpeed,
    wormholeSpeed,
    gateSpeed,
    dist: whDist,
    starA,
    starB,
  });
  */
  return Math.max(normalSpeed, wormholeSpeed, gateSpeed);
}
