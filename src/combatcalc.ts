import { alliancesEnabled, computeAlliances } from "./alliances";
import { isNP4, messageCache } from "./events";
import {
  type Fleet,
  type FleetOrder,
  type Player,
  type PlayerMap,
  type ScannedStar,
  type ScanningData,
  dist,
  getTech,
} from "./galaxy";
import { allSeenKeys } from "./intel";
import type { Stanzas } from "./reports";

export const combatInfo: {
  knownAlliances: number[][] | undefined;
  combatHandicap: number;
} = {
  knownAlliances: undefined,
  combatHandicap: 0,
};

export const handicapString = (prefix?: string) => {
  const p =
    prefix !== undefined
      ? prefix
      : combatInfo.combatHandicap > 0
        ? "Enemy WS"
        : "My WS";
  return (
    p + (combatInfo.combatHandicap > 0 ? "+" : "") + combatInfo.combatHandicap
  );
};
function absoluteTick(galaxy: ScanningData, offset: number) {
  return galaxy.tick + offset;
}
export function tickNumber(ticks: number) {
  return NeptunesPride.universe.galaxy.tick + ticks;
}

export interface WarRecord {
  tick: number;
  p0: number;
  p1: number;
  war: "peace" | "peace_agreement" | "war_declared" | "war";
}
export const annalsOfWar = (): WarRecord[] => {
  const warTicks: WarRecord[] = [];
  for (let i = 0; i < messageCache.game_event.length; ++i) {
    const m = messageCache.game_event[i];
    if (m.payload.template === "war_declared") {
      let tick = m.payload.tick;
      const p0 = m.payload.attacker;
      const p1 = m.payload.defender;
      warTicks.push({ tick, p0, p1, war: "war_declared" });
      let warning = 24;
      if (isNP4()) {
        const config = NeptunesPride.universe.galaxy.config;
        warning = 1;
        if (config.alliances === 2) {
          warning = 24;
        }
        if (config.alliances === 3) {
          warning = 48;
        }
      }

      tick += warning;
      warTicks.push({ tick, p0, p1, war: "war" });
    } else if (m.payload.template === "peace_accepted") {
      const tick = m.payload.tick;
      const p0 = m.payload.from_puid;
      const p1 = m.payload.to_puid;
      warTicks.push({ tick, p0, p1, war: "peace_agreement" });
    }
  }
  return warTicks;
};
export const alliedFleet = (
  players: PlayerMap,
  fleetOwnerId: number,
  starOwnerId: number,
  relativeTick: number,
) => {
  if (combatInfo.knownAlliances === undefined && alliancesEnabled()) {
    computeAlliances(allSeenKeys);
  }
  if (alliancesEnabled()) {
    if (relativeTick > 0) {
      const annals = annalsOfWar().sort((a, b) => b.tick - a.tick);
      const currentTick = tickNumber(0);
      const tick = tickNumber(relativeTick);
      //if (fleetOwnerId == 5 || starOwnerId == 5) {
      //console.log({annals, relativeTick, tick: tickNumber(relativeTick), fleetOwnerId, starOwnerId});
      //}
      for (let a = 0; a < annals.length; ++a) {
        const annal = annals[a];
        if (annal.tick <= currentTick) {
          //console.log(`Stop checking @ ${annal.tick} v ${currentTick}`)
          break;
        }
        if (annal.tick >= tick) {
          //console.log(`Skip future tick ${annal.tick}; annal applies at end of tick`)
          continue;
        }
        //console.log("Check: ", JSON.stringify(annal))
        if (
          annal.p1 == fleetOwnerId &&
          annal.p0 == starOwnerId &&
          annal.war === "war"
        ) {
          //console.log(`At war ${fleetOwnerId} v ${starOwnerId}`)
          return false;
        }
        if (
          annal.p0 == fleetOwnerId &&
          annal.p1 == starOwnerId &&
          annal.war === "war"
        ) {
          //console.log(`At war ${fleetOwnerId} v ${starOwnerId}`)
          return false;
        }
      }
    }
  }
  const fOwner = players[fleetOwnerId];
  const sOwner = players[starOwnerId];
  const warMap = fOwner?.war || sOwner?.war || {};
  if (fleetOwnerId == starOwnerId) return true;
  if (warMap[fleetOwnerId] && warMap[starOwnerId]) return false;
  return (
    warMap[fleetOwnerId] == 0 ||
    warMap[starOwnerId] == 0 ||
    combatInfo.knownAlliances?.[fleetOwnerId]?.[starOwnerId]
  );
};
export let fleetOutcomes: { [k: number]: any } = {};
export interface DepartureRecord {
  leaving: number;
  origShips: number;
}
export interface StarState {
  last_updated: number;
  ships: number;
  st: number;
  puid: number;
  c: number;
  departures: { [k: number]: DepartureRecord };
  weapons: number;
  production: number;
  fleetStrength: { [k: string]: number };
}
export const combatOutcomes = (staroutcomes?: { [k: string]: StarState }) => {
  const galaxy = NeptunesPride.universe.galaxy;
  return computeCombatOutcomes(galaxy, staroutcomes);
};

