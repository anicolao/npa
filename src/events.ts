import { openDB } from "idb";
import { post } from "./network";
export const messageCache: { [k: string]: any[] } = {
  game_event: [],
  game_diplomacy: [],
};

interface Message {
  activity?: string;
  comment_count?: number;
  created: string;
  date: number;
  group?: "game_event" | "game_diplomacy";
  key: string;
  payload?: any;
  status?: "read" | "unread";
  body?: string;
}

interface TypedMessage {
  group: string;
  message: Message;
}

export const messageIndex: { [word: string]: TypedMessage[] } = {};

function dbName(group: string) {
  return `${NeptunesPride.gameNumber}:${group}`;
}
async function store(incoming: any[], group: string) {
  const db = await openDB(dbName(group), 1, {
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
      if (x?.comment_count === 0) {
        return tx.store.add({ ...x, date: -Date.parse(x.created) });
      }
      return tx.store
        .put({ ...x, date: -Date.parse(x?.activity || x.created) })
        .then(async () => {
          if (x.comment_count) {
            if (messageCache[x.key]?.length === undefined) {
              requestMessageComments(x.comment_count, x.key);
            } else {
              const len = messageCache[x.key].length;
              const delta = x.comment_count - len + 1;
              requestMessageComments(delta, x.key);
            }
          }
        });
    }),
    tx.done,
  ]);
}
async function restore(group: string) {
  const db = await openDB(dbName(group), 1, {
    upgrade(db) {
      const store = db.createObjectStore(group, {
        keyPath: "key",
      });
      store.createIndex("date", "date", { unique: false });
    },
  });
  return db.getAllFromIndex(group, "date");
}

function indexMessages(group: string, messages: any[]) {
  messages.forEach((message) => {
    if (message.body || message.payload?.body) {
      const body = message.body || message.payload?.body;
      const tokens = body.split(/[^\w\d]+/);
      tokens.forEach((token: string) => {
        if (token) {
          if (messageIndex[token] === undefined) {
            messageIndex[token] = [];
          }
          messageIndex[token].push({ group, message });
        }
      });
    }
  });
}

export async function restoreFromDB(
  group: "game_event" | "game_diplomacy" | string,
) {
  if (messageCache[group]?.length === undefined) {
    messageCache[group] = [];
  }
  if (messageCache[group].length === 0) {
    try {
      messageCache[group] = await restore(group);
      indexMessages(group, messageCache[group]);
      console.log(
        `Restored message cache for ${group} from db: ${messageCache[group].length}`,
      );
      if (group === "game_diplomacy") {
        messageCache[group].forEach((message) => restoreFromDB(message.key));
      }
    } catch (err) {
      console.error(err);
    }
  }
}
async function cacheEventResponseCallback(
  group: "game_event" | "game_diplomacy" | string,
  response: { report: { messages: any } },
): Promise<boolean> {
  let incoming = response.report.messages;
  await restoreFromDB(group);
  if (messageCache[group].length > 0) {
    let overlapOffset = -1;
    let first = 0;
    let len = messageCache[group].length;
    let latest = messageCache[group][first];
    for (let i = 0; i < incoming.length; ++i) {
      const message = incoming[i];
      if (message.key === latest.key) {
        first++;
        if (message?.comment_count === latest?.comment_count || first >= len) {
          overlapOffset = i;
          break;
        }
        messageCache[group] = messageCache[group].slice(1);
        latest = messageCache[group][0];
        i = 0;
      }
    }
    if (overlapOffset >= 0) {
      console.log(`Incoming messages total: ${incoming.length}`);
      incoming = incoming.slice(0, overlapOffset);
      console.log(`Incoming messages new: ${incoming.length}`);
      if (group === "game_diplomacy") {
        // possibly the incoming messages replace old ones with updates
        const incomingKeys = incoming.map((m: any) => m.key);
        let indices: any[] = [];
        messageCache[group].forEach((message, i) => {
          if (incomingKeys.indexOf(message.key) !== -1) {
            indices.push(i);
          }
        });
        indices = indices.reverse();
        console.log(`Removing ${indices.length} old messages`);
        indices.forEach((i) => messageCache[group].splice(i, 1));
      }
    } else if (overlapOffset < 0) {
      const size = incoming.length * 2;
      console.log(`Missing some events for ${group}, double fetch to ${size}`);
      if (group === "game_event" || group === "game_diplomacy") {
        return requestRecentMessages(size, group);
      }
      return requestMessageComments(size, group);
    }
  }
  try {
    store(incoming, group);
  } catch (err) {
    console.error(err);
  }
  indexMessages(group, incoming);
  messageCache[group] = incoming.concat(messageCache[group]);
  console.log(
    `Return full message set for ${group} of ${messageCache[group].length}`,
  );
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

export async function requestMessageComments(
  fetchSize: number,
  message_key: string,
) {
  console.log(`reqeustMessageComments ${fetchSize} for ${message_key}`);
  const url = "/trequest/fetch_game_message_comments";
  const data = {
    type: "fetch_game_message_comments",
    count: fetchSize,
    offset: 0,
    message_key,
    version: NeptunesPride.version,
    game_number: NeptunesPride.gameNumber,
  };
  return cacheEventResponseCallback(message_key, await post(url, data));
}

export function updateMessageCache(
  group: "game_event" | "game_diplomacy",
): Promise<boolean> {
  console.log("updateMessageCache");
  return requestRecentMessages(4, group);
}
