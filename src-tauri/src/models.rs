use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Current version of the configuration file format
pub const CONFIG_VERSION: u32 = 2;

/// Default constants
pub const DEFAULT_IGNORES: [&str; 6] = [
    ".git",
    ".vscode",
    "__pycache__",
    ".DS_Store",
    ".idea",
    ".gitignore",
];

pub const SAFE_MODE_MAX_FILES: usize = 30;
pub const SAFE_MODE_MAX_LENGTH: usize = 100_000; // ~25K tokens

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: u32,
    pub use_git_ignore: bool,
    pub include_file_types: String,
    pub exclude_file_types: Vec<String>,
    pub output_file: String,
    pub output_file_locally: bool,
    pub copy_to_clipboard: bool,
    pub safe_mode: bool,
    pub store_files_chosen: bool,
    pub line_numbers: bool,
    pub show_ignored_in_tree: bool,
    pub show_default_ignored_in_tree: bool,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub previous_files: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_directory: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            use_git_ignore: true,
            include_file_types: "*".to_string(),
            exclude_file_types: Vec::new(),
            output_file: "gptree_output.txt".to_string(),
            output_file_locally: true,
            copy_to_clipboard: false,
            safe_mode: true,
            store_files_chosen: true,
            line_numbers: false,
            show_ignored_in_tree: false,
            show_default_ignored_in_tree: false,
            previous_files: Vec::new(),
            last_directory: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_selected: bool,
    pub children: Vec<DirectoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeStructure {
    pub tree_text: String,
    pub file_list: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputContent {
    pub combined_content: String,
    pub selected_files: Vec<String>,
    pub estimated_tokens: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Safe mode error: {0}")]
    SafeMode(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Path not found: {0}")]
    PathNotFound(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
