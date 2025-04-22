# GPTree (GUI) 🌳

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

_(Leverages the core logic and features of the [gptree CLI tool](https://github.com/travisvn/gptree))_

## Screenshot

_(Suggestion: Add a screenshot of the application here)_

```
![GPTree GUI Screenshot](<link_to_your_screenshot.png>)
```

## Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites) for your specific operating system.

## Development Setup

1.  **Clone the repository:**
    ```bash
    git clone <your_repository_url>
    cd gptree-gui-2
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run in development mode:**
    ```bash
    npm run tauri dev
    ```
    This will open the application window with hot-reloading enabled for the frontend.

## Building the Application

1.  **Build the application:**
    ```bash
    npm run tauri build
    ```
2.  **Build specific bundles (e.g., macOS .app):**
    ```bash
    npm run tauri build -- --bundles app
    ```
    The built application(s) will be located in `src-tauri/target/release/bundle/`.

_(Note: A `.env` file might be needed for signing on macOS during the build process for distribution, but is not necessary for local builds or contributions.)_

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

## Contributing

Contributions are welcome! Please fork the repository and create a pull request for any improvements or bug fixes.

## Credits / Acknowledgements

- Based on the original [`gptree` CLI tool](https://github.com/travisvn/gptree).
- File and folder icons implemented using logic and assets from [material-extensions/vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) ✨

## License

_(Assuming GPL-3.0 like the CLI tool. Please update if incorrect)_
This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [LICENSE.txt](License.txt) file for details (if it exists in the repo root) or refer to the [GPL-3.0 License terms](https://www.gnu.org/licenses/gpl-3.0.en.html).
