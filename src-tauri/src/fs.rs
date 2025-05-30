use crate::models::{AppError, DirectoryItem, TreeStructure, DEFAULT_IGNORES};
use ignore::{Walk, WalkBuilder};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

/// Checks if a file or directory should be ignored based on default ignores
pub fn is_default_ignored(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");

    DEFAULT_IGNORES.contains(&file_name)
        || path.components().any(|comp| {
            comp.as_os_str()
                .to_str()
                .map(|s| DEFAULT_IGNORES.contains(&s))
                .unwrap_or(false)
        })
}

/// Load gitignore patterns from the root directory or its parents
pub fn load_gitignore(
    root_dir: &Path,
) -> Result<Option<ignore::gitignore::GitignoreBuilder>, AppError> {
    let mut current_dir = PathBuf::from(root_dir);

    while current_dir != current_dir.parent().unwrap_or(&current_dir) {
        let gitignore_path = current_dir.join(".gitignore");
        if gitignore_path.exists() {
            let mut builder = ignore::gitignore::GitignoreBuilder::new(&current_dir);
            builder.add(&gitignore_path);
            return Ok(Some(builder));
        }
        if let Some(parent) = current_dir.parent() {
            current_dir = parent.to_path_buf();
        } else {
            break;
        }
    }

    Ok(None)
}

/// Generate a tree structure representation of a directory
pub fn generate_tree_structure(
    root_dir: &Path,
    use_gitignore: bool,
    show_ignored: bool,
    show_default_ignored: bool,
    include_file_types: &str,
    exclude_file_types: &str,
    excluded_dirs: &HashSet<String>,
) -> Result<TreeStructure, AppError> {
    // Load gitignore if requested
    let gitignore = if use_gitignore {
        load_gitignore(root_dir)?.and_then(|builder| builder.build().ok())
    } else {
        None
    };

    // Parse include_file_types into a set of extensions
    let include_all = include_file_types == "*";
    let included_extensions: HashSet<String> = if !include_all {
        include_file_types
            .split(',')
            .map(|ext| ext.trim().to_lowercase())
            .filter(|ext| !ext.is_empty())
            .collect()
    } else {
        HashSet::new() // Empty set when including all file types
    };

    // Convert exclude_file_types to a set for efficient lookups
    let excluded_extensions: HashSet<String> = exclude_file_types
        .split(',')
        .map(|ext| ext.trim().to_lowercase())
        .filter(|ext| !ext.is_empty())
        .collect();

    // Helper function to check if a file should be included based on its extension
    let should_include_file = |path: &Path| -> bool {
        if path.is_dir() {
            return true; // Always include directories in the tree
        }

        if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
            let ext = format!(".{}", extension.to_lowercase());
            if include_all {
                !excluded_extensions.contains(&ext)
            } else {
                included_extensions.contains(&ext)
            }
        } else {
            // Files without extensions
            include_all // Include only if we're including all files
        }
    };

    let mut tree_lines = vec![".".to_string()];
    let mut file_list = Vec::new();

    // Generate the tree structure recursively
    fn build_tree(
        dir_path: &Path,
        root_dir: &Path,
        indent_prefix: &str,
        tree_lines: &mut Vec<String>,
        file_list: &mut Vec<String>,
        gitignore: &Option<ignore::gitignore::Gitignore>,
        show_ignored: bool,
        show_default_ignored: bool,
        should_include_file: &dyn Fn(&Path) -> bool,
        excluded_dirs: &HashSet<String>,
    ) -> Result<(), AppError> {
        // Get directory entries
        let entries = fs::read_dir(dir_path)?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .collect::<Vec<PathBuf>>();

        // Filter and sort entries
        let mut items: Vec<PathBuf> = entries
            .into_iter()
            .filter(|entry| {
                // Always include directories for tree structure
                if entry.is_dir() {
                    // Check if directory is in excluded_dirs
                    let relative_path_to_check = entry
                        .strip_prefix(root_dir)
                        .unwrap_or(entry)
                        .to_string_lossy()
                        .into_owned();
                    if excluded_dirs.contains(&relative_path_to_check) {
                        return false; // Skip this directory and its children
                    }

                    if show_ignored {
                        return true;
                    } else {
                        let should_ignore = if let Some(gitignore) = gitignore {
                            gitignore.matched(entry, true).is_ignore()
                        } else {
                            false
                        };

                        let is_default_ignored = is_default_ignored(entry);

                        if show_default_ignored {
                            return !should_ignore;
                        } else {
                            return !should_ignore && !is_default_ignored;
                        }
                    }
                }

                // For files, apply both gitignore and extension filters
                let passes_gitignore = if show_ignored {
                    true
                } else {
                    let should_ignore = if let Some(gitignore) = gitignore {
                        gitignore.matched(entry, false).is_ignore()
                    } else {
                        false
                    };

                    let is_default_ignored = is_default_ignored(entry);

                    if show_default_ignored {
                        !should_ignore
                    } else {
                        !should_ignore && !is_default_ignored
                    }
                };

                // Only apply file type filtering if the file passes the gitignore filter
                passes_gitignore && should_include_file(entry)
            })
            .collect();

        // Sort items (directories first, then alphabetically)
        items.sort_by(|a, b| {
            let a_is_dir = a.is_dir();
            let b_is_dir = b.is_dir();
            if a_is_dir && !b_is_dir {
                std::cmp::Ordering::Less
            } else if !a_is_dir && b_is_dir {
                std::cmp::Ordering::Greater
            } else {
                a.file_name()
                    .unwrap_or_default()
                    .cmp(b.file_name().unwrap_or_default())
            }
        });

        let num_items = items.len();

        for (index, item_path) in items.into_iter().enumerate() {
            let is_last_item = index == num_items - 1;
            let is_directory = item_path.is_dir();

            // Get item name for display
            let item_display_name = item_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_string();

            // Append "/" for directories
            let display_name = if is_directory {
                format!("{}/", item_display_name)
            } else {
                item_display_name
            };

            // Connector: └── for last item, ├── otherwise
            let connector = if is_last_item {
                "└── "
            } else {
                "├── "
            };
            let line_prefix = format!("{}{}", indent_prefix, connector);

            tree_lines.push(format!("{}{}", line_prefix, display_name));

            if is_directory {
                // Indentation for subdirectories: '    ' if last item, '│   ' otherwise
                let new_indent_prefix = format!(
                    "{}{}",
                    indent_prefix,
                    if is_last_item { "    " } else { "│   " }
                );
                build_tree(
                    &item_path,
                    root_dir,
                    &new_indent_prefix,
                    tree_lines,
                    file_list,
                    gitignore,
                    show_ignored,
                    show_default_ignored,
                    should_include_file,
                    excluded_dirs,
                )?;
            } else if item_path.is_file() {
                file_list.push(item_path.to_string_lossy().into_owned());
            }
        }

        Ok(())
    }

    build_tree(
        root_dir,
        root_dir,
        "",
        &mut tree_lines,
        &mut file_list,
        &gitignore,
        show_ignored,
        show_default_ignored,
        &should_include_file,
        excluded_dirs,
    )?;

    Ok(TreeStructure {
        tree_text: tree_lines.join("\n"),
        file_list,
    })
}

