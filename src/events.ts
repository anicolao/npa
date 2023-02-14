import { openDB } from "idb";
import { post } from "./network";
export const messageCache: { [k: string]: any[] } = {
  game_event: [],
  game_diplomacy: [],
};

async function store(incoming: any[], group: string) {
  const db = await openDB(group + NeptunesPride.gameNumber, 1, {
    upgrade(db) {
      const store = db.createObjectStore(group, {
        keyPath: "key",
      });
      store.createIndex("date", "date", { unique: false });
    },
  });

  const tx = db.transaction(group, "readwrite");
  await Promise.all([
    ...incoming.map((x) => {
      if (x.comment_count === 0) {
        return tx.store.add({ ...x, date: -Date.parse(x.created) });
      }
      return tx.store.put({ ...x, date: -Date.parse(x.activity) });
    }),
    tx.done,
  ]);
}
async function restore(group: string) {
  const db = await openDB(group + NeptunesPride.gameNumber, 1, {
    upgrade(db) {
      const store = db.createObjectStore(group, {
        keyPath: "key",
      });
      store.createIndex("date", "date", { unique: false });
    },
  });
  return db.getAllFromIndex(group, "date");
}

export async function restoreFromDB(group: "game_event" | "game_diplomacy") {
  if (messageCache[group].length === 0) {
    try {
      messageCache[group] = await restore(group);
      console.log(
        `Restored message cache from db: ${messageCache[group].length}`,
      );
    } catch (err) {
      console.error(err);
    }
  }
}
async function cacheEventResponseCallback(
  group: "game_event" | "game_diplomacy",
  response: { report: { messages: any } },
): Promise<boolean> {
  await restoreFromDB(group);
  let incoming = response.report.messages;
  if (messageCache[group].length > 0) {
    let overlapOffset = -1;
    const latest = messageCache[group][0];
    for (let i = 0; i < incoming.length; ++i) {
      const message = incoming[i];
      if (
        message.key === latest.key &&
        message.comment_count === latest.comment_count
      ) {
        overlapOffset = i;
        break;
      }
    }
    if (overlapOffset >= 0) {
      console.log(`Incoming messages total: ${incoming.length}`);
      incoming = incoming.slice(0, overlapOffset);
      console.log(`Incoming messages new: ${incoming.length}`);
    } else if (overlapOffset < 0) {
      const size = incoming.length * 2;
      console.log(`Missing some events, double fetch to ${size}`);
      return requestRecentMessages(size, group);
    }
  }
  try {
    store(incoming, group);
  } catch (err) {
    console.error(err);
  }
  messageCache[group] = incoming.concat(messageCache[group]);
  console.log(`Return full message set of ${messageCache[group].length}`);
  return true;
}

export async function requestRecentMessages(
  fetchSize: number,
  group: "game_event" | "game_diplomacy",
) {
  console.log("requestRecentMessages");
  const url = "/trequest/fetch_game_messages";
  const data = {
    type: "fetch_game_messages",
    count: messageCache[group].length > 0 ? fetchSize : 100000,
    offset: 0,
    group,
    version: NeptunesPride.version,
    game_number: NeptunesPride.gameNumber,
  };
  return cacheEventResponseCallback(group, await post(url, data));
}

export function updateMessageCache(
  group: "game_event" | "game_diplomacy",
): Promise<boolean> {
  console.log("updateMessageCache");
  return requestRecentMessages(4, group);
}
