import { addDoc, collection, doc, increment, setDoc } from "firebase/firestore";
import { firestore } from "./firestore";
import { getGameNumber } from "./intel";
import { getVersion } from "./version";

export function logError(e: any) {
  const gameid = getGameNumber();
  const store = collection(firestore, `error`);
  const stack = e?.error?.stack || e?.reason?.stack || "no stack trace";
  const message =
    e?.error?.message || e?.reason?.message || e?.reason?.code || "no message";
  const version = getVersion();
  const timestamp = new Date().getTime();
  if (stack === "no stack trace") {
    console.error("No stack", e);
    if (e?.isTrusted !== true) {
      logCount(`${message}`);
      logCount(`${message}:${JSON.stringify(e)}`);
    }
  } else {
    addDoc(store, { gameid, stack, message, version, timestamp }).catch(
      (_e) => {
        console.error(`Failed to write error for game ${gameid}`);
      },
    );
  }
}

export function logCount(c: any) {
  const store = collection(firestore, `info`);
  const d = doc(store, "counters");
  const data: any = {};
  const fullVersion = getVersion();
  const caution = "⚠";
  const version =
    fullVersion.match(/v[0-9]\.[^ ]*/) +
    (fullVersion.indexOf(caution) !== -1 ? "-dev" : "");
  const key = `${version}_${c}`;
  console.log(`INCREMENT ${key}`);
  data[key] = increment(1);
  setDoc(d, data, { merge: true }).catch((e) => {
    console.error(`Error trying to increment ${key}`, { e, d, data });
  });
}
