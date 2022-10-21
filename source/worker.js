const add_intel_plugin = () => {
	var s = document.createElement('script');
	s.src = chrome.runtime.getURL('intel.js');
	s.id = "intel";
	s.title = "Stoned Ape Tools v" + chrome.runtime.getManifest().version;
	s.onload = function () {
		this.remove();
	};
	(document.head || document.documentElement).appendChild(s);
	console.log(s.title + " background page.");
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status == 'complete' && tab.active) {
		chrome.scripting.executeScript({
			target: { tabId: tabId },
			func: add_intel_plugin
		}).catch(console.log)
	}
});