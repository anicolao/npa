import { defineHotkey } from "./hotkey";

export interface NeptunesPrideUI {
  npui: {
    trigger: (event: string, data?: any) => void;
  };
}

export const showUI = () =>
  (globalThis as any).NeptunesPride.npui.trigger("show_npa", "npa_ui_screen");

export const showOptions = (options?: any) => {
  (globalThis as any).NeptunesPride.npui.trigger("show_npa", [
    "npa_ui_screen",
    { kind: "npa_options", ...options },
  ]);
};

export const configureColours = (options?: any) => {
  (globalThis as any).NeptunesPride.npui.trigger("show_npa", [
    "npa_ui_screen",
    { kind: "npa_colours", ...options },
  ]);
};

export const registerUIHotkeys = () => {
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
};
