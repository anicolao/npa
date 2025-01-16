import { annalsOfWar, combatInfo } from "./combatcalc";
import { isNP4 } from "./events";
import { ScanKeyIterator } from "./scans";

export const alliancesEnabled = () =>
  !!NeptunesPride.universe.galaxy?.config?.alliances;
export function computeAlliances(allSeenKeys: string[]) {
  const output = [];

  if (allSeenKeys?.length && alliancesEnabled()) {
    output.push("Formal Alliances: ");
    const keyIterators = allSeenKeys.map((k) => new ScanKeyIterator(k));
    const alliances: number[][] = [];
    for (let i = 0; i < keyIterators.length; ++i) {
      const ki = keyIterators[i];
      while (ki.hasNext()) {
        ki.next();
        const scan = ki.getScanData();
        if (scan?.fleets) {
          for (const k in scan.fleets) {
            const fleet = scan.fleets[k];
            if (fleet?.ouid !== undefined && (!isNP4() || fleet.ouid > 0)) {
              const star = scan.stars[fleet.ouid];
              if (star) {
                if (star.puid !== fleet.puid && star.puid !== -1) {
                  if (!alliances[star.puid]) {
                    alliances[star.puid] = [];
                  }
                  if (!alliances[fleet.puid]) {
                    alliances[fleet.puid] = [];
                  }
                  const seenTick = alliances[star.puid]?.[fleet.puid] || 100000;
                  const minTick = Math.min(scan.tick, seenTick);
                  alliances[star.puid][fleet.puid] = minTick;
                  alliances[fleet.puid][star.puid] = minTick;
                }
              } else {
                console.error(`Orbit star missing for ${fleet.n}`, fleet);
              }
            }
          }
        }
      }
    }
    let annals = annalsOfWar();
    for (const i in alliances) {
      for (const j in alliances[i]) {
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
        if (alliances[p1] !== undefined) {
          alliances[p1][p0] = undefined;
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
    console.log({ alliances });
  } else {
    if (alliancesEnabled()) {
      output.push("No API keys to detect Formal Alliances.");
    } else {
      output.push("No formal alliances in this game");
    }
  }
  return output;
}
