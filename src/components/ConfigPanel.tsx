import React, { useState } from 'react';
import { Bug, CaretDown, CaretRight, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { debugEnabledAtom } from '../lib/store/atoms';
import { type Config as ConfigType } from '../lib/types'; // Import Config type
import { cn } from '../lib/utils'; // Assuming cn is utility for classnames
import { Input } from './ui/input';

interface ConfigPanelProps {
  config: ConfigType | null; // Now receives the actual config, not just initial
  onConfigChange: (field: keyof ConfigType, value: any) => void; // Sends changes up
  onSave: () => Promise<void>; // Parent handles save
  onReset: () => void; // Parent handles reset
  isDirty: boolean; // Parent tells us if form is dirty
  disabled: boolean;
  className?: string;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  config,
  onConfigChange,
  onSave,
  onReset,
  isDirty,
  disabled,
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [debugEnabled, setDebugEnabled] = useAtom(debugEnabledAtom);

  // Handle generic input changes (checkboxes)
  const handleChange = (field: keyof ConfigType, value: any) => {
    onConfigChange(field, value);
  };

  // Handle text input changes
  const handleTextChange = (field: keyof ConfigType, value: string) => {
    onConfigChange(field, value);
  };

  // Handle exclude file types (comma-separated list)
  // const handleExcludeFileTypesChange = (value: string) => {
  //   const fileTypes = value
  //     .split(',')
  //     .map(type => type.trim())
  //     .filter(type => type.length > 0);
  //   onConfigChange('exclude_file_types', fileTypes);
  // };

  // Bail out if no config is provided
  if (!config) {
    return (
      <div
        className={`config-panel border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] overflow-hidden ${className} opacity-50 pointer-events-none`}
      >
        <div
          className="config-header flex items-center justify-between p-3 select-none font-semibold"
        >
          <h3 className="text-base m-0">Configuration</h3>
          <CaretRight size={18} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        `config-panel border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] overflow-hidden`,
        className
      )}
    >
      <div
        className="config-header flex items-center justify-between cursor-pointer select-none font-semibold h-12 max-h-12"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className='flex items-center gap-2'>
          <h3 className="text-base m-0 ml-2">Configuration</h3>
          {isDirty && <span className="text-xs font-normal text-orange-500">(unsaved changes)</span>}
        </div>
        {/* Save/Reset buttons controlled by parent's isDirty state */}
        <div className="flex items-center gap-2">
          {(isDirty && !disabled) && (
            <>
              <div className="flex items-center gap-2 lg:mr-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onReset(); }}
                  className="button p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10 m-0"
                  data-tooltip-id="small-tooltip"
                  data-tooltip-content="Reset Changes"
                >
                  <ArrowCounterClockwise size={16} weight="bold" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSave(); }}
                  className="button primary-button rounded-md text-xs/tight m-0 inline-flex items-center gap-1 text-white"
                  data-tooltip-id="small-tooltip"
                  data-tooltip-content="Save Changes"
                >
                  <FloppyDisk size={16} weight="duotone" className='text-white' /> Save
                </button>
              </div>
            </>
          )}
          {isExpanded ? <CaretDown size={18} /> : <CaretRight size={18} />}
        </div>
      </div>

      <div
        className={`config-content overflow-y-auto transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[50vh] opacity-100 p-3 pt-2' : 'max-h-0 opacity-0 p-0'
          } relative`}
      >
        <div className='absolute top-0 right-0 p-2'>
          <div
            data-tooltip-id={"app-tooltip"}
            data-tooltip-content={debugEnabled ? 'Disable debug mode' : 'Enable debug mode'}
            className={debugEnabled ? 'cursor-not-allowed' : ''}
          >
            <button
              className='button bg-error text-white px-2 py-1 rounded-md'
              onClick={() => {
                setDebugEnabled(prev => !prev);
              }}
            >
              <Bug size={18} />
            </button>
          </div>
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
            <Input
              type="text"
              id="include-file-types"
              value={config.include_file_types}
              onChange={(e) => handleTextChange('include_file_types', e.target.value)}
              placeholder="* for all, or .py,.js,..."
              disabled={disabled}
              className="w-full"
            />
          </div>
          <div className="config-option flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
            <label htmlFor="exclude-file-types" className="flex-shrink-0 mb-1 sm:mb-0">Exclude types:</label>
            <Input
              type="text"
              id="exclude-file-types"
              value={config.exclude_file_types.join(',')}
              // onChange={(e) => handleExcludeFileTypesChange(e.target.value)}
              onChange={(e) => handleTextChange('exclude_file_types', e.target.value)}
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
            <Input
              type="text"
              id="output-file"
              value={config.output_file}
              onChange={(e) => handleTextChange('output_file', e.target.value)}
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