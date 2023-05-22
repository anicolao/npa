import { NeptunesPrideData } from "./intel";

export function setupAutocomplete(
  element: Element,
  neptunesPride: NeptunesPrideData,
  getApiKey: () => string,
) {
  var autocompleteCaret = 0;
  let autocompleteTrigger = function (e: KeyboardEvent) {
    const target: any = e.target;
    if (target.type === "textarea") {
      const key = e.key;
      if (key === "]" || key === ":") {
        if (autocompleteCaret <= 0) {
          autocompleteCaret =
            target.value.lastIndexOf("[[", target.selectionStart - 1) + 2;
          if (autocompleteCaret <= 1) {
            autocompleteCaret = 0;
            return;
          }
          const nextStart = target.value.indexOf("[[", autocompleteCaret);
          const nextEnd = target.value.indexOf("]]", autocompleteCaret);
          const completed =
            nextEnd > -1 && (nextStart == -1 || nextEnd < nextStart);
          if (completed) {
            autocompleteCaret = 0;
            return;
          }
        }
        let start = autocompleteCaret;
        let endBracket = target.selectionStart;
        if (key === "]") endBracket -= 1;
        let autoString = target.value.substring(start, endBracket);
        autocompleteCaret = 0;
        let m = autoString.match(/^[0-9][0-9]*$/);
        if (m?.length) {
          let puid = Number(autoString);
          let end = target.selectionEnd;
          let auto = `${puid}]] ${neptunesPride.universe.galaxy.players[puid].alias}`;
          target.value =
            target.value.substring(0, start) +
            auto +
            target.value.substring(end, target.value.length);
          target.selectionStart = start + auto.length;
          target.selectionEnd = start + auto.length;
        }
        m = autoString.match(/api:/);
        if (m?.length && getApiKey()) {
          let auto = `api:${getApiKey()}]]`;
          let end = target.selectionEnd;
          target.value =
            target.value.substring(0, start) +
            auto +
            target.value.substring(end, target.value.length);
          target.selectionStart = start + auto.length;
          target.selectionEnd = start + auto.length;
        }
      } else if (target.selectionStart > 1) {
        let start = target.selectionStart - 2;
        let ss = target.value.substring(start, start + 2);
        autocompleteCaret = ss === "[[" ? target.selectionStart : 0;
      }
    }
  };
  element.addEventListener("keyup", autocompleteTrigger);
}
