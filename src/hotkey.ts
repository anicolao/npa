import * as Mousetrap from "mousetrap";

var lastClip = "Error";
interface HelpText {
  help?: string;
  button?: string;
}
type Callback = () => void;
export type HotkeyCallback = Callback & HelpText;

export function setClip(text: string): void {
  lastClip = text;
}

export function getClip(): string {
  return lastClip;
}

const copy = function (reportFn: HotkeyCallback) {
  return function () {
    reportFn();
    navigator.clipboard.writeText(lastClip);
  };
};

interface HotkeyMap {
  [k: string]: HotkeyCallback;
}
var hotkeys: HotkeyMap = {};
export function defineHotkey(
  key: string,
  action: HotkeyCallback,
  help?: string,
  button?: string,
) {
  if (help) {
    action.help = help;
  }
  if (button) {
    action.button = button;
  } else {
    action.button = key;
  }
  hotkeys[key] = action;
  Mousetrap.bind(key, copy(action));
}

export function getHotkeys() {
  return Object.keys(hotkeys);
}

export function getHotkeyCallback(key: string): HotkeyCallback {
  return hotkeys[key];
}
