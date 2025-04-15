import React, { useState, useEffect, createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
// import "./styles.css";
import DirectoryTree from "./components/DirectoryTree";
import ConfigPanel from "./components/ConfigPanel";
import OutputPanel from "./components/OutputPanel";
import { app } from '@tauri-apps/api';

// Types
interface DirectoryItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_selected: boolean;
  children: DirectoryItem[];
}

interface Config {
  version: number;
  use_git_ignore: boolean;
  include_file_types: string;
  exclude_file_types: string[];
  output_file: string;
  output_file_locally: boolean;
  copy_to_clipboard: boolean;
  safe_mode: boolean;
  store_files_chosen: boolean;
  line_numbers: boolean;
  show_ignored_in_tree: boolean;
  show_default_ignored_in_tree: boolean;
  previous_files: string[];
}

interface OutputContent {
  combined_content: string;
  selected_files: string[];
  estimated_tokens: number;
}

// Theme context and provider
const ThemeContext = createContext({ theme: "light", toggleTheme: () => { } });

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const getInitialTheme = () => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return "dark";
    }
    return "light";
  };
  const [theme, setTheme] = useState<string>(getInitialTheme());
  useEffect(() => {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

function useTheme() {
  return useContext(ThemeContext);
}

function App() {
  const [currentDirectory, setCurrentDirectory] = useState<string>("");
  const [directoryTree, setDirectoryTree] = useState<DirectoryItem | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [output, setOutput] = useState<OutputContent | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Check for last used directory
  const checkLastDirectory = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await invoke<{ success: boolean; data?: string | null; error?: string }>(
        "get_last_directory"
      );

      if (result.success && result.data) {
        const path = result.data;
        setCurrentDirectory(path);
        await loadDirectory(path);
        return true; // Successfully loaded
      } else if (result.error) {
        console.error("Error loading last directory:", result.error);
      }
      return false; // No last directory or failed to load
    } catch (err) {
      console.error("Error checking last directory:", err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Select a directory
  const handleSelectDirectory = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await invoke<{ success: boolean; data?: string; error?: string }>("select_directory");

      if (result.success && result.data) {
        setCurrentDirectory(result.data);
        await loadDirectory(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(`Error selecting directory: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Load directory structure
  const loadDirectory = async (path: string) => {
    try {
      setLoading(true);
      setError(null);

      const result = await invoke<{ success: boolean; data?: DirectoryItem; error?: string }>(
        "load_directory",
        { path }
      );

      if (result.success && result.data) {
        setDirectoryTree(result.data);

        // Also load config
        await loadConfig();
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(`Error loading directory: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Load configuration
  const loadConfig = async () => {
    try {
      const result = await invoke<{ success: boolean; data?: Config; error?: string }>("get_config");

      if (result.success && result.data) {
        setConfig(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(`Error loading configuration: ${err}`);
    }
  };

  // Update configuration
  const updateConfig = async (newConfig: Config) => {
    try {
      setLoading(true);

      const result = await invoke<{ success: boolean; error?: string }>(
        "update_config",
        { config: newConfig }
      );

      if (result.success) {
        setConfig(newConfig);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(`Error updating configuration: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Update selected files from tree
  const handleFileSelection = (files: string[]) => {
    setSelectedFiles(files);
  };

  // Generate output
  const handleGenerateOutput = async () => {
    if (!selectedFiles.length) {
      setError("No files selected");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await invoke<{ success: boolean; data?: OutputContent; error?: string }>(
        "generate_output",
        { selectedFiles }
      );

      if (result.success && result.data) {
        setOutput(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(`Error generating output: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Copy output to clipboard
  const handleCopyToClipboard = async () => {
    if (!output) return;

    try {
      setLoading(true);

      await invoke("copy_to_clipboard", { content: output.combined_content });

      // Show a temporary success message
      setError("Copied to clipboard!");
      setTimeout(() => setError(null), 2000);
    } catch (err) {
      setError(`Error copying to clipboard: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Open output file
  const handleOpenOutputFile = async () => {
    if (!config) return;

    const outputPath = config.output_file_locally
      ? config.output_file
      : `${currentDirectory}/${config.output_file}`;

    try {
      await invoke("open_output_file", { app: app, path: outputPath });
    } catch (err) {
      setError(`Error opening file: ${err}`);
    }
  };

  // Use previous files
  const handleUsePreviousFiles = () => {
    if (!config || !config.previous_files.length) {
      setError("No previous files found");
      return;
    }

    // Convert relative paths to absolute paths
    const absolutePaths = config.previous_files.map(
      file => `${currentDirectory}/${file}`
    );

    setSelectedFiles(absolutePaths);
  };

  // When app loads, check for last directory
  useEffect(() => {
    const init = async () => {
      // Try to load the last directory first
      const lastDirLoaded = await checkLastDirectory();

      // If no last directory or failed to load, ask for new one
      if (!lastDirLoaded && !currentDirectory) {
        // handleSelectDirectory();
        setCurrentDirectory('/Users/travis/Dev/2025/python/auto-job-hunting/auto-job-1');
        await loadDirectory('/Users/travis/Dev/2025/python/auto-job-hunting/auto-job-1');
      }
    };

    init();
  }, []);

  return (
    <div className=" max-h-[100vh] flex flex-col max-w-[100vw] mr-0 min-h-full">
      <header className="app-header">
        <h1 className="text-2xl font-bold">GPTree</h1>
        <div className="header-controls">
          <button onClick={toggleTheme} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`} style={{ fontSize: "1.3em", background: "none", border: "none", marginRight: "0.5em" }}>
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <button
            onClick={handleSelectDirectory}
            disabled={loading}
          >
            Select Directory
          </button>
          {currentDirectory && (
            <span className="current-dir">
              <strong>Current:</strong> {currentDirectory}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className={`error-message ${error === "Copied to clipboard!" ? "success" : ""}`}>
          {error}
        </div>
      )}

      <div className="flex flex-row gap-2 m-2 pr-4  flex-grow">
        {directoryTree && (
          <div className="overflow-y-auto max-h-full max-w-full p-2 min-h-full directory-panel ">
            <h2 className=" text-2xl font-bold">Project Files</h2>
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-15rem)] flex-grow h-full">
              <DirectoryTree
                tree={directoryTree}
                onFileSelection={handleFileSelection}
                selectedFiles={selectedFiles}
              />
            </div>
            <div className="file-actions max-h-min">
              <span>{selectedFiles?.length} files selected</span>
              {config && config?.previous_files?.length > 0 && (
                <button
                  onClick={handleUsePreviousFiles}
                  disabled={loading}
                >
                  Use Previous Selection
                </button>
              )}
              <button
                onClick={handleGenerateOutput}
                disabled={loading || selectedFiles.length === 0}
                className="primary-button"
              >
                Generate Output
              </button>
            </div>
          </div>
        )}

        <div className="side-panel flex flex-col gap-2">
          {config && (
            <ConfigPanel
              config={config}
              onConfigUpdate={updateConfig}
              disabled={loading}
            />
          )}

          {output && (
            <OutputPanel
              output={output}
              onCopyToClipboard={handleCopyToClipboard}
              onOpenFile={handleOpenOutputFile}
              disabled={loading}
            />
          )}
        </div>
      </div>

      <div className="flex-shrink bg-red-300"></div>
    </div>
  );
}

export default function AppWithThemeProvider() {
  return <ThemeProvider><App /></ThemeProvider>;
}
