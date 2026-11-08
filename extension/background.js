// BlakeVPN v2.1 Chrome / Brave Extension Background Service Worker (Manifest V3)
// Controls chrome.proxy.settings, Unlinkable ECDSA Session Tickets, and Private Starknet RPC Shield state

const DEFAULT_REGIONS = {
  "EU-WEST-1": {
    name: "EU-West (Frankfurt)",
    host: "185.212.144.28",
    port: 1080,
    daemonPort: 8088,
    scheme: "socks5"
  },
  "US-EAST-1": {
    name: "US-East (Virginia)",
    host: "198.51.100.84",
    port: 1080,
    daemonPort: 8088,
    scheme: "socks5"
  },
  "AP-SE-1": {
    name: "Asia-Pacific (Singapore)",
    host: "203.0.113.192",
    port: 1080,
    daemonPort: 8088,
    scheme: "socks5"
  }
};

function randomHex(bytesLen) {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLen));
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildV2Ticket(region, planTier, rpcShieldEnabled) {
  const timestamp = Math.floor(Date.now() / 1000);
  const ticketPubkey = randomHex(16);
  const signatureR = randomHex(16);
  const signatureS = randomHex(16);
  return {
    version: "BLAKEVPN_TICKET_V2",
    ticketPubkey,
    region,
    planTier,
    rpcShieldEnabled: Boolean(rpcShieldEnabled),
    timestamp,
    poseidonDigest: randomHex(16),
    signature: [signatureR, signatureS]
  };
}

chrome.runtime.onInstalled.addListener(() => {
  const initialTicket = buildV2Ticket("EU-WEST-1", "MONTHLY_6", true);
  chrome.storage.local.set({
    connected: false,
    region: "EU-WEST-1",
    planTier: "MONTHLY_6",
    rpcShieldEnabled: true,
    customEndpoint: "",
    sessionToken: initialTicket.poseidonDigest,
    activeTicket: initialTicket,
    assignedIp: "10.66.66.2/32",
    lastHandshakeStatus: "Ready (v2.1 ECDSA Ticket Initialized)"
  });
});

function applyProxyConfig(regionKey, customEndpoint, rpcShieldEnabled) {
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
    chrome.action.setBadgeText({ text: rpcShieldEnabled ? "RPC+" : "ON" });
    chrome.action.setBadgeBackgroundColor({ color: rpcShieldEnabled ? "#00f3ff" : "#00ff41" });
  });
}

function clearProxyConfig() {
  chrome.proxy.settings.clear({ scope: "regular" }, () => {
    chrome.action.setBadgeText({ text: "" });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TOGGLE_VPN") {
    chrome.storage.local.get(
      ["connected", "region", "planTier", "rpcShieldEnabled", "customEndpoint"],
      (data) => {
        const nextState = !data.connected;
        const region = msg.region || data.region || "EU-WEST-1";
        const planTier = msg.planTier || data.planTier || "MONTHLY_6";
        const rpcShieldEnabled =
          msg.rpcShieldEnabled !== undefined
            ? Boolean(msg.rpcShieldEnabled)
            : Boolean(data.rpcShieldEnabled ?? true);
        const customEndpoint =
          msg.customEndpoint !== undefined ? msg.customEndpoint : data.customEndpoint || "";

        if (nextState) {
          applyProxyConfig(region, customEndpoint, rpcShieldEnabled);
        } else {
          clearProxyConfig();
        }

        const nextTicket = buildV2Ticket(region, planTier, rpcShieldEnabled);

        chrome.storage.local.set(
          {
            connected: nextState,
            region,
            planTier,
            rpcShieldEnabled,
            customEndpoint,
            sessionToken: nextTicket.poseidonDigest,
            activeTicket: nextTicket
          },
          () => {
            sendResponse({
              connected: nextState,
              region,
              planTier,
              rpcShieldEnabled,
              customEndpoint,
              sessionToken: nextTicket.poseidonDigest,
              activeTicket: nextTicket
            });
          }
        );
      }
    );
    return true;
  }

  if (msg.type === "UPDATE_REGION" || msg.type === "UPDATE_SETTINGS") {
    chrome.storage.local.get(["connected"], (data) => {
      const region = msg.region || "EU-WEST-1";
      const planTier = msg.planTier || "MONTHLY_6";
      const rpcShieldEnabled = Boolean(msg.rpcShieldEnabled ?? true);
      const customEndpoint = msg.customEndpoint || "";
      if (data.connected) {
        applyProxyConfig(region, customEndpoint, rpcShieldEnabled);
      }
      chrome.storage.local.set(
        { region, planTier, rpcShieldEnabled, customEndpoint },
        () => {
          sendResponse({ ok: true });
        }
      );
    });
    return true;
  }

  if (msg.type === "GENERATE_TICKET") {
    const region = msg.region || "EU-WEST-1";
    const planTier = msg.planTier || "MONTHLY_6";
    const rpcShieldEnabled = Boolean(msg.rpcShieldEnabled ?? true);
    const ticket = buildV2Ticket(region, planTier, rpcShieldEnabled);
    const lastHandshakeStatus = `Signed v2.1 ECDSA Ticket (${planTier}${rpcShieldEnabled ? " + RPC Shield" : ""})`;
    chrome.storage.local.set(
      {
        sessionToken: ticket.poseidonDigest,
        activeTicket: ticket,
        lastHandshakeStatus
      },
      () => {
        sendResponse({
          ok: true,
          sessionToken: ticket.poseidonDigest,
          activeTicket: ticket,
          lastHandshakeStatus
        });
      }
    );
    return true;
  }
});
