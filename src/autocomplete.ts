import { NeptunesPrideData } from "./intel";

export function setupAutocomplete(
  element: Element,
  neptunesPride: NeptunesPrideData,
  getApiKey: () => string,
) {
  var autocompleteCaret = 0;
  type SearchCandidate = {
    matchPriority: number;
    matchText: string;
    completion: string;
  };
  let candidates: SearchCandidate[] = null;
  let resetCandidates = function () {
    candidates = null;
  };
  let autocompleteTrigger = function (e: KeyboardEvent) {
    const target: any = e.target;
    if (target.type === "textarea") {
      const key = e.key;
      if (key != "]") {
        resetCandidates();
      }
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
          autocompleteCaret = 0;
        } else if (key === "]") {
          if (candidates === null) {
            candidates = [];
            let matches = (s: string): boolean => {
              return (
                s.toLocaleLowerCase().substring(0, autoString.length) ==
                autoString.toLocaleLowerCase()
              );
            };
            for (const key in neptunesPride.universe.galaxy.stars) {
              const star: any = neptunesPride.universe.galaxy.stars[key];
              if (!matches(star.n)) continue;
              candidates.push({
                matchPriority: 1,
                matchText: star.n,
                completion: `[[${star.n}]]`,
              });
            }
            for (const key in neptunesPride.universe.galaxy.players) {
              const player = neptunesPride.universe.galaxy.players[key];
              if (!matches(player.alias)) continue;
              candidates.push({
                matchPriority: 0,
                matchText: player.alias,
                completion: `[[${key}]] ${player.alias}`,
              });
            }
            candidates.sort((a, b) => {
              if (a.matchPriority === b.matchPriority) {
                return a.matchText < b.matchText
                  ? -1
                  : a.matchText > b.matchText
                  ? 1
                  : 0;
              }
              return a.matchPriority - b.matchPriority;
            });
          }
          if (candidates.length > 0) {
            const candidate = candidates.shift();
            const end = target.selectionEnd;
            target.value =
              target.value.substring(0, start - 2) +
              candidate.completion +
              target.value.substring(end, target.value.length);
            target.selectionStart = start - 2 + candidate.completion.length;
            target.selectionEnd = start - 2 + candidate.completion.length;
            candidates.push(candidate);
            return;
          }
        }
        autocompleteCaret = 0;
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
  element.addEventListener("blur", resetCandidates);
}
