import { combatInfo } from "./combatcalc";
import { defineHotkey } from "./hotkey";

declare global {
  var NeptunesPride: {
    np: {
      trigger: (event: string, data?: any) => void;
    };
  };
}

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

export const registerCombatControlHotkeys = () => {
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
