use crate::models::{AppError, Config, CONFIG_VERSION};
use crate::{AppSettings, SessionState};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const PROJECT_CONFIG_FILE: &str = ".gptree_config";
const GLOBAL_CONFIG_FILE: &str = ".gptreerc";
const SESSION_STATE_FILE: &str = "session_state.json";

/// Load or create a configuration file for the project
pub fn load_or_create_project_config(root_dir: &Path) -> Result<Config, AppError> {
    let config_path = root_dir.join(PROJECT_CONFIG_FILE);
    if config_path.exists() {
        let config = load_config(&config_path)?;
        Ok(migrate_config(config, false))
    } else {
        let config = Config::default();
        save_config(&config_path, &config, false)?;
        Ok(config)
    }
}

/// Load or create a global configuration file
pub fn load_or_create_global_config() -> Result<Config, AppError> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| AppError::Config("Could not find home directory".to_string()))?;

    let config_path = home_dir.join(GLOBAL_CONFIG_FILE);
    if config_path.exists() {
        let config = load_config(&config_path)?;
        let migrated = migrate_config(config.clone(), true);
        if migrated != config {
            // Only save if migration changed something
            eprintln!(
                "[GPTree] Saving migrated global config to {:?}",
                config_path
            );
            save_config(&config_path, &migrated, true)?;
        }
        Ok(migrated)
    } else {
        let mut config = Config::default();
        // Remove project-specific fields for global config
        config.previous_files = Vec::new();
        save_config(&config_path, &config, true)?;
        Ok(config)
    }
}

/// Load a configuration from a file
fn load_config(config_path: &Path) -> Result<Config, AppError> {
    let mut file = File::open(config_path)
        .map_err(|e| AppError::Config(format!("Failed to open config file: {}", e)))?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| AppError::Config(format!("Failed to read config file: {}", e)))?;

    let mut config = Config::default();

    // Parse the config file line by line
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();

            match key {
                "version" => {
                    if let Ok(version) = value.parse::<u32>() {
                        config.version = version;
                    }
                }
                "useGitIgnore" => {
                    config.use_git_ignore = value == "true";
                }
                "includeFileTypes" => {
                    config.include_file_types = value.to_string();
                }
                "excludeFileTypes" => {
                    config.exclude_file_types = if value.is_empty() {
                        Vec::new()
                    } else {
                        value.split(',').map(|s| s.trim().to_string()).collect()
                    };
                }
                "outputFile" => {
                    config.output_file = value.to_string();
                }
                "saveOutputFile" => {
                    config.save_output_file = value == "true";
                }
                "outputFileLocally" => {
                    config.output_file_locally = value == "true";
                }
                "copyToClipboard" => {
                    config.copy_to_clipboard = value == "true";
                }
                "safeMode" => {
                    config.safe_mode = value == "true";
                }
                "storeFilesChosen" => {
                    config.store_files_chosen = value == "true";
                }
                "lineNumbers" => {
                    config.line_numbers = value == "true";
                }
                "showIgnoredInTree" => {
                    config.show_ignored_in_tree = value == "true";
                }
                "showDefaultIgnoredInTree" => {
                    config.show_default_ignored_in_tree = value == "true";
                }
                "previousFiles" => {
                    config.previous_files = if value.is_empty() {
                        Vec::new()
                    } else {
                        value.split(',').map(|s| s.trim().to_string()).collect()
                    };
                }
                _ => {}
            }
        }
    }

    Ok(config)
}

