import React, { useState, useEffect, useCallback } from 'react';
import { Bug, CaretDown, CaretRight, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { debugEnabledAtom } from '../lib/store/atoms';
import { type Config as ConfigType } from '../lib/types'; // Import Config type
import { cn } from '../lib/utils'; // Assuming cn is utility for classnames
import { Input } from './ui/input';

interface ConfigPanelProps {
  config: ConfigType | null; // Allow null config
  onConfigUpdate: (config: ConfigType) => Promise<void>; // Make async to handle backend update
  disabled: boolean;
  className?: string;
  onDirtyChange?: (isDirty: boolean) => void; // Callback for dirty state
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  config: initialConfig, // Rename prop to avoid conflict
  onConfigUpdate,
  disabled,
  className = "",
  onDirtyChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [debugEnabled, setDebugEnabled] = useAtom(debugEnabledAtom);

  // Local state for modifications
  const [modifiedConfig, setModifiedConfig] = useState<ConfigType | null>(initialConfig);
  const [isDirty, setIsDirty] = useState(false);

  // Effect to reset local state when initialConfig changes (e.g., mode switch)
  useEffect(() => {
    setModifiedConfig(initialConfig);
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [initialConfig, onDirtyChange]);

  // Inform parent component about dirty state changes
  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [onDirtyChange]);


  const handleChange = (field: keyof ConfigType, value: any) => {
    if (!modifiedConfig) return; // Should not happen if panel is visible
    setModifiedConfig(prevConfig => ({
      ...(prevConfig as ConfigType), // Cast because we checked for null
      [field]: value
    }));
    if (!isDirty) handleDirtyChange(true);
  };

  const handleExcludeFileTypesChange = (value: string) => {
    if (!modifiedConfig) return;
    const fileTypes = value
      .split(',')
      .map(type => type.trim())
      .filter(type => type.length > 0);

    handleChange('exclude_file_types', fileTypes);
  };

  const handleSave = async () => {
    if (!modifiedConfig || !isDirty || disabled) return;
    try {
      // Log what we're about to save for debugging
      console.log('Saving config:', JSON.parse(JSON.stringify(modifiedConfig)));

      await onConfigUpdate(modifiedConfig); // Call the async update function
      handleDirtyChange(false); // Reset dirty state only on success
    } catch (error) {
      console.error("Failed to save config:", error);
      // Try to get more diagnostic information
      try {
        const isGlobal = window.location.pathname.includes('global');
        console.error("Config mode appears to be:", isGlobal ? "global" : "local");
      } catch (e) {
        console.error("Unable to determine diagnostic info:", e);
      }
    }
  };

  const handleReset = () => {
    setModifiedConfig(initialConfig); // Revert to original config passed in props
    handleDirtyChange(false);
  };

  // Use modifiedConfig for displaying values in inputs
  const currentConfig = modifiedConfig!;

  // Disable panel content if no config is loaded initially
  if (!initialConfig) {
    // Optionally render a loading or placeholder state
    // For now, just returning null or an empty div might suffice
    // Or disable the entire panel interaction more explicitly?
    // Let's keep the structure but disable interactions if needed.
    // The parent component (App.tsx) already handles showing placeholders when config is null.
    // So, we just need to ensure `currentConfig` isn't accessed when null.
    // Let's prevent rendering the form content if initialConfig is null.
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
        {/* Save/Reset buttons */}
        <div className="flex items-center gap-2">
          {(isDirty && !disabled) && (
            <>
              <div className="flex items-center gap-2 lg:mr-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleReset(); }} // Prevent expansion toggle
                  className="button p-1.5 rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10 m-0"
                  data-tooltip-id="small-tooltip"
                  data-tooltip-content="Reset Changes"
                >
                  <ArrowCounterClockwise size={16} weight="bold" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSave(); }} // Prevent expansion toggle
                  className="button primary-button rounded-md text-xs/tight m-0 inline-flex items-center gap-1 text-white"
                  // disabled={!isDirty || disabled}
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
                // sendSignal('log', { message: 'test', level: 'info' });
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
              checked={currentConfig.use_git_ignore}
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
              checked={currentConfig.show_ignored_in_tree}
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
              checked={currentConfig.show_default_ignored_in_tree}
              onChange={(e) => handleChange('show_default_ignored_in_tree', e.target.checked)}
              disabled={disabled || currentConfig.show_ignored_in_tree}
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
              value={currentConfig.include_file_types}
              onChange={(e) => handleChange('include_file_types', e.target.value)}
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
              value={currentConfig.exclude_file_types.join(',')}
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
            <Input
              type="text"
              id="output-file"
              value={currentConfig.output_file}
              onChange={(e) => handleChange('output_file', e.target.value)}
              disabled={disabled}
              className="w-full"
            />
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="save-output-file"
              checked={currentConfig.save_output_file}
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
              checked={currentConfig.output_file_locally}
              onChange={(e) => handleChange('output_file_locally', e.target.checked)}
              disabled={disabled || !currentConfig.save_output_file}
              className="cursor-pointer disabled:opacity-50"
            />
            <label htmlFor="output-file-locally" className={`cursor-pointer ${!currentConfig.save_output_file ? 'opacity-50' : ''}`}>Save output in current working directory</label>
          </div>
          <div className="config-option flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="copy-to-clipboard"
              checked={currentConfig.copy_to_clipboard}
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
              checked={currentConfig.line_numbers}
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
              checked={currentConfig.safe_mode}
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
              checked={currentConfig.store_files_chosen}
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