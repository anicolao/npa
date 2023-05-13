import { openDB } from "idb";
import { post } from "./network";
import { logCount } from "./npaserver";
export const messageCache: { [k: string]: any[] } = {
  game_event: [],
  game_diplomacy: [],
};

export interface Message {
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
            if (x.status === "read") {
              if (messageCache[x.key]?.length === undefined) {
                requestMessageComments(x.comment_count, x.key);
              } else {
                const len = messageCache[x.key].length;
                const delta = x.comment_count - len + 1;
                requestMessageComments(delta, x.key);
              }
            } else {
              console.log(
                `Avoid caching comments for ${x.key} since it is unread: ${x?.payload?.subject}`,
              );
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
      console.log(
        `Restored message cache for ${group} from db: ${messageCache[group].length}`,
      );
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
    for (let i = 0; i < incoming.length; ++i) {
      const message = incoming[i];
      if (message.key === messageCache[group][0].key) {
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
      console.log(`Missing some events for ${group}, double fetch to ${size}`);
      return requestRecentMessages(size, group);
    }
  }
  try {
    store(incoming, group);
    console.log(
      `Return full message set for ${group} of ${messageCache[group].length}`,
    );
  } catch (err) {
    console.error(err);
  }
  messageCache[group] = incoming.concat(messageCache[group]);
  console.log(`Return full message set of ${messageCache[group].length}`);
  return true;
}

const getRequestPath = () => {
  if (NeptunesPride.gameVersion !== "proteus") {
    return "trequest_osric";
  }
  return "prequest";
};
export async function requestRecentMessages(
  fetchSize: number,
  group: "game_event" | "game_diplomacy" | string,
) {
  console.log("requestRecentMessages");
  logCount(`requestRecentMessages ${fetchSize} ${group}`);
  const url = `/${getRequestPath()}/fetch_game_messages`;
  const data = {
    type: "fetch_game_messages",
    count: messageCache[group].length > 0 ? fetchSize : 100000,
    offset: 0,
    group,
    version: NeptunesPride.version,
    game_number: NeptunesPride.gameNumber,
  };
  logCount(group);
  return cacheEventResponseCallback(group, await post(url, data));
}

export async function requestMessageComments(
  fetchSize: number,
  message_key: string,
) {
  console.log(`reqeustMessageComments ${fetchSize} for ${message_key}`);
  const url = `/${getRequestPath()}/fetch_game_message_comments`;
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
