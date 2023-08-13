import { dist, PlayerMap, ScanningData } from "./galaxy";
import { Stanzas } from "./reports";

export const combatInfo: { 
    knownAlliances: number[][] | undefined;
    combatHandicap:  number;
} = {
    knownAlliances: undefined,
    combatHandicap:  0
};

export let handicapString = function (prefix?: string) {
  let p =
    prefix !== undefined ? prefix : combatInfo.combatHandicap > 0 ? "Enemy WS" : "My WS";
  return p + (combatInfo.combatHandicap > 0 ? "+" : "") + combatInfo.combatHandicap;
};
function absoluteTick(galaxy: ScanningData, offset: number) {
  return galaxy.tick + offset;
}
export const alliedFleet = (players: PlayerMap, fleetOwnerId: number, starOwnerId: number) => {
  if (combatInfo.knownAlliances === undefined && NeptunesPride.gameConfig.alliances) {
    // TODO - do we need to call this here? faReport();
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
  puid: number;
  c: number;
  departures: { [k: number]: DepartureRecord };
  weapons: number;
  production: number;
}
export const combatOutcomes = (staroutcomes?: { [k: string]: StarState }) => {
  const galaxy = NeptunesPride.universe.galaxy;
  return computeCombatOutcomes(galaxy, staroutcomes);
}

export const computeCombatOutcomes = (galaxy: ScanningData, staroutcomes?: { [k: string]: StarState }) => {
  const players = galaxy.players;
  let fleets = galaxy.fleets;
  let stars = galaxy.stars;
  let flights: [number, string, Fleet] = [];
  fleetOutcomes = {};
  for (const f in fleets) {
    let fleet = fleets[f];
    if (fleet.o && fleet.o.length > 0) {
      let stop = fleet.o[0][1];
      let ticks = fleet.etaFirst;
      let starname = stars[stop]?.n;
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
          absoluteTick(galaxy, ticks)
        ),
        fleet,
      ]);
    }
  }
  flights = flights.sort(function (a, b) {
    return a[0] - b[0];
  });
  let arrivals: { [k: string]: any } = {};
  let output: Stanzas = [];
  let arrivalTimes = [];
  let starstate: { [k: string]: StarState } =
    staroutcomes === undefined ? {} : staroutcomes;
  for (const i in flights) {
    let fleet = flights[i][2];
    if (fleet.orbiting) {
      let orbit: string = fleet.orbiting.uid;
      if (!starstate[orbit]) {
        const ownerWeapons = players[stars[orbit].puid]?.tech.weapons.level;
        const weapons = Math.max(
          ownerWeapons,
          ...stars[orbit]?.alliedDefenders.map(
            (d: number) => players[d].tech.weapons.level
          )
        );
        starstate[orbit] = {
          last_updated: 0,
          ships: stars[orbit].totalDefenses,
          puid: stars[orbit].puid,
          c: stars[orbit].c || 0,
          departures: {},
          weapons,
          production: stars[orbit].shipsPerTick,
        };
      }
      // This fleet is departing this tick; remove it from the origin star's totalDefenses
      if (fleet.o.length > 0) {
        const tick = fleet.o[0][0] - 1;
        if (tick >= 0) {
          const origShips = starstate[orbit].ships;
          if (starstate[orbit].departures[tick] === undefined) {
            starstate[orbit].departures[tick] = {
              leaving: fleet.st,
              origShips,
            };
          } else {
            const leaving =
              starstate[orbit].departures[tick].leaving + fleet.st;
            starstate[orbit].departures[tick] = { leaving, origShips };
          }
        } else {
          starstate[orbit].ships -= fleet.st;
        }
      }
    }
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
    let arrival = arrivals[k];
    let ka = k.split(",");
    let tick = parseInt(ka[0]);
    let starId = ka[1];
    if (!starstate[starId]) {
      const ownerWeapons = players[stars[starId].puid]?.tech.weapons.level;
      const weapons = Math.max(
        ownerWeapons || 0,
        ...stars[starId]?.alliedDefenders.map(
          (d: number) => players[d].tech.weapons.level
        )
      );
      starstate[starId] = {
        last_updated: 0,
        ships: stars[starId].totalDefenses,
        puid: stars[starId].puid,
        c: stars[starId].c || 0,
        departures: {},
        weapons,
        production: stars[starId].shipsPerTick,
      };
    }
    if (starstate[starId].puid == -1) {
      // assign ownership of the star to the player whose fleet has traveled the least distance
      let minDistance = 10000;
      let owner = -1;
      for (const i in arrival) {
        let fleet = arrival[i];
        let d = dist(stars[starId], fleet);
        if (d < minDistance || owner == -1) {
          owner = fleet.puid;
          minDistance = d;
        }
      }
      starstate[starId].puid = owner;
    }
    for (const i in arrival) {
      let fleet = arrival[i];
      if (alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid)) {
        const weapons = Math.max(
          starstate[starId].weapons,
          players[fleet.puid].tech.weapons.level
        );
        starstate[starId].weapons = weapons;
      }
    }
    stanza.push(
      "[[Tick #{0}]]: [[{1}]] [[{2}]] {3} ships".format(
        absoluteTick(galaxy, tick),
        starstate[starId].puid,
        stars[starId].n,
        starstate[starId].ships
      )
    );
    let tickDelta = tick - starstate[starId].last_updated - 1;
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
        let oldc = starstate[starId].c;
        starstate[starId].ships +=
          starstate[starId].production * tickDelta + oldc;
        starstate[starId].c =
          starstate[starId].ships - Math.trunc(starstate[starId].ships);
        starstate[starId].ships -= starstate[starId].c;
        stanza.push(
          "  {0}+{3} + {2}/h = {1}+{4}".format(
            oldShips,
            starstate[starId].ships,
            starstate[starId].production,
            oldc,
            starstate[starId].c
          )
        );
      }
    }
    for (const i in arrival) {
      let fleet = arrival[i];
      if (
        alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid) ||
        starstate[starId].puid == -1
      ) {
        let oldShips = starstate[starId].ships;
        if (starstate[starId].puid == -1) {
          starstate[starId].ships = fleet.st;
        } else {
          starstate[starId].ships += fleet.st;
        }
        let landingString = "  {0} + {2} on [[{3}]] = {1}".format(
          oldShips,
          starstate[starId].ships,
          fleet.st,
          fleet.n
        );
        stanza.push(landingString);
        landingString = landingString.substring(2);
      }
    }
    for (const i in arrival) {
      let fleet = arrival[i];
      if (alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid)) {
        let outcomeString = "{0} ships on {1}".format(
          Math.floor(starstate[starId].ships),
          stars[starId].n
        );
        fleetOutcomes[fleet.uid] = {
          eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
          outcome: outcomeString,
        };
      }
    }
    let awt = 0;
    let offense = 0;
    let contribution: { [k: string]: any } = {};
    for (const i in arrival) {
      let fleet = arrival[i];
      if (!alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid)) {
        let olda = offense;
        offense += fleet.st;
        stanza.push(
          "  [[{4}]]! {0} + {2} on [[{3}]] = {1}".format(
            olda,
            offense,
            fleet.st,
            fleet.n,
            fleet.puid
          )
        );
        contribution[[fleet.puid, fleet.uid].toString()] = fleet.st;
        let wt = players[fleet.puid].tech.weapons.level;
        if (wt > awt) {
          awt = wt;
        }
      }
    }
    let attackersAggregate = offense;
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
            "    Defenders WS{0} = {1}".format(handicapString(""), dwt)
          );
        } else if (combatInfo.combatHandicap < 0) {
          awt -= combatInfo.combatHandicap;
          stanza.push(
            "    Attackers WS{0} = {1}".format(handicapString(""), awt)
          );
        }
      } else {
        if (combatInfo.combatHandicap > 0) {
          awt += combatInfo.combatHandicap;
          stanza.push(
            "    Attackers WS{0} = {1}".format(handicapString(""), awt)
          );
        } else if (combatInfo.combatHandicap < 0) {
          dwt -= combatInfo.combatHandicap;
          stanza.push(
            "    Defenders WS{0} = {1}".format(handicapString(""), dwt)
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
      let playerContribution: { [k: number]: number } = {};
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
          "  Attackers win with {0} ships remaining".format(offense, -defense)
        );
        stanza.push(
          "  +{1} defenders needed to survive".format(offense, -defense)
        );
        const pairs: [string, number][] = Object.keys(contribution).map((k) => [
          k,
          contribution[k],
        ]);
        pairs.sort((a, b) => b[1] - a[1]);
        let roundOffDebt = 0;
        for (let i = 0; i < pairs.length; ++i) {
          let k = pairs[i][0];
          let ka = k.split(",");
          let fleet = fleets[ka[1]];
          let playerId = parseInt(ka[0]);
          let c = (offense * contribution[k]) / attackersAggregate;
          let intPart = Math.floor(c);
          let roundOff = c - intPart;
          roundOffDebt += roundOff;
          if (roundOffDebt > 0.0) {
            roundOffDebt -= 1.0;
            intPart++;
          }
          contribution[k] = intPart;
          newAggregate += contribution[k];
          if (playerContribution[playerId]) {
            playerContribution[playerId] += contribution[k];
          } else {
            playerContribution[playerId] = contribution[k];
          }
          if (playerContribution[playerId] > biggestPlayer) {
            biggestPlayer = playerContribution[playerId];
            biggestPlayerId = playerId;
          }
          stanza.push(
            "    [[{0}]] has {1} on [[{2}]]".format(
              fleet.puid,
              contribution[k],
              fleet.n
            )
          );
          let outcomeString = "Wins! {0} land\n+{1} to defend".format(
            contribution[k],
            -defense
          );
          fleetOutcomes[fleet.uid] = {
            eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
            outcome: outcomeString,
          };
        }
        if (NeptunesPride.gameVersion === "proteus") {
          if (starstate[starId].puid != biggestPlayerId) {
            starstate[starId].c = 0;
            starstate[starId].production = 0;
          }
        }
        starstate[starId].puid = biggestPlayerId;
        starstate[starId].weapons = players[biggestPlayerId].tech.weapons.level;
        starstate[starId].ships = 0;
        offense = newAggregate;
        for (let k in contribution) {
          let ka = k.split(",");
          const puid = parseInt(ka[0]);
          if (alliedFleet(galaxy.players, biggestPlayerId, puid)) {
            offense -= contribution[k];
            starstate[starId].ships += contribution[k];
            const arrivingWeapons = players[puid].tech.weapons.level;
            const existingWeapons = starstate[starId].weapons;
            starstate[starId].weapons = Math.max(
              arrivingWeapons,
              existingWeapons
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
        for (const i in arrival) {
          let fleet = arrival[i];
          if (alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid)) {
            let outcomeString = "{0} ships on {1}".format(
              Math.floor(starstate[starId].ships),
              stars[starId].n
            );
            fleetOutcomes[fleet.uid] = {
              eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
              outcome: outcomeString,
            };
          }
        }
        for (const k in contribution) {
          let ka = k.split(",");
          let fleet = fleets[ka[1]];
          let outcomeString = "Loses! {0} live\n+{1} to win".format(
            defense,
            -offense
          );
          if (alliedFleet(galaxy.players, fleet.puid, starstate[starId].puid)) {
            outcomeString = "Wins! {0} land.".format(defense);
          }
          fleetOutcomes[fleet.uid] = {
            eta: `[[Tick #${absoluteTick(galaxy, fleet.etaFirst)}]]`,
            outcome: outcomeString,
          };
        }
      }
      attackersAggregate = offense;
    }
    stanza.push(
      "  [[{0}]] [[{1}]] {2} ships".format(
        starstate[starId].puid,
        stars[starId].n,
        starstate[starId].ships
      )
    );
    output.push(stanza);
  }
  return output;
};
