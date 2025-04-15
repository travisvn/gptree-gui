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

  // Truncate content for preview
  const getPreviewContent = () => {
    if (output.combined_content.length > 1000) {
      return output.combined_content.substring(0, 1000) + '...\n\n[Content truncated for preview]';
    }
    return output.combined_content;
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
          onClick={onCopyToClipboard}
          disabled={disabled}
          className="primary-button"
        >
          Copy to Clipboard
        </button>
        <button
          onClick={onOpenFile}
          disabled={disabled}
        >
          Open Output File
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