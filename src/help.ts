import { defineHotkey, getHotkeyCallback, getHotkeys } from "./hotkey";
import type { Stanzas } from "./reports";

declare global {
  var NeptunesPride: {
    universe: {
      helpHTML: string;
    };
    np: {
      trigger: (event: string, data?: any) => void;
    };
  };
  var Crux: {
    format: (template: string, data: any) => string;
  };
}

export const npaHelp = () => {
  const title = "Neptune's Pride Agent";
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

export const createNpaControls = (
  prepReport: (name: string, stanzas: Stanzas) => void,
) => {
  return () => {
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
};

export const registerHelpHotkeys = (
  prepReport: (name: string, stanzas: Stanzas) => void,
) => {
  const npaControls = createNpaControls(prepReport);
  defineHotkey("?", npaHelp, "Display this help screen.", "help");
  defineHotkey("~", npaControls, "Generate NPA Buttons.", "controls");
};
