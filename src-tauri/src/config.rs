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
    println!(
        "[GPTree] Attempting to save {} config to: {:?}",
        if is_global { "global" } else { "local" },
        config_path
    );

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        if !parent.exists() {
            match std::fs::create_dir_all(parent) {
                Ok(_) => println!("[GPTree] Created parent directory: {:?}", parent),
                Err(e) => {
                    let err_msg = format!("Failed to create parent directory: {}", e);
                    println!("[GPTree] Error: {}", err_msg);
                    return Err(AppError::Config(err_msg));
                }
            }
        }
    }

    // Attempt to create and write to the file
    let file_result = File::create(config_path);

    match file_result {
        Ok(mut file) => {
            println!("[GPTree] Successfully opened file for writing");

            // Write the config data
            let write_result = writeln!(
                file,
                "# GPTree {} Config",
                if is_global { "Global" } else { "Local" }
            )
            .and_then(|_| writeln!(file, "version: {}", config.version))
            .and_then(|_| writeln!(file, "# Whether to use .gitignore"))
            .and_then(|_| writeln!(file, "useGitIgnore: {}", config.use_git_ignore))
            .and_then(|_| writeln!(file, "# File types to include (e.g., .py,.js)"))
            .and_then(|_| writeln!(file, "includeFileTypes: {}", config.include_file_types))
            .and_then(|_| writeln!(file, "# File types to exclude when includeFileTypes is '*'"))
            .and_then(|_| writeln!(
                file,
                "excludeFileTypes: {}",
                config.exclude_file_types.join(",")
            ))
            .and_then(|_| writeln!(file, "# Output file name"))
            .and_then(|_| writeln!(file, "outputFile: {}", config.output_file))
            .and_then(|_| writeln!(file, "# Whether to save the output file at all"))
            .and_then(|_| writeln!(file, "saveOutputFile: {}", config.save_output_file))
            .and_then(|_| writeln!(
                file,
                "# Whether to output the file locally or relative to the project directory"
            ))
            .and_then(|_| writeln!(file, "outputFileLocally: {}", config.output_file_locally))
            .and_then(|_| writeln!(file, "# Whether to copy the output to the clipboard"))
            .and_then(|_| writeln!(file, "copyToClipboard: {}", config.copy_to_clipboard))
            .and_then(|_| writeln!(
                file,
                "# Whether to use safe mode (prevent overly large files from being combined)"
            ))
            .and_then(|_| writeln!(file, "safeMode: {}", config.safe_mode))
            .and_then(|_| writeln!(
                file,
                "# Whether to store the files chosen in the config file (--save, -s)"
            ))
            .and_then(|_| writeln!(file, "storeFilesChosen: {}", config.store_files_chosen))
            .and_then(|_| writeln!(
                file,
                "# Whether to include line numbers in the output (--line-numbers, -n)"
            ))
            .and_then(|_| writeln!(file, "lineNumbers: {}", config.line_numbers))
            .and_then(|_| writeln!(
                file,
                "# Whether to show ignored files in the directory tree"
            ))
            .and_then(|_| writeln!(file, "showIgnoredInTree: {}", config.show_ignored_in_tree))
            .and_then(|_| writeln!(file, "# Whether to show only default ignored files in the directory tree while still respecting gitignore"))
            .and_then(|_| writeln!(
                file,
                "showDefaultIgnoredInTree: {}",
                config.show_default_ignored_in_tree
            ));

            // Add previous files only for local config
            if !is_global {
                let previous_files_result = writeln!(
                    file,
                    "# Previously selected files (when using the -s or --save flag previously)"
                )
                .and_then(|_| writeln!(file, "previousFiles: {}", config.previous_files.join(",")));

                if let Err(e) = previous_files_result {
                    let err_msg = format!("Failed to write previous files to config file: {}", e);
                    println!("[GPTree] Error: {}", err_msg);
                    return Err(AppError::Config(err_msg));
                }
            }

            match write_result {
                Ok(_) => {
                    println!("[GPTree] Successfully wrote config to file");
                    Ok(())
                }
                Err(e) => {
                    let err_msg = format!("Failed to write to config file: {}", e);
                    println!("[GPTree] Error: {}", err_msg);
                    Err(AppError::Config(err_msg))
                }
            }
        }
        Err(e) => {
            let err_msg = format!("Failed to create config file: {}", e);
            println!("[GPTree] Error: {}", err_msg);

            // If we couldn't open the file, run the diagnostics
            let diagnosis = diagnose_config_file_access(config_path);
            println!("[GPTree] File diagnostics:\n{}", diagnosis);

            Err(AppError::Config(err_msg))
        }
    }
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

