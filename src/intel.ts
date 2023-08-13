// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @version     1.18
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==

/* global Crux, NeptunesPride, jQuery, */
import { getVersion } from "./version.js";
import { safe_image_url, youtube } from "./imageutils";
import {
  setClip,
  defineHotkey,
  getClip,
  getHotkeys,
  getHotkey,
  getHotkeyCallback,
} from "./hotkey";
import {
  messageCache,
  updateMessageCache,
  restoreFromDB,
  messageIndex,
  type Message,
  anyEventsNewerThan,
} from "./events";
import { GameStore, TypedProperty } from "./gamestore";
import { post } from "./network";
import {
  getScan,
  getServerScans,
  logCount,
  logError,
  registerForScans,
  scanCache,
  scanInfo,
} from "./npaserver";
import { isWithinRange } from "./visibility";
import { setupAutocomplete } from "./autocomplete";
import { dist, Player, ScannedStar, SpaceObject, Star } from "./galaxy";
import * as Mousetrap from "mousetrap";
import { clone, patch } from "./patch";
import {
  type Stanzas,
  type Filter,
  makeReportContent,
  contains,
  and,
  or,
} from "./reports";
import { getCodeFromApiText, ScanKeyIterator, TickIterator } from "./scans";
import { isSafari } from "./useragent";
import { futureTime } from "./timetravel";
import { alliedFleet, combatInfo, combatOutcomes, fleetOutcomes, handicapString, StarState } from "./combatcalc";

interface CruxLib {
  IconButton: any;
  touchEnabled: boolean;
  crux: any;
  format: any;
  formatTime: any;
  Button: any;
  Text: any;
  Widget: any;
  DropDown: any;
  TextInput: any;
  Clickable: any;
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
  np: any;
  npui: any;
  originalPlayer: any;
  gameConfig: any;
  account: any;
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
  window.addEventListener("error", logError);
  window.addEventListener("unhandledrejection", logError);

  let title = getVersion();
  let version = title.replace(/^.*v/, "v");
  console.log(title);

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

  function onTrigger(trigger: string, fn: any) {
    if (NeptunesPride?.np?.on) {
      NeptunesPride.np.on(trigger, fn);
    } else {
      console.log(`NP not initialied yet, defer trigger for ${trigger}`);
      window.setTimeout(() => onTrigger(trigger, fn), 100);
    }
  }

