import { addDoc, collection, doc, increment, setDoc } from "firebase/firestore";
import { firestore } from "./firestore";
import { getGameNumber } from "./intel";
import { getVersion } from "./version";

const recentErrors = new Map<string, number>();
let errorReportPending = false;
let retryErrorReportsAfter = 0;

export function logError(e: any) {
  const gameid = getGameNumber();
  const store = collection(firestore, `error`);
  const stack = e?.error?.stack || e?.reason?.stack || "no stack trace";
  const message =
    e?.error?.message || e?.reason?.message || e?.reason?.code || "no message";
  const version = getVersion();
  const timestamp = new Date().getTime();
  const signature = `${gameid}:${message}:${stack}`;
  if (
    errorReportPending ||
    timestamp < retryErrorReportsAfter ||
    timestamp - (recentErrors.get(signature) ?? Number.NEGATIVE_INFINITY) <
      60_000
  )
    return;
  recentErrors.set(signature, timestamp);
  if (recentErrors.size > 100)
    recentErrors.delete(recentErrors.keys().next().value);
  if (stack === "no stack trace") {
    console.error("No stack", e);
    if (e?.isTrusted !== true) {
      logCount(`${message}`);
      logCount(`${message}:${JSON.stringify(e)}`);
    }
  } else {
    errorReportPending = true;
    void addDoc(store, { gameid, stack, message, version, timestamp })
      .catch(() => {
        retryErrorReportsAfter = Date.now() + 60_000;
        console.warn(
          `Error reporting unavailable for game ${gameid}; retrying later`,
        );
      })
      .finally(() => {
        errorReportPending = false;
      });
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
