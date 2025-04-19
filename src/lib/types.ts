// Types
export interface DirectoryItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_selected: boolean;
  children: DirectoryItem[];
}

export interface Config {
  version: number;
  use_git_ignore: boolean;
  include_file_types: string;
  exclude_file_types: string[];
  output_file: string;
  save_output_file: boolean;
  output_file_locally: boolean;
  copy_to_clipboard: boolean;
  safe_mode: boolean;
  store_files_chosen: boolean;
  line_numbers: boolean;
  show_ignored_in_tree: boolean;
  show_default_ignored_in_tree: boolean;
  previous_files: string[];
}

export interface OutputContent {
  tree_structure: string;
  combined_content: string;
  file_details: FileDetail[];
  token_estimate: number;
  saved_path?: string | null;
}

export interface AppError {
  message: string;
}

export interface FileDetail {
  path: string;
  tokens: number;
}