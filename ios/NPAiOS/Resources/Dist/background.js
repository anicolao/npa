// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @match       https://np4.ironhelmet.com/*
// @version     2.2.89
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==
    
(()=>{chrome.runtime.onInstalled.addListener(()=>{console.log("Neptune's Pride Agent installed.")});function i(){let e=document.createElement("script");e.src=chrome.runtime.getURL("intel.js"),e.id="intel",e.title=`Neptune's Pride Agent v${chrome.runtime.getManifest().version}`,e.onload=function(){this.remove()},(document.head||document.documentElement).appendChild(e),console.log(`${e.title} background page.`)}chrome.tabs.onUpdated.addListener((e,t,n)=>{t.status=="complete"&&chrome.scripting.executeScript({target:{tabId:n.id},function:i})});})();
//# sourceMappingURL=background.js.map
