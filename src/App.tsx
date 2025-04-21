import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import DirectoryTree from "./components/DirectoryTree";
import ConfigPanel from "./components/ConfigPanel";
import OutputPanel from "./components/OutputPanel";
import SettingsModal from "./components/SettingsModal";
import GptreeLogo from './assets/gptree_logo.svg?react';
import { Tooltip } from 'react-tooltip';
import { ArrowClockwise, Gear, Moon, Sun } from '@phosphor-icons/react';
import { cn } from './lib/utils';
import { HEADER_LINK, GITHUB_LINK, VERSION_NAME, DISPLAY_VERSION_RIBBON } from './lib/constants';
import { DirectoryItem, Config, OutputContent, AppError, CommandResult, AppSettings } from './lib/types';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme, ThemeProvider } from './components/ThemeProvider';
import { truncatePathStart } from './lib/index';
import { useWindowSize } from './hooks/useWindowSize';
import { sendSignal } from './hooks/signalEmitter';
import { settingsAtom } from './lib/store/atoms';
import { useSetAtom } from 'jotai';

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

  // State for settings modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const setSettings = useSetAtom(settingsAtom);

  function log(message: string, level: 'info' | 'warn' | 'error' | 'debug' | string = 'info') {
    console.log('log', message, level);
    sendSignal('log', { message: message, level: level });
  }

  // New state for config override
  const [globalConfig, setGlobalConfig] = useState<Config | null>(null);
  const [localConfig, setLocalConfig] = useState<Config | null>(null);
  const [configMode, setConfigMode] = useState<'global' | 'local'>('global');
  const [isConfigPanelDirty, setIsConfigPanelDirty] = useState<boolean>(false); // State for config panel dirty status

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
    }, LOADING_DELAY) as unknown as number;
  };

  const stopLoading = () => {
    clearTimeout(loadingTimerRef.current!);
    setLoading(false);
    setShowLoadingIndicator(false);
  };

  // Callback when settings are saved from the modal
  const handleSettingsSaved = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings); // Update the global Jotai atom
    sendSuccessMessage("Settings saved", 2000);
    // TODO: Potentially trigger actions based on new settings, e.g., re-fetch configs
    // if (currentDirectory && newSettings.defaultToLocalConfig !== settings?.defaultToLocalConfig) {
    //   fetchConfigs(currentDirectory);
    // }
  }, [setSettings, sendSuccessMessage]);

  // Load initial application settings
  const loadInitialSettings = useCallback(async () => {
    log('Loading initial application settings...', 'debug');
    try {
      const result = await invoke<CommandResult<AppSettings>>('get_app_settings');
      if (result.success && result.data) {
        log('Settings loaded successfully', 'debug');
        setSettings(result.data);
        // TODO: Apply initial settings logic here if needed (e.g., setting initial config mode)
      } else {
        const errorMsg = result.error ? JSON.stringify(result.error) : 'Unknown error';
        log(`Failed to load settings: ${errorMsg}`, 'error');
        // Optionally set default settings in atom or show persistent error
        // setSettings(AppSettingsDefault); // Assuming you have defaults defined
        sendErrorMessage(`Failed to load settings: ${errorMsg}`);
      }
    } catch (err: any) {
      log(`Error invoking get_app_settings: ${err.toString()}`, 'error');
      sendErrorMessage(`Error loading settings: ${err.toString()}`);
    }
  }, [setSettings]);

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

        // TODO: Add logic here to check APPLICATION settings for which to default to
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

  // Update configuration - This now handles the saving triggered by ConfigPanel
  const handleSaveConfig = async (newConfig: Config) => {
    try {
      startLoading();
      clearMessages();

      const result = await invoke<{ success: boolean; error?: string | AppError }>(
        "update_config",
        { config: newConfig }
      );

      if (result.success) {
        setConfig(newConfig); // Update active config
        // Also update the correct stored config state
        if (configMode === 'local') {
          setLocalConfig(newConfig);
        } else {
          setGlobalConfig(newConfig);
        }
        sendSuccessMessage("Configuration saved", 2000); // Optional success message
      } else if (result.error) {
        const errorMsg = typeof result.error === 'object' && result.error !== null ? JSON.stringify(result.error) : result.error;
        sendErrorMessage(`Error saving config: ${errorMsg}`);
        // Re-throw to signal ConfigPanel that save failed
        throw new Error(`Error saving config: ${errorMsg}`);
      }
    } catch (err) {
      sendErrorMessage(`Error saving configuration: ${err}`);
      // Re-throw to signal ConfigPanel that save failed
      throw new Error(`Error saving configuration: ${err}`);
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
    log("Opening output file", 'debug');
    log(output?.saved_path ?? "No output file path", 'debug');
    if (!output || !output.saved_path) {
      log("Output file path is not available. Was the output generated and saved successfully?", 'debug');
      sendErrorMessage("Output file path is not available. Was the output generated and saved successfully?");
      return;
    }
    clearMessages();

    const outputPath = output.saved_path; // Use the absolute path from the backend
    log("Opening output file", 'debug');
    log(outputPath, 'debug');

    try {
      log("Invoking open_output_file", 'debug');
      await invoke("open_output_file", { path: outputPath });
    } catch (err) {
      log("Error opening file", 'debug');
      log(err?.toString() ?? "Unknown error", 'debug');
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
        // Don't send error message here, the panel will show loading/unavailable state
        // sendErrorMessage("Selected config type is not available.");
      }
      // Switching mode should reset any unsaved changes in the panel
      // The ConfigPanel's useEffect hook handles this based on the 'config' prop changing.
    } catch (err) {
      sendErrorMessage(`Error switching config mode: ${err}`);
    } finally {
      stopLoading();
    }
  };

  // When app loads, load settings and check for last directory
  useEffect(() => {
    const init = async () => {
      await loadInitialSettings(); // Load settings first

      // Now proceed with directory loading logic (potentially using settings)
      // TODO: Use settings.promptForDirectoryOnStartup here
      const lastDirLoaded = await checkLastDirectory();
      // Only prompt if no last directory AND no current directory set
      if (!lastDirLoaded && !currentDirectory) {

        if (import.meta.env.DEV) {
          console.log("Development mode, setting default directory.");
          setCurrentDirectory(DEFAULT_DIRECTORY);
          await loadDirectory(DEFAULT_DIRECTORY);
        } else {
          // Option 2: Show a message or placeholder state indicating no directory selected
          // handleSelectDirectory();
          console.log("No last directory found, waiting for user selection.");
          // The UI will now handle showing the prompt message based on !currentDirectory
        }

        // Option 2: Show a message or placeholder state indicating no directory selected
        console.log("No last directory found, waiting for user selection.");
        // Optionally set a state here to show a "Select a Directory" message centrally
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadInitialSettings]);

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

  const handleRefreshDirectoryTree = async () => {
    await loadDirectory(currentDirectory);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-background text-text">


      {/* Render Settings Modal - Pass the callback */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={setIsSettingsModalOpen}
        onSettingsSaved={handleSettingsSaved}
      // onSettingsSaved={() => { }}
      />

      <header className="flex items-center justify-between flex-shrink-0 px-4 py-2 shadow-md bg-light-bg text-text">
        <a
          href={HEADER_LINK}
          target='_blank'
          className="flex items-end gap-1.5 text-inherit"
          data-tooltip-id="small-tooltip"
          data-tooltip-content="Visit the GPTree website"
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
          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            title="Application Settings"
            className="button p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10"
            data-tooltip-id="small-tooltip"
            data-tooltip-content="Application Settings"
          >
            <Gear weight="duotone" />
          </button>
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="button p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10"
            data-tooltip-id="small-tooltip"
            data-tooltip-content={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon weight="fill" /> : <Sun weight="fill" />}
          </button>
          <button
            onClick={handleSelectDirectory}
            disabled={loading}
            className="button text-sm px-3 py-1.5"
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
        {!currentDirectory && !loading && (
          <div className="flex flex-col items-center justify-center w-full text-center text-[--light-text] p-8">
            <GptreeLogo className="h-16 w-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">Welcome to GPTree!</h2>
            <p className="mb-4">To get started, please select a project directory.</p>
            <button
              onClick={handleSelectDirectory}
              className="button primary-button px-6 py-2"
            >
              Select Project Directory
            </button>
          </div>
        )}

        {currentDirectory && directoryTree && (
          <div className="output-panel flex flex-col p-2 border rounded-lg shadow-sm bg-light-bg border-border w-1/3 min-w-[300px] max-w-[50vw] overflow-hidden ">
            <div className='flex flex-row justify-between items-center gap-2 mb-2'>
              <h2 className="text-lg/none font-semibold flex-shrink-0">Project Files</h2>
              <button
                onClick={handleRefreshDirectoryTree}
                className="button p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10 m-0"
                data-tooltip-id="small-tooltip"
                data-tooltip-content="Refresh directory tree"
              >
                <ArrowClockwise size={16} weight="bold" />
              </button>
            </div>
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
                    className="button text-xs px-2 py-1"
                  >
                    Use Previous Selection
                  </button>
                )}
              </div>
              <button
                onClick={handleGenerateOutput}
                disabled={loading || selectedFiles.length === 0}
                className="button primary-button w-full"
              >
                Generate Output
              </button>
            </div>
          </div>
        )}

        {currentDirectory && !directoryTree && !loading && (
          <div className="flex items-center justify-center w-1/3 text-error">
            <p>Error loading directory structure. Please try selecting again.</p>
          </div>
        )}

        {currentDirectory && (
          <div className="flex flex-col gap-4 w-2/3 overflow-hidden">
            <div className='flex flex-row justify-between items-center gap-2'>
              {currentDirectory && (globalConfig || localConfig) && (
                <div className="config-mode-toggle flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => handleConfigModeSwitch(configMode === 'global' ? 'local' : 'global')}
                    disabled={
                      loading ||
                      isConfigPanelDirty || // Disable if config panel has unsaved changes
                      (configMode === 'global' && !localConfig) || // Disable switching TO local if local doesn't exist
                      (configMode === 'local' && !globalConfig) // Disable switching TO global if global doesn't exist
                    }
                    className={cn(
                      'button',
                      // "config-mode-button",
                      // 'hover:bg-black/50 dark:hover:bg-white/10',
                      (configMode === 'local' ? localConfig : globalConfig) ? 'active' : 'inactive' // Simplified check for active
                    )}
                    title={
                      isConfigPanelDirty ? "Save or reset config changes before switching" :
                        configMode === 'global' ?
                          (localConfig ? 'Switch to Local Project Config' : 'Local config not available') :
                          (globalConfig ? 'Switch to Global Config' : 'Global config not available')
                    }
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
                config={config} // Pass the currently active config
                onConfigUpdate={handleSaveConfig} // Pass the save handler
                onDirtyChange={setIsConfigPanelDirty} // Pass the dirty state setter
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
                saveOutputFile={config.save_output_file}
                className="flex-grow flex flex-col min-h-0"
              />
            )}

            {!output && config && (
              <div className="flex-grow flex items-center justify-center text-center p-4 output-panel border rounded-lg shadow-sm bg-light-bg border-border overflow-hidden">
                <p>Select files and click "Generate Output" to see results here.</p>
              </div>
            )}

            {!config && !loading && (
              <div className="flex-grow flex items-center justify-center text-center p-4 output-panel border rounded-lg shadow-sm bg-light-bg border-border overflow-hidden">
                <p>Loading configuration...</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Tooltip id="app-tooltip" className="react-tooltip z-[51]" />
      <Tooltip
        id="small-tooltip"
        className="react-tooltip z-[51]"
        style={{
          fontSize: '12px',
          padding: '4px 8px',
          borderRadius: '4px',
        }}
      />
    </div>
  );
}

export default function AppWithThemeProvider() {
  return <ThemeProvider><App /></ThemeProvider>;
}
