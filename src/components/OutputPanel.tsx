import React, { useState } from 'react';
import { writeTextFile } from '@tauri-apps/plugin-fs';

// Add Tauri imports
let isTauri = false;
try {
  // @ts-ignore
  isTauri = !!window.__TAURI__;
} catch { }

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
}

const OutputPanel: React.FC<OutputPanelProps> = ({
  output,
  onCopyToClipboard,
  onOpenFile,
  disabled
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // Truncate content for preview
  const getPreviewContent = () => {
    if (output.combined_content.length > 1000) {
      return output.combined_content.substring(0, 1000) + '...\n\n[Content truncated for preview]';
    }
    return output.combined_content;
  };

  // Download output as file
  const handleDownload = async () => {
    if (isTauri) {
      try {
        // Get save path from backend
        // @ts-ignore
        const { invoke } = window.__TAURI__.core || window.__TAURI__;
        const savePath = await invoke('pick_save_path');
        if (savePath) {
          await writeTextFile(savePath, output.combined_content);
        }
      } catch (err) {
        // Optionally show an error message
        // eslint-disable-next-line no-console
        console.error('Failed to save file:', err);
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
    <div className="output-panel overflow-y-auto max-h-full max-w-full">
      <div className="output-header">
        <h3>Output</h3>
        <div className="output-stats">
          <span><strong>Files:</strong> {output.selected_files.length}</span>
          <span><strong>Tokens:</strong> ~{output.estimated_tokens.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-row gap-2 items-center justify-center mb-2">
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
      <div className="flex flex-row gap-2 items-center justify-center">
        <button
          onClick={handleDownload}
          disabled={disabled}
        >
          Download
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          disabled={disabled}
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {showPreview && (
        <div className="output-preview">
          <h4>Content Preview</h4>
          <pre className="max-h-[calc(100svh-25rem)] overflow-y-auto">{getPreviewContent()}</pre>
        </div>
      )}
    </div>
  );
};

export default OutputPanel; 