// BlakeVPN Chrome / Brave Extension Background Service Worker (Manifest V3)
// Controls chrome.proxy.settings to route browser tabs through bonded BlakeNode SOCKS5 / HTTPS relays

const DEFAULT_REGIONS = {
  "EU-WEST-1": {
    name: "EU-West (Frankfurt)",
    host: "185.212.144.28",
    port: 1080,
    scheme: "socks5"
  },
  "US-EAST-1": {
    name: "US-East (Virginia)",
    host: "198.51.100.84",
    port: 1080,
    scheme: "socks5"
  },
  "AP-SE-1": {
    name: "Asia-Pacific (Singapore)",
    host: "203.0.113.192",
    port: 1080,
    scheme: "socks5"
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    connected: false,
    region: "EU-WEST-1",
    customEndpoint: "",
    sessionToken: "0x" + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
  });
});

function applyProxyConfig(regionKey, customEndpoint) {
  let host = DEFAULT_REGIONS[regionKey]?.host || "185.212.144.28";
  let port = DEFAULT_REGIONS[regionKey]?.port || 1080;

  if (customEndpoint && customEndpoint.includes(":")) {
    const parts = customEndpoint.split(":");
    host = parts[0].trim();
    port = parseInt(parts[1].trim(), 10) || 1080;
  }

  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "socks5",
        host: host,
        port: port
      },
      bypassList: ["localhost", "127.0.0.1", "*.local"]
    }
  };

  chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#00ff41" });
  });
}

function clearProxyConfig() {
  chrome.proxy.settings.clear({ scope: "regular" }, () => {
    chrome.action.setBadgeText({ text: "" });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TOGGLE_VPN") {
    chrome.storage.local.get(["connected", "region", "customEndpoint"], (data) => {
      const nextState = !data.connected;
      const region = msg.region || data.region || "EU-WEST-1";
      const customEndpoint = msg.customEndpoint !== undefined ? msg.customEndpoint : (data.customEndpoint || "");

      if (nextState) {
        applyProxyConfig(region, customEndpoint);
      } else {
        clearProxyConfig();
      }

      chrome.storage.local.set({ connected: nextState, region, customEndpoint }, () => {
        sendResponse({ connected: nextState, region, customEndpoint });
      });
    });
    return true;
  }

  if (msg.type === "UPDATE_REGION") {
    chrome.storage.local.get(["connected"], (data) => {
      const region = msg.region || "EU-WEST-1";
      const customEndpoint = msg.customEndpoint || "";
      if (data.connected) {
        applyProxyConfig(region, customEndpoint);
      }
      chrome.storage.local.set({ region, customEndpoint }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});
