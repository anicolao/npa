export interface ScanningData {
  admin: number;
  fleet_speed: number;
  fleets: { [uid: string]: Fleet };
  game_over: number;
  name: string;
  now: number;
  paused: boolean;
  player_uid: number;
  players: { [puid: string]: Player };
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
enum FleetOrder {
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
}
export interface TechInfo {
  sv?: number; // starting value
  level: number; // current reseach level
  bv?: number; // base value
  value: number; // value = sv + level*bv -> start value + level * base value
  brr?: number; // base research rate
  research?: number; // research points so far
}
export interface Tech {
  banking: TechInfo;
  manufacturing: TechInfo;
  propulsion: TechInfo;
  research: TechInfo;
  scanning: TechInfo;
  terraforming: TechInfo;
  weapons: TechInfo;
}
export interface UnscannedStar extends SpaceObject {
  v: "0"; // unscanned (!visible)
}
export interface ScannedStar extends SpaceObject {
  v: "1"; // scanned (visible)
  c: number; // fractional ship count
  e: number; // economy
  ga: number; // stargate present?
  i: number; // industry
  nr: number; // natural resources
  puid: number; // owner
  r: number; // terraformed resources
  s: number; // science
  st: number; // strength (ship count)
}
export type Star = UnscannedStar | ScannedStar;

export function dist(s1: SpaceObject, s2: SpaceObject) => {
  return NeptunesPride.universe.distance(s1.x, s1.y, s2.x, s2.y);
};
