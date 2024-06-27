export type Stanzas = (string | string[])[];
export type Filter = (s: string) => boolean;
export type MapString = (s: string) => string;

export const contains = (c: string) => {
  const content = c.toLowerCase();
  return (s: string) => s.indexOf(content) !== -1;
};

export const and = (f1: Filter, f2: Filter) => {
  return (s: string) => f1(s) && f2(s);
};

export const or = (f1: Filter, f2: Filter) => {
  return (s: string) => f1(s) || f2(s);
};

export const makeReportContent = (
  input: Stanzas,
  filter?: Filter,
  preprocess?: MapString,
) => {
  const stanzas = input.filter((ix) => {
    let x = ix;
    if (Array.isArray(x) && filter !== undefined) {
      if (preprocess !== undefined) {
        x = x.map(preprocess);
      }
      const accepted = x.filter(filter);
      return accepted.length > 0;
    }
    return true;
  });
  const content = stanzas.flat().join("\n");
  return content;
};
