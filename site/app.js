const owner = "zawad1804";
const repo = "IntentionalTube";
const fallbackVersion = "1.1.0";

const releaseBadge = document.getElementById("release-badge");
const versionBadge = document.getElementById("version-badge");
const downloadLink = document.getElementById("download-latest");

const fallbackZip = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;

downloadLink.href = fallbackZip;

async function readVersionFrom(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("version endpoint unavailable");
  }
  const manifest = await res.json();
  return manifest.version;
}

async function loadVersion() {
  const sources = [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/manifest.json`,
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/manifest.json`
  ];

  for (const source of sources) {
    try {
      const version = await readVersionFrom(source);
      if (version) {
        versionBadge.textContent = `Version: ${version}`;
        return;
      }
    } catch (_error) {
      // Try the next source.
    }
  }

  versionBadge.textContent = `Version: ${fallbackVersion}`;
}

async function loadReleaseInfo() {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!res.ok) {
    releaseBadge.textContent = "Release: latest from main";
    downloadLink.href = fallbackZip;
    return;
  }

  const release = await res.json();
  const assetZip = (release.assets || []).find((asset) => asset.name.toLowerCase().endsWith(".zip"));
  const target = assetZip ? assetZip.browser_download_url : release.zipball_url;

  downloadLink.href = target || fallbackZip;
  releaseBadge.textContent = `Release: ${release.tag_name || "latest"}`;
}

async function init() {
  await Promise.all([loadVersion(), loadReleaseInfo()]);
}

init();
