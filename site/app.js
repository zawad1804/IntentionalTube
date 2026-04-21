const fallbackVersion = "1.1.0";
const fallbackTag = `v${fallbackVersion}`;

const releaseBadge = document.getElementById("release-badge");
const versionBadge = document.getElementById("version-badge");
const downloadLink = document.getElementById("download-latest");

const fallbackZip = "./downloads/IntentionalTube-latest.zip";

downloadLink.href = fallbackZip;

async function loadLocalVersionMetadata() {
  const res = await fetch("./version.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("version metadata unavailable");
  }

  const data = await res.json();
  const version = data.version || fallbackVersion;
  const tag = data.tag || `v${version}`;

  versionBadge.textContent = `Version: ${version}`;
  releaseBadge.textContent = `Release: ${tag}`;
  downloadLink.href = fallbackZip;
}

function applyFallbackMetadata() {
  versionBadge.textContent = `Version: ${fallbackVersion}`;
  releaseBadge.textContent = `Release: ${fallbackTag}`;
  downloadLink.href = fallbackZip;
}

async function init() {
  try {
    await loadLocalVersionMetadata();
  } catch (_error) {
    applyFallbackMetadata();
  }
}

init();
