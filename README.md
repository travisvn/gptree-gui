# GPTree (GUI) 🌳

![Memory Usage](https://img.shields.io/badge/RAM~100MB-lightweight-brightgreen)
![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri_v2-blue)
![Rust Backend](https://img.shields.io/badge/Backend-Rust-orange)

This is a desktop GUI application for the [`gptree`](https://github.com/travisvn/gptree) command-line tool, built using Tauri, React, and TypeScript. It provides a user-friendly interface to select files from your project, configure options, and generate a combined text output suitable for providing context to Large Language Models (LLMs).

## Features

- **Visual Directory Tree**: Navigate your project structure easily and see which files will be included/excluded.
- **Interactive File Selection**: Select or deselect individual files or entire directories with checkboxes.
- **Configuration Management**:
  - Load and manage both global (`~/.gptreerc`) and project-specific (`.gptree_config`) configuration files.
  - Switch between using global or local configurations.
  - Edit configuration options directly within the GUI (e.g., include/exclude file types, output settings).
  - Save changes back to the respective configuration files.
- **Output Generation**: Generate the combined text output based on selected files and configuration.
- **Output Panel**:
  - View the generated directory tree and combined file content.
  - Copy the output to the clipboard with a single click.
  - Optionally save the output to a file.
  - Open the saved output file directly from the application.
- **Smart File Handling**: Respects `.gitignore` rules and default ignores (like `.git`, `__pycache__`).
- **Settings**: Configure application-level preferences (e.g., theme, default directory behavior).
- **Dark/Light Mode**: Adapts to your system theme or allows manual switching.
- **Ultra Lightweight:** GPTree GUI uses just ~100 MB of RAM total — including UI, media, and networking processes.
  - That’s **5x leaner than comparable Electron apps**, thanks to Tauri v2 and a native Rust backend.

_(Leverages the core logic and features of the [gptree CLI tool](https://github.com/travisvn/gptree))_

## Install

### 🍎 macOS

- [Download GPTree for macOS (.dmg) - Universal](https://github.com/travisvn/gptree-gui/releases/download/latest/GPTree-mac-universal.dmg)
  - _Universal (M1 and Intel) (arm64 and x86)_

### 🐧 Linux

```bash
curl -fsSL https://raw.githubusercontent.com/travisvn/gptree-gui/main/scripts/install.sh | sh
```

### 🪟 Windows

- [Download GPTree for Windows (.exe)](https://github.com/travisvn/gptree-gui/releases/download/latest/GPTree-windows.exe)
- [Download GPTree for Windows (.msi)](https://github.com/travisvn/gptree-gui/releases/download/latest/GPTree-windows.msi)

## Screenshot

![GPTree GUI Screenshot](https://0jg2h4r6p4.ufs.sh/f/ujtLcEbQI4O722QecZymQ4klBRw6yDvsdb5gXrK10Np8VcJZ)

## Usage

1.  Launch the application.
2.  Click **"Select Directory"** to choose the root folder of the project you want to analyze.
3.  The file tree will populate. Use the checkboxes to select the files you want to include in the output.
4.  Use the **Config Panel** (right side) to adjust settings:
    - Switch between **Global** and **Local** configuration scopes if needed.
    - Modify settings like included/excluded file types, whether to use `.gitignore`, etc.
    - Click **"Save Config"** to persist changes to the corresponding config file (`~/.gptreerc` or `.gptree_config`).
5.  Once files are selected and configuration is set, click **"Generate Output"**.
6.  The **Output Panel** will display the results.
7.  Use the buttons in the Output Panel to **"Copy to Clipboard"** or **"Open Output File"** (if saving is enabled in the config).

## Configuration

The GUI interacts with the same configuration files used by the `gptree` CLI:

- **Global Config**: `~/.gptreerc` - User-level default settings.
- **Local Config**: `.gptree_config` - Project-specific overrides located in the project's root directory.

Settings are applied with the following precedence (highest to lowest):

1.  Settings modified directly in the GUI (until saved).
2.  Local Config (`.gptree_config`).
3.  Global Config (`~/.gptreerc`).
4.  Programmed Defaults.

## Technology Stack

- **Framework**: [Tauri](https://tauri.app/) (Rust backend, Webview frontend)
- **Frontend**: [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend**: [Rust](https://www.rust-lang.org/)
- **State Management**: [Jotai](https://jotai.org/)
- **Core Logic**: Leverages libraries from the original `gptree` CLI.

## Performance Snapshot

| Metric                | GPTree GUI (Tauri v2 + Rust) | Typical Electron App |
| --------------------- | ---------------------------- | -------------------- |
| Total RAM Usage       | ~**100 MB**                  | 300–600+ MB          |
| Backend Language      | Rust                         | JavaScript / Node.js |
| Renderer              | System WebView               | Bundled Chromium     |
| Cold Start Time       | Fast                         | Slower               |
| Bundle Size (approx.) | Small (~3–10 MB)             | Large (100MB+)       |

> **Result:** GPTree is over **5× more memory-efficient** than Electron-based apps with similar functionality.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request for any improvements or bug fixes.

## Credits / Acknowledgements

- Based on the original [`gptree` CLI tool](https://github.com/travisvn/gptree).
- File and folder icons implemented using logic and assets from [material-extensions/vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) ✨
