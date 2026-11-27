// Un clic sur l'icône ouvre la page de vérification dans un onglet
// (un onglet reste ouvert pendant toute la vérification, contrairement à une fenêtre surgissante).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("page/verifier.html") });
});