  const linkFleets = function () {
    let universe = NeptunesPride.universe;
    let fleets = NeptunesPride.universe.galaxy.fleets;

    for (const f in fleets) {
      let fleet = fleets[f];
      let fleetLink = `<a onClick='Crux.crux.trigger(\"show_fleet_uid\", \"${fleet.uid}\")'>${fleet.n}</a>`;
      universe.hyperlinkedMessageInserts[fleet.n] = fleetLink;
    }
    universe.hyperlinkedMessageInserts[":carrier:"] =
      '<span class="icon-rocket"></span>';
    universe.hyperlinkedMessageInserts[":star:"] =
      '<span class="icon-star-1"></span>';
    universe.hyperlinkedMessageInserts[":mail:"] =
      '<span class="icon-mail"></span>';
  };
  const linkPlayerSymbols = function () {
    let universe = NeptunesPride.universe;
    for (let i = 0; i < 64; ++i) {
      if (universe.hyperlinkedMessageInserts[i]) {
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
  let showingOurOptions = false;
  let reportSelector: any = null;
  let filterInput: any = null;
  const showUI = () => NeptunesPride.npui.trigger("show_screen", "new_fleet");
  const showOptions = (options?: any) => {
    NeptunesPride.npui.trigger("show_screen", [
      "new_fleet",
      { kind: "npa_options", ...options },
    ]);
  };
  const configureColours = (options?: any) => {
    NeptunesPride.npui.trigger("show_screen", [
      "new_fleet",
      { kind: "npa_colours", ...options },
    ]);
  };
  const prepReport = function (
    reportName: string,
    stanzas: (string | string[])[],
    filter?: Filter,
  ) {
    const showingMenu = NeptunesPride.npui.npaMenu?.isShowing;
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
      const containsPlayer = (s: string) => {
        const players = NeptunesPride.universe.galaxy.players;
        const filters = [];
        for (let pi in players) {
          const player = players[pi];
          if (player.alias.toLowerCase().indexOf(s) !== -1) {
            filters.push(contains(`(${pi})`));
            filters.push(contains(`(#${pi})`));
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
    setClip(
      makeReportContent(stanzas, filter, (s) =>
        Crux.format(s, {}).toLowerCase(),
      ),
    );
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
    let players = NeptunesPride.universe.galaxy.players;
    let stars = NeptunesPride.universe.galaxy.stars;

    let output: Stanzas = [];
    for (const p in players) {
      const playerOutput: Stanzas = [];
      playerOutput.push(["[[{0}]]".format(p)]);
      for (const s in stars) {
        let star = stars[s];
        if (star.puid == p && star.shipsPerTick >= 0 && star.v !== 0) {
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
        }
      }
      if (playerOutput.length > 1) {
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
    let currentTick = Math.max(
      endTick - NeptunesPride.gameConfig.productionTicks,
      1,
    );
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : NeptunesPride.universe.galaxy.player_uid;
    timeTravelTickIndices = {};
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
        let newStars = scanData.stars;
        if (prior === null) prior = clone(newStars);
        let tick = scanData.tick;
        for (let k in newStars) {
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
    let output = [];
    output.push("Trading Activity:");
    const ticks = new TickIterator(getMyKeys());
    while (ticks.hasNext()) {
      ticks.next();
      const scan = ticks.getScanData();
      const seenCache: { [k: string]: { [k: string]: [string, string] } } = {};
      let memoStars: any = null;
      let memo: { [k: string]: boolean } = {};
      const sees = (sourceS: string, sinkS: string) => {
        if (memoStars !== scan.stars) {
          memoStars = scan.stars;
          memo = {};
        }
        const key = `${sourceS}->${sinkS}`;
        if (memo[key] !== undefined) {
          return memo[key];
        }
        const source = parseInt(sourceS);
        const sink = parseInt(sinkS);
        let scanRange = scan.players[source].tech.scanning.value;
        const inScanRange = (s0: Star, s1: Star) => {
          if (s0.puid === source) {
            if (s1.puid === sink) {
              let distance = dist(s0, s1);
              if (distance <= scanRange) {
                return true;
              }
            }
          }
          return false;
        };
        if (seenCache?.[source]?.[sink]) {
          const [star0, star1] = seenCache[source][sink];
          const s0 = scan.stars[star0];
          const s1 = scan.stars[star1];
          if (inScanRange(s0, s1)) {
            memo[key] = true;
            return true;
          }
        }
        for (let sk1 in scan.stars) {
          const s1 = scan.stars[sk1];
          if (s1.puid === source) {
            for (let sk2 in scan.stars) {
              const s2 = scan.stars[sk2];
              if (s2.puid === sink) {
                if (inScanRange(s1, s2)) {
                  if (seenCache[source] === undefined) {
                    seenCache[source] = {};
                  }
                  seenCache[source][sink] = [sk1, sk2];
                  memo[key] = true;
                  return true;
                }
              }
            }
          }
        }
        memo[key] = false;
        return false;
      };
      const scanRecord = ticks.getScanRecord();
      if (scanRecord.back !== undefined) {
        if (scanRecord.back.tick === undefined) {
          const changedPlayers = scanRecord.back.players;
          for (let k in changedPlayers) {
            let p = changedPlayers[k];
            if (p.tech) {
              for (let tk in p.tech) {
                let tech = translateTech(tk);
                let level = scan.players[k].tech[tk].level;
                let sourceString = "";
                for (let op in scan.players) {
                  if (op !== k) {
                    if (scan.players[op].tech[tk].level >= level) {
                      if (!tradeScanned() || sees(op, k)) {
                        sourceString += ` [[#${op}]]`;
                      }
                    }
                  }
                }
                output.push(
                  `[[Tick #${scan.tick}]] [[${k}]] ← ${tech}${level} from ${sourceString}`,
                );
              }
            }
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
    let output = [];
    output.push("Probable Combat Activity:");
    const ticks = new TickIterator(getMyKeys());
    while (ticks.hasNext()) {
      ticks.next();
      const scan = ticks.getScanData();
      const scanRecord = ticks.getScanRecord();
      if (scanRecord.back !== undefined) {
        const changedPlayers = scanRecord.back.players;
        let combatants = "";
        let countCombatants = 0;
        for (let k in changedPlayers) {
          let p = changedPlayers[k];
          if (p.total_strength) {
            const oldSt = p.total_strength;
            const newSt = scan.players[k].total_strength;
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

  interface WarRecord {
    tick: number;
    p0: number;
    p1: number;
    war: "peace" | "peace_agreement" | "war_declared" | "war";
  }
  const annalsOfWar = (): WarRecord[] => {
    let warTicks: WarRecord[] = [];
    for (let i = 0; i < messageCache.game_event.length; ++i) {
      const m = messageCache.game_event[i];
      if (m.payload.template === "war_declared") {
        let tick = m.payload.tick;
        const p0 = m.payload.attacker;
        const p1 = m.payload.defender;
        warTicks.push({ tick, p0, p1, war: "war_declared" });
        tick += 24;
        warTicks.push({ tick, p0, p1, war: "war" });
      } else if (m.payload.template === "peace_accepted") {
        let tick = m.payload.tick;
        const p0 = m.payload.from_puid;
        const p1 = m.payload.to_puid;
        warTicks.push({ tick, p0, p1, war: "peace_agreement" });
      }
    }
    return warTicks;
  };
  function faReport() {
    let output = [];

    if (allSeenKeys?.length && NeptunesPride.gameConfig.alliances != "0") {
      output.push("Formal Alliances: ");
      const keyIterators = allSeenKeys.map((k) => new ScanKeyIterator(k));
      const alliances: number[][] = [];
      for (let i = 0; i < keyIterators.length; ++i) {
        const ki = keyIterators[i];
        while (ki.hasNext()) {
          ki.next();
          const scan = ki.getScanData();
          if (scan?.fleets) {
            for (let k in scan.fleets) {
              const fleet = scan.fleets[k];
              if (fleet?.ouid !== undefined) {
                const star = scan.stars[fleet.ouid];
                if (star) {
                  if (star.puid !== fleet.puid && star.puid !== -1) {
                    if (!alliances[star.puid]) {
                      alliances[star.puid] = [];
                    }
                    if (!alliances[fleet.puid]) {
                      alliances[fleet.puid] = [];
                    }
                    const seenTick =
                      alliances[star.puid]?.[fleet.puid] || 100000;
                    const minTick = Math.min(scan.tick, seenTick);
                    alliances[star.puid][fleet.puid] = minTick;
                    alliances[fleet.puid][star.puid] = minTick;
                  }
                } else {
                  console.error(`Orbit star missing for ${fleet.n}`);
                }
              }
            }
          }
        }
      }
      let annals = annalsOfWar();
      for (let i in alliances) {
        for (let j in alliances[i]) {
          if (i < j) {
            const p0 = +i;
            const p1 = +j;
            const tick = alliances[i][j];
            annals.push({ tick, p0, p1, war: "peace" });
          }
        }
      }
      annals = annals.sort((a, b) => {
        if (a.tick === b.tick) {
          if (a.war < b.war) {
            return -1;
          }
          if (b.war < a.war) {
            return 1;
          }
        }
        return a.tick - b.tick;
      });
      for (let i = 0; i < annals.length; ++i) {
        const record = annals[i];
        const { p0, p1, war } = record;
        let d = "&#9774;&#65039;";
        if (war === "war") {
          if (alliances[p0] !== undefined) {
            alliances[p0][p1] = undefined;
          }
          d = "&#129686;"; // 🪖
        } else if (war === "war_declared") {
          d = "&#9888;&#65039;";
        } else if (war === "peace_agreement") {
          d = "&#129309";
        }
        output.push(`[[Tick #${record.tick}]] ${d} [[${p0}]] ⇔ [[${p1}]]`);
      }
      combatInfo.knownAlliances = alliances;
    } else {
      if (NeptunesPride.gameConfig.alliances != "0") {
        output.push("No API keys to detect Formal Alliances.");
      } else {
        output.push("No formal alliances in this game");
      }
    }
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
      let r: Star & Costs = {
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
      allMyStars.forEach((s) => (s.uce = universe.calcUCE(s)));
      allMyStars.forEach((s) => (s.uci = universe.calcUCI(s)));
      allMyStars.forEach((s) => (s.ucs = universe.calcUCS(s)));
      allMyStars.forEach((s) => (s.ucg = universe.calcUCG(s)));
    }
    allMyStars = allMyStars.sort(cc);
    let HEAD = 0;
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
    let allMyStars: ScannedStar[] = Object.keys(galaxy.stars)
      .map((k) => {
        return { ...galaxy.stars[k] };
      })
      .filter((s) => s.puid === myUid);
    return buyAllTheInfra(allMyStars, techType, buy).count;
  }
  async function economistReport() {
    let output = [];
    const universe = NeptunesPride.universe;
    const me = { ...universe.player };
    const myUid = me.uid;
    let originalCash = me?.cash;
    let myCash = me?.cash || 1000;
    universe.player.cash = myCash;
    const preEcon = universe.player.total_economy;
    const preInd = universe.player.total_industry;
    const preSci = universe.player.total_science;
    const buyAllTheThings = (
      balance: number,
      techType: "terra" | "bank" | "none",
    ) => {
      universe.player.cash = balance;
      let e = buyAllTheHypotheticalEconomy(techType, "E");
      universe.player.cash = balance;
      let i = buyAllTheHypotheticalEconomy(techType, "I");
      universe.player.cash = balance;
      let s = buyAllTheHypotheticalEconomy(techType, "S");
      return { e, i, s };
    };
    output.push(`--- Economists Report for [[${myUid}]] ($${myCash}) ---`);
    output.push(`:--|--:|--:`);
    output.push(`Technology|New Income (Balance)|Buys one of E/I/S`);
    let count = buyAllTheHypotheticalEconomy("none", "E");
    let cost = myCash - universe.player.cash;
    let newIncome = count * 10;
    let balance =
      universe.player.total_economy * 10 +
      universe.player.cash +
      universe.player.tech.banking.level * 75;
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
      universe.player.tech.banking.level * 75;
    ({ e, i, s } = buyAllTheThings(balance, "bank"));
    output.push([`Banking|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
    const bankCost = tradeCostForLevel(universe.player.tech.banking.level + 1);
    universe.player.cash = myCash - bankCost;
    universe.player.total_economy = preEcon;
    count = buyAllTheHypotheticalEconomy("bank", "E");
    cost = myCash - universe.player.cash + 75;
    newIncome = count * 10 + 75;
    balance =
      universe.player.total_economy * 10 +
      universe.player.cash +
      universe.player.tech.banking.level * 75;
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
      universe.player.tech.banking.level * 75;
    ({ e, i, s } = buyAllTheThings(balance, "terra"));
    output.push([`Terraforming|$${newIncome} ($${balance})|${e}/${i}/${s}`]);
    const terraCost = tradeCostForLevel(
      universe.player.tech.terraforming.level + 1,
    );
    universe.player.cash = myCash - terraCost;
    universe.player.total_economy = preEcon;
    count = buyAllTheHypotheticalEconomy("terra", "E");
    cost = myCash - universe.player.cash;
    newIncome = count * 10;
    balance =
      universe.player.total_economy * 10 +
      universe.player.cash +
      universe.player.tech.banking.level * 75;
    ({ e, i, s } = buyAllTheThings(balance, "terra"));
    output.push([
      `Buy it ($${terraCost})|$${newIncome} ($${balance})|${e}/${i}/${s}`,
    ]);
    output.push(`--- Economists Report for [[${myUid}]] (${myCash}) ---`);
    //output.push(`Bought ${count} economy for ${cost} using terraforming with ${universe.player.cash} left over.`)

    universe.player.cash = originalCash;
    const { players, apiKeys, playerIndexes } = await getPrimaryAlliance();
    let communalStars: ScannedStar[] = [];
    let starowners: { [k: string]: StarState } = {};
    // TODO: Use ally keys to determine combat outcomes.
    combatOutcomes(starowners);
    let communalMoney = 0;
    let communalEmpires: { [k: number]: { cash: number; totaluce: number } } =
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

    allMyStars.forEach((s) => {
      communalEmpires[s.originalStar.puid].totaluce += s.totaluce;
    });
    const reserve = communalEmpires[universe.player.uid].totaluce;
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
    let upgradeAll: number[] = [];
    allMyStars.forEach((s) => {
      const upgrade = s.e - s.originalStar.e;
      if (upgrade) {
        const originalStar = s.originalStar as ScannedStar & Costs;
        for (let i = 0; i < upgrade; i++) {
          upgradeAll.push(s.uid);
        }
        output.push([
          `[[#${s.originalStar.puid}]]|[[${s.n}]]|${s.originalStar.e}|${upgrade}|${s.totaluce}`,
        ]);
      }
    });
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

  function getMyKeys() {
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : NeptunesPride.universe.galaxy.player_uid;

    return allSeenKeys.filter(
      (k) => scanInfo[getCodeFromApiText(k)]?.puid === myId,
    );
  }
  function activityReport() {
    const output = [];
    let endTick = NeptunesPride.universe.galaxy.tick;
    output.push(`Activity report up to [[Tick #${endTick}]]:`);
    const playerBlock: {
      [k: string]: string[];
    } = {};
    let currentTick = 0;
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : NeptunesPride.universe.galaxy.player_uid;
    let prior = null;
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
    const startMillis = new Date().getTime();
    timeTravelTickIndices = {};
    const myKeys = getMyKeys();
    do {
      const scanList = myKeys
        .map((k) =>
          getTimeTravelScanForTick(
            currentTick,
            k,
            currentTick ? "forwards" : "back",
          ),
        )
        .filter((scan) => scan && scan.tick === currentTick);
      console.log(
        `Got ${scanList.length} scans for tick #${currentTick}`,
        scanList,
      );
      if (scanList.length > 0) {
        let myScan = scanList.filter((scan) => scan.player_uid === myId);
        let scan = myScan.length > 0 ? myScan[0] : scanList[0];
        let row = { ...scan.players, tick: scan.tick };
        if (prior === null) {
          prior = row;
        }
        const active = (p: any, last: any, manual: boolean) => {
          if (p.total_economy > last.total_economy) return true;
          if (p.total_fleets > last.total_fleets) return true;
          const manualUpgrade = p.total_stars === last.total_stars || manual;
          if (p.total_industry > last.total_industry && manualUpgrade)
            return true;
          if (p.total_science > last.total_science && manualUpgrade)
            return true;
          return false;
        };
        for (let p in players) {
          if (active(row[p], prior[p], row.tick === prior.tick)) {
            playerBlock[p].push(
              `[[Tick #${scan.tick}]]|${row[p].total_economy}|${row[p].total_industry}|${row[p].total_science}|${row[p].total_fleets}|${row[p].total_stars}`,
            );
          }
        }
        prior = row;
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
    const endMillis = new Date().getTime();
    output.push(`Time required ${endMillis - startMillis}ms`);
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

  let trueTick = 0;
  const rebuildColorMap = function (galaxy: any) {
    if (galaxy.players[0].shape !== undefined && colorMap) {
      colorMap = colorMap.map((_, uid) => {
        if (galaxy.players[uid] !== undefined) {
          return colors[galaxy.players[uid].color];
        }
        return colorMap[uid];
      });
    }
    if (galaxy.players[0].shape !== undefined && shapeMap) {
      shapeMap = shapeMap.map((_, uid) => {
        if (galaxy.players[uid] !== undefined) {
          return galaxy.players[uid].shape;
        }
        return shapeMap[uid];
      });
    }
    colorMap?.forEach((c: string, i: number) => {
      if (NeptunesPride.universe.galaxy.players[i]) {
        if (settings.whitePlayer && i === NeptunesPride.universe.player.uid) {
          return;
        }
        setPlayerColor(i, c);
      }
    });
  };
  const recordTrueTick = function (_: any, galaxy: any) {
    trueTick = galaxy.tick;
    rebuildColorMap(galaxy);
    timeTravelTick = -1;
  };
  onTrigger("order:full_universe", recordTrueTick);
  if (NeptunesPride?.universe?.galaxy?.tick !== undefined) {
    recordTrueTick(null, NeptunesPride.universe.galaxy);
  }
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
    let nowMS = new Date().getTime() + NeptunesPride.universe.locTimeCorrection;
    let now = new Date(nowMS);
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
      find = `(${find})`;
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
    prepReport(
      "fleets",
      flights.map((x) => [x[1]]),
    );
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
    var options = Crux.Widget("rel")
      .size(480, 50 * numSettings)
      .roost(screen);

    props.forEach(async (p, i) => {
      const labelKey = `npa_${p.name}`;
      NeptunesPride.templates[labelKey] = p.displayName;
      const bad = info?.missingKey === p.name ? "txt_warn_bad" : "";
      Crux.Text(labelKey, `pad12 ${bad}`)
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
        const dd = Crux.DropDown(defaultIndex, values, eventKey)
          .grid(15, 3 * i, 15, 3)
          .roost(options);
        screen.on(eventKey, (x: any, y: any) => {
          rawSettings[p.name] = values[y];
          mapRebuild();
        });
      } else {
        const field = Crux.TextInput("single")
          .grid(15, 3 * i, 15, 3)
          .roost(options);
        field.setValue(defaultValue);
        field.eventKind = "text_entry";
        screen.on(field.eventKind, (x: any, y: any) => {
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
  const npaOptions = function (info?: any) {
    const npui = NeptunesPride.npui;
    NeptunesPride.templates["npa_options"] = `NPA Settings ${version.replaceAll(
      / .*$/g,
      "",
    )}`;
    var optionsScreen = npui.Screen("npa_options");
    Crux.IconButton("icon-help", "show_screen", "help")
      .grid(24.5, 0, 3, 3)
      .roost(optionsScreen).onClick = npaHelp;

    optionsSubset(optionsScreen, (p) => true, info);

    return optionsScreen;
  };
  const clipColorConfig = function () {
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
  const npaColours = function (info?: any) {
    const npui = NeptunesPride.npui;
    NeptunesPride.templates["npa_colours"] = "Colours and Shapes";
    var colourScreen = npui.Screen("npa_colours");
    Crux.IconButton("icon-help", "show_screen", "help")
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
    var colours = Crux.Widget("rel")
      .size(480, 50 * (numPlayers + colorSwatchRows) + shapeRowHeight * 16)
      .roost(colourScreen);

    customColors.forEach((c, i) => {
      const xOffset = 3 * (i % swatchesPerRow);
      const yOffset = 3 * Math.floor(i / swatchesPerRow);
      const swatchSize = 28;
      const style = `text-align: center; vertical-align: middle; border-radius: 5px; width: ${swatchSize}px; height: ${swatchSize}px; background-color: ${c}; display: inline-block`;
      const tickMark = i === currentCustomColor ? "✓" : "";
      Crux.Text("", "pad12")
        .rawHTML(
          `<span onClick=\"Crux.crux.trigger('set_cc', ${i})\" style='${style}'>${tickMark}</span>`,
        )
        .grid(xOffset, yOffset, 3, 3)
        .roost(colours)
        .on("set_cc", (x: any, y: any) => {
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
      Crux.Text("", "pad12")
        .rawHTML(
          `<span class='playericon_font' style='${style}' onClick=\"Crux.crux.trigger('set_cs', ${i})\">${s}</span>`,
        )
        .grid(xOffset, yOffset, 3, 3)
        .roost(colours)
        .on("set_cs", (x: any, y: any) => {
          if (currentCustomShape !== y) {
            currentCustomShape = y;
            NeptunesPride.np.trigger("refresh_interface");
          }
        });
    });
    players.forEach((p, i) => {
      const name = p.alias;
      const color = colorMap[p.uid];
      const shape = shapeMap[p.uid];
      const yOffset = 3 * i + 3 * colorSwatchRows + shapeRowHeight;
      Crux.Text("", "pad12")
        .rawHTML(name)
        .grid(0, yOffset, 20, 3)
        .roost(colours);
      const shapeField = Crux.TextInput("single")
        .grid(16, yOffset, 3, 3)
        .roost(colours);
      shapeField.node.addClass("playericon_font");
      shapeField.node.css("color", color);
      shapeField.setValue(shape);
      const field = Crux.TextInput("single")
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
            shapeMap[p.uid] = newShape;
            changed = true;
          }
        }
        if (changed) {
          recolorPlayers();
          NeptunesPride.np.trigger("refresh_interface");
          mapRebuild();
          store.set("colorMap", colorMap.join(" "));
          store.set("shapeMap", shapeMap.join(" "));
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
      colourScreen.on(field.eventKind, (x: any, y: any) => {
        handleChange();
      });
      const eventName = `reset_cc_${p.uid}`;
      const button = Crux.Button(eventName, eventName, p)
        .rawHTML("Reset")
        .grid(25, yOffset, 5, 3)
        .roost(colours);
      button.on(eventName, (x: any, y: any) => {
        const shapeIndex = p.shapeIndex !== undefined ? p.shapeIndex : p.shape;
        if (
          p.prevColor &&
          (field.getValue() !== p.originalColor ||
            shapeField.getValue() != shapeIndex)
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

  const setColorScheme = function (_event?: any, data?: string) {
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

  const screenshot = function (): Promise<void> {
    let map = NeptunesPride.npui.map;
    const key = settings.ibbApiKey;
    if (!key) {
      showOptions({ missingKey: "ibbApiKey" });
      return;
    } else {
      const dataUrl = map.canvas[0].toDataURL("image/webp", 0.45);
      const split = dataUrl.indexOf(",") + 1;
      const params = {
        expiration: 2592000,
        key,
        image: dataUrl.substring(split),
      };
      return fetch(`https://api.imgbb.com/1/upload`, {
        method: "POST",
        redirect: "follow",
        body: new URLSearchParams(params as any),
      }).then((resp) => {
        return resp.json().then((r) => {
          if (r?.data?.url) {
            setClip(`[[${r.data.url}]]`);
          } else {
            const message = `Error: ${JSON.stringify(r)}`;
            logCount(message);
            setClip(message);
          }
        });
      });
    }
  };

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
    const str = Crux.format(s, { linkTimes: false });
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

  let colorMap = colors.flatMap((x) => colors);
  let shapeMap = colorMap.map((x, i) => Math.floor(i / 8));
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
      const color = colorMap[player.uid];
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
      const shapeIndex =
        player.shapeIndex !== undefined ? player.shapeIndex : player.shape;
      const shapeOffset = (shapeIndex - shapeMap[player.uid]) * 64;
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
    for (let pk in players) {
      const player = players[pk];
      const color = colorMap[player.uid];
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
      let col = 8;
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
    const superCreateSpritesStars = NeptunesPride.npui.map.createSpritesStars;
    NeptunesPride.npui.map.createSpritesStars = () => {
      superCreateSpritesStars();
      NeptunesPride.npui.map.sortedStarSprites.forEach((sss: any) => {
        if (sss.gate && sss.puid >= 0) {
          const shape = NeptunesPride.universe.galaxy.players[sss.puid].shape;
          let col = shape !== undefined ? shape : Math.floor(sss.puid / 8);
          sss.gate.spriteX = 64 * 8 + 64 * col;
        }
      });
    };

    map.starSrc.src = ownershipSprites.toDataURL();
    await map.starSrc.decode();
    for (let pk in players) {
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
      css[`.pci_48_${player.uid}`].style.background = `url("${
        map.starSrc.src
      }") -${x + 8}px -${y + 8}px`;
    }
    const universe = NeptunesPride.universe;
    for (let i in universe.galaxy.players) {
      const player = universe.galaxy.players[i];
      const recolor = `style='color: ${colorMap[player.uid]};'`;
      const shape = shapeMap[player.uid];
      player.colourBox = `<span class='playericon_font pc_${player.colorIndex}' ${recolor}>${shape}</span>`;
      player.hyperlinkedBox = `<a onClick=\"Crux.crux.trigger('show_player_uid', '${player.uid}' )\">${player.colourBox}</a>`;
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
  let loadHooks = function () {
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
      var scaleFactor = map.scale / 400;
      if (scaleFactor < 0.35) scaleFactor = 0.35;
      if (scaleFactor > 1) scaleFactor = 1;
      scaleFactor *= map.pixelRatio;
      return scaleFactor;
    }

    function lyToMap() {
      const player = NeptunesPride.universe.player;
      return player.tech.scanning.value / (player.tech.scanning.level + 2);
    }

    function getAdjustedScanRange(player: Player) {
      const sH = combatInfo.combatHandicap;
      const scanRange = player.tech.scanning.value + sH * lyToMap();
      return scanRange;
    }
    function getAdjustedFleetRange(player: Player) {
      const pH = combatInfo.combatHandicap;
      const scanRange = player.tech.propulsion.value + pH * lyToMap();
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
      } else {
        if (star.x < map.worldViewport.left - scanRange) return true;
        if (star.x > map.worldViewport.right + scanRange) return true;
        if (star.y < map.worldViewport.top - scanRange) return true;
        if (star.y > map.worldViewport.bottom + scanRange) return true;
        const r = worldToPixels(scanRange * fudgeDown);
        drawDisc(context, x, y, 1, r);
        return true;
      }
    }

    function drawStarPimple(context: CanvasRenderingContext2D, star: any) {
      const x = map.worldToScreenX(star.x);
      const y = map.worldToScreenY(star.y);
      const r = 24;
      var scaleFactor = getScaleFactor();

      drawDisc(context, x, y, scaleFactor, r);
    }
    const distance = function (star1: any, star2: any) {
      const xoff = star1.x - star2.x;
      const yoff = star1.y - star2.y;
      const gatefactor = star1?.ga * star2?.ga * 9 || 1;
      if (NeptunesPride.gameVersion === "proteus") {
        if (gatefactor > 1) {
          const actualDistanceSquared = xoff * xoff + yoff * yoff;
          const twelveTickDistance =
            12 * NeptunesPride.universe.galaxy.fleet_speed;
          const cap = twelveTickDistance * twelveTickDistance;
          return Math.min(actualDistanceSquared, cap);
        }
      }
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
        const allied = alliedFleet(NeptunesPride.universe.galaxy.players, candidate.puid, star.puid);
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
    const drawAutoRuler = function () {
      const universe = NeptunesPride.universe;
      const map = NeptunesPride.npui.map;
      if (
        universe.selectedStar?.alliedDefenders &&
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
        const enemyColor = "#f3172d";
        const ineffectiveSupportColor = "#888888";
        const effectiveSupportColor = "#00ff00";
        const drawHUDRuler = function (star: any, other: any, color: string) {
          const tickDistance = Math.sqrt(distance(star, other));
          const ticks = Math.ceil(tickDistance / speed);
          const midX = map.worldToScreenX((star.x + other.x) / 2);
          const midY = map.worldToScreenY((star.y + other.y) / 2);

          let rangeLevel = 0;
          if (other.puid !== -1) {
            const rangeRequired = (puid: number) => {
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
              let ret = combatInfo.combatHandicap - origHandicap;
              combatInfo.combatHandicap = origHandicap;
              return ret;
            };
            rangeLevel = rangeRequired(other.puid);
            if (rangeLevel > 0) {
              color = ineffectiveSupportColor;
            }
          }

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
                  `${other.v !== "0" ? other.totalDefenses : "?"} ship${
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
          players[star.puid]?.tech.weapons.level,
          ...star?.alliedDefenders.map(
            (d: number) => players[d].tech.weapons.level,
          ),
        );
        let allVisible = true;
        if (other.puid !== -1) {
          allVisible = allVisible && other.v === "1";
          enemyShips += other.totalDefenses;
          enemyWS = Math.max(enemyWS, players[other.puid].tech.weapons.level);
        }

        if (enemyTicks - visTicks >= ticks) {
          drawHUDRuler(star, support, effectiveSupportColor);
          if (support.puid !== -1) {
            allVisible = allVisible && support.v === "1";
            defenderShips += support.totalDefenses;
            defenderWS = Math.max(
              defenderWS,
              players[support.puid].tech.weapons.level,
            );
          }
        } else {
          drawHUDRuler(star, support, ineffectiveSupportColor);
        }

        for (let i = 0; showAll && i < closerStars.length; ++i) {
          const o = closerStars[i];
          if (alliedFleet(NeptunesPride.universe.galaxy.players, o.puid, star.puid)) {
            const ticks = Math.ceil(Math.sqrt(distance(star, o) / speedSq));
            if (enemyTicks - visTicks >= ticks) {
              drawHUDRuler(star, o, effectiveSupportColor);
              if (o.puid !== -1) {
                allVisible = allVisible && o.v === "1";
                defenderShips += o.totalDefenses;
                defenderWS = Math.max(
                  defenderWS,
                  players[o.puid].tech.weapons.level,
                );
              }
            } else {
              drawHUDRuler(star, o, ineffectiveSupportColor);
            }
          } else {
            drawHUDRuler(star, o, enemyColor);
            if (o.puid !== -1) {
              allVisible = allVisible && o.v === "1";
              enemyShips += o.totalDefenses;
              enemyWS = Math.max(enemyWS, players[o.puid].tech.weapons.level);
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
    const superDrawStars = map.drawStars;
    const bubbleLayer = document.createElement("canvas");
    map.drawStars = function () {
      const universe = NeptunesPride.universe;
      if (universe.selectedStar?.player && settings.territoryOn) {
        const context: CanvasRenderingContext2D = map.context;
        let p = universe.selectedStar.player.uid;
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
            let bubbles = () => {
              bcontext.beginPath();
              let scanning = false;
              const scanRange = getAdjustedScanRange(
                universe.selectedStar.player,
              );
              const fleetRange = getAdjustedFleetRange(
                universe.selectedStar.player,
              );
              for (let key in universe.galaxy.stars) {
                const star = universe.galaxy.stars[key];
                if (star.player?.uid == p) {
                  scanning = drawStarTerritory(bcontext, star, outer);
                } else {
                  const range = outer
                    ? Math.max(scanRange, fleetRange)
                    : Math.min(scanRange, fleetRange);
                  const galaxy = NeptunesPride.universe.galaxy;
                  if (isWithinRange(p, range, star, galaxy)) {
                    drawStarPimple(bcontext, star);
                  }
                }
              }
              const player = universe.galaxy.players[p];
              const color = colorMap[player.uid];
              const r =
                parseInt(color.substring(1, 3).toUpperCase(), 16) / 255.0;
              const g =
                parseInt(color.substring(3, 5).toUpperCase(), 16) / 255.0;
              const b =
                parseInt(color.substring(5, 7).toUpperCase(), 16) / 255.0;
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

      superDrawStars();
    };
    let superDrawText = NeptunesPride.npui.map.drawText;
    NeptunesPride.npui.map.drawText = function () {
      let universe = NeptunesPride.universe;
      let map = NeptunesPride.npui.map;
      const puids = Object.keys(universe.galaxy.players);
      const huids = puids.map((x) => universe.galaxy.players[x].huid);
      NeptunesPride.npui.map.sortedStarSprites.forEach((sss: any) => {
        if (huids.indexOf(sss.uid) !== -1) {
          if (sss.playerAlias.indexOf("Homeworld") === -1) {
            sss.playerAlias += " (Homeworld)";
          }
        }
      });
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
      if (NeptunesPride.originalPlayer !== universe.galaxy.player_uid) {
        if (universe.galaxy.player_uid !== undefined) {
          unrealContextString =
            universe.galaxy.players[universe.galaxy.player_uid].alias;
        }
      }
      if (universe.galaxy.player_uid != universe.player.uid) {
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
        if (fleetOutcomes[universe.selectedFleet.uid]?.eta) {
          let s = fleetOutcomes[universe.selectedFleet.uid].eta;
          let o = fleetOutcomes[universe.selectedFleet.uid].outcome.split("\n");
          let x = map.worldToScreenX(universe.selectedFleet.x) + offsetx;
          let y = map.worldToScreenY(universe.selectedFleet.y) + offsety;
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
          if (alliedFleet(NeptunesPride.universe.galaxy.players, fleet.puid, universe.player.uid)) {
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
    let wasBatched = false;
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
      const col = parseInt(idCol[1]);
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
        const rowNum = parseInt(r.id.split("#")[1]);
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
          data.filter((x) => isNaN(getValue(x[1]))).length === 0;
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
    Crux.format = function (s: string, templateData: { [x: string]: any }) {
      let formatTime = Crux.formatTime;
      if (templateData?.linkTimes === false) {
        formatTime = timeText;
        templateData.linkTimes = undefined;
      }
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
      const SUBSTITUTION_LIMIT = 10000;
      while (fp >= 0 && i < SUBSTITUTION_LIMIT) {
        i = i + 1;
        fp = s.indexOf("[[");
        sp = s.indexOf("]]");
        if (fp === -1) break;
        sub = s.slice(fp + 2, sp);
        pattern = `[[${sub}]]`;
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
                `Crux.crux.trigger('star_dir_upgrade_${type}', '${star.uid}')`,
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
          const value = `<span class="button button_up pad8" style="display: inline-block; margin: 3px 0;" onClick='event.preventDefault();Crux.crux.trigger("set_colorscheme_api", "${colors}:${shapes}")'"  >Import Color Scheme ${name}</span>`;
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
        } else if (/^Tick #\d\d*(#a?)?$/.test(sub)) {
          const split = sub.split("#");
          const tick = parseInt(split[1]);
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
            let msplus = msToTick(relativeTick, false);
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
          let keyLink = `<span class="button button_up pad8" onClick='{Mousetrap.trigger(\"${key}\")${goto}}'>${label}</span>`;
          s = s.replace(pattern, keyLink);
        } else if (/^mail:([0-9]+:?)+$/.test(sub)) {
          const splits = sub.split(":");
          const mailScript = `NeptunesPride.inbox.clearDraft();${splits
            .slice(1)
            .map((uid) => `NeptunesPride.inbox.draft.to.push(${uid})`)
            .join(";")}`;
          const mailButton = `<span class="button button_up icon-button pad8" onClick='${mailScript};Crux.crux.trigger("show_screen", "compose")'><span class="icon-mail"/></span>`;
          s = s.replace(pattern, mailButton);
        } else if (/^footer:-?[\w- \.][\w- \.]*$/.test(sub)) {
          const splits = sub.split(":");
          const text = splits[1];
          s = s.replace(pattern, `<b>${text}</b>`);
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
      let tableTitle = "";
      let tableId = "";
      let inTable = false;
      let alignmentRow = false;
      let headerRow = false;
      let headerLine = 0;
      let alignments: string[] = [];
      for (let linen = 0; linen < lines.length; ++linen) {
        const line = lines[linen];
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
              sort = `onclick='Crux.crux.trigger(\"sort_table\", \"${tableId},${i}\")'`;
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
    let npui = NeptunesPride.npui;
    NeptunesPride.templates["n_p_a"] = "NP Agent";
    NeptunesPride.templates["npa_report_type"] = "Filter:";
    NeptunesPride.templates["npa_paste"] = "Intel";
    NeptunesPride.templates["npa_screenshot"] = "Screenshot";
    let superNewMessageCommentBox = npui.NewMessageCommentBox;

    var npaReportIcons: { [k: string]: string } = {
      empires: "icon-users",
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
      fa: "icon-beaker",
      api: "icon-flash",
      controls: "icon-help",
      help: "icon-help",
    };
    var npaReportNames: { [k: string]: string } = {
      empires: "Empires",
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
      api: "API Keys",
      fa: "Formal Alliances",
      controls: "Controls",
      help: "Help",
    };
    let reportPasteHook = function (_e: any, report: any) {
      const pasteClip = () => {
        let inbox = NeptunesPride.inbox;
        inbox.commentDrafts[inbox.selectedMessage.key] += "\n" + getClip();
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
    npui.NewMessageCommentBox = function () {
      let widget = superNewMessageCommentBox();
      let reportButton = Crux.Button("npa_paste", "paste_report", "intel").grid(
        9.5,
        12,
        4.5,
        3,
      );
      reportButton.roost(widget);
      let screenShotButton = Crux.Button(
        "npa_screenshot",
        "paste_report",
        "screenshot",
      ).grid(13.5, 12, 7, 3);
      screenShotButton.roost(widget);
      return widget;
    };
    const npaReports = function () {
      var reportScreen = npui.Screen("n_p_a");

      Crux.Text("", "rel pad12 txt_center col_black  section_title")
        .rawHTML(title)
        .roost(reportScreen);
      Crux.IconButton("icon-help", "show_screen", "help")
        .grid(24.5, 0, 3, 3)
        .roost(reportScreen).onClick = npaHelp;

      var report = Crux.Widget("rel  col_accent").size(480, 48);
      var output = Crux.Widget("rel").nudge(-24, 0);

      Crux.Text("npa_report_type", "pad12").roost(report);
      reportSelector = Crux.DropDown(lastReport, npaReportNames, "exec_report")
        .grid(15, 0, 15, 3)
        .roost(report);
      filterInput = Crux.TextInput("single").grid(5, 0, 10, 3).roost(report);

      filterInput.eventKind = "exec_report";

      let text = Crux.Text("", "pad12 rel txt_selectable").size(432).pos(48)

      .rawHTML("Choose a report from the dropdown.");
      text.roost(output);

      report.roost(reportScreen);
      output.roost(reportScreen);

      let reportHook = async function (e: number, d: string) {
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

    const npaMenuWidth = 292;
    npui.NpaMenuItem = function (
      icon: string,
      label: string,
      event: string,
      data: string,
    ) {
      var smi = Crux.Clickable(event, data)
        .addStyle("rel side_menu_item")
        .configStyles(
          "side_menu_item_up",
          "side_menu_item_down",
          "side_menu_item_hover",
          "side_menu_item_disabled",
        )
        .size(npaMenuWidth, 40);

      Crux.Text("", "pad12 txt_center")
        .addStyle(icon)
        .grid(0, -0.25, 3, 2.5)
        .rawHTML("")
        .roost(smi);

      Crux.Text(label, "pad12").grid(2, -0.25, 18, 2.5).roost(smi);

      const hotkey = getHotkey(data);
      Crux.Text("", "pad12 txt_right")
        .grid(0, -0.25, 18, 4)
        .rawHTML(`<span float='right'>${hotkey}</span>`)
        .roost(smi);

      return smi;
    };

    const showReport = (_: any, reportName: string) => {
      console.log(`SHOW: ${reportName}`);
      lastReport = reportName;
      npui.trigger("show_screen", "new_fleet");
    };
    npui.npaMenu = (() => {
      var sideMenu = Crux.Widget("col_accent side_menu").size(npaMenuWidth, 0);

      sideMenu.isShowing = false;
      sideMenu.pinned = false;
      sideMenu.rows = 11;
      npui.sideMenuItemSize = 40;

      sideMenu.spacer = Crux.Widget("rel").size(160, 48).roost(sideMenu);

      sideMenu.showBtn = Crux.IconButton("icon-menu", "hide_side_menu")
        .grid(0, 0, 3, 3)
        .roost(sideMenu);
      sideMenu.showBtn = Crux.IconButton("icon-eye", "hide_side_menu")
        .grid(2.5, 0, 3, 3)
        .roost(sideMenu);

      Crux.Text("", "pad12 txt_right")
        .grid(0, -0.25, 18, 4.5)
        .rawHTML("<span float='right'>Hotkey</span>")
        .roost(sideMenu);

      for (let k in npaReportNames) {
        const iconName = npaReportIcons[k];
        const templateKey = `npa_key_${k}`;
        NeptunesPride.templates[templateKey] = npaReportNames[k];

        npui
          .NpaMenuItem(iconName, templateKey, "show_report", k)
          .roost(sideMenu);
      }

      sideMenu.pin = function () {
        sideMenu.show();
        sideMenu.showBtn.hide();
        sideMenu.spacer.hide();
        sideMenu.pinned = true;
        sideMenu.addStyle("fixed");
      };

      sideMenu.unPin = function () {
        sideMenu.pinned = false;
        sideMenu.showBtn.show();
        sideMenu.spacer.show();
        sideMenu.removeStyle("fixed");
        sideMenu.hide();
      };

      sideMenu.onPopUp = function () {
        if (sideMenu.pinned) return;
        npui.sideMenu.hide();
        sideMenu.isShowing = true;
        sideMenu.show();
        sideMenu.trigger("play_sound", "selection_open");
        sideMenu.trigger("hide_section_menu");
        sideMenu.trigger("hide_screen");
        sideMenu.trigger("cancel_fleet_orders");
      };

      sideMenu.onPopDown = function () {
        if (sideMenu.pinned) return;
        sideMenu.isShowing = false;
        sideMenu.hide();
      };

      sideMenu.on("show_report", showReport);
      sideMenu.on("show_npa_help", npaHelp);
      sideMenu.on("show_npa_menu", sideMenu.onPopUp);
      sideMenu.on("hide_side_menu", sideMenu.onPopDown);

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
    npui.status.npaMenuBtn = Crux.IconButton("icon-eye", "show_npa_menu")
      .grid(2.5, 0, 3, 3)
      .roost(npui.status);
    defineHotkey(
      "m",
      toggleMenu,
      "Toggle the display of the NPA menu.",
      "NPA Menu",
    );
    const superNewFleetScreen = npui.NewFleetScreen;
    onTrigger("show_screen", (_event: any, name: any, screenConfig: any) => {
      showingOurUI = name === "new_fleet" && screenConfig === undefined;
      showingOurOptions =
        name === "new_fleet" && screenConfig?.kind === "npa_options";
    });
    npui.NewFleetScreen = (screenConfig: any) => {
      if (screenConfig === undefined) {
        return npaReports();
      } else if (screenConfig?.kind === "npa_options") {
        return npaOptions(screenConfig);
      } else if (screenConfig?.kind === "npa_colours") {
        return npaColours(screenConfig);
      } else {
        return superNewFleetScreen(screenConfig);
      }
    };

    let superFormatTime = Crux.formatTime;
    const timeText = function (
      ms: number,
      showMinutes: boolean,
      showSeconds: boolean,
    ) {
      if (settings.relativeTimes === "relative") {
        if (ms < 0) {
          return `-${superFormatTime(-ms, showMinutes, showSeconds)}`;
        }
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
    Crux.formatTime = function (
      ms: number,
      showMinutes: boolean,
      showSeconds: boolean,
    ) {
      const text = timeText(ms, showMinutes, showSeconds);
      const rate = NeptunesPride.universe.galaxy.tick_rate * 60 * 1000;
      const relTick = ms / rate;
      const absTick = Math.ceil(relTick) + NeptunesPride.universe.galaxy.tick;
      return `<a onClick='Crux.crux.trigger(\"warp_time\", \"${absTick}\")'>${text}</a>`;
    };
    const toggleRelative = function () {
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

    if (window.chrome) {
      Object.defineProperty(Crux, "touchEnabled", { get: () => false });
      Object.defineProperty(NeptunesPride.npui.map, "ignoreMouseEvents", {
        get: () => false,
      });
    } else if (isSafari()) {
      // safari: trackpad is available and works on iPads
      Crux.crux.onTouchDown = () => {
        Crux.touchEnabled = false;
      };
      Crux.crux.one("touchstart", Crux.crux.onTouchDown);
    }

    const fixSubmitButton = () => {
      if (NeptunesPride.gameConfig.turnBased) {
        let submitButton: any[] = jQuery(':contains("Submit Turn")');
        if (submitButton.length !== 9 && submitButton.length !== 11) {
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
        if (
          submitButton.length === 11 &&
          submitButton[9] &&
          submitButton[9].style
        ) {
          submitButton[9].style.zIndex = 0;
          return true;
        }
        return false;
      }
      return true;
    };
    fixSubmitButton();
    onTrigger("refresh_interface", fixSubmitButton);

    const universe = NeptunesPride.universe;
    const superTimeToTick = universe.timeToTick;
    universe.timeToTick = function (tick: number, wholeTime: boolean) {
      const whole = wholeTime && settings.relativeTimes !== "eta";
      return superTimeToTick(tick, whole);
    };

    hooksLoaded = true;
  };
  let toggleTerritory = function () {
    settings.territoryOn = !settings.territoryOn;
    mapRebuild();
  };
  defineHotkey(
    ")",
    toggleTerritory,
    "Toggle the territory display. Range and scanning for all stars of the selected empire are shown.",
    "Toggle Territory",
  );

  const setPlayerColor = function (uid: number, color: string) {
    const player = NeptunesPride.universe.galaxy.players[uid];
    colorMap[player.uid] = color;
    if (NeptunesPride.gameVersion === "proteus") {
      if (!player.originalColor) {
        player.originalColor = player.colorStyle;
      }
      player.colorStyle = colorMap[player.uid];
    } else {
      if (!player.originalColor) {
        player.originalColor = player.color;
      }
      player.prevColor = player.color;
      player.color = colorMap[player.uid];
    }
  };
  let toggleWhitePlayer = function () {
    const player = NeptunesPride.universe.player;
    settings.whitePlayer = !settings.whitePlayer;
    if (settings.whitePlayer) {
      setPlayerColor(player.uid, "#ffffff");
    } else {
      if (NeptunesPride.gameVersion === "proteus") {
        setPlayerColor(player.uid, colors[player.color]);
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
      store
        .get("colorMap")
        .then((c) => {
          const newColors = c.split(" ");
          newColors.forEach((c: string, i: number) => {
            if (NeptunesPride.universe.galaxy.players[i]) {
              setPlayerColor(i, c);
            }
          });
          store.get("shapeMap").then((s) => {
            shapeMap = s.split(" ").map((x: string) => +x);
            recolorPlayers();
            NeptunesPride.np.trigger("refresh_interface");
            mapRebuild();
          });
        })
        .catch((err) => {
          if (NeptunesPride?.universe?.galaxy) {
            rebuildColorMap(NeptunesPride.universe.galaxy);
          }
        });
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

  var otherUserCode: string | undefined = undefined;
  let game = NeptunesPride.gameNumber;
  let store = new GameStore(game);
  let superOnServerResponse = NeptunesPride.np.onServerResponse;
  NeptunesPride.np.onServerResponse = function (response: { event: string }) {
    superOnServerResponse(response);
    if (response.event === "order:player_achievements") {
      console.log("Initial load complete. Reinstall.");
      logCount("achievements_init");
      init();
    } else if (response.event === "order:full_universe") {
      console.log("Universe received. Reinstall.");
      NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
      logCount("universe_init");
      init();
    } else if (!hooksLoaded && NeptunesPride.npui.map) {
      console.log("Hooks need loading and map is ready. Reinstall.");
      logCount(`${response.event}_init`);
      init();
    }
  };

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
      logCount("switchuser_init");
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
  const resetAliases = () => {
    const universe = NeptunesPride.universe;
    for (let pk in universe.galaxy.players) {
      const player = universe.galaxy.players[pk];
      player.alias = player.rawAlias;
    }
  };
  const mergeScanData = (scan: any) => {
    const universe = NeptunesPride.universe;
    resetAliases();
    if (timeTravelTick === -1) {
      let uid = NeptunesPride.universe.galaxy.player_uid;
      if (NeptunesPride.originalPlayer) {
        uid = NeptunesPride.originalPlayer;
      }
      if (NeptunesPride.originalPlayer === universe.galaxy.player_uid) {
        if (scan.player_uid === universe.galaxy.player_uid) {
          return;
        }
      }
    }
    universe.galaxy.players[scan.player_uid] = {
      ...scan.players[scan.player_uid],
      ...universe.galaxy.players[scan.player_uid],
    };

    universe.galaxy.stars = { ...scan.stars, ...universe.galaxy.stars };
    for (let s in scan.stars) {
      const star = scan.stars[s];
      if (
        (star.v !== "0" && universe.galaxy.stars[s].v === "0") ||
        star.puid === scan.player_uid
      ) {
        universe.galaxy.stars[s] = { ...universe.galaxy.stars[s], ...star };
      }
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
      mergeScanData(scan);
      NeptunesPride.np.onFullUniverse(null, NeptunesPride.universe.galaxy);
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

  let timeTravelTick = -1;
  let timeTravelTickIndices: { [k: string]: number } = {};
  const adjustNow = function (scan: any) {
    const wholeTick = scan.tick_rate * 60 * 1000;
    const fragment = scan.tick_fragment * wholeTick;
    const now = scan.now - fragment;
    const tick_fragment = 0; //((new Date().getTime() - now) % wholeTick)/ wholeTick;
    return { ...scan, now, tick_fragment };
  };
  let getTimeTravelScan = function (apikey: string, dir: "back" | "forwards") {
    return getTimeTravelScanForTick(timeTravelTick, apikey, dir);
  };
  let getTimeTravelScanForTick = function (
    targetTick: number,
    apikey: string,
    dir: "back" | "forwards",
  ) {
    const scans = scanCache[getCodeFromApiText(apikey)];
    if (!scans || scans.length === 0) return null;
    let timeTravelTickIndex = dir === "back" ? scans.length - 1 : 0;
    if (timeTravelTickIndices[apikey] !== undefined) {
      timeTravelTickIndex = timeTravelTickIndices[apikey];
    }
    let scan = getScan(scans, timeTravelTickIndex);
    scan = adjustNow(scan);
    if (scan.tick < targetTick) {
      while (scan.tick < targetTick && dir === "forwards") {
        timeTravelTickIndex++;
        if (timeTravelTickIndex === scans.length) {
          timeTravelTickIndices[apikey] = undefined;
          return null;
        }
        //console.log({ timeTravelTickIndex, len: scans.length, targetTick });
        scan = getScan(scans, timeTravelTickIndex);
        scan = adjustNow(scan);
      }
    } else if (scan.tick > targetTick) {
      while (scan.tick > targetTick && dir === "back") {
        timeTravelTickIndex--;
        if (timeTravelTickIndex < 0) {
          timeTravelTickIndices[apikey] = undefined;
          return null;
        }
        //console.log({ timeTravelTickIndex, len: scans.length, timeTravelTick });
        scan = getScan(scans, timeTravelTickIndex);
        scan = adjustNow(scan);
      }
    }
    timeTravelTickIndices[apikey] = timeTravelTickIndex;
    //const steps = timeTravelTickIndices[apikey] - timeTravelTickIndex;
    //console.log(`Found scan for ${targetTick} ${apikey}:${scan.tick} ${steps}`);
    return clone(scan);
  };
  let timeTravel = function (dir: "back" | "forwards"): boolean {
    const scans = allSeenKeys
      .map((k) => getTimeTravelScan(k, dir))
      .filter((scan) => scan && scan.tick === timeTravelTick);
    if (scans.length === 0) {
      if (timeTravelTick > trueTick) {
        // we are in future time machine
        if (dir === "forwards") {
          const tickOffset = (timeTravelTick - NeptunesPride.universe.galaxy.tick);
          const newGalaxy = futureTime(NeptunesPride.universe.galaxy, tickOffset);
          NeptunesPride.np.onFullUniverse(null, newGalaxy);
        } else if (dir === "back") {
          warpTime(null, `${trueTick}`);
        }
      }
      NeptunesPride.np.trigger("map_rebuild");
      return false;
    }
    const myId = NeptunesPride.originalPlayer
      ? NeptunesPride.originalPlayer
      : NeptunesPride.universe.galaxy.player_uid;
    const myScan = scans.filter((scan) => scan.player_uid === myId);
    const first = myScan.length > 0 ? myScan[0] : scans[0];
    NeptunesPride.np.onFullUniverse(null, first);

    scans.forEach((scan) => {
      mergeScanData(scan);
    });
    NeptunesPride.np.onFullUniverse(null, NeptunesPride.universe.galaxy);
    logCount("timetravel_init");
    init();
  };
  let warpTime = function (_event?: any, data?: string) {
    timeTravelTick = parseInt(data);
    const gtick = NeptunesPride.universe.galaxy.tick;
    if (timeTravelTick < gtick) {
      timeTravel("back");
    } else if (timeTravelTick > gtick) {
      timeTravel("forwards");
    }
  };
  onTrigger("warp_time", warpTime);
  let timeTravelBack = function () {
    if (timeTravelTick === -1) {
      timeTravelTick = NeptunesPride.universe.galaxy.tick;
    }
    if (NeptunesPride.gameConfig.turnBased) {
      timeTravelTick -= NeptunesPride.gameConfig.turnJumpTicks;
    } else {
      timeTravelTick -= 1;
    }
    if (timeTravelTick < 0) timeTravelTick = 0;
    timeTravel("back");
  };
  let timeTravelForward = function () {
    if (NeptunesPride.gameConfig.turnBased) {
      timeTravelTick += NeptunesPride.gameConfig.turnJumpTicks;
    } else {
      timeTravelTick += 1;
    }
    timeTravel("forwards");
  };
  defineHotkey(
    "ctrl+,",
    timeTravelBack,
    "Go back a tick in time.",
    "Time Machine: Back",
  );
  defineHotkey(
    "ctrl+.",
    timeTravelForward,
    "Go forward a tick in time.",
    "Time Machine: Forward",
  );
  let timeTravelBackCycle = function () {
    if (timeTravelTick === -1) {
      timeTravelTick = NeptunesPride.universe.galaxy.tick;
    }
    timeTravelTick -= NeptunesPride.gameConfig.productionTicks;
    if (timeTravelTick < 0) timeTravelTick = 0;
    timeTravel("back");
  };
  let timeTravelForwardCycle = function () {
    timeTravelTick += NeptunesPride.gameConfig.productionTicks;
    timeTravel("forwards");
  };
  defineHotkey(
    "ctrl+m",
    timeTravelBackCycle,
    `Go back in time a full cycle (${NeptunesPride.gameConfig.productionTicks} ticks).`,
    `Time Machine: -${NeptunesPride.gameConfig.productionTicks} ticks`,
  );
  defineHotkey(
    "ctrl+/",
    timeTravelForwardCycle,
    `Go forward a full cycle (${NeptunesPride.gameConfig.productionTicks} ticks).`,
    `Time Machine: +${NeptunesPride.gameConfig.productionTicks} ticks`,
  );

  let myApiKey = "";
  const recordAPICode = async function (_event: any, code: string) {
    let scan = await getUserScanData(code);
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
        subject,
        body,
      });
    }
  };
  onTrigger("order:api_code", recordAPICode);
  let lastRefreshTimestamp = 0;
  let refreshScanData = async function () {
    const timestamp = new Date().getTime();
    if (timestamp - lastRefreshTimestamp < 5 * 60 * 1000) {
      console.log(`refreshScanData called too recently, STOP`);
      rebuildColorMap(NeptunesPride.universe.galaxy);
      return;
    }
    lastRefreshTimestamp = timestamp;
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
  };
  const xlateemoji: { [k: string]: string } = {
    bank: "💰",
    manu: "🔧",
    prop: "🚀",
    rese: "🧪",
    scan: "📡",
    terr: "🌎",
    weap: "⚔️",
  };

  let translateTech = (name: string) => xlate[name.substring(0, 4)];
  let translateTechEmoji = (name: string) => xlateemoji[name.substring(0, 4)];

  const tradeCostForLevel = function (level: number) {
    if (NeptunesPride.gameVersion === "proteus") {
      return level * level * 5;
    }
    return level * NeptunesPride.gameConfig.tradeCost;
  };
  const techCost = function (tech: { brr: number; level: number }) {
    if (NeptunesPride.gameVersion !== "proteus") {
      return tech.brr * tech.level;
    }
    return tech.brr * tech.level * tech.level * tech.level;
  };
  let techTable = function (
    output: Stanzas,
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
    columns.forEach((pi) => {
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
    });
    let payFooter = [
      "[[footer:Pay for all]]",
      "",
      "",
      ...columns.map((pi: any) =>
        allAmounts[pi] > 0
          ? `[[sendcash:${pi}:${allAmounts[pi]}:${allAmounts[pi]}]]`
          : "",
      ),
    ];
    let sendFooter = [
      "[[footer:Send all]]",
      "",
      "",
      ...columns.map((pi: any) =>
        allSendAmounts[pi] > 0
          ? `[[sendalltech:${pi}:${allSendAmounts[pi]}]]`
          : "",
      ),
    ];
    rows.forEach((r) => output.push([r]));
    output.push([payFooter.join("|")]);
    output.push([sendFooter.join("|")]);
    output.push(`--- ${title} ---`);
  };
  let tradeScanned = function () {
    return (
      NeptunesPride.gameConfig.tradeScanned ||
      NeptunesPride.gameVersion === "proteus"
    );
  };
  let tradingReport = async function () {
    lastReport = "trading";
    const { players, playerIndexes } = await getPrimaryAlliance();
    let output: string[] = [];
    techTable(output, playerIndexes, "Allied Technology");
    let allPlayers = Object.keys(players);
    let scanned = tradeScanned() ? "Scanned " : "";
    if (tradeScanned()) {
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
    prepReport("trading", output);
  };
  defineHotkey(
    "e",
    tradingReport,
    "The trading report lets you review where you are relative to others and " +
      "provides shortcuts to ease trading of tech as needed.",
    "trading",
  );

  let empireTable = function (
    output: Stanzas,
    playerIndexes: number[],
    title: string,
  ): any[] {
    const fields = [
      ["total_stars", "[[:star:]]"],
      ["total_strength", "[[:carrier:]]"],
      ["shipsPerTick", "[[:carrier:]]/h"],
      ["total_economy", "E"],
      ["total_industry", "I"],
      ["total_science", "S"],
    ];
    const table: Stanzas = [];
    const sums = fields.map((x) => 0);
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
    playerIndexes.forEach((pi) => {
      const row: string[] = [`[[${pi}]]`];
      const player = NeptunesPride.universe.galaxy.players[pi];
      const levels = player;
      fields
        .map((f) => f[0])
        .forEach((t, i) => {
          const myLevel = +myP[t];
          const level = +levels[t];
          sums[i] += level;
          if (level < myLevel) {
            row.push(`[[good:${level}]]`);
          } else if (level > myLevel) {
            row.push(`[[bad:${level}]]`);
          } else {
            row.push(`${level}`);
          }
        });
      table.push([row.join("|")]);
    });
    const summary = sums.map((x) => Math.trunc(x));
    table.push([["[[footer:Total]]", ...summary].join("|")]);
    table.push(`--- ${title} ---`);
    output.push(table.flat());
    return [`${title}`, ...summary];
  };
  const getAllianceSubsets = function (): { [k: string]: number[] } {
    const players = NeptunesPride.universe.galaxy.players;
    let allPlayers = Object.keys(NeptunesPride.universe.galaxy.players);
    let allianceMatch =
      settings.allianceDiscriminator === "color"
        ? colorMap.slice(0, allPlayers.length)
        : shapeMap.slice(0, allPlayers.length);
    if (settings.allianceDiscriminator === "color" && settings.whitePlayer) {
      const p = NeptunesPride.universe.player;
      allianceMatch[p.uid] = p.prevColor;
    }
    let alliancePairs: [any, number][] = allianceMatch
      .map((x, i): [any, number] => [x, i])
      .sort();
    let subsets: { [k: string]: number[] } = {};
    alliancePairs.forEach((p) => {
      const player = players[p[1]];
      if (player.total_stars || player.total_strength) {
        if (subsets[p[0]] === undefined) {
          subsets[p[0]] = [p[1]];
        } else {
          subsets[p[0]].push(p[1]);
        }
      }
    });
    return subsets;
  };
  let empireReport = async function () {
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
    let unallied = [];
    const subsets = getAllianceSubsets();
    for (let k in subsets) {
      const s = subsets[k];
      if (s.length === 1) {
        unallied.push(s[0]);
      } else if (colors.indexOf(k) !== -1) {
        unallied.push(...s);
      } else {
        computeEmpireTable(
          output,
          s,
          `[[mail:${s.join(":")}]] Alliance ${s
            .map((uid) => `[[#${uid}]]`)
            .join("")}`,
        );
      }
    }
    empireTable(output, unallied, `Unallied Empires`);
    let allPlayers = Object.keys(NeptunesPride.universe.galaxy.players);
    const survivors = allPlayers
      .filter((k) => {
        return players[k].total_strength > 0;
      })
      .map((x) => +x);
    if (output.length > 0) {
      const summary: string[] = ["--- All Alliances ---"];
      summary.push(output[0][1]);
      summary.push(output[0][2].replace("Empire", "Alliance"));
      const p = NeptunesPride.universe.player;
      const me = `[[#${p.uid}]]`;
      const baseStats: any[] = [];
      summaryData.forEach((row) => {
        if (row[0].indexOf(me) !== -1) {
          baseStats.push(...row);
        }
      });
      summaryData.forEach((row) => {
        let formatted = row[0];
        for (let stat = 1; stat < row.length; ++stat) {
          const v = row[stat];
          const b = baseStats[stat];
          const s = v < b ? `[[good:${v}]]` : v > b ? `[[bad:${v}]]` : `${v}`;
          formatted += `|${s}`;
        }
        summary.push(formatted);
      });
      summary.push("--- All Alliances ---");
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
    var targetPlayer: any = data.targetPlayer;
    const my = NeptunesPride.universe.player;
    for (let i = 0; i < data.techs.length; ++i) {
      var name = data.techs[i];
      while (targetPlayer.tech[name].level < my.tech[name].level) {
        var price =
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
    NeptunesPride.templates["confirm_send_cash"] =
      "Are you sure you want to send<br>[[alias]]<br>$[[amount]] credits?";
    const npui = NeptunesPride.npui;
    const player = NeptunesPride.universe.galaxy.players[recipient];
    npui.trigger("hide_screen");
    var screenConfig = {
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

  let getUserScanData = async function (apiKey: string) {
    const cacheKey = `CACHED_${apiKey}`;
    const cachedScan = await store.get(cacheKey);
    if (cachedScan) {
      const freshness = new Date().getTime() - cachedScan.now;
      const tickness =
        (1 - cachedScan.tick_fragment) * cachedScan.tick_rate * 60 * 1000;
      if (
        freshness < tickness &&
        freshness < 60 * 5 * 1000 &&
        !(await anyEventsNewerThan(cachedScan.now))
      ) {
        console.log(`Cache hit! ${cacheKey}`);
        return cachedScan;
      }
    } else {
      console.log(`Cache miss! ${cacheKey}`);
      if (apiKey === "badkey") {
        return undefined;
      }
      logCount(`unexpected_cache_miss_${cacheKey}`);
    }
    let params = {
      game_number: game,
      api_version: "0.1",
      code: apiKey,
    };
    let api = await post("https://np.ironhelmet.com/api", params);
    await store.set(cacheKey, api.scanning_data);
    return api.scanning_data;
  };
  const getPlayerIndex = function (apikey: string) {
    return parseInt(apikey.substring(4));
  };
  const getAlliedKeysAndIndexes = async function () {
    const allkeys = (await store.keys()) as string[];
    const players = NeptunesPride.universe.galaxy.players;
    const apiKeys = allkeys.filter(
      (x) => x.startsWith("API:") && players[getPlayerIndex(x)].conceded === 0,
    );
    const playerIndexes = apiKeys.map((k) => parseInt(k.substring(4)));
    return { players, apiKeys, playerIndexes };
  };
  const getPrimaryAlliance = async function () {
    const galaxy = NeptunesPride.universe.galaxy;
    const player = galaxy.players[galaxy.player_uid];
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
          return alliedKeys;
        }
        return { players, apiKeys: returnedKeys, playerIndexes: returnedUids };
      }
    }
    return alliedKeys;
  };
  let researchReport = async function () {
    lastReport = "research";
    const { players, apiKeys, playerIndexes } = await getPrimaryAlliance();
    let output: Stanzas = [];
    output.push("--- Alliance Research Progress ---");
    output.push(":--|:--|--:|--:|--:|--");
    output.push("Empire|Tech|ETA|Progress|Sci|⬆S");
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const pi = playerIndexes[pii];
      const p = players[pi];
      const apiKey = await store.get(apiKeys[pii]);
      const scan = await getUserScanData(apiKey);
      if (scan) {
        const player = scan.players[pi];
        const tech = player.tech[player.researching];
        const soFar = tech.research;
        const total = techCost(tech);
        const remaining = total - soFar;
        const science = p.total_science;
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
            upgrade = `${i}<sub style="font-size: 50%">${
              tickIncr - betterTick
            }</sub>`;
            break;
          }
        }
        const techName = translateTech(player.researching);
        output.push([
          `[[${pi}]]|${techName}|[[Tick #${tick}]]|${soFar}/${total}|${p.total_science}|${upgrade}`,
        ]);
      }
    }
    output.push("--- Alliance Research Progress ---");
    const player = NeptunesPride.universe.player;
    const techs = Object.keys(player.tech);
    type BestProgress = {
      [key: string]: {
        level: number;
        research: number;
      };
    };
    let best: BestProgress = {};
    for (const tech of techs) {
      best[tech] = {
        level: 1,
        research: 0,
      };
    }
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const pi = playerIndexes[pii];
      const p = players[pi];
      const apiKey = await store.get(apiKeys[pii]);
      const scan = await getUserScanData(apiKey);
      if (!scan) continue;
      const player = scan.players[pi];
      let line = `[[${pi}]]`;
      for (const key of techs) {
        const tech = player.tech[key];
        if (tech.level === best[key].level) {
          best[key].research = Math.max(best[key].research, tech.research);
        } else if (tech.level > best[key].level) {
          best[key].level = tech.level;
          best[key].research = tech.research;
        }
      }
    }
    output.push("--- All Alliance Research ---");
    output.push(`:--|${techs.map(() => "--:").join("|")}`);
    output.push(
      `Empire|${techs
        .map(
          (key) => `<sub>L${best[key].level}</sub> ${translateTechEmoji(key)}`,
        )
        .join("|")}`,
    );
    for (let pii = 0; pii < playerIndexes.length; ++pii) {
      const pi = playerIndexes[pii];
      const p = players[pi];
      const apiKey = await store.get(apiKeys[pii]);
      const scan = await getUserScanData(apiKey);
      if (!scan) continue;
      const player = scan.players[pi];
      let line = `[[${pi}]]`;
      for (const key of techs) {
        const tech = player.tech[key];
        let soFar = tech.research;
        if (tech.level === best[key].level) {
          if (tech.research === best[key].research) {
            soFar = `[[good:${soFar}]]`;
          }
        } else {
          soFar = `[[bad:${soFar}]]`;
        }
        line += `| ${soFar}`;
        let researchPriority = [];
        if (player.researching === key) {
          researchPriority.push(1);
        }
        if (player.researching_next === key) {
          researchPriority.push(2);
        }
        if (researchPriority.length > 0) {
          line += `<sub style="font-size: 50%">${researchPriority.join(
            ",",
          )}</sub>`;
        }
        if (tech.level < best[key].level) {
          line += `<div><sub>(L${tech.level})</sub></div>`;
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

  let npaLedger = async function () {
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
          const name = m.payload.name;
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
      for (let p in balances) {
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

  let allSeenKeys: string[] = [];
  let apiKeys = async function () {
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
    output.push("Empire|Merge|Last?");
    allSeenKeys.forEach((key) => {
      let owner = "Unknown";
      let good = "❌";
      const code = getCodeFromApiText(key);
      if (scanCache[code]?.length > 0) {
        let last = scanCache[code].length - 1;
        let eof = scanCache[code][last]?.eof;
        let scan = getScan(scanCache[code], last);
        let uid = scan?.player_uid;
        good = `[[Tick #${scan?.tick}]]`;
        while ((uid === undefined || eof) && --last > 0) {
          eof = scanCache[code][last]?.eof;
          let scan = getScan(scanCache[code], last);
          uid = scan?.player_uid;
          if (uid !== undefined) {
            good = `Dead @ [[Tick #${scan.tick}]]`;
          }
        }
        owner = `[[${uid}]]`;
      }
      const merge = key.replace(":", "m:");
      output.push([`${owner}|${merge}|${good}`]);
    });
    output.push("--- All Seen Keys ---");
    prepReport("api", output);
  };
  defineHotkey("k", apiKeys, "Show known API keys.", "api");

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
    help.push(" Neptune's Pride Agent is meant to help you focus on");
    help.push(" diplomacy and spend less time doing tedious calculations");
    help.push(" or manually sharing information.");
    help.push("<h1>Hotkey Reference</h1>");
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
  defineHotkey("?", npaHelp, "Display this help screen.", "help");

  let npaControls = function () {
    const output: Stanzas = [];
    output.push("--- Controls ---");
    output.push(":--|--|--:");
    output.push("Button||Hotkey");
    var div = document.createElement("div");
    getHotkeys().forEach((key: string) => {
      let control = `[[goto:${key}]]`;
      if (key === "?") control = `[[hotkey:${key}]]`;
      if (key === "<") key = "&lt;";
      else if (key === ">") key = "&gt;";
      else if (key === "&") key = "&amp;";
      else if (key.length === 1) {
        key = `&#${key.charCodeAt(0)};`;
      } else {
        console.log({ key });
        div.innerText = key;
        key = div.innerHTML;
      }
      const partial = `${control}||${key}`;
      output.push([partial]);
    });
    output.push("--- Controls ---");
    prepReport("controls", output);
  };
  defineHotkey("~", npaControls, "Generate NPA Buttons.", "controls");

  setupAutocomplete(document.body, NeptunesPride, () => {
    return myApiKey;
  });

  restoreFromDB("game_event")
    .then(() => updateMessageCache("game_event"))
    .then(() => updateMessageCache("game_diplomacy"))
    .then(() => {
      window.setTimeout(async () => {
        const allkeys = (await store.keys()) as string[];
        const apiKeys = allkeys.filter((x) => x.startsWith("API:"));
        allSeenKeys =
          messageIndex["api"]
            ?.flatMap((m: any) => {
              const body = m.message.body || m.message.payload?.body;
              return body.match(/\[\[api:\w\w\w\w\w\w\]\]/);
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
        allSeenKeys.forEach(async (key) => {
          const code = getCodeFromApiText(key);
          await getServerScans(code);
          if (scanCache[code]?.length > 0) {
            console.log(`Scans for ${code} cached`);
            return;
          }
          console.log(`Scans for ${code} not cached yet, register for them`);
          registerForScans(code);
        });
      }, 1000);
    });

  const loadScanData = () =>
    refreshScanData().then(() => {
      if (myApiKey) {
        console.log(`Loading scan data for key ${myApiKey}`);
        getServerScans(myApiKey);
      } else {
        console.log("API Key unknown. No scan history.");
      }
    });
  if (NeptunesPride.universe?.player?.uid !== undefined) {
    console.log("Universe already loaded, refresh scan data.");
    loadScanData();
  }

  const wst = window.setTimeout;
  const timeoutCatcher = (
    callback: TimerHandler,
    time?: number,
    ...args: any[]
  ): number => {
    if (callback?.toLocaleString().indexOf("autocompleteTrigger") !== -1) {
      console.log("SAT duplicate code detected. Ignore it.");
      return 0;
    }
    return wst(callback, time, args);
  };
  window.setTimeout = timeoutCatcher as any;

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
