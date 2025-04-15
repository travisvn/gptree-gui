import React, { useState } from 'react';

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
  const handleDownload = () => {
    const blob = new Blob([output.combined_content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gptree-output.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Copy with feedback
  const handleCopy = () => {
    onCopyToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="output-panel">
      <div className="output-header">
        <h3>Output</h3>
        <div className="output-stats">
          <span><strong>Files:</strong> {output.selected_files.length}</span>
          <span><strong>Tokens:</strong> ~{output.estimated_tokens.toLocaleString()}</span>
        </div>
      </div>

      <div className="output-actions">
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
          <pre>{getPreviewContent()}</pre>
        </div>
      )}
    </div>
  );
};

export default OutputPanel; 