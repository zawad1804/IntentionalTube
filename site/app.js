const owner = "zawad1804";
const repo = "IntentionalTube";

const releaseBadge = document.getElementById("release-badge");
const versionBadge = document.getElementById("version-badge");
const downloadLink = document.getElementById("download-latest");

const fallbackZip = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;

downloadLink.href = fallbackZip;

async function loadVersion() {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/manifest.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("manifest unavailable");
  }
  const manifest = await res.json();
  versionBadge.textContent = `Version: ${manifest.version || "unknown"}`;
}

async function loadReleaseInfo() {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!res.ok) {
    releaseBadge.textContent = "Release: no published release yet";
    return;
  }

  const release = await res.json();
  const assetZip = (release.assets || []).find((asset) => asset.name.toLowerCase().endsWith(".zip"));
  const target = assetZip ? assetZip.browser_download_url : release.zipball_url;

  downloadLink.href = target || fallbackZip;
  releaseBadge.textContent = `Release: ${release.tag_name || "latest"}`;
}

async function init() {
  try {
    await Promise.all([loadVersion(), loadReleaseInfo()]);
  } catch (_error) {
    if (versionBadge.textContent.includes("loading")) {
      versionBadge.textContent = "Version: unknown";
    }
    if (releaseBadge.textContent.includes("checking")) {
      releaseBadge.textContent = "Release: latest from main branch";
    }
    downloadLink.href = fallbackZip;
  }
}

init();
