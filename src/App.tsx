import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import DirectoryTree from "./components/DirectoryTree";
import ConfigPanel from "./components/ConfigPanel";
import OutputPanel from "./components/OutputPanel";
import SettingsModal from "./components/SettingsModal";
// import GptreeLogo from './assets/gptree_logo.svg?react';
import { Tooltip } from 'react-tooltip';
import { ArrowClockwise, Funnel, Gear, Moon, Sun } from '@phosphor-icons/react';
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

const DEFAULT_DIRECTORY = import.meta.env.VITE_DEFAULT_DIRECTORY || '';

// Define a default config object based on the Config interface
const defaultConfig: Config = {
  version: 3, // Match CONFIG_VERSION from Rust
  use_git_ignore: true,
  include_file_types: "*",
  exclude_file_types: "",
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
  exclude_dirs: "", // Added new field
};

function App() {
  const [currentDirectory, setCurrentDirectory] = useState<string>("");
  const [directoryTree, setDirectoryTree] = useState<DirectoryItem | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [sessionOnlyExcludedDirs, setSessionOnlyExcludedDirs] = useState<Set<string>>(new Set()); // For UI-only exclusions

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

  // Helper to convert CSV string to Set and vice-versa
  const configStringToSet = (csvString: string | undefined): Set<string> => {
    if (!csvString) return new Set();
    return new Set(csvString.split(',').map(s => s.trim()).filter(Boolean));
  };

  // const setToString = (stringSet: Set<string>): string => {
  //   return Array.from(stringSet).join(',');
  // };

  // Get effective excluded directories (combining config and session-only)
  const getEffectiveExcludedDirs = useCallback((): Set<string> => {
    const fromConfig = configStringToSet(config?.exclude_dirs);
    // Merge with session-only exclusions
    return new Set([...fromConfig, ...sessionOnlyExcludedDirs]);
  }, [config?.exclude_dirs, sessionOnlyExcludedDirs]);


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

        const transformConfig = (cfg: Config | undefined | null): Config | null => {
          if (!cfg) return null;
          // Create a new object to avoid mutating the original backend response
          const newCfg = { ...cfg };
          if (Array.isArray(newCfg.exclude_dirs)) {
            newCfg.exclude_dirs = (newCfg.exclude_dirs as unknown as string[]).join(',');
          }
          return newCfg;
        };

        const fetchedGlobalConfig = transformConfig(result.data.global);
        const fetchedLocalConfig = transformConfig(result.data.local);

        setGlobalConfig(fetchedGlobalConfig);
        setLocalConfig(fetchedLocalConfig);

        const globalExists = !!fetchedGlobalConfig;
        const localExists = !!fetchedLocalConfig;

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
        const activeConfig = initialMode === 'global' ? fetchedGlobalConfig : fetchedLocalConfig;
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
    setSessionOnlyExcludedDirs(new Set()); // Reset session exclusions on new directory load
    try {
      const treeResult = await invoke<{ success: boolean; data?: DirectoryItem; error?: string }>(
        "load_directory",
        { path }
      );

      if (treeResult.success && treeResult.data) {
        log('Directory tree loaded successfully', 'debug');
        const newTree = treeResult.data;
        setDirectoryTree(newTree);

        // Fetch configs and update config state *before* finalizing selections
        await fetchConfigs(path, currentSettings, modePreference);

        // Now that directoryTree and config state (via fetchConfigs) are updated,
        // proceed with selection logic.
        if (selectionToRestoreRef.current) {
          const filesToTry = selectionToRestoreRef.current;
          // Use the most up-to-date getEffectiveExcludedDirs which relies on the just-set config
          const currentEffectiveExcludes = getEffectiveExcludedDirs();
          const availableFiles = getDescendantFiles(newTree, currentEffectiveExcludes);
          const restored = filesToTry.filter(file => availableFiles.includes(file));
          setSelectedFiles(restored);
          selectionToRestoreRef.current = null; // Clear the ref after attempting restoration
        } else {
          setSelectedFiles([]); // Standard reset if no restoration was intended
        }
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

      // Check if the new state (updatedConfig) is different from originalConfigRef.current
      let isNowDirty = false;
      if (originalConfigRef.current) {
        // If originalConfigRef.current exists, compare updatedConfig against it
        if (JSON.stringify(updatedConfig) !== JSON.stringify(originalConfigRef.current)) {
          isNowDirty = true;
        }
      } else {
        // If there's no originalConfig (e.g., initial state before any config is loaded),
        // any change could be considered "dirty" relative to a non-existent baseline.
        // However, this case should ideally not lead to a savable dirty state if no config was loaded.
        // For safety, let's assume if there's no original, but we have an updatedConfig, it's dirty.
        // This path is less likely if UI prevents changes before a config is loaded.
        isNowDirty = true;
      }

      if (isConfigPanelDirty !== isNowDirty) {
        setIsConfigPanelDirty(isNowDirty);
      }

      return updatedConfig;
    });
  }, [isConfigPanelDirty]); // originalConfigRef is a ref, its changes don't trigger re-render of this callback

  // Handler for ConfigPanel save button
  const handleSaveConfig = async () => {
    if (!config || !isConfigPanelDirty) return;

    // Keep track if loading should stop after save or after refresh
    let shouldStopLoadingAfterSave = true;

    // Prepare the config to be sent to the backend
    // Convert exclude_dirs from CSV string to string[] for the backend
    const configToSend = {
      ...config,
      exclude_dirs: config.exclude_dirs?.split(',').map(s => s.trim()).filter(Boolean),
      // previous_files is already string[] in frontend state, which matches Rust Vec<String>
    };

    try {
      startLoading();
      clearMessages();

      // Store the original config *before* saving for comparison
      const originalConfigForComparison = originalConfigRef.current ? { ...originalConfigRef.current } : null;

      const result = await invoke<{ success: boolean; error?: string | AppError }>(
        "update_config",
        { config: configToSend } // Send the transformed config
      );

      if (result.success) {
        // Update the persistent stores (local/global) and original ref
        // The frontend state `config.exclude_dirs` should remain a CSV string
        // So, when we update localConfig/globalConfig, we use the original `config` state
        if (configMode === 'local') {
          setLocalConfig({ ...config }); // Save the current state (with CSV string for exclude_dirs)
        } else {
          setGlobalConfig({ ...config }); // Save the current state
        }
        originalConfigRef.current = { ...config }; // Update original ref to current saved state (with CSV string)
        setIsConfigPanelDirty(false); // Reset dirty state
        sendSuccessMessage("Configuration saved", 2000);

        // Check if any file filtering settings have changed compared to the *original* config
        const fileFilteringChanged = originalConfigForComparison && (
          config.include_file_types !== originalConfigForComparison.include_file_types ||
          config.exclude_file_types !== originalConfigForComparison.exclude_file_types ||
          config.use_git_ignore !== originalConfigForComparison.use_git_ignore ||
          config.show_ignored_in_tree !== originalConfigForComparison.show_ignored_in_tree ||
          config.show_default_ignored_in_tree !== originalConfigForComparison.show_default_ignored_in_tree ||
          config.exclude_dirs !== originalConfigForComparison.exclude_dirs // Compare the CSV strings
        );

        // Refresh directory tree *after a delay* if file filtering settings have changed
        if (fileFilteringChanged && currentDirectory) {
          shouldStopLoadingAfterSave = false; // Loading will stop after refresh
          log('File filtering settings changed, refreshing directory tree after 1s delay...', 'debug');
          setTimeout(async () => {
            try {
              await loadDirectory(currentDirectory, settings, configMode as 'global' | 'local');
            } catch (err) {
              log(`Error refreshing directory tree: ${err}`, 'error');
              setError(`Error refreshing directory tree: ${err}`); // Show error to user
            } finally {
              stopLoading(); // Stop loading after refresh attempt
            }
          }, 1000); // 1 second delay
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
      // Stop loading only if refresh isn't scheduled
      if (shouldStopLoadingAfterSave) {
        stopLoading();
      }
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
    const effectiveExcludes = getEffectiveExcludedDirs();
    const filteredSelectedFiles = files.filter(filePath => {
      // Convert to relative path for checking against excluded dirs
      const relativeFilePath = filePath.startsWith(currentDirectory + '/')
        ? filePath.substring(currentDirectory.length + 1)
        : filePath;

      // Check if any parent directory of the file is in the excluded set
      return !Array.from(effectiveExcludes).some(excludedDir =>
        relativeFilePath.startsWith(excludedDir + '/') || relativeFilePath === excludedDir
      );
    });
    setSelectedFiles(filteredSelectedFiles);
    clearMessages();
  };

  const handleGenerateOutput = async () => {
    if (!selectedFiles.length && directoryTree) { // Check directoryTree to ensure not pre-initial load
      const allFiles = getDescendantFiles(directoryTree, getEffectiveExcludedDirs()); // Get all files respecting exclusions
      if (allFiles.length === 0 && configStringToSet(config?.exclude_dirs).size > 0) {
        sendErrorMessage("No files available to select. Check excluded directories.");
        return;
      }
      sendErrorMessage("No files selected to generate output.");
      return;
    }
    if (!config) {
      sendErrorMessage("Configuration not loaded.");
      return;
    }

    const effectiveDirsToExcludeArray = Array.from(getEffectiveExcludedDirs());

    try {
      startLoading();
      clearMessages();
      const result = await invoke<{ success: boolean; data?: OutputContent; error?: string }>(
        "generate_output",
        { selectedFiles, excludedDirs: effectiveDirsToExcludeArray } // Pass excludedDirs to backend
      );
      if (result.success && result.data) {
        setOutput(result.data);
        if (config?.copy_to_clipboard) {
          setPendingClipboardCopy(true);
        }

        // If store_files_chosen is true, update config with current selections and exclusions
        if (config.store_files_chosen && configMode === 'local') { // Only for local config as per original request
          const currentPreviousFiles = config.previous_files || [];
          const currentExcludeDirsCsv = config.exclude_dirs || "";

          const newPreviousFiles = selectedFiles.map(sf =>
            sf.startsWith(currentDirectory + '/') ? sf.substring(currentDirectory.length + 1) : sf
          );
          const newExcludedDirsCsv = effectiveDirsToExcludeArray.join(',');

          const previousFilesChanged = JSON.stringify(newPreviousFiles) !== JSON.stringify(currentPreviousFiles);
          const excludeDirsChanged = newExcludedDirsCsv !== currentExcludeDirsCsv;

          if (previousFilesChanged || excludeDirsChanged) {
            log("Storing chosen files and/or excluded directories into local config...", "debug");
            const updatedConfigForStorage = {
              ...config,
              previous_files: newPreviousFiles,
              exclude_dirs: newExcludedDirsCsv,
            };
            setConfig(updatedConfigForStorage);
            setIsConfigPanelDirty(true); // Mark as dirty due to programmatic change requiring save
            setSessionOnlyExcludedDirs(new Set()); // Clear session exclusions as they are now in config

            await handleSaveConfig(); // Save the updated config
            // Note: handleSaveConfig internally resets isConfigPanelDirty to false on success
            // and updates originalConfigRef.current.
          } else {
            log("Store files chosen: No changes to previous files or excluded directories to save.", "debug");
          }
        } else if (config.store_files_chosen && configMode !== 'local') {
          log("Store files chosen is enabled, but not in local config mode. Excluded directories won't be saved to global config.", "info")
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
    setSessionOnlyExcludedDirs(new Set()); // Reset session exclusions on config mode switch

    selectionToRestoreRef.current = [...selectedFiles]; // Preserve current selection

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

  const handleToggleUIDirectoryExclusion = (dirPath: string) => {
    const makeRelative = (dp: string) => dp.startsWith(currentDirectory + '/')
      ? dp.substring(currentDirectory.length + 1)
      : dp;
    const relativePath = makeRelative(dirPath);

    const configExcludesSet = configStringToSet(config?.exclude_dirs);

    if (configExcludesSet.has(relativePath)) {
      // It's in the persisted config, so we need to modify the config string
      log(`Attempting to re-include directory from config: ${relativePath}`, 'debug');
      const newConfigExcludesArray = Array.from(configExcludesSet).filter(p => p !== relativePath);
      const newConfigExcludesCsv = newConfigExcludesArray.join(',');
      handleConfigChange('exclude_dirs', newConfigExcludesCsv); // This marks ConfigPanel dirty

      // Also ensure it's not in session-only (it shouldn't be if this logic path is taken)
      setSessionOnlyExcludedDirs(prev => {
        const next = new Set(prev);
        if (next.has(relativePath)) {
          next.delete(relativePath);
          log(`Removed ${relativePath} from session exclusions as it was re-included from config.`, 'debug');
        }
        return next;
      });
    } else {
      // Not in persisted config, so toggle in session-only set
      setSessionOnlyExcludedDirs(prev => {
        const next = new Set(prev);
        if (next.has(relativePath)) {
          next.delete(relativePath);
          log(`Temporarily un-excluded directory: ${relativePath}`, 'debug');
        } else {
          next.add(relativePath);
          log(`Temporarily excluded directory: ${relativePath}`, 'debug');
        }
        return next;
      });
    }
    // Important: After changing config.exclude_dirs via handleConfigChange,
    // the `getEffectiveExcludedDirs` will update, and DirectoryTree will re-render.
    // We might need to trigger a re-filtering of selected files if a directory is re-included.
    // For now, this is implicitly handled by selectedFiles being managed by DirectoryTree's local state
    // and its own filtering logic which uses effectiveExcludedDirs.
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


  // Check if file type filtering is active
  const isFilterActive = config && (
    config.include_file_types !== "*" ||
    (config.include_file_types === "*" && config.exclude_file_types.split(',').filter(Boolean).length > 0)
  );

  // Get human-readable filter description
  const getFilterDescription = (): string => {
    if (!config) return '';

    if (config.include_file_types === "*") {
      if (config.exclude_file_types.split(',').filter(Boolean).length > 0) {
        return `Excluding: ${config.exclude_file_types.split(',').filter(Boolean).join(', ')}`;
      }
      return 'All files';
    } else {
      return `Only: ${config.include_file_types}`;
    }
  };

  // Helper to get all descendant file paths (visible in the current tree structure)
  // Needs to be updated to respect excluded directories passed to it
  const getDescendantFiles = useCallback((item: DirectoryItem, excludedDirsSet: Set<string>): string[] => {
    let paths: string[] = [];
    const itemRelativePath = item.path.startsWith(currentDirectory + '/')
      ? item.path.substring(currentDirectory.length + 1)
      : item.path;

    // If the item itself is an excluded directory, return no paths from it
    if (item.is_dir && excludedDirsSet.has(itemRelativePath)) {
      return [];
    }

    if (!item.is_dir) {
      paths.push(item.path);
    } else if (item.children) {
      item.children.forEach(child => {
        paths = paths.concat(getDescendantFiles(child, excludedDirsSet)); // Pass the set down
      });
    }
    return paths;
  }, [currentDirectory]);

  const allFilePathsInTree = useMemo(() => {
    if (!directoryTree) return [];
    return getDescendantFiles(directoryTree, getEffectiveExcludedDirs());
  }, [directoryTree, getEffectiveExcludedDirs, getDescendantFiles]);

  const selectionToRestoreRef = useRef<string[] | null>(null);

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
          {/* <GptreeLogo className="h-8 w-auto" /> */}
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
        <div className="absolute inset-0 bg-black/30 z-40 flex flex-col items-center gap-8 justify-center backdrop-blur-sm">
          <div className="text-xl font-semibold">Loading</div>

          <div className="loader"></div>
        </div>
      )}

      <div className="flex flex-row flex-grow gap-4 p-4 overflow-hidden">
        {!loading && !currentDirectory && (
          <div className="flex flex-col items-center justify-center w-full text-center text-[--light-text] p-8">
            {/* <GptreeLogo className="h-16 w-auto mb-4 text-muted-foreground opacity-50" /> */}
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

              {/* Filter indicator */}
              {isFilterActive && (
                <div
                  className="flex items-center gap-1 text-primary text-xs cursor-default"
                  // title={getFilterDescription()}
                  data-tooltip-id="small-tooltip"
                  data-tooltip-content={getFilterDescription()}
                >
                  <Funnel size={14} />
                  <span>Filtered</span>
                </div>
              )}
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
                enableFolderCheckboxes={settings?.enableFolderCheckboxes ?? true}
                effectiveExcludedDirs={getEffectiveExcludedDirs()}
                configDefinedExclusions={configStringToSet(config?.exclude_dirs)}
                onToggleUIDirectoryExclusion={handleToggleUIDirectoryExclusion}
                currentDirectory={currentDirectory}
              />
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t border-border flex-shrink-0">
              <div className="flex justify-between items-center text-sm text-[--light-text]">
                <span className="text-xs text-muted-foreground">{selectedFiles?.length ?? 0} of {allFilePathsInTree.length} files selected</span>
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
                configMode={configMode as 'global' | 'local'}
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
