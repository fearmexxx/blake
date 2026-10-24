// BlakeVPN Popup UI Controller
const statusText = document.getElementById("statusText");
const sessionTokenText = document.getElementById("sessionTokenText");
const regionSelect = document.getElementById("regionSelect");
const customHost = document.getElementById("customHost");
const toggleBtn = document.getElementById("toggleBtn");

function renderState(connected, region, customEndpoint, sessionToken) {
  if (region) regionSelect.value = region;
  if (customEndpoint !== undefined) customHost.value = customEndpoint;
  if (sessionToken) {
    sessionTokenText.textContent = "Session Nullifier: " + sessionToken.slice(0, 18) + "...";
  }

  if (connected) {
    statusText.textContent = "CONNECTED (" + (customEndpoint || region) + ")";
    statusText.style.color = "#00ff41";
    toggleBtn.textContent = "DISCONNECT BLAKEVPN";
    toggleBtn.className = "connect-btn btn-connected";
  } else {
    statusText.textContent = "DISCONNECTED (DIRECT)";
    statusText.style.color = "#9ca3af";
    toggleBtn.textContent = "ACTIVATE UNLINKABLE PROXY";
    toggleBtn.className = "connect-btn btn-disconnected";
  }
}

chrome.storage.local.get(["connected", "region", "customEndpoint", "sessionToken"], (data) => {
  renderState(Boolean(data.connected), data.region || "EU-WEST-1", data.customEndpoint || "", data.sessionToken);
});

toggleBtn.addEventListener("click", () => {
  const region = regionSelect.value;
  const customEndpoint = customHost.value.trim();
  chrome.runtime.sendMessage({ type: "TOGGLE_VPN", region, customEndpoint }, (res) => {
    if (res) {
      chrome.storage.local.get(["sessionToken"], (d) => {
        renderState(res.connected, res.region, res.customEndpoint, d.sessionToken);
      });
    }
  });
});

regionSelect.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "UPDATE_REGION",
    region: regionSelect.value,
    customEndpoint: customHost.value.trim()
  });
});
