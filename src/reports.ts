import { setClip } from "./hotkey";

export type Stanzas = (string | string[])[];
export type Filter = (s: string) => boolean;

export const contains = (content: string) => {
  return (s: string) => s.indexOf(content) !== -1;
};

export const makeReportContent = function (stanzas: Stanzas, filter?: Filter) {
  stanzas = stanzas.filter((x) => {
    if (Array.isArray(x) && filter !== undefined) {
      const accepted = x.filter(filter);
      return accepted.length > 0;
    }
    return true;
  });
  const content = stanzas.flat().join("\n");
  return content;
};
