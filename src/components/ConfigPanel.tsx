import React, { useState } from 'react';

interface Config {
  version: number;
  use_git_ignore: boolean;
  include_file_types: string;
  exclude_file_types: string[];
  output_file: string;
  output_file_locally: boolean;
  copy_to_clipboard: boolean;
  safe_mode: boolean;
  store_files_chosen: boolean;
  line_numbers: boolean;
  show_ignored_in_tree: boolean;
  show_default_ignored_in_tree: boolean;
  previous_files: string[];
}

interface ConfigPanelProps {
  config: Config;
  onConfigUpdate: (config: Config) => void;
  disabled: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onConfigUpdate, disabled }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleChange = (field: keyof Config, value: any) => {
    const newConfig = { ...config, [field]: value };
    onConfigUpdate(newConfig);
  };

  const handleExcludeFileTypesChange = (value: string) => {
    const fileTypes = value
      .split(',')
      .map(type => type.trim())
      .filter(type => type.length > 0);

    handleChange('exclude_file_types', fileTypes);
  };

  return (
    <div className="config-panel">
      <div className="config-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>Configuration {isExpanded ? '▼' : '►'}</h3>
      </div>

      {isExpanded && (
        <div className="config-content">
          <div className="config-section">
            <h4>File Selection</h4>

            <div className="config-option">
              <input
                type="checkbox"
                id="use-git-ignore"
                checked={config.use_git_ignore}
                onChange={(e) => handleChange('use_git_ignore', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="use-git-ignore">Respect .gitignore</label>
            </div>

            <div className="config-option">
              <input
                type="checkbox"
                id="show-ignored-in-tree"
                checked={config.show_ignored_in_tree}
                onChange={(e) => handleChange('show_ignored_in_tree', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="show-ignored-in-tree">Show ignored files in tree</label>
            </div>

            <div className="config-option">
              <input
                type="checkbox"
                id="show-default-ignored-in-tree"
                checked={config.show_default_ignored_in_tree}
                onChange={(e) => handleChange('show_default_ignored_in_tree', e.target.checked)}
                disabled={disabled || config.show_ignored_in_tree}
              />
              <label htmlFor="show-default-ignored-in-tree">
                Show default ignored files in tree (still respect .gitignore)
              </label>
            </div>
          </div>

          <div className="config-section">
            <h4>File Types</h4>

            <div className="config-option">
              <label htmlFor="include-file-types">Include file types:</label>
              <input
                type="text"
                id="include-file-types"
                value={config.include_file_types}
                onChange={(e) => handleChange('include_file_types', e.target.value)}
                placeholder="* for all, or .py,.js,..."
                disabled={disabled}
              />
            </div>

            <div className="config-option">
              <label htmlFor="exclude-file-types">Exclude file types:</label>
              <input
                type="text"
                id="exclude-file-types"
                value={config.exclude_file_types.join(',')}
                onChange={(e) => handleExcludeFileTypesChange(e.target.value)}
                placeholder=".log,.tmp,..."
                disabled={disabled}
              />
            </div>
          </div>

          <div className="config-section">
            <h4>Output Options</h4>

            <div className="config-option">
              <label htmlFor="output-file">Output file name:</label>
              <input
                type="text"
                id="output-file"
                value={config.output_file}
                onChange={(e) => handleChange('output_file', e.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="config-option">
              <input
                type="checkbox"
                id="output-file-locally"
                checked={config.output_file_locally}
                onChange={(e) => handleChange('output_file_locally', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="output-file-locally">Save output in current working directory</label>
            </div>

            <div className="config-option">
              <input
                type="checkbox"
                id="copy-to-clipboard"
                checked={config.copy_to_clipboard}
                onChange={(e) => handleChange('copy_to_clipboard', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="copy-to-clipboard">Automatically copy to clipboard</label>
            </div>

            <div className="config-option">
              <input
                type="checkbox"
                id="line-numbers"
                checked={config.line_numbers}
                onChange={(e) => handleChange('line_numbers', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="line-numbers">Include line numbers</label>
            </div>
          </div>

          <div className="config-section">
            <h4>Safety & Storage</h4>

            <div className="config-option">
              <input
                type="checkbox"
                id="safe-mode"
                checked={config.safe_mode}
                onChange={(e) => handleChange('safe_mode', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="safe-mode">
                Safe mode (prevent processing too many files or large files)
              </label>
            </div>

            <div className="config-option">
              <input
                type="checkbox"
                id="store-files-chosen"
                checked={config.store_files_chosen}
                onChange={(e) => handleChange('store_files_chosen', e.target.checked)}
                disabled={disabled}
              />
              <label htmlFor="store-files-chosen">Remember file selection</label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel; 