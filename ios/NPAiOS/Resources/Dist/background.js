// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @match       https://np4.ironhelmet.com/*
// @version     2.2.89
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==
    
(() => {
  // src/background.js
  chrome.runtime.onInstalled.addListener(() => {
    console.log("Neptune's Pride Agent installed.");
  });
  function intelDump() {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("intel.js");
    s.id = "intel";
    s.title = `Neptune's Pride Agent v${chrome.runtime.getManifest().version}`;
    s.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
    console.log(`${s.title} background page.`);
  }
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status == "complete") {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: intelDump
      });
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2JhY2tncm91bmQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qIGdsb2JhbCBjaHJvbWUgKi9cblxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuICBjb25zb2xlLmxvZyhcIk5lcHR1bmUncyBQcmlkZSBBZ2VudCBpbnN0YWxsZWQuXCIpO1xufSk7XG5cbmZ1bmN0aW9uIGludGVsRHVtcCgpIHtcbiAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XG4gIHMuc3JjID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwiaW50ZWwuanNcIik7XG4gIHMuaWQgPSBcImludGVsXCI7XG4gIHMudGl0bGUgPSBgTmVwdHVuZSdzIFByaWRlIEFnZW50IHYke2Nocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkudmVyc2lvbn1gO1xuICBzLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnJlbW92ZSgpO1xuICB9O1xuICAoZG9jdW1lbnQuaGVhZCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKHMpO1xuICBjb25zb2xlLmxvZyhgJHtzLnRpdGxlfSBiYWNrZ3JvdW5kIHBhZ2UuYCk7XG59XG5cbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigoX3RhYklkLCBjaGFuZ2VJbmZvLCB0YWIpID0+IHtcbiAgaWYgKGNoYW5nZUluZm8uc3RhdHVzID09IFwiY29tcGxldGVcIikge1xuICAgIGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdCh7XG4gICAgICB0YXJnZXQ6IHsgdGFiSWQ6IHRhYi5pZCB9LFxuICAgICAgZnVuY3Rpb246IGludGVsRHVtcCxcbiAgICB9KTtcbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUVBLFNBQU8sUUFBUSxZQUFZLFlBQVksTUFBTTtBQUMzQyxZQUFRLElBQUksa0NBQWtDO0FBQUEsRUFDaEQsQ0FBQztBQUVELFdBQVMsWUFBWTtBQUNuQixVQUFNLElBQUksU0FBUyxjQUFjLFFBQVE7QUFDekMsTUFBRSxNQUFNLE9BQU8sUUFBUSxPQUFPLFVBQVU7QUFDeEMsTUFBRSxLQUFLO0FBQ1AsTUFBRSxRQUFRLDBCQUEwQixPQUFPLFFBQVEsWUFBWSxFQUFFLE9BQU87QUFDeEUsTUFBRSxTQUFTLFdBQVk7QUFDckIsV0FBSyxPQUFPO0FBQUEsSUFDZDtBQUNBLEtBQUMsU0FBUyxRQUFRLFNBQVMsaUJBQWlCLFlBQVksQ0FBQztBQUN6RCxZQUFRLElBQUksR0FBRyxFQUFFLEtBQUssbUJBQW1CO0FBQUEsRUFDM0M7QUFFQSxTQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsUUFBUSxZQUFZLFFBQVE7QUFDN0QsUUFBSSxXQUFXLFVBQVUsWUFBWTtBQUNuQyxhQUFPLFVBQVUsY0FBYztBQUFBLFFBQzdCLFFBQVEsRUFBRSxPQUFPLElBQUksR0FBRztBQUFBLFFBQ3hCLFVBQVU7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