/// Save a configuration to a file
pub fn save_config(config_path: &Path, config: &Config, is_global: bool) -> Result<(), AppError> {
    let mut file = File::create(config_path)
        .map_err(|e| AppError::Config(format!("Failed to create config file: {}", e)))?;

    writeln!(
        file,
        "# GPTree {} Config",
        if is_global { "Global" } else { "Local" }
    )?;
    writeln!(file, "version: {}", config.version)?;
    writeln!(file, "# Whether to use .gitignore")?;
    writeln!(file, "useGitIgnore: {}", config.use_git_ignore)?;
    writeln!(file, "# File types to include (e.g., .py,.js)")?;
    writeln!(file, "includeFileTypes: {}", config.include_file_types)?;
    writeln!(file, "# File types to exclude when includeFileTypes is '*'")?;
    writeln!(
        file,
        "excludeFileTypes: {}",
        config.exclude_file_types.join(",")
    )?;
    writeln!(file, "# Output file name")?;
    writeln!(file, "outputFile: {}", config.output_file)?;
    writeln!(file, "# Whether to save the output file at all")?;
    writeln!(file, "saveOutputFile: {}", config.save_output_file)?;
    writeln!(
        file,
        "# Whether to output the file locally or relative to the project directory"
    )?;
    writeln!(file, "outputFileLocally: {}", config.output_file_locally)?;
    writeln!(file, "# Whether to copy the output to the clipboard")?;
    writeln!(file, "copyToClipboard: {}", config.copy_to_clipboard)?;
    writeln!(
        file,
        "# Whether to use safe mode (prevent overly large files from being combined)"
    )?;
    writeln!(file, "safeMode: {}", config.safe_mode)?;
    writeln!(
        file,
        "# Whether to store the files chosen in the config file (--save, -s)"
    )?;
    writeln!(file, "storeFilesChosen: {}", config.store_files_chosen)?;
    writeln!(
        file,
        "# Whether to include line numbers in the output (--line-numbers, -n)"
    )?;
    writeln!(file, "lineNumbers: {}", config.line_numbers)?;
    writeln!(
        file,
        "# Whether to show ignored files in the directory tree"
    )?;
    writeln!(file, "showIgnoredInTree: {}", config.show_ignored_in_tree)?;
    writeln!(file, "# Whether to show only default ignored files in the directory tree while still respecting gitignore")?;
    writeln!(
        file,
        "showDefaultIgnoredInTree: {}",
        config.show_default_ignored_in_tree
    )?;

    if !is_global {
        writeln!(
            file,
            "# Previously selected files (when using the -s or --save flag previously)"
        )?;
        writeln!(file, "previousFiles: {}", config.previous_files.join(","))?;
    }

    Ok(())
}

/// Update the previous files list in the configuration
pub fn update_previous_files(
    config_path: &Path,
    selected_files: &[String],
    root_dir: &Path,
) -> Result<(), AppError> {
    // Convert absolute paths to relative paths
    let relative_paths: Vec<String> = selected_files
        .iter()
        .filter_map(|path| {
            let path_buf = PathBuf::from(path);
            path_buf
                .strip_prefix(root_dir)
                .ok()
                .map(|rel_path| rel_path.to_string_lossy().to_string())
        })
        .collect();

    // Load existing config
    let mut config = load_config(config_path)?;

    // Update previous files
    config.previous_files = relative_paths;

    // Save updated config
    save_config(config_path, &config, false)
}

/// Migrate a config to the current version
fn migrate_config(mut config: Config, is_global: bool) -> Config {
    if config.version < CONFIG_VERSION {
        // Perform migrations based on version
        if config.version < 1 {
            // Migrate from version 0 to 1
            if !is_global {
                config.previous_files = Vec::new();
            }
            config.version = 1;
        }

        if config.version < 2 {
            // Migrate from version 1 to 2
            config.show_ignored_in_tree = false;
            config.show_default_ignored_in_tree = false;
            config.version = 2;
        }

        // Add more migration steps here as needed
    }

    config
}

/// Get the path to the session state file using app_handle
fn get_session_state_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let config_dir = app_handle.path().app_config_dir().map_err(|e| {
        AppError::Config(format!("Could not determine app config directory: {}", e))
    })?;
    // Ensure the directory exists
    fs::create_dir_all(&config_dir)
        .map_err(|e| AppError::Config(format!("Could not create config directory: {}", e)))?;
    Ok(config_dir.join(SESSION_STATE_FILE))
}

/// Load session state from file
pub fn load_session_state(app_handle: &tauri::AppHandle) -> Result<SessionState, AppError> {
    let path = get_session_state_path(app_handle)?;
    if !path.exists() {
        return Ok(SessionState::default()); // Return default if file doesn't exist
    }
    let content = fs::read_to_string(&path).map_err(AppError::Io)?; // Use shorthand
    serde_json::from_str(&content).map_err(|e| AppError::Json(e.to_string()))
}

/// Save session state to file
pub fn save_session_state(
    app_handle: &tauri::AppHandle,
    state: &SessionState,
) -> Result<(), AppError> {
    let path = get_session_state_path(app_handle)?;
    let content = serde_json::to_string_pretty(state).map_err(|e| AppError::Json(e.to_string()))?;
    fs::write(&path, content).map_err(AppError::Io) // Use shorthand
}
