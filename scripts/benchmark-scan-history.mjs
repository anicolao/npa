// Run with: node scripts/benchmark-scan-history.mjs
// Synthetic 64-player history; not a measurement of the live browser.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { build } from "esbuild";

const { outputFiles } = await build({
  stdin: {
    contents:
      'export * from "./src/scan-history"; export * from "./src/patch";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { prepareScanBlock, clone, diff, patch } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);
const galaxy = { tick: 0, playerUid: 1, stars: {}, fleets: {}, players: {} };
for (let i = 1; i <= 1024; i++)
  galaxy.stars[i] = {
    uid: i,
    puid: (i % 64) + 1,
    st: 100,
    x: i / 100,
    y: i / 1000,
    n: `Star ${i}`,
    v: 1,
    i: 3,
    e: 5,
    s: 2,
    ga: 0,
  };
for (let i = 1; i <= 976; i++)
  galaxy.fleets[i] = {
    uid: i,
    puid: (i % 64) + 1,
    st: 50,
    x: i / 100,
    y: i / 1000,
    o: [[0, (i % 1024) + 1, 1, 0]],
    l: 0,
  };
for (let i = 1; i <= 64; i++)
  galaxy.players[i] = {
    uid: i,
    alias: `Player ${i}`,
    tech: { 3: { level: 8 }, 5: { level: 10 } },
    war: {},
  };
const blocks = [];
let block;
for (let tick = 1; tick <= 500; tick++) {
  const delta = {
    tick,
    stars: { [(tick % 1024) + 1]: { st: 100 + tick } },
    fleets: { [(tick % 976) + 1]: { st: 50 + tick } },
  };
  patch(galaxy, delta);
  if (tick % 20 === 1) {
    block = {
      initial_timestamp: tick,
      initial_scan: JSON.stringify({ scanning_data: galaxy }),
    };
    blocks.push(block);
    block[tick] = JSON.stringify({ scanning_data: galaxy });
  } else block[tick] = JSON.stringify({ scanning_data: delta });
  block.last_timestamp = tick;
  block.last_scan = JSON.stringify({ scanning_data: galaxy });
}
const records = [];
for (const block of blocks) records.push(...(await prepareScanBlock(block)));

function fullHistoryValidation() {
  let state = {};
  const reverse = [];
  for (const record of records) {
    const previous = clone(state);
    state = patch(state, record.forward);
    reverse.push(diff(state, previous));
    if (record.check) assert.equal(diff(record.check, state), null);
  }
  assert.equal(state.tick, 500);
  for (let i = records.length - 1; i >= 0; i--) {
    state = patch(state, reverse[i]);
    if (records[i - 1]?.check)
      assert.equal(diff(records[i - 1].check, state), null);
  }
}
async function changedBlockPreparation() {
  const changed = await prepareScanBlock(blocks.at(-1));
  const previous = JSON.parse(blocks.at(-2).last_scan).scanning_data;
  changed[0].forward = diff(previous, changed[0].check);
  changed[0].back = diff(changed[0].check, previous);
  assert.equal(changed.at(-1).check.tick, 500);
}
const oldTimes = [],
  newTimes = [];
for (let i = 0; i < 3; i++) {
  let start = performance.now();
  fullHistoryValidation();
  oldTimes.push(performance.now() - start);
  start = performance.now();
  await changedBlockPreparation();
  newTimes.push(performance.now() - start);
}
const median = (values) => [...values].sort((a, b) => a - b)[1];
console.log(
  JSON.stringify(
    {
      fixture: {
        players: 64,
        stars: 1024,
        fleets: 976,
        scans: 500,
        scansPerBlock: 20,
      },
      fullHistoryValidationMs: oldTimes.map(Math.round),
      changedBlockPreparationMs: newTimes.map(Math.round),
      medianSpeedup: Math.round(median(oldTimes) / median(newTimes)),
    },
    null,
    2,
  ),
);