/// Read the content of a file
pub fn read_file_content(file_path: &Path) -> Result<String, AppError> {
    let mut file = File::open(file_path)
        .map_err(|_| AppError::PathNotFound(file_path.to_string_lossy().to_string()))?;

    let mut content = String::new();
    file.read_to_string(&mut content)?;

    Ok(content)
}

/// Add line numbers to content
pub fn add_line_numbers(content: &str) -> String {
    let lines_vec: Vec<&str> = content.lines().collect();
    let num_lines = lines_vec.len();

    if num_lines == 0 {
        return String::new();
    }

    // Calculate the width needed for line numbers.
    // e.g., num_lines = 9   => width = 1
    //       num_lines = 10  => width = 2
    //       num_lines = 99  => width = 2
    //       num_lines = 100 => width = 3
    let width = (num_lines as f64).log10().floor() as usize + 1;

    lines_vec
        .into_iter()
        .enumerate()
        .map(|(i, line)| {
            format!(
                "{number:>width$} | {text}",
                number = i + 1,
                width = width,
                text = line
            )
        })
        .collect::<Vec<String>>()
        .join("\n")
}

/// Save content to a file
pub fn save_to_file(file_path: &Path, content: &str) -> Result<(), AppError> {
    let mut file = File::create(file_path)?;
    file.write_all(content.as_bytes())?;
    Ok(())
}

