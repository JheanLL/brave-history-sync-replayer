document.getElementById('open-panel').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
  window.close();
});

document.getElementById('open-sync-internals').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'brave://sync-internals' });
  window.close();
});
