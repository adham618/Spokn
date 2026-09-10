document.getElementById('refreshBtn').addEventListener('click', function () {
  chrome.runtime.sendMessage({ type: 'RELOAD_ACTIVE_TAB' }, function () {
    window.close();
  });
});
