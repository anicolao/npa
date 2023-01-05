import { openDB } from "idb";
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
    ...incoming.map((x) =>
      tx.store.add({ ...x, date: -Date.parse(x.created) }),
    ),
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

export function cacheEventResponseCallback(
  group: "game_event" | "game_diplomacy",
  resolve: (value: boolean | PromiseLike<boolean>) => void,
) {
  return async (response: { report: { messages: any } }) => {
    if (messageCache[group].length === 0) {
      try {
        messageCache[group] = await restore(group);
      } catch (err) {
        console.error(err);
      }
    }
    let incoming = response.report.messages;
    if (messageCache[group].length > 0) {
      let overlapOffset = -1;
      for (let i = 0; i < incoming.length; ++i) {
        const message = incoming[i];
        if (message.key === messageCache[group][0].key) {
          overlapOffset = i;
          break;
        }
      }
      if (overlapOffset >= 0) {
        incoming = incoming.slice(0, overlapOffset);
      } else if (overlapOffset < 0) {
        const size = incoming.length * 2;
        console.log(`Missing some events, double fetch to ${size}`);
        requestRecentMessages(size, group);
        return;
      }
    }
    try {
      store(incoming, group);
    } catch (err) {
      console.error(err);
    }
    messageCache[group] = incoming.concat(messageCache[group]);
    resolve(true);
  };
}

export function requestRecentMessages(
  fetchSize: number,
  group: "game_event" | "game_diplomacy",
) {
  const ret = new Promise<boolean>((resolve, reject) => {
    jQuery.ajax({
      type: "POST",
      url: "/trequest/fetch_game_messages",
      async: true,
      data: {
        type: "fetch_game_messages",
        count: messageCache[group].length > 0 ? fetchSize : 100000,
        offset: 0,
        group,
        version: NeptunesPride.version,
        game_number: NeptunesPride.gameNumber,
      },
      success: cacheEventResponseCallback(group, resolve),
      error: reject,
      dataType: "json",
    });
  });
  return ret;
}

export function updateMessageCache(
  group: "game_event" | "game_diplomacy",
): Promise<boolean> {
  return requestRecentMessages(4, group);
}
