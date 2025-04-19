import React, { useState } from 'react';
import { Bug, CaretDown, CaretRight } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { debugEnabledAtom } from '../lib/store/atoms';

interface Config {
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

interface ConfigPanelProps {
  config: Config;
  onConfigUpdate: (config: Config) => void;
  disabled: boolean;
  className?: string;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onConfigUpdate, disabled, className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [debugEnabled, setDebugEnabled] = useAtom(debugEnabledAtom);

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
    <div
      className={`config-panel border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] overflow-hidden ${className}`}
    >
      <div
        className="config-header flex items-center justify-between cursor-pointer p-3 select-none font-semibold"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-base m-0">Configuration</h3>
        {isExpanded ? <CaretDown size={18} /> : <CaretRight size={18} />}
      </div>

      <div
        className={`config-content overflow-y-auto transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[50vh] opacity-100 p-3 pt-2' : 'max-h-0 opacity-0 p-0'
          } relative`}
      >
        <div className='absolute top-0 right-0 p-2'>
          <span
            data-tooltip-id={"app-tooltip"}
            data-tooltip-content={debugEnabled ? 'Disable debug mode' : 'Enable debug mode'}
            className={debugEnabled ? 'cursor-not-allowed' : ''}
          >
            <button
              className='bg-error text-white px-2 py-1 rounded-md'

              onClick={() => {
                // sendSignal('log', { message: 'test', level: 'info' });
                setDebugEnabled(prev => !prev);
              }}
            >
              <Bug size={18} />
            </button>
          </span>
        </div>
        <div className="config-section mb-4 pb-2">
          <h4 className="text-sm font-medium text-[--light-text] mb-2">File Selection</h4>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="use-git-ignore"
              checked={config.use_git_ignore}
              onChange={(e) => handleChange('use_git_ignore', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="use-git-ignore" className="cursor-pointer">Respect .gitignore</label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="show-ignored-in-tree"
              checked={config.show_ignored_in_tree}
              onChange={(e) => handleChange('show_ignored_in_tree', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="show-ignored-in-tree" className="cursor-pointer">Show ignored files in tree</label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="show-default-ignored-in-tree"
              checked={config.show_default_ignored_in_tree}
              onChange={(e) => handleChange('show_default_ignored_in_tree', e.target.checked)}
              disabled={disabled || config.show_ignored_in_tree}
              className="cursor-pointer disabled:opacity-50"
            />
            <label htmlFor="show-default-ignored-in-tree" className="cursor-pointer">
              Show default ignored files (respects .gitignore)
            </label>
          </div>
        </div>

        <div className="config-section mb-4 pb-2">
          <h4 className="text-sm font-medium text-[--light-text] mb-2">File Types</h4>
          <div className="config-option flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
            <label htmlFor="include-file-types" className="flex-shrink-0 mb-1 sm:mb-0">Include types:</label>
            <input
              type="text"
              id="include-file-types"
              value={config.include_file_types}
              onChange={(e) => handleChange('include_file_types', e.target.value)}
              placeholder="* for all, or .py,.js,..."
              disabled={disabled}
              className="w-full"
            />
          </div>
          <div className="config-option flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
            <label htmlFor="exclude-file-types" className="flex-shrink-0 mb-1 sm:mb-0">Exclude types:</label>
            <input
              type="text"
              id="exclude-file-types"
              value={config.exclude_file_types.join(',')}
              onChange={(e) => handleExcludeFileTypesChange(e.target.value)}
              placeholder=".log,.tmp,..."
              disabled={disabled}
              className="w-full"
            />
          </div>
        </div>

        <div className="config-section mb-4 pb-2">
          <h4 className="text-sm font-medium text-[--light-text] mb-2">Output Options</h4>
          <div className="config-option flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
            <label htmlFor="output-file" className="flex-shrink-0 mb-1 sm:mb-0">Output file name:</label>
            <input
              type="text"
              id="output-file"
              value={config.output_file}
              onChange={(e) => handleChange('output_file', e.target.value)}
              disabled={disabled}
              className="w-full"
            />
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="save-output-file"
              checked={config.save_output_file}
              onChange={(e) => handleChange('save_output_file', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="save-output-file" className="cursor-pointer">Save output file</label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="output-file-locally"
              checked={config.output_file_locally}
              onChange={(e) => handleChange('output_file_locally', e.target.checked)}
              disabled={disabled || !config.save_output_file}
              className="cursor-pointer disabled:opacity-50"
            />
            <label htmlFor="output-file-locally" className={`cursor-pointer ${!config.save_output_file ? 'opacity-50' : ''}`}>Save output in current working directory</label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="copy-to-clipboard"
              checked={config.copy_to_clipboard}
              onChange={(e) => handleChange('copy_to_clipboard', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="copy-to-clipboard" className="cursor-pointer">Auto-copy to clipboard</label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="line-numbers"
              checked={config.line_numbers}
              onChange={(e) => handleChange('line_numbers', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="line-numbers" className="cursor-pointer">Include line numbers</label>
          </div>
        </div>

        <div className="config-section mb-0 pb-0">
          <h4 className="text-sm font-medium text-[--light-text] mb-2">Safety & Storage</h4>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="safe-mode"
              checked={config.safe_mode}
              onChange={(e) => handleChange('safe_mode', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="safe-mode" className="cursor-pointer">
              Safe mode (limit file count/size)
            </label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="store-files-chosen"
              checked={config.store_files_chosen}
              onChange={(e) => handleChange('store_files_chosen', e.target.checked)}
              disabled={disabled}
              className="cursor-pointer"
            />
            <label htmlFor="store-files-chosen" className="cursor-pointer">Remember file selection</label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel; 