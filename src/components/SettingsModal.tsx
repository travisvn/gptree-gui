import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Modal from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppSettings, CommandResult } from '@/lib/types'; // Assuming CommandResult is defined here

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: () => void; // Callback for when settings are successfully saved
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch settings when the modal opens
  const fetchSettings = useCallback(async () => {
    if (!isOpen) return; // Don't fetch if modal is closed

    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<CommandResult<AppSettings>>('get_app_settings');
      if (result.success && result.data) {
        setSettings(result.data);
      } else {
        setError(result.error as string ?? 'Failed to load settings.');
        setSettings(null); // Reset or use defaults if loading failed?
      }
    } catch (err: any) {
      setError(`Error fetching settings: ${err.toString()}`);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]); // Rerun when isOpen changes (via fetchSettings dependency)

  const handleSwitchChange = (field: keyof AppSettings, checked: boolean) => {
    setSettings((prev) => (prev ? { ...prev, [field]: checked } : null));
  };

  const handleSave = async () => {
    if (!settings) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<CommandResult<boolean>>('save_app_settings', {
        settings: settings, // Pass the current state
      });
      if (result.success) {
        onSettingsSaved(); // Notify parent component
        onOpenChange(false); // Close modal on success
        // Optionally show a success message here
      } else {
        setError(result.error as string ?? 'Failed to save settings.');
      }
    } catch (err: any) {
      setError(`Error saving settings: ${err.toString()}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false); // Just close the modal
    // State will reset automatically when reopened due to fetchSettings
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Application Settings"
      description="Manage application-wide preferences."
      className="sm:max-w-[500px]"
      footer={
        <>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !settings}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="py-4">
        {isLoading && !settings && <p>Loading settings...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
        {settings && (
          <div className="grid gap-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="local-config-switch" className="flex flex-col space-y-1 items-start">
                <span>Default to Local Config</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Prefer '.gptree_config' in the project folder when available.
                </span>
              </Label>
              <Switch
                id="local-config-switch"
                checked={settings.defaultToLocalConfig}
                onCheckedChange={(checked) =>
                  handleSwitchChange('defaultToLocalConfig', checked)
                }
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="prompt-switch" className="flex flex-col space-y-1 items-start">
                <span>Prompt for Directory on Startup</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  If enabled, show the directory picker if no recent project is found.
                </span>
              </Label>
              <Switch
                id="prompt-switch"
                checked={settings.promptForDirectoryOnStartup}
                onCheckedChange={(checked) =>
                  handleSwitchChange('promptForDirectoryOnStartup', checked)
                }
                disabled={isLoading}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SettingsModal; 