import { expect } from "chai";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { JSDOM } from "jsdom";

import { NeptunesPrideData } from "../src/intel";
import { setupAutocomplete } from "../src/autocomplete";

describe("autocomplete tests", () => {
  let dom: JSDOM = null;
  let myApiKey = "MYKEY";
  let elem: HTMLTextAreaElement = null;
  let NeptunesPride: NeptunesPrideData = {
    universe: {
      galaxy: {
        players: {
          0: { alias: "Player One" },
          1: { alias: "Player Two" },
        },
      },
    },
    sendAllTech: function (recipient: number): void {
      throw new Error("Function not implemented.");
    },
    sendTech: function (recipient: number, tech: string): void {
      throw new Error("Function not implemented.");
    },
    sendCash: function (recipient: number, price: number): void {
      throw new Error("Function not implemented.");
    },
    gameVersion: "",
    version: undefined,
    inbox: undefined,
    gameNumber: undefined,
    np: undefined,
    npui: undefined,
    originalPlayer: undefined,
    gameConfig: undefined,
    account: undefined,
    templates: {},
  };
  beforeEach(() => {
    dom = new JSDOM(
      "<!DOCTYPE html><html><body><textarea></textarea></body></html>",
    );
    elem = dom.window.document.querySelector("textarea");
    setupAutocomplete(elem, NeptunesPride, () => {
      return myApiKey;
    });
  });

  function type(key: string) {
    elem.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { bubbles: true, key }),
    );
    if (key.length == 1) {
      const selection = elem.selectionStart + 1;
      elem.value =
        elem.value.substring(0, elem.selectionStart) +
        key +
        elem.value.substring(elem.selectionEnd);
      elem.setSelectionRange(selection, selection);
    }
    elem.dispatchEvent(
      new dom.window.KeyboardEvent("keyup", { bubbles: true, key }),
    );
  }
  function extractCursor(text: string): [string, number] {
    let cursor = text.indexOf("|");
    if (cursor != -1)
      text = text.substring(0, cursor) + text.substring(cursor + 1);
    else cursor = text.length;
    return [text, cursor];
  }
  function setText(text: string) {
    let cursor;
    [text, cursor] = extractCursor(text);
    elem.value = text;
    elem.setSelectionRange(cursor, cursor);
  }
  function getText(): string {
    // Only supports empty selections.
    expect(elem.selectionStart).to.equal(elem.selectionEnd);
    return `${elem.value.substring(
      0,
      elem.selectionStart,
    )}|${elem.value.substring(elem.selectionStart)}`;
  }

  it("autocompletes a player name", () => {
    setText("[[0|");
    type("]");
    expect(getText()).to.equal("[[0]] Player One|");
  });

  it("autocompletes a player name before another completed player name", () => {
    setText("[[0| and [[1]] Player Two");
    type("]");
    expect(getText()).to.equal("[[0]] Player One| and [[1]] Player Two");
  });

  it("completes your api key", () => {
    setText("My API key is [[api|. [[1]] Player Two is nearby.");
    type(":");
    expect(getText()).to.equal(
      `My API key is [[api:${myApiKey}]]|. [[1]] Player Two is nearby.`,
    );
  });
});
