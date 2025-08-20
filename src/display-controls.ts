import { combatInfo } from "./combatcalc";
import { defineHotkey } from "./hotkey";

export interface Settings {
  territoryOn: boolean;
  territoryBrightness: number;
  autoRulerPower: number;
}

declare global {
  var NeptunesPride: {
    np: {
      trigger: (event: string, data?: any) => void;
    };
  };
}

let settings: Settings;

export const setSettings = (newSettings: Settings) => {
  settings = newSettings;
};

const mapRebuild = () => {
  const showingOurOptions = false; // TODO: get this from shared state
  if (showingOurOptions) {
    NeptunesPride.np.trigger("refresh_interface");
  }
  NeptunesPride.np.trigger("map_rebuild");
};

const toggleTerritory = () => {
  // TODO: implement this function or import it
  settings.territoryOn = !settings.territoryOn;
  mapRebuild();
};

export const incTerritoryBrightness = () => {
  if (!settings.territoryOn) {
    toggleTerritory();
    return;
  }
  settings.territoryBrightness = (settings.territoryBrightness + 1) % 4;
  mapRebuild();
};

export const decTerritoryBrightness = () => {
  if (!settings.territoryOn) {
    toggleTerritory();
    return;
  }
  let nextPower = (settings.territoryBrightness - 1) % 4;
  if (nextPower < 0) nextPower = 3;
  settings.territoryBrightness = nextPower;
  mapRebuild();
};

export const incAutoRuler = () => {
  settings.autoRulerPower += 1;
  mapRebuild();
};

export const decAutoRuler = () => {
  let nextPower = settings.autoRulerPower - 1;
  if (nextPower < 0) nextPower = 0;
  settings.autoRulerPower = nextPower;
  mapRebuild();
};

export const incCombatHandicap = () => {
  combatInfo.combatHandicap += 1;
  NeptunesPride.np.trigger("map_rebuild");
  NeptunesPride.np.trigger("refresh_interface");
};

export const decCombatHandicap = () => {
  combatInfo.combatHandicap -= 1;
  NeptunesPride.np.trigger("map_rebuild");
  NeptunesPride.np.trigger("refresh_interface");
};

export const registerDisplayControlHotkeys = () => {
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
};
