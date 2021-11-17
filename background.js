chrome.runtime.onInstalled.addListener(() => { console.log("Neptune's Pride Agent installed."); });

function intelDump() {
  console.log("Click.");

	var s = document.createElement('script');
	s.src = chrome.runtime.getURL('intel.js');
	console.log("src", s.src);
	s.onload = function() {
		this.remove();
	};
	(document.head || document.documentElement).appendChild(s);

  console.log("Clack.");
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status == 'complete') {
		chrome.scripting.executeScript({
			target: { tabId: tab.id },
			function: intelDump
		});
	}
});

