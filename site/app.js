const owner = "zawad1804";
const repo = "IntentionalTube";
const fallbackVersion = "1.1.0";
const fallbackTag = `v${fallbackVersion}`;

const releaseBadge = document.getElementById("release-badge");
const versionBadge = document.getElementById("version-badge");
const downloadLink = document.getElementById("download-latest");

const fallbackZip = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;
const releaseAssetUrl = (tag) => `https://github.com/${owner}/${repo}/releases/download/${tag}/IntentionalTube-${tag}.zip`;

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
  downloadLink.href = releaseAssetUrl(tag);
}

function applyFallbackMetadata() {
  versionBadge.textContent = `Version: ${fallbackVersion}`;
  releaseBadge.textContent = `Release: ${fallbackTag}`;
  downloadLink.href = fallbackZip;
}

async function enhanceFromGitHubReleaseApi() {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!res.ok) {
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
    await loadLocalVersionMetadata();
  } catch (_error) {
    applyFallbackMetadata();
  }

  try {
    await enhanceFromGitHubReleaseApi();
  } catch (_error) {
    // Keep local metadata based state when API is unavailable.
  }
}

init();
