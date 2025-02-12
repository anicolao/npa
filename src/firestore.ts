import { initializeApp } from "firebase/app";
import { addDoc, collection } from "firebase/firestore";
import { isSafari } from "./useragent";

import { initializeFirestore } from "firebase/firestore";
import { getGameNumber } from "./intel";

const firebaseConfig = {
  apiKey: "AIzaSyCzwCKesO-Me1dVpo-5jZxoo559SoGGstk",
  authDomain: "npaserver.firebaseapp.com",
  projectId: "npaserver",
  storageBucket: "npaserver.appspot.com",
  messagingSenderId: "560331767449",
  appId: "1:560331767449:web:5595a4f5c3e02ed49bc208",
};

const app = initializeApp(firebaseConfig);
export const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: isSafari(),
});

export function registerForScans(apikey: string, notifications?: string) {
  const gameid = `${getGameNumber()}`;
  const store = collection(firestore, `newkey`);
  if (notifications) {
    addDoc(store, { game_id: gameid, api_key: apikey, notifications });
  } else {
    addDoc(store, { game_id: gameid, api_key: apikey });
  }
}
