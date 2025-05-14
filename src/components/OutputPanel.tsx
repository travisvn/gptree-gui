import React, { useState, useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Copy, FileText, DownloadSimple, Eye, EyeSlash, SelectionAll, ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { OutputContent } from '../lib/types';
import { useSignalListener } from '../hooks/useSignalListener';
import { useAtom, useAtomValue } from 'jotai';
import { debugEnabledAtom, logsAtom, settingsAtom } from '../lib/store/atoms';
import { SignalPayload } from '../hooks/signals';

interface OutputPanelProps {
  output: OutputContent;
  onCopyToClipboard: () => void;
  onOpenFile: () => void;
  disabled: boolean;
  className?: string;
  saveOutputFile: boolean;
  outputFileLocally: boolean;
  outputFileName: string;
}

// Define the interface for the result from pick_save_path
interface SaveResult {
  success: boolean;
  data?: string;
  error?: string;
}

const OutputPanel: React.FC<OutputPanelProps> = ({
  output,
  onCopyToClipboard,
  onOpenFile,
  disabled,
  className = "",
  saveOutputFile,
  outputFileLocally,
  outputFileName
}) => {
  const appSettings = useAtomValue(settingsAtom);
  const [showPreview, setShowPreview] = useState(appSettings?.autoShowOutputPreview ?? false);
  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const [logs, setLogs] = useAtom(logsAtom);
  const debugEnabledDynamically = useAtomValue(debugEnabledAtom);

  const [editedPreviewContent, setEditedPreviewContent] = useState<string>("");
  const [isPreviewDirty, setIsPreviewDirty] = useState<boolean>(false);
  const previewTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const [previewCopied, setPreviewCopied] = useState(false);

  // Determine if the button should be disabled and why
  const isOpenDisabled = disabled || ((!saveOutputFile || !outputFileLocally) && !outputFileName);
  let openButtonTooltip = "";
  if (isOpenDisabled && !disabled) {
    if (!saveOutputFile || !outputFileLocally) {
      openButtonTooltip = "Saving output file is disabled in config.";
    } else if (!outputFileName) {
      openButtonTooltip = "Output file name is not configured.";
    }
  }

  // Original content for comparison
  const getOriginalPreviewContent = () => {
    return output.combined_content;
  };

  useEffect(() => {
    if (showPreview && output) {
      const originalContent = getOriginalPreviewContent();
      setEditedPreviewContent(originalContent);
      setIsPreviewDirty(false);
    }
  }, [output, showPreview]);

  useEffect(() => {
    if (showPreview && output) {
      setIsPreviewDirty(editedPreviewContent !== getOriginalPreviewContent());
    }
  }, [editedPreviewContent, output, showPreview]);

  // Download output as file
  const handleDownload = async () => {
    if (isTauri()) {
      try {
        setDownloadStatus('saving...');
        const result = await invoke<SaveResult>('pick_save_path', { content: output.combined_content });

        if (result.success && result.data) {
          setDownloadStatus('saved!');
          setTimeout(() => setDownloadStatus(null), 2000);
        } else if (result.error) {
          console.error('Error saving file:', result.error);
          setDownloadStatus('failed: ' + result.error);
          setTimeout(() => setDownloadStatus(null), 3000);
        }
      } catch (err) {
        console.error('Failed to save file:', err);
        setDownloadStatus('failed');
        setTimeout(() => setDownloadStatus(null), 3000);
      }
    } else {
      // Browser fallback
      const blob = new Blob([output.combined_content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gptree-output.txt';
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    }
  };

  // Copy with feedback (main copy button)
  const handleCopy = () => {
    onCopyToClipboard(); // This copies the original output.combined_content
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  useSignalListener('log', (data: SignalPayload<'log'>) => {
    if (data) {
      setLogs((prevLogs) => [...prevLogs, data]);
    }
  });

  const handlePreviewChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedPreviewContent(event.target.value || "");
  };

  const handlePreviewSelectAll = () => {
    if (previewTextAreaRef.current) {
      previewTextAreaRef.current.select();
    }
  };

  const handlePreviewCopy = async () => {
    if (editedPreviewContent) {
      try {
        await navigator.clipboard.writeText(editedPreviewContent);
        setPreviewCopied(true);
        onCopyToClipboard(); // Call the main copy handler to trigger global message
        setTimeout(() => setPreviewCopied(false), 1500);
      } catch (err) {
        console.error('Failed to copy preview content:', err);
        // Optionally show an error message to the user
      }
    }
  };

  const handlePreviewReset = () => {
    if (output) {
      setEditedPreviewContent(getOriginalPreviewContent());
      setIsPreviewDirty(false);
    }
  };

  return (
    <div className={`output-panel flex flex-col p-3 border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] overflow-hidden ${className} relative`}>
      <div className="output-header flex justify-between items-center mb-3 flex-shrink-0">
        <h3 className="text-base font-semibold m-0">Output</h3>
        <div className="output-stats flex gap-3 text-sm text-[--light-text]">
          <span><strong>Files:</strong> {output.file_details.length}</span>
          <span><strong>Tokens:</strong> ~{output.token_estimate.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0 justify-center items-center">
        <button
          onClick={handleCopy}
          disabled={disabled}
          className="button primary-button flex items-center gap-1.5 duration-200 transition-colors"
        >
          <Copy size={16} /> {copied ? 'Copied!' : (isPreviewDirty ? 'Copy Original' : 'Copy')}
        </button>

        <span
          data-tooltip-id={isOpenDisabled ? "app-tooltip" : undefined}
          data-tooltip-content={openButtonTooltip}
          className={isOpenDisabled ? 'cursor-not-allowed' : ''}
        >
          <button
            onClick={onOpenFile}
            disabled={isOpenDisabled}
            className="button flex items-center gap-1.5 disabled:cursor-not-allowed duration-200 transition-colors"
          >
            <FileText size={16} /> Open File
          </button>
        </span>

        <button
          onClick={handleDownload}
          disabled={disabled || !!downloadStatus}
          className="button flex items-center gap-1.5 justify-center duration-200 transition-colors"
        >
          <DownloadSimple size={16} /> {downloadStatus || 'Download'}
        </button>

        <button
          onClick={() => setShowPreview(!showPreview)}
          disabled={disabled}
          className="button flex items-center gap-1.5 justify-center duration-200 transition-colors"
        >
          {showPreview ? <EyeSlash size={16} /> : <Eye size={16} />} {showPreview ? 'Hide' : 'Show'} Preview
        </button>
      </div>

      {showPreview && (
        <div className="output-preview mt-1 flex-grow overflow-hidden flex flex-col min-h-0 relative">
          <div className="absolute top-1 right-1 z-10 flex gap-1">
            {isPreviewDirty && (
              <button
                onClick={handlePreviewReset}
                className="button p-1 text-xs bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded"
                title="Reset Changes"
                data-tooltip-id="small-tooltip"
                data-tooltip-content="Reset Changes"
              >
                <ArrowCounterClockwise size={14} />
              </button>
            )}
            <button
              onClick={handlePreviewSelectAll}
              className="button p-1 text-xs bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded"
              title="Select All"
              data-tooltip-id="small-tooltip"
              data-tooltip-content="Select All"
            >
              <SelectionAll size={14} />
            </button>
            <button
              onClick={handlePreviewCopy}
              className="button p-1 text-xs bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded"
              title="Copy Preview"
              data-tooltip-id="small-tooltip"
              data-tooltip-content="Copy Preview"
            >
              {previewCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <h4 className="text-sm font-medium text-[--light-text] mb-1 flex-shrink-0">Content Preview</h4>
          <textarea
            ref={previewTextAreaRef}
            value={editedPreviewContent}
            onChange={handlePreviewChange}
            className="flex-grow overflow-y-auto p-2 rounded bg-[--background] text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-[--primary-color] no-strikethrough font-mono resize-none"
          />
        </div>
      )}

      {debugEnabledDynamically && (
        <div className='absolute bottom-0 left-0 right-0 w-full h-40 overflow-y-auto bg-black/20 dark:bg-white/20 backdrop-blur-sm rounded-md p-2 flex flex-col z-20'>
          <div className='flex flex-col gap-1'>
            {logs && logs.length > 0 && logs.map((log, index) => (
              <div key={index} className='text-xs'>
                [{index + 1}] - {log?.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OutputPanel; 