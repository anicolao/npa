import { isNP4 } from "./events";

export interface PlayerMap {
  [puid: string]: Player;
}
export interface ScanningData {
  admin: number;
  fleet_speed: number;
  fleets: { [uid: string]: Fleet };
  game_over: number;
  name: string;
  now: number;
  paused: boolean;
  player_uid: number;
  players: PlayerMap;
  production_counter: number;
  production_rate: number;
  productions: number;
  stars: { [suid: string]: Star };
  stars_for_victory: number;
  start_time: number;
  started: boolean;
  tick: number;
  tick_fragment: number;
  tick_rate: number;
  total_stars: number;
  trade_cost: number;
  trade_scanned: number;
  turn_based: number;
  turn_based_time_out: number;
  war: number;
}

export interface SpaceObject {
  n: string;
  puid: number;
  uid: number;
  x: string;
  y: string;
}
export enum FleetOrder {
  Nothing = 0,
  CollectAll,
  DropAll,
  Collect,
  Drop,
  CollectAllBut,
  DropAllBut,
  Garrison,
}
export interface Fleet extends SpaceObject {
  l: number;
  lx: string; // last x position
  ly: string; // last y position
  n: string; // name
  o: [number, number, FleetOrder, number][]; // orders [delay, staruid, action, argument]
  puid: number; // owner
  st: number; // strength (ship count)
  uid: number; // unique id
  w: number; // flying at warp?
  etaFirst: number;
  eta: number;
  loop?: number;
  orbiting?: Star;
  warpSpeed?: number;
  ouid?: number;
}
export interface Player {
  ai: number;
  alias: string;
  avatar: number;
  conceded: number;
  huid: number;
  karma_to_give: number;
  missed_turns: number;
  ready: number;
  regard: number;
  tech: Tech;
  total_economy: number;
  total_fleets: number;
  total_industry: number;
  total_science: number;
  total_stars: number;
  total_strength: number;
  uid: number;
  war?: any;
  researching?: TechKey;
  researching_next?: TechKey;
  cash?: number;
  cashPerDay?: number;
}
export interface TechInfo {
  sv?: number; // starting value
  level: number; // current reseach level
  bv?: number; // base value
  value: number; // value = sv + level*bv -> start value + level * base value
  brr?: number; // base research rate
  research?: number; // research points so far
  cost?: number; // NP4 cost
}

export type TechKey =
  | "banking"
  | "manufacturing"
  | "propulsion"
  | "research"
  | "scanning"
  | "terraforming"
  | "weapons";

export interface Tech {
  banking: TechInfo;
  manufacturing: TechInfo;
  propulsion: TechInfo;
  research: TechInfo;
  scanning: TechInfo;
  terraforming: TechInfo;
  weapons: TechInfo;
}

export function getTech(player: Player, tech: TechKey): TechInfo {
  if (isNP4()) {
    const t = player.tech as any;
    if (tech === "scanning" && NeptunesPride.universe.galaxy.config.noScn) {
      return getTech(player, "propulsion");
    }
    return t[NeptunesPride.universe.techNames.indexOf(tech)];
  }
  return player.tech[tech];
}

export function getScanValue(player: Player) {
  if (isNP4()) {
    return NeptunesPride.universe.calcScanValue(player);
  }
  return player.tech.scanning.value;
}
export function getRangeValue(player: Player) {
  if (isNP4()) {
    return NeptunesPride.universe.calcRangeValue(player);
  }
  return player.tech.propulsion.value;
}
export interface UnscannedStar extends SpaceObject {
  v: "0"; // unscanned (!visible)
}
export interface ScannedStar extends SpaceObject {
  v: "1"; // scanned (visible)
  c: number; // fractional ship count
  yard: number; // NP4 fractional ship count
  e: number; // economy
  ga: number; // stargate present?
  i: number; // industry
  nr: number; // natural resources
  puid: number; // owner
  r: number; // terraformed resources
  s: number; // science
  st: number; // strength (ship count)
  totalDefenses?: number;
  alliedDefenders?: number[];
  fleetsInOrbit?: Fleet[];
  shipsPerTick?: number;
}
export type Star = UnscannedStar | ScannedStar;

export function dist(s1: SpaceObject, s2: SpaceObject) {
  return NeptunesPride.universe.distance(s1.x, s1.y, s2.x, s2.y);
}

export function techCost(tech: TechInfo) {
  if (isNP4()) {
    return tech.level * tech.cost;
  }
  if (NeptunesPride.gameVersion !== "proteus") {
    return tech.brr * tech.level;
  }
  return tech.brr * tech.level * tech.level * tech.level;
}

  export function addAccessors(n: string, p: any) {
    const props = Object.getOwnPropertyNames(p);
    for (const name of props) {
      let newName = `${name.replace(/[A-Z]/g, "_$&").toLowerCase()}`;
      if (name !== newName) {
        //console.log(`Alias ${n}.${name} -> ${newName}`);
        if (name === "colorStyle") {
          //console.log(`COLOR Alias ${n}.${name} -> ${newName}`);
          //newName = "color";
        }
        Object.defineProperty(p, newName, {
          get: function () {
            return this[name];
          },
          set: function (v) {
            return (this[name] = v);
          },
        });
      }
    }
  }