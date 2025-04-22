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
import { DirectoryItem, Config, OutputContent, AppError, CommandResult, AppSettings, SessionState } from './lib/types';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme, ThemeProvider } from './components/ThemeProvider';
import { truncatePathStart } from './lib/index';
import { useWindowSize } from './hooks/useWindowSize';
import { sendSignal } from './hooks/signalEmitter';
import { settingsAtom } from './lib/store/atoms';
import { useAtom } from 'jotai';

const DEFAULT_DIRECTORY = '/Users/travis/Dev/2025/python/auto-job-hunting/auto-job-1';

// Define a default config object based on the Config interface
const defaultConfig: Config = {
  version: 2, // Match CONFIG_VERSION from Rust
  use_git_ignore: true,
  include_file_types: "*",
  exclude_file_types: [],
  output_file: "gptree_output.txt",
  save_output_file: true,
  output_file_locally: true,
  copy_to_clipboard: false,
  safe_mode: true,
  store_files_chosen: true,
  line_numbers: false,
  show_ignored_in_tree: false,
  show_default_ignored_in_tree: false,
  previous_files: [],
};

function App() {
  const [currentDirectory, setCurrentDirectory] = useState<string>("");
  const [directoryTree, setDirectoryTree] = useState<DirectoryItem | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // --- Config State Management in App.tsx ---
  const [config, setConfig] = useState<Config | null>(null); // The active config being edited/displayed
  const [globalConfig, setGlobalConfig] = useState<Config | null>(null); // Loaded global config
  const [localConfig, setLocalConfig] = useState<Config | null>(null); // Loaded local config
  const [configMode, setConfigMode] = useState<'global' | 'local' | string>('global');
  const [isConfigPanelDirty, setIsConfigPanelDirty] = useState<boolean>(false);
  const originalConfigRef = useRef<Config | null>(null); // Store the config state before edits
  // -----------------------------------------

  const [output, setOutput] = useState<OutputContent | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transientSuccess, setTransientSuccess] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useAtom(settingsAtom);

  const [initialConfigModePreference, setInitialConfigModePreference] = useState<'global' | 'local' | null>(null);

  function log(message: string, level: 'info' | 'warn' | 'error' | 'debug' | string = 'info') {
    console.log('log', message, level);
    sendSignal('log', { message: message, level: level });
  }

  const [pendingClipboardCopy, setPendingClipboardCopy] = useState(false);

  const [showLoadingIndicator, setShowLoadingIndicator] = useState<boolean>(false);
  const loadingTimerRef = useRef<number | null>(null);
  const LOADING_DELAY = 300;

  const { width: windowWidth } = useWindowSize();

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

  const startLoading = useCallback(() => {
    setLoading(true);
    clearTimeout(loadingTimerRef.current!); // Use ! only if sure it's not null
    loadingTimerRef.current = setTimeout(() => {
      setShowLoadingIndicator(true);
    }, LOADING_DELAY) as unknown as number;
  }, []);

  const stopLoading = useCallback(() => {
    clearTimeout(loadingTimerRef.current!); // Use ! only if sure it's not null
    setLoading(false);
    setShowLoadingIndicator(false);
  }, []);

  const handleSettingsSaved = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    sendSuccessMessage("Settings saved", 2000);
    if (currentDirectory && newSettings.defaultToLocalConfig !== settings?.defaultToLocalConfig) {
      fetchConfigs(currentDirectory, newSettings, initialConfigModePreference);
    }
  }, [setSettings, sendSuccessMessage, currentDirectory, settings, initialConfigModePreference]);

  const loadInitialSettings = useCallback(async (): Promise<AppSettings | null> => {
    log('Loading initial application settings...', 'debug');
    try {
      const result = await invoke<CommandResult<AppSettings>>('get_app_settings');
      if (result.success && result.data) {
        log('Settings loaded successfully', 'debug');
        setSettings(result.data);
        return result.data;
      } else {
        const errorMsg = result.error ? JSON.stringify(result.error) : 'Unknown error loading settings';
        log(`Failed to load settings: ${errorMsg}`, 'error');
        sendErrorMessage(`Failed to load settings: ${errorMsg}`);
        return null;
      }
    } catch (err: any) {
      log(`Error invoking get_app_settings: ${err.toString()}`, 'error');
      sendErrorMessage(`Error loading settings: ${err.toString()}`);
      throw err;
    }
  }, [setSettings, log, sendErrorMessage]);

  const handleSelectDirectory = useCallback(async (loadedSettings: AppSettings | null): Promise<boolean> => {
    clearMessages();
    try {
      const result = await invoke<{ success: boolean; data?: string; error?: string }>("select_directory");

      if (result.success && result.data) {
        setCurrentDirectory(result.data);
        await loadDirectory(result.data, loadedSettings, initialConfigModePreference);
        return true;
      } else if (result.error) {
        if (result.error.includes("cancelled")) {
          log("Directory selection cancelled.", 'info');
          return false;
        }
        setError(result.error);
        return false;
      }
      return false;
    } catch (err) {
      setError(`Error selecting directory: ${err}`);
      return false;
    }
  }, [log, setError, clearMessages, initialConfigModePreference]);

  const fetchConfigs = async (dir: string, currentSettings: AppSettings | null, modePreference: 'global' | 'local' | null) => {
    log(`Fetching configs for: ${dir}`, 'debug');
    try {
      const result = await invoke<{ success: boolean; data?: { global?: Config, local?: Config }; error?: string }>("get_configs", { path: dir });
      if (result.success && result.data) {
        log('Configs fetched successfully', 'debug');
        const globalExists = !!result.data.global;
        const localExists = !!result.data.local;
        setGlobalConfig(result.data.global || null);
        setLocalConfig(result.data.local || null);

        let initialMode: 'global' | 'local' = 'global';

        const lastModePref = modePreference;
        log(`Using mode preference from init/state: ${lastModePref}`, 'debug');

        if (lastModePref === 'local' && localExists) {
          initialMode = 'local';
          log(`Prioritizing preference: local (exists: ${localExists})`, 'debug');
        } else if (lastModePref === 'global' && globalExists) {
          initialMode = 'global';
          log(`Prioritizing preference: global (exists: ${globalExists})`, 'debug');
        } else {
          if (currentSettings?.defaultToLocalConfig) {
            initialMode = localExists ? 'local' : 'global';
            log(`Fallback to setting: defaultToLocal=true. Using: ${initialMode} (local exists: ${localExists}, global exists: ${globalExists})`, 'debug');
          } else {
            initialMode = globalExists ? 'global' : 'local';
            log(`Fallback to setting: defaultToLocal=false. Using: ${initialMode} (local exists: ${localExists}, global exists: ${globalExists})`, 'debug');
          }
        }

        // Create configs if needed and update the backend about our mode choice
        if ((initialMode === 'local' && !localExists) || (initialMode === 'global' && !globalExists)) {
          log(`Selected config mode '${initialMode}' doesn't exist, creating it`, 'debug');
          try {
            const switchResult = await invoke<CommandResult<boolean>>('set_config_mode', { mode: initialMode });
            if (!switchResult.success) {
              log(`Failed to create missing config: ${switchResult.error}`, 'error');
              // Continue with existing mode
            } else {
              log(`Successfully created missing ${initialMode} config`, 'debug');
              // Avoid immediate refetch by setting the newly created config manually
              if (initialMode === 'local') {
                setLocalConfig({ ...defaultConfig }); // Use the defined default config
              } else {
                setGlobalConfig({ ...defaultConfig }); // Use the defined default config
              }
            }
          } catch (e) {
            log(`Error calling set_config_mode to create missing config: ${e}`, 'error');
            // Continue with existing mode
          }
        } else {
          // Even if both configs exist, we should still update the backend state
          try {
            log(`Updating backend config mode to: ${initialMode}`, 'debug');
            const switchResult = await invoke<CommandResult<boolean>>('set_config_mode', { mode: initialMode });
            if (!switchResult.success) {
              log(`Failed to set config mode in backend: ${switchResult.error}`, 'error');
            } else {
              log(`Successfully set backend config mode to ${initialMode}`, 'debug');
            }
          } catch (e) {
            log(`Error updating backend config mode: ${e}`, 'error');
          }
        }

        setConfigMode(initialMode);
        const activeConfig = initialMode === 'global' ? result.data.global : result.data.local;
        setConfig(activeConfig || null);
        originalConfigRef.current = activeConfig ? { ...activeConfig } : null; // Store original on fetch
        setIsConfigPanelDirty(false); // Reset dirty state

        if (!activeConfig) {
          log(`Preferred config mode '${initialMode}' not found for ${dir}`, 'warn');
        }
      } else if (result.error) {
        setError(`Error loading configs: ${result.error}`);
        log(`Error loading configs: ${result.error}`, 'error');
        setGlobalConfig(null);
        setLocalConfig(null);
        setConfig(null);
        originalConfigRef.current = null;
      }
    } catch (err) {
      setError(`Error loading configs: ${err}`);
      log(`Error loading configs: ${err}`, 'error');
      setGlobalConfig(null);
      setLocalConfig(null);
      setConfig(null);
      originalConfigRef.current = null;
    }
  };

  const loadDirectory = async (path: string, currentSettings: AppSettings | null, modePreference: 'global' | 'local' | null) => {
    log(`Loading directory structure for: ${path}`, 'debug');
    clearMessages();
    startLoading(); // Start loading indicator
    try {
      const treeResult = await invoke<{ success: boolean; data?: DirectoryItem; error?: string }>(
        "load_directory",
        { path }
      );

      if (treeResult.success && treeResult.data) {
        log('Directory tree loaded successfully', 'debug');
        setSelectedFiles([]); // Reset file selection
        setDirectoryTree(treeResult.data);
        await fetchConfigs(path, currentSettings, modePreference); // Fetch configs *after* setting tree
      } else if (treeResult.error) {
        setError(treeResult.error);
        log(`Error loading directory tree: ${treeResult.error}`, 'error');
        setDirectoryTree(null);
        setGlobalConfig(null);
        setLocalConfig(null);
        setConfig(null);
        originalConfigRef.current = null;
      }
    } catch (err) {
      setError(`Error loading directory: ${err}`);
      log(`Error loading directory: ${err}`, 'error');
      setDirectoryTree(null);
      setGlobalConfig(null);
      setLocalConfig(null);
      setConfig(null);
      originalConfigRef.current = null;
    } finally {
      stopLoading(); // Stop loading indicator
    }
  };

  // Handler for ConfigPanel changes
  const handleConfigChange = useCallback((field: keyof Config, value: any) => {
    setConfig(prevConfig => {
      if (!prevConfig) return null;
      const updatedConfig = { ...prevConfig, [field]: value };

      // Check if dirty
      const isDifferent = JSON.stringify(originalConfigRef.current?.[field]) !== JSON.stringify(value);
      if (isDifferent && !isConfigPanelDirty) {
        setIsConfigPanelDirty(true);
      } else if (!isDifferent && isConfigPanelDirty) {
        // Optional: Check if ALL fields are back to original to reset dirty state
        const allSame = Object.keys(updatedConfig).every(
          key => JSON.stringify(updatedConfig[key as keyof Config]) === JSON.stringify(originalConfigRef.current?.[key as keyof Config])
        );
        if (allSame) {
          setIsConfigPanelDirty(false);
        }
      }

      return updatedConfig;
    });
  }, [isConfigPanelDirty]);

  // Handler for ConfigPanel save button
  const handleSaveConfig = async () => {
    if (!config || !isConfigPanelDirty) return;

    try {
      startLoading();
      clearMessages();

      const result = await invoke<{ success: boolean; error?: string | AppError }>(
        "update_config",
        { config: config } // Send the current edited config state
      );

      if (result.success) {
        // Update the persistent stores (local/global) and original ref
        if (configMode === 'local') {
          setLocalConfig({ ...config }); // Save the current state
        } else {
          setGlobalConfig({ ...config }); // Save the current state
        }
        originalConfigRef.current = { ...config }; // Update original ref to current saved state
        setIsConfigPanelDirty(false); // Reset dirty state
        sendSuccessMessage("Configuration saved", 2000);

        // Check if any file filtering settings have changed compared to the *original* config
        const original = originalConfigRef.current;
        const fileFilteringChanged = original && (
          config.include_file_types !== original.include_file_types ||
          config.exclude_file_types.join(',') !== original.exclude_file_types.join(',') ||
          config.use_git_ignore !== original.use_git_ignore ||
          config.show_ignored_in_tree !== original.show_ignored_in_tree ||
          config.show_default_ignored_in_tree !== original.show_default_ignored_in_tree
        );

        // Refresh directory tree if file filtering settings have changed
        if (fileFilteringChanged && currentDirectory) {
          log('File filtering settings changed, refreshing directory tree', 'debug');
          try {
            await loadDirectory(currentDirectory, settings, configMode as 'global' | 'local');
          } catch (err) {
            log(`Error refreshing directory tree: ${err}`, 'error');
          }
        }
      } else if (result.error) {
        const errorMsg = typeof result.error === 'object' && result.error !== null ? JSON.stringify(result.error) : result.error;
        sendErrorMessage(`Error saving config: ${errorMsg}`);
        // Do not reset dirty state on error
      }
    } catch (err) {
      sendErrorMessage(`Error saving configuration: ${err}`);
      // Do not reset dirty state on error
    } finally {
      stopLoading();
    }
  };

  // Handler for ConfigPanel reset button
  const handleResetConfig = useCallback(() => {
    if (originalConfigRef.current) {
      setConfig({ ...originalConfigRef.current }); // Reset to the stored original
    }
    setIsConfigPanelDirty(false);
  }, []);

  const handleFileSelection = (files: string[]) => {
    setSelectedFiles(files);
    clearMessages();
  };

  const handleGenerateOutput = async () => {
    if (!selectedFiles.length) {
      sendErrorMessage("No files selected to generate output.");
      return;
    }
    if (!config) {
      sendErrorMessage("Configuration not loaded.");
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

  const handleCopyToClipboard = async () => {
    if (!output) return;
    try {
      await invoke("copy_to_clipboard", { content: output.combined_content });
      sendSuccessMessage("Copied to clipboard!");
    } catch (err) {
      sendErrorMessage(`Error copying to clipboard: ${err}`);
    }
  };

  const handleOpenOutputFile = async () => {
    log("Opening output file", 'debug');
    if (!output || !output.saved_path) {
      log("Output file path is not available.", 'warn');
      sendErrorMessage("Output file path is not available. Was the output generated and saved successfully?");
      return;
    }
    clearMessages();
    const outputPath = output.saved_path;
    log(`Attempting to open: ${outputPath}`, 'debug');
    try {
      await invoke("open_output_file", { path: outputPath });
    } catch (err) {
      log(`Error opening file: ${err}`, 'error');
      sendErrorMessage(`Error opening file '${outputPath}': ${err}`);
    }
  };

  const handleConfigModeSwitch = async (mode: 'global' | 'local') => {
    if (isConfigPanelDirty) {
      // TODO: Maybe add a confirmation dialog here?
      sendErrorMessage("Save or discard changes before switching config mode.", 3000);
      return;
    }
    try {
      startLoading();
      clearMessages();

      // Update backend state first
      try {
        log(`Setting config mode on backend to: ${mode}`, 'debug');
        const result = await invoke<CommandResult<boolean>>('set_config_mode', { mode: mode });

        if (!result.success) {
          log(`Failed to set config mode: ${result.error}`, 'error');
          sendErrorMessage(`Failed to set config mode: ${result.error}`);
          stopLoading();
          return;
        }
        setInitialConfigModePreference(mode); // Persist preference
      } catch (persistError) {
        log(`Failed to set config mode: ${persistError}`, 'error');
        sendErrorMessage(`Failed to set config mode: ${persistError}`);
        stopLoading();
        return;
      }

      // Update UI state
      setConfigMode(mode);
      const newActiveConfig = mode === 'local' ? (localConfig || globalConfig) : (globalConfig || localConfig);
      setConfig(newActiveConfig);
      originalConfigRef.current = newActiveConfig ? { ...newActiveConfig } : null; // Update original ref on mode switch
      setIsConfigPanelDirty(false); // Reset dirty state on switch

      if (!newActiveConfig) {
        log(`Switched to ${mode} config, but no config found for this mode.`, 'warn');
      }

      // Refresh directory tree with the new config's file type settings
      if (currentDirectory) {
        log(`Refreshing directory tree after config mode switch to ${mode}`, 'debug');
        await loadDirectory(currentDirectory, settings, mode);
      }
    } catch (err) {
      sendErrorMessage(`Error switching config mode UI: ${err}`);
    } finally {
      stopLoading();
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      startLoading();
      let loadedSettings: AppSettings | null = null;
      let modePrefFromSession: 'global' | 'local' | null = null;

      try {
        loadedSettings = await loadInitialSettings();
        if (!loadedSettings) {
          log("Initialization halted due to settings load failure.", 'error');
          stopLoading();
          return;
        }

        let directoryLoaded = false;
        try {
          const result = await invoke<CommandResult<SessionState>>("get_session_state");
          if (result.success && result.data) {
            const { lastDirectory, lastConfigMode } = result.data;
            if (lastConfigMode === 'global' || lastConfigMode === 'local') {
              modePrefFromSession = lastConfigMode;
              setInitialConfigModePreference(lastConfigMode);
              log(`Initialized with last config mode preference: ${lastConfigMode}`, 'debug');
            }
            if (lastDirectory) {
              log(`Found last directory: ${lastDirectory}`, 'debug');
              setCurrentDirectory(lastDirectory);
              await loadDirectory(lastDirectory, loadedSettings, modePrefFromSession);
              directoryLoaded = true;
            }
          }
        } catch (e) {
          log(`Error getting session state during init: ${e}`, 'error');
        }

        if (!directoryLoaded) {
          if (import.meta.env.DEV) {
            log("Development mode: loading default directory.", 'debug');
            setCurrentDirectory(DEFAULT_DIRECTORY);
            await loadDirectory(DEFAULT_DIRECTORY, loadedSettings, modePrefFromSession);
          } else if (loadedSettings?.promptForDirectoryOnStartup) {
            log("Settings indicate prompt for directory on startup.", 'debug');
            const selected = await handleSelectDirectory(loadedSettings);
            if (!selected) {
              log("User did not select a directory when prompted.", 'info');
            }
          } else {
            log("No last directory and prompt on startup is disabled. Waiting for user selection.", 'info');
          }
        }

      } catch (error) {
        log(`Critical error during initialization: ${error}`, 'error');
        setError(`A critical error occurred during startup: ${error}`);
      } finally {
        stopLoading();
      }
    };

    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keep dependencies minimal for init

  useEffect(() => {
    if (pendingClipboardCopy && output) {
      handleCopyToClipboard();
      setPendingClipboardCopy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output, pendingClipboardCopy]);

  useEffect(() => {
    return () => {
      clearTimeout(loadingTimerRef.current!); // Use ! only if sure it's not null
    };
  }, []);

  const getDynamicMaxLength = (width: number) => {
    if (width === 0) return 45;
    if (width < 768) return 35;
    else if (width < 1000) return 45;
    else return 60;
  };

  const dynamicMaxLength = getDynamicMaxLength(windowWidth);

  const handleRefreshDirectoryTree = async () => {
    if (!currentDirectory) return;
    // Use the current configMode, not the initial preference, for refresh
    await loadDirectory(currentDirectory, settings, configMode as 'global' | 'local');
  };

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-background text-text relative">

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={setIsSettingsModalOpen}
        onSettingsSaved={handleSettingsSaved}
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
            onClick={() => handleSelectDirectory(settings)}
            disabled={loading}
            className="button text-sm px-3 py-1.5"
          >
            Select Directory
          </button>
        </div>
      </header>

      <div className="relative">
        <div className='absolute top-0 right-0 z-10 overflow-hidden w-24 h-24 pointer-events-none'>
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
        <div className="absolute top-0 left-0 right-0 h-auto w-full z-50">
          <AnimatePresence>
            {(error || transientSuccess) && (
              <motion.div
                key={error ? 'error' : 'success'}
                initial={{ scaleY: 0.8, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0.8, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ originY: 0 }}
                className={cn(
                  'text-white px-4 py-2 text-center shadow-md',
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

      {showLoadingIndicator && (
        <div className="absolute inset-0 bg-black/30 z-40 flex items-center justify-center backdrop-blur-sm">
          <p className="text-white text-xl font-semibold">Loading...</p>
        </div>
      )}

      <div className="flex flex-row flex-grow gap-4 p-4 overflow-hidden">
        {!loading && !currentDirectory && (
          <div className="flex flex-col items-center justify-center w-full text-center text-[--light-text] p-8">
            <GptreeLogo className="h-16 w-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">Welcome to GPTree!</h2>
            <p className="mb-4">To get started, please select a project directory.</p>
            <button
              onClick={() => handleSelectDirectory(settings)}
              className="button primary-button px-6 py-2"
              disabled={loading}
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
                disabled={loading}
                className="button p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10 m-0"
                data-tooltip-id="small-tooltip"
                data-tooltip-content="Refresh directory tree"
              >
                <ArrowClockwise size={16} weight="bold" />
              </button>
            </div>
            <div className="flex-grow overflow-auto mb-3">
              <DirectoryTree
                tree={directoryTree}
                onFileSelection={handleFileSelection}
                selectedFiles={selectedFiles}
                config={config || undefined}
                onRefresh={handleRefreshDirectoryTree}
              />
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t border-border flex-shrink-0">
              <div className="flex justify-between items-center text-sm text-[--light-text]">
                <span>{selectedFiles?.length ?? 0} files selected</span>
                {config?.store_files_chosen && localConfig?.previous_files?.length && localConfig.previous_files.length > 0 && (
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
          <div className="flex items-center justify-center w-1/3 text-error p-4 border rounded-lg shadow-sm bg-light-bg border-border">
            <p>Error loading directory structure. Please try selecting the directory again or check console logs.</p>
          </div>
        )}

        {currentDirectory && (
          <div className="flex flex-col gap-4 w-2/3 overflow-hidden">
            <div className='flex flex-row justify-between items-center gap-2'>
              {(globalConfig || localConfig) && (
                <div className="config-mode-toggle flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => handleConfigModeSwitch(configMode === 'global' ? 'local' : 'global')}
                    disabled={
                      loading ||
                      isConfigPanelDirty || // Disable switch if dirty
                      (configMode === 'global' && !localConfig) ||
                      (configMode === 'local' && !globalConfig)
                    }
                    className={cn('button text-sm px-2 py-1')}
                    title={
                      isConfigPanelDirty ? "Save or reset config changes before switching" :
                        configMode === 'global' ?
                          (localConfig ? 'Switch to Local Project Config' : 'Local config not available') :
                          (globalConfig ? 'Switch to Global Config' : 'Global config not available')
                    }
                  >
                    {configMode === 'global' ? (localConfig ? 'Use Local Config' : 'Local N/A') : (globalConfig ? 'Use Global Config' : 'Global N/A')}
                  </button>
                  <span className="text-sm text-[--light-text]">
                    Using: <strong>{configMode === 'local' ? 'Local' : 'Global'}</strong> Config
                    {!config && ' (None Found)'}
                  </span>
                </div>
              )}
              {!(globalConfig || localConfig) && <div className="flex-grow"></div>}
              <div className={cn(
                'flex items-center gap-3 flex-shrink-0',
                DISPLAY_VERSION_RIBBON && 'pr-12',
              )}>
                <a
                  href={GITHUB_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-light-text hover:text-text"
                >
                  <strong>GitHub</strong>
                </a>
              </div>
            </div>

            {config && (
              <ConfigPanel
                config={config}
                onConfigChange={handleConfigChange}
                onSave={handleSaveConfig}
                onReset={handleResetConfig}
                isDirty={isConfigPanelDirty}
                disabled={loading}
                className="flex-shrink-0"
              />
            )}
            {!config && !loading && (
              <div className="flex-grow flex items-center justify-center text-center p-4 config-panel border rounded-lg shadow-sm bg-light-bg border-border overflow-hidden">
                <p>No configuration file found for the '{configMode}' scope in this project.</p>
              </div>
            )}

            {config && (
              <>
                {output ? (
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
                ) : (
                  <div className="flex-grow flex items-center justify-center text-center p-4 output-panel border rounded-lg shadow-sm bg-light-bg border-border overflow-hidden">
                    <p>Select files and click "Generate Output" to see results here.</p>
                  </div>
                )}
              </>
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
