import * as Mousetrap from "mousetrap";

let lastClip = "Error";
interface HelpText {
  help?: string;
  button?: string;
}
type Callback = () => void;
export type HotkeyCallback = Callback & HelpText;

export function setClip(text: string): void {
  lastClip = text;
  navigator.clipboard.writeText(lastClip).catch((err) => {
    console.log(`clipboard ${err}`);
  });
}

export function getClip(): string {
  return lastClip;
}

const preventDefault = (reportFn: HotkeyCallback) => () => {
  reportFn();
  return false;
};

interface HotkeyMap {
  [k: string]: HotkeyCallback;
}
const hotkeys: HotkeyMap = {};
const actionMap: { [k: string]: string } = {};
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
  actionMap[button] = key;
  Mousetrap.bind(key, preventDefault(action));
}

export function getHotkeys() {
  return Object.keys(hotkeys);
}

export function getHotkeyCallback(key: string): HotkeyCallback {
  return hotkeys[key];
}

export function getHotkey(action: string): string {
  return actionMap[action];
}
