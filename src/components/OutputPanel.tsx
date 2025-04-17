import React, { useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Copy, FileText, DownloadSimple, Eye, EyeSlash } from '@phosphor-icons/react';

interface OutputContent {
  combined_content: string;
  selected_files: string[];
  estimated_tokens: number;
}

interface OutputPanelProps {
  output: OutputContent;
  onCopyToClipboard: () => void;
  onOpenFile: () => void;
  disabled: boolean;
  className?: string;
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
  outputFileLocally,
  outputFileName
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Determine if the button should be disabled and why
  const isOpenDisabled = disabled || !outputFileLocally || !outputFileName;
  let openButtonTooltip = "";
  if (isOpenDisabled && !disabled) {
    if (!outputFileLocally) {
      openButtonTooltip = "Output file saving is disabled in config.";
    } else if (!outputFileName) {
      openButtonTooltip = "Output file name is not configured.";
    }
  }

  // Truncate content for preview
  const getPreviewContent = () => {
    const maxPreviewLength = 2000; // Increased preview length
    if (output.combined_content.length > maxPreviewLength) {
      return (
        output.combined_content.substring(0, maxPreviewLength) +
        '\n\n... [Content truncated for preview] ...'
      );
    }
    return output.combined_content;
  };

  // when using `"withGlobalTauri": true`, you may use
  // const { save } = window.__TAURI__.dialog;

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

  // Copy with feedback
  const handleCopy = () => {
    onCopyToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`output-panel flex flex-col p-3 border rounded-lg shadow-sm bg-[--light-bg] border-[--border-color] overflow-hidden ${className}`}>
      <div className="output-header flex justify-between items-center mb-3 flex-shrink-0 border-b border-[--border-color] pb-2">
        <h3 className="text-base font-semibold m-0">Output</h3>
        <div className="output-stats flex gap-3 text-sm text-[--light-text]">
          <span><strong>Files:</strong> {output.selected_files.length}</span>
          <span><strong>Tokens:</strong> ~{output.estimated_tokens.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0 justify-center">
        <button
          onClick={handleCopy}
          disabled={disabled}
          className="primary-button flex items-center gap-1.5"
        >
          <Copy size={16} /> {copied ? 'Copied!' : 'Copy'}
        </button>

        <span
          data-tooltip-id={isOpenDisabled ? "app-tooltip" : undefined}
          data-tooltip-content={openButtonTooltip}
          className={isOpenDisabled ? 'cursor-not-allowed' : ''}
        >
          <button
            onClick={onOpenFile}
            disabled={isOpenDisabled}
            className="flex items-center gap-1.5 disabled:cursor-not-allowed"
          >
            <FileText size={16} /> Open File
          </button>
        </span>

        <button
          onClick={handleDownload}
          disabled={disabled || !!downloadStatus}
          className="flex items-center gap-1.5"
        >
          <DownloadSimple size={16} /> {downloadStatus || 'Download'}
        </button>

        <button
          onClick={() => setShowPreview(!showPreview)}
          disabled={disabled}
          className="flex items-center gap-1.5"
        >
          {showPreview ? <EyeSlash size={16} /> : <Eye size={16} />} {showPreview ? 'Hide' : 'Show'} Preview
        </button>
      </div>

      {showPreview && (
        <div className="output-preview mt-1 flex-grow overflow-hidden flex flex-col min-h-0">
          <h4 className="text-sm font-medium text-[--light-text] mb-1 flex-shrink-0">Content Preview</h4>
          <pre className="flex-grow overflow-y-auto p-2 rounded bg-[--background] text-xs leading-relaxed">
            {getPreviewContent()}
          </pre>
        </div>
      )}
    </div>
  );
};

export default OutputPanel; 