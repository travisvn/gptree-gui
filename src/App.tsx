import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import DirectoryTree from "./components/DirectoryTree";
import ConfigPanel from "./components/ConfigPanel";
import OutputPanel from "./components/OutputPanel";
import GptreeLogo from './assets/gptree_logo.svg?react';
import { Tooltip } from 'react-tooltip';
import { Moon, Sun } from '@phosphor-icons/react';
import { cn } from './lib/utils';
import { HEADER_LINK, GITHUB_LINK, VERSION_NAME, DISPLAY_VERSION_RIBBON } from './lib/constants';
import { DirectoryItem, Config, OutputContent, AppError } from './lib/types';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme, ThemeProvider } from './components/ThemeProvider';
import { truncatePathStart } from './lib/utils';
import { useWindowSize } from './hooks/useWindowSize';

const DEFAULT_DIRECTORY = '/Users/travis/Dev/2025/python/auto-job-hunting/auto-job-1';

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

  // State and ref for debounced loading indicator
  const [showLoadingIndicator, setShowLoadingIndicator] = useState<boolean>(false);
  const loadingTimerRef = useRef<number | null>(null); // Use number for browser setTimeout ID
  const LOADING_DELAY = 300; // milliseconds

  // Use the custom hook to get debounced window size
  const { width: windowWidth } = useWindowSize(); // Default debounce is 200ms

  // Clear error/success messages
  const clearMessages = () => {
    setError(null);
    setTransientSuccess(null);
  };

  const sendErrorMessage = (message: string, duration: number = 3000) => {
    setError(message);
    return setTimeout(clearMessages, duration);
  };

  const sendSuccessMessage = (message: string, duration: number = 3000) => {
    setTransientSuccess(message);
    return setTimeout(clearMessages, duration);
  };

  // Debounced loading indicator logic
  const startLoading = () => {
    setLoading(true);
    clearTimeout(loadingTimerRef.current!); // Clear any existing timer
    loadingTimerRef.current = setTimeout(() => {
      setShowLoadingIndicator(true);
    }, LOADING_DELAY);
  };

  const stopLoading = () => {
    clearTimeout(loadingTimerRef.current!);
    setLoading(false);
    setShowLoadingIndicator(false);
  };

  // Check for last used directory
  const checkLastDirectory = async () => {
    try {
      startLoading();
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
      stopLoading();
    }
  };

  // Select a directory
  const handleSelectDirectory = async () => {
    try {
      startLoading();
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
      stopLoading();
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
      startLoading();
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
      stopLoading();
    }
  };

  // Update configuration
  const updateConfig = async (newConfig: Config) => {
    try {
      startLoading();
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
      stopLoading();
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
      sendErrorMessage("No files selected to generate output.");
      return;
    }

    try {
      startLoading();
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
      stopLoading();
    }
  };

  // Copy output to clipboard
  const handleCopyToClipboard = async () => {
    if (!output) return;

    try {
      await invoke("copy_to_clipboard", { content: output.combined_content });
      sendSuccessMessage("Copied to clipboard!");
    } catch (err) {
      sendErrorMessage(`Error copying to clipboard: ${err}`);
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
      sendErrorMessage(`Error opening file '${outputPath}': ${err}`);
    }
  };

  // Switch config mode (global/local)
  const handleConfigModeSwitch = async (mode: 'global' | 'local') => {
    try {
      startLoading();
      clearMessages();
      await invoke("set_config_mode", { mode: mode === 'local' ? 'local' : 'global' });
      setConfigMode(mode);
      // Set config to the selected one, fall back if one is null
      const newActiveConfig = mode === 'local' ? (localConfig || globalConfig) : (globalConfig || localConfig);
      setConfig(newActiveConfig);
      if (!newActiveConfig) {
        sendErrorMessage("Selected config type is not available.");
      }
    } catch (err) {
      sendErrorMessage(`Error switching config mode: ${err}`);
    } finally {
      stopLoading();
    }
  };

  // When app loads, check for last directory
  useEffect(() => {
    const init = async () => {
      const lastDirLoaded = await checkLastDirectory();
      // Only prompt if no last directory AND no current directory set
      if (!lastDirLoaded && !currentDirectory) {

        if (import.meta.env.DEV) {
          console.log("Development mode, setting default directory.");
          setCurrentDirectory(DEFAULT_DIRECTORY);
          await loadDirectory(DEFAULT_DIRECTORY);
        } else {
          // Option 1: Prompt user immediately (can be intrusive)
          handleSelectDirectory();
        }

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

  // Clear loading timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(loadingTimerRef.current!);
    };
  }, []); // Run only once on mount

  // Calculate dynamic max length based on window width from the hook
  const getDynamicMaxLength = (width: number) => {
    if (width === 0) return 45; // Return default if width is initially 0
    if (width < 768) { // Small screens (e.g., mobile)
      return 35;
    } else if (width < 1000) { // Medium screens (e.g., tablets, smaller laptops)
      return 45;
    } else { // Large screens
      return 60;
    }
  };

  const dynamicMaxLength = getDynamicMaxLength(windowWidth);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-background text-text">
      <header className="flex items-center justify-between flex-shrink-0 px-4 py-2 shadow-md bg-light-bg text-text">
        <a
          href={HEADER_LINK}
          target='_blank'
          className="flex items-end gap-1.5 text-inherit"
        >
          <GptreeLogo className="h-8 w-auto" />
          <h1 className="text-2xl/none font-bold m-0 tracking-tighter">GPTree</h1>
        </a>

        {currentDirectory && (
          <div className="flex-1 text-center text-sm truncate px-4"
            data-tooltip-id="app-tooltip"
            data-tooltip-content={currentDirectory}>
            <span className="font-medium mr-1">Current:</span> {truncatePathStart(currentDirectory, dynamicMaxLength)}
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


      <div className="relative">
        <div className='absolute top-0 right-0 z-10 overflow-hidden w-24 h-24 pointer-events-none'> {/* Container to clip */}
          {/* BETA ribbon here - replacing comment with actual ribbon */}
          {DISPLAY_VERSION_RIBBON && (
            <div className="
            absolute
            top-[20px]
            right-[-30px]
            w-[120px]
            transform
            rotate-45
            bg-yellow-400
            text-center
            text-black
            text-xs
            font-semibold
            uppercase
            py-1
            shadow-md
            pointer-events-auto
          ">
              {VERSION_NAME}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="absolute top-0 left-0 right-0 h-8 w-full z-50">
          <AnimatePresence>
            {(error || transientSuccess) && (
              <motion.div
                // key={error ? 'error' : 'success'}
                key={'error-or-success'}
                initial={{
                  // height: 0,
                  scaleY: 0.8,
                  opacity: 0
                }}
                animate={{
                  // height: 'auto',
                  scaleY: 1,
                  opacity: 1
                }}
                exit={{
                  // height: 0,
                  scaleY: 0.8,
                  opacity: 0
                }}
                // transition={{
                //   ease: 'easeInOut',
                //   duration: 0.3
                // }}
                transition={{
                  duration: 0.4,
                  scale: { type: "spring", visualDuration: 0.4, bounce: 0.5 },
                }}
                style={{ overflow: 'visible', originY: 0 }}
                className={cn(
                  'text-white px-4 py-2',
                  'text-center',
                  transientSuccess && 'bg-success',
                  error && 'bg-error',
                )}
              >
                {error || transientSuccess}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {showLoadingIndicator && <div className="absolute inset-0 bg-black/20 z-40 flex items-center justify-center"><p className="text-white text-lg">Loading...</p></div>}

      <div className="flex flex-row flex-grow gap-4 p-4 overflow-hidden">
        {directoryTree ? (
          <div className="output-panel flex flex-col p-3 border rounded-lg shadow-sm bg-light-bg border-border w-1/3 min-w-[300px] max-w-[50vw] overflow-hidden ">
            <h2 className="text-lg font-semibold mb-3 flex-shrink-0">Project Files</h2>
            <div className="flex-grow overflow-hidden mb-3">
              <DirectoryTree
                tree={directoryTree}
                onFileSelection={handleFileSelection}
                selectedFiles={selectedFiles}
              />
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t border-border flex-shrink-0">
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
          <div className='flex flex-row justify-between items-center gap-2'>
            {currentDirectory && (globalConfig || localConfig) && (
              <div className="config-mode-toggle flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => handleConfigModeSwitch(configMode === 'global' ? 'local' : 'global')}
                  disabled={loading || (!globalConfig && configMode === 'global') || (!localConfig && configMode === 'local')}
                  className={cn(
                    '',
                    // "config-mode-button",
                    // 'hover:bg-black/50 dark:hover:bg-white/10',
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
            <div className={cn(
              'flex items-center gap-3',
              DISPLAY_VERSION_RIBBON && 'pr-12',
              // !currentDirectory && 'hidden'
            )}>
              <a
                href={GITHUB_LINK}
                target="_blank"
                className="text-sm text-light-text hover:text-text"
              >
                <strong>GitHub</strong>
              </a>
            </div>
          </div>

          {config && (
            <ConfigPanel
              config={config}
              onConfigUpdate={async (newConfig) => {
                if (!currentDirectory) {
                  sendErrorMessage("Please select a directory before changing configuration.");
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
            <div className="flex-grow flex items-center justify-center text-center p-4 output-panel border rounded-lg shadow-sm bg-light-bg border-border overflow-hidden">
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
