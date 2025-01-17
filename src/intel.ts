// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @version     1.18
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==

import { computeAlliances } from "./alliances";
import { setupAutocomplete } from "./autocomplete";
import { BspTree } from "./bsp";
import {
  type StarState,
  alliedFleet,
  combatInfo,
  combatOutcomes,
  fleetOutcomes,
  getWeaponsLevel,
  handicapString,
  tickNumber,
} from "./combatcalc";
import { getTemplates, getUI } from "./dynamic";
import {
  anyEventsNewerThan,
  isNP4,
  messageCache,
  messageIndex,
  restoreFromDB,
  updateMessageCache,
} from "./events";
import { registerForScans } from "./firestore";
import {
  FleetOrder,
  type Player,
  type ScannedStar,
  type ScanningData,
  type Star,
  type TechKey,
  addAccessors,
  dist,
  getPlayerUid,
  getRangeValue,
  getScanValue,
  getTech,
  isVisible,
  productionTicks,
  techCost,
  turnJumpTicks,
} from "./galaxy";
import { GameStore, type TypedProperty } from "./gamestore";
import {
  defineHotkey,
  getClip,
  getHotkey,
  getHotkeyCallback,
  getHotkeys,
  setClip,
} from "./hotkey";
import { safe_image_url, youtube } from "./imageutils";
import { logCount, logError } from "./logging";
import { get } from "./network";
import { clone, patch } from "./patch";
import { politicalMap } from "./politicalMap";
import {
  type Filter,
  type Stanzas,
  and,
  contains,
  makeReportContent,
  or,
} from "./reports";
import { TickIterator, getCodeFromApiText } from "./scans";
import {
  type CachedScan,
  getCacheForKey,
  getLastRecord,
  scanInfo,
  scansExist,
  unloadServerScans,
  watchForBlocks,
} from "./timemachine";
import { calcSpeedBetweenStars, futureTime, resetAliases } from "./timetravel";
/* global Crux, NeptunesPride, jQuery, */
import { getVersion } from "./version.js";
import { getWithinRange } from "./visibility";

export let allSeenKeys: string[] = [];
interface CruxLib {
  touchEnabled: boolean;
  crux: any;
  format: any;
  formatTime: any;
  templates: { [k: string]: string };
  tickCallbacks: any[];
}
export interface NeptunesPrideData {
  sendAllTech: (recipient: number) => void;
  sendTech: (recipient: number, tech: string) => void;
  sendCash: (recipient: number, price: number) => void;
  gameVersion: string;
  version: any;
  inbox: any;
  universe: any;
  gameNumber: any;
  gameId?: any;
  np: any;
  npui: any;
  originalPlayer: any;
  account: any;
  crux: any;
}

export function getGameNumber() {
  return NeptunesPride.gameNumber || NeptunesPride.gameId;
}
declare global {
  var jQuery: any;
  var NeptunesPride: NeptunesPrideData;
  var Crux: CruxLib;
  interface String {
    format(...args: any[]): string;
  }
}