export function getWeaponsLevel(player: Player) {
  return getTech(player, "weapons").level;
}
export const computeCombatOutcomes = (
  galaxy: ScanningData,
  staroutcomes?: { [k: string]: StarState },
  maxTick?: number,
) => {
  const players = galaxy.players;
  const fleets = galaxy.fleets;
  const stars = galaxy.stars;
  let flights: [number, string, Fleet][] = [];
  fleetOutcomes = {};
  for (const f in fleets) {
    const fleet = fleets[f];
    let orders = fleet.o;
    const lo: [number, number, FleetOrder, number][] | undefined = (
      fleet as any
    ).orders;
    if (fleet !== NeptunesPride.universe.selectedFleet || lo?.length) {
      orders = lo;
    }
    if (orders && orders.length > 0) {
      const stop = fleet.o[0][1];
      const ticks = fleet.etaFirst;
      if (maxTick !== undefined && galaxy.tick + ticks > maxTick) continue;
      const starname = stars[stop]?.n;
      if (!starname) {
        continue;
      }
      flights.push([
        ticks,
        "[[{0}]] [[{1}]] {2} → [[{3}]] [[Tick #{4}]]".format(
          fleet.puid,
          fleet.n,
          fleet.st,
          starname,
          absoluteTick(galaxy, ticks),
        ),
        fleet,
      ]);
    }
  }
  flights = flights.sort((a, b) => a[0] - b[0]);
  const arrivals: { [k: string]: any } = {};
  const output: Stanzas = [];
  const arrivalTimes = [];
  const starstate: { [k: string]: StarState } =
    staroutcomes === undefined ? {} : staroutcomes;
  for (const i in flights) {
    const fleet = flights[i][2];

    if (
      arrivalTimes.length === 0 ||
      arrivalTimes[arrivalTimes.length - 1] !== flights[i][0]
    ) {
      arrivalTimes.push(flights[i][0]);
    }
    const arrivalKey = [flights[i][0], fleet.o[0][1]].toString();
    if (arrivals[arrivalKey] !== undefined) {
      arrivals[arrivalKey].push(fleet);
    } else {
      arrivals[arrivalKey] = [fleet];
    }
  }
  for (const k in arrivals) {
    const stanza = [];
    const arrival = arrivals[k];
    const ka = k.split(",");
    const tick = Number.parseInt(ka[0]);
    const starId = ka[1];
    if (!starstate[starId]) {
      const owner = players[stars[starId].puid];
      const ownerWeapons = owner ? getWeaponsLevel(owner) : 0;
      const vstar = stars[starId] as ScannedStar;
      let weapons = ownerWeapons || 0;
      if (stars[starId].v === "1") {
        weapons = Math.max(
          weapons,
          ...vstar.alliedDefenders.map((d: number) =>
            getWeaponsLevel(players[d]),
          ),
        );
      }
      let totalDefense = vstar.st;
      const fleetStrength: { [k: string]: number } = {};
      const departures: { [k: number]: DepartureRecord } = {};
      let origShips = vstar.st;
      for (const fleet of vstar.fleetsInOrbit) {
        origShips += fleet.st;
        if (fleets[fleet.uid] === undefined) {
          console.error(`${fleet.uid} orbiting ${vstar.n} doesn't exist.`);
        }
      }
      for (const fleet of vstar.fleetsInOrbit) {
        if (fleet.o.length > 0) {
          const delay = fleet.o[0][0];
          if (delay >= tick) {
            fleetStrength[fleet.uid] = fleet.st;
            totalDefense += fleet.st;
            if (departures[delay - 1] === undefined) {
              departures[delay - 1] = {
                leaving: fleet.st,
                origShips,
              };
            } else {
              const leaving = departures[delay - 1].leaving + fleet.st;
              departures[delay - 1] = { leaving, origShips };
            }
          }
        } else {
          fleetStrength[fleet.uid] = fleet.st;
          totalDefense += fleet.st;
        }
      }
      starstate[starId] = {
        last_updated: 0,
        ships: totalDefense,
        st: vstar.st,
        puid: vstar.puid,
        c: vstar.c || vstar.yard || 0,
        departures,
        weapons,
        production: vstar.shipsPerTick,
        fleetStrength,
      };
    }
    if (starstate[starId].puid == -1) {
      // assign ownership of the star to the player whose fleet has traveled the least distance
      let minDistance = 10000;
      let owner = -1;
      for (const i in arrival) {
        const fleet = arrival[i];
        const d = dist(stars[starId], fleet);
        if (d < minDistance || owner == -1) {
          owner = fleet.puid;
          minDistance = d;
        }
      }
      starstate[starId].puid = owner;
    }
    for (const i in arrival) {
      const fleet = arrival[i];
      if (alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid, 0)) {
        const weapons = Math.max(
          starstate[starId].weapons,
          getWeaponsLevel(players[fleet.puid]),
        );
        starstate[starId].weapons = weapons;
      }
    }
    stanza.push(
      "[[Tick #{0}]]: [[{1}]] [[{2}]] {3} ships".format(
        absoluteTick(galaxy, tick),
        starstate[starId].puid,
        stars[starId].n,
        starstate[starId].ships,
      ),
    );
    const tickDelta = tick - starstate[starId].last_updated - 1;
    if (tickDelta > 0) {
      let oldShips = starstate[starId].ships;
      const start = starstate[starId].last_updated;
      const departures = starstate[starId].departures;
      for (let i = start; i < start + tickDelta; ++i) {
        if (departures[i]) {
          const ratio = oldShips / departures[i].origShips;
          const departing = Math.ceil(departures[i].leaving * ratio);
          starstate[starId].ships -= departing;
          stanza.push("  {0} depart".format(departing));
        }
      }
      if (starstate[starId].ships < oldShips) {
        oldShips = starstate[starId].ships;
      }
      starstate[starId].last_updated = tick - 1;
      if (starstate[starId].production) {
        const oldc = starstate[starId].c;
        starstate[starId].ships +=
          starstate[starId].production * tickDelta + oldc;
        starstate[starId].st += Math.trunc(
          starstate[starId].production * tickDelta + oldc,
        );
        starstate[starId].c =
          starstate[starId].ships - Math.trunc(starstate[starId].ships);
        starstate[starId].ships -= starstate[starId].c;
        stanza.push(
          "  {0}+{3} + {2}/h = {1}+{4}".format(
            oldShips,
            starstate[starId].ships,
            starstate[starId].production,
            oldc,
            starstate[starId].c,
          ),
        );
      }
    }
    for (const i in arrival) {
      const fleet = arrival[i];
      if (
        alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid, 0) ||
        starstate[starId].puid == -1
      ) {
        const oldShips = starstate[starId].ships;
        if (starstate[starId].puid == -1) {
          starstate[starId].ships = fleet.st;
        } else {
          starstate[starId].ships += fleet.st;
        }
        starstate[starId].fleetStrength[fleet.uid] = fleet.st;
        if (fleets[fleet.uid] === undefined) {
          console.error(`${fleet.uid} on ${stars[starId].n} doesn't exist.`);
        }
        let landingString = "  {0} + {2} on [[{3}]] = {1}".format(
          oldShips,
          starstate[starId].ships,
          fleet.st,
          fleet.n,
        );
        stanza.push(landingString);
        landingString = landingString.substring(2);
      }
    }
    for (const i in arrival) {
      const fleet = arrival[i];
      if (alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid, 0)) {
        const outcomeString = "{0} ships on {1}".format(
          Math.floor(starstate[starId].ships),
          stars[starId].n,
        );
        fleetOutcomes[fleet.uid] = {
          eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
          outcome: outcomeString,
          strength: fleet.st,
        };
      }
    }
    let awt = 0;
    let offense = 0;
    for (const i in arrival) {
      const fleet = arrival[i];
      if (!alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid, 0)) {
        const olda = offense;
        offense += fleet.st;
        stanza.push(
          "  [[{4}]]! {0} + {2} on [[{3}]] = {1}".format(
            olda,
            offense,
            fleet.st,
            fleet.n,
            fleet.puid,
          ),
        );
        starstate[starId].fleetStrength[fleet.uid] = fleet.st;
        if (fleets[fleet.uid] === undefined) {
          console.error(`${fleet.uid} on ${stars[starId].n} doesn't exist.`);
        }
        const wt = getWeaponsLevel(players[fleet.puid]);
        if (wt > awt) {
          awt = wt;
        }
      }
    }
    let attackersAggregate = offense;
    const defendersAggregate = starstate[starId].ships;
    while (offense > 0) {
      let dwt = starstate[starId].weapons;
      let defense = starstate[starId].ships;
      stanza.push("  Combat! [[{0}]] defending".format(starstate[starId].puid));
      stanza.push("    Defenders {0} ships, WS {1}".format(defense, dwt));
      stanza.push("    Attackers {0} ships, WS {1}".format(offense, awt));
      if (NeptunesPride.gameVersion !== "proteus") {
        dwt += 1;
      }
      if (starstate[starId].puid !== galaxy.player_uid) {
        if (combatInfo.combatHandicap > 0) {
          dwt += combatInfo.combatHandicap;
          stanza.push(
            "    Defenders WS{0} = {1}".format(handicapString(""), dwt),
          );
        } else if (combatInfo.combatHandicap < 0) {
          awt -= combatInfo.combatHandicap;
          stanza.push(
            "    Attackers WS{0} = {1}".format(handicapString(""), awt),
          );
        }
      } else {
        if (combatInfo.combatHandicap > 0) {
          awt += combatInfo.combatHandicap;
          stanza.push(
            "    Attackers WS{0} = {1}".format(handicapString(""), awt),
          );
        } else if (combatInfo.combatHandicap < 0) {
          dwt -= combatInfo.combatHandicap;
          stanza.push(
            "    Defenders WS{0} = {1}".format(handicapString(""), dwt),
          );
        }
      }

      if (galaxy.player_uid === starstate[starId].puid) {
        // truncate defense if we're defending to give the most
        // conservative estimate
        defense = Math.trunc(defense);
      }
      while (defense > 0 && offense > 0) {
        offense -= dwt;
        if (offense <= 0) break;
        defense -= awt;
      }

      let newAggregate = 0;
      const playerContribution: { [k: number]: number } = {};
      let biggestPlayer = -1;
      let biggestPlayerId = starstate[starId].puid;
      if (offense > 0) {
        let defeatedOffense = offense;
        defense += awt - 1;
        do {
          defense -= awt;
          defeatedOffense -= dwt;
        } while (defeatedOffense > 0);
        stanza.push(
          "  Attackers win with {0} ships remaining".format(offense, -defense),
        );
        stanza.push(
          "  +{1} defenders needed to survive".format(offense, -defense),
        );
        const pairs: [string, number][] = Object.keys(
          starstate[starId].fleetStrength,
        ).map((k) => [k, starstate[starId].fleetStrength[k]]);
        pairs.sort((a, b) => b[1] - a[1]);
        let roundOffDebt = 0;
        for (let i = 0; i < pairs.length; ++i) {
          const k = pairs[i][0];
          const fleet = fleets[k];
          if (fleet === undefined) {
            console.error(
              `Failed to find fleet ${k} near star ${stars[starId].n}`,
            );
            continue;
          }
          if (
            alliedFleet(
              galaxy.players,
              fleet.puid,
              starstate[starId].puid,
              tick,
            )
          ) {
            starstate[starId].fleetStrength[fleet.uid] = 0;
          } else {
            const playerId = fleet.puid;
            const c =
              (offense * starstate[starId].fleetStrength[k]) /
              attackersAggregate;
            let intPart = Math.floor(c);
            const roundOff = c - intPart;
            roundOffDebt += roundOff;
            if (roundOffDebt > 0.0) {
              roundOffDebt -= 1.0;
              intPart++;
            }
            starstate[starId].fleetStrength[k] = intPart;
            newAggregate += starstate[starId].fleetStrength[k];
            if (playerContribution[playerId]) {
              playerContribution[playerId] +=
                starstate[starId].fleetStrength[k];
            } else {
              playerContribution[playerId] = starstate[starId].fleetStrength[k];
            }
            if (playerContribution[playerId] > biggestPlayer) {
              biggestPlayer = playerContribution[playerId];
              biggestPlayerId = playerId;
            }
            stanza.push(
              "    [[{0}]] has {1} on [[{2}]]".format(
                fleet.puid,
                starstate[starId].fleetStrength[k],
                fleet.n,
              ),
            );
            if (starstate[starId].fleetStrength[k]) {
              let prefix = "";
              if (fleetOutcomes[fleet.uid]?.outcome) {
                prefix = `${fleetOutcomes[fleet.uid].outcome}\n`;
              }
              const outcomeString =
                `${prefix}Wins! {0} land\n+{1} to defend`.format(
                  starstate[starId].fleetStrength[k],
                  -defense,
                );
              fleetOutcomes[fleet.uid] = {
                eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
                outcome: outcomeString,
                strength: starstate[starId].fleetStrength[k],
              };
            }
          }
        }
        if (NeptunesPride.gameVersion === "proteus") {
          if (starstate[starId].puid != biggestPlayerId) {
            starstate[starId].c = 0;
            starstate[starId].production = 0;
          }
        }
        starstate[starId].puid = biggestPlayerId;
        starstate[starId].weapons = getWeaponsLevel(players[biggestPlayerId]);
        starstate[starId].ships = 0;
        starstate[starId].st = 0;
        offense = newAggregate;
        for (const k in starstate[starId].fleetStrength) {
          const fleet = fleets[k];
          if (fleet === undefined) {
            console.error(`failed to find fleet ${k} near ${stars[starId].n}`);
            continue;
          }
          const puid = fleet.puid;
          if (alliedFleet(galaxy.players, biggestPlayerId, puid, tick)) {
            offense -= starstate[starId].fleetStrength[k];
            starstate[starId].ships += starstate[starId].fleetStrength[k];
            const arrivingWeapons = getWeaponsLevel(players[puid]);
            const existingWeapons = starstate[starId].weapons;
            starstate[starId].weapons = Math.max(
              arrivingWeapons,
              existingWeapons,
            );
          }
        }
      } else {
        let defeatedDefense = defense;
        offense += dwt - 1;
        do {
          offense -= dwt;
          defeatedDefense -= awt;
        } while (defeatedDefense > 0);
        stanza.push("  +{0} more attackers needed".format(-offense));
        starstate[starId].ships = defense;
        const pairs: [string, number][] = Object.keys(
          starstate[starId].fleetStrength,
        ).map((k) => [k, starstate[starId].fleetStrength[k]]);
        pairs.push(["star", starstate[starId].st]);
        pairs.sort((a, b) => b[1] - a[1]);
        let roundOffDebt = 0;
        for (let i = 0; i < pairs.length; ++i) {
          const k = pairs[i][0];
          const fleetOrStar = k !== "star" ? fleets[k] : galaxy.stars[starId];
          if (fleetOrStar === undefined) {
            console.error(`failed to find fleet or star ${k}`);
            continue;
          }
          if (
            !alliedFleet(
              galaxy.players,
              fleetOrStar.puid,
              starstate[starId].puid,
              tick,
            )
          ) {
            if (fleets[fleetOrStar.uid] !== undefined) {
              starstate[starId].fleetStrength[fleetOrStar.uid] = 0;
            }
          } else {
            const st =
              k === "star"
                ? starstate[starId].st
                : starstate[starId].fleetStrength[k];
            const c = (defense * st) / defendersAggregate;
            let intPart = Math.floor(c);
            const roundOff = c - intPart;
            roundOffDebt += roundOff;
            if (roundOffDebt > 0.0) {
              roundOffDebt -= 1.0;
              intPart++;
            }
            if (k === "star") {
              starstate[starId].st = intPart;
            } else {
              starstate[starId].fleetStrength[k] = intPart;
            }
            stanza.push(
              "    [[{0}]] has {1} on [[{2}]]".format(
                fleetOrStar.puid,
                intPart,
                fleetOrStar.n,
              ),
            );
          }
        }
        for (const i in arrival) {
          const fleet = arrival[i];
          if (
            alliedFleet(
              galaxy.players,
              fleet.puid,
              starstate[starId].puid,
              tick,
            )
          ) {
            const outcomeString = "{0} ships on {1}".format(
              Math.floor(starstate[starId].ships),
              stars[starId].n,
            );
            fleetOutcomes[fleet.uid] = {
              eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
              outcome: outcomeString,
              strength: 0,
            };
          }
        }
        for (const k in starstate[starId].fleetStrength) {
          const fleet = fleets[k];
          if (fleet === undefined) {
            console.error(
              `failed to find fleet ${k} near star ${stars[starId].n}`,
            );
            continue;
          }
          let prefix = "";
          if (fleetOutcomes[fleet.uid]?.outcome) {
            prefix = `${fleetOutcomes[fleet.uid].outcome}\n`;
          }
          let outcomeString = `${prefix}Loses! {0} live\n+{1} to win`.format(
            defense,
            -offense,
          );
          if (
            alliedFleet(
              galaxy.players,
              fleet?.puid,
              starstate[starId]?.puid,
              tick,
            )
          ) {
            outcomeString = `${prefix}Wins! ${defense} remain`;
          }
          if (prefix.indexOf("Loses") === -1) {
            fleetOutcomes[fleet.uid] = {
              eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
              outcome: outcomeString,
              strength: 0,
            };
          }
        }
      }
      attackersAggregate = offense;
    }
    stanza.push(
      "  [[{0}]] [[{1}]] {2} ships".format(
        starstate[starId].puid,
        stars[starId].n,
        starstate[starId].ships,
      ),
    );
    output.push(stanza);
  }
  return output;
};
