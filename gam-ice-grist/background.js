// Un clic sur l'icône de l'extension ouvre la page de l'outil.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("outil.html") });
});