async function NeptunesPrideAgent() {
  window.addEventListener("error", logError);
  window.addEventListener("unhandledrejection", logError);

  const title = getVersion();
  const version = title.replace(/^.*v2/, "v2");
  console.log(title);

  const UI = await getUI();
  const templates = await getTemplates();

  const settings: GameStore = new GameStore("global_settings");

  settings.newSetting("IBB API Key", "ibbApiKey", "");
  type AllianceOptionsT = "color" | "shape";
  const allianceOptions: AllianceOptionsT[] = ["color", "shape"];
  settings.newSetting(
    "Alliances by:",
    "allianceDiscriminator",
    allianceOptions[0],
    allianceOptions,
  );
  type TimeOptionsT = "relative" | "eta" | "tick" | "tickrel";
  const timeOptions: TimeOptionsT[] = ["relative", "eta", "tickrel", "tick"];
  settings.newSetting(
    "Time Base",
    "relativeTimes",
    timeOptions[0],
    timeOptions,
  );
  settings.newSetting("Territory Display", "territoryOn", true, [true, false]);
  settings.newSetting("Map Names Display", "mapnamesOn", true, [true, false]);
  settings.newSetting("Recolor me", "whitePlayer", false, [false, true]);
  settings.newSetting(
    "Territory Style",
    "territoryBrightness",
    1,
    [0, 1, 2, 3],
  );
  settings.newSetting("Auto Ruler Power", "autoRulerPower", 1);
  settings.newSetting(
    "Custom Colors",
    "customColors",
    "#3b55ce #79fffe #13ca91 #fec763 #ff8b8b #ffaa01 #fea0fe #ce96fb",
  );
  settings.newSetting("Route Planner Display", "routePlanOn", false, [
    true,
    false,
  ]);
  settings.newSetting("Invasion Planner Display", "invasionPlanOn", false, [
    true,
    false,
  ]);

  if (!String.prototype.format) {
    String.prototype.format = function (...args) {
      return this.replace(/{(\d+)}/g, (match: string, index: number) => {
        if (typeof args[index] === "number") {
          return Math.trunc(args[index] * 1000) / 1000;
        }
        return typeof args[index] != "undefined" ? args[index] : match;
      });
    };
  }

  function onTrigger(trigger: string, fn: any) {
    if (
      window?.NeptunesPride?.np?.ui?.on &&
      NeptunesPride.universe?.galaxy?.players
    ) {
      NeptunesPride.crux.ui.on(trigger, fn);
      if (trueTick === 0) {
        recordTrueTick(undefined, NeptunesPride.universe.galaxy);
        window.setTimeout(() => {
          NeptunesPride.np.trigger("map_rebuild");
        }, 500);
      }
    } else {
      if ((window?.NeptunesPride as any).MetaGame) {
        console.log(`In metagame screen, stop; trigger ${trigger}`);
        return;
      }
      console.log(`NP not initialized yet, defer trigger for ${trigger}`);
      window.setTimeout(() => onTrigger(trigger, fn), 100);
    }
  }

  const linkFleets = () => {
    const universe = NeptunesPride.universe;
    const fleets = NeptunesPride.universe.galaxy.fleets;

    for (const f in fleets) {
      const fleet = fleets[f];
      const fleetLink = `<a onClick='NeptunesPride.crux.trigger(\"show_fleet_uid\", \"${fleet.uid}\")'>${fleet.n}</a>`;
      universe.hyperlinkedMessageInserts[fleet.n] = fleetLink;
    }
    universe.hyperlinkedMessageInserts[":carrier:"] =
      '<span class="icon-rocket"></span>';
    universe.hyperlinkedMessageInserts[":star:"] =
      '<span class="icon-star-1"></span>';
    universe.hyperlinkedMessageInserts[":mail:"] =
      '<span class="icon-mail"></span>';
  };
  const linkPlayerSymbols = () => {
    const universe = NeptunesPride.universe;
    const offset = isNP4() ? 1 : 0;
    for (let i = 0 + offset; i < 64 + offset; ++i) {
      if (
        universe.hyperlinkedMessageInserts[i] ||
        universe.galaxy.players[i] !== undefined
      ) {
        const player = NeptunesPride.universe.galaxy.players[i];
        universe.hyperlinkedMessageInserts[`${i}`] =
          universe.hyperlinkedMessageInserts[i] =
            player.hyperlinkedBox + player.hyperlinkedRawAlias;

        universe.hyperlinkedMessageInserts[`#${i}`] = player.hyperlinkedBox;
      }
    }
  };

  let lastReport = "planets";
  let showingOurUI = false;
  let showingNPA = false;
  let showingOurOptions = false;
  let reportSelector: any = null;
  let filterContent = "";
  let filterInput: any = null;
  const showUI = () => NeptunesPride.npui.trigger("show_npa", "npa_ui_screen");
  const showOptions = (options?: any) => {
    NeptunesPride.npui.trigger("show_npa", [
      "npa_ui_screen",
      { kind: "npa_options", ...options },
    ]);
  };
  const configureColours = (options?: any) => {
    NeptunesPride.npui.trigger("show_npa", [
      "npa_ui_screen",
      { kind: "npa_colours", ...options },
    ]);
  };
  let destinationLock: ScannedStar | undefined = undefined;
  let routeParents = undefined;
  let routeChildren = undefined;

  const prepReport = (
    reportName: string,
    stanzas: (string | string[])[],
    opt_filter?: Filter,
  ) => {
    const showingMenu = NeptunesPride.npui.npaMenu?.isShowing;
    let filter: Filter | undefined = opt_filter;
    if (showingMenu) {
      showUI();
    }
    if (
      showingOurUI &&
      reportSelector &&
      reportName !== reportSelector.getValue()
    ) {
      reportSelector.setValue(reportName);
      reportSelector.onChange();
    }
    if (filterInput !== null) {
      const content = filterInput.getValue().toLowerCase();
      filterContent = content;
      const containsPlayer = (s: string) => {
        const players = NeptunesPride.universe.galaxy.players;
        const filters = [];
        for (const pi in players) {
          const player = players[pi];
          if (player.alias.toLowerCase().indexOf(s) !== -1) {
            filters.push(contains(`[[${pi}]]`));
            filters.push(contains(`[[#${pi}]]`));
          }
        }
        return filters.reduce(or, () => false);
      };
      const contentFilter = or(contains(content), containsPlayer(content));
      if (content) {
        if (filter) {
          filter = and(filter, contentFilter);
        } else {
          filter = contentFilter;
        }
      }
    }
    lastReport = reportName;
    setClip(makeReportContent(stanzas, filter, (s) => s.toLowerCase()));
  };
  defineHotkey(
    "`",
    showUI,
    "Bring up the NP Agent UI." +
      "<p>The Agent UI will show you the last report you put on the clipboard or viewed.",
    "Open NPA UI",
  );
  defineHotkey(
    "ctrl+`",
    showOptions,
    "Bring up the NP Agent Options." +
      "<p>The Agent Options lets you customize advanced settings." +
      "<p>In particular, if you want to upload screenshots, get an API " +
      "key from api.imgbb.com and put it in the settings.",
    "Open Options",
  );
  defineHotkey(
    "ctrl+a",
    configureColours,
    "Configure colours and alliances." +
      "<p>You can set the colour of every player in the game to a " +
      "different value than the default, and if you wish you can " +
      "use the same colour for multiple players to configure who " +
      "you think is allied with who in order to get better reports " +
      "and a map that reflects the alliances in your game.",
    "Colours",
  );

  function starReport() {
    const players = NeptunesPride.universe.galaxy.players;
    const stars = NeptunesPride.universe.galaxy.stars;
    const fleets = NeptunesPride.universe.galaxy.fleets;
    const shipCounts: { [k: string]: number } = {};
    for (const k in NeptunesPride.universe.galaxy.players) {
      shipCounts[k] = 0;
    }
    for (const f in fleets) {
      const fleet = fleets[f];
      const orbiting =
        fleet?.ouid === undefined || (isNP4() && fleet?.ouid === 0);
      if (fleet.o && fleet.o.length > 0 && orbiting) {
        shipCounts[fleet.puid] += fleet.st;
      }
    }

    let output: Stanzas = [];
    const sortedStars = Object.keys(stars);
    sortedStars.sort((a, b) => stars[b].st - stars[a].st);
    for (const p in players) {
      const playerOutput: Stanzas = [];
      let grandTotalShips = 0;
      playerOutput.push(["[[{0}]]".format(p)]);
      for (const s of sortedStars) {
        const star = stars[s];
        if (star.puid == p && star.shipsPerTick >= 0 && isVisible(star)) {
          playerOutput.push([
            "  [[#{5}]] [[{0}]] {1}/{2}/{3} {4} ships".format(
              star.n,
              star.e,
              star.i,
              star.s,
              star.totalDefenses,
              p,
            ),
          ]);
          grandTotalShips += star.totalDefenses;
        }
      }
      if (playerOutput.length > 1) {
        const total = grandTotalShips + shipCounts[p];
        playerOutput[0] = [
          `[[${p}]] ${grandTotalShips} + ${shipCounts[p]} in flight (${total}/${players[p].total_strength})`,
        ];
        output = output.concat(playerOutput);
      }
    }
    prepReport("stars", output);
  }
  defineHotkey(
    "*",
    starReport,
    "Generate a report on all stars in your scanning range, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "stars",
  );

  function ownershipReport() {
    let output = [];
    const explorers = [];
    const endTick = NeptunesPride.universe.galaxy.tick;
    const scale = filterInput !== null ? 5 : 1;
    let currentTick = Math.max(endTick - scale * productionTicks(), 1);
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : getPlayerUid(NeptunesPride.universe.galaxy);

    timeTravelTickCaches = {};
    output.push(
      `Star ownership changes from [[Tick #${currentTick}]] to [[Tick #${endTick}]]:`,
    );
    explorers.push(
      `Exploration report from [[Tick #${currentTick}]] to [[Tick #${endTick}]]:`,
    );
    const abandoned: { [k: string]: boolean } = {};
    let prior = null;
    const ticks = new TickIterator(getMyKeys(), myId);
    while (ticks.hasNext() && currentTick <= endTick) {
      ticks.next();
      const scanData = ticks.getScanData();
      if (scanData.tick < currentTick) continue;
      if (scanData.tick === currentTick) {
        const newStars = scanData.stars;
        if (prior === null) prior = clone(newStars);
        const tick = scanData.tick;
        for (const k in newStars) {
          const nameOwner = (uid: any) =>
            uid !== -1 && uid !== undefined ? `[[${uid}]]` : "Abandoned";
          const unowned = (uid: any) => uid === undefined || uid === -1;
          if (
            prior[k]?.puid !== newStars[k]?.puid &&
            (!unowned(prior[k]?.puid) || abandoned[k])
          ) {
            if (newStars[k]?.puid === -1) {
              abandoned[k] = true;
            }
            const oldOwner = nameOwner(prior[k]?.puid);
            const newOwner = nameOwner(newStars[k]?.puid);
            output.push(
              `[[Tick #${tick}]] ${oldOwner} →  ${newOwner} [[${newStars[k].n}]]`,
            );
          } else if (prior[k]?.puid !== newStars[k]?.puid) {
            const newOwner = nameOwner(newStars[k]?.puid);
            if (!unowned(newStars[k]?.puid)) {
              explorers.push(
                `[[Tick #${tick}]]  ${newOwner} [[${newStars[k].n}]]`,
              );
            }
          }
          if (prior[k]?.puid !== newStars[k]?.puid) {
            prior[k] = { ...newStars[k] };
          }
        }
      }
      currentTick++;
    }
    if (output.length === 1 && explorers.length === 1) {
      output.push("No API data found");
    }
    if (output.length === 1) {
      output = explorers;
    }
    prepReport(
      "ownership",
      output.map((s) => [s]),
    );
  }
  defineHotkey(
    ";",
    ownershipReport,
    "Generate a report changes in star ownership and copy to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "ownership",
  );

  function tradeActivityReport() {
    const output = [];
    output.push("Trading Activity:");
    let currentTick = 1;
    let bestSize = 0;
    let code = "";
    for (const k in scanInfo) {
      const size = scanInfo[k].lastTick - scanInfo[k].firstTick;
      if (size > bestSize) {
        bestSize = size;
        code = k;
      }
    }
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : getPlayerUid(NeptunesPride.universe.galaxy);
    const ticks = new TickIterator(getMyKeys(), myId);
    while (ticks.hasNext()) {
      ticks.next();
      let scan = clone(ticks.getScanData());
      if (scan.tick === undefined) continue;
      const cachedScan: CachedScan = ticks.getScanRecord();
      let players = clone(scan.players);
      let bsp = new BspTree(scan.stars);
      let bspStars = { ...scan.stars };
      if (scan.tick < currentTick) continue;
      currentTick = scan.tick;
      if (cachedScan) {
        const diff = cachedScan;
        let memoStars: any = null;
        let memo: { [k: string]: boolean } = {};
        const sees = (sourceS: string, sinkS: string) => {
          const source = Number.parseInt(sourceS);
          if (memoStars !== scan.stars) {
            memo = {};
            memoStars = scan.stars;
          }
          const key = `${source}->${sinkS}`;
          if (memo[key] !== undefined) {
            return memo[key];
          }
          const allStars = Object.keys(memoStars);
          const sourceStars = [];
          for (const k of allStars) {
            if (memoStars[k].puid === source) {
              sourceStars.push(memoStars[k]);
            }
            if (bspStars[k] === undefined) {
              bspStars = { ...memoStars };
              bsp = new BspTree(bspStars);
            }
          }
          const scanRange = getScanValue(scan.players[source]);
          const scannedStars = bsp.findMany(sourceStars, scanRange);
          for (const puid in scan.players) {
            memo[`${source}->${puid}`] = false;
          }
          for (const sk of scannedStars) {
            const star = memoStars[sk.uid];
            memo[`${source}->${star.puid}`] = true;
            //console.log(`for ${source} calculated ${star.puid} is visible`);
          }
          return memo[key];
        };
        if (diff.forward?.tick !== undefined) {
          if (diff.forward.tick - currentTick > 1) {
            console.log(`Jump from ${currentTick} to ${diff.forward.tick}`);
          }
          currentTick = diff.forward.tick;
        }
        scan = patch(scan, diff.forward) as ScanningData;
        if (diff.forward?.players !== undefined) {
          const sameTick = diff.forward.tick === undefined;
          if (sameTick) {
            for (const k in players) {
              const p = diff.forward.players?.[k];
              if (p?.tech) {
                for (const tk in p.tech) {
                  const level = p.tech[tk].level;
                  if (level === undefined) continue; // happens with FAs
                  const tech = translateTech(tk);
                  let sourceString = "";
                  let faSources = "";
                  for (const op in scan.players) {
                    if (op !== k) {
                      if (scan.players[op].tech[tk].level >= level) {
                        if (!tradeScanned() || sees(op, k)) {
                          sourceString += ` [[#${op}]]`;
                        } else if (tradeScanned()) {
                          faSources += ` [[#${op}]]`;
                        }
                      }
                    }
                  }
                  output.push(
                    `[[Tick #${currentTick}]] [[${k}]] ← ${tech}${level} from ${sourceString}`,
                  );
                }
              }
            }
            players = patch(players, diff.forward.players);
          }
        }
      }
    }
    if (output.length === 1) {
      output.push("No trade activity data found");
    }
    prepReport(
      "tradeactivity",
      output.map((s) => [s]),
    );
  }
  defineHotkey(
    "ctrl+;",
    tradeActivityReport,
    "Generate a report on all definite trade activity between empires.",
    "tradeactivity",
  );

  function combatActivityReport() {
    const output = [];
    output.push("Probable Combat Activity:");
    const ticks = new TickIterator(getMyKeys());
    while (ticks.hasNext()) {
      ticks.next();
      const scan = ticks.getScanData();
      const scanRecord: CachedScan = ticks.getScanRecord();
      if (scanRecord.forward !== undefined) {
        const changedPlayers = scanRecord.forward.players;
        let combatants = "";
        let countCombatants = 0;
        for (const k in changedPlayers) {
          const p = clone(changedPlayers[k]);
          if (isNP4()) {
            addAccessors(p.alias, p);
            if (scan.players[k].total_stars === undefined) {
              addAccessors(scan.players[k].alias, scan.players[k]);
            }
          }
          if (p.total_strength) {
            const newSt = p.total_strength;
            const oldSt = scan.players[k].total_strength;
            if (newSt < oldSt) {
              combatants += `[[#${k}]] `;
              countCombatants++;
              //output.push(`[[Tick #${tick}]] [[${k}]] ${oldSt} -> ${newSt}`);
            }
          }
        }
        if (combatants) {
          if (countCombatants <= 2) {
            combatants = combatants
              .replaceAll("#", "")
              .replaceAll("] [", "] vs [");
          }
          output.push(`[[Tick #${scan.tick}]] ${combatants}`);
        }
      }
    }
    if (output.length === 1) {
      output.push("No combat activity data found");
    }
    prepReport(
      "combatactivity",
      output.map((s) => [s]),
    );
  }
  defineHotkey(
    "ctrl+'",
    combatActivityReport,
    "Generate a report on all probable combat between empires.",
    "combatactivity",
  );

  function faReport() {
    const output = computeAlliances(allSeenKeys);
    prepReport(
      "fa",
      output.map((s) => [s]),
    );
  }
  defineHotkey(
    "ctrl+7",
    faReport,
    "Generate a report of observed Formal Alliance pairs." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "fa",
  );

  interface Costs {
    originalStar: ScannedStar & Costs;
    player: Player;
    uce: number;
    uci: number;
    ucs: number;
    ucg: number;
    totaluce: number;
    totaluci: number;
    totalucs: number;
    totalucg: number;
  }
  function buyAllTheInfra(
    filteredStars: ScannedStar[],
    techType: "terra" | "bank" | "none",
    buy: "E" | "I" | "S",
  ) {
    const universe = NeptunesPride.universe;
    let allMyStars: (ScannedStar & Costs)[] = filteredStars.map((s) => {
      const r: Star & Costs = {
        ...s,
        originalStar: s as ScannedStar & Costs,
        player: universe.player,
        uce: 0,
        uci: 0,
        ucs: 0,
        ucg: 0,
        totaluce: 0,
        totaluci: 0,
        totalucs: 0,
        totalucg: 0,
      };
      r.originalStar.uce = r.uce = universe.calcUCE(r);
      r.originalStar.uci = r.uci = universe.calcUCI(r);
      r.originalStar.ucs = r.ucs = universe.calcUCS(r);
      r.originalStar.ucg = r.ucg = universe.calcUCG(r);
      if (r.uce === 0 || r.uci === 0 || r.ucs === 0)
        throw `Cost unset on star ${r.n}`;
      return r;
    });
    const cc = (a: any, b: any) => {
      if (buy === "I") return a.uci - b.uci;
      if (buy === "S") return a.ucs - b.ucs;
      return a.uce - b.uce;
    };
    if (techType === "terra") {
      allMyStars = allMyStars.map((s) => {
        return { ...s, r: s.r + 5 };
      });
      for (const s of allMyStars) {
        s.uce = universe.calcUCE(s);
        s.uci = universe.calcUCI(s);
        s.ucs = universe.calcUCS(s);
        s.ucg = universe.calcUCG(s);
      }
    }
    allMyStars = allMyStars.sort(cc);
    const HEAD = 0;
    let count = 0;
    while (
      allMyStars[HEAD].uce <= universe.player.cash &&
      HEAD < allMyStars.length
    ) {
      if (buy === "E") {
        allMyStars[HEAD].totaluce += allMyStars[HEAD].uce;
        universe.upgradeEconomy(allMyStars[HEAD]);
      }
      if (buy === "I") {
        allMyStars[HEAD].totaluci += allMyStars[HEAD].uci;
        universe.upgradeIndustry(allMyStars[HEAD]);
      }
      if (buy === "S") {
        allMyStars[HEAD].totalucs += allMyStars[HEAD].ucs;
        universe.upgradeScience(allMyStars[HEAD]);
      }
      count++;
      allMyStars = allMyStars.sort(cc);
    }
    if (techType === "bank") {
      universe.player.cash += 75;
    }
    return { count, allMyStars };
  }
  function buyAllTheHypotheticalEconomy(
    techType: "terra" | "bank" | "none",
    buy: "E" | "I" | "S",
  ) {
    const universe = NeptunesPride.universe;
    const galaxy = universe.galaxy;
    const me = { ...universe.player };
    const myUid = me.uid;
    const allMyStars: ScannedStar[] = Object.keys(galaxy.stars)
      .map((k) => {
        return { ...galaxy.stars[k] };
      })
      .filter((s) => s.puid === myUid);
    return buyAllTheInfra(allMyStars, techType, buy).count;
  }
  async function economistReport() {
    const output = [];
    const universe = NeptunesPride.universe;
    const me = { ...universe.player };
    const myUid = me.uid;
    const originalCash = me?.cash;
    const myCash = me?.cash || 1000;
    universe.player.cash = myCash;
    const preEcon = universe.player.total_economy;
    const preInd = universe.player.total_industry;
    const preSci = universe.player.total_science;
    const buyAllTheThings = (
      balance: number,
      techType: "terra" | "bank" | "none",
    ) => {
      universe.player.cash = balance;
      const e = buyAllTheHypotheticalEconomy(techType, "E");
      universe.player.cash = balance;
      const i = buyAllTheHypotheticalEconomy(techType, "I");
      universe.player.cash = balance;
      const s = buyAllTheHypotheticalEconomy(techType, "S");
      return { e, i, s };
    };
    if (!isNP4()) {
      output.push(`--- Economists Report for [[${myUid}]] ($${myCash}) ---`);
      output.push(`:--|--:|--:`);
      output.push(`Technology|New Income (Balance)|Buys one of E/I/S`);
      let count = buyAllTheHypotheticalEconomy("none", "E");
      let cost = myCash - universe.player.cash;
      let newIncome = count * 10;
      let balance =
        universe.player.total_economy * 10 +
        universe.player.cash +
        getTech(universe.player, "banking").level * 75;
      let { e, i, s } = buyAllTheThings(balance, "none");
      output.push([`No Tech|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
      universe.player.cash = myCash;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("bank", "E");
      cost = myCash - universe.player.cash + 75;
      newIncome = count * 10 + 75;
      balance =
        universe.player.total_economy * 10 +
        universe.player.cash +
        getTech(universe.player, "banking").level * 75;
      ({ e, i, s } = buyAllTheThings(balance, "bank"));
      output.push([`Banking|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
      const bankCost = tradeCostForLevel(
        getTech(universe.player, "banking").level + 1,
      );
      universe.player.cash = myCash - bankCost;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("bank", "E");
      cost = myCash - universe.player.cash + 75;
      newIncome = count * 10 + 75;
      balance =
        universe.player.total_economy * 10 +
        universe.player.cash +
        getTech(universe.player, "banking").level * 75;
      ({ e, i, s } = buyAllTheThings(balance, "bank"));
      output.push([
        `Buy it ($${bankCost})|$${newIncome} ($${balance})|${e}/${i}/${s}`,
      ]);
      universe.player.cash = myCash;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("terra", "E");
      cost = myCash - universe.player.cash;
      newIncome = count * 10;
      balance =
        universe.player.total_economy * 10 +
        universe.player.cash +
        getTech(universe.player, "banking").level * 75;
      ({ e, i, s } = buyAllTheThings(balance, "terra"));
      output.push([`Terraforming|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
      const terraCost = tradeCostForLevel(
        getTech(universe.player, "terraforming").level + 1,
      );
      universe.player.cash = myCash - terraCost;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("terra", "E");
      cost = myCash - universe.player.cash;
      newIncome = count * 10;
      balance =
        universe.player.total_economy * 10 +
        universe.player.cash +
        getTech(universe.player, "banking").level * 75;
      ({ e, i, s } = buyAllTheThings(balance, "terra"));
      output.push([
        `Buy it ($${terraCost})|$${newIncome} ($${balance})|${e}/${i}/${s}`,
      ]);
      output.push(`--- Economists Report for [[${myUid}]] (${myCash}) ---`);
      //output.push(`Bought ${count} economy for ${cost} using terraforming with ${universe.player.cash} left over.`)
    } else if (isNP4() && NeptunesPride.universe.galaxy.config.noTer === 0) {
      output.push(`--- Economists Report for [[${myUid}]] ($${myCash}) ---`);
      output.push(`:--|--:|--:`);
      output.push(`Technology|New Income (Balance)|Buys one of E/I/S`);
      let count = buyAllTheHypotheticalEconomy("none", "E");
      let newIncome =
        count * (10 + 2 * getTech(universe.player, "banking").level);
      let balance =
        universe.player.total_economy *
          (10 + 2 * getTech(universe.player, "banking").level) +
        universe.player.cash;
      let { e, i, s } = buyAllTheThings(balance, "none");
      output.push([`No Tech|$${newIncome} ($${balance})|${e}/${i}/${s}`]);

      universe.player.cash = myCash;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("bank", "E");
      newIncome =
        count * (10 + 2 * getTech(universe.player, "banking").level + 2);
      balance =
        universe.player.total_economy *
          (10 + 2 * getTech(universe.player, "banking").level + 2) +
        universe.player.cash;
      ({ e, i, s } = buyAllTheThings(balance, "bank"));
      output.push([`Banking|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
      const bankCost = tradeCostForLevel(
        getTech(universe.player, "banking").level + 1,
      );
      universe.player.cash = myCash - bankCost;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("bank", "E");
      newIncome =
        count * (10 + 2 * getTech(universe.player, "banking").level + 2);
      balance =
        universe.player.total_economy *
          (10 + 2 * getTech(universe.player, "banking").level + 2) +
        universe.player.cash;
      ({ e, i, s } = buyAllTheThings(balance, "bank"));
      output.push([
        `Buy it ($${bankCost})|$${newIncome} ($${balance})|${e}/${i}/${s}`,
      ]);
      universe.player.cash = myCash;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("terra", "E");
      newIncome = count * (10 + 2 * getTech(universe.player, "banking").level);
      balance =
        universe.player.total_economy *
          (10 + 2 * getTech(universe.player, "banking").level) +
        universe.player.cash;
      ({ e, i, s } = buyAllTheThings(balance, "terra"));
      output.push([`Terraforming|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
      const terraCost = tradeCostForLevel(
        getTech(universe.player, "terraforming").level + 1,
      );
      universe.player.cash = myCash - terraCost;
      universe.player.total_economy = preEcon;
      count = buyAllTheHypotheticalEconomy("terra", "E");
      newIncome = count * (10 + 2 * getTech(universe.player, "banking").level);
      balance =
        universe.player.total_economy *
          (10 + 2 * getTech(universe.player, "banking").level) +
        universe.player.cash;
      ({ e, i, s } = buyAllTheThings(balance, "terra"));
      output.push([
        `Buy it ($${terraCost})|$${newIncome} ($${balance})|${e}/${i}/${s}`,
      ]);
      output.push(`--- Economists Report for [[${myUid}]] (${myCash}) ---`);
    }

    universe.player.cash = originalCash;
    const { apiKeys, playerIndexes } = await getPrimaryAlliance();
    const communalStars: ScannedStar[] = [];
    const starowners: { [k: string]: StarState } = {};
    // TODO: Use ally keys to determine combat outcomes.
    combatOutcomes(starowners);
    let communalMoney = 0;
    const communalEmpires: { [k: number]: { cash: number; totaluce: number } } =
      {};
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const pi = playerIndexes[pii];
      const apiKey = await store.get(apiKeys[pii]);
      const scan = await getUserScanData(apiKey);
      if (scan) {
        const p = scan.players[pi];
        communalEmpires[p.uid] = {
          cash: p.cash,
          totaluce: 0,
        };
        communalMoney += p.cash;
        for (const s of Object.values(scan.stars) as ScannedStar[]) {
          let starOwner = s.puid;
          if (starowners[s.uid]?.puid !== undefined && starOwner === p.uid) {
            starOwner = +starowners[s.uid]?.puid;
          }
          if (starOwner === p.uid) {
            communalStars.push(s);
          }
        }
      }
    }

    universe.player.cash = communalMoney;
    const infra = buyAllTheInfra(communalStars, "none", "E");
    const allMyStars = infra.allMyStars;
    console.log("allMyStars", allMyStars, infra.count);

    output.push("--- Communal Transfers ---");
    output.push(":--|--:|--:|--:");
    output.push("Empire|Current|Needed|Transfer");

    for (const s of allMyStars) {
      communalEmpires[s.originalStar.puid].totaluce += s.totaluce;
    }
    const reserve = communalEmpires[universe.player.uid]?.totaluce;
    for (const uid in communalEmpires) {
      const cash = communalEmpires[uid].cash;
      const needed = communalEmpires[uid].totaluce;
      output.push(
        `[[${uid}]]|[[cash:${uid}:${cash}]]|${needed}|[[transfer:${uid}:${cash}:${needed}:${universe.player.uid}:${reserve}]]`,
      );
    }
    output.push("--- Communal Transfers ---");

    output.push("--- Communal Economy ---");
    output.push(":--|:--|--:|--:|--:");
    output.push("P|Star|E|+E|$E");
    const upgradeAll: number[] = [];
    for (const s of allMyStars) {
      const upgrade = s.e - s.originalStar.e;
      if (upgrade) {
        for (let i = 0; i < upgrade; i++) {
          upgradeAll.push(s.uid);
        }
        output.push([
          `[[#${s.originalStar.puid}]]|[[${s.n}]]|${s.originalStar.e}|${upgrade}|${s.totaluce}`,
        ]);
      }
    }
    output.push("--- Communal Economy ---");
    output.push(`[[upgrade:e:${upgradeAll.join(":")}]]`);

    console.log(`Reset player's cash to ${originalCash}`);
    universe.player.cash = originalCash;
    universe.player.total_economy = preEcon;
    universe.player.total_industry = preInd;
    universe.player.total_science = preSci;
    prepReport("economists", output);
  }
  defineHotkey(
    "ctrl+4",
    economistReport,
    "Your economists are keen to tell you about banking vs terraforming." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "economists",
  );
  const generalsReport = async () => {
    lastReport = "generals";

    const updated = await updateMessageCache("game_event");
    const preput: Stanzas = [];
    const output: Stanzas = [];
    if (!updated) {
      console.error("Updating message cache failed");
      output.push("Message cache stale!");
    } else {
      const universe = NeptunesPride.universe;
      const players = universe.galaxy.players;
      const myId = universe.player.uid;
      const { playerIndexes } = await getPrimaryAlliance();
      let bestWeapons = 0;
      for (const pk in players) {
        if (playerIndexes.indexOf(+pk) === -1 && players[pk].ai !== 1) {
          bestWeapons = Math.max(
            bestWeapons,
            getTech(players[pk], "weapons").level,
          );
        }
      }
      bestWeapons += combatInfo.combatHandicap;

      preput.push(
        `--- Generals Science for [[${myId}]] vs W${bestWeapons} ---`,
      );
      preput.push(`:--|--:|--:`);
      preput.push(`Technology|Ticks Req'd|Next Ticks|New Industry|Damage/tick`);
      const doTech = (techType: TechKey | "none") => {
        const tech =
          techType !== "manufacturing" && techType !== "weapons"
            ? techType === "banking"
              ? "bank"
              : techType === "terraforming"
                ? "terra"
                : "none"
            : "none";
        const origPlayer = universe.player;
        const player = { ...players[myId] };
        player.tech = clone(player.tech);
        universe.player = player;
        universe.galaxy.players[myId] = player;
        if (techType === "manufacturing") {
          player.tech[universe.TECH.MANU].level += 1;
        }
        const weapons = getTech(player, "weapons").level;
        const bump = techType === "banking" ? 1 : 0;
        const banking = getTech(universe.player, "banking").level + bump;
        const newIncome = player.totalEconomy * (10 + 2 * banking);
        const origCash = universe.player.cash;
        const balance = newIncome;
        universe.player.cash = balance;
        const indy = buyAllTheHypotheticalEconomy(tech, "I");
        const shipsPerTick = universe.calcShipsPerTickTotal(player);
        universe.player.cash = origCash;
        universe.player = origPlayer;
        universe.galaxy.players[myId] = origPlayer;
        const adjWeaps = techType === "weapons" ? weapons + 1 : weapons;
        const rounds = Math.ceil(shipsPerTick / (bestWeapons + 1));
        let ticksNeeded = 0;
        let nextTicksNeeded = 0;
        const t = techType !== "none" ? getTech(player, techType) : undefined;
        if (t !== undefined) {
          const soFar = t.research;
          const total = techCost(t);
          const remaining = total - soFar;
          const science = player.total_science || player.totalScience;
          ticksNeeded = Math.ceil(remaining / science);

          const nt = { ...t };
          nt.level += 1;
          const nTotal = techCost(nt);
          nextTicksNeeded = Math.ceil(nTotal / science);
        }
        preput.push(
          `${techType}|${ticksNeeded}|${nextTicksNeeded}|${indy}|${Math.trunc(rounds * adjWeaps)}`,
        );
      };
      doTech("none");
      doTech("weapons");
      doTech("manufacturing");
      if (universe.galaxy.config.noTer !== 1) {
        doTech("terraforming");
      }
      doTech("banking");

      preput.push(`--- Generals Science Requests ---`);
      preput.push(``);

      const losses: { [k: number]: number } = {};
      const looted: { [k: number]: number } = {};
      const trashed: { [k: number]: number } = {};
      for (const puid in NeptunesPride.universe.galaxy.players) {
        const uid = puid as unknown as number;
        losses[uid] = 0;
        looted[uid] = 0;
        trashed[uid] = 0;
      }
      output.push("--- Combat history ---");
      output.push(":--|:--|:--|--:|--:|--:|--:");
      output.push(`Tick|[[:star:]]|[[:carrier:]]|Kills|Losses|$|E`);
      for (let i = 0; i < messageCache.game_event.length; ++i) {
        const m = messageCache.game_event[i];
        if (m.payload.template === "combat_mk_ii") {
          const tick = m.payload.tick;
          const starOwner = m.payload.star.puid;
          const star = m.payload.star.name;
          const looter = +m.payload.looter;
          let ploot = 0;
          let ptrashed = 0;
          let pkills = 0;
          let plosses = 0;
          const myStar = m.payload.star.puid === myId;
          if (m.payload.loot > 0) {
            looted[looter] += m.payload.loot;
            if (looter === myId) {
              ploot += m.payload.loot;
            }
          }
          const tallyDefenderLosses = () => {
            let ret = 0;
            const defenderKeys = Object.keys(m.payload.defenders);
            for (const k of defenderKeys) {
              const loss =
                m.payload.defenders[k].ss - m.payload.defenders[k].es;
              losses[m.payload.defenders[k].puid] += loss;
              ret += loss;
            }
            return ret;
          };
          if (myStar) {
            ptrashed += m.payload.loot / 10;
            plosses += m.payload.star.ss - m.payload.star.es;
            plosses += tallyDefenderLosses();
          } else {
            pkills += m.payload.star.ss - m.payload.star.es;
            pkills += tallyDefenderLosses();
          }
          if (m.payload.star.puid !== undefined) {
            losses[+m.payload.star.puid] +=
              m.payload.star.ss - m.payload.star.es;
          }
          trashed[+m.payload.star.puid] += m.payload.loot / 10;
          const attackerKeys = Object.keys(m.payload.attackers);
          const forcesMap: { [k: string]: number } = {};
          for (const k of attackerKeys) {
            const key = `[[#${m.payload.attackers[k].puid}]]`;
            if (forcesMap[key] === undefined) {
              forcesMap[key] = 0;
            }
            forcesMap[key] += m.payload.attackers[k].ss;
            const delta = m.payload.attackers[k].ss - m.payload.attackers[k].es;
            losses[+m.payload.attackers[k].puid] += delta;
            if (myStar) {
              pkills += delta;
            } else if (m.payload.attackers[k].puid === myId) {
              plosses += delta;
            }
          }
          const a = Object.keys(forcesMap)
            .map((k) => `${k}`)
            .join("");
          output.push([
            `[[Tick #${tick}]]|[[#${starOwner}]][[${star}]]|${a}|${pkills}|${plosses}|${ploot}|${ptrashed}`,
          ]);
        }
      }
      output.push("--- Combat history ---");

      preput.push("--- Combat Summary ---");
      preput.push(":--|--:|--:");
      preput.push(`Empire|Losses|$|E`);
      for (const p in losses) {
        preput.push([`[[${p}]]|${losses[p]}|${looted[p]}|${trashed[p]}`]);
      }
      preput.push("--- Combat Summary ---\n");
    }
    prepReport("generals", [...preput, ...output]);
  };
  defineHotkey(
    "ctrl+w",
    generalsReport,
    "The generals report summarizes the state of your military operations. " +
      "Use it to assess how you're faring against your enemies.",
    "generals",
  );

  function getMyKeys() {
    const playerUidFromScan = (scan: any) => scan?.puid;
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : getPlayerUid(NeptunesPride.universe.galaxy);

    return allSeenKeys.filter((k) => {
      console.log(
        `check ${k} for ${myId} == ${playerUidFromScan(
          scanInfo[getCodeFromApiText(k)],
        )}`,
        scanInfo[getCodeFromApiText(k)],
      );
      return playerUidFromScan(scanInfo[getCodeFromApiText(k)]) === myId;
    });
  }
  function activityReport() {
    const output = [];
    const endTick = NeptunesPride.universe.galaxy.tick;
    output.push(`Activity report up to [[Tick #${endTick}]]:`);
    const playerBlock: {
      [k: string]: string[];
    } = {};
    let currentTick = 0;
    const players = NeptunesPride.universe.galaxy.players;
    for (const k in players) {
      playerBlock[k] = [`--- [[${k}]] ---`];
      playerBlock[k].push(":--|---|---|---|--:|--:");
      playerBlock[k].push("Time|E|I|S|Fleets|Stars");
    }
    const pk =
      NeptunesPride.universe.selectedSpaceObject?.puid >= 0
        ? NeptunesPride.universe.selectedSpaceObject?.puid
        : NeptunesPride.universe.player.uid;
    timeTravelTickCaches = {};
    do {
      const myKeys = allSeenKeys.filter((x) => {
        const k = getCodeFromApiText(x);
        return (
          scanInfo[k] &&
          scanInfo[k].firstTick <= currentTick &&
          scanInfo[k].lastTick >= currentTick
        );
      });
      if (myKeys.length > 0) {
        const code = getCodeFromApiText(myKeys[0]);
        let diffs: CachedScan = getCacheForKey(code);
        let lastPlayers = clone(diffs.next.check.players);
        for (; diffs; diffs = diffs.next) {
          if (diffs?.forward?.tick === currentTick) {
            break;
          }
          if (diffs.forward?.players !== undefined) {
            lastPlayers = patch(lastPlayers, diffs.forward.players);
          }
        }
        for (; diffs; diffs = diffs.next) {
          const diff = diffs;
          if (diff.forward?.tick !== undefined) {
            if (diff.forward.tick - currentTick > 1) {
              console.log(`Jump from ${currentTick} to ${diff.forward.tick}`);
            }
            currentTick = diff.forward.tick;
          }
          if (diff.forward?.players !== undefined) {
            const sameTick = diff.forward.tick === undefined;
            const active = (p: any, last: any, manual: boolean) => {
              if (p === undefined) return false;
              if (p.totalEconomy > last.totalEconomy) return true;
              if (p.totalFleets > last.totalFleets) return true;
              const manualUpgrade = p.totalStars === undefined || manual;
              if (p.totalIndustry > last.totalIndustry && manualUpgrade)
                return true;
              if (p.totalScience > last.totalScience && manualUpgrade)
                return true;
              return false;
            };
            for (const p in players) {
              if (active(diff.forward.players[p], lastPlayers[p], sameTick)) {
                let playerData = clone(lastPlayers[p]);
                playerData = patch(playerData, diff.forward.players[p]);
                const last = playerBlock[p].splice(-1);
                if (
                  last[0] &&
                  !last[0].startsWith(`[[Tick #${currentTick}]]`)
                ) {
                  playerBlock[p].push(last[0]);
                }
                playerBlock[p].push(
                  `[[Tick #${currentTick}]]|${playerData.totalEconomy}|${playerData.totalIndustry}|${playerData.totalScience}|${playerData.totalFleets}|${playerData.totalStars}`,
                );
              }
            }

            lastPlayers = patch(lastPlayers, diff.forward.players);
          }
        }
      }
      currentTick++;
    } while (currentTick <= endTick);
    for (const k in playerBlock) {
      if (playerBlock[k].length === 3) {
        playerBlock[k].push("No activity: AFK?");
      }
      if (playerBlock[k].length > 15) {
        const lines = playerBlock[k];
        const prefix = lines.slice(0, 3);
        const end = lines.length;
        const start = end - 5;
        const suffix = lines.slice(start, end);
        playerBlock[k] = [...prefix, ...suffix];
      }
      playerBlock[k].push(`--- [[${k}]] ---`);
      if (players[k].conceded === 0 && pk !== k) {
        output.push(playerBlock[k]);
      }
    }
    prepReport("activity", output);
  }
  defineHotkey(
    "shift+;",
    activityReport,
    "Generate a report of current player activity." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "activity",
  );
  const routeEnemy = () => {
    const universe = NeptunesPride.universe;
    const npui = NeptunesPride.npui;
    if (universe.selectedStar && universe.selectedStar.puid !== -1) {
      const star = universe.selectedStar;
      universe.player = universe.galaxy.players[star.puid];
      const base = 100000;
      let uid = base + 1;
      while (universe.galaxy.fleets[uid]) {
        uid++;
      }
      const fakeFleet = {
        l: 0,
        lx: star.x,
        ly: star.y,
        x: star.x,
        y: star.y,
        ouid: star.uid,
        n: `Fake Enemy Fleet ${uid - base}`,
        o: [] as [number, number, number, number][],
        puid: star.puid,
        st: star.st,
        uid,
        w: false,
      };
      star.st = 0;
      NeptunesPride.np.onNewFleetResponse(null, fakeFleet);
    } else if (universe.selectedFleet) {
      const fleet = universe.selectedFleet;
      universe.player = universe.galaxy.players[fleet.puid];
      npui.trigger("start_edit_waypoints", { fleet });
    }
  };
  defineHotkey(
    "x",
    routeEnemy,
    "Set fleet orders for an enemy fleet. " +
      "These orders won't really happen but you can use them to explore " +
      "attack or defense options your opponents have. First, select an " +
      "enemy star, then press x to create and set orders for the fleet. You" +
      "can then also route any other fleets that player controls.",
    "Route Enemy",
  );

  const ampm = (hours: number, minutes: number | string) => {
    let h = hours;
    let m = minutes;
    if (m < 10) m = `0${m}`;
    if (h < 12) {
      if (h == 0) h = 12;
      return "{0}:{1} AM".format(h, m);
    }
    if (h > 12) {
      return "{0}:{1} PM".format(h - 12, m);
    }
    return "{0}:{1} PM".format(h, m);
  };

  let trueTick = 0;
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

  let colorMap = colors.flatMap((_x) => colors);
  let shapeMap = colorMap.map((_x, i) => Math.floor(i / 8));
  const setPlayerColor = (uid: number, color: string) => {
    //console.log(`Set player color to ${color} for ${uid}`);
    const player = NeptunesPride.universe.galaxy.players[uid];
    colorMap[player.uid + (isNP4() ? -1 : 0)] = color;
    if (NeptunesPride.gameVersion === "proteus" || isNP4()) {
      if (!player.originalColor) {
        player.originalColor = player.colorStyle;
        //console.log(`Record original color as ${player.originalColor}`);
      }
      //console.log(`original color was ${player.originalColor}`);
      player.colorStyle = playerToColorMap(player);
      //console.log(`colorStyle is ${player.colorStyle}`);
    } else {
      if (!player.originalColor) {
        player.originalColor = player.color;
      }
      player.prevColor = player.color;
      player.color = playerToColorMap(player);
    }
  };
  const rebuildColorMap = (galaxy: any) => {
    if (galaxy.players[1].shape !== undefined && colorMap) {
      //console.log("rebuild color map before ", JSON.stringify(colorMap));
      colorMap = colorMap.map((_, i) => {
        const uid = i + (isNP4() ? 1 : 0);
        if (galaxy.players[uid] !== undefined) {
          const c = galaxy.players[uid].color;
          if (c === undefined || galaxy.players[uid].colorStyle) {
            /*
            console.log(
              `use colorstyle for ${uid} ${galaxy.players[uid].colorStyle}`,
              galaxy.players[uid]
            );
            */
            return (
              galaxy.players[uid].colorStyle ||
              galaxy.players[uid].originalColor
            );
          }
          //console.log(`${uid} -> ${c} (${colors[c]}) GP`);
          return colors[c];
        }
        //console.log(`${uid} -> ${colorMap[uid]} CM`);
        return colorMap[i];
      });
      //console.log("rebuild color map after ", JSON.stringify(colorMap));
    }
    if (
      galaxy.players[1].shape !== undefined &&
      shapeMap &&
      NeptunesPride.gameVersion === "proteus"
    ) {
      shapeMap = shapeMap.map((_, i) => {
        const uid = i + (isNP4() ? 1 : 0);
        if (galaxy.players[uid] !== undefined) {
          return galaxy.players[uid].shape;
        }
        return shapeMap[i];
      });
    }
    colorMap?.forEach((c: string, i: number) => {
      const uid = i + (isNP4() ? 1 : 0);
      if (NeptunesPride.universe.galaxy.players[uid]) {
        setPlayerColor(uid, c);
        if (c !== "#ffffff") {
          if (
            settings.whitePlayer &&
            uid === NeptunesPride.universe.player.uid
          ) {
            NeptunesPride.universe.player.prevColor = c;
            setPlayerColor(uid, "#ffffff");
          }
        }
      }
    });
  };
  let timeTravelTick = -1;
  const recordTrueTick = (_: any, galaxy: any) => {
    trueTick = galaxy.tick;
    rebuildColorMap(galaxy);
    timeTravelTick = -1;
  };
  onTrigger("order:full_universe", recordTrueTick);
  if (NeptunesPride?.universe?.galaxy?.tick !== undefined) {
    recordTrueTick(null, NeptunesPride.universe.galaxy);
  }
  function tickRate() {
    const galaxy = NeptunesPride.universe.galaxy;
    return galaxy.tick_rate || galaxy.tickRate;
  }
  function tickFragment(scan?: any) {
    const galaxy = scan !== undefined ? scan : NeptunesPride.universe.galaxy;
    return galaxy.tick_fragment || galaxy.tickFragment;
  }
  const msToTick = (tick: number, wholeTime?: boolean) => {
    const universe = NeptunesPride.universe;
    let ms_since_data = 0;
    let tf = tickFragment();
    let ltc = universe.locTimeCorrection;

    if (!universe.galaxy.paused) {
      ms_since_data = new Date().valueOf() - universe.now.valueOf();
    }

    if (wholeTime || universe.galaxy.turn_based) {
      ms_since_data = 0;
      tf = 0;
      ltc = 0;
    }

    const ms_remaining =
      tick * 1000 * 60 * tickRate() -
      tf * 1000 * 60 * tickRate() -
      ms_since_data -
      ltc;
    return ms_remaining;
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const msToTurnString = (ms: number, _prefix: string) => {
    const rate = tickRate() * 60 * 1000;
    const tick = ms / rate;
    const turn = Math.ceil(tick / turnJumpTicks());
    return `${turn} turn${turn !== 1 ? "s" : ""}`;
  };
  const msToEtaString = (msplus: number, prefix: string) => {
    const nowMS =
      new Date().getTime() + NeptunesPride.universe.locTimeCorrection;
    const now = new Date(nowMS);
    const arrival = new Date(now.getTime() + msplus);
    const p = prefix !== undefined ? prefix : "ETA ";
    let ttt = p + ampm(arrival.getHours(), arrival.getMinutes());
    if (arrival.getDay() != now.getDay())
      ttt = `${p}${days[arrival.getDay()]} @ ${ampm(
        arrival.getHours(),
        arrival.getMinutes(),
      )}`;
    return ttt;
  };

  const mapRebuild = () => {
    console.log("rebuild", { showingOurOptions, showingOurUI });
    if (showingOurOptions) {
      NeptunesPride.np.trigger("refresh_interface");
    }
    NeptunesPride.np.trigger("map_rebuild");
  };
  const incTerritoryBrightness = () => {
    if (!settings.territoryOn) {
      toggleTerritory();
      return;
    }
    settings.territoryBrightness = (settings.territoryBrightness + 1) % 4;
    mapRebuild();
  };
  const decTerritoryBrightness = () => {
    if (!settings.territoryOn) {
      toggleTerritory();
      return;
    }
    let nextPower = (settings.territoryBrightness - 1) % 4;
    if (nextPower < 0) nextPower = 2;
    settings.territoryBrightness = nextPower;
    mapRebuild();
  };
  defineHotkey(
    "ctrl+8",
    decTerritoryBrightness,
    "Adjust territory display style.",
    "- Territory Brightness",
  );
  defineHotkey(
    "ctrl+9",
    incTerritoryBrightness,
    "Adjust territory display style.",
    "+ Territory Brightness",
  );
  const incAutoRuler = () => {
    settings.autoRulerPower += 1;
    mapRebuild();
  };
  const decAutoRuler = () => {
    let nextPower = settings.autoRulerPower - 1;
    if (nextPower < 0) nextPower = 0;
    settings.autoRulerPower = nextPower;
    mapRebuild();
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
    combatInfo.combatHandicap += 1;
    NeptunesPride.np.trigger("map_rebuild");
    NeptunesPride.np.trigger("refresh_interface");
  }
  function decCombatHandicap() {
    combatInfo.combatHandicap -= 1;
    NeptunesPride.np.trigger("map_rebuild");
    NeptunesPride.np.trigger("refresh_interface");
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
    prepReport("combats", combatOutcomes());
  }
  defineHotkey(
    "&",
    longFleetReport,
    "Generate a detailed fleet report on all carriers in your scanning range, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "combats",
  );

  function filteredFleetReport() {
    let find = NeptunesPride.universe.selectedSpaceObject?.n;
    if (find === undefined) {
      prepReport("filteredcombats", ["Select a fleet or star."]);
    } else {
      find = `[[${find}]]`;
      prepReport("filteredcombats", combatOutcomes(), contains(find));
    }
  }
  defineHotkey(
    "D",
    filteredFleetReport,
    "Generate a detailed report on fleet movements involving the selected fleet or star, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "filteredcombats",
  );

  function combatReport() {
    prepReport("onlycombats", combatOutcomes(), contains("Combat!"));
  }
  defineHotkey(
    "d",
    combatReport,
    "Generate a detailed combat report on all visible combats, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "onlycombats",
  );

  function briefFleetReport() {
    const fleets = NeptunesPride.universe.galaxy.fleets;
    const stars = NeptunesPride.universe.galaxy.stars;
    let flights = [];
    const shipCounts: { [k: string]: number } = {};
    for (const k in NeptunesPride.universe.galaxy.players) {
      shipCounts[k] = 0;
    }
    for (const f in fleets) {
      const fleet = fleets[f];
      if (fleet.o && fleet.o.length > 0) {
        const stop = fleet.o[0][1];
        const ticks = fleet.etaFirst;
        const starname = stars[stop]?.n;
        if (!starname) continue;
        shipCounts[fleet.puid] += fleet.st;
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
    flights = flights.sort((a, b) => a[0] - b[0]);
    const summary: Stanzas = [];
    for (const k in NeptunesPride.universe.galaxy.players) {
      shipCounts[k] > 0
        ? summary.push([`[[${k}]] ${shipCounts[k]} ships in flight`])
        : 0;
    }
    prepReport("fleets", [...flights.map((x) => [x[1]]), ...summary]);
  }

  defineHotkey(
    "^",
    briefFleetReport,
    "Generate a summary fleet report on all carriers in your scanning range, and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.",
    "fleets",
  );

  const optionsSubset = (
    screen: any,
    filter: (p: TypedProperty) => boolean,
    info?: any,
  ) => {
    const props = settings.getProperties().filter(filter);
    const numSettings = props.length;
    const options = new UI.Widget("rel")
      .size(480, 50 * numSettings)
      .roost(screen);

    props.forEach(async (p, i) => {
      const labelKey = `npa_${p.name}`;
      templates[labelKey] = p.displayName;
      const bad = info?.missingKey === p.name ? "txt_warn_bad" : "";
      new UI.Text(labelKey, `pad12 ${bad}`)
        .grid(0, 3 * i, 20, 3)
        .roost(options);
      const rawSettings: { [k: string]: any } = settings;
      const defaultValue = rawSettings[p.name];
      if (p.allowableValues) {
        const values: { [k: number]: any } = {};
        let defaultIndex = "0";
        p.allowableValues.forEach((v, i) => {
          values[i] = v;
          if (v === defaultValue) {
            defaultIndex = `${i}`;
          }
        });
        const eventKey = `setting_change_${p.name}`;
        new UI.DropDown(defaultIndex, values, eventKey)
          .grid(15, 3 * i, 15, 3)
          .roost(options);
        screen.ui.on(eventKey, (_x: any, y: any) => {
          rawSettings[p.name] = values[y];
          mapRebuild();
        });
      } else {
        const field = new UI.TextInput("single")
          .grid(15, 3 * i, 15, 3)
          .roost(options);
        field.setValue(defaultValue);
        field.eventKind = "text_entry";
        screen.ui.on(field.eventKind, (_x: any, _y: any) => {
          if (field.getValue() !== rawSettings[p.name]) {
            if (p.type === "number") {
              rawSettings[p.name] = +field.getValue() || rawSettings[p.name];
            } else if (p.type === "boolean") {
              rawSettings[p.name] = field.getValue() === "true";
            } else {
              rawSettings[p.name] = field.getValue();
            }
            mapRebuild();
          }
        });
      }
    });
  };
  NeptunesPride.npui.Screen = () => {
    const ret = new UI.Widget("rel col_base no_overflow");

    ret.screenTop = 52;

    ret.size(480, 0);
    ret.yOffset = ret.screenTop;
    ret.footerRequired = true;

    ret.header = new UI.Widget("rel").size(480, 48).roost(ret);

    ret.heading = new UI.Text("n_p_a", "screen_title txt_ellipsis")
      .size(360, 48)
      .roost(ret.header);

    ret.closeButton = new UI.IconButton("icon-cancel", "hide_screen")
      .grid(27, 0, 3, 3)
      .roost(ret.header);

    new UI.Widget("rel col_black").size(480, 4).roost(ret);

    ret.body = new UI.Widget("rel").size(480, 0).roost(ret);

    new UI.Widget("rel col_black").size(480, 4).roost(ret);
    return ret;
  };
  const npaOptions = (info?: any) => {
    const npui = NeptunesPride.npui;
    templates.npa_options = `*NPA Settings ${version.replaceAll(/ .*$/g, "")}`;
    const optionsScreen = npui.Screen("npa_options");
    new UI.IconButton("icon-help", "show_screen", "help")
      .grid(24.5, 0, 3, 3)
      .roost(optionsScreen).onClick = npaHelp;

    optionsSubset(optionsScreen, (_p) => true, info);

    return optionsScreen;
  };
  const clipColorConfig = () => {
    const p = NeptunesPride.universe.player;
    setClip(
      `[[colorscheme:${p.alias} Tick #${trueTick}:${colorMap.join(
        " ",
      )}:${shapeMap.join(" ")}]]`,
    );
    console.log("clip: ", getClip());
  };
  let currentCustomColor = 0;
  let currentCustomShape = 0;
  const npaColours = (_info?: any) => {
    const npui = NeptunesPride.npui;
    templates.npa_colours = "Colours and Shapes";
    const colourScreen = npui.Screen("npa_colours");
    new UI.IconButton("icon-help", "show_screen", "help")
      .grid(24.5, 0, 3, 3)
      .roost(colourScreen).onClick = npaHelp;

    optionsSubset(colourScreen, (p) => p.name === "allianceDiscriminator");

    const galaxy = NeptunesPride.universe.galaxy;
    const players = Object.keys(galaxy.players).map((k) => galaxy.players[k]);
    const numPlayers = players.length;
    const customColors = settings.customColors.split(" ");
    const swatchesPerRow = 10;
    const colorSwatchRows = Math.ceil(customColors.length / swatchesPerRow);
    const shapeRowHeight = 3;
    const colours = new UI.Widget("rel")
      .size(480, 50 * (numPlayers + colorSwatchRows) + shapeRowHeight * 16)
      .roost(colourScreen);

    customColors.forEach((c, i) => {
      const xOffset = 3 * (i % swatchesPerRow);
      const yOffset = 3 * Math.floor(i / swatchesPerRow);
      const swatchSize = 28;
      const style = `text-align: center; vertical-align: middle; border-radius: 5px; width: ${swatchSize}px; height: ${swatchSize}px; background-color: ${c}; display: inline-block`;
      const tickMark = i === currentCustomColor ? "✓" : "";
      new UI.Text("", "pad12")
        .rawHTML(
          `<span onClick=\"NeptunesPride.crux.trigger('set_cc', ${i})\" style='${style}'>${tickMark}</span>`,
        )
        .grid(xOffset, yOffset, 3, 3)
        .roost(colours)
        .listen(NeptunesPride.crux, "set_cc", (_x: any, y: any) => {
          if (currentCustomColor !== y) {
            currentCustomColor = y;
            NeptunesPride.np.trigger("refresh_interface");
          }
        });
    });
    const customShapes = [0, 1, 2, 3, 4, 5, 6, 7];
    customShapes.forEach((s, i) => {
      const xOffset = 3 * i;
      const yOffset = 3 * colorSwatchRows;
      const color = customColors[currentCustomColor];
      let style = `text-align: center; vertical-align: middle; border-radius: 5px; color: ${color};`;
      style += "padding: 4px; padding-top: 6px; padding-right: 5px;";
      style += "background-color: black; ";
      if (i === currentCustomShape) {
        style += "border: 2px solid white; ";
      } else {
        style += "border: 2px solid grey; ";
      }
      new UI.Text("", "pad12")
        .rawHTML(
          `<span class='playericon_font' style='${style}' onClick=\"NeptunesPride.crux.trigger('set_cs', ${i})\">${s}</span>`,
        )
        .grid(xOffset, yOffset, 3, 3)
        .roost(colours)
        .listen(NeptunesPride.crux, "set_cs", (_x: any, y: any) => {
          if (currentCustomShape !== y) {
            currentCustomShape = y;
            NeptunesPride.np.trigger("refresh_interface");
          }
        });
    });
    players.forEach((p, i) => {
      const name = p.alias;
      const color = playerToColorMap(p);
      const shape = playerToShapeMap(p);
      const yOffset = 3 * i + 3 * colorSwatchRows + shapeRowHeight;
      new UI.Text("", "pad12")
        .rawHTML(name)
        .grid(0, yOffset, 20, 3)
        .roost(colours);
      const shapeField = new UI.TextInput("single")
        .grid(16, yOffset, 3, 3)
        .roost(colours);
      shapeField.node.addClass("playericon_font");
      shapeField.node.css("color", color);
      shapeField.setValue(shape);
      const field = new UI.TextInput("single")
        .grid(19, yOffset, 6, 3)
        .roost(colours);
      field.setValue(color);
      field.eventKind = "text_entry";
      const handleChange = () => {
        let changed = false;
        if (/^#[0-9a-fA-F]{6}$/.test(field.getValue())) {
          if (field.getValue() != color) {
            const newColor = field.getValue();
            setPlayerColor(p.uid, newColor);
            if (
              customColors.indexOf(newColor) === -1 &&
              colors.indexOf(newColor) === -1
            ) {
              currentCustomColor = customColors.length;
              customColors.push(newColor);
              settings.customColors = customColors.join(" ");
            }
            changed = true;
          }
        }
        if (/^[0-7]$/.test(shapeField.getValue())) {
          if (shapeField.getValue() != shape) {
            const newShape = +shapeField.getValue();
            console.log(`set ${p.uid} to shape ${newShape}`);
            shapeMap[p.uid + (isNP4() ? -1 : 0)] = newShape;
            changed = true;
          }
        }
        if (changed) {
          //console.log(`before: ${shapeMap.join(",")}`);
          recolorPlayers();
          //console.log(`set: ${shapeMap.join(",")}`);
          store.set("colorMap", colorMap.join(" "));
          store.set("shapeMap", shapeMap.join(" "));
          //console.log(`recolor: ${shapeMap.join(",")}`);
          NeptunesPride.np.trigger("refresh_interface");
          //console.log(`mapre: ${shapeMap.join(",")}`);
          mapRebuild();
          //console.log(`preclip: ${shapeMap.join(",")}`);
          clipColorConfig();
        }
      };
      field.node.on("focus", () => {
        const newColor = customColors[currentCustomColor];
        field.setValue(newColor);
        handleChange();
      });
      shapeField.node.on("focus", () => {
        const newShape = currentCustomShape;
        shapeField.setValue(newShape);
        handleChange();
      });
      colourScreen.listen(
        NeptunesPride.crux,
        field.eventKind,
        (_x: any, _y: any) => {
          handleChange();
        },
      );
      const eventName = `reset_cc_${p.uid}`;
      const button = new UI.Button(eventName, eventName, p)
        .rawHTML("Reset")
        .grid(25, yOffset, 5, 3)
        .roost(colours);
      button.listen(NeptunesPride.crux, eventName, (_x: any, _y: any) => {
        const shapeIndex = p.shapeIndex !== undefined ? p.shapeIndex : p.shape;
        if (
          field.getValue() !== p.originalColor ||
          shapeField.getValue() != shapeIndex
        ) {
          field.setValue(p.originalColor);
          shapeField.setValue(shapeIndex);
          handleChange();
        }
      });
    });

    clipColorConfig();

    return colourScreen;
  };

  const setColorScheme = (_event?: any, data?: string) => {
    const split = data?.split(":");
    if (split) {
      const colorData = split[0];
      const shapeData = split[1];
      store.set("colorMap", colorData);
      store.set("shapeMap", shapeData);
      init();
    }
  };
  onTrigger("set_colorscheme_api", setColorScheme);

  const screenshot = async (): Promise<void> => {
    const map = NeptunesPride.npui.map;
    const key = settings.ibbApiKey;
    if (!key) {
      showOptions({ missingKey: "ibbApiKey" });
      return;
    }
    const dataUrl = map.canvas[0].toDataURL("image/webp", 0.45);
    const split = dataUrl.indexOf(",") + 1;
    const params = {
      expiration: 2592000,
      key,
      image: dataUrl.substring(split),
    };
    const resp = await fetch(`https://api.imgbb.com/1/upload`, {
      method: "POST",
      redirect: "follow",
      body: new URLSearchParams(params as any),
    });
    const r = await resp.json();
    if (r?.data?.url) {
      setClip(`[[${r.data.url}]]`);
    } else {
      const message = `Error: ${JSON.stringify(r)}`;
      logCount(message);
      setClip(message);
    }
  };

  defineHotkey(
    "#",
    screenshot,
    "Uses your imgbb API key to upload a screenshot of the map.",
    "Screenshot",
  );

  const homePlanets = () => {
    const p = NeptunesPride.universe.galaxy.players;
    const output = [];
    for (const i in p) {
      const home = p[i].home;
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
    prepReport(
      "planets",
      output.map((s) => [s]),
    );
  };
  defineHotkey(
    "!",
    homePlanets,
    "Generate a player summary report and copy it to the clipboard." +
      "<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown. " +
      "It is most useful for discovering player numbers so that you can write [[#]] to reference a player in mail.",
    "planets",
  );

  const playerSheet = () => {
    const p = NeptunesPride.universe.galaxy.players;
    const output = [];
    const fields = [
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
    for (const i in p) {
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
  const starSheet = () => {
    const p = NeptunesPride.universe.galaxy.stars;
    const output = [];
    const fields = [
      "uid",
      "x",
      "y",
      "n",
      "exp",
      "puid",
      "v",
      "r",
      "nr",
      "yard",
      "e",
      "i",
      "s",
      "ga",
      "st",
      "alliedDefenders",
      "shipsPerTick",
      "owned",
      "totalDefenses",
      "uce",
      "uci",
      "ucs",
      "ucg",
    ];
    output.push(fields.join(","));
    for (const i in p) {
      const record = fields.map((f) => p[i][f]);
      output.push(record.join(","));
    }
    setClip(output.join("\n"));
  };
  defineHotkey(
    "ctrl+shift+8",
    starSheet,
    "Generate a star summary mean to be made into a spreadsheet." +
      "<p>The clipboard should be pasted into a CSV and then imported.",
    "Stars CSV",
  );

  const drawString = (s: string, x: number, y: number, fgColor?: string) => {
    const str = Crux.format(s, { linkTimes: false });
    const context = NeptunesPride.npui.map.context;
    context.fillStyle = fgColor || "#00ff00";
    context.fillText(str, x, y);
  };

  const drawOverlayString = (
    context: {
      fillStyle: string;
      fillText: (arg0: any, arg1: number, arg2: number) => void;
    },
    s: string,
    x: number,
    y: number,
    fgColor?: string,
  ) => {
    const str = Crux.format(s, { linkTimes: false });
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

  const anyStarCanSee = (owner: string | number, fleet: { x: any; y: any }) => {
    const stars = NeptunesPride.universe.galaxy.stars;
    const universe = NeptunesPride.universe;
    const scanRange = getScanValue(universe.galaxy.players[owner]);
    for (const s in stars) {
      const star = stars[s];
      if (star.puid == owner) {
        const distance = universe.distance(star.x, star.y, fleet.x, fleet.y);
        if (distance <= scanRange) {
          return true;
        }
      }
    }
    return false;
  };

  let hooksLoaded = false;
  type CSSRuleMap = { [k: string]: CSSStyleRule };
  function cssrules(): CSSRuleMap {
    const rules: { [k: string]: CSSStyleRule } = {};
    for (let i = 0; i < document.styleSheets.length; ++i) {
      try {
        const cssRules = document.styleSheets[i].cssRules;
        for (let j = 0; j < cssRules.length; ++j) {
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
  function playerToColorMap(player: Player) {
    return colorMap[player.uid - (isNP4() ? 1 : 0)];
  }
  function playerToShapeMap(player: Player) {
    return shapeMap[player.uid - (isNP4() ? 1 : 0)];
  }
  const css = cssrules();
  let originalStarSrc: any = undefined;
  async function recolorPlayers() {
    const map = NeptunesPride.npui.map;
    if (originalStarSrc === undefined) {
      originalStarSrc = new Image();
      originalStarSrc.src = map.starSrc.src;
    }
    const ownershipSprites = document.createElement("canvas");
    // 7 extra columns for stargate glows
    ownershipSprites.width = 64 * 9 + 64 * 7;
    ownershipSprites.height = 64 * 9;
    const spriteContext: CanvasRenderingContext2D =
      ownershipSprites.getContext("2d");
    spriteContext.drawImage(originalStarSrc, 0, 0);

    const players = NeptunesPride.universe.galaxy.players;
    for (const pk in players) {
      const player = players[pk];
      const color = playerToColorMap(player);
      // player underbar in player list, but these only exist
      // for the first 8 players.
      if (Number.parseInt(pk) < 8) {
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
      const shapeIndex =
        player.shapeIndex !== undefined ? player.shapeIndex : player.shape;
      const shapeOffset = (shapeIndex - playerToShapeMap(player)) * 64;
      playerContext.drawImage(originalStarSrc, shapeOffset, 0);
      playerContext.globalCompositeOperation = "source-in";
      playerContext.fillStyle = color;
      const uid = player.uid;
      let col = shapeIndex;
      let row = Math.floor(uid % 8) + 1;
      if (player.shape !== undefined) {
        col = player.shape;
        row = player.color + 1;
      }

      const x = col * 64;
      const y = row * 64;
      playerContext.fillRect(x, y, 64, 64);

      spriteContext.clearRect(x, y, 64, 64);
      spriteContext.drawImage(playerSprite, 0, 0);
    }
    // draw stargate glows
    for (const pk in players) {
      const player = players[pk];
      const color = playerToColorMap(player);
      const playerSprite = document.createElement("canvas");
      playerSprite.width = playerSprite.height = 64 * 9;
      const playerContext: CanvasRenderingContext2D =
        playerSprite.getContext("2d");
      playerContext.drawImage(map.starSrc, 0, 0);
      playerContext.globalCompositeOperation = "source-in";
      playerContext.fillStyle = color;
      const uid = player.uid;
      const shapeIndex =
        player.shapeIndex !== undefined ? player.shapeIndex : player.shape;
      let realcol = shapeIndex;
      const col = 8;
      let row = Math.floor(uid % 8) + 1;
      if (player.shape !== undefined) {
        realcol = player.shape;
        row = player.color + 1;
      }
      const x = col * 64;
      const y = row * 64;
      playerContext.fillRect(x, y, 64, 64);

      spriteContext.clearRect(x + realcol * 64, y, 64, 64);
      spriteContext.drawImage(playerSprite, realcol * 64, 0);
    }

    // Override sprite positioning for stars with gates, so
    // that every player can have a uniquely coloured gate
    // glow that matches their own colour.
    const npmap = NeptunesPride.npui.map;
    const superCreateSpritesStars = npmap.createSpritesStars.bind(npmap);
    NeptunesPride.npui.map.createSpritesStars = () => {
      superCreateSpritesStars();
      for (const sss of NeptunesPride.npui.map.sortedStarSprites) {
        if (sss.gate && sss.puid >= 0) {
          const shape = NeptunesPride.universe.galaxy.players[sss.puid].shape;
          const col = shape !== undefined ? shape : Math.floor(sss.puid / 8);
          sss.gate.spriteX = 64 * 8 + 64 * col;
        }
      }
    };

    map.starSrc.src = ownershipSprites.toDataURL();
    await map.starSrc.decode();
    for (const pk in players) {
      const player = players[pk];
      const uid = player.uid;
      const shapeIndex =
        player.shapeIndex !== undefined ? player.shapeIndex : player.shape;
      let col = shapeIndex;
      let row = Math.floor(uid % 8) + 1;
      if (player.shape !== undefined) {
        col = player.shape;
        row = player.color + 1;
      }
      const x = col * 64;
      const y = row * 64;
      // player overlay on avatar
      if (!isNP4()) {
        css[`.pci_48_${player.uid}`].style.background = `url("${
          map.starSrc.src
        }") -${x + 8}px -${y + 8}px`;
      }
    }
    const universe = NeptunesPride.universe;
    for (const i in universe.galaxy.players) {
      const player = universe.galaxy.players[i];
      const recolor = `style='color: ${playerToColorMap(player)};'`;
      const shape = playerToShapeMap(player);
      player.colourBox = `<span class='playericon_font pc_${player.colorIndex}' ${recolor}>${shape}</span>`;
      player.hyperlinkedBox = `<a onClick=\"NeptunesPride.crux.trigger('show_player_uid', '${player.uid}' )\">${player.colourBox}</a>`;
    }
    linkPlayerSymbols();

    console.log("Recreating star and fleet sprites");
    if (!showingOurOptions) {
      NeptunesPride.np.trigger("refresh_interface");
    }
    mapRebuild();
    // firefox workaround: a delayed repaint seems needed?
    window.setTimeout(() => NeptunesPride.np.trigger("map_rebuild"), 500);
  }
  const loadHooks = () => {
    onTrigger("order:full_universe", () => {
      politicalMap.updateStarData(NeptunesPride.universe.galaxy);
    });
    politicalMap.updateStarData(NeptunesPride.universe.galaxy);

    const map = NeptunesPride.npui.map;

    function drawDisc(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      scale: number,
      r: number,
    ) {
      context.save();
      context.translate(x, y);
      context.scale(scale, scale);
      context.moveTo(0, 0);
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.restore();
    }

    function getScaleFactor() {
      let scaleFactor = map.scale / 400;
      if (scaleFactor < 0.35) scaleFactor = 0.35;
      if (scaleFactor > 1) scaleFactor = 1;
      scaleFactor *= map.pixelRatio;
      return scaleFactor;
    }

    function lyToMap() {
      return 0.125;
    }

    function getAdjustedScanRange(player: Player) {
      const sH = combatInfo.combatHandicap;
      const scanRange = getScanValue(player) + sH * lyToMap();
      return scanRange;
    }
    function getAdjustedFleetRange(player: Player) {
      const pH = combatInfo.combatHandicap;
      const scanRange = getRangeValue(player) + pH * lyToMap();
      return scanRange;
    }
    function worldToPixels(dist: number) {
      return map.worldToScreenX(Math.abs(dist)) - map.worldToScreenX(0);
    }
    function drawStarTerritory(
      context: CanvasRenderingContext2D,
      star: any,
      outer: boolean,
    ): boolean {
      const x = map.worldToScreenX(star.x);
      const y = map.worldToScreenY(star.y);
      const scanRange = getAdjustedScanRange(star.player);
      const fleetRange = getAdjustedFleetRange(star.player);

      const maxR = Math.max(scanRange, fleetRange);

      let drawFleetRange = false;
      if (outer) {
        if (fleetRange === maxR) drawFleetRange = true;
      } else {
        if (scanRange === maxR) drawFleetRange = true;
      }
      const fudgeDown = 0.98;
      if (drawFleetRange) {
        if (star.x < map.worldViewport.left - fleetRange) return false;
        if (star.x > map.worldViewport.right + fleetRange) return false;
        if (star.y < map.worldViewport.top - fleetRange) return false;
        if (star.y > map.worldViewport.bottom + fleetRange) return false;
        const r = worldToPixels(fleetRange * fudgeDown);
        drawDisc(context, x, y, 1, r);
        return false;
      }
      if (star.x < map.worldViewport.left - scanRange) return true;
      if (star.x > map.worldViewport.right + scanRange) return true;
      if (star.y < map.worldViewport.top - scanRange) return true;
      if (star.y > map.worldViewport.bottom + scanRange) return true;
      const r = worldToPixels(scanRange * fudgeDown);
      drawDisc(context, x, y, 1, r);
      return true;
    }

    function drawStarPimple(context: CanvasRenderingContext2D, star: any) {
      const x = map.worldToScreenX(star.x);
      const y = map.worldToScreenY(star.y);
      const r = 24;
      const scaleFactor = getScaleFactor();

      drawDisc(context, x, y, scaleFactor, r);
    }
    const rawDistanceSquared = (star1: any, star2: any) => {
      const xoff = star1.x - star2.x;
      const yoff = star1.y - star2.y;
      return xoff * xoff + yoff * yoff;
    };
    const distance = (star1: any, star2: any) => {
      const xoff = star1.x - star2.x;
      const yoff = star1.y - star2.y;
      const player =
        NeptunesPride.universe.galaxy.players[star2.puid] ||
        NeptunesPride.universe.player;
      const rangeTechLevel = getTech(player, "propulsion").level;
      const fleetRange = rangeTechLevel + combatInfo.combatHandicap;
      const gatefactor = star1?.ga * star2?.ga * (fleetRange + 3) || 1;
      return (xoff * xoff + yoff * yoff) / gatefactor;
    };
    const findClosestStars = (star: any, steps: number) => {
      let stepsOut = steps;
      const map = NeptunesPride.npui.map;
      const stars = NeptunesPride.universe.galaxy.stars;
      let closest = star;
      let closestSupport = star;
      const toStars = (s: any) => {
        return stars[s.uid];
      };
      const sortedByDistanceSquared = map.sortedStarSprites.map(toStars);
      sortedByDistanceSquared.sort(
        (a: any, b: any) => distance(star, b) - distance(star, a),
      );
      let i = sortedByDistanceSquared.length;
      do {
        i -= 1;
        const candidate = sortedByDistanceSquared[i];
        const allied = alliedFleet(
          NeptunesPride.universe.galaxy.players,
          candidate.puid,
          star.puid,
          0,
        );
        if (!allied && (closest === star || stepsOut > 0)) {
          closest = candidate;
          stepsOut--;
        } else if (allied && closestSupport === star) {
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
    const drawRoutePlanner = () => {
      const drawRoute = (
        star: any,
        other: any,
        hudColor: string,
        tick: number,
        shipsPerTick: number,
      ) => {
        const visTicks = 0;
        const speed = NeptunesPride.universe.galaxy.fleet_speed;
        const color = hudColor;
        const tickDistance = Math.sqrt(rawDistanceSquared(star, other));
        const ticks = tick;
        const midX = map.worldToScreenX((star.x + other.x) / 2);
        const midY = map.worldToScreenY((star.y + other.y) / 2);

        const rotationAngle = (star1: any, star2: any) => {
          const xoff = star1.x - star2.x;
          const yoff = star1.y - star2.y;
          const flipped = xoff < 0;
          const flip = Math.PI * (flipped ? 1 : 0);
          return { angle: Math.atan2(yoff, xoff) + flip, flipped };
        };
        map.context.save();
        map.context.globalAlpha = 1;
        map.context.strokeStyle = color;
        map.context.shadowColor = "black";
        map.context.shadowOffsetX = 2;
        map.context.shadowOffsetY = 2;
        map.context.shadowBlur = 2;
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
          map.worldToScreenX(tickDistance - 2 * speed) - map.worldToScreenX(0);
        const end =
          map.worldToScreenX(tickDistance - 2 * speed) - map.worldToScreenX(0);
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
        const textColor = color;
        drawString(`[[Tick #${ticks}]]`, 0, 0, textColor);
        if (shipsPerTick) {
          map.context.translate(0, 2 * 9 * map.pixelRatio);
          const rounded = Math.round(shipsPerTick * 100) / 100;
          drawString(`${rounded} ships/h`, 0, 0, textColor);
        }
        map.context.setLineDash([]);
        map.context.restore();
        return ticks;
      };
      if (
        settings.routePlanOn &&
        (universe.selectedStar?.alliedDefenders !== undefined ||
          destinationLock !== undefined)
      ) {
        const destUid =
          destinationLock !== undefined
            ? destinationLock.uid
            : universe.selectedStar?.uid;
        const stars = NeptunesPride.universe.galaxy.stars;
        const player = NeptunesPride.universe.player;
        const rangeTechLevel = getTech(player, "propulsion").level;
        const fleetRange = getAdjustedFleetRange(player);
        const frSquared = fleetRange * fleetRange;
        const visibleStarUids = Object.keys(stars).filter(
          (k) => isVisible(stars[k]) || !isVisible(stars[destUid]),
        );
        const dijkstra = () => {
          const dist = {};
          const prev = {};
          const Q = [];
          for (const v of visibleStarUids) {
            dist[v] = Number.POSITIVE_INFINITY;
            prev[v] = undefined;
            Q.push(v);
          }
          dist[destUid] = 0;
          while (Q.length > 0) {
            let closest = 0;
            for (let candidate = 1; candidate < Q.length; ++candidate) {
              if (dist[Q[candidate]] < dist[Q[closest]]) {
                closest = candidate;
              }
            }
            const u = Q[closest];
            Q.splice(closest, 1);
            for (const v of Q) {
              const rawDistance = rawDistanceSquared(stars[u], stars[v]);
              if (rawDistance > frSquared && stars[u].wh != v) {
                continue;
              }
              const puid = NeptunesPride.universe.galaxy.player_uid;
              const hasMyProduction = stars[v].i > 0 && stars[v].puid === puid;
              const m = hasMyProduction ? 1 : Math.sqrt(rangeTechLevel + 3);
              const candidateDistance =
                m * dist[u] +
                m *
                  Math.ceil(
                    Math.sqrt(rawDistance) / calcSpeedBetweenStars(u, v, puid),
                  );
              if (candidateDistance < dist[v]) {
                dist[v] = candidateDistance;
                prev[v] = u;
              }
            }
          }
          return { dist, prev };
        };
        const { prev } = dijkstra();
        const children = {};
        for (const starUid in prev) {
          const pred = prev[starUid];
          if (pred !== undefined) {
            const player = universe.player;
            const isDesired = (suid: string) =>
              stars[suid].puid == player.uid ||
              (stars[suid].puid == -1 &&
                (prev[suid] === undefined || isDesired(prev[suid])));
            const desirable = isDesired(starUid);
            if (desirable) {
              let p = pred;
              let u = starUid;
              while (p !== undefined) {
                if (children[p] === undefined) {
                  children[p] = [];
                }
                if (children[p].indexOf(u) === -1) {
                  children[p].push(u);
                }
                u = p;
                p = prev[p];
              }
            }
          }
        }
        const dfsDraw = (uid: number, tick: number, parent?: number) => {
          let shipsPerTick = 0;
          const puid = player.uid;
          for (let i = 0; i < children[uid]?.length; ++i) {
            const child = children[uid][i];
            const rawDistance = rawDistanceSquared(stars[child], stars[uid]);
            const ticks = Math.ceil(
              Math.sqrt(rawDistance) / calcSpeedBetweenStars(child, uid, puid),
            );
            shipsPerTick += dfsDraw(child, tick + ticks, uid);
          }
          if (stars[uid].puid === puid) {
            shipsPerTick += stars[uid].shipsPerTick;
          }
          if (parent) {
            const dim = shipsPerTick ? "#088808" : "#888888";
            const bright = shipsPerTick ? "#08ee08" : "#aaaaaa";
            drawRoute(
              stars[parent],
              stars[uid],
              destinationLock ? bright : dim,
              tick,
              shipsPerTick,
            );
          }
          return shipsPerTick;
        };
        routeParents = prev;
        routeChildren = children;
        dfsDraw(destUid, universe.galaxy.tick);
      }
    };
    const drawInvasionPlanner = () => {
      const drawRoute = (
        star: any,
        other: any,
        hudColor: string,
        tick: number,
        shipsPerTick: number,
      ) => {
        const speed = NeptunesPride.universe.galaxy.fleet_speed;
        const tickDistance = Math.sqrt(rawDistanceSquared(star, other));
        const ticks = tick;
        const color = hudColor;
        const midX = map.worldToScreenX((star.x + other.x) / 2);
        const midY = map.worldToScreenY((star.y + other.y) / 2);

        const rotationAngle = (star1: any, star2: any) => {
          const xoff = star1.x - star2.x;
          const yoff = star1.y - star2.y;
          const flipped = xoff < 0;
          const flip = Math.PI * (flipped ? 1 : 0);
          return { angle: Math.atan2(yoff, xoff) + flip, flipped };
        };
        map.context.save();
        map.context.globalAlpha = 1;
        map.context.strokeStyle = color;
        map.context.shadowColor = "black";
        map.context.shadowOffsetX = 2;
        map.context.shadowOffsetY = 2;
        map.context.shadowBlur = 2;
        map.context.fillStyle = color;
        map.context.lineWidth = 2 * map.pixelRatio;
        map.context.lineCap = "round";
        map.context.translate(midX, midY);
        const { angle } = rotationAngle(star, other);
        map.context.rotate(angle);
        const start =
          map.worldToScreenX(tickDistance - 2 * speed) - map.worldToScreenX(0);
        const end =
          map.worldToScreenX(tickDistance - 2 * speed) - map.worldToScreenX(0);
        if (start > 0 && end > 0) {
          map.context.beginPath();
          map.context.moveTo(-start / 2, 0);
          map.context.lineTo(end / 2, 0);
          map.context.stroke();
          map.context.closePath();
        }
        map.context.textAlign = "center";
        map.context.translate(0, -8 * map.pixelRatio);
        const textColor = color;
        //drawString(`[[Tick #${ticks}]]`, 0, 0, textColor);
        if (shipsPerTick) {
          map.context.translate(0, 2 * 9 * map.pixelRatio);
          const rounded = Math.round(shipsPerTick * 100) / 100;
          //drawString(`${rounded} ships/h`, 0, 0, textColor);
        }
        map.context.setLineDash([]);
        map.context.restore();
        return ticks;
      };
      if (
        settings.invasionPlanOn &&
        (universe.selectedStar?.alliedDefenders !== undefined ||
          destinationLock !== undefined)
      ) {
        const destUid =
          destinationLock !== undefined
            ? destinationLock.uid
            : universe.selectedStar?.uid;
        const stars = NeptunesPride.universe.galaxy.stars;
        const player = NeptunesPride.universe.player;
        const rangeTechLevel = getTech(player, "propulsion").level;
        const fleetRange = getAdjustedFleetRange(player);
        const frSquared = fleetRange * fleetRange;
        const visibleStarUids = Object.keys(stars).filter(
          (k) => isVisible(stars[k]) || !isVisible(stars[destUid]) || true,
        );
        const prim = () => {
          const dist = {};
          const prev = {};
          const Q = [];
          for (const v of visibleStarUids) {
            dist[v] = Number.POSITIVE_INFINITY;
            prev[v] = undefined;
            Q.push(v);
          }
          dist[destUid] = 0;
          while (Q.length > 0) {
            let closest = 0;
            for (let candidate = 1; candidate < Q.length; ++candidate) {
              if (dist[Q[candidate]] < dist[Q[closest]]) {
                closest = candidate;
              }
            }
            const u = Q[closest];
            Q.splice(closest, 1);
            for (const v of Q) {
              const rawDistance = rawDistanceSquared(stars[u], stars[v]);
              if (rawDistance > frSquared && stars[u].wh != v) {
                continue;
              }
              const puid = NeptunesPride.universe.galaxy.player_uid;
              const hasMyProduction = stars[v].i > 0 && stars[v].puid === puid;
              const m = hasMyProduction ? 1 : Math.sqrt(rangeTechLevel + 3);
              const candidateDistance = Math.ceil(
                Math.sqrt(rawDistance) / calcSpeedBetweenStars(u, v, puid),
              );
              if (candidateDistance < dist[v]) {
                dist[v] = candidateDistance;
                prev[v] = u;
              }
            }
          }
          return { dist, prev };
        };
        const { dist, prev } = prim();
        const children = {};
        for (const starUid in prev) {
          const pred = prev[starUid];
          if (pred !== undefined) {
            const player = universe.player;
            const desirable =
              stars[starUid].puid == player.uid ||
              stars[pred].puid == player.uid ||
              stars[starUid].puid == -1 ||
              stars[pred].puid == -1;
            if (desirable) {
              let p = pred;
              let u = starUid;
              while (p !== undefined) {
                if (children[p] === undefined) {
                  children[p] = [];
                }
                if (children[p].indexOf(u) === -1) {
                  children[p].push(u);
                }
                u = p;
                p = prev[p];
              }
            }
          }
        }
        const dfsDraw = (uid: number, tick: number, parent?: number) => {
          let shipsPerTick = 0;
          const puid = player.uid;
          for (let i = 0; i < children[uid]?.length; ++i) {
            const child = children[uid][i];
            shipsPerTick += dfsDraw(child, tick, uid);
          }
          if (stars[uid].puid === puid) {
            shipsPerTick += stars[uid].shipsPerTick;
          }
          if (parent) {
            const rawDistance = rawDistanceSquared(stars[parent], stars[uid]);
            const ticks = Math.ceil(
              Math.sqrt(rawDistance) / calcSpeedBetweenStars(parent, uid, puid),
            );
            const oneTurn =
              ticks < NeptunesPride.universe.galaxy.config.turnJumpTicks;
            const friendly = stars[parent].puid === stars[uid].puid;
            const dim = oneTurn
              ? friendly
                ? "#088808"
                : "#880404"
              : "#888888";
            const bright = oneTurn
              ? friendly
                ? "#08ee08"
                : "#ee0808"
              : "#aaaaaa";
            drawRoute(
              stars[parent],
              stars[uid],
              destinationLock ? bright : dim,
              tick + ticks,
              shipsPerTick,
            );
          }
          return shipsPerTick;
        };
        dfsDraw(destUid, universe.galaxy.tick);
      }
    };
    const drawAutoRuler = () => {
      const universe = NeptunesPride.universe;
      const map = NeptunesPride.npui.map;
      if (
        universe.selectedStar?.alliedDefenders &&
        settings.autoRulerPower > 0 &&
        map.scale >= 100
      ) {
        const visTicks = NeptunesPride.universe.galaxy.turn_based
          ? turnJumpTicks()
          : 1;
        const speed = NeptunesPride.universe.galaxy.fleet_speed;
        const speedSq = speed * speed;
        const star = universe.selectedStar;
        const stepsOut = Math.ceil(settings.autoRulerPower / 2);
        const showAll = settings.autoRulerPower % 2 === 0;
        const [other, support, closerStars] = findClosestStars(star, stepsOut);
        const enemyColor = "#f3172d";
        const ineffectiveSupportColor = "#888888";
        const effectiveSupportColor = "#00ff00";
        const drawHUDRuler = (star: any, other: any, hudColor: string) => {
          let color = hudColor;
          const tickDistance = Math.sqrt(distance(star, other));
          const ticks = Math.ceil(tickDistance / speed);
          const midX = map.worldToScreenX((star.x + other.x) / 2);
          const midY = map.worldToScreenY((star.y + other.y) / 2);

          let rangeLevel = 0;
          if (other.puid !== -1) {
            const rangeRequired = (_puid: number) => {
              const origHandicap = combatInfo.combatHandicap;
              const player = NeptunesPride.universe.galaxy.players[other.puid];
              let fleetRange = getAdjustedFleetRange(player);
              const flightDistance = universe.distance(
                star.x,
                star.y,
                other.x,
                other.y,
              );
              while (
                flightDistance > fleetRange &&
                combatInfo.combatHandicap - origHandicap < 5
              ) {
                combatInfo.combatHandicap++;
                fleetRange = getAdjustedFleetRange(player);
              }
              const ret = combatInfo.combatHandicap - origHandicap;
              combatInfo.combatHandicap = origHandicap;
              return ret;
            };
            rangeLevel = rangeRequired(other.puid);
            if (rangeLevel > 0) {
              color = ineffectiveSupportColor;
            }
          }

          const rotationAngle = (star1: any, star2: any) => {
            const xoff = star1.x - star2.x;
            const yoff = star1.y - star2.y;
            const flipped = xoff < 0;
            const flip = Math.PI * (flipped ? 1 : 0);
            return { angle: Math.atan2(yoff, xoff) + flip, flipped };
          };
          map.context.save();
          map.context.globalAlpha = 1;
          map.context.strokeStyle = color;
          map.context.shadowColor = "black";
          map.context.shadowOffsetX = 2;
          map.context.shadowOffsetY = 2;
          map.context.shadowBlur = 2;
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
          const textColor =
            color === ineffectiveSupportColor
              ? ineffectiveSupportColor
              : effectiveSupportColor;
          drawString(`[[Tick #${tickNumber(ticks)}]]`, 0, 0, textColor);
          if (visArcRadius - dist + 1.0 > 1.0) {
            map.context.translate(0, 2 * 9 * map.pixelRatio);
            drawString("invisible", 0, 0, textColor);
          } else {
            if (other.puid !== -1) {
              if (rangeLevel > 0) {
                map.context.translate(0, 2 * 9 * map.pixelRatio);
                drawString(`range +${rangeLevel}`, 0, 0, textColor);
              } else {
                map.context.translate(0, 2 * 9 * map.pixelRatio);
                drawString(
                  `${isVisible(other) ? other.totalDefenses : "?"} ship${
                    other.totalDefenses !== 1 ? "s" : ""
                  }`,
                  0,
                  0,
                  textColor,
                );
              }
            }
          }
          map.context.setLineDash([]);
          map.context.restore();
          return ticks;
        };
        const enemyTicks = drawHUDRuler(star, other, enemyColor);
        const ticks = Math.ceil(Math.sqrt(distance(star, support) / speedSq));
        let enemyShips = 0;
        let enemyWS = 1;
        let defenderShips = star.totalDefenses;
        const players = NeptunesPride.universe.galaxy.players;
        let defenderWS = Math.max(
          1,
          players[star.puid]?.tech ? getWeaponsLevel(players[star.puid]) : 0,
          ...star.alliedDefenders.map((d: number) =>
            getWeaponsLevel(players[d]),
          ),
        );
        let allVisible = true;
        if (other.puid !== -1) {
          allVisible = allVisible && isVisible(other);
          enemyShips += other.totalDefenses;
          enemyWS = Math.max(enemyWS, getWeaponsLevel(players[other.puid]));
        }

        if (enemyTicks - visTicks >= ticks) {
          drawHUDRuler(star, support, effectiveSupportColor);
          if (support.puid !== -1) {
            allVisible = allVisible && isVisible(support);
            defenderShips += support.totalDefenses;
            defenderWS = Math.max(
              defenderWS,
              getWeaponsLevel(players[support.puid]),
            );
          }
        } else {
          drawHUDRuler(star, support, ineffectiveSupportColor);
        }

        for (let i = 0; showAll && i < closerStars.length; ++i) {
          const o = closerStars[i];
          if (
            alliedFleet(
              NeptunesPride.universe.galaxy.players,
              o.puid,
              star.puid,
              0,
            )
          ) {
            const ticks = Math.ceil(Math.sqrt(distance(star, o) / speedSq));
            if (enemyTicks - visTicks >= ticks) {
              drawHUDRuler(star, o, effectiveSupportColor);
              if (o.puid !== -1) {
                allVisible = allVisible && isVisible(o);
                defenderShips += o.totalDefenses;
                defenderWS = Math.max(
                  defenderWS,
                  getWeaponsLevel(players[o.puid]),
                );
              }
            } else {
              drawHUDRuler(star, o, ineffectiveSupportColor);
            }
          } else {
            drawHUDRuler(star, o, enemyColor);
            if (o.puid !== -1) {
              allVisible = allVisible && isVisible(o);
              enemyShips += o.totalDefenses;
              enemyWS = Math.max(enemyWS, getWeaponsLevel(players[o.puid]));
            }
          }
        }
        if (NeptunesPride.gameVersion !== "proteus") {
          defenderWS += 1;
        }
        while (defenderShips > 0 && enemyShips > 0) {
          enemyShips -= defenderWS;
          if (enemyShips <= 0) break;
          defenderShips -= enemyWS;
        }
        let combatOutcome =
          enemyShips <= 0 ? `${defenderShips} live` : `${enemyShips} land`;
        if (!allVisible) {
          combatOutcome += "?";
        }
        const hudX = map.worldToScreenX(star.x + 0.125);
        const hudY = map.worldToScreenY(star.y) - 9 * map.pixelRatio;
        map.context.textAlign = "left";
        drawString(combatOutcome, hudX, hudY, "#00ff00");
        let attackersWon = true;
        if (enemyShips <= 0) {
          defenderShips -= enemyWS;
          attackersWon = false;
        }
        while (defenderShips > 0 || enemyShips > 0) {
          enemyShips -= defenderWS;
          defenderShips -= enemyWS;
        }
        const yOffset = 2 * 9 * map.pixelRatio;
        if (attackersWon) {
          defenderShips = Math.min(-1, defenderShips);
          drawString(
            `${-defenderShips} needed`,
            hudX,
            hudY + yOffset,
            "#00ff00",
          );
        } else {
          enemyShips = Math.min(-1, enemyShips);
          drawString(`${-enemyShips} needed`, hudX, hudY + yOffset, "#00ff00");
        }
      }
    };
    const superDrawSelectionRing = map.drawSelectionRing.bind(map);
    const bubbleLayer = document.createElement("canvas");
    map.drawSelectionRing = () => {
      if (settings.mapnamesOn) {
        politicalMap.drawPoliticalMap(
          map.context,
          map.viewportWidth,
          map.viewportHeight,
          {
            worldToScreenX: map.worldToScreenX.bind(map),
            worldToScreenY: map.worldToScreenY.bind(map),
            worldToPixels,
          },
        );
      }

      const universe = NeptunesPride.universe;
      const galaxy = universe.galaxy;
      if (universe.selectedFleet?.uid) {
        universe.selectedFleet = galaxy.fleets[universe.selectedFleet.uid];
        universe.selectedSpaceObject =
          galaxy.fleets[universe.selectedFleet.uid];
      }
      if (universe.selectedSpaceObject?.player && settings.territoryOn) {
        const context: CanvasRenderingContext2D = map.context;
        const p = universe.selectedSpaceObject.player.uid;
        {
          let outer = false;
          do {
            outer = !outer;
            bubbleLayer.width = context.canvas.width;
            bubbleLayer.height = context.canvas.height;
            let territoryBrightness = settings.territoryBrightness;
            const bcontext: CanvasRenderingContext2D =
              territoryBrightness === 3
                ? context
                : bubbleLayer.getContext("2d");
            if (bcontext === null || bcontext === undefined) {
              console.error("Failed to create canvas context for territory");
              break;
            }
            territoryBrightness %= 3;
            const bubbles = () => {
              bcontext.beginPath();
              let scanning = false;
              const scanRange = getAdjustedScanRange(
                universe.selectedSpaceObject.player,
              );
              const fleetRange = getAdjustedFleetRange(
                universe.selectedSpaceObject.player,
              );
              for (const key in universe.galaxy.stars) {
                const star = universe.galaxy.stars[key];
                if (star.player?.uid == p) {
                  scanning = drawStarTerritory(bcontext, star, outer);
                }
              }
              const range = outer
                ? Math.max(scanRange, fleetRange)
                : Math.min(scanRange, fleetRange);
              const inRange = getWithinRange(p, range, galaxy);
              for (const star of inRange) {
                drawStarPimple(bcontext, star);
              }
              const player = universe.galaxy.players[p];
              const color = playerToColorMap(player);
              const r =
                Number.parseInt(color.substring(1, 3).toUpperCase(), 16) /
                255.0;
              const g =
                Number.parseInt(color.substring(3, 5).toUpperCase(), 16) /
                255.0;
              const b =
                Number.parseInt(color.substring(5, 7).toUpperCase(), 16) /
                255.0;
              const l = 0.299 * r + 0.587 * g + 0.114 * b;
              const a = Math.max((1 - l) / 4, 0.1) * territoryBrightness;
              const c = (x: number) => Math.floor(x * 255);
              const cc = `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${a})`;
              bcontext.fillStyle = cc;
              bcontext.strokeStyle = `${color}aa`;
              bcontext.lineWidth = 2 * map.pixelRatio;
              if (territoryBrightness === 0) {
                if (bcontext.globalCompositeOperation === "destination-out") {
                  bcontext.fillStyle = "#fff";
                  bcontext.fill();
                } else {
                  if (scanning) {
                    bcontext.setLineDash([
                      4 * map.pixelRatio,
                      6 * map.pixelRatio,
                    ]);
                    bcontext.strokeStyle = `${color}ff`;
                  }
                  bcontext.stroke();
                  bcontext.setLineDash([]);
                }
              } else if (bcontext.globalCompositeOperation === "source-over") {
                bcontext.fill();
              }
              bcontext.closePath();
            };
            bcontext.globalCompositeOperation = "source-over";
            bubbles();
            bcontext.globalCompositeOperation = "destination-out";
            bubbles();
            bcontext.globalCompositeOperation = "source-over";
            if (context !== bcontext) {
              context.drawImage(bcontext.canvas, 0, 0);
            }
          } while (outer);
        }
      }

      superDrawSelectionRing();
    };
    const npmap = NeptunesPride.npui.map;
    const superDrawText = npmap.drawText.bind(npmap);
    NeptunesPride.npui.map.drawText = () => {
      const universe = NeptunesPride.universe;
      const map = NeptunesPride.npui.map;
      const puids = Object.keys(universe.galaxy.players);
      const huids = puids.map((x) => universe.galaxy.players[x].huid);
      for (const sss of NeptunesPride.npui.map.sortedStarSprites) {
        if (huids.indexOf(sss.uid) !== -1) {
          if (sss.playerAlias.indexOf("Homeworld") === -1) {
            sss.playerAlias += " (Homeworld)";
          }
        }
      }
      superDrawText();

      map.context.font = `${14 * map.pixelRatio}px OpenSansRegular, sans-serif`;
      map.context.fillStyle = "#FF0000";
      map.context.textAlign = "right";
      map.context.textBaseline = "middle";
      let v = version;
      if (combatInfo.combatHandicap !== 0) {
        v = `${handicapString()} ${v}`;
      }
      drawOverlayString(
        map.context,
        v,
        map.viewportWidth - 10,
        map.viewportHeight - 16 * map.pixelRatio,
      );
      if (NeptunesPride.originalPlayer === undefined) {
        NeptunesPride.originalPlayer = universe.player?.uid;
      }
      let unrealContextString = "";
      const puid = getPlayerUid(universe.galaxy);
      if (NeptunesPride.originalPlayer !== puid) {
        if (puid !== undefined) {
          unrealContextString = universe.galaxy.players[puid].alias;
        }
      }
      if (puid != universe.player.uid) {
        const alias = universe.player.alias;
        unrealContextString += ` controlling ${alias}`;
      }
      if (timeTravelTick > -1) {
        const gtick = NeptunesPride.universe.galaxy.tick;
        if (timeTravelTick === gtick) {
          const label = NeptunesPride.universe.galaxy.futureTime
            ? "Future Time @ "
            : "Time Machine @ ";
          unrealContextString = `${label} [[Tick #${timeTravelTick}#]] ${unrealContextString}`;
        } else {
          unrealContextString = `Time machine @ [[Tick #${gtick}#]] MISSING DATA for [[Tick #${timeTravelTick}#]] ${unrealContextString}`;
        }
      } else {
        unrealContextString = `${unrealContextString} [[Tick #${trueTick}#a]]`;
      }
      if (universe.batchedRequests.length > 0) {
        unrealContextString = `${universe.batchedRequests.length} orders pending (${universe.batchedRequestTimeout}s) ${unrealContextString}`;
      }
      if (unrealContextString) {
        map.context.textAlign = "right";
        drawOverlayString(
          map.context,
          unrealContextString,
          map.viewportWidth - 10,
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
        const lineHeight = 16 * map.pixelRatio;
        const radius = 2 * 0.028 * map.scale * map.pixelRatio;
        const angle = Math.atan(dy / dx);
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
        if (fleetOutcomes[universe.selectedFleet.uid]?.eta) {
          const s = fleetOutcomes[universe.selectedFleet.uid].eta;
          const o =
            fleetOutcomes[universe.selectedFleet.uid].outcome.split("\n");
          const x = map.worldToScreenX(universe.selectedFleet.x) + offsetx;
          const y = map.worldToScreenY(universe.selectedFleet.y) + offsety;
          if (offsetx < 0) {
            map.context.textAlign = "right";
          }
          drawOverlayString(map.context, s, x, y);
          for (let line = 0; line < o.length; ++line) {
            drawOverlayString(
              map.context,
              o[line],
              x,
              y + (line + 1) * lineHeight,
            );
          }
        }
      }
      if (
        !NeptunesPride.universe.galaxy.turn_based &&
        universe.timeToTick(1).length < 3
      ) {
        const lineHeight = 16 * map.pixelRatio;
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
        const xOffset = 26 * map.pixelRatio;
        //map.context.translate(xOffset, 0);
        const fleets = NeptunesPride.universe.galaxy.fleets;
        for (const f in fleets) {
          const fleet = fleets[f];
          if (
            alliedFleet(
              NeptunesPride.universe.galaxy.players,
              fleet.puid,
              universe.player.uid,
              0,
            )
          ) {
            let dx = universe.selectedStar.x - fleet.x;
            let dy = universe.selectedStar.y - fleet.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            const offsetx = xOffset;
            const offsety = 0;
            const x = map.worldToScreenX(fleet.x) + offsetx;
            const y = map.worldToScreenY(fleet.y) + offsety;
            if (
              distance >
              getScanValue(universe.galaxy.players[universe.selectedStar.puid])
            ) {
              if (fleet.path && fleet.path.length > 0) {
                dx = fleet.path[0].x - universe.selectedStar.x;
                dy = fleet.path[0].y - universe.selectedStar.y;
                distance = Math.sqrt(dx * dx + dy * dy);
                if (
                  distance <
                  getScanValue(
                    universe.galaxy.players[universe.selectedStar.puid],
                  )
                ) {
                  let stepRadius = NeptunesPride.universe.galaxy.fleet_speed;
                  if (fleet.warpSpeed) stepRadius *= 3;
                  dx = fleet.x - fleet.path[0].x;
                  dy = fleet.y - fleet.path[0].y;
                  const angle = Math.atan(dy / dx);
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
                    const x = ticks * stepx + Number(fleet.x);
                    const y = ticks * stepy + Number(fleet.y);
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
                      getScanValue(
                        universe.galaxy.players[universe.selectedStar.puid],
                      ) &&
                    ticks <= fleet.etaFirst + 1
                  );
                  ticks -= 1;
                  let visColor = "#00ff00";
                  if (anyStarCanSee(universe.selectedStar.puid, fleet)) {
                    visColor = "#888888";
                  }
                  if (map.scale >= 200) {
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
        }
        //map.context.translate(-xOffset, 0);
      }
      if (universe.ruler.stars.length == 2) {
        const p1 = universe.ruler.stars[0].puid;
        const p2 = universe.ruler.stars[1].puid;
        if (p1 !== p2 && p1 !== -1 && p2 !== -1) {
          //console.log("two star ruler");
        }
      }

      drawAutoRuler();
      drawRoutePlanner();
      drawInvasionPlanner();
    };
    let base = -1;
    let wasBatched = false;
    onTrigger("one_second_tick", () => {
      if (base === -1) {
        const msplus = msToTick(1);
        const parts = superFormatTime(msplus, true, true, true).split(" ");
        base = Number.parseInt(parts[parts.length - 1].replaceAll("s", "")) + 1;
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
      } else if (
        NeptunesPride.universe.batchedRequests.length > 0 ||
        wasBatched
      ) {
        // draw the countdown for batch requests
        wasBatched = NeptunesPride.universe.batchedRequests.length > 0;
        NeptunesPride.np.trigger("map_rebuild");
      }
    });
    const sortTable = (_: any, sortspec: string) => {
      const idCol = sortspec.split(",");
      const id = idCol[0];
      const col = Number.parseInt(idCol[1]);
      const header = document.getElementById(`${id}:${col}`);
      if (!header) return;
      const stripped = header.innerHTML.replaceAll(/[↑↓]/g, "");
      const asc = "↑";
      const desc = "↓";
      let sort: "" | "↑" | "↓" = "";
      if (header.innerHTML.indexOf(asc) !== -1) {
        sort = desc;
      } else if (header.innerHTML.indexOf(desc) !== -1) {
        sort = "";
      } else {
        sort = asc;
      }
      for (let c = 0; ; c++) {
        const h = document.getElementById(`${id}:${c}`);
        if (!h) break;
        h.innerHTML = h.innerHTML.replaceAll(/[↑↓]/g, "");
      }

      header.innerHTML = `${stripped}${sort}`;
      const rows: HTMLTableRowElement[] = [];
      for (let row = 0; ; ++row) {
        const rowId = `${id}:row#${row}`;
        const rowElement = document.getElementById(rowId);
        if (!rowElement) break;
        rows.push(rowElement as HTMLTableRowElement);
      }
      type Row = [any, number, any, HTMLTableRowElement];
      const data: Row[] = rows.map((r) => {
        const td: HTMLTableCellElement = r.getElementsByTagName("TD")[
          col
        ] as HTMLTableCellElement;
        const rowNum = Number.parseInt(r.id.split("#")[1]);
        const d = td.innerText;
        const nd = sort !== "" ? +d : rowNum;
        return [d, nd, r.id, r];
      });
      if (data.length > 1) {
        const first = data[0][3];
        const getValue = (x: any) => {
          if (/^[0-9-]/.test(x)) {
            const ret = x.match ? +x.match(/^([0-9-]*(\.[0-9]+)?)/)[0] : +x;
            return ret;
          }
          return x;
        };
        const allNumbers =
          data.filter((x) => Number.isNaN(+getValue(x[1]))).length === 0;
        if (!allNumbers) {
          data.sort();
          if (sort === desc) data.reverse();
        } else {
          if (sort === desc) {
            data.sort((a, b) => getValue(b[1]) - getValue(a[1]));
          } else {
            data.sort((a, b) => getValue(a[1]) - getValue(b[1]));
          }
        }
        const last = data[data.length - 1][3];
        const p = data[0][3].parentNode;
        p.insertBefore(last, first);
        const insert = (n: Row, f: Row) => {
          p.insertBefore(f[3], n[3]);
          return n;
        };
        data.reduce(insert, data[data.length - 1]);
      }
    };
    onTrigger("sort_table", sortTable);
    function makeTableId(s: string) {
      const symbols = /[^\w\d]/g;
      return s.replaceAll(symbols, "_").toLowerCase();
    }
    const noGotoAddition: String[] = ["ctrl+a", "ctrl+`"];
    Crux.format = (input: string, templateData: { [x: string]: any }) => {
      let s = input;
      let formatTime = Crux.formatTime;
      if (templateData?.linkTimes === false) {
        formatTime = timeText;
        templateData.linkTimes = undefined;
      }
      if (!s) {
        return "error";
      }

      let i = 0;
      let fp = 0;
      let sp = 0;
      let sub = "";
      let pattern = "";

      // look for standard patterns
      const SUBSTITUTION_LIMIT = 10000;
      while (fp >= 0 && i < SUBSTITUTION_LIMIT) {
        i = i + 1;
        fp = s.indexOf("[[");
        sp = s.indexOf("]]");
        if (sp < fp) {
          s = `${s.slice(0, sp)}?${s.slice(sp + 2)}`;
          continue;
        }
        if (fp === -1 || sp === -1) break;
        sub = s.slice(fp + 2, sp);
        pattern = `[[${sub}]]`;
        sub = sub.replaceAll("&#x3A;", ":");
        if (templateData[sub] !== undefined) {
          s = s.replace(pattern, templateData[sub]);
        } else if (/^upgrade:[eisg](:[0-9]+)+$/.test(sub)) {
          // upgrade:type:star uid:star uid:...
          const split = sub.split(":");
          const type = split[1];
          const stars = NeptunesPride.universe.galaxy.stars;
          const myuid = NeptunesPride.universe.player.uid;
          const upgrade = split
            .slice(2)
            .map((v) => stars[+v])
            .filter((s) => s && s.puid === myuid);
          const upgradeScript = upgrade
            .map(
              (star) =>
                `NeptunesPride.crux.trigger('star_dir_upgrade_${type}', '${star.uid}')`,
            )
            .join(";");
          const terms: { [key: string]: string } = {
            e: "economy",
            i: "industry",
            s: "science",
            g: "warp gates",
          };
          const value = `<span class="button button_up pad8" style="display: inline-block; margin: 3px 0;" onClick="event.preventDefault();${upgradeScript}"  >Buy ${upgrade.length} ${terms[type]}</span>`;
          s = s.replace(pattern, value);
        } else if (/^colorscheme(:[^:]+){3}$/.test(sub)) {
          // colorscheme:name:colors:shapes
          const split = sub.split(":");
          const name = split[1];
          const colors = split[2];
          const shapes = split[3];
          const value = `<span class="button button_up pad8" style="display: inline-block; margin: 3px 0;" onClick='event.preventDefault();NeptunesPride.crux.trigger("set_colorscheme_api", "${colors}:${shapes}")'"  >Import Color Scheme ${name}</span>`;
          s = s.replace(pattern, value);
        } else if (/^cash:[0-9]+:[0-9]+$/.test(sub)) {
          // cash:uid:price
          const split = sub.split(":");
          const uid = +split[1];
          const defaultCash = +split[2];
          const player = NeptunesPride.universe.galaxy.players[uid];
          const cash = player?.cash !== undefined ? player.cash : defaultCash;
          const value = `${cash}`;
          s = s.replace(pattern, value);
        } else if (/^transfer(:[0-9]+){5}$/.test(sub)) {
          const split = sub.split(":");
          const uid = +split[1];
          const defaultCash = +split[2];
          const needed = +split[3];
          const reserveUid = +split[4];
          const reserve =
            reserveUid === NeptunesPride.universe.player.uid ? +split[5] : 0;
          const player = NeptunesPride.universe.galaxy.players[uid];
          const cash = player?.cash !== undefined ? player.cash : defaultCash;
          const excess = Math.max(
            0,
            NeptunesPride.universe.player.cash - reserve,
          );
          const diff = Math.min(excess, Math.max(0, needed - cash));
          const value =
            uid === NeptunesPride.universe.player.uid
              ? needed - cash
              : Crux.format(
                  `[[sendcash:${uid}:${diff}:${diff}]]`,
                  templateData,
                );
          s = s.replace(pattern, value);
        } else if (/^Tick #[iI]nfinity$/.test(sub)) {
          s = s.replace(pattern, "∞");
        } else if (/^Tick #\d\d*(#a?)?$/.test(sub)) {
          const split = sub.split("#");
          const tick = Number.parseInt(split[1]);
          let relativeTick = tick - NeptunesPride.universe.galaxy.tick;
          if (split[2] === "a") {
            s = s.replace(pattern, `Tick #${tick}`);
          } else {
            if (split.length === 3) {
              if (settings.relativeTimes.indexOf("rel") !== -1) {
                // time travel display
                relativeTick += NeptunesPride.universe.galaxy.tick - trueTick;
              }
            }
            const msplus = msToTick(relativeTick, false);
            s = s.replace(pattern, formatTime(msplus, true));
          }
        } else if (safe_image_url(sub)) {
          s = s.replace(pattern, `<img  width="100%" src='${sub}' />`);
        } else if (youtube(sub)) {
          const embedURL = sub.replace("watch?v=", "embed/");
          console.log({ embedURL });
          s = s.replace(
            pattern,
            `<p align="center"><iframe width="280" height="158" src="${embedURL}" title="YouTube video player" frameborder="0" allow="accelerometer; encrypted-media; gyroscope; web-share" allowfullscreen></iframe><br/><a href=${sub} target="_blank">Open Youtube in a new tab</a></p>`,
          );
        } else if (
          /^api:\w{6}$/.test(sub) ||
          /^api(:|&#x3A;)\w{12}$/.test(sub)
        ) {
          let apiLink = `<a onClick='NeptunesPride.crux.trigger(\"switch_user_api\", \"${sub}\")'> View as ${sub}</a>`;
          apiLink += ` or <a onClick='NeptunesPride.crux.trigger(\"merge_user_api\", \"${sub}\")'> Merge ${sub}</a>`;
          s = s.replace(pattern, apiLink);
        } else if (/^apiv:\w{6}$/.test(sub) || /^apiv:\w{12}$/.test(sub)) {
          const apiLink = `<a onClick='NeptunesPride.crux.trigger(\"switch_user_api\", \"${sub}\")'>${sub}</a>`;
          s = s.replace(pattern, apiLink);
        } else if (/^apim:\w{6}$/.test(sub) || /^apim:\w{12}$/.test(sub)) {
          const apiLink = `<a onClick='NeptunesPride.crux.trigger(\"merge_user_api\", \"${sub}\")'>${sub}</a>`;
          s = s.replace(pattern, apiLink);
        } else if (/^viewgame:[0-9]+:.+$/.test(sub)) {
          const splits = sub.split(":");
          const gameLink = `<a onClick='NeptunesPride.crux.trigger(\"view_game\", \"${sub}\")'>${splits[1]} ${splits[2]}</a>`;
          s = s.replace(pattern, gameLink);
        } else if (/^hotkey:[^:]+$/.test(sub) || /^goto:[^:]/.test(sub)) {
          const splits = sub.split(":");
          const key = splits[1];
          const action = getHotkeyCallback(key);
          let label = action?.button || `Trigger ${sub}`;
          if (npaReportNames[label]) {
            label = npaReportNames[label];
          }
          const goto =
            splits[0] === "goto" && !noGotoAddition.includes(key)
              ? ';Mousetrap.trigger("`")'
              : "";
          const keyLink = `<span class="button button_up pad8" onClick='{Mousetrap.trigger(\"${key}\")${goto}}'>${label}</span>`;
          s = s.replace(pattern, keyLink);
        } else if (/^mail:([0-9]+:?)+$/.test(sub)) {
          const splits = sub.split(":");
          const mailScript = `NeptunesPride.inbox.clearDraft();${splits
            .slice(1)
            .map((uid) => `NeptunesPride.inbox.draft.to.push(${uid})`)
            .join(";")}`;
          const mailButton = `<span class="button button_up icon-button pad8" onClick='${mailScript};NeptunesPride.crux.trigger("show_screen", "compose")'><span class="icon-mail"/></span>`;
          s = s.replace(pattern, mailButton);
        } else if (/^footer:-?[\w- \.][\w- \.]*$/.test(sub)) {
          const splits = sub.split(":");
          const text = splits[1];
          s = s.replace(pattern, `<b>${text}</b>`);
        } else if (/^sub:[Ii]nfinity$/.test(sub)) {
          s = s.replace(pattern, `<sub style="font-size: 50%">∞</sub>`);
        } else if (/^sub:-?[\w-\.,()][\w-\.,()]*$/.test(sub)) {
          const splits = sub.split(":");
          const text = splits[1];
          s = s.replace(pattern, `<sub style="font-size: 50%">${text}</sub>`);
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
          const player = Number.parseInt(splits[1]);
          const tech = splits[2];
          const label = splits[3];
          const sendLink = `<span class="txt_warn_good" onClick='{NeptunesPride.sendTech(${player}, "${tech}")}'>${label}</span>`;
          s = s.replace(pattern, sendLink);
        } else if (/^sendalltech:\d\d*:-?[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const player = Number.parseInt(splits[1]);
          const label = splits[2];
          const sendLink = `<span class="txt_warn_good" onClick='{NeptunesPride.sendAllTech(${player})}'>${label}</span>`;
          s = s.replace(pattern, sendLink);
        } else if (/^sendcash:\d\d*:\d\d*:-?[\w-\.][\w-\.]*$/.test(sub)) {
          const splits = sub.split(":");
          const player = Number.parseInt(splits[1]);
          const amount = Number.parseInt(splits[2]);
          const label = splits[3];
          const sendLink = `<span class="txt_warn_bad" onClick='{NeptunesPride.sendCash(${player}, "${amount}")}'>${label}</span>`;
          s = s.replace(pattern, sendLink);
        } else if (sub.startsWith("data:")) {
          s = s.replace(
            pattern,
            `<div width="100%" class="screenshot"><img class="screenshot" src="${sub}"/></div>`,
          );
        } else {
          console.error(`failed substitution ${sub} in ${s}`);
          s = s.replace(pattern, `(${sub})`);
        }
      }
      // process markdown-like
      const lines = s.split(/<br ?\/?>/);
      const output = [];
      let tableTitle = "";
      let tableId = "";
      let inTable = false;
      let alignmentRow = false;
      let headerRow = false;
      let headerLine = 0;
      let alignments: string[] = [];
      for (let linen = 0; linen < lines.length; ++linen) {
        const line = lines[linen].replaceAll("&#x3A;", ":");
        if (line.indexOf("---") === 0 && line.indexOf("---", 3) !== -1) {
          inTable = !inTable;
          alignmentRow = inTable;
          tableTitle = line.substring(4, line.length - 4);
          tableId = makeTableId(tableTitle);
          if (inTable) {
            output.push(`<table id="${tableId}" class="combat_result">`);
            output.push(
              `<tr><th style="padding: 12px" colspan="10">${tableTitle}</th></tr>`,
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
          headerRow = true;
        } else if (inTable) {
          if (alignmentRow || headerRow) {
            alignmentRow = false;
            headerRow = true;
            headerLine = linen + 1;
          }
          const rowNum = linen - headerLine;
          let rowId = rowNum >= 0 ? `id='${tableId}:row#${rowNum}'` : "";
          const data = line.split("|");
          if (data.length && data[0].indexOf("<b>") !== -1) {
            rowId = "";
          }
          output.push(`<tr ${rowId} class="combat_result_teams_heading">`);
          data.forEach((d, i) => {
            let sort = "";
            let id = "";
            if (headerRow) {
              sort = `onclick='NeptunesPride.crux.trigger(\"sort_table\", \"${tableId},${i}\")'`;
              id = `id='${tableId}:${i}'`;
            }
            output.push(
              `<td ${sort} ${id} style="text-align: ${alignments[i]}" class="equal_cols">${d}</td>`,
            );
          });
          output.push("</tr>");
          headerRow = false;
        } else {
          output.push(line);
          if (linen < lines.length - 1) {
            output.push("<br>");
          }
        }
      }
      return output.join("\n");
    };
    const npui = NeptunesPride.npui;
    templates.n_p_a = "NP Agent";
    templates.npa_report_type = "Filter:";
    templates.npa_paste = "Intel";
    templates.npa_screenshot = "Screenshot";
    const superNewMessageCommentBox = npui.NewMessageCommentBox;

    const npaReportIcons: { [k: string]: string } = {
      empires: "icon-users",
      signatures: "icon-users",
      accounting: "icon-dollar",
      trading: "icon-right-open",
      research: "icon-beaker",
      ownership: "icon-star-1",
      tradeactivity: "icon-chart-line",
      combatactivity: "icon-chart-line",
      activity: "icon-chart-line",
      planets: "icon-star-1",
      fleets: "icon-rocket",
      combats: "icon-rocket",
      filteredcombats: "icon-rocket",
      onlycombats: "icon-rocket",
      stars: "icon-star-1",
      economists: "icon-dollar",
      generals: "icon-rocket",
      fa: "icon-beaker",
      api: "icon-flash",
      controls: "icon-help",
      help: "icon-help",
    };
    const npaReportNames: { [k: string]: string } = {
      empires: "Empires",
      signatures: "Tech by Empire",
      accounting: "Accounting",
      trading: "Trading",
      research: "Research",
      fleets: "Fleets (short)",
      combats: "Fleets (long)",
      filteredcombats: "Fleets (filtered)",
      onlycombats: "All Combats",
      planets: "Home Planets",
      stars: "Stars",
      ownership: "Ownership",
      tradeactivity: "Trade Activity",
      combatactivity: "Combat Activity",
      activity: "Activity",
      economists: "Economists",
      generals: "Generals",
      api: "API Keys",
      games: "Past Games",
      fa: "Formal Alliances",
      controls: "Controls",
      help: "Help",
    };
    const reportPasteHook = (_e: any, report: any) => {
      const pasteClip = () => {
        const inbox = NeptunesPride.inbox;
        inbox.commentDrafts[inbox.selectedMessage.key] += `\n${getClip()}`;
        inbox.trigger("show_screen", "diplomacy_detail");
      };
      if (report === "screenshot") {
        const maybePromise = screenshot();
        if (maybePromise) {
          maybePromise.then(pasteClip);
        }
      } else {
        pasteClip();
      }
    };
    onTrigger("paste_report", reportPasteHook);
    npui.NewMessageCommentBox = () => {
      const widget = superNewMessageCommentBox();
      const reportButton = new UI.Button(
        "npa_paste",
        "paste_report",
        "intel",
      ).grid(9.5, 12, 4.5, 3);
      reportButton.roost(widget);
      const screenShotButton = new UI.Button(
        "npa_screenshot",
        "paste_report",
        "screenshot",
      ).grid(13.5, 12, 7, 3);
      screenShotButton.roost(widget);
      return widget;
    };
    const npaReports = () => {
      const reportScreen = npui.Screen("n_p_a");

      new UI.Text("", "rel pad12 txt_center col_black  section_title")
        .rawHTML(title)
        .roost(reportScreen);
      new UI.IconButton("icon-help", "show_screen", "help")
        .grid(24.5, 0, 3, 3)
        .roost(reportScreen).onClick = npaHelp;

      const report = new UI.Widget("rel  col_accent").size(480, 48);
      const output = new UI.Widget("rel").nudge(-24, 0);

      new UI.Text("npa_report_type", "pad12").roost(report);
      reportSelector = new UI.DropDown(
        lastReport,
        npaReportNames,
        "exec_report",
      )
        .grid(15, 0, 15, 3)
        .roost(report);
      filterInput = new UI.TextInput("single").grid(5, 0, 10, 3).roost(report);
      filterInput.setValue(filterContent);

      filterInput.eventKind = "exec_report";

      let generating = false;
      let rhCounter = 0;
      const text = new UI.Text("", "pad12 rel txt_selectable")
        .size(432)
        .pos(48)

        .rawHTML("Choose a report from the dropdown.");
      text.roost(output);

      report.roost(reportScreen);
      output.roost(reportScreen);

      const runReport = async (lr: string) => {
        const start = new Date().getTime();
        let d = lr;
        if (d === undefined) {
          d = lastReport;
        }
        if (d === "help") {
          npaHelp();
          return;
        }
        lastReport = d;
        if (d === "planets") {
          homePlanets();
        } else if (d === "fleets") {
          briefFleetReport();
        } else if (d === "combats") {
          longFleetReport();
        } else if (d === "onlycombats") {
          combatReport();
        } else if (d === "filteredcombats") {
          filteredFleetReport();
        } else if (d === "stars") {
          starReport();
        } else if (d === "ownership") {
          ownershipReport();
        } else if (d === "tradeactivity") {
          tradeActivityReport();
        } else if (d === "combatactivity") {
          combatActivityReport();
        } else if (d === "fa") {
          faReport();
        } else if (d === "economists") {
          await economistReport();
        } else if (d === "activity") {
          activityReport();
        } else if (d === "trading") {
          await tradingReport();
        } else if (d === "empires") {
          await empireReport();
        } else if (d === "signatures") {
          await techSignatureReport();
        } else if (d === "generals") {
          await generalsReport();
        } else if (d === "research") {
          await researchReport();
        } else if (d === "accounting") {
          await npaLedger();
        } else if (d === "controls") {
          npaControls();
        } else if (d === "games") {
          await pastGames();
        } else if (d === "api") {
          await apiKeyReport();
        }
        let html = getClip().replace(/\n/g, "<br>");
        html = NeptunesPride.inbox.hyperlinkMessage(html);
        const end = new Date().getTime();
        const duration = end - start;
        const timing = `Time: ${duration}ms`;
        text.rawHTML(
          `${html}<br><p style="font-size: 40%;text-align: right;">${timing}</p>`,
        );
      };
      const reportHook = async (_e: number, lr: string) => {
        rhCounter++;
        generating = true;
        const key = lr || lastReport;
        const name = npaReportNames[key];
        text.rawHTML(`Generating ${name} report...`);
        window.setTimeout(() => {
          rhCounter--;
          if (rhCounter === 0) {
            runReport(lr);
            generating = false;
          }
        }, 250);
      };
      reportHook(0, lastReport);
      onTrigger("exec_report", reportHook);

      return reportScreen;
    };

    const npaMenuWidth = 292;
    npui.NpaMenuItem = (
      icon: string,
      label: string,
      event: string,
      data: string,
    ) => {
      const smi = new UI.Clickable(event, data)
        .addClass("rel side_menu_item")
        .configStyles(
          "side_menu_item_up",
          "side_menu_item_down",
          "side_menu_item_hover",
          "side_menu_item_disabled",
        )
        .size(npaMenuWidth, 40);

      new UI.Text("", "pad12 txt_center")
        .addClass(icon)
        .grid(0, -0.25, 3, 2.5)
        .rawHTML("")
        .roost(smi);

      new UI.Text(label, "pad12").grid(2, -0.25, 18, 2.5).roost(smi);

      const hotkey = getHotkey(data);
      new UI.Text("", "pad12 txt_right")
        .grid(0, -0.25, 18, 4)
        .rawHTML(`<span float='right'>${hotkey}</span>`)
        .roost(smi);

      return smi;
    };

    const showReport = (_: any, reportName: string) => {
      console.log(`SHOW: ${reportName}`);
      lastReport = reportName;
      npui.trigger("show_npa", "npa_ui_screen");
    };
    npui.npaMenu = (() => {
      const sideMenu = new UI.Widget("col_accent side_menu").size(
        npaMenuWidth,
        0,
      );

      sideMenu.isShowing = false;
      sideMenu.pinned = false;
      sideMenu.rows = 11;
      npui.sideMenuItemSize = 40;

      sideMenu.spacer = new UI.Widget("rel").size(160, 48).roost(sideMenu);

      sideMenu.showBtn = new UI.IconButton("icon-menu", "hide_side_menu")
        .grid(0, 0, 3, 3)
        .roost(sideMenu);
      sideMenu.showBtn = new UI.IconButton("icon-eye", "hide_side_menu")
        .grid(2.5, 0, 3, 3)
        .roost(sideMenu);

      new UI.Text("", "pad12 txt_right")
        .grid(0, -0.25, 18, 4.5)
        .rawHTML("<span float='right'>Hotkey</span>")
        .roost(sideMenu);

      for (const k in npaReportNames) {
        const iconName = npaReportIcons[k];
        const templateKey = `npa_key_${k}`;
        templates[templateKey] = npaReportNames[k];

        npui
          .NpaMenuItem(iconName, templateKey, "show_report", k)
          .roost(sideMenu);
      }

      sideMenu.pin = () => {
        sideMenu.show();
        sideMenu.showBtn.hide();
        sideMenu.spacer.hide();
        sideMenu.pinned = true;
        sideMenu.addClass("fixed");
      };

      sideMenu.unPin = () => {
        sideMenu.pinned = false;
        sideMenu.showBtn.show();
        sideMenu.spacer.show();
        sideMenu.removeClass("fixed");
        sideMenu.hide();
      };

      sideMenu.onPopUp = () => {
        if (sideMenu.pinned) return;
        npui.sideMenu.hide();
        sideMenu.isShowing = true;
        sideMenu.show();
        sideMenu.trigger("play_sound", "selection_open");
        sideMenu.trigger("hide_section_menu");
        sideMenu.trigger("hide_screen");
        sideMenu.trigger("cancel_fleet_orders");
      };

      sideMenu.onPopDown = () => {
        if (sideMenu.pinned) return;
        sideMenu.isShowing = false;
        sideMenu.hide();
      };

      onTrigger("show_report", showReport);
      onTrigger("show_npa_help", npaHelp);
      onTrigger("show_npa_menu", sideMenu.onPopUp);
      onTrigger("hide_side_menu", sideMenu.onPopDown);

      sideMenu.onPopDown();

      return sideMenu;
    })().roost(npui);

    const toggleMenu = () => {
      if (npui.npaMenu.isShowing) {
        npui.npaMenu.onPopDown();
      } else {
        npui.npaMenu.onPopUp();
      }
    };
    npui.status.npaMenuBtn = new UI.IconButton("icon-eye", "show_npa_menu")
      .grid(2.5, 0, 3, 3)
      .roost(npui.status);
    defineHotkey(
      "m",
      toggleMenu,
      "Toggle the display of the NPA menu.",
      "NPA Menu",
    );
    const screenChanged = (_event: any, name: any, screenConfig: any) => {
      console.log(`show_screen ${name} ${screenConfig}`);
      showingNPA = name === "npa_ui_screen";
      showingOurUI = showingNPA && screenConfig === undefined;
      showingOurOptions = showingNPA && screenConfig?.kind === "npa_options";
    };
    onTrigger("show_npa", screenChanged);
    onTrigger("show_screen", screenChanged);
    onTrigger("show_npa", (_event: any, _: any, screenConfig: any) => {
      const getScreen = () => {
        if (screenConfig === undefined) {
          return npaReports();
        }
        if (screenConfig?.kind === "npa_options") {
          return npaOptions(screenConfig);
        }
        if (screenConfig?.kind === "npa_colours") {
          return npaColours(screenConfig);
        }
        return undefined;
      };
      const npui = NeptunesPride.npui;
      npui.onHideScreen(null, true);
      npui.onHideSelectionMenu();

      npui.trigger("hide_side_menu");
      npui.trigger("reset_edit_mode");
      npui.activeScreen = getScreen();

      if (npui.activeScreen) {
        npui.screenConfig = screenConfig;
        npui.activeScreen.roost(npui.screenContainer);
        npui.layoutElement(npui.activeScreen);
      }

      jQuery(window).scrollTop(scroll);
    });
    onTrigger("refresh_interface", () => {
      if (showingNPA) {
        npui.trigger("show_npa", ["npa_ui_screen", npui.screenConfig]);
      }
    });

    const superFormatTime = Crux.formatTime;
    const timeText = (
      ms: number,
      showMinutes: boolean,
      showSeconds: boolean,
    ) => {
      if (settings.relativeTimes === "relative") {
        if (ms < 0) {
          return `-${superFormatTime(-ms, showMinutes, showSeconds)}`;
        }
        return superFormatTime(ms, showMinutes, showSeconds);
      }
      if (settings.relativeTimes === "eta") {
        if (NeptunesPride.universe.galaxy.turn_based) {
          return msToTurnString(ms, "");
        }
        return msToEtaString(ms, "");
      }
      if (settings.relativeTimes === "tick") {
        const rate = tickRate() * 60 * 1000;
        const tick = ms / rate;
        return `Tick #${Math.ceil(tick) + NeptunesPride.universe.galaxy.tick}`;
      }
      if (settings.relativeTimes === "tickrel") {
        const rate = tickRate() * 60 * 1000;
        const tick = ms / rate;
        return `${Math.ceil(tick)} ticks`;
      }
    };
    Crux.formatTime = (
      ms: number,
      showMinutes: boolean,
      showSeconds: boolean,
    ) => {
      const text = timeText(ms, showMinutes, showSeconds);
      const rate = tickRate() * 60 * 1000;
      const relTick = ms / rate;
      const absTick = Math.ceil(relTick) + NeptunesPride.universe.galaxy.tick;
      return `<a onClick='NeptunesPride.crux.trigger(\"warp_time\", \"${absTick}\")'>${text}</a>`;
    };
    const toggleRelative = () => {
      const i =
        (timeOptions.indexOf(settings.relativeTimes) + 1) % timeOptions.length;
      settings.relativeTimes = timeOptions[i];
      NeptunesPride.np.trigger("refresh_interface");
      if (NeptunesPride.npui.rulerToolbar) {
        NeptunesPride.np.trigger("show_ruler_toolbar");
      }
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

    const universe = NeptunesPride.universe;
    const superTimeToTick = universe.timeToTick.bind(universe);
    universe.timeToTick = (tick: number, wholeTime: boolean) => {
      const whole = wholeTime && settings.relativeTimes !== "eta";
      return superTimeToTick(tick, whole);
    };

    const alternateEmpireDirectory = () => {
      console.log("Empires page hooked");
      const starDir = npui.Screen("galaxy").size(480);

      npui.DirectoryTabs("emp").roost(starDir);

      const header = new UI.Widget("rel col_accent")
        .size(480, 48)
        .roost(starDir);

      const pageHTML = `
        <a onPointerUp="NeptunesPride.crux.trigger('emp_dir_page', 'inf:raw')">Infrastructure</a> |
        <a onPointerUp="NeptunesPride.crux.trigger('emp_dir_page', 'inf:prod')">Production</a> |
        <a onPointerUp="NeptunesPride.crux.trigger('emp_dir_page', 'inf:tech')">Technology</a> |
        <a onPointerUp="NeptunesPride.crux.trigger('emp_dir_page', 'col')">Colors</a>
      `;
      new UI.Text("", "pad12 col_accent").rawHTML(pageHTML).roost(header);

      const universe = NeptunesPride.universe;
      if (universe.empireDirectory.page === "col") {
        new UI.IconButton("icon-loop", "player_color_shape_reset_all")
          .grid(27, 0, 3, 3)
          .roost(header);
        new UI.IconButton("icon-light-up", "player_color_shape_zero_all")
          .grid(24.5, 0, 3, 3)
          .roost(header);
      }

      const sortedEmpires = Object.values(universe.galaxy.players).map(
        (decorate: any) => {
          const ret = { ...decorate };
          const techs = Object.keys(decorate.tech);
          for (const k of techs) {
            ret[`tech_${k}`] = decorate.tech[k].level;
          }
          return ret;
        },
      );

      if (universe.empireDirectory.sortBy === "name") {
        sortedEmpires.sort((a, b) => {
          let result = -1;
          if (a.n < b.n) {
            result = 1;
          }
          result *= universe.empireDirectory.invert;
          return result;
        });
      } else {
        sortedEmpires.sort((a, b) => {
          let result =
            b[universe.empireDirectory.sortBy] -
            a[universe.empireDirectory.sortBy];
          if (result === 0) {
            result = 1;
            if (a.n < b.n) {
              result = -1;
            }
          }
          result *= universe.empireDirectory.invert;
          return result;
        });
      }

      let html = "";
      if (universe.empireDirectory.page.startsWith("inf")) {
        const raw = [
          { title: '<span class="icon-star-1"></span>', field: "totalStars" },
          {
            title: '<span class="icon-rocket"></span>',
            field: "totalStrength",
          },
          { title: "E", field: "totalEconomy" },
          { title: "I", field: "totalIndustry" },
          { title: "S", field: "totalScience" },
        ];
        const prod = [
          { title: '<span class="icon-star-1"></span>', field: "totalStars" },
          {
            title: '<span class="icon-rocket"></span>',
            field: "totalStrength",
          },
          {
            title: '<span class="icon-rocket"></span>/h',
            field: "shipsPerTick",
          },
          { title: "$", field: "cashPerDay" },
          { title: "S", field: "totalScience" },
        ];
        const techs = Object.keys(NeptunesPride.universe.player.tech);
        const tech = techs.map((x) => {
          return { title: translateTechEmoji(x), field: `tech_${x}` };
        });
        const selector = universe.empireDirectory.page.split(":")[1];
        let fields = { raw, prod, tech }[selector as "raw" | "prod" | "tech"];
        if (fields === undefined) fields = raw;
        html = `<table class='star_directory'>
        <tr><td><a onPointerUp="NeptunesPride.crux.trigger('emp_dir_sort', 'uid')">P</a></td>
        <td class='star_directory_name'><a onPointerUp="NeptunesPride.crux.trigger('emp_dir_sort', 'name')">Name</a></td>
        <td></td>
        ${fields
          .map(
            (column) =>
              `<td><a onPointerUp="NeptunesPride.crux.trigger('emp_dir_sort', '${column.field}')">${column.title}</a></td>`,
          )
          .join("")}
        </tr>`;

        for (const empire of sortedEmpires) {
          html += `
            <tr>
            <td> ${empire.hyperlinkedBox} </td>
            <td> ${empire.hyperlinkedAlias} </td>
            <td> <a onPointerUp="NeptunesPride.crux.trigger('show_player_home_uid', ${
              empire.uid
            })" class="ic-eye">&#59146;</a></td>
            ${fields
              .map((column) => `<td> ${empire[column.field]} </td>`)
              .join("")}
            </tr>
          `;
        }
        html += "</table>";
      }

      if (universe.empireDirectory.page === "col") {
        html = `<table class='star_directory'>
        <tr><td><a onPointerUp="NeptunesPride.crux.trigger('emp_dir_sort', 'puid')">P</a></td>
        <td class='star_directory_name'><a onPointerUp="NeptunesPride.crux.trigger('emp_dir_sort', 'name')">Name</a></td>
        <td></td>
        <td><a onPointerUp="NeptunesPride.crux.trigger('emp_dir_sort', 'totalStars')">Stars</a></td>
        <td>Color</td>
        <td>Shape</td>
        </tr>`;

        for (const empire of sortedEmpires) {
          html += `
            <tr>
            <td> ${empire.hyperlinkedBox} </td>
            <td> ${empire.hyperlinkedAlias} </td>
            <td> <a onPointerUp="NeptunesPride.crux.trigger('show_player_home_uid', ${empire.uid})" class="ic-eye">&#59146;</a></td>
            <td> ${empire.totalStars} </td>
            <td> 	<a onPointerUp='NeptunesPride.crux.trigger("player_color_shape", {puid: ${empire.uid}, kind: "color", amount: 1})' class="fontello"> &#59229;</a>
                <a onPointerUp='NeptunesPride.crux.trigger("player_color_shape", {puid: ${empire.uid}, kind: "color", amount: -1})' class="fontello"> &#59230;</a> </td>
            <td> 	<a onPointerUp='NeptunesPride.crux.trigger("player_color_shape", {puid: ${empire.uid}, kind: "shape", amount: 1})' class="fontello"> &#59229;</a>
                <a onPointerUp='NeptunesPride.crux.trigger("player_color_shape", {puid: ${empire.uid}, kind: "shape", amount: -1})' class="fontello"> &#59230;</a> </td>
  
            </tr>
          `;
        }
        html += "</table>";
      }

      new UI.Text("", "rel").rawHTML(html).roost(starDir);

      return starDir;
    };
    const hookEmpireDirectory = () => {
      npui.EmpireDirectory = alternateEmpireDirectory;
    };
    defineHotkey(
      "ctrl+shift+e",
      hookEmpireDirectory,
      "Replace empire directory with NPA's version.",
      "Hook Empires",
    );

    hooksLoaded = true;
  };
  const toggleTerritory = () => {
    settings.territoryOn = !settings.territoryOn;
    mapRebuild();
  };
  defineHotkey(
    ")",
    toggleTerritory,
    "Toggle the territory display. Range and scanning for all stars of the selected empire are shown.",
    "Toggle Territory",
  );
  const toggleMapnames = () => {
    settings.mapnamesOn = !settings.mapnamesOn;
    mapRebuild();
  };
  defineHotkey(
    "ctrl+0",
    toggleMapnames,
    "Toggle the political map display. Stars are grouped into regions and labelled with the empire name that owns the region.",
    "Toggle Map Names",
  );
  const toggleRoutePlanner = () => {
    settings.routePlanOn = !settings.routePlanOn;
    mapRebuild();
  };
  defineHotkey(
    "R",
    toggleRoutePlanner,
    "Toggle the route planner display. Shows shortest paths between your stars and the front.",
    "Toggle Route Planner",
  );
  const toggleInvasionPlanner = () => {
    settings.invasionPlanOn = !settings.invasionPlanOn;
    mapRebuild();
  };
  defineHotkey(
    "ctrl+i",
    toggleInvasionPlanner,
    "Toggle the invasion planner display. Shows shortest paths between the selected empire's stars and the enemy.",
    "Toggle Invasion Planner",
  );
  const toggleRoutePlannerLock = () => {
    if (settings.routePlanOn || settings.invasionPlanOn) {
      if (destinationLock !== undefined) {
        destinationLock = undefined;
      } else {
        const universe = NeptunesPride.universe;
        if (universe.selectedStar?.alliedDefenders !== undefined) {
          destinationLock = universe.selectedStar;
        }
      }
      mapRebuild();
    }
  };
  defineHotkey(
    "L",
    toggleRoutePlannerLock,
    "Lock or unlock the route planner display.",
    "Lock Route Planner",
  );

  const toggleWhitePlayer = () => {
    const player = NeptunesPride.universe.player;
    settings.whitePlayer = !settings.whitePlayer;
    if (settings.whitePlayer) {
      setPlayerColor(player.uid, "#ffffff");
    } else {
      if (NeptunesPride.gameVersion === "proteus" || isNP4()) {
        console.log(`PREV COLOR ${player.prevColor}`, player);
        setPlayerColor(player.uid, player.prevColor);
      } else {
        if (player.prevColor !== undefined) {
          setPlayerColor(player.uid, player.prevColor);
        }
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
  const autoWaypoints = () => {
    const player = NeptunesPride.universe.player;
    const fleet = NeptunesPride.universe.selectedFleet;
    const stars = NeptunesPride.universe.galaxy.stars;
    const universe = NeptunesPride.universe;
    if (!fleet && universe.selectedStar) {
      NeptunesPride.np.trigger("show_screen", [
        "new_fleet",
        universe.selectedStar,
      ]);
      return;
    }
    if (fleet && fleet.o.length === 0 && fleet.puid === player.uid) {
      if (settings.routePlanOn && destinationLock !== undefined) {
        const orbit = stars[fleet.ouid];
        universe.defaultFleetOrderOverride = 0;
        const returnPath = [orbit];
        for (
          let pred = routeParents[fleet.ouid];
          pred;
          pred = routeParents[pred]
        ) {
          const next = stars[pred];
          if (!routeParents[pred]) {
            // start return flight
            universe.defaultFleetOrderOverride = FleetOrder.DropAll;
          } else {
            returnPath.push(next);
          }
          NeptunesPride.np.trigger("add_waypoint", next);
        }
        returnPath.reverse();
        for (const retstar of returnPath) {
          if (retstar === orbit) {
            universe.defaultFleetOrderOverride = 0;
          }
          NeptunesPride.np.trigger("add_waypoint", retstar);
        }
        fleet.loop = 1;
      }
    }
  };
  defineHotkey(
    "W",
    autoWaypoints,
    "Automatically route this fleet along the route planner's path. Only works on a fleet with no orders",
    "Autoroute",
  );
  const checkRecolor = () => {
    if (settings.whitePlayer) {
      settings.whitePlayer = false;
      toggleWhitePlayer();
    }
  };
  window.setTimeout(checkRecolor, 1000);

  function allAccessors() {
    if (!NeptunesPride.universe.galaxy.tick_rate) {
      console.log("REDEFINE PROPERTIES");
      for (const pk in NeptunesPride.universe.galaxy.players) {
        const p = NeptunesPride.universe.galaxy.players[pk];
        if (p.total_stars !== undefined) {
          console.log("skip inside for ${p.alias}");
          continue;
        }
        addAccessors(p.alias, p);
      }
      addAccessors("galaxy", NeptunesPride.universe.galaxy);
      if (NeptunesPride.universe.player_achievements === undefined) {
        addAccessors("universe", NeptunesPride.universe);
      }
    } else {
      console.log("*skip REDEFINE PROPERTIES");
    }
  }
  const loadColors = () => {
    return store
      .get("colorMap")
      .then((c) => {
        const newColors = c.split(" ");
        newColors.forEach((c: string, i: number) => {
          const uid = i + (isNP4() ? 1 : 0);
          if (NeptunesPride.universe.galaxy.players[uid]) {
            setPlayerColor(uid, c);
          }
        });
        if (NeptunesPride?.universe?.galaxy) {
          rebuildColorMap(NeptunesPride.universe.galaxy);
        }
        store.get("shapeMap").then((s) => {
          shapeMap = s.split(" ").map((x: string) => +x);
          recolorPlayers();
          NeptunesPride.np.trigger("refresh_interface");
          mapRebuild();
        });
      })
      .catch((_err) => {
        if (NeptunesPride?.universe?.galaxy) {
          rebuildColorMap(NeptunesPride.universe.galaxy);
        }
      });
  };
  const init = () => {
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
      loadColors();
      allAccessors();
      console.log("hook for all accessors");
      onTrigger("order:full_universe", allAccessors);
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

  let otherUserCode: string | undefined = undefined;
  const game = getGameNumber();
  const store = new GameStore(game);
  onTrigger("order:player_achievements", () => {
    window.setTimeout(() => {
      console.log("Initial load complete. Reinstall.");
      logCount("achievements_init");
      init();
    }, 500);
  });
  onTrigger("order:full_universe", () => {
    window.setTimeout(() => {
      console.log("Universe received. Reinstall.");
      NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
      logCount("universe_init");
      init();
    }, 500);
  });

  const loadGalaxy = (galaxy: any) => {
    const oldColors = NeptunesPride.universe.galaxy.players;
    NeptunesPride.np.onFullUniverse(null, galaxy);
    for (const uid in oldColors) {
      galaxy.players[uid].colorStyle = oldColors[uid].colorStyle;
    }
  };

  const switchUser = async (_event?: any, data?: string) => {
    if (NeptunesPride.originalPlayer === undefined) {
      NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
    }
    const code = data?.split(":")[1] || otherUserCode;
    otherUserCode = code;
    if (otherUserCode) {
      const scan = await getUserScanData(code);
      if (!cacheApiKey(code, scan)) return;
      console.log("SCAN: ", { scan });
      loadGalaxy(scan);
      NeptunesPride.npui.onHideScreen(null, true);
      NeptunesPride.np.trigger("select_player", [
        NeptunesPride.universe.player.uid,
        true,
      ]);
      logCount("switchuser_init");
      init();
    }
  };

  const cacheApiKey = (code: string, scan: any) => {
    if (scan !== undefined && getPlayerUid(scan) >= 0) {
      const key = `API:${getPlayerUid(scan)}`;
      store.get(key).then((apiCode) => {
        if (!apiCode || apiCode !== otherUserCode) {
          store.set(key, code);
        }
      });
    } else if (scan !== undefined) {
      if (otherUserCode !== "badkey") {
        store.keys().then((allKeys: string[]) => {
          const apiKeys = allKeys.filter((x) => x.startsWith("API:"));
          for (const key of apiKeys) {
            store.get(key).then((apiCode) => {
              if (apiCode === code) {
                store.set(key, "badkey");
              }
            });
          }
        });
      }
      return false;
    }
    return true;
  };
  const mergeScanData = (scan: any) => {
    const universe = NeptunesPride.universe;
    resetAliases();
    if (timeTravelTick === -1) {
      if (NeptunesPride.originalPlayer === getPlayerUid(universe.galaxy)) {
        if (getPlayerUid(scan) === getPlayerUid(universe.galaxy)) {
          return;
        }
      }
    }
    for (const muid in scan.players) {
      const gp = universe.galaxy.players[muid];
      const sp = scan.players[muid];
      if (Object.keys(gp.tech[0]).length > Object.keys(sp.tech[0]).length) {
        universe.galaxy.players[muid] = {
          ...sp,
          ...gp,
        };
      } else {
        universe.galaxy.players[muid] = {
          ...gp,
          ...sp,
        };
        universe.player.war[sp.uid] = 0;
      }
    }
    const uid = getPlayerUid(universe.galaxy);
    universe.galaxy.players[uid] = {
      ...scan.players[uid],
      ...universe.galaxy.players[uid],
    };

    const scanStars = { ...scan.stars };
    const scanFleets = { ...scan.fleets };
    if (isNP4()) {
      for (const k in scanStars) {
        if (universe.galaxy.stars[k] !== undefined) {
          const ox = scanStars[k].x - universe.galaxy.stars[k].x;
          const oy = scanStars[k].y - universe.galaxy.stars[k].y;
          if (ox !== 0 || oy !== 0) {
            for (const mk in scanStars) {
              const star = scanStars[mk];
              star.x -= ox;
              star.y -= oy;
            }
            for (const fk in scanFleets) {
              const fleet = scanFleets[fk];
              fleet.x -= ox;
              fleet.y -= oy;
            }
          }
          break;
        }
      }
    }
    universe.galaxy.stars = { ...scanStars, ...universe.galaxy.stars };
    for (const s in scanStars) {
      const star = scanStars[s];
      if (
        (isVisible(star) && !isVisible(universe.galaxy.stars[s])) ||
        star.puid === getPlayerUid(scan)
      ) {
        universe.galaxy.stars[s] = { ...universe.galaxy.stars[s], ...star };
      }
    }
    universe.galaxy.fleets = { ...scanFleets, ...universe.galaxy.fleets };
    for (const f in scanFleets) {
      const fleet = scanFleets[f];
      if (fleet.puid == getPlayerUid(scan)) {
        universe.galaxy.fleets[f] = {
          ...universe.galaxy.fleets[f],
          ...fleet,
        };
      }
    }
    const tf = 1 - msToTick(1) / (tickRate() * 60 * 1000);
    universe.galaxy.tick_fragment = tf;
    universe.galaxy.tickFragment = tf;
  };
  const mergeUser = async (_event?: any, data?: string) => {
    if (NeptunesPride.originalPlayer === undefined) {
      NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
    }
    const code = data?.split(":")[1] || otherUserCode;
    otherUserCode = code;
    if (otherUserCode) {
      const scan = await getUserScanData(code);
      if (!cacheApiKey(code, scan)) return;
      mergeScanData(scan);
      loadGalaxy(NeptunesPride.universe.galaxy);
      NeptunesPride.npui.onHideScreen(null, true);
      logCount("mergeuser_init");
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
  onTrigger("switch_user_api", switchUser);
  onTrigger("merge_user_api", mergeUser);

  const viewGame = async (_event?: any, data?: string) => {
    const splits = data?.split(":");
    const gameId = splits[1];
    NeptunesPride.gameNumber = gameId;
    const games = await buildGameMap();
    unloadServerScans();
    const keys = games[gameId] !== undefined ? games[gameId] : [splits[2]];
    allSeenKeys = keys.map((x) => `[[api:${x}]]`);
    let maxTick = 0;
    let minTick = 100000;
    for (const code of keys) {
      await watchForBlocks(code);
      if (scansExist(code)) {
        console.log(`Scans for ${code} cached`);
        for (
          let cachedScan: CachedScan = getCacheForKey(code);
          cachedScan;
          cachedScan = cachedScan.next
        ) {
          if (cachedScan.forward?.tick > maxTick) {
            maxTick = cachedScan.forward?.tick;
            trueTick = maxTick;
          }
          if (cachedScan.forward?.tick < minTick) {
            minTick = cachedScan.forward?.tick;
            trueTick = maxTick;
          }
        }
      } else {
        console.log(`No scans found for ${code}`);
      }
    }
    console.log(`Historical game loaded from tick #${minTick} to ${maxTick}`);
    warpTime(null, `${minTick}`);
    while (
      NeptunesPride.universe.galaxy.tick !== timeTravelTick &&
      timeTravelTick <= maxTick
    ) {
      timeTravel("forwards");
    }
  };
  onTrigger("view_game", viewGame);

  let timeTravelTickCaches: { [k: string]: CachedScan } = {};
  const adjustNow = (scan: any) => {
    const wholeTick = tickRate() * 60 * 1000;
    const fragment = tickFragment(scan) * wholeTick;
    const now = scan.now - fragment;
    const tick_fragment = 0; //((new Date().getTime() - now) % wholeTick)/ wholeTick;
    return { ...scan, now, tick_fragment, tickFragment: tick_fragment };
  };
  const getTimeTravelScan = (apikey: string, dir: "back" | "forwards") =>
    getTimeTravelScanForTick(timeTravelTick, apikey, dir);
  const getTimeTravelScanForTick = (
    targetTick: number,
    apikey: string,
    dir: "back" | "forwards",
  ) => {
    const api = getCodeFromApiText(apikey);
    if (!scansExist(api)) return null;
    if (
      !scanInfo[api] ||
      targetTick > scanInfo[api].lastTick ||
      targetTick < scanInfo[api].firstTick
    ) {
      console.log(
        `Destination tick ${targetTick} not in scaninfo for ${api}`,
        scanInfo[api],
      );
      return null;
    }

    let timeTravelTickCachedScan = getCacheForKey(api).next;
    if (timeTravelTickCaches[apikey] !== undefined) {
      timeTravelTickCachedScan = timeTravelTickCaches[apikey];
    } else if (dir === "back") {
      while (timeTravelTickCachedScan.next) {
        timeTravelTickCachedScan = timeTravelTickCachedScan.next;
      }
    }
    let scan = timeTravelTickCachedScan.cached;
    scan = adjustNow(scan);
    if (scan.tick < targetTick) {
      while (scan.tick < targetTick && dir === "forwards") {
        const next = timeTravelTickCachedScan.next;
        if (!next) {
          timeTravelTickCaches[apikey] = undefined;
          return null;
        }
        next.cached = patch(
          timeTravelTickCachedScan.cached,
          timeTravelTickCachedScan.forward,
        ) as ScanningData;
        timeTravelTickCachedScan.cached = undefined;
        timeTravelTickCachedScan = next;
        scan = adjustNow(next.cached);
      }
    } else if (scan.tick > targetTick) {
      while (scan.tick > targetTick && dir === "back") {
        const prev = timeTravelTickCachedScan.prev;
        if (timeTravelTickCachedScan.back === undefined) {
          timeTravelTickCaches[apikey] = undefined;
          return null;
        }
        prev.cached = patch(
          timeTravelTickCachedScan.cached,
          timeTravelTickCachedScan.back,
        ) as ScanningData;
        timeTravelTickCachedScan.cached = undefined;
        timeTravelTickCachedScan = prev;
        scan = adjustNow(prev.cached);
      }
    }
    timeTravelTickCaches[apikey] = timeTravelTickCachedScan;
    //const steps = timeTravelTickIndices[apikey] - timeTravelTickIndex;
    //console.log(`Found scan for ${targetTick} ${apikey}:${scan.tick} ${steps}`);
    return clone(scan);
  };
  const timeTravel = (dir: "back" | "forwards"): boolean => {
    if (timeTravelTick > trueTick) {
      // we are in future time machine
      if (dir === "forwards") {
        const tickOffset = timeTravelTick - NeptunesPride.universe.galaxy.tick;
        resetAliases();
        const newGalaxy = futureTime(NeptunesPride.universe.galaxy, tickOffset);
        loadGalaxy(newGalaxy);
      } else if (dir === "back") {
        warpTime(null, `${trueTick}`);
      }
      NeptunesPride.np.trigger("map_rebuild");
      return false;
    }
    const scans = allSeenKeys
      .map((k) => getTimeTravelScan(k, dir))
      .filter((scan) => scan && scan.tick === timeTravelTick);
    if (scans.length === 0) {
      NeptunesPride.np.trigger("map_rebuild");
      return false;
    }
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : getPlayerUid(NeptunesPride.universe.galaxy);
    const myScan = scans.filter((scan) => getPlayerUid(scan) === myId);
    const first = myScan.length > 0 ? myScan[0] : scans[0];
    loadGalaxy(first);

    scans.forEach(mergeScanData);
    loadGalaxy(NeptunesPride.universe.galaxy);
    logCount("timetravel_init");
    init();
  };
  const warpTime = (_event?: any, data?: string) => {
    timeTravelTick = Number.parseInt(data);
    const gtick = NeptunesPride.universe.galaxy.tick;
    if (timeTravelTick < gtick) {
      timeTravel("back");
    } else if (timeTravelTick > gtick) {
      timeTravel("forwards");
    }
  };
  onTrigger("warp_time", warpTime);
  const timeTravelBack = (onetick?: boolean) => {
    return () => {
      if (timeTravelTick === -1) {
        timeTravelTick = NeptunesPride.universe.galaxy.tick;
      }
      if (NeptunesPride.universe.galaxy.turn_based && !onetick) {
        timeTravelTick -= turnJumpTicks();
      } else {
        timeTravelTick -= 1;
      }
      if (timeTravelTick < 0) timeTravelTick = 0;
      timeTravel("back");
    };
  };
  const timeTravelForward = (onetick?: boolean) => {
    return () => {
      if (timeTravelTick === -1) {
        timeTravelTick = NeptunesPride.universe.galaxy.tick;
      }
      if (NeptunesPride.universe.galaxy.turn_based && !onetick) {
        timeTravelTick += turnJumpTicks();
      } else {
        timeTravelTick += 1;
      }
      timeTravel("forwards");
    };
  };
  defineHotkey(
    "ctrl+,",
    timeTravelBack(),
    "Go back a tick or a turn in time.",
    "Time Machine: Back",
  );
  defineHotkey(
    "ctrl+.",
    timeTravelForward(),
    "Go forward a tick or a turn in time.",
    "Time Machine: Forward",
  );
  defineHotkey(
    "shift+ctrl+.",
    timeTravelForward(true),
    "Go forward exactly a tick in time, even in turn based.",
    "Time Machine: Micro-Forward",
  );
  defineHotkey(
    "shift+ctrl+,",
    timeTravelBack(true),
    "Go back exactly a tick in time, even in turn based.",
    "Time Machine: Micro-Back",
  );
  const timeTravelBackCycle = () => {
    if (timeTravelTick === -1) {
      timeTravelTick = NeptunesPride.universe.galaxy.tick;
    }
    timeTravelTick -= productionTicks();
    if (timeTravelTick < 0) timeTravelTick = 0;
    timeTravel("back");
  };
  const timeTravelForwardCycle = () => {
    timeTravelTick += productionTicks();
    timeTravel("forwards");
  };
  defineHotkey(
    "ctrl+m",
    timeTravelBackCycle,
    `Go back in time a full cycle (${productionTicks()} ticks).`,
    `Time Machine: -${productionTicks()} ticks`,
  );
  defineHotkey(
    "ctrl+/",
    timeTravelForwardCycle,
    `Go forward a full cycle (${productionTicks()} ticks).`,
    `Time Machine: +${productionTicks()} ticks`,
  );

  let myApiKey = "";
  const recordAPICode = async (_event: any, code: string) => {
    const scan = await getUserScanData(code);
    if (!cacheApiKey(code, scan)) {
      console.error("Failed to load our own scan data?");
      myApiKey = "";
    } else {
      myApiKey = code;
      const notifications = NeptunesPride.account?.user_id;
      registerForScans(myApiKey, notifications);
      const from_color = NeptunesPride.universe.player.color;
      const to_uids = "";
      const to_aliases = "";
      const to_colors = "";
      const subject = "API Key Generated";
      const body = `Your new API key is ${code}.\n\n[[api:${code}]]`;
      NeptunesPride.inbox.trigger("server_request", {
        type: "create_game_message",
        from_color,
        to_uids,
        to_aliases,
        to_colors,
        fromColor: from_color,
        toUids: to_uids,
        toAliases: to_aliases,
        toColors: to_colors,
        subject,
        body,
      });
    }
  };
  onTrigger("order:api_code", recordAPICode);
  let lastRefreshTimestamp = 0;
  const refreshScanData = async () => {
    const timestamp = new Date().getTime();
    if (timestamp - lastRefreshTimestamp < 5 * 60 * 1000) {
      console.log(`refreshScanData called too recently, STOP`);
      rebuildColorMap(NeptunesPride.universe.galaxy);
      return;
    }
    lastRefreshTimestamp = timestamp;
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    const playerIndexes = apiKeys.map((k) => Number.parseInt(k.substring(4)));
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
    rebuildColorMap(NeptunesPride.universe.galaxy);
  };
  onTrigger("refresh_interface", refreshScanData);

  const xlate: { [k: string]: string } = {
    bank: "Banking",
    manu: "Manu",
    prop: "Range",
    rese: "Exp",
    scan: "Scan",
    terr: "Terra",
    weap: "Weapons",
    "0": "Banking",
    "1": "Exp",
    "2": "Manu",
    "3": "Range",
    "4": "Scan",
    "5": "Weapons",
    "6": "Terra",
  };
  const xlateemoji: { [k: string]: string } = {
    bank: "💰",
    manu: "🔧",
    prop: "🚀",
    rese: "🧪",
    scan: "📡",
    terr: "🌎",
    weap: "⚔️",
    "0": "💰",
    "1": "🧪",
    "2": "🔧",
    "3": "🚀",
    "4": "📡",
    "5": "⚔️",
    "6": "🌎",
  };

  const translateTech = (name: string) =>
    xlate[name.substring !== undefined ? name.substring(0, 4) : name];
  const translateTechEmoji = (name: string) => {
    return xlateemoji[name.substring(0, 4)];
  };

  const tradeCostForLevel = (level: number) => {
    if (NeptunesPride.gameVersion === "proteus") {
      return level * level * 5;
    }
    return level * NeptunesPride.universe.galaxy.config.tradeCost;
  };
  const techTable = (
    output: Stanzas,
    playerIndexes: number[],
    title: string,
  ) => {
    output.push(`--- ${title} ---`);
    let cols = ":--";
    for (let i = 0; i < playerIndexes.length; ++i) {
      cols += "|--";
    }
    output.push(cols);
    const me = NeptunesPride.universe.player.uid;
    cols = `Technology|[[#${me}]]|[[#${me}]]`;
    const allAmounts: { [k: number]: number } = {};
    const allSendAmounts: { [k: number]: number } = {};
    const columns = [];
    for (let i = 0; i < playerIndexes.length; ++i) {
      const pi = playerIndexes[i];
      if (pi === me) {
        continue;
      }
      cols += `|[[#${pi}]]`;
      allAmounts[pi] = 0;
      allSendAmounts[pi] = 0;
      columns.push(pi);
    }
    output.push(cols);
    const rows: string[] = [];
    const myTech = NeptunesPride.universe.player.tech;
    for (const pi of columns) {
      const player = NeptunesPride.universe.galaxy.players[pi];
      const levels = player.tech;
      const techs = Object.keys(player.tech);
      techs.map((t, i) => {
        if (!rows[i]) {
          rows[i] = translateTech(t);
          rows[i] += `|${myTech[t].level}`;
          rows[i] += `|${myTech[t].research}/${techCost(myTech[t])}`;
        }
        const level = levels[t].level;
        if (level < myTech[t].level) {
          rows[i] += `|[[sendtech:${pi}:${t}:${level}]]`;
          for (let incs = level; incs < myTech[t].level; ++incs) {
            allSendAmounts[pi] += tradeCostForLevel(incs + 1);
          }
        } else if (level > myTech[t].level) {
          const amount = tradeCostForLevel(myTech[t].level + 1);
          rows[i] += `|[[sendcash:${pi}:${amount}:${level}]]`;
          for (let incs = level; incs > myTech[t].level; --incs) {
            allAmounts[pi] += tradeCostForLevel(incs);
          }
        } else {
          rows[i] += `|${level}`;
        }
      });
    }
    const payFooter = [
      "[[footer:Pay for all]]",
      "",
      "",
      ...columns.map((pi: any) =>
        allAmounts[pi] > 0
          ? `[[sendcash:${pi}:${allAmounts[pi]}:${allAmounts[pi]}]]`
          : "",
      ),
    ];
    const sendFooter = [
      "[[footer:Send all]]",
      "",
      "",
      ...columns.map((pi: any) =>
        allSendAmounts[pi] > 0
          ? `[[sendalltech:${pi}:${allSendAmounts[pi]}]]`
          : "",
      ),
    ];
    for (const r of rows) output.push([r]);
    output.push([payFooter.join("|")]);
    output.push([sendFooter.join("|")]);
    output.push(`--- ${title} ---`);
  };
  const tradeScanned = () =>
    !!NeptunesPride.universe.galaxy?.config?.tradeScanned;
  const tradingReport = async () => {
    lastReport = "trading";
    const { players, playerIndexes } = await getPrimaryAlliance();
    const output: string[] = [];
    techTable(output, playerIndexes, "Allied Technology");
    let allPlayers = Object.keys(players);
    const scanned = tradeScanned() ? "Scanned " : "";
    if (tradeScanned()) {
      allPlayers = allPlayers.filter((k) =>
        isNP4()
          ? NeptunesPride.universe.player.scannedPlayers[players[k].uid]
          : NeptunesPride.universe.player.scannedPlayers.indexOf(
              players[k].uid,
            ) >= 0,
      );
    }
    const numPerTable = 5;
    for (let start = 0; start < allPlayers.length; ) {
      const subset = allPlayers.slice(start, start + numPerTable);
      const indexes = subset.map((k) => players[k].uid);
      techTable(
        output,
        indexes,
        `${scanned}Players ${start} - ${start - 1 + subset.length}`,
      );
      start += subset.length;
    }
    prepReport("trading", output);
  };
  defineHotkey(
    "e",
    tradingReport,
    "The trading report lets you review where you are relative to others and " +
      "provides shortcuts to ease trading of tech as needed.",
    "trading",
  );

  const empireTable = (
    output: Stanzas,
    playerIndexes: number[],
    title: string,
  ): any[] => {
    const fields = [
      ["total_stars", "[[:star:]]"],
      ["total_strength", "[[:carrier:]]"],
      ["shipsPerTick", "[[:carrier:]]/h"],
      ["cashPerDay", "$"],
      ["total_economy", "E"],
      ["total_industry", "I"],
      ["total_science", "S"],
    ];
    if (!isNP4()) {
      //fields = fields.filter((x) => x[0] !== "cashPerDay");
    }
    const table: Stanzas = [];
    const sums = fields.map((_x) => 0);
    table.push(`--- ${title} ---`);
    let cols = ":--";
    for (let i = 0; i < fields.length; ++i) {
      cols += "|--";
    }
    table.push(cols);
    cols = "Empire";
    for (let i = 0; i < fields.length; ++i) {
      cols += `|${fields[i][1]}`;
    }
    table.push(cols);
    const myP = NeptunesPride.universe.player;
    for (const pi of playerIndexes) {
      const row: string[] = [`[[${pi}]]`];
      const player = NeptunesPride.universe.galaxy.players[pi];
      const levels = player;
      fields
        .map((f) => f[0])
        .forEach((t, i) => {
          let myLevel = +myP[t];
          if (Number.isNaN(myLevel) && !isNP4() && t === "cashPerDay") {
            myLevel =
              myP.total_economy * 10 + getTech(myP, "banking").level * 75;
          }
          let level = +levels[t];
          if (Number.isNaN(level) && !isNP4() && t === "cashPerDay") {
            level =
              levels.total_economy * 10 + getTech(levels, "banking").level * 75;
          }
          sums[i] += level;
          level = Math.round(level * 100) / 100;
          myLevel = Math.round(myLevel * 100) / 100;
          if (level < myLevel) {
            row.push(`[[good:${level}]]`);
          } else if (level > myLevel) {
            row.push(`[[bad:${level}]]`);
          } else {
            row.push(`${level}`);
          }
        });
      table.push([row.join("|")]);
    }
    const summary = sums.map((x) => Math.trunc(x));
    table.push([["[[footer:Total]]", ...summary].join("|")]);
    table.push(`--- ${title} ---`);
    output.push(table.flat());
    return [`${title}`, ...summary];
  };
  const getAllianceSubsets = (): { [k: string]: number[] } => {
    const players = NeptunesPride.universe.galaxy.players;
    const allPlayers = Object.keys(NeptunesPride.universe.galaxy.players);
    const offset = players[0] !== undefined ? 0 : 1;
    const allianceMatch =
      settings.allianceDiscriminator === "color"
        ? colorMap.slice(0, allPlayers.length)
        : shapeMap.slice(0, allPlayers.length);
    if (settings.allianceDiscriminator === "color" && settings.whitePlayer) {
      const p = NeptunesPride.universe.player;
      allianceMatch[p.uid - offset] = p.prevColor;
    }
    const alliancePairs: [any, number][] = allianceMatch
      .map((x: any, i: string | number): [any, number] => [x, +i + offset])
      .sort();
    const subsets: { [k: string]: number[] } = {};
    for (const p of alliancePairs) {
      const player = players[p[1]];
      if (player.total_stars || player.total_strength) {
        if (subsets[p[0]] === undefined) {
          subsets[p[0]] = [p[1]];
        } else {
          subsets[p[0]].push(p[1]);
        }
      }
    }
    return subsets;
  };
  const empireReport = async () => {
    lastReport = "empires";
    const output: Stanzas = [];
    const summaryData: any[] = [];
    const computeEmpireTable = (
      output: Stanzas,
      playerIndexes: number[],
      title: string,
    ) => {
      const row = empireTable(output, playerIndexes, title);
      summaryData.push(row);
    };
    const { players, playerIndexes } = await getPrimaryAlliance();
    if (playerIndexes.length > 1) {
      empireTable(output, playerIndexes, "Allied Empires");
    }
    const unallied = [];
    const subsets = getAllianceSubsets();
    for (const k in subsets) {
      const s = subsets[k];
      if (s.length === 1) {
        unallied.push(s[0]);
      } else if (colors.indexOf(k) !== -1) {
        unallied.push(...s);
      } else {
        const nonAI = s.filter((pk) => players[pk].ai !== 1);
        const humans = `[[mail:${s.join(":")}]] Alliance ${s
          .map((uid) => `[[#${uid}]]`)
          .join("")}`;
        const title = nonAI.length > 0 ? humans : "AI";
        computeEmpireTable(output, s, title);
      }
    }
    empireTable(output, unallied, `Unallied Empires`);
    const allPlayers = Object.keys(NeptunesPride.universe.galaxy.players);
    const survivors = allPlayers
      .filter((k) => {
        return players[k].total_strength > 0;
      })
      .map((x) => +x);
    if (output.length > 0) {
      const allAlliances = `--- All Alliances [[Tick #${NeptunesPride.universe.galaxy.tick}]] ---`;
      const summary: string[] = [allAlliances];
      summary.push(output[0][1]);
      summary.push(output[0][2].replace("Empire", "Alliance"));
      const p = NeptunesPride.universe.player;
      const me = `[[#${p.uid}]]`;
      const baseStats: any[] = [];
      for (const row of summaryData) {
        if (row[0].indexOf(me) !== -1) {
          baseStats.push(...row);
        }
      }
      for (const row of summaryData) {
        let formatted = row[0];
        for (let stat = 1; stat < row.length; ++stat) {
          const v = row[stat];
          const b = baseStats[stat];
          const s = v < b ? `[[good:${v}]]` : v > b ? `[[bad:${v}]]` : `${v}`;
          formatted += `|${s}`;
        }
        summary.push(formatted);
      }
      summary.push(allAlliances);
      output.push(summary.map((x) => x.replace(/..mail.*]] Alliance /, "")));
    }
    empireTable(output, survivors, `All Surviving Empires`);

    prepReport("empires", output);
  };
  defineHotkey(
    "ctrl+l",
    empireReport,
    "The empires report summarizes all key empire stats. It's meant to be " +
      "a better leaderboard for seeing how the individual empires are doing.",
    "empires",
  );

  const techSignatureReport = async () => {
    lastReport = "signatures";
    const output: Stanzas = [];
    const techSignatures = (
      output: Stanzas,
      playerIndexes: number[],
      title: string,
    ) => {
      const player = NeptunesPride.universe.player;
      const techs = Object.keys(player.tech);
      const fields = techs.map((x) => [x, translateTechEmoji(x)]);
      const table: Stanzas = [];
      table.push(`--- ${title} ---`);
      let cols = ":--";
      for (let i = 0; i < fields.length; ++i) {
        cols += "|--";
      }
      table.push(cols);
      cols = "Empire";
      for (let i = 0; i < fields.length; ++i) {
        cols += `|${fields[i][1]}`;
      }
      table.push(cols);
      interface TechStats {
        levels: { [k: string]: number[] };
        medians: { [k: string]: number };
        summary: number[];
      }
      const myP: TechStats = { levels: {}, medians: {}, summary: [] };
      for (const t of fields.map((f) => f[0])) {
        myP.levels[t] = [];
      }
      // biome-ignore lint/complexity/noForEach: <: next time :>
      playerIndexes.forEach((pi) => {
        const player = NeptunesPride.universe.galaxy.players[pi];
        const levels = player.tech;
        // biome-ignore lint/complexity/noForEach: <: next time :>
        fields
          .map((f) => f[0])
          .forEach((t) => {
            myP.levels[t].push(levels[t].level);
          });
      });
      // biome-ignore lint/complexity/noForEach: <: next time :>
      fields
        .map((f) => f[0])
        .forEach((t) => {
          myP.levels[t].sort((a, b) => +a - +b);
          const medianHi = Math.ceil(myP.levels[t].length / 2);
          myP.medians[t] = myP.levels[t][medianHi];
          myP.summary.push(myP.medians[t]);
        });
      for (const pi of playerIndexes) {
        const row: string[] = [`[[${pi}]]`];
        const player = NeptunesPride.universe.galaxy.players[pi];
        const levels = player.tech;
        for (const t of fields.map((f) => f[0])) {
          const myLevel = myP.medians[t];
          const level = levels[t].level;
          if (level < myLevel) {
            row.push(`[[bad:${level}]]`);
          } else if (level > myLevel) {
            row.push(`[[good:${level}]]`);
          } else {
            row.push(`${level}`);
          }
        }
        table.push([row.join("|")]);
      }
      table.push([["[[footer:Signature]]", ...myP.summary].join("|")]);
      table.push(`--- ${title} ---`);
      output.push(table.flat());
    };
    const { players } = await getPrimaryAlliance();
    const unallied = [];
    const subsets = getAllianceSubsets();
    for (const k in subsets) {
      const s = subsets[k];
      if (s.length === 1) {
        unallied.push(s[0]);
      } else if (colors.indexOf(k) !== -1) {
        unallied.push(...s);
      } else {
        const nonAI = s.filter((pk) => players[pk].ai !== 1);
        const humans = `[[mail:${s.join(":")}]] Alliance ${s
          .map((uid) => `[[#${uid}]]`)
          .join("")}`;
        const title = nonAI.length > 0 ? humans : "AI";
        techSignatures(output, s, title);
      }
    }
    const allPlayers = Object.keys(NeptunesPride.universe.galaxy.players);
    const survivors = allPlayers
      .filter((k) => {
        return players[k].total_strength > 0;
      })
      .map((x) => +x);
    techSignatures(output, survivors, `All Empires`);

    prepReport("signatures", output);
  };
  defineHotkey(
    "ctrl+g",
    techSignatureReport,
    "The group tech report summarizes the technology levels of all empires. " +
      "Use it to double check alliaces or look for trading partners.",
    "signatures",
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
    templates.confirm_send_bulktech =
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
    const screenConfig = {
      message: "confirm_send_bulktech",
      messageTemplateData: {
        techs: techs.map(translateTech).join(", "),
        alias:
          (player.colourBox || player.colorBox) + player.hyperlinkedRawAlias,
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
    const targetPlayer: any = data.targetPlayer;
    const my = NeptunesPride.universe.player;
    for (let i = 0; i < data.techs.length; ++i) {
      const name = data.techs[i];
      while (targetPlayer.tech[name].level < my.tech[name].level) {
        const price =
          (targetPlayer.tech[name].level + 1) * universe.galaxy.trade_cost;
        if (universe.player.cash >= price) {
          targetPlayer.tech[name].level += 1;
          universe.player.cash -= price;
          np.trigger("server_request", {
            type: "order",
            order: `share_tech,${targetPlayer.uid},${name}`,
          });
        } else {
          break;
        }
      }
    }
    universe.selectPlayer(targetPlayer);
    np.trigger("refresh_interface");
  };
  onTrigger("send_bulktech", sendBulkTech);
  NeptunesPride.sendCash = (recipient: number, credits: number) => {
    templates.confirm_send_cash =
      "Are you sure you want to send<br>[[alias]]<br>$[[amount]] credits?";
    const npui = NeptunesPride.npui;
    const player = NeptunesPride.universe.galaxy.players[recipient];
    npui.trigger("hide_screen");
    const screenConfig = {
      message: "confirm_send_cash",
      messageTemplateData: {
        amount: credits,
        alias:
          (player.colourBox || player.colorBox) + player.hyperlinkedRawAlias,
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

  const getUserScanData = async (apiKey: string) => {
    const cacheKey = `CACHED_${apiKey}`;
    const cachedScan = await store.get(cacheKey);
    if (cachedScan) {
      const freshness = new Date().getTime() - cachedScan.now;
      const tickness = (1 - tickFragment(cachedScan)) * tickRate() * 60 * 1000;
      if (
        freshness < tickness &&
        freshness < 60 * 5 * 1000 &&
        !(await anyEventsNewerThan(cachedScan.now))
      ) {
        console.log(`Cache hit! ${cacheKey}`);
        addAccessors("galaxy", cachedScan);
        return cachedScan;
      }
    } else {
      console.log(`Cache miss! ${cacheKey}`);
      if (apiKey === "badkey") {
        return undefined;
      }
      logCount(`unexpected_cache_miss_${cacheKey}`);
    }
    const params = {
      game_number: game,
      api_version: "0.1",
      code: apiKey,
    };
    const apiurl = `https://${window.location.host}/api`;
    const api = await get(apiurl, params);
    await store.set(cacheKey, api.scanning_data);
    if (api.scanning_data) {
      addAccessors("galaxy", api.scanning_data);
    } else {
      console.error(`failed to get scanning data for ${params.code}`);
    }
    return api.scanning_data;
  };
  const getPlayerIndex = (apikey: string) =>
    Number.parseInt(apikey.substring(4));
  const getAlliedKeysAndIndexes = async () => {
    const allkeys = (await store.keys()) as string[];
    const players = NeptunesPride.universe.galaxy.players;
    const apiKeys = allkeys.filter(
      (x) => x.startsWith("API:") && players[getPlayerIndex(x)].conceded === 0,
    );
    const playerIndexes = apiKeys.map((k) => Number.parseInt(k.substring(4)));
    return { players, apiKeys, playerIndexes };
  };
  const getPrimaryAlliance = async () => {
    const galaxy = NeptunesPride.universe.galaxy;
    const player = galaxy.players[getPlayerUid(galaxy)];
    const subsets = getAllianceSubsets();
    const alliedKeys = await getAlliedKeysAndIndexes();
    for (const k in subsets) {
      const candidate = subsets[k];
      if (candidate.indexOf(player.uid) !== -1) {
        console.log(`Alliance should be ${k}: `, candidate);
        const players = NeptunesPride.universe.galaxy.players;
        const returnedKeys = [];
        const returnedUids = [];
        for (let i = 0; i < alliedKeys.playerIndexes.length; ++i) {
          const uid = alliedKeys.playerIndexes[i];
          const key = alliedKeys.apiKeys[i];
          if (candidate.indexOf(uid) !== -1) {
            returnedUids.push(uid);
            returnedKeys.push(key);
          }
        }
        if (returnedUids.length !== candidate.length) {
          // TODO: Include an error message in alliance report saying which keys are missing.
          console.error(
            "Missing API key for an alliance member.",
            returnedUids,
            alliedKeys,
          );
          //return alliedKeys;
        }
        return { players, apiKeys: returnedKeys, playerIndexes: returnedUids };
      }
    }
    return alliedKeys;
  };
  const researchReport = async () => {
    lastReport = "research";
    const { apiKeys, playerIndexes } = await getPrimaryAlliance();
    const processedUids: { [k: string]: Player } = {};
    const output: Stanzas = [];
    const player = NeptunesPride.universe.player;
    const techs = Object.keys(player.tech);
    const best: BestProgress = {};
    for (const tech of techs) {
      best[tech] = {
        level: 1,
        research: 0,
      };
    }
    output.push("--- Alliance Research Progress ---");
    output.push(":--|:--|--:|--:|--:|--");
    output.push("Empire|Tech|ETA|Progress|Sci|⬆S");
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const apiKey = await store.get(apiKeys[pii]);
      const scan = await getUserScanData(apiKey);
      if (scan) {
        for (const suid of Object.keys(scan.players)) {
          const player = scan.players[suid];
          if (player.researching === undefined) continue;
          if (processedUids[suid] !== undefined) continue;
          processedUids[suid] = player;
          const tech = player.tech[player.researching];
          const soFar = tech.research;
          const total = techCost(tech);
          const remaining = total - soFar;
          const science = player.total_science || player.totalScience;
          const researchRate = (science: number) => {
            if (NeptunesPride.gameVersion === "proteus") {
              return science * player.tech.research.level;
            }
            return science;
          };
          const tickIncr = Math.ceil(remaining / researchRate(science));
          const tick = scan.tick + tickIncr;
          let upgrade = "";
          for (let i = 1; i < 10; ++i) {
            const betterTick = Math.ceil(remaining / researchRate(science + i));
            if (betterTick < tickIncr) {
              upgrade = `${i}[[sub:${tickIncr - betterTick}]]`;
              break;
            }
          }
          const techName = translateTech(player.researching);
          const judged = `${techName}${tech.level}`;
          output.push([
            `[[${suid}]]|${judged}|[[Tick #${tick}]]|${soFar}/${total}|${science}|${upgrade}`,
          ]);
        }
      }
    }
    for (const pk in processedUids) {
      const player = processedUids[pk];
      for (const key of techs) {
        const tech = player.tech[key as TechKey];
        if (tech.level === best[key].level) {
          best[key].research = Math.max(best[key].research, tech.research);
        } else if (tech.level > best[key].level) {
          best[key].level = tech.level;
          best[key].research = tech.research;
        }
      }
    }
    output.push("--- Alliance Research Progress ---");
    type BestProgress = {
      [key: string]: {
        level: number;
        research: number;
      };
    };
    output.push("--- All Alliance Research ---");
    output.push(`:--|${techs.map(() => "--:").join("|")}`);
    output.push(
      `Empire|${techs
        .map((key) => `[[sub:L${best[key].level}]] ${translateTechEmoji(key)}`)
        .join("|")}`,
    );
    for (const pk in processedUids) {
      const player = processedUids[pk];
      let line = `[[${pk}]]`;
      for (const key of techs) {
        const tech = player.tech[key as TechKey];
        let soFar = `${tech.research}`;
        if (tech.level === best[key].level) {
          if (tech.research === best[key].research) {
            soFar = `[[good:${soFar}]]`;
          }
        } else {
          soFar = `[[bad:${soFar}]]`;
        }
        line += `| ${soFar}`;
        const researchPriority = [];
        if (player.researching == key) {
          researchPriority.push(1);
        }
        if (player.researching_next == key || player.researchingNext == key) {
          researchPriority.push(2);
        }
        if (researchPriority.length > 0) {
          line += `[[sub:${researchPriority.join(",")}]]`;
        }
        if (tech.level < best[key].level) {
          line += `[[sub:(L${tech.level})]]`;
        }
      }
      output.push([line]);
    }
    output.push("--- All Alliance Research ---");
    prepReport("research", output);
  };
  defineHotkey(
    "E",
    researchReport,
    "The research report shows you tech progress for allies. The ↑S column tells you how much science is needed to reduce delivery time by at least one tick.",
    "research",
  );

  const npaLedger = async () => {
    lastReport = "accounting";
    const updated = await updateMessageCache("game_event");
    const preput: Stanzas = [];
    const output: Stanzas = [];
    if (!updated) {
      console.error("Updating message cache failed");
      output.push("Message cache stale!");
    } else {
      const balances: { [k: number]: number } = {};
      const levels: { [k: number]: number } = {};
      for (const puid in NeptunesPride.universe.galaxy.players) {
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
            output.push([`[[Tick #${tick}]]|Sent $${credits} → [[${to}]]`]);
          } else {
            output.push([`[[Tick #${tick}]]|[[${from}]] → $${credits}`]);
          }
        }
      }
      output.push("--- Cash transaction history ---");
      output.push("--- Tech transaction history ---");
      output.push(":--|:--");
      const peaceAccepted: { [k: number]: boolean } = {};
      for (let i = 0; i < messageCache.game_event.length; ++i) {
        const m = messageCache.game_event[i];

        if (m.payload.template?.startsWith("peace")) {
          console.log("Peace: ", m.payload);
          if (m.payload.price) {
            const to = m.payload.to_puid;
            const from = m.payload.from_puid;
            let credits = m.payload.price;
            if (peaceAccepted[to]) credits /= 2;
            if (from === NeptunesPride.universe.player.uid) {
              balances[to] -= credits;
            } else {
              balances[from] += credits;
            }
            const tick = m.payload.tick;
            output.push([
              `[[Tick #${tick}]]|Alliance Costs $${credits} → [[${to}]]`,
            ]);
          } else {
            const from = m.payload.from_puid;
            peaceAccepted[from] = true;
            const tick = m.payload.tick;
            output.push([`[[Tick #${tick}]]|Alliance accepted by [[${from}]]`]);
          }
        }
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
          const name = m.payload.name || m.payload.tech;
          const xlated = translateTech(name);
          if (from === NeptunesPride.universe.player.uid) {
            output.push([
              `[[Tick #${tick}]]|${xlated}${level} $${credits} → [[${to}]]`,
            ]);
          } else {
            output.push([
              `[[Tick #${tick}]]|[[${from}]] → ${xlated}${level} $${credits}`,
            ]);
          }
        }
      }
      output.push("--- Tech transaction history ---");

      preput.push("--- Ledger ---");
      preput.push(":--|--:|--:");
      preput.push(`Empire|Tech Levels|Credits`);
      for (const p in balances) {
        if (balances[p] !== 0) {
          if (balances[p] > 0) {
            preput.push([
              `[[${p}]]|${levels[p]}|[[sendcash:${p}:${balances[p]}:${balances[p]}]]`,
            ]);
          } else {
            preput.push([`[[${p}]]|${levels[p]}|[[good:${balances[p]}]]`]);
          }
        }
      }
      preput.push("--- Ledger ---\n");
    }
    prepReport("accounting", [...preput, ...output]);
  };
  defineHotkey(
    "a",
    npaLedger,
    "Perform accounting and display status.",
    "accounting",
  );

  const apiKeyReport = async () => {
    lastReport = "api";
    const allkeys = (await store.keys()) as string[];
    const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
    const mergedCodes = [];
    const output: Stanzas = [];
    output.push("--- Allied API Keys ---");
    output.push(":--|--:|--:");
    output.push("Empire|View|Merge");
    for (let i = 0; i < apiKeys.length; ++i) {
      const key = apiKeys[i];
      const player = key.substring(4);
      const code = await store.get(key);
      mergedCodes.push(code);
      output.push([`[[${player}]]|[[apiv:${code}]]|[[apim:${code}]]`]);
    }
    output.push("--- Allied API Keys ---");
    output.push("--- All Seen Keys ---");
    output.push(":--|--:|--:");
    output.push("Empire|Merge|Last?|From|To|P");
    for (const key of allSeenKeys) {
      let owner = "Unknown";
      let good = "❌";
      const code = getCodeFromApiText(key);
      if (scansExist(code)) {
        let cached = getCacheForKey(code).next;
        while (cached.next) {
          cached = cached.next;
        }
        let scan = clone(cached.check);
        let eof = scan?.eof;
        let uid = scan ? getPlayerUid(scan) : undefined;
        good = `[[Tick #${scan?.tick}]]`;
        while ((uid === undefined || eof) && cached.prev?.back) {
          scan = patch(scan, cached.prev.back) as ScanningData;
          eof = scan?.eof;
          uid = scan ? getPlayerUid(scan) : undefined;
          if (uid !== undefined) {
            good = `Dead @ [[Tick #${scan.tick}]]`;
          }
        }
        owner = `[[${uid}]]`;
      }
      const merge = key.replace(":", "m:");
      const { firstTick, lastTick, puid } = scanInfo[code] || {
        firstTick: undefined,
        lastTick: undefined,
        puid: undefined,
      };
      const user = puid !== undefined ? `[[#${puid}]]` : "?";
      const first = firstTick !== undefined ? `[[Tick #${firstTick}]]` : "?";
      const last = firstTick !== undefined ? `[[Tick #${lastTick}]]` : "?";
      output.push([`${owner}|${merge}|${good}|${first}|${last}|${user}`]);
    }
    output.push("--- All Seen Keys ---");
    prepReport("api", output);
  };
  defineHotkey("k", apiKeyReport, "Show known API keys.", "api");

  const buildGameMap = async () => {
    const databases = await indexedDB.databases();
    const games: { [k: string]: string[] & { name?: string } } = {};
    for (const d of databases) {
      if (/^[0-9]+:[0-9A-Za-z]+:scandiffblocks$/.test(d.name)) {
        const gameId = d.name.match(/^[0-9]+/)[0];
        const apiKey = d.name.match(/([0-9A-Za-z]+):scandiffblocks$/)[1];
        if (!games[gameId]) {
          games[gameId] = [];
        }
        console.log(`Record ${gameId} : ${apiKey}`);
        games[gameId].push(apiKey);
      }
    }
    for (const gameId in games) {
      for (const apikey of games[gameId]) {
        if (games[gameId].name === undefined) {
          const lastScan = await getLastRecord(+gameId, apikey);
          console.log({ lastScan });
          games[gameId].name = lastScan?.check?.name;
        }
      }
    }
    return games;
  };
  const pastGames = async () => {
    lastReport = "games";
    const output: Stanzas = [];
    output.push("Past Games: ");
    const games = await buildGameMap();
    for (const k in games) {
      const name = games[k].name;
      output.push(`[[viewgame:${k}:${name}]]`);
    }
    prepReport("games", output);
  };
  defineHotkey("ctrl+g", pastGames, "Show past games.", "games");

  const mergeAllKeys = async () => {
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

  const npaHelp = () => {
    const help = [`<H1>${title}</H1>`];
    help.push(" Neptune's Pride Agent is meant to help you focus on");
    help.push(" diplomacy and spend less time doing tedious calculations");
    help.push(" or manually sharing information.");
    help.push("<h1>Hotkey Reference</h1>");
    for (const key of getHotkeys()) {
      const action = getHotkeyCallback(key);
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
    }
    NeptunesPride.universe.helpHTML = help.join("");
    NeptunesPride.np.trigger("show_screen", "help");
  };
  defineHotkey("?", npaHelp, "Display this help screen.", "help");

  const npaControls = () => {
    const output: Stanzas = [];
    output.push("--- Controls ---");
    output.push(":--|--|--:");
    output.push("Button||Hotkey");
    const div = document.createElement("div");
    for (let key of getHotkeys()) {
      let control = `[[goto:${key}]]`;
      if (key === "?") control = `[[hotkey:${key}]]`;
      if (key === "<") key = "&lt;";
      else if (key === ">") key = "&gt;";
      else if (key === "&") key = "&amp;";
      else if (key.length === 1) {
        key = `&#${key.charCodeAt(0)};`;
      } else {
        div.innerText = key;
        key = div.innerHTML;
      }
      const partial = `${control}||${key}`;
      output.push([partial]);
    }
    output.push("--- Controls ---");
    prepReport("controls", output);
  };
  defineHotkey("~", npaControls, "Generate NPA Buttons.", "controls");

  setupAutocomplete(document.body, NeptunesPride, () => {
    return myApiKey;
  });

  if (getGameNumber() !== undefined) {
    restoreFromDB("game_event")
      .then(() => updateMessageCache("game_event"))
      .then(() => updateMessageCache("game_diplomacy"))
      .then(() => {
        window.setTimeout(async () => {
          const allkeys = (await store.keys()) as string[];
          const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
          allSeenKeys =
            messageIndex.api
              ?.flatMap((m: any) => {
                const body = m.message.body || m.message.payload?.body;
                let ret = body.match(/\[\[api(:|\&\#x3A\;)(\w{6}|\w{12})?]\]/);
                if (ret?.length > 1) {
                  ret = [`[[api:${ret[2]}]]`];
                }
                return ret;
              })
              .filter((k) => k)
              .filter((v, i, a) => a.indexOf(v) === i) || [];
          console.log("Probable API Keys: ", allSeenKeys);
          for (const x of apiKeys) {
            const key = await store.get(x);
            const check = `[[api:${key}]]`;
            if (allSeenKeys.indexOf(check) === -1) {
              allSeenKeys.push(check);
            }
          }
          console.log("Probable API Keys II: ", allSeenKeys);
          for (const key of allSeenKeys) {
            const code = getCodeFromApiText(key);
            await watchForBlocks(code);
            if (scansExist(code)) {
              console.log(`Scans for ${code} cached`);
              continue;
            }
            console.log(`Scans for ${code} not cached yet, register for them`);
            registerForScans(code);
          }
        }, 1000);
      });
  } else {
    const selects = document.getElementsByTagName("select");
    if (selects.length > 1 && selects[1].innerHTML.indexOf("Players") !== -1) {
      console.log("set up inc/dec hotkeys");
      const setSelect = (count: number) => {
        selects[1].innerHTML = "";
        const pc = document.createElement("option");
        pc.value = `${count}`;
        pc.text = `${count} Players`;
        pc.setAttribute("selected", "selected");
        selects[1].appendChild(pc);
        const change = new Event("change", { bubbles: true });
        selects[1].dispatchEvent(change);
      };
      const decrementPlayerCount = () => {
        console.log("dec");
        setSelect(+selects[1].value - 1);
      };
      const incrementPlayerCount = () => {
        console.log("inc");
        setSelect(+selects[1].value + 1);
      };
      const w = window as any;
      if (w.playerCount === undefined) {
        defineHotkey("-", decrementPlayerCount);
        defineHotkey("+", incrementPlayerCount);
        w.playerCount = selects[1].value;
      } else {
        console.log(`loaded twice? ${w.playerCount}`);
      }
    }
  }

  const loadScanData = () =>
    refreshScanData().then(() => {
      if (myApiKey) {
        console.log(`Loading scan data for key ${myApiKey}`);
        watchForBlocks(myApiKey);
      } else {
        console.log("API Key unknown. No scan history.");
      }
    });
  if (NeptunesPride.universe?.player?.uid !== undefined) {
    console.log("Universe already loaded, refresh scan data.");
    loadScanData();
  }

  if (NeptunesPride.universe?.galaxy && NeptunesPride.npui.map) {
    console.log("Universe already loaded. Hyperlink fleets & load hooks.");
    logCount("loaded_init");
    init();
  } else {
    console.log("Universe not loaded. Rely on onServerResponse.");
  }

  console.log("Neptune's Pride Agent injection fini.");
}

NeptunesPrideAgent();
