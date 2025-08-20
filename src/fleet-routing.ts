import { defineHotkey } from "./hotkey";

declare global {
  var NeptunesPride: {
    universe: {
      selectedStar?: {
        puid: number;
        x: number;
        y: number;
        uid: number;
        st: number;
      };
      selectedFleet?: {
        puid: number;
      };
      player: any;
      galaxy: {
        players: { [key: number]: any };
        fleets: { [key: number]: any };
      };
    };
    npui: {
      trigger: (event: string, data?: any) => void;
    };
    np: {
      onNewFleetResponse: (error: any, fleet: any) => void;
    };
  };
}

export const routeEnemy = () => {
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

export const registerFleetRoutingHotkeys = () => {
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
};
