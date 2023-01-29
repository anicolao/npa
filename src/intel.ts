// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @version     1.18
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==

/* global Crux, NeptunesPride, jQuery, */
import { getVersion } from "./version.js";
import { safe_image_url } from "./imageutils";
import {
  setClip,
  defineHotkey,
  getClip,
  getHotkeys,
  getHotkeyCallback,
} from "./hotkey";
import { messageCache, updateMessageCache } from "./events";
import { GameStore } from "./gamestore";

interface CruxLib {
  touchEnabled: boolean;
  crux: any;
  format: any;
  formatTime: any;
  Button: any;
  Text: any;
  Widget: any;
  DropDown: any;
}
interface NeptunesPrideData {
  sendAllTech: (recipient: number) => void;
  sendTech: (recipient: number, tech: string) => void;
  sendCash: (recipient: number, price: number) => void;
  gameVersion: string;
  version: any;
  inbox: any;
  universe: any;
  gameNumber: any;
  np: any;
  npui: any;
  originalPlayer: any;
  gameConfig: any;
  templates: { [k: string]: string };
}
declare global {
  var jQuery: any;
  var NeptunesPride: NeptunesPrideData;
  var Crux: CruxLib;
  interface String {
    format(...args: any[]): string;
  }
}

function NeptunesPrideAgent() {
  let title = getVersion();
  let version = title.replace(/^.*v/, "v");
  console.log(title);

  const settings: GameStore = new GameStore("global_settings");

  type TimeOptionsT = "relative" | "eta" | "tick" | "tickrel";
  const timeOptions: TimeOptionsT[] = ["relative", "eta", "tickrel", "tick"];
  settings.newSetting("relativeTimes", timeOptions[0]);
  settings.newSetting("autoRulerPower", 1);
  settings.newSetting("territoryOn", true);
  settings.newSetting("whitePlayer", false);

  if (!String.prototype.format) {
    String.prototype.format = function (...args) {
      return this.replace(/{(\d+)}/g, function (match: string, index: number) {
        if (typeof args[index] === "number") {
          return Math.trunc(args[index] * 1000) / 1000;
        }
        return typeof args[index] != "undefined" ? args[index] : match;
      });
    };
  }

  const linkFleets = function () {
    let universe = NeptunesPride.universe;
    let fleets = NeptunesPride.universe.galaxy.fleets;

    for (const f in fleets) {
      let fleet = fleets[f];
      let fleetLink = `<a onClick='Crux.crux.trigger(\"show_fleet_uid\", \"${fleet.uid}\")'>${fleet.n}</a>`;
      universe.hyperlinkedMessageInserts[fleet.n] = fleetLink;
    }
  };
  const linkPlayerSymbols = function () {
    let universe = NeptunesPride.universe;
    for (let i = 0; i < 64; ++i) {
      if (universe.hyperlinkedMessageInserts[i]) {
        universe.hyperlinkedMessageInserts[`#${i}`] =
          universe.hyperlinkedMessageInserts[i].replace(/><a.*<.a>/, ">");
      }
    }
  };

  let lastReport = "planets";
  const prepReport = function (reportName: string, content: string) {
    lastReport = reportName;
    setClip(content);
  };
  defineHotkey(
    "`",
    () => NeptunesPride.npui.trigger("show_screen", "new_fleet"),
    "Bring up the NP Agent UI." +
      "<p>The Agent UI will show you the last report you put on the clipboard or viewed.",
    "Open NPA UI",
  );

  function starReport() {
    let players = NeptunesPride.universe.galaxy.players;
    let stars = NeptunesPride.universe.galaxy.stars;

    let output = [];
    for (const p in players) {
      output.push("[[{0}]]".format(p));
      for (const s in stars) {
        let star = stars[s];
        if (star.puid == p && star.shipsPerTick >= 0) {
          output.push(
            "  [[{0}]] {1}/{2}/{3} {4} ships".format(
              star.n,
              star.e,
              star.i,
              star.s,
              star.totalDefenses,
            ),
          );
        }
      }
    }
    prepReport("stars", output.join("\n"));
  }
  defineHotkey(
    "*",
    starReport,
    "Generate a report on all stars in your scanning range, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "Star Report",
  );

  let ampm = function (h: number, m: number | string) {
    if (m < 10) m = `0${m}`;
    if (h < 12) {
      if (h == 0) h = 12;
      return "{0}:{1} AM".format(h, m);
    } else if (h > 12) {
      return "{0}:{1} PM".format(h - 12, m);
    }
    return "{0}:{1} PM".format(h, m);
  };

  let msToTick = function (tick: number, wholeTime?: boolean) {
    let universe = NeptunesPride.universe;
    var ms_since_data = 0;
    var tf = universe.galaxy.tick_fragment;
    var ltc = universe.locTimeCorrection;

    if (!universe.galaxy.paused) {
      ms_since_data = new Date().valueOf() - universe.now.valueOf();
    }

    if (wholeTime || universe.galaxy.turn_based) {
      ms_since_data = 0;
      tf = 0;
      ltc = 0;
    }

    var ms_remaining =
      tick * 1000 * 60 * universe.galaxy.tick_rate -
      tf * 1000 * 60 * universe.galaxy.tick_rate -
      ms_since_data -
      ltc;
    return ms_remaining;
  };

  let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let msToTurnString = function (ms: number, prefix: string) {
    const rate = NeptunesPride.universe.galaxy.tick_rate * 60 * 1000;
    const tick = ms / rate;
    const turn = Math.ceil(tick / NeptunesPride.gameConfig.turnJumpTicks);
    return `${turn} turn${turn !== 1 ? "s" : ""}`;
  };
  let msToEtaString = function (msplus: number, prefix: string) {
    let now = new Date();
    let arrival = new Date(now.getTime() + msplus);
    let p = prefix !== undefined ? prefix : "ETA ";
    let ttt = p + ampm(arrival.getHours(), arrival.getMinutes());
    if (arrival.getDay() != now.getDay())
      ttt = `${p}${days[arrival.getDay()]} @ ${ampm(
        arrival.getHours(),
        arrival.getMinutes(),
      )}`;
    return ttt;
  };
  let tickToEtaString = function (tick: number, prefix?: string) {
    let msplus = msToTick(tick);
    return msToEtaString(msplus, prefix);
  };

  function tickNumber(ticks: number) {
    return NeptunesPride.universe.galaxy.tick + ticks;
  }

  let fleetOutcomes: { [k: number]: any } = {};
  let combatHandicap = 0;
  let combatOutcomes = function () {
    let universe = NeptunesPride.universe;
    let players = NeptunesPride.universe.galaxy.players;
    let fleets = NeptunesPride.universe.galaxy.fleets;
    let stars = NeptunesPride.universe.galaxy.stars;
    let flights = [];
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
            tickNumber(ticks),
          ),
          fleet,
        ]);
      }
    }
    flights = flights.sort(function (a, b) {
      return a[0] - b[0];
    });
    let arrivals: { [k: string]: any } = {};
    let output = [];
    let arrivalTimes = [];
    interface DepartureRecord {
      leaving: number;
      origShips: number;
    }
    interface StarState {
      last_updated: number;
      ships: number;
      puid: number;
      c: number;
      departures: { [k: number]: DepartureRecord };
    }
    let starstate: { [k: string]: StarState } = {};
    for (const i in flights) {
      let fleet = flights[i][2];
      if (fleet.orbiting) {
        let orbit: string = fleet.orbiting.uid;
        if (!starstate[orbit]) {
          starstate[orbit] = {
            last_updated: 0,
            ships: stars[orbit].totalDefenses,
            puid: stars[orbit].puid,
            c: stars[orbit].c,
            departures: {},
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
      let arrival = arrivals[k];
      let ka = k.split(",");
      let tick = parseInt(ka[0]);
      let starId = ka[1];
      if (!starstate[starId]) {
        starstate[starId] = {
          last_updated: 0,
          ships: stars[starId].totalDefenses,
          puid: stars[starId].puid,
          c: stars[starId].c || 0,
          departures: {},
        };
      }
      if (starstate[starId].puid == -1) {
        // assign ownership of the star to the player whose fleet has traveled the least distance
        let minDistance = 10000;
        let owner = -1;
        for (const i in arrival) {
          let fleet = arrival[i];
          let d = universe.distance(
            stars[starId].x,
            stars[starId].y,
            fleet.lx,
            fleet.ly,
          );
          if (d < minDistance || owner == -1) {
            owner = fleet.puid;
            minDistance = d;
          }
        }
        starstate[starId].puid = owner;
      }
      output.push(
        "[[Tick #{0}]]: [[{1}]] [[{2}]] {3} ships".format(
          tickNumber(tick),
          starstate[starId].puid,
          stars[starId].n,
          starstate[starId].ships,
        ),
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
            output.push("  {0} depart".format(departing));
          }
        }
        if (starstate[starId].ships < oldShips) {
          oldShips = starstate[starId].ships;
        }
        starstate[starId].last_updated = tick - 1;
        if (stars[starId].shipsPerTick) {
          let oldc = starstate[starId].c;
          starstate[starId].ships +=
            stars[starId].shipsPerTick * tickDelta + oldc;
          starstate[starId].c =
            starstate[starId].ships - Math.trunc(starstate[starId].ships);
          starstate[starId].ships -= starstate[starId].c;
          output.push(
            "  {0}+{3} + {2}/h = {1}+{4}".format(
              oldShips,
              starstate[starId].ships,
              stars[starId].shipsPerTick,
              oldc,
              starstate[starId].c,
            ),
          );
        }
      }
      for (const i in arrival) {
        let fleet = arrival[i];
        if (
          fleet.puid == starstate[starId].puid ||
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
            fleet.n,
          );
          output.push(landingString);
          landingString = landingString.substring(2);
        }
      }
      for (const i in arrival) {
        let fleet = arrival[i];
        if (fleet.puid == starstate[starId].puid) {
          let outcomeString = "{0} ships on {1}".format(
            Math.floor(starstate[starId].ships),
            stars[starId].n,
          );
          fleetOutcomes[fleet.uid] = {
            eta: `[[Tick #${tickNumber(fleet.etaFirst)}]]`,
            outcome: outcomeString,
          };
        }
      }
      let awt = 0;
      let offense = 0;
      let contribution: { [k: string]: any } = {};
      for (const i in arrival) {
        let fleet = arrival[i];
        if (fleet.puid != starstate[starId].puid) {
          let olda = offense;
          offense += fleet.st;
          output.push(
            "  [[{4}]]! {0} + {2} on [[{3}]] = {1}".format(
              olda,
              offense,
              fleet.st,
              fleet.n,
              fleet.puid,
            ),
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
        let dwt = players[starstate[starId].puid].tech.weapons.level;
        let defense = starstate[starId].ships;
        output.push(
          "  Combat! [[{0}]] defending".format(starstate[starId].puid),
        );
        output.push("    Defenders {0} ships, WS {1}".format(defense, dwt));
        output.push("    Attackers {0} ships, WS {1}".format(offense, awt));
        if (NeptunesPride.gameVersion !== "proteus") {
          dwt += 1;
        }
        if (starstate[starId].puid !== universe.galaxy.player_uid) {
          if (combatHandicap > 0) {
            dwt += combatHandicap;
            output.push(
              "    Defenders WS{0} = {1}".format(handicapString(""), dwt),
            );
          } else {
            awt -= combatHandicap;
            output.push(
              "    Attackers WS{0} = {1}".format(handicapString(""), awt),
            );
          }
        } else {
          if (combatHandicap > 0) {
            awt += combatHandicap;
            output.push(
              "    Attackers WS{0} = {1}".format(handicapString(""), awt),
            );
          } else {
            dwt -= combatHandicap;
            output.push(
              "    Defenders WS{0} = {1}".format(handicapString(""), dwt),
            );
          }
        }

        if (universe.galaxy.player_uid === starstate[starId].puid) {
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
          output.push(
            "  Attackers win with {0} ships remaining".format(offense),
          );
          const pairs: [string, number][] = Object.keys(contribution).map(
            (k) => [k, contribution[k]],
          );
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
            output.push(
              "    [[{0}]] has {1} on [[{2}]]".format(
                fleet.puid,
                contribution[k],
                fleet.n,
              ),
            );
            let outcomeString = "Wins! {0} land.".format(contribution[k]);
            fleetOutcomes[fleet.uid] = {
              eta: `[[Tick #${tickNumber(fleet.etaFirst)}]]`,
              outcome: outcomeString,
            };
          }
          offense = newAggregate - playerContribution[biggestPlayerId];
          starstate[starId].puid = biggestPlayerId;
          starstate[starId].ships = playerContribution[biggestPlayerId];
        } else {
          starstate[starId].ships = defense;
          for (const i in arrival) {
            let fleet = arrival[i];
            if (fleet.puid == starstate[starId].puid) {
              let outcomeString = "{0} ships on {1}".format(
                Math.floor(starstate[starId].ships),
                stars[starId].n,
              );
              fleetOutcomes[fleet.uid] = {
                eta: `[[Tick #${tickNumber(fleet.etaFirst)}]]`,
                outcome: outcomeString,
              };
            }
          }
          for (const k in contribution) {
            let ka = k.split(",");
            let fleet = fleets[ka[1]];
            let outcomeString = "Loses! {0} live.".format(defense);
            if (fleet.puid == starstate[starId].puid) {
              outcomeString = "Wins! {0} land.".format(defense);
            }
            fleetOutcomes[fleet.uid] = {
              eta: `[[Tick #${tickNumber(fleet.etaFirst)}]]`,
              outcome: outcomeString,
            };
          }
        }
        attackersAggregate = offense;
      }
      output.push(
        "  [[{0}]] [[{1}]] {2} ships".format(
          starstate[starId].puid,
          stars[starId].n,
          starstate[starId].ships,
        ),
      );
    }
    return output;
  };

  const incAutoRuler = () => {
    settings.autoRulerPower += 1;
    NeptunesPride.np.trigger("map_rebuild");
  };
  const decAutoRuler = () => {
    let nextPower = settings.autoRulerPower - 1;
    if (nextPower < 0) nextPower = 0;
    settings.autoRulerPower = nextPower;
    NeptunesPride.np.trigger("map_rebuild");
  };
  defineHotkey(
    "8",
    decAutoRuler,
    "Decrease number of distances shown by the auto ruler.",
    "- Rulers",
  );
  defineHotkey(
    "9",
    incAutoRuler,
    "Increase number of distances shown by the auto ruler.",
    "+ Rulers",
  );
  function incCombatHandicap() {
    combatHandicap += 1;
    NeptunesPride.np.trigger("map_rebuild");
  }
  function decCombatHandicap() {
    combatHandicap -= 1;
    NeptunesPride.np.trigger("map_rebuild");
  }
  defineHotkey(
    ".",
    incCombatHandicap,
    "Change combat calculation to credit your enemies with +1 weapons. Useful " +
      "if you suspect they will have achieved the next level of tech before a battle you are investigating." +
      "<p>In the lower left of the HUD, an indicator will appear reminding you of the weapons adjustment. If the " +
      "indicator already shows an advantage for defenders, this hotkey will reduce that advantage first before crediting " +
      "weapons to your opponent.",
    "+ Handicap",
  );
  defineHotkey(
    ",",
    decCombatHandicap,
    "Change combat calculation to credit yourself with +1 weapons. Useful " +
      "when you will have achieved the next level of tech before a battle you are investigating." +
      "<p>In the lower left of the HUD, an indicator will appear reminding you of the weapons adjustment. When " +
      "indicator already shows an advantage for attackers, this hotkey will reduce that advantage first before crediting " +
      "weapons to you.",
    "- Handicap",
  );

  function longFleetReport() {
    prepReport("combats", combatOutcomes().join("\n"));
  }
  defineHotkey(
    "&",
    longFleetReport,
    "Generate a detailed fleet report on all carriers in your scanning range, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "Fleets (long)",
  );

  function briefFleetReport() {
    let fleets = NeptunesPride.universe.galaxy.fleets;
    let stars = NeptunesPride.universe.galaxy.stars;
    let flights = [];
    for (const f in fleets) {
      let fleet = fleets[f];
      if (fleet.o && fleet.o.length > 0) {
        let stop = fleet.o[0][1];
        let ticks = fleet.etaFirst;
        let starname = stars[stop]?.n;
        if (!starname) continue;
        flights.push([
          ticks,
          "[[{0}]] [[{1}]] {2} → [[{3}]] {4}".format(
            fleet.puid,
            fleet.n,
            fleet.st,
            stars[stop].n,
            `[[Tick #${tickNumber(ticks)}]]`,
          ),
        ]);
      }
    }
    flights = flights.sort(function (a, b) {
      return a[0] - b[0];
    });
    prepReport("fleets", flights.map((x) => x[1]).join("\n"));
  }

  defineHotkey(
    "^",
    briefFleetReport,
    "Generate a summary fleet report on all carriers in your scanning range, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "Fleets (short)",
  );

  function screenshot() {
    let map = NeptunesPride.npui.map;
    setClip(map.canvas[0].toDataURL("image/webp", 0.05));
  }

  defineHotkey(
    "#",
    screenshot,
    "Create a data: URL of the current map. Paste it into a browser window to view. This is likely to be removed.",
    "Screenshot",
  );

  let homePlanets = function () {
    let p = NeptunesPride.universe.galaxy.players;
    let output = [];
    for (let i in p) {
      let home = p[i].home;
      if (home) {
        output.push(
          "Player #{0} is [[{0}]] home {2} [[{1}]]".format(
            i,
            home.n,
            i == home.puid ? "is" : "was",
          ),
        );
      } else {
        output.push("Player #{0} is [[{0}]] home unknown".format(i));
      }
    }
    prepReport("planets", output.join("\n"));
  };
  defineHotkey(
    "!",
    homePlanets,
    "Generate a player summary report and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown. " +
      "It is most useful for discovering player numbers so that you can write [[#]] to reference a player in mail.",
    "Homeworlds",
  );

  let playerSheet = function () {
    let p = NeptunesPride.universe.galaxy.players;
    let output = [];
    let fields = [
      "alias",
      "total_stars",
      "shipsPerTick",
      "total_strength",
      "total_economy",
      "total_fleets",
      "total_industry",
      "total_science",
    ];
    output.push(fields.join(","));
    for (let i in p) {
      const record = fields.map((f) => p[i][f]);
      output.push(record.join(","));
    }
    setClip(output.join("\n"));
  };
  defineHotkey(
    "$",
    playerSheet,
    "Generate a player summary mean to be made into a spreadsheet." +
      "<p>The clipboard should be pasted into a CSV and then imported.",
    "Summary CSV",
  );

  let drawString = function (
    s: string,
    x: number,
    y: number,
    fgColor?: string,
  ) {
    const str = Crux.format(s, {});
    const context = NeptunesPride.npui.map.context;
    context.fillStyle = fgColor || "#00ff00";
    context.fillText(str, x, y);
  };

  let drawOverlayString = function (
    context: {
      fillStyle: string;
      fillText: (arg0: any, arg1: number, arg2: number) => void;
    },
    s: string,
    x: number,
    y: number,
    fgColor?: string,
  ) {
    const str = Crux.format(s, {});
    context.fillStyle = "#000000";
    for (let smear = 1; smear < 4; ++smear) {
      context.fillText(str, x + smear, y + smear);
      context.fillText(str, x - smear, y + smear);
      context.fillText(str, x - smear, y - smear);
      context.fillText(str, x + smear, y - smear);
    }
    context.fillStyle = fgColor || "#00ff00";
    context.fillText(str, x, y);
  };

  let anyStarCanSee = function (
    owner: string | number,
    fleet: { x: any; y: any },
  ) {
    let stars = NeptunesPride.universe.galaxy.stars;
    let universe = NeptunesPride.universe;
    let scanRange = universe.galaxy.players[owner].tech.scanning.value;
    for (const s in stars) {
      let star = stars[s];
      if (star.puid == owner) {
        let distance = universe.distance(star.x, star.y, fleet.x, fleet.y);
        if (distance <= scanRange) {
          return true;
        }
      }
    }
    return false;
  };

  let hooksLoaded = false;
  let handicapString = function (prefix?: string) {
    let p =
      prefix !== undefined ? prefix : combatHandicap > 0 ? "Enemy WS" : "My WS";
    return p + (combatHandicap > 0 ? "+" : "") + combatHandicap;
  };
  type CSSRuleMap = { [k: string]: CSSStyleRule };
  function cssrules(): CSSRuleMap {
    var rules: { [k: string]: CSSStyleRule } = {};
    for (var i = 0; i < document.styleSheets.length; ++i) {
      try {
        var cssRules = document.styleSheets[i].cssRules;
        for (var j = 0; j < cssRules.length; ++j) {
          if (cssRules[j].type === CSSRule.STYLE_RULE) {
            const style: CSSStyleRule = cssRules[j] as CSSStyleRule;
            rules[style.selectorText] = style;
          }
        }
      } catch (err) {
        console.log(err);
      }
    }
    return rules;
  }
  const colors = [
    "#0000ff",
    "#009fdf",
    "#40c000",
    "#ffc000",
    "#df5f00",
    "#c00000",
    "#c000c0",
    "#6000c0",
  ];
  const css = cssrules();
  let originalStarSrc: any = undefined;
  async function recolorPlayers() {
    const map = NeptunesPride.npui.map;
    if (originalStarSrc === undefined) {
      originalStarSrc = new Image();
      originalStarSrc.src = map.starSrc.src;
    }
    let ownershipSprites = document.createElement("canvas");
    // 7 extra columns for stargate glows
    ownershipSprites.width = 64 * 9 + 64 * 7;
    ownershipSprites.height = 64 * 9;
    let spriteContext: CanvasRenderingContext2D =
      ownershipSprites.getContext("2d");
    spriteContext.drawImage(originalStarSrc, 0, 0);

    const players = NeptunesPride.universe.galaxy.players;
    for (let pk in players) {
      const player = players[pk];
      let color = player.color;
      if (player.shape !== undefined) {
        color = colors[player.color];
      }
      // player underbar in player list, but these only exist
      // for the first 8 players.
      if (parseInt(pk) < 8) {
        try {
          css[`.bgpc_${player.uid}`].style.backgroundColor = color;
        } catch (error) {
          console.error("Underbar style not found");
        }
      }
      const playerSprite = document.createElement("canvas");
      playerSprite.width = playerSprite.height = 64 * 9;
      const playerContext: CanvasRenderingContext2D =
        playerSprite.getContext("2d");
      playerContext.drawImage(originalStarSrc, 0, 0);
      playerContext.globalCompositeOperation = "source-in";
      playerContext.fillStyle = color;
      const uid = player.uid;
      let col = Math.floor(uid / 8);
      let row = Math.floor(uid % 8) + 1;
      if (player.shape !== undefined) {
        col = player.shape;
        row = player.color + 1;
      }

      const x = col * 64;
      const y = row * 64;
      playerContext.fillRect(x, y, 64, 64);

      const whitePlayer = new Image();
      whitePlayer.src = playerSprite.toDataURL();
      await whitePlayer.decode();
      spriteContext.clearRect(x, y, 64, 64);
      spriteContext.drawImage(whitePlayer, 0, 0);
    }
    // draw stargate glows
    for (let pk in players) {
      const player = players[pk];
      let color = player.color;
      if (player.shape !== undefined) {
        color = colors[player.color];
      }
      const playerSprite = document.createElement("canvas");
      playerSprite.width = playerSprite.height = 64 * 9;
      const playerContext: CanvasRenderingContext2D =
        playerSprite.getContext("2d");
      playerContext.drawImage(map.starSrc, 0, 0);
      playerContext.globalCompositeOperation = "source-in";
      playerContext.fillStyle = color;
      const uid = player.uid;
      let realcol = Math.floor(uid / 8);
      let col = 8;
      let row = Math.floor(uid % 8) + 1;
      if (player.shape !== undefined) {
        realcol = player.shape;
        row = player.color + 1;
      }
      const x = col * 64;
      const y = row * 64;
      playerContext.fillRect(x, y, 64, 64);

      const whitePlayer = new Image();
      whitePlayer.src = playerSprite.toDataURL();
      await whitePlayer.decode();
      spriteContext.clearRect(x + realcol * 64, y, 64, 64);
      spriteContext.drawImage(whitePlayer, realcol * 64, 0);
    }

    // Override sprite positioning for stars with gates, so
    // that every player can have a uniquely coloured gate
    // glow that matches their own colour.
    const superCreateSpritesStars = NeptunesPride.npui.map.createSpritesStars;
    NeptunesPride.npui.map.createSpritesStars = () => {
      superCreateSpritesStars();
      NeptunesPride.npui.map.sortedStarSprites.forEach((sss: any) => {
        if (sss.gate && sss.puid >= 0) {
          let col =
            NeptunesPride.universe.galaxy.players[sss.puid].shape ||
            Math.floor(sss.puid / 8);
          sss.gate.spriteX = 64 * 8 + 64 * col;
        }
      });
    };

    map.starSrc.src = ownershipSprites.toDataURL();
    await map.starSrc.decode();
    for (let pk in players) {
      const player = players[pk];
      const uid = player.uid;
      let col = Math.floor(uid / 8);
      let row = Math.floor(uid % 8) + 1;
      if (player.shape !== undefined) {
        col = player.shape;
        row = player.color + 1;
      }
      const x = col * 64;
      const y = row * 64;
      // player overlay on avatar
      css[`.pci_48_${player.uid}`].style.background = `url("${
        map.starSrc.src
      }") -${x + 8}px -${y + 8}px`;
    }
    console.log("Recreating star and fleet sprites");
    NeptunesPride.np.trigger("map_rebuild");
    // firefox workaround: a delayed repaint seems needed?
    window.setTimeout(() => NeptunesPride.np.trigger("map_rebuild"), 500);
  }
  let loadHooks = function () {
    const map = NeptunesPride.npui.map;

    let superDrawScanning = map.drawScanningRange;
    function drawDisc(x: number, y: number, scale: number, r: number) {
      const context: CanvasRenderingContext2D = map.context;
      context.save();
      context.translate(x, y);
      context.scale(scale, scale);
      context.moveTo(0, 0);
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.restore();
    }
    function drawStarTerritory(star: any, scanning: boolean) {
      const x = map.worldToScreenX(star.x);
      const y = map.worldToScreenY(star.y);
      const sH = combatHandicap;
      const lyToMap =
        star.player.tech.scanning.value / (star.player.tech.scanning.level + 2);
      const scanRange = (star.player.tech.scanning.level + 2 + sH) * lyToMap;
      const scale = (scanRange * map.scale * map.pixelRatio) / 250;
      const r = (map.scanningRangeSprite.width * 0.9) / 2;

      const pH = combatHandicap;
      const lyrToMap =
        star.player.tech.propulsion.value /
        (star.player.tech.propulsion.level + 3);
      const fleetRange =
        (star.player.tech.propulsion.level + 3 + pH) * lyrToMap;
      const fscale = (fleetRange * map.scale * map.pixelRatio) / 250;
      const fr = (map.fleetRangeSprite.width * 0.9) / 2;
      if (scanning) {
        drawDisc(x, y, scale, r);
      } else {
        drawDisc(x, y, fscale, fr);
      }
    }
    const distance = function (star1: any, star2: any) {
      const xoff = star1.x - star2.x;
      const yoff = star1.y - star2.y;
      const gatefactor = star1?.ga * star2?.ga * 9 || 1;
      return (xoff * xoff + yoff * yoff) / gatefactor;
    };
    const findClosestStars = function (star: any, stepsOut: number) {
      const map = NeptunesPride.npui.map;
      const stars = NeptunesPride.universe.galaxy.stars;
      let closest = star;
      let closestSupport = star;
      const toStars = (s: any) => {
        return stars[s.uid];
      };
      let sortedByDistanceSquared = map.sortedStarSprites.map(toStars);
      sortedByDistanceSquared.sort(
        (a: any, b: any) => distance(star, b) - distance(star, a),
      );
      let i = sortedByDistanceSquared.length;
      do {
        i -= 1;
        const candidate = sortedByDistanceSquared[i];
        const dist = distance(star, candidate);
        if (
          candidate.puid !== star.puid &&
          (closest === star || stepsOut > 0)
        ) {
          closest = candidate;
          stepsOut--;
        } else if (candidate.puid === star.puid && closestSupport === star) {
          closestSupport = candidate;
        }
      } while (
        (closest === star || closestSupport === star || stepsOut > 0) &&
        i > 0
      );
      const closestDist = distance(star, closest);
      const closerStars: any[] = [];
      for (let i = 0; i < sortedByDistanceSquared.length; ++i) {
        const candidate = stars[sortedByDistanceSquared[i].uid];
        const dsQ = distance(star, candidate);
        if (
          dsQ <= closestDist &&
          candidate !== closest &&
          candidate !== closestSupport &&
          candidate !== star
        ) {
          closerStars.push(candidate);
        }
      }

      return [closest, closestSupport, closerStars];
    };
    const drawAutoRuler = function () {
      const universe = NeptunesPride.universe;
      const map = NeptunesPride.npui.map;
      if (
        universe.selectedStar &&
        settings.autoRulerPower > 0 &&
        map.scale >= 200
      ) {
        const visTicks = NeptunesPride.gameConfig.turnBased
          ? NeptunesPride.gameConfig.turnJumpTicks
          : 1;
        const speed = NeptunesPride.universe.galaxy.fleet_speed;
        const speedSq = speed * speed;
        const star = universe.selectedStar;
        const stepsOut = Math.ceil(settings.autoRulerPower / 2);
        const showAll = settings.autoRulerPower % 2 === 0;
        const [other, support, closerStars] = findClosestStars(star, stepsOut);
        const drawHUDRuler = function (star: any, other: any, color: string) {
          const tickDistance = Math.sqrt(distance(star, other));
          const ticks = Math.ceil(tickDistance / speed);
          const midX = map.worldToScreenX((star.x + other.x) / 2);
          const midY = map.worldToScreenY((star.y + other.y) / 2);

          const rotationAngle = function (star1: any, star2: any) {
            const xoff = star1.x - star2.x;
            const yoff = star1.y - star2.y;
            const flipped = xoff < 0;
            const flip = Math.PI * (flipped ? 1 : 0);
            return { angle: Math.atan2(yoff, xoff) + flip, flipped };
          };
          map.context.save();
          map.context.globalAlpha = 1;
          map.context.strokeStyle = color;
          map.context.fillStyle = color;
          map.context.lineWidth = 2 * map.pixelRatio;
          map.context.lineCap = "round";
          map.context.translate(midX, midY);
          const { angle, flipped } = rotationAngle(star, other);
          map.context.rotate(angle);
          const visArcRadius =
            map.worldToScreenX(visTicks * speed) - map.worldToScreenX(0);
          const visArcX =
            (map.worldToScreenX(tickDistance) - map.worldToScreenX(0)) / 2;
          const start =
            map.worldToScreenX(tickDistance - 2 * speed) -
            map.worldToScreenX(0);
          const dist = map.worldToScreenX(tickDistance) - map.worldToScreenX(0);
          const end =
            map.worldToScreenX(tickDistance - 2 * speed) -
            map.worldToScreenX(0);
          if (start > 0 && end > 0) {
            map.context.beginPath();
            map.context.moveTo(-start / 2, 0);
            map.context.lineTo(end / 2, 0);
            map.context.stroke();
            map.context.beginPath();
            const arrow = flipped ? -1 : 1;
            const arrowSize = 5;
            map.context.moveTo((arrow * end) / 2, 0);
            map.context.lineTo(
              (arrow * end) / 2 - arrow * arrowSize * map.pixelRatio,
              arrowSize * map.pixelRatio,
            );
            map.context.lineTo(
              (arrow * end) / 2 - arrow * arrowSize * map.pixelRatio,
              -arrowSize * map.pixelRatio,
            );
            map.context.closePath();
            map.context.fill();
            if (visArcRadius - visArcX - end / 2 + 1.0 <= 1.0) {
              map.context.beginPath();
              const arcLen = (Math.PI * 8) / visArcRadius;
              const flipPi = flipped ? Math.PI : 0;
              const x = flipped ? visArcX : -visArcX;
              map.context.arc(
                x,
                0,
                visArcRadius,
                flipPi - arcLen,
                flipPi + arcLen,
              );
              map.context.stroke();
            }
          }
          map.context.textAlign = "center";
          map.context.translate(0, -8 * map.pixelRatio);
          drawString(`[[Tick #${tickNumber(ticks)}]]`, 0, 0, color);
          if (visArcRadius - dist + 1.0 > 1.0) {
            map.context.translate(0, 2 * 9 * map.pixelRatio);
            drawString("invisible", 0, 0, color);
          }
          map.context.setLineDash([]);
          map.context.restore();
          return ticks;
        };
        const enemyTicks = drawHUDRuler(star, other, "#aa0000");
        const ticks = Math.ceil(Math.sqrt(distance(star, support) / speedSq));
        if (enemyTicks - visTicks >= ticks) {
          drawHUDRuler(star, support, "#00aa00");
        } else {
          drawHUDRuler(star, support, "#888888");
        }

        for (let i = 0; showAll && i < closerStars.length; ++i) {
          const o = closerStars[i];
          if (o.puid == star.puid) {
            const ticks = Math.ceil(Math.sqrt(distance(star, o) / speedSq));
            if (enemyTicks - visTicks >= ticks) {
              drawHUDRuler(star, o, "#00aa00");
            } else {
              drawHUDRuler(star, o, "#888888");
            }
          } else {
            drawHUDRuler(star, o, "#aa0000");
          }
        }
      }
    };
    map.drawScanningRange = function () {
      superDrawScanning();

      const universe = NeptunesPride.universe;
      if (universe.selectedStar?.player && settings.territoryOn) {
        const context: CanvasRenderingContext2D = map.context;
        let p = universe.selectedStar.player.uid;
        {
          let scanning = false;
          do {
            scanning = !scanning;
            context.beginPath();
            for (let key in universe.galaxy.stars) {
              const star = universe.galaxy.stars[key];
              if (star.player?.uid == p) {
                drawStarTerritory(star, scanning);
              }
            }
            const player = universe.galaxy.players[p];
            let color = player.color;
            if (player.shape !== undefined) {
              color = colors[player.color];
            }
            const drawColor = `${color}35`;
            context.fillStyle = drawColor;
            context.fill();
            context.closePath();
          } while (scanning);
        }
      }
    };
    let superDrawText = NeptunesPride.npui.map.drawText;
    NeptunesPride.npui.map.drawText = function () {
      let universe = NeptunesPride.universe;
      let map = NeptunesPride.npui.map;
      superDrawText();

      map.context.font = `${14 * map.pixelRatio}px OpenSansRegular, sans-serif`;
      map.context.fillStyle = "#FF0000";
      map.context.textAlign = "right";
      map.context.textBaseline = "middle";
      let v = version;
      if (combatHandicap !== 0) {
        v = `${handicapString()} ${v}`;
      }
      drawOverlayString(
        map.context,
        v,
        map.viewportWidth - 10,
        map.viewportHeight - 16 * map.pixelRatio,
      );
      if (NeptunesPride.originalPlayer === undefined) {
        NeptunesPride.originalPlayer = universe.player.uid;
      }
      if (NeptunesPride.originalPlayer !== universe.player.uid) {
        let n = universe.galaxy.players[universe.player.uid].alias;
        drawOverlayString(
          map.context,
          n,
          map.viewportWidth - 100,
          map.viewportHeight - 2 * 16 * map.pixelRatio,
        );
      }

      if (universe.selectedFleet && universe.selectedFleet.path.length > 0) {
        //console.log("Selected fleet", universe.selectedFleet);
        map.context.font = `${
          14 * map.pixelRatio
        }px OpenSansRegular, sans-serif`;
        map.context.fillStyle = "#FF0000";
        map.context.textAlign = "left";
        map.context.textBaseline = "middle";
        let dy = universe.selectedFleet.y - universe.selectedFleet.ly;
        let dx = universe.selectedFleet.x - universe.selectedFleet.lx;
        dy = universe.selectedFleet.path[0].y - universe.selectedFleet.y;
        dx = universe.selectedFleet.path[0].x - universe.selectedFleet.x;
        let lineHeight = 16 * map.pixelRatio;
        let radius = 2 * 0.028 * map.scale * map.pixelRatio;
        let angle = Math.atan(dy / dx);
        let offsetx = radius * Math.cos(angle);
        let offsety = radius * Math.sin(angle);
        if (offsetx > 0 && dx > 0) {
          offsetx *= -1;
        }
        if (offsety > 0 && dy > 0) {
          offsety *= -1;
        }
        if (offsetx < 0 && dx < 0) {
          offsetx *= -1;
        }
        if (offsety < 0 && dy < 0) {
          offsety *= -1;
        }
        combatOutcomes();
        let s = fleetOutcomes[universe.selectedFleet.uid].eta;
        let o = fleetOutcomes[universe.selectedFleet.uid].outcome;
        let x = map.worldToScreenX(universe.selectedFleet.x) + offsetx;
        let y = map.worldToScreenY(universe.selectedFleet.y) + offsety;
        if (offsetx < 0) {
          map.context.textAlign = "right";
        }
        drawOverlayString(map.context, s, x, y);
        drawOverlayString(map.context, o, x, y + lineHeight);
      }
      if (
        !NeptunesPride.gameConfig.turnBased &&
        universe.timeToTick(1).length < 3
      ) {
        let lineHeight = 16 * map.pixelRatio;
        map.context.font = `${
          14 * map.pixelRatio
        }px OpenSansRegular, sans-serif`;
        map.context.fillStyle = "#FF0000";
        map.context.textAlign = "left";
        map.context.textBaseline = "middle";
        let s = "Tick < 10s away!";
        if (universe.timeToTick(1) === "0s") {
          s = "Tick passed. Click production countdown to refresh.";
        }
        drawOverlayString(map.context, s, 1000, lineHeight);
      }
      if (
        universe.selectedStar &&
        universe.selectedStar.puid != universe.player.uid &&
        universe.selectedStar.puid !== -1
      ) {
        // enemy star selected; show HUD for scanning visibility
        map.context.textAlign = "left";
        map.context.textBaseline = "middle";
        let xOffset = 26 * map.pixelRatio;
        //map.context.translate(xOffset, 0);
        let fleets = NeptunesPride.universe.galaxy.fleets;
        for (const f in fleets) {
          let fleet = fleets[f];
          if (fleet.puid === universe.player.uid) {
            let dx = universe.selectedStar.x - fleet.x;
            let dy = universe.selectedStar.y - fleet.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            let offsetx = xOffset;
            let offsety = 0;
            let x = map.worldToScreenX(fleet.x) + offsetx;
            let y = map.worldToScreenY(fleet.y) + offsety;
            if (
              distance >
              universe.galaxy.players[universe.selectedStar.puid].tech.scanning
                .value
            ) {
              if (fleet.path && fleet.path.length > 0) {
                dx = fleet.path[0].x - universe.selectedStar.x;
                dy = fleet.path[0].y - universe.selectedStar.y;
                distance = Math.sqrt(dx * dx + dy * dy);
                if (
                  distance <
                  universe.galaxy.players[universe.selectedStar.puid].tech
                    .scanning.value
                ) {
                  let stepRadius = NeptunesPride.universe.galaxy.fleet_speed;
                  if (fleet.warpSpeed) stepRadius *= 3;
                  dx = fleet.x - fleet.path[0].x;
                  dy = fleet.y - fleet.path[0].y;
                  let angle = Math.atan(dy / dx);
                  let stepx = stepRadius * Math.cos(angle);
                  let stepy = stepRadius * Math.sin(angle);
                  if (stepx > 0 && dx > 0) {
                    stepx *= -1;
                  }
                  if (stepy > 0 && dy > 0) {
                    stepy *= -1;
                  }
                  if (stepx < 0 && dx < 0) {
                    stepx *= -1;
                  }
                  if (stepy < 0 && dy < 0) {
                    stepy *= -1;
                  }
                  let ticks = 0;
                  do {
                    let x = ticks * stepx + Number(fleet.x);
                    let y = ticks * stepy + Number(fleet.y);
                    //let sx = map.worldToScreenX(x);
                    //let sy = map.worldToScreenY(y);
                    dx = x - universe.selectedStar.x;
                    dy = y - universe.selectedStar.y;
                    distance = Math.sqrt(dx * dx + dy * dy);
                    //console.log(distance, x, y);
                    //drawOverlayString(map.context, "o", sx, sy);
                    ticks += 1;
                  } while (
                    distance >
                      universe.galaxy.players[universe.selectedStar.puid].tech
                        .scanning.value &&
                    ticks <= fleet.etaFirst + 1
                  );
                  ticks -= 1;
                  let visColor = "#00ff00";
                  if (anyStarCanSee(universe.selectedStar.puid, fleet)) {
                    visColor = "#888888";
                  }
                  drawOverlayString(
                    map.context,
                    `Scan [[Tick #${tickNumber(ticks)}]]`,
                    x,
                    y,
                    visColor,
                  );
                }
              }
            }
          }
        }
        //map.context.translate(-xOffset, 0);
      }
      if (universe.ruler.stars.length == 2) {
        let p1 = universe.ruler.stars[0].puid;
        let p2 = universe.ruler.stars[1].puid;
        if (p1 !== p2 && p1 !== -1 && p2 !== -1) {
          //console.log("two star ruler");
        }
      }

      drawAutoRuler();
    };
    let base = -1;
    NeptunesPride.npui.status.on("one_second_tick", () => {
      if (base === -1) {
        const msplus = msToTick(1);
        const parts = superFormatTime(msplus, true, true, true).split(" ");
        base = parseInt(parts[parts.length - 1].replaceAll("s", "")) + 1;
      }
      base -= 1;
      if (
        base === 29 &&
        settings.relativeTimes === "relative" &&
        showingOurUI
      ) {
        // repaint the map and UI every minute if the user is
        // displaying the ticking clock.
        NeptunesPride.np.trigger("map_rebuild");
        NeptunesPride.np.trigger("refresh_interface");
      }
    });
    Crux.format = function (s: string, templateData: { [x: string]: any }) {
      if (!s) {
        return "error";
      }
      var i;
      var fp;
      var sp;
      var sub;
      var pattern;

      i = 0;
      fp = 0;
      sp = 0;
      sub = "";
      pattern = "";

      // look for standard patterns
      while (fp >= 0 && i < 1000) {
        i = i + 1;
        fp = s.indexOf("[[");
        sp = s.indexOf("]]");
        if (fp === -1) break;
        sub = s.slice(fp + 2, sp);
        pattern = `[[${sub}]]`;
        if (templateData[sub] !== undefined) {
          s = s.replace(pattern, templateData[sub]);
        } else if (/^Tick #\d\d*$/.test(sub)) {
          const split = sub.split("#");
          const tick = parseInt(split[1]);
          const relativeTick = tick - NeptunesPride.universe.galaxy.tick;
          let msplus = msToTick(relativeTick, false);
          s = s.replace(pattern, Crux.formatTime(msplus, true));
        } else if (safe_image_url(sub)) {
          s = s.replace(pattern, `<img width="100%" src='${sub}' />`);
        } else if (/^api:\w{6}$/.test(sub)) {
          let apiLink = `<a onClick='Crux.crux.trigger(\"switch_user_api\", \"${sub}\")'> View as ${sub}</a>`;
          apiLink += ` or <a onClick='Crux.crux.trigger(\"merge_user_api\", \"${sub}\")'> Merge ${sub}</a>`;
          s = s.replace(pattern, apiLink);
        } else if (/^apiv:\w{6}$/.test(sub)) {
          let apiLink = `<a onClick='Crux.crux.trigger(\"switch_user_api\", \"${sub}\")'>${sub}</a>`;
          s = s.replace(pattern, apiLink);
        } else if (/^apim:\w{6}$/.test(sub)) {
          let apiLink = `<a onClick='Crux.crux.trigger(\"merge_user_api\", \"${sub}\")'>${sub}</a>`;
          s = s.replace(pattern, apiLink);
        } else if (/^hotkey:[^:]$/.test(sub) || /^goto:[^:]/.test(sub)) {
          const splits = sub.split(":");
          const key = splits[1];
          const action = getHotkeyCallback(key);
          const label = action?.button || `Trigger ${sub}`;
          const goto = splits[0] === "goto" ? ';Mousetrap.trigger("`")' : "";
          let keyLink = `<span class="button button_up pad8" onClick='{Mousetrap.trigger(\"${key}\")${goto}}'>${label}</span>`;
          s = s.replace(pattern, keyLink);
        } else if (/^good:-?[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const text = splits[1];
          s = s.replace(pattern, `<span class="txt_warn_good">${text}</span>`);
        } else if (/^bad:[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const text = splits[1];
          s = s.replace(pattern, `<span class="txt_warn_bad">${text}</span>`);
        } else if (/^sendtech:\d\d*:\w\w*:-?[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const player = parseInt(splits[1]);
          const tech = splits[2];
          const label = splits[3];
          let sendLink = `<span class="txt_warn_good" onClick='{NeptunesPride.sendTech(${player}, "${tech}")}'>${label}</span>`;
          s = s.replace(pattern, sendLink);
        } else if (/^sendalltech:\d\d*:-?[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const player = parseInt(splits[1]);
          const label = splits[2];
          let sendLink = `<span class="txt_warn_good" onClick='{NeptunesPride.sendAllTech(${player})}'>${label}</span>`;
          s = s.replace(pattern, sendLink);
        } else if (/^sendcash:\d\d*:\d\d*:-?[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const player = parseInt(splits[1]);
          const amount = parseInt(splits[2]);
          const label = splits[3];
          let sendLink = `<span class="txt_warn_bad" onClick='{NeptunesPride.sendCash(${player}, "${amount}")}'>${label}</span>`;
          s = s.replace(pattern, sendLink);
        } else if (sub.startsWith("data:")) {
          s = s.replace(
            pattern,
            `<div width="100%" class="screenshot"><img class="screenshot" src="${sub}"/></div>`,
          );
        } else {
          s = s.replace(pattern, `(${sub})`);
        }
      }
      // process markdown-like
      let lines = s.split(/<br ?\/?>/);
      const output = [];
      let inTable = false;
      let alignmentRow = false;
      let alignments: string[] = [];
      for (let linen = 0; linen < lines.length; ++linen) {
        const line = lines[linen];
        if (line.indexOf("---") === 0 && line.indexOf("---", 3) !== -1) {
          inTable = !inTable;
          alignmentRow = inTable;
          if (inTable) {
            output.push('<table class="combat_result">');
            output.push(
              `<tr><th style="padding: 12px" colspan="10">${line.substring(
                4,
                line.length - 4,
              )}</th></tr>`,
            );
          } else {
            output.push("</table>");
          }
        } else if (
          inTable &&
          alignmentRow &&
          (line.startsWith("--") || line.startsWith(":-"))
        ) {
          const data = line.split("|");
          alignments = data.map((x) =>
            x.startsWith(":")
              ? "left"
              : x.indexOf(":") !== -1
              ? "right"
              : "center",
          );
          alignmentRow = false;
        } else if (inTable) {
          const data = line.split("|");
          output.push('<tr class="combat_result_teams_heading">');
          data.forEach((d, i) =>
            output.push(`<td style="text-align: ${alignments[i]}">${d}</td>`),
          );
          output.push("</tr>");
        } else {
          output.push(line);
          if (linen < lines.length - 1) {
            output.push("<br>");
          }
        }
      }
      return output.join("\n");
    };
    let npui = NeptunesPride.npui;
    NeptunesPride.templates["n_p_a"] = "NP Agent";
    NeptunesPride.templates["npa_report_type"] = "Report Type:";
    NeptunesPride.templates["npa_paste"] = "Intel";
    let superNewMessageCommentBox = npui.NewMessageCommentBox;

    let reportPasteHook = function (_e: any, _d: any) {
      let inbox = NeptunesPride.inbox;
      inbox.commentDrafts[inbox.selectedMessage.key] += "\n" + getClip();
      inbox.trigger("show_screen", "diplomacy_detail");
    };
    NeptunesPride.np.on("paste_report", reportPasteHook);
    npui.NewMessageCommentBox = function () {
      let widget = superNewMessageCommentBox();
      let reportButton = Crux.Button("npa_paste", "paste_report", "intel").grid(
        10,
        12,
        4,
        3,
      );
      reportButton.roost(widget);
      return widget;
    };
    const npaReports = function (_screenConfig: any) {
      npui.onHideScreen(null, true);
      npui.onHideSelectionMenu();

      npui.trigger("hide_side_menu");
      npui.trigger("reset_edit_mode");
      var reportScreen = npui.Screen("n_p_a");

      Crux.Text("", "rel pad12 txt_center col_black  section_title")
        .rawHTML(title)
        .roost(reportScreen);

      var report = Crux.Widget("rel  col_accent").size(480, 48);
      var output = Crux.Widget("rel").nudge(-24, 0);

      Crux.Text("npa_report_type", "pad12").roost(report);
      var selections = {
        research: "Research",
        trading: "Trading",
        planets: "Home Planets",
        fleets: "Fleets (short)",
        combats: "Fleets (long)",
        stars: "Stars",
        accounting: "Accounting",
        api: "API Keys",
        controls: "Controls",
      };
      Crux.DropDown(lastReport, selections, "exec_report")
        .grid(15, 0, 15, 3)
        .roost(report);

      let text = Crux.Text("", "pad12 rel txt_selectable").size(432).pos(48)

      .rawHTML("Choose a report from the dropdown.");
      text.roost(output);

      report.roost(reportScreen);
      output.roost(reportScreen);

      let reportHook = async function (e: number, d: string) {
        lastReport = d;
        if (d === "planets") {
          homePlanets();
        } else if (d === "fleets") {
          briefFleetReport();
        } else if (d === "combats") {
          longFleetReport();
        } else if (d === "stars") {
          starReport();
        } else if (d === "trading") {
          await tradingReport();
        } else if (d === "research") {
          await researchReport();
        } else if (d === "accounting") {
          await npaLedger();
        } else if (d === "controls") {
          npaControls();
        } else if (d === "api") {
          await apiKeys();
        }
        let html = getClip().replace(/\n/g, "<br>");
        html = NeptunesPride.inbox.hyperlinkMessage(html);
        text.rawHTML(html);
      };
      reportHook(0, lastReport);
      reportScreen.on("exec_report", reportHook);

      npui.activeScreen = reportScreen;
      npui.showingScreen = "new_fleet";
      npui.screenConfig = undefined;
      reportScreen.roost(npui.screenContainer);
      npui.layoutElement(reportScreen);
      return reportScreen;
    };
    const backMenu = npui.sideMenu.children[npui.sideMenu.children.length - 1];
    npui.sideMenu.removeChild(backMenu);
    npui
      .SideMenuItem("icon-eye", "n_p_a", "show_screen", "new_fleet")
      .roost(npui.sideMenu);
    npui
      .SideMenuItem("icon-left-open", "main_menu", "browse_to", "/")
      .roost(npui.sideMenu);

    const superNewFleetScreen = npui.NewFleetScreen;
    let showingOurUI = false;
    NeptunesPride.np.on(
      "show_screen",
      (_event: any, name: any, screenConfig: any) => {
        showingOurUI = name === "new_fleet" && screenConfig === undefined;
      },
    );
    npui.NewFleetScreen = (screenConfig: any) => {
      if (screenConfig === undefined) {
        return npaReports(screenConfig);
      } else {
        return superNewFleetScreen(screenConfig);
      }
    };

    let superFormatTime = Crux.formatTime;
    Crux.formatTime = function (
      ms: number,
      showMinutes: boolean,
      showSeconds: boolean,
    ) {
      if (settings.relativeTimes === "relative") {
        return superFormatTime(ms, showMinutes, showSeconds);
      } else if (settings.relativeTimes === "eta") {
        if (NeptunesPride.gameConfig.turnBased) {
          return msToTurnString(ms, "");
        }
        return msToEtaString(ms, "");
      } else if (settings.relativeTimes === "tick") {
        const rate = NeptunesPride.universe.galaxy.tick_rate * 60 * 1000;
        const tick = ms / rate;
        return `Tick #${Math.ceil(tick) + NeptunesPride.universe.galaxy.tick}`;
      } else if (settings.relativeTimes === "tickrel") {
        const rate = NeptunesPride.universe.galaxy.tick_rate * 60 * 1000;
        const tick = ms / rate;
        return `${Math.ceil(tick)} ticks`;
      }
    };
    const toggleRelative = function () {
      const i =
        (timeOptions.indexOf(settings.relativeTimes) + 1) % timeOptions.length;
      settings.relativeTimes = timeOptions[i];
      NeptunesPride.np.trigger("refresh_interface");
      NeptunesPride.np.trigger("map_rebuild");
    };
    defineHotkey(
      "%",
      toggleRelative,
      "Change the display of ETAs from relative times to absolute clock times. Makes predicting " +
        "important times of day to sign in and check much easier especially for multi-leg fleet movements. Sometimes you " +
        "will need to refresh the display to see the different times.",
      "Timebase",
    );

    if (window.chrome) {
      Object.defineProperty(Crux, "touchEnabled", { get: () => false });
      Object.defineProperty(NeptunesPride.npui.map, "ignoreMouseEvents", {
        get: () => false,
      });
    } else if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
      // safari: trackpad is available and works on iPads
      Crux.crux.onTouchDown = () => {
        Crux.touchEnabled = false;
      };
      Crux.crux.one("touchstart", Crux.crux.onTouchDown);
    }

    const fixSubmitButton = () => {
      if (NeptunesPride.gameConfig.turnBased) {
        let submitButton: any[] = jQuery(':contains("Submit Turn")');
        if (submitButton.length !== 9) {
          submitButton = jQuery(':contains("Submitted")');
        }
        if (
          submitButton.length === 9 &&
          submitButton[7] &&
          submitButton[7].style
        ) {
          submitButton[7].style.zIndex = 0;
          return true;
        }
        return false;
      }
      return true;
    };
    fixSubmitButton();
    NeptunesPride.np.on("refresh_interface", fixSubmitButton);

    hooksLoaded = true;
  };
  let toggleTerritory = function () {
    settings.territoryOn = !settings.territoryOn;
    NeptunesPride.np.trigger("map_rebuild");
  };
  defineHotkey(
    ")",
    toggleTerritory,
    "Toggle the territory display. Range and scanning for all stars of the selected empire are shown.",
    "Toggle Territory",
  );

  let toggleWhitePlayer = function () {
    const player = NeptunesPride.universe.player;
    settings.whitePlayer = !settings.whitePlayer;
    if (NeptunesPride.universe.player.origColor === undefined) {
      if (player.shape !== undefined) {
        player.origColor = colors[player.color];
        colors[player.color] = "#ffffff";
      } else {
        player.origColor = player.color;
        player.color = "#ffffff";
      }
    } else {
      const tmp = player.origColor;
      if (player.shape !== undefined) {
        player.origColor = colors[player.color];
        colors[player.color] = tmp;
      } else {
        player.origColor = player.color;
        player.color = tmp;
      }
    }
    recolorPlayers();
  };
  defineHotkey(
    "w",
    toggleWhitePlayer,
    "Toggle between my color and white on the map display.",
    "Whiteout",
  );
  const checkRecolor = () => {
    if (settings.whitePlayer) {
      settings.whitePlayer = false;
      toggleWhitePlayer();
    }
  };
  window.setTimeout(checkRecolor, 1000);

  let init = function () {
    if (NeptunesPride.universe?.galaxy && NeptunesPride.npui.map) {
      linkFleets();
      linkPlayerSymbols();
      console.log("Fleet linking complete.");
      if (!hooksLoaded) {
        loadHooks();
        console.log("HUD setup complete.");
      } else {
        console.log("HUD setup already done; skipping.");
      }
      recolorPlayers();
      homePlanets();
    } else {
      console.log(
        "Game not fully initialized yet; wait.",
        NeptunesPride.universe,
      );
    }
  };
  defineHotkey(
    "@",
    init,
    "Reinitialize Neptune's Pride Agent. Use the @ hotkey if the version is not being shown on the map after dragging.",
    "Reload NPA",
  );

  if (NeptunesPride.universe?.galaxy && NeptunesPride.npui.map) {
    console.log("Universe already loaded. Hyperlink fleets & load hooks.");
    init();
  } else {
    console.log("Universe not loaded. Hook onServerResponse.");
    let superOnServerResponse = NeptunesPride.np.onServerResponse;
    NeptunesPride.np.onServerResponse = function (response: { event: string }) {
      superOnServerResponse(response);
      if (response.event === "order:player_achievements") {
        console.log("Initial load complete. Reinstall.");
        init();
      } else if (response.event === "order:full_universe") {
        console.log("Universe received. Reinstall.");
        NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
        init();
      } else if (!hooksLoaded && NeptunesPride.npui.map) {
        console.log("Hooks need loading and map is ready. Reinstall.");
        init();
      }
    };
  }

  var otherUserCode: string | undefined = undefined;
  let game = NeptunesPride.gameNumber;
  let store = new GameStore(game);
  let switchUser = async function (_event?: any, data?: string) {
    if (NeptunesPride.originalPlayer === undefined) {
      NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
    }
    let code = data?.split(":")[1] || otherUserCode;
    otherUserCode = code;
    if (otherUserCode) {
      let scan = await getUserScanData(code);
      if (!cacheApiKey(code, scan)) return;
      NeptunesPride.np.onFullUniverse(null, scan);
      NeptunesPride.npui.onHideScreen(null, true);
      NeptunesPride.np.trigger("select_player", [
        NeptunesPride.universe.player.uid,
        true,
      ]);
      init();
    }
  };

  let cacheApiKey = function (code: string, scan: any) {
    if (scan?.player_uid >= 0) {
      let key = `API:${scan.player_uid}`;
      store.get(key).then((apiCode) => {
        if (!apiCode || apiCode !== otherUserCode) {
          store.set(key, code);
        }
      });
    } else {
      if (otherUserCode !== "badkey") {
        store.keys().then((allKeys: string[]) => {
          const apiKeys = allKeys.filter((x) => x.startsWith("API:"));
          apiKeys.forEach((key) => {
            store.get(key).then((apiCode) => {
              if (apiCode === code) {
                store.set(key, "badkey");
              }
            });
          });
        });
      }
      return false;
    }
    return true;
  };
  let mergeUser = async function (_event?: any, data?: string) {
    if (NeptunesPride.originalPlayer === undefined) {
      NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
    }
    const code = data?.split(":")[1] || otherUserCode;
    otherUserCode = code;
    if (otherUserCode) {
      let scan = await getUserScanData(code);
      if (!cacheApiKey(code, scan)) return;
      const universe = NeptunesPride.universe;
      universe.galaxy.stars = { ...scan.stars, ...universe.galaxy.stars };
      for (let s in scan.stars) {
        const star = scan.stars[s];
        if (star.v !== "0" && universe.galaxy.stars[s].v === "0") {
          universe.galaxy.stars[s] = { ...universe.galaxy.stars[s], ...star };
        }
      }
      for (let pk in universe.galaxy.players) {
        const player = universe.galaxy.players[pk];
        player.alias = player.rawAlias;
      }
      universe.galaxy.fleets = { ...scan.fleets, ...universe.galaxy.fleets };
      for (let f in scan.fleets) {
        const fleet = scan.fleets[f];
        if (fleet.puid == scan.player_uid) {
          universe.galaxy.fleets[f] = {
            ...universe.galaxy.fleets[f],
            ...fleet,
          };
        }
      }
      const tf = 1 - msToTick(1) / (scan.tick_rate * 60 * 1000);
      universe.galaxy.tick_fragment = tf;
      NeptunesPride.np.onFullUniverse(null, universe.galaxy);
      NeptunesPride.npui.onHideScreen(null, true);
      init();
    }
  };
  defineHotkey(
    ">",
    switchUser,
    "Switch views to the last user whose API key was used to load data. The HUD shows the current user when " +
      "it is not your own alias to help remind you that you aren't in control of this user.",
    "Next User",
  );
  defineHotkey(
    "|",
    mergeUser,
    "Merge the latest data from the last user whose API key was used to load data. This is useful after a tick " +
      "passes and you've reloaded, but you still want the merged scan data from two players onscreen.",
    "Merge User",
  );
  NeptunesPride.np.on("switch_user_api", switchUser);
  NeptunesPride.np.on("merge_user_api", mergeUser);

  let myApiKey = "";
  const recordAPICode = async function (_event: any, code: string) {
    let scan = await getUserScanData(code);
    if (!cacheApiKey(code, scan)) {
      console.error("Failed to load our own scan data?");
      myApiKey = "";
    } else {
      myApiKey = code;
    }
  };
  NeptunesPride.np.on("order:api_code", recordAPICode);
  let refreshScanData = async function () {
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    const playerIndexes = apiKeys.map((k) => parseInt(k.substring(4)));
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const apiKey = await store.get(apiKeys[pii]);
      getUserScanData(apiKey);
      const uid = playerIndexes[pii];
      if (NeptunesPride.originalPlayer && NeptunesPride.originalPlayer == uid) {
        myApiKey = apiKey;
      }
      if (
        !NeptunesPride.originalPlayer &&
        NeptunesPride.universe.player.uid == uid
      ) {
        myApiKey = apiKey;
      }
    }
  };
  NeptunesPride.np.on("refresh_interface", refreshScanData);

  const xlate: { [k: string]: string } = {
    bank: "Banking",
    manu: "Manu",
    prop: "Range",
    rese: "Exp",
    scan: "Scan",
    terr: "Terra",
    weap: "Weapons",
  };
  let translateTech = (name: string) => xlate[name.substring(0, 4)];

  let techTable = function (
    output: string[],
    playerIndexes: number[],
    title: string,
  ) {
    output.push(`--- ${title} ---`);
    let cols = ":--";
    for (let i = 0; i < playerIndexes.length; ++i) {
      cols += "|--";
    }
    output.push(cols);
    const me = NeptunesPride.universe.player.uid;
    cols = `Technology|[[#${me}]]|[[#${me}]]`;
    let allAmounts: { [k: number]: number } = {};
    let allSendAmounts: { [k: number]: number } = {};
    for (let i = 0; i < playerIndexes.length; ++i) {
      const pi = playerIndexes[i];
      if (pi === me) {
        continue;
      }
      cols += `|[[#${pi}]]`;
      allAmounts[pi] = 0;
      allSendAmounts[pi] = 0;
    }
    output.push(cols);
    const rows: string[] = [];
    const myTech = NeptunesPride.universe.player.tech;
    for (let i = 0; i < playerIndexes.length; ++i) {
      const pi = playerIndexes[i];
      if (pi === NeptunesPride.universe.player.uid) {
        continue;
      }
      const player = NeptunesPride.universe.galaxy.players[pi];
      const levels = player.tech;
      const techs = Object.keys(player.tech);
      techs.map((t, i) => {
        if (!rows[i]) {
          rows[i] = translateTech(t);
          rows[i] += `|${myTech[t].level}`;
          rows[i] += `|${myTech[t].research}/${
            myTech[t].brr * myTech[t].level
          }`;
        }
        const level = levels[t].level;
        if (level < myTech[t].level) {
          rows[i] += `|[[sendtech:${pi}:${t}:${level}]]`;
          for (let incs = level; incs < myTech[t].level; ++incs) {
            allSendAmounts[pi] +=
              (incs + 1) * NeptunesPride.gameConfig.tradeCost;
          }
        } else if (level > myTech[t].level) {
          const amount =
            (myTech[t].level + 1) * NeptunesPride.gameConfig.tradeCost;
          rows[i] += `|[[sendcash:${pi}:${amount}:${level}]]`;
          for (let incs = level; incs > myTech[t].level; --incs) {
            allAmounts[pi] += incs * NeptunesPride.gameConfig.tradeCost;
          }
        } else {
          rows[i] += `|${level}`;
        }
      });
    }
    let payFooter = [
      "Pay for all",
      "",
      "",
      ...Object.keys(allAmounts).map((pi: any) =>
        allAmounts[pi] > 0
          ? `[[sendcash:${pi}:${allAmounts[pi]}:${allAmounts[pi]}]]`
          : "",
      ),
    ];
    let sendFooter = [
      "Send all",
      "",
      "",
      ...Object.keys(allSendAmounts).map((pi: any) =>
        allSendAmounts[pi] > 0
          ? `[[sendalltech:${pi}:${allSendAmounts[pi]}]]`
          : "",
      ),
    ];
    rows.forEach((r) => output.push(r));
    output.push(payFooter.join("|"));
    output.push(sendFooter.join("|"));
    output.push(`--- ${title} ---`);
  };
  let tradingReport = async function () {
    lastReport = "trading";
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    const playerIndexes = apiKeys.map((k) => parseInt(k.substring(4)));
    let output: string[] = [];
    techTable(output, playerIndexes, "Allied Technology");
    let players = NeptunesPride.universe.galaxy.players;
    let allPlayers = Object.keys(players);
    let scanned = NeptunesPride.gameConfig.tradeScanned ? "Scanned " : "";
    if (NeptunesPride.gameConfig.tradeScanned) {
      allPlayers = allPlayers.filter(
        (k) =>
          NeptunesPride.universe.player.scannedPlayers.indexOf(
            players[k].uid,
          ) >= 0,
      );
    }
    const numPerTable = 5;
    for (let start = 0; start < allPlayers.length; ) {
      let subset = allPlayers.slice(start, start + numPerTable);
      let indexes = subset.map((k) => players[k].uid);
      techTable(
        output,
        indexes,
        `${scanned}Players ${start} - ${start - 1 + subset.length}`,
      );
      start += subset.length;
    }
    prepReport("technology", output.join("\n"));
  };
  defineHotkey(
    "e",
    tradingReport,
    "The trading report lets you review where you are relative to others and " +
      "provides shortcuts to ease trading of tech as needed.",
    "Trading",
  );

  NeptunesPride.sendTech = (recipient: number, tech: string) => {
    const universe = NeptunesPride.universe;
    const players = universe.galaxy.players;
    universe.selectedPlayer = players[recipient];
    const trade = NeptunesPride.npui.EmpireTrade(universe.selectedPlayer);
    trade.techSelection.setValue(tech);
    trade.onPreTradeTech();
  };

  NeptunesPride.sendAllTech = (recipient: number) => {
    NeptunesPride.templates["confirm_send_bulktech"] =
      "Are you sure you want to send<br>[[alias]]<br>[[techs]]?";
    const npui = NeptunesPride.npui;
    const player = NeptunesPride.universe.galaxy.players[recipient];
    let techs: string[] = [];
    const myTech = NeptunesPride.universe.player.tech;
    const levels = player.tech;
    techs = Object.keys(player.tech).filter(
      (t) => levels[t].level < myTech[t].level,
    );
    npui.trigger("hide_screen");
    var screenConfig = {
      message: "confirm_send_bulktech",
      messageTemplateData: {
        techs: techs.map(translateTech).join(", "),
        alias: player.colourBox + player.hyperlinkedRawAlias,
      },
      eventKind: "send_bulktech",
      eventData: {
        targetPlayer: player,
        techs,
      },
      notification: false,
      returnScreen: "empire",
    };
    npui.trigger("show_screen", ["confirm", screenConfig]);
  };
  const sendBulkTech = (
    _event: any,
    data: { targetPlayer: string; techs: string[] },
  ) => {
    const universe = NeptunesPride.universe;
    const np = NeptunesPride.np;
    var targetPlayer: any = data.targetPlayer;
    for (let i = 0; i < data.techs.length; ++i) {
      var name = data.techs[i];
      var price =
        (targetPlayer.tech[name].level + 1) * universe.galaxy.trade_cost;
      if (universe.player.cash >= price) {
        targetPlayer.tech[name].level += 1;
        universe.player.cash -= price;
        np.trigger("server_request", {
          type: "order",
          order: `share_tech,${targetPlayer.uid},${name}`,
        });
      }
    }
    universe.selectPlayer(targetPlayer);
    np.trigger("refresh_interface");
  };
  NeptunesPride.np.on("send_bulktech", sendBulkTech);
  NeptunesPride.sendCash = (recipient: number, credits: number) => {
    NeptunesPride.templates["confirm_send_cash"] =
      "Are you sure you want to send<br>[[alias]]<br>$[[amount]] credits?";
    const npui = NeptunesPride.npui;
    const player = NeptunesPride.universe.galaxy.players[recipient];
    npui.trigger("hide_screen");
    var screenConfig = {
      message: "confirm_send_cash",
      messageTemplateData: {
        amount: credits,
        alias: player.colourBox + player.hyperlinkedRawAlias,
      },
      eventKind: "send_money",
      eventData: {
        targetPlayer: player,
        amount: credits,
      },
      notification: false,
      returnScreen: "empire",
    };
    npui.trigger("show_screen", ["confirm", screenConfig]);
  };

  async function post(url: string, data: any): Promise<any> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      redirect: "follow",
      referrerPolicy: "no-referrer",
      body: new URLSearchParams(data).toString(),
    });
    return response.json(); // parses JSON response into native JavaScript objects
  }
  let getUserScanData = async function (apiKey: string) {
    const cacheKey = `CACHED_${apiKey}`;
    const cachedScan = await store.get(cacheKey);
    if (cachedScan) {
      const freshness = new Date().getTime() - cachedScan.now;
      const tickness =
        (1 - cachedScan.tick_fragment) * cachedScan.tick_rate * 60 * 1000;
      if (freshness < tickness && freshness < 60 * 5 * 1000) {
        return cachedScan;
      }
    }
    let params = {
      game_number: game,
      api_version: "0.1",
      code: apiKey,
    };
    let api = await post("https://np.ironhelmet.com/api", params);
    store.set(cacheKey, api.scanning_data);
    return api.scanning_data;
  };
  let researchReport = async function () {
    lastReport = "research";
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    const playerIndexes = apiKeys.map((k) => parseInt(k.substring(4)));
    let output: string[] = [];
    output.push("--- Alliance Research Progress ---");
    output.push(":--|:--|--:|--:|--:|--");
    output.push("Empire|Tech|ETA|Progress|Sci|↑S");
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const pi = playerIndexes[pii];
      const p = NeptunesPride.universe.galaxy.players[pi];
      const apiKey = await store.get(apiKeys[pii]);
      const scan = await getUserScanData(apiKey);
      if (scan) {
        const player = scan.players[pi];
        const tech = player.tech[player.researching];
        const soFar = tech.research;
        const total = tech.brr * tech.level;
        const remaining = total - soFar;
        const science = p.total_science;
        const tickIncr = Math.ceil(remaining / science);
        const tick = scan.tick + tickIncr;
        let upgrade = "";
        for (let i = 1; i < 10; ++i) {
          const betterTick = Math.ceil(remaining / (science + i));
          if (betterTick < tickIncr) {
            upgrade = `${i}`;
            break;
          }
        }
        const techName = translateTech(player.researching);
        output.push(
          `[[${pi}]]|${techName}|[[Tick #${tick}]]|${soFar}/${total}|${p.total_science}|${upgrade}`,
        );
      }
    }
    output.push("--- Alliance Research Progress ---");
    prepReport("research", output.join("\n"));
  };
  defineHotkey(
    "E",
    researchReport,
    "The research report shows you tech progress for allies. The ↑S column tells you how much science is needed to reduce delivery time by at least one tick.",
    "Research",
  );

  let npaLedger = async function () {
    lastReport = "accounting";
    const updated = await updateMessageCache("game_event");
    const preput: string[] = [];
    const output: string[] = [];
    if (!updated) {
      console.error("Updating message cache failed");
      output.push("Message cache stale!");
    } else {
      const balances: { [k: number]: number } = {};
      const levels: { [k: number]: number } = {};
      for (let puid in NeptunesPride.universe.galaxy.players) {
        const uid = puid as unknown as number;
        balances[uid] = 0;
        levels[uid] = 0;
      }
      output.push("--- Cash transaction history ---");
      output.push(":--|:--");
      for (let i = 0; i < messageCache.game_event.length; ++i) {
        const m = messageCache.game_event[i];
        if (m.payload.template === "money_sent") {
          const tick = m.payload.tick;
          const from = m.payload.from_puid;
          const to = m.payload.to_puid;
          const credits = m.payload.amount;
          if (from === NeptunesPride.universe.player.uid) {
            balances[to] -= credits;
          } else {
            balances[from] += credits;
          }
          if (from === NeptunesPride.universe.player.uid) {
            output.push(`[[Tick #${tick}]]|Sent $${credits} → [[${to}]]`);
          } else {
            output.push(`[[Tick #${tick}]]|[[${from}]] → $${credits}`);
          }
        }
      }
      output.push("--- Cash transaction history ---");
      output.push("--- Tech transaction history ---");
      output.push(":--|:--");
      for (let i = 0; i < messageCache.game_event.length; ++i) {
        const m = messageCache.game_event[i];

        if (m.payload.template === "shared_technology") {
          const tick = m.payload.tick;
          const from = m.payload.from_puid;
          const to = m.payload.to_puid;
          const credits = m.payload.price;
          const level = m.payload.level;
          if (from === NeptunesPride.universe.player.uid) {
            balances[to] -= credits;
            levels[to] -= level;
          } else {
            balances[from] += credits;
            levels[from] += level;
          }
          const name = m.payload.name;
          const xlated = translateTech(name);
          if (from === NeptunesPride.universe.player.uid) {
            output.push(
              `[[Tick #${tick}]]|${xlated}${level} $${credits} → [[${to}]]`,
            );
          } else {
            output.push(
              `[[Tick #${tick}]]|[[${from}]] → ${xlated}${level} $${credits}`,
            );
          }
        }
      }
      output.push("--- Tech transaction history ---");

      preput.push("--- Ledger ---");
      preput.push(":--|--:|--:");
      preput.push(`Empire|Tech Levels|Credits`);
      for (let p in balances) {
        if (balances[p] !== 0) {
          if (balances[p] > 0) {
            preput.push(
              `[[${p}]]|${levels[p]}|[[sendcash:${p}:${balances[p]}:${balances[p]}]]`,
            );
          } else {
            preput.push(`[[${p}]]|${levels[p]}|[[good:${balances[p]}]]`);
          }
        }
      }
      preput.push("--- Ledger ---\n");
    }
    prepReport("accounting", preput.join("\n") + output.join("\n"));
  };
  defineHotkey(
    "a",
    npaLedger,
    "Perform accounting and display status.",
    "Accounting",
  );

  let apiKeys = async function () {
    lastReport = "api";
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    const output = [];
    output.push("--- API Keys ---");
    output.push(":--|--:|--:");
    output.push("Empire|View|Merge");
    for (let i = 0; i < apiKeys.length; ++i) {
      const key = apiKeys[i];
      const player = key.substring(4);
      const code = await store.get(key);
      output.push(`[[${player}]]|[[apiv:${code}]]|[[apim:${code}]]`);
    }
    prepReport("api", output.join("\n"));
  };
  defineHotkey("k", apiKeys, "Show known API keys.", "API Keys");

  let mergeAllKeys = async function () {
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    for (let i = 0; i < apiKeys.length; ++i) {
      const key = apiKeys[i];
      otherUserCode = await store.get(key);
      mergeUser();
    }
  };
  defineHotkey(
    "(",
    mergeAllKeys,
    "Merge all data from known API keys.",
    "Merge All",
  );

  let npaHelp = function () {
    let help = [`<H1>${title}</H1>`];
    getHotkeys().forEach((key: string) => {
      let action = getHotkeyCallback(key);
      let button = Crux.format(`[[goto:${key}]]`, {});
      if (key === "?") button = Crux.format(`[[hotkey:${key}]]`, {});
      help.push(`<h2>Hotkey: ${key} ${button}</h2>`);
      if (action.help) {
        help.push(action.help);
      } else {
        help.push(
          `<p>No documentation yet.<p><code>${action.toLocaleString()}</code>`,
        );
      }
    });
    NeptunesPride.universe.helpHTML = help.join("");
    NeptunesPride.np.trigger("show_screen", "help");
  };
  defineHotkey("?", npaHelp, "Display this help screen.", "NPA Help");

  let npaControls = function () {
    const output: string[] = [];
    output.push("--- Controls ---");
    output.push(":--|--:");
    let partial = "";
    getHotkeys().forEach((key: string) => {
      let action = getHotkeyCallback(key);
      let control = Crux.format(`[[goto:${key}]]`, {});
      if (key === "?") control = Crux.format(`[[hotkey:${key}]]`, {});
      partial += control;
      if (partial.indexOf("|") === -1) {
        partial += "|";
      } else {
        output.push(partial);
        partial = "";
      }
    });
    prepReport("controls", output.join("\n"));
    output.push("--- Controls ---");
  };
  defineHotkey("~", npaControls, "Generate NPA Buttons.", "Controls");

  var autocompleteCaret = 0;
  let autocompleteTrigger = function (e: KeyboardEvent) {
    const target: any = e.target;
    if (target.type === "textarea") {
      const key = e.key;
      if (key === "]" || key === ":") {
        if (autocompleteCaret <= 0) {
          autocompleteCaret = target.value.lastIndexOf("[[") + 2;
          if (autocompleteCaret <= 1) {
            autocompleteCaret = 0;
            return;
          }
          const completed = target.value.indexOf("]]", autocompleteCaret) > -1;
          if (completed) {
            autocompleteCaret = 0;
            return;
          }
        }
        let start = autocompleteCaret;
        let endBracket = target.value.indexOf("]", start);
        if (endBracket === -1) endBracket = target.value.length;
        let autoString = target.value.substring(start, endBracket);
        autocompleteCaret = 0;
        let m = autoString.match(/^[0-9][0-9]*$/);
        if (m?.length) {
          let puid = Number(autoString);
          let end = target.selectionEnd;
          let auto = `${puid}]] ${NeptunesPride.universe.galaxy.players[puid].alias}`;
          target.value =
            target.value.substring(0, start) +
            auto +
            target.value.substring(end, target.value.length);
          target.selectionStart = start + auto.length;
          target.selectionEnd = start + auto.length;
        }
        m = autoString.match(/api:/);
        if (m?.length && myApiKey) {
          let auto = `api:${myApiKey}]]`;
          let end = target.selectionEnd;
          target.value =
            target.value.substring(0, start) +
            auto +
            target.value.substring(end, target.value.length);
          target.selectionStart = start + auto.length;
          target.selectionEnd = start + auto.length;
        }
      } else if (target.selectionStart > 1) {
        let start = target.selectionStart - 2;
        let ss = target.value.substring(start, start + 2);
        autocompleteCaret = ss === "[[" ? target.selectionStart : 0;
      }
    }
  };
  document.body.addEventListener("keyup", autocompleteTrigger);

  updateMessageCache("game_event");

  const wst = window.setTimeout;
  const timeoutCatcher = (
    callback: TimerHandler,
    time?: number,
    ...args: any[]
  ): number => {
    if (callback.toLocaleString().indexOf("autocompleteTrigger") !== -1) {
      console.log("SAT duplicate code detected. Ignore it.");
      return 0;
    }
    return wst(callback, time, args);
  };
  window.setTimeout = timeoutCatcher as any;

  console.log("Neptune's Pride Agent injection fini.");
}

NeptunesPrideAgent();
