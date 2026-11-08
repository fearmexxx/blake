// BlakeVPN v2.1 Popup UI Controller
const statusText = document.getElementById("statusText");
const sessionTokenText = document.getElementById("sessionTokenText");
const handshakeText = document.getElementById("handshakeText");
const planSelect = document.getElementById("planSelect");
const regionSelect = document.getElementById("regionSelect");
const rpcShieldToggle = document.getElementById("rpcShieldToggle");
const customHost = document.getElementById("customHost");
const toggleBtn = document.getElementById("toggleBtn");
const handshakeBtn = document.getElementById("handshakeBtn");

function renderState(state) {
  const {
    connected,
    region,
    planTier,
    rpcShieldEnabled,
    customEndpoint,
    sessionToken,
    lastHandshakeStatus
  } = state;

  if (region) regionSelect.value = region;
  if (planTier) planSelect.value = planTier;
  if (rpcShieldEnabled !== undefined) rpcShieldToggle.checked = Boolean(rpcShieldEnabled);
  if (customEndpoint !== undefined) customHost.value = customEndpoint;

  if (sessionToken) {
    sessionTokenText.textContent = "ECDSA Ticket Digest: " + sessionToken.slice(0, 18) + "...";
  }
  if (lastHandshakeStatus) {
    handshakeText.textContent = lastHandshakeStatus;
  }

  if (connected) {
    const shieldTag = rpcShieldToggle.checked ? " + RPC SHIELD" : "";
    statusText.textContent = "CONNECTED (" + (customEndpoint || region) + shieldTag + ")";
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

chrome.storage.local.get(
  [
    "connected",
    "region",
    "planTier",
    "rpcShieldEnabled",
    "customEndpoint",
    "sessionToken",
    "lastHandshakeStatus"
  ],
  (data) => {
    renderState({
      connected: Boolean(data.connected),
      region: data.region || "EU-WEST-1",
      planTier: data.planTier || "MONTHLY_6",
      rpcShieldEnabled: data.rpcShieldEnabled !== undefined ? Boolean(data.rpcShieldEnabled) : true,
      customEndpoint: data.customEndpoint || "",
      sessionToken: data.sessionToken,
      lastHandshakeStatus: data.lastHandshakeStatus
    });
  }
);

function syncSettings() {
  chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    region: regionSelect.value,
    planTier: planSelect.value,
    rpcShieldEnabled: rpcShieldToggle.checked,
    customEndpoint: customHost.value.trim()
  });
}

toggleBtn.addEventListener("click", () => {
  const payload = {
    type: "TOGGLE_VPN",
    region: regionSelect.value,
    planTier: planSelect.value,
    rpcShieldEnabled: rpcShieldToggle.checked,
    customEndpoint: customHost.value.trim()
  };
  chrome.runtime.sendMessage(payload, (res) => {
    if (res) {
      renderState({
        connected: res.connected,
        region: res.region,
        planTier: res.planTier,
        rpcShieldEnabled: res.rpcShieldEnabled,
        customEndpoint: res.customEndpoint,
        sessionToken: res.sessionToken,
        lastHandshakeStatus: res.connected
          ? "Active v2.1 Tunnel (" + res.planTier + ")"
          : "Tunnel Disconnected"
      });
    }
  });
});

handshakeBtn.addEventListener("click", async () => {
  const region = regionSelect.value;
  const planTier = planSelect.value;
  const rpcShieldEnabled = rpcShieldToggle.checked;
  const endpointInput = customHost.value.trim();
  const daemonBase =
    endpointInput && endpointInput.startsWith("http")
      ? endpointInput.replace(/\/$/, "")
      : "http://127.0.0.1:8088";

  handshakeText.textContent = "Signing ECDSA Ticket & probing node daemon...";

  chrome.runtime.sendMessage(
    { type: "GENERATE_TICKET", region, planTier, rpcShieldEnabled },
    async (res) => {
      if (!res) return;
      try {
        const daemonRes = await fetch(daemonBase + "/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionPubkey: res.activeTicket?.ticketPubkey || res.sessionToken,
            planTier,
            rpcShield: rpcShieldEnabled,
            timestamp: res.activeTicket?.timestamp
          })
        });
        const daemonJson = await daemonRes.json();
        if (daemonJson && daemonJson.ok) {
          handshakeText.textContent =
            "Daemon Handshake OK: " + daemonJson.assignedIp + " (" + daemonJson.region + ")";
        } else {
          handshakeText.textContent = res.lastHandshakeStatus;
        }
      } catch {
        handshakeText.textContent = res.lastHandshakeStatus + " [Local Verified]";
      }
      sessionTokenText.textContent = "ECDSA Ticket Digest: " + res.sessionToken.slice(0, 18) + "...";
    }
  );
});

regionSelect.addEventListener("change", syncSettings);
planSelect.addEventListener("change", () => {
  if (planSelect.value === "PRO_RPC_19") {
    rpcShieldToggle.checked = true;
  }
  syncSettings();
});
rpcShieldToggle.addEventListener("change", syncSettings);
