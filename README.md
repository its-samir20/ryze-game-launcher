# 🎮 RYZE Game Launcher

> A modern Windows desktop game launcher for quest enthusiasts.

RYZE Game Launcher is a lightweight Windows app built with **Electron**. It browses the public game database, builds your personal game library, tracks recently played games, and shows your active game as your **Discord rich presence** status.

[![Release](https://img.shields.io/github/v/release/its-samir20/ryze-game-launcher?color=%236633ff&label=Latest%20Release)](https://github.com/its-samir20/ryze-game-launcher/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/its-samir20/ryze-game-launcher/total?color=%236633ff)](https://github.com/its-samir20/ryze-game-launcher/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-6633ff)](https://github.com/its-samir20/ryze-game-launcher/releases/latest)

---

## ⚡ Features

- **Game Store** – browse and search a large public game database with category filters and popular aliases
- **My Library** – add games to your personal library, mark favorites, and keep track of what you play
- **Rich Presence** – launch a game with one click and show **"Playing"** status on Discord
- **Recently Played** – automatically tracked on the home screen
- **Desktop Shortcuts** – create a shortcut for any game in one click
- **Auto-Update** – in-app update notifications, one-click download with progress bar, and **Install & Restart**
- **What's New** – see point-by-point release notes after every update
- **Customizable** – dark blue / black / light themes, startup options, system tray behavior, and zoom controls
- **System Tray** – runs quietly in the tray; closing the window keeps the launcher running

## 📥 Installation

1. Go to the [latest release](https://github.com/its-samir20/ryze-game-launcher/releases/latest)
2. Download `RYZE-Game-Launcher-Setup-*.exe`
3. Run the installer (Windows SmartScreen may ask you to confirm – this is normal for unsigned apps)
4. The installer automatically installs the required **Microsoft Visual C++ Redistributable** if it's missing
5. Launch **RYZE Game Launcher** from your desktop or Start Menu

> The app is updated automatically – when a new version is released, you'll get an in-app notification and can install it with one click.

## 🔄 How Updating Works

1. A popup appears when a new update is available
2. Click the popup → **Download Update** (shows live progress)
3. Click **Install & Restart** – the app closes, the installer runs, and the updated version reopens automatically

## 🛠️ Tech Stack

- **Electron** – desktop runtime
- **electron-updater** – automatic updates via GitHub Releases
- **Vanilla JS + CSS** – fast, lightweight UI

## 📦 Release Assets

Each release ships with:

| File | Purpose |
|------|---------|
| `RYZE-Game-Launcher-Setup-*.exe` | Installer (used for manual installs) |
| `*.exe.blockmap` | Differential update blockmap |
| `latest.yml` | Auto-update metadata for `electron-updater` |

## 🧑‍💻 Developer

Built by [AL Jame Samir](https://github.com/its-samir20) – experimental, non-profit software.

## ⚖️ License

This is an independent, non-commercial project. RYZE Game Launcher is **not affiliated with**, endorsed by, or sponsored by any game platform.