/// Convert directory to a hierarchical tree of DirectoryItem structs for the UI
pub fn get_directory_tree(
    root_dir: &Path,
    use_gitignore: bool,
    show_ignored: bool,
    show_default_ignored: bool,
    include_file_types: &str,
    exclude_file_types: &str,
    excluded_dirs_config: &HashSet<String>,
) -> Result<DirectoryItem, AppError> {
    // Load gitignore if requested
    let gitignore = if use_gitignore {
        load_gitignore(root_dir)?.and_then(|builder| builder.build().ok())
    } else {
        None
    };

    // Parse include_file_types into a set of extensions
    let include_all = include_file_types == "*";
    let included_extensions: HashSet<String> = if !include_all {
        include_file_types
            .split(',')
            .map(|ext| ext.trim().to_lowercase())
            .filter(|ext| !ext.is_empty())
            .collect()
    } else {
        HashSet::new() // Empty set when including all file types
    };

    // Convert exclude_file_types to a set for efficient lookups
    let excluded_extensions: HashSet<String> = exclude_file_types
        .split(',')
        .map(|ext| ext.trim().to_lowercase())
        .filter(|ext| !ext.is_empty())
        .collect();

    // Helper function to check if a file should be included based on its extension
    let should_include_file_for_ui = |path: &Path| -> bool {
        if path.is_dir() {
            // For directories, we generally include them if they pass gitignore/default ignore checks.
            // The `is_excluded_by_config` flag will handle the visual cue for excluded dirs.
            return true;
        }
        if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
            let ext = format!(".{}", extension.to_lowercase());
            if include_all {
                !excluded_extensions.contains(&ext)
            } else {
                included_extensions.contains(&ext)
            }
        } else {
            include_all
        }
    };

    let root_name = root_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(".")
        .to_string();

    let mut root_item = DirectoryItem {
        name: root_name.clone(), // Clone root_name
        path: root_dir.to_string_lossy().to_string(),
        is_dir: true,
        is_selected: false,
        children: Vec::new(),
        is_excluded_by_config: excluded_dirs_config.contains(&"".to_string()), // Root cannot be excluded this way
    };

    // Build the tree recursively
    fn build_dir_tree(
        dir_path: &Path,
        root_dir: &Path,
        parent_item: &mut DirectoryItem,
        gitignore: &Option<ignore::gitignore::Gitignore>,
        show_ignored: bool,
        show_default_ignored: bool,
        should_include_file_for_ui: &dyn Fn(&Path) -> bool,
        excluded_dirs_config: &HashSet<String>,
    ) -> Result<(), AppError> {
        let entries = fs::read_dir(dir_path)?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .collect::<Vec<PathBuf>>();

        // Filter and sort entries
        let mut items: Vec<PathBuf> = entries
            .into_iter()
            .filter(|entry| {
                // For get_directory_tree (UI): DO NOT filter out dirs from excluded_dirs_config here.
                // We mark them with is_excluded_by_config instead.
                // Original logic for gitignore and default ignores still applies.
                if entry.is_dir() {
                    if show_ignored {
                        return true;
                    }
                    let should_ignore_git = if let Some(gi) = gitignore {
                        gi.matched(entry, true).is_ignore()
                    } else {
                        false
                    };
                    let is_default = is_default_ignored(entry);
                    if show_default_ignored {
                        return !should_ignore_git;
                    }
                    return !should_ignore_git && !is_default;
                }

                // For files, apply gitignore and extension filters
                let passes_gitignore = if show_ignored {
                    true
                } else {
                    let should_ignore_git = if let Some(gi) = gitignore {
                        gi.matched(entry, false).is_ignore()
                    } else {
                        false
                    };
                    let is_default = is_default_ignored(entry);
                    if show_default_ignored {
                        !should_ignore_git
                    } else {
                        !should_ignore_git && !is_default
                    }
                };
                passes_gitignore && should_include_file_for_ui(entry)
            })
            .collect();

        // Sort items (directories first, then alphabetically)
        items.sort_by(|a, b| {
            let a_is_dir = a.is_dir();
            let b_is_dir = b.is_dir();
            if a_is_dir && !b_is_dir {
                std::cmp::Ordering::Less
            } else if !a_is_dir && b_is_dir {
                std::cmp::Ordering::Greater
            } else {
                a.file_name()
                    .unwrap_or_default()
                    .cmp(b.file_name().unwrap_or_default())
            }
        });

        for item_path in items {
            let is_directory = item_path.is_dir();
            let item_name = item_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_string();

            let relative_path_str = item_path
                .strip_prefix(root_dir) // Calculate relative path
                .unwrap_or(&item_path) // Fallback to absolute if strip fails (should not happen for children)
                .to_string_lossy()
                .into_owned();

            let mut item = DirectoryItem {
                name: item_name,
                path: item_path.to_string_lossy().to_string(),
                is_dir: is_directory,
                is_selected: false,
                children: Vec::new(),
                is_excluded_by_config: if is_directory {
                    excluded_dirs_config.contains(&relative_path_str)
                } else {
                    false
                },
            };

            if is_directory {
                build_dir_tree(
                    &item_path,
                    root_dir,
                    &mut item,
                    gitignore,
                    show_ignored,
                    show_default_ignored,
                    should_include_file_for_ui,
                    excluded_dirs_config,
                )?;
                // Add directory to parent's children if it's not empty OR it's explicitly excluded by config (so user can see and potentially un-exclude it)
                if !item.children.is_empty() || item.is_excluded_by_config {
                    parent_item.children.push(item);
                }
            } else {
                parent_item.children.push(item);
            }
        }
        Ok(())
    }

    build_dir_tree(
        root_dir,
        root_dir,
        &mut root_item,
        &gitignore,
        show_ignored,
        show_default_ignored,
        &should_include_file_for_ui,
        excluded_dirs_config,
    )?;

    Ok(root_item)
}

/// Estimate the number of tokens in a text
/// Uses a simple approximation of 4 characters per token
pub fn estimate_tokens(text: &str) -> usize {
    text.len() / 4
}
