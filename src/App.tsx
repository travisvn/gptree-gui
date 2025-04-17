import React, { useState, useEffect, createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
// import "./styles.css";
import DirectoryTree from "./components/DirectoryTree";
import ConfigPanel from "./components/ConfigPanel";
import OutputPanel from "./components/OutputPanel";
import { app } from '@tauri-apps/api';
import GptreeLogo from './assets/gptree_logo.svg?react';

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

interface AppError {
  message: string;
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

  // New state for config override
  const [globalConfig, setGlobalConfig] = useState<Config | null>(null);
  const [localConfig, setLocalConfig] = useState<Config | null>(null);
  const [configMode, setConfigMode] = useState<'global' | 'local'>('global');

  const [pendingClipboardCopy, setPendingClipboardCopy] = useState(false);

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

  // Helper to fetch both configs and set state
  const fetchConfigs = async (dir: string) => {
    try {
      const result = await invoke<{ success: boolean; data?: any; error?: string }>("get_configs", { path: dir });
      if (result.success && result.data) {
        setGlobalConfig(result.data.global || null);
        setLocalConfig(result.data.local || null);
        // Default to global config
        setConfigMode('global');
        setConfig(result.data.global || null);
      }
    } catch (err) {
      setError(`Error loading configs: ${err}`);
    }
  };

  // Modified loadDirectory to fetch both configs
  const loadDirectory = async (path: string) => {
    try {
      setLoading(true);
      setError(null);

      // First, load the directory tree structure
      const treeResult = await invoke<{ success: boolean; data?: DirectoryItem; error?: string }>(
        "load_directory",
        { path }
      );

      if (treeResult.success && treeResult.data) {
        setDirectoryTree(treeResult.data);
        // Only after successfully loading the tree, fetch the configs
        await fetchConfigs(path);
      } else if (treeResult.error) {
        setError(treeResult.error);
        setDirectoryTree(null); // Clear tree on error
        setGlobalConfig(null);
        setLocalConfig(null);
        setConfig(null);
      }
    } catch (err) {
      setError(`Error loading directory: ${err}`);
      setDirectoryTree(null); // Clear tree on error
      setGlobalConfig(null);
      setLocalConfig(null);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  // Update configuration
  const updateConfig = async (newConfig: Config) => {
    try {
      setLoading(true);

      const result = await invoke<{ success: boolean; error?: string | AppError }>(
        "update_config",
        { config: newConfig }
      );

      if (result.success) {
        setConfig(newConfig);
        // Also update the correct config in state
        if (configMode === 'local') {
          setLocalConfig(newConfig);
        } else {
          setGlobalConfig(newConfig);
        }
      } else if (result.error) {
        // AppError object might be serialized as a string, or could be just a string
        const errorMsg = typeof result.error === 'object' && result.error !== null ? JSON.stringify(result.error) : result.error;
        setError(errorMsg);
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
        if (config?.copy_to_clipboard) {
          setPendingClipboardCopy(true);
        }
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

  // Switch config mode (global/local)
  const handleConfigModeSwitch = async (mode: 'global' | 'local') => {
    try {
      setLoading(true);
      await invoke("set_config_mode", { mode: mode === 'local' ? 'local' : 'global' });
      setConfigMode(mode);
      // Set config to the selected one
      setConfig(mode === 'local' ? localConfig : globalConfig);
    } catch (err) {
      setError(`Error switching config mode: ${err}`);
    } finally {
      setLoading(false);
    }
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

  // Effect: perform clipboard copy after output is set
  useEffect(() => {
    if (pendingClipboardCopy && output) {
      handleCopyToClipboard();
      setPendingClipboardCopy(false);
    }
  }, [output, pendingClipboardCopy]);

  return (
    <div className="h-screen flex flex-col max-w-[100vw] mr-0 min-h-full">
      <header className="app-header flex-shrink-0">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
          <GptreeLogo className="h-9 w-auto text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-2xl font-bold" style={{ margin: 0 }}>GPTree</h1>
        </div>
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
        <div className={`error-message ${error === "Copied to clipboard!" ? "success" : ""} absolute top-0 left-0 w-full z-50`}>
          {error}
        </div>
      )}

      <div className="flex flex-row gap-2 m-2 pr-4 flex-grow overflow-hidden">
        {directoryTree && (
          <div className="flex flex-col p-2 directory-panel overflow-hidden">
            <h2 className=" text-2xl font-bold flex-shrink-0">Project Files</h2>
            <div className="flex flex-col gap-2 overflow-y-auto flex-grow">
              <DirectoryTree
                tree={directoryTree}
                onFileSelection={handleFileSelection}
                selectedFiles={selectedFiles}
              />
            </div>
            <div className="file-actions max-h-min flex-shrink-0">
              <span>{selectedFiles?.length} files selected</span>
              {localConfig && localConfig.previous_files && localConfig.previous_files.length > 0 && (
                <button
                  onClick={() => {
                    // Convert relative paths to absolute paths
                    const absolutePaths = localConfig.previous_files.map(
                      file => `${currentDirectory}/${file}`
                    );
                    setSelectedFiles(absolutePaths);
                  }}
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

        <div className="side-panel flex flex-col gap-2 overflow-hidden">
          {/* Config mode toggle UI */}
          {localConfig && (
            <div className="config-mode-toggle flex-shrink-0" style={{ marginBottom: 8 }}>
              <button
                onClick={() => handleConfigModeSwitch(configMode === 'global' ? 'local' : 'global')}
                disabled={loading}
                style={{ padding: '0.3em 1em', borderRadius: 6, border: '1px solid var(--border-color)', background: configMode === 'local' ? 'var(--primary-bg)' : 'var(--background)', color: configMode === 'local' ? 'var(--primary-text)' : 'var(--text-color)', fontWeight: 600 }}
              >
                {configMode === 'global' ? 'Use Local Config for this Project' : 'Use Global Config'}
              </button>
              <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-color)' }}>
                <strong>Active config:</strong> {configMode === 'local' ? 'Local' : 'Global'}
              </span>
            </div>
          )}

          {config && (
            <ConfigPanel
              config={config}
              onConfigUpdate={async (newConfig) => {
                if (!currentDirectory || !directoryTree) {
                  setError("Please select a directory before changing configuration.");
                  return;
                }
                await updateConfig(newConfig);
              }}
              disabled={loading || !currentDirectory}
            />
          )}

          {output && config && (
            <OutputPanel
              output={output}
              onCopyToClipboard={handleCopyToClipboard}
              onOpenFile={handleOpenOutputFile}
              disabled={loading}
              outputFileLocally={config.output_file_locally}
              outputFileName={config.output_file}
              className="flex-grow flex flex-col"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppWithThemeProvider() {
  return <ThemeProvider><App /></ThemeProvider>;
}
