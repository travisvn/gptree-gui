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
) -> Result<TreeStructure, AppError> {
    // Load gitignore if requested
    let gitignore = if use_gitignore {
        load_gitignore(root_dir)?.and_then(|builder| builder.build().ok())
    } else {
        None
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
                if show_ignored {
                    true
                } else {
                    let rel_path = entry.strip_prefix(root_dir).unwrap_or(entry);
                    let should_ignore = if let Some(gitignore) = gitignore {
                        gitignore.matched(entry, entry.is_dir()).is_ignore()
                    } else {
                        false
                    };

                    let is_default_ignored = is_default_ignored(entry);

                    // Logic for filtering:
                    // - If show_default_ignored is true, we keep default ignored items but still filter gitignore items
                    // - Otherwise we filter out both gitignore and default ignored items
                    if show_default_ignored {
                        !should_ignore
                    } else {
                        !should_ignore && !is_default_ignored
                    }
                }
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
    content
        .lines()
        .enumerate()
        .map(|(i, line)| format!("{:4} | {}", i + 1, line))
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
) -> Result<DirectoryItem, AppError> {
    // Load gitignore if requested
    let gitignore = if use_gitignore {
        load_gitignore(root_dir)?.and_then(|builder| builder.build().ok())
    } else {
        None
    };

    let root_name = root_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(".")
        .to_string();

    let mut root_item = DirectoryItem {
        name: root_name,
        path: root_dir.to_string_lossy().to_string(),
        is_dir: true,
        is_selected: false,
        children: Vec::new(),
    };

    // Build the tree recursively
    fn build_dir_tree(
        dir_path: &Path,
        root_dir: &Path,
        parent_item: &mut DirectoryItem,
        gitignore: &Option<ignore::gitignore::Gitignore>,
        show_ignored: bool,
        show_default_ignored: bool,
    ) -> Result<(), AppError> {
        let entries = fs::read_dir(dir_path)?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .collect::<Vec<PathBuf>>();

        // Filter and sort entries
        let mut items: Vec<PathBuf> = entries
            .into_iter()
            .filter(|entry| {
                if show_ignored {
                    true
                } else {
                    let should_ignore = if let Some(gitignore) = gitignore {
                        gitignore.matched(entry, entry.is_dir()).is_ignore()
                    } else {
                        false
                    };

                    let is_default_ignored = is_default_ignored(entry);

                    if show_default_ignored {
                        !should_ignore
                    } else {
                        !should_ignore && !is_default_ignored
                    }
                }
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

            let mut item = DirectoryItem {
                name: item_name,
                path: item_path.to_string_lossy().to_string(),
                is_dir: is_directory,
                is_selected: false,
                children: Vec::new(),
            };

            if is_directory {
                build_dir_tree(
                    &item_path,
                    root_dir,
                    &mut item,
                    gitignore,
                    show_ignored,
                    show_default_ignored,
                )?;
            }

            parent_item.children.push(item);
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
    )?;

    Ok(root_item)
}

/// Estimate the number of tokens in a text
/// Uses a simple approximation of 4 characters per token
pub fn estimate_tokens(text: &str) -> usize {
    text.len() / 4
}
