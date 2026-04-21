# IntentionalTube

IntentionalTube is a Chrome extension that reduces YouTube distractions and helps you stay focused with intentional viewing, focus timers, and lightweight progress tracking.

## Project Website

This repository now includes a public landing page at:

- `site/index.html`

It is designed so users can:

- Discover what IntentionalTube does
- Download the latest version
- Follow quick install steps for Chrome or Edge

The download button automatically prefers the latest GitHub Release asset (if published), and falls back to the latest `main` branch zip.

## Automatic Zip Releases

This repository includes an automated release workflow at:

- `.github/workflows/release-extension.yml`

How it works:

1. On every push to `main` (excluding website-only changes), GitHub Actions builds a zip package of the extension.
2. It automatically increments the patch version in `manifest.json` (for example, `1.1.0` to `1.1.1`) and commits that change.
3. It creates or updates a GitHub Release tagged from that new version (for example, `v1.1.1`).
4. It uploads `IntentionalTube-v<version>.zip` as a release asset.

This means your website download button can automatically serve the latest packaged extension release.

## Host The Website (GitHub Pages)

A GitHub Actions workflow is included at:

- `.github/workflows/deploy-pages.yml`

To enable hosting:

1. Open your GitHub repository settings.
2. Go to **Pages**.
3. Under **Build and deployment**, set source to **Deploy from a branch**.
4. Select branch **`gh-pages`** and folder **`/ (root)`**.
5. Push to `main` (or manually run the workflow).

If deployment fails due token permissions, also check:

1. Repository **Settings > Actions > General**.
2. Under **Workflow permissions**, choose **Read and write permissions**.

After deployment, your site will be available at a GitHub Pages URL for this repository.

## What It Does

- Blocks common distraction surfaces on YouTube.
- Prompts you to set an intention before watching a video.
- Shows your active intention on-screen while watching.
- Includes a focus timer (Pomodoro-style) with optional auto-blocking.
- Tracks weekly focus efficiency based on on-task vs off-task time.

## Features

### Blocking Controls

You can toggle each control from the popup:

- Master blocking
- Hide home recommendations
- Hide related sidebar suggestions
- Hide comments, notifications, and live chat
- Blur thumbnails
- Hide end-screen video wall
- Force autoplay off
- Auto-pause video when switching tabs

### Intention Gate

- On YouTube watch pages, IntentionalTube can require a written intention before unlocking the video.
- Your current intention appears in a small ambient banner while watching.

### Focus Timer

- Start/stop a focus timer from the popup.
- Optional setting: automatically enable master blocking when a timer starts.
- Floating on-page timer appears on watch pages and can be dragged to reposition.
- Timer auto-pauses when you leave the tracked tab/window and resumes when you return.

### Weekly Focus Efficiency

The popup shows:

- Weekly efficiency percentage
- Daily chart for the last 7 days
- On-task/off-task minutes summary

## Install (Developer Mode)

### Google Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this project folder:
   - `youtube disctraction blocking extension`
5. Pin **IntentionalTube** from the Extensions menu.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Pin **IntentionalTube** from the Extensions menu.

## How To Use

1. Open YouTube.
2. Click the IntentionalTube extension icon.
3. Keep **Master blocking** on.
4. Turn on/off specific controls based on your study style.
5. In **Intention**, enter a concrete goal and click **Set Intention**.
6. In **Focus Timer**, choose minutes and click **Start**.
7. While watching, stay aligned with your intention banner and timer.
8. Check **Weekly Focus Efficiency** in the popup to review consistency.

## Notes

- Works on both `youtube.com` and `m.youtube.com` pages listed in the manifest.
- Your settings and analytics are stored locally via Chrome extension storage.
- No backend server is required.

## Project Structure

- `manifest.json`: Extension manifest (MV3)
- `background.js`: Service worker, settings, pomodoro, analytics
- `content.js`: YouTube page behavior and UI overlays
- `popup.html`: Popup UI layout
- `popup.css`: Popup styles
- `popup.js`: Popup logic and controls

## License

No license file is currently included. Add one if you plan to distribute publicly.
