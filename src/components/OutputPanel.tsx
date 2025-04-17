import React, { useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

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
  className = ""
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Truncate content for preview
  const getPreviewContent = () => {
    if (output.combined_content.length > 1000) {
      return output.combined_content.substring(0, 1000) + '...\n\n[Content truncated for preview]';
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
        console.log('Invoking pick_save_path with content length:', output.combined_content.length);
        const result = await invoke<SaveResult>('pick_save_path', { content: output.combined_content });

        if (result.success && result.data) {
          console.log('File saved successfully to:', result.data);
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
    <div className={`output-panel flex flex-col p-3 overflow-hidden ${className}`}>
      <div className="output-header flex-shrink-0">
        <h3>Output</h3>
        <div className="output-stats">
          <span><strong>Files:</strong> {output.selected_files.length}</span>
          <span><strong>Tokens:</strong> ~{output.estimated_tokens.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-row gap-2 items-center justify-center mb-2 flex-shrink-0">
        <button
          onClick={handleCopy}
          disabled={disabled}
          className="primary-button"
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button
          onClick={onOpenFile}
          disabled={disabled}
        >
          Open Output File
        </button>
      </div>
      <div className="flex flex-row gap-2 items-center justify-center flex-shrink-0">
        <button
          onClick={handleDownload}
          disabled={disabled || downloadStatus === 'saving...'}
        >
          {downloadStatus || 'Download'}
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          disabled={disabled}
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {showPreview && (
        <div className="output-preview mt-2 flex-grow overflow-hidden flex flex-col">
          <h4 className="flex-shrink-0">Content Preview</h4>
          <pre className="flex-grow overflow-y-auto bg-[--background]">{getPreviewContent()}</pre>
        </div>
      )}
    </div>
  );
};

export default OutputPanel; 