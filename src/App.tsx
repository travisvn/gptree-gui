import React, { useState, useEffect, createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
// import "./styles.css";
import DirectoryTree from "./components/DirectoryTree";
import ConfigPanel from "./components/ConfigPanel";
import OutputPanel from "./components/OutputPanel";
import { app } from '@tauri-apps/api';
import GptreeLogo from './assets/gptree_logo.svg?react';
import { Tooltip } from 'react-tooltip';
import { Moon, Sun } from '@phosphor-icons/react';
import { cn } from './lib/utils';

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

const DEFAULT_DIRECTORY = '/Users/travis/Dev/2025/python/auto-job-hunting/auto-job-1';

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
    // document.documentElement.classList.remove("theme-light", "theme-dark");
    // document.documentElement.classList.add(`theme-${theme}`);
    // document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
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
  const [transientSuccess, setTransientSuccess] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  // New state for config override
  const [globalConfig, setGlobalConfig] = useState<Config | null>(null);
  const [localConfig, setLocalConfig] = useState<Config | null>(null);
  const [configMode, setConfigMode] = useState<'global' | 'local'>('global');

  const [pendingClipboardCopy, setPendingClipboardCopy] = useState(false);

  // Clear error/success messages
  const clearMessages = () => {
    setError(null);
    setTransientSuccess(null);
  };

  // Check for last used directory
  const checkLastDirectory = async () => {
    try {
      setLoading(true);
      clearMessages();

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
        setError(`Failed to load last directory: ${result.error}`);
      }
      return false; // No last directory or failed to load
    } catch (err) {
      console.error("Error checking last directory:", err);
      setError(`Error checking last directory: ${err}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Select a directory
  const handleSelectDirectory = async () => {
    try {
      setLoading(true);
      clearMessages();

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
        // Default to global config or local if global doesn't exist
        const initialMode = result.data.global ? 'global' : 'local';
        setConfigMode(initialMode);
        setConfig(initialMode === 'global' ? result.data.global : result.data.local);
      } else if (result.error) {
        setError(`Error loading configs: ${result.error}`);
        setGlobalConfig(null);
        setLocalConfig(null);
        setConfig(null);
      }
    } catch (err) {
      setError(`Error loading configs: ${err}`);
      setGlobalConfig(null);
      setLocalConfig(null);
      setConfig(null);
    }
  };

  // Modified loadDirectory to fetch both configs
  const loadDirectory = async (path: string) => {
    try {
      setLoading(true);
      clearMessages();

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
      clearMessages();

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
        setError(`Error updating config: ${errorMsg}`);
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
    clearMessages(); // Clear messages when selection changes
  };

  // Generate output
  const handleGenerateOutput = async () => {
    if (!selectedFiles.length) {
      setError("No files selected to generate output.");
      setTimeout(clearMessages, 3000);
      return;
    }

    try {
      setLoading(true);
      clearMessages();

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
      setTransientSuccess("Copied to clipboard!");
      setTimeout(clearMessages, 2000);
    } catch (err) {
      setError(`Error copying to clipboard: ${err}`);
      setTimeout(clearMessages, 3000);
    } finally {
      setLoading(false);
    }
  };

  // Open output file
  const handleOpenOutputFile = async () => {
    if (!config) return;
    clearMessages();

    const outputPath = config.output_file_locally
      ? config.output_file
      : `${currentDirectory}/${config.output_file}`;

    try {
      await invoke("open_output_file", { path: outputPath });
    } catch (err) {
      setError(`Error opening file '${outputPath}': ${err}`);
      setTimeout(clearMessages, 3000);
    }
  };

  // Switch config mode (global/local)
  const handleConfigModeSwitch = async (mode: 'global' | 'local') => {
    try {
      setLoading(true);
      clearMessages();
      await invoke("set_config_mode", { mode: mode === 'local' ? 'local' : 'global' });
      setConfigMode(mode);
      // Set config to the selected one, fall back if one is null
      const newActiveConfig = mode === 'local' ? (localConfig || globalConfig) : (globalConfig || localConfig);
      setConfig(newActiveConfig);
      if (!newActiveConfig) {
        setError("Selected config type is not available.");
        setTimeout(clearMessages, 3000);
      }
    } catch (err) {
      setError(`Error switching config mode: ${err}`);
      setTimeout(clearMessages, 3000);
    } finally {
      setLoading(false);
    }
  };

  // When app loads, check for last directory
  useEffect(() => {
    const init = async () => {
      const lastDirLoaded = await checkLastDirectory();
      // Only prompt if no last directory AND no current directory set
      if (!lastDirLoaded && !currentDirectory) {
        // Option 1: Prompt user immediately (can be intrusive)
        // handleSelectDirectory();
        setCurrentDirectory(DEFAULT_DIRECTORY);
        await loadDirectory(DEFAULT_DIRECTORY);

        // Option 2: Show a message or placeholder state indicating no directory selected
        console.log("No last directory found, waiting for user selection.");
        // Optionally set a state here to show a "Select a Directory" message centrally
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Effect: perform clipboard copy after output is set
  useEffect(() => {
    if (pendingClipboardCopy && output) {
      handleCopyToClipboard();
      setPendingClipboardCopy(false);
    }
  }, [output, pendingClipboardCopy]);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-[--background] text-[--text-color]">
      <header className="flex items-center justify-between flex-shrink-0 px-4 py-2 shadow-md bg-[--header-bg] text-[--header-text]">
        <div className="flex items-center gap-3">
          <GptreeLogo className="h-8 w-auto" />
          <h1 className="text-xl font-bold m-0">GPTree</h1>
        </div>

        {currentDirectory && (
          <div className="flex-1 text-center text-sm truncate px-4"
            data-tooltip-id="app-tooltip"
            data-tooltip-content={currentDirectory}>
            <span className="font-medium mr-1">Current:</span> {currentDirectory}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10"
          >
            {theme === "light" ? <Moon weight="fill" /> : <Sun weight="fill" />}
          </button>
          <button
            onClick={handleSelectDirectory}
            disabled={loading}
            className="text-sm px-3 py-1.5"
          >
            Select Directory
          </button>
        </div>
      </header>

      <div className="relative h-8">
        {(error || transientSuccess) && (
          <div className={`error-message ${transientSuccess ? "success" : ""}`}>
            {error || transientSuccess}
          </div>
        )}
      </div>

      {loading && <div className="absolute inset-0 bg-black/20 z-40 flex items-center justify-center"><p className="text-white text-lg">Loading...</p></div>}

      <div className="flex flex-row flex-grow gap-4 p-4 overflow-hidden">
        {directoryTree ? (
          <div className="flex flex-col p-3 border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] w-1/3 min-w-[300px] max-w-[50vw] overflow-hidden output-panel">
            <h2 className="text-lg font-semibold mb-3 flex-shrink-0">Project Files</h2>
            <div className="flex-grow overflow-hidden mb-3">
              <DirectoryTree
                tree={directoryTree}
                onFileSelection={handleFileSelection}
                selectedFiles={selectedFiles}
              />
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t border-[--border-color] flex-shrink-0">
              <div className="flex justify-between items-center text-sm text-[--light-text]">
                <span>{selectedFiles?.length ?? 0} files selected</span>
                {config && config.store_files_chosen && localConfig && localConfig.previous_files && localConfig.previous_files.length > 0 && (
                  <button
                    onClick={() => {
                      const absolutePaths = localConfig.previous_files.map(
                        file => `${currentDirectory}/${file}`
                      );
                      setSelectedFiles(absolutePaths);
                    }}
                    disabled={loading}
                    className="text-xs px-2 py-1"
                  >
                    Use Previous Selection
                  </button>
                )}
              </div>
              <button
                onClick={handleGenerateOutput}
                disabled={loading || selectedFiles.length === 0}
                className="primary-button w-full"
              >
                Generate Output
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-1/3 text-[--light-text]">
            {!loading && !currentDirectory && <p>Select a directory to begin.</p>}
          </div>
        )}

        <div className="flex flex-col gap-4 w-2/3 overflow-hidden">
          {currentDirectory && (globalConfig || localConfig) && (
            <div className="config-mode-toggle flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => handleConfigModeSwitch(configMode === 'global' ? 'local' : 'global')}
                disabled={loading || (!globalConfig && configMode === 'global') || (!localConfig && configMode === 'local')}
                className={cn(
                  "config-mode-button",
                  configMode === 'local' ? (localConfig ? 'active' : 'inactive') : (globalConfig ? 'active' : 'inactive')
                )}
                title={configMode === 'global' ? 'Switch to Local Project Config' : 'Switch to Global Config'}
              >
                {configMode === 'global' ? (localConfig ? 'Use Local' : 'Local N/A') : (globalConfig ? 'Use Global' : 'Global N/A')} Config
              </button>
              <span className="text-sm text-[--light-text]">
                <strong>Active:</strong> {configMode === 'local' ? 'Local Project' : 'Global'}
                {!config && ' (No config loaded)'}
              </span>
            </div>
          )}

          {config && (
            <ConfigPanel
              config={config}
              onConfigUpdate={async (newConfig) => {
                if (!currentDirectory) {
                  setError("Please select a directory before changing configuration.");
                  setTimeout(clearMessages, 3000);
                  return;
                }
                await updateConfig(newConfig);
              }}
              disabled={loading || !currentDirectory}
              className="flex-shrink-0"
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
              className="flex-grow flex flex-col min-h-0"
            />
          )}

          {!output && config && (
            <div className="flex-grow flex items-center justify-center text-center p-4 output-panel border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] overflow-hidden">
              <p>Select files and click "Generate Output" to see results here.</p>
            </div>
          )}
        </div>
      </div>

      <Tooltip id="app-tooltip" className="react-tooltip" />
    </div>
  );
}

export default function AppWithThemeProvider() {
  return <ThemeProvider><App /></ThemeProvider>;
}
