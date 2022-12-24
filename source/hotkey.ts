export var lastClip = "Error";
export type Callback = () => void;

interface KeybindingInterface {
  bind: (key: string, callback: Callback) => void;
}

declare global {
  var Mousetrap: KeybindingInterface;
}

export function clip(text: string): void {
  lastClip = text;
}

const copy = function (reportFn: Callback) {
  return function () {
    reportFn();
    navigator.clipboard.writeText(lastClip);
  };
};

export var hotkeys: [string, Callback][] = [];
export function hotkey(key: string, action: Callback) {
  hotkeys.push([key, action]);
  Mousetrap.bind(key, copy(action));
}