/// Helper function to ensure a config is properly saved
/// Returns the path where the config was saved if successful
pub fn ensure_config_saved(
    config: &Config,
    is_global: bool,
    current_dir: Option<&Path>,
) -> Result<PathBuf, AppError> {
    let config_path = if is_global {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| AppError::Config("Could not find home directory".to_string()))?;
        home_dir.join(GLOBAL_CONFIG_FILE)
    } else {
        if let Some(dir) = current_dir {
            dir.join(PROJECT_CONFIG_FILE)
        } else {
            return Err(AppError::Config(
                "Current directory required for local config".to_string(),
            ));
        }
    };

    // Ensure parent directory exists (should always be the case but just to be safe)
    if let Some(parent) = config_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::Config(format!("Failed to create config directory: {}", e))
            })?;
        }
    }

    // Save the config
    save_config(&config_path, config, is_global)?;

    Ok(config_path)
}

/// Helper function to diagnose config file permissions
/// Returns a diagnostic message about the file path and permissions
pub fn diagnose_config_file_access(file_path: &Path) -> String {
    let mut result = format!("Path: {:?}\n", file_path);

    // Check if file exists
    if file_path.exists() {
        result.push_str("File exists: Yes\n");

        // Check if we can read it
        match std::fs::metadata(file_path) {
            Ok(metadata) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let permissions = metadata.permissions();
                    let mode = permissions.mode();
                    result.push_str(&format!("Permissions (octal): {:o}\n", mode));

                    // Interpret the permission bits
                    let read = mode & 0o400 != 0;
                    let write = mode & 0o200 != 0;
                    result.push_str(&format!("User read: {}, User write: {}\n", read, write));
                }

                #[cfg(not(unix))]
                {
                    let permissions = metadata.permissions();
                    result.push_str(&format!("Permissions: {:?}\n", permissions));
                    result.push_str(&format!("Read-only: {}\n", permissions.readonly()));
                }
            }
            Err(e) => {
                result.push_str(&format!("Error getting metadata: {}\n", e));
            }
        }

        // Try to read the file
        match std::fs::read_to_string(file_path) {
            Ok(_) => result.push_str("Can read file: Yes\n"),
            Err(e) => result.push_str(&format!("Can read file: No - {}\n", e)),
        }

        // Try to write to a temporary file in the same directory
        if let Some(parent) = file_path.parent() {
            let temp_path = parent.join("gptree_test_write.tmp");
            match std::fs::write(&temp_path, "test") {
                Ok(_) => {
                    result.push_str(&format!("Can write to directory: Yes\n"));
                    // Clean up
                    let _ = std::fs::remove_file(&temp_path);
                }
                Err(e) => result.push_str(&format!("Can write to directory: No - {}\n", e)),
            }
        } else {
            result.push_str("File has no parent directory\n");
        }
    } else {
        result.push_str("File exists: No\n");

        // Check if parent directory exists and is writable
        if let Some(parent) = file_path.parent() {
            if parent.exists() {
                result.push_str(&format!("Parent directory exists: Yes\n"));

                // Try to write to a temporary file in the parent directory
                let temp_path = parent.join("gptree_test_write.tmp");
                match std::fs::write(&temp_path, "test") {
                    Ok(_) => {
                        result.push_str(&format!("Can write to parent directory: Yes\n"));
                        // Clean up
                        let _ = std::fs::remove_file(&temp_path);
                    }
                    Err(e) => {
                        result.push_str(&format!("Can write to parent directory: No - {}\n", e))
                    }
                }
            } else {
                result.push_str(&format!("Parent directory exists: No\n"));
            }
        } else {
            result.push_str("File has no parent directory\n");
        }
    }

    result
}
