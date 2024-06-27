/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  console.log("Neptune's Pride Agent installed.");
});

function intelDump() {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("intel.js");
  s.id = "intel";
  s.title = `Neptune's Pride Agent v${chrome.runtime.getManifest().version}`;
  s.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(s);
  console.log(`${s.title} background page.`);
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status == "complete") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: intelDump,
    });
  }
});
