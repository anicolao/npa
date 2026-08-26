import type { Player } from "./galaxy";

export type ScanCoverage = {
  [apiCode: string]: { firstTick?: number } | undefined;
};

export function apiAccessEnabled(galaxy: any): boolean {
  return galaxy?.config?.apiAccess !== 0;
}

export function playerReference(
  player: Pick<Player, "alias" | "rawAlias"> | undefined,
): string {
  if (!player) return "?";
  return `[[${player.alias || player.rawAlias}]]`;
}

export function resetPlayerDisplayAlias(player: any): void {
  const space = "\u00a0";
  const modSymbols = ["\uD83D\uDCA1", "\uD83D\uDC41", "\u23F3", "\u23F3"];
  player.alias = player.rawAlias.split(space)[0];
  if (player.ai === 1) {
    player.alias += `${space}${modSymbols[player.modTick]} `;
  } else if (player.missedTurns) {
    player.alias += `${space}${-player.missedTurns} `;
  }
}

export function historicalReportStartTick(
  endTick: number,
  productionTickCount: number,
  filterText: string,
  apiCodes: string[],
  scanCoverage: ScanCoverage,
): number {
  if (!filterText) return Math.max(endTick - productionTickCount, 1);

  const firstTick = apiCodes.reduce((first, code) => {
    const tick = scanCoverage[code]?.firstTick;
    return tick === undefined ? first : Math.min(first, tick);
  }, endTick);
  return Math.max(firstTick, 1);
}

export function selectAndShowNewFleet(np: any, star: any): void {
  np.trigger("select_and_show_new_fleet", star);
}
