// https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/event.ts#L14

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { Event, UnlistenFn } from '@tauri-apps/api/event';
import type { SignalType, SignalPayload } from './signals';

/**
 * Custom hook to listen for a specific event from the global signal emitter.
 * Ensures the callback receives the correctly typed payload based on the event name.
 * @param event - The name of the event to listen for, constrained to SignalType.
 * @param callback - Function to execute with the typed payload when the event is triggered.
 */
export const useSignalListener = <K extends SignalType>(event: K, callback: (payload: SignalPayload<K>) => void): void => {
  useEffect(() => {
    let unlistenFn: UnlistenFn | undefined;

    async function listenAndSetup() {
      // Wrap the callback to extract the payload from the Event object
      const eventCallback = (e: Event<SignalPayload<K>>) => {
        // Ensure payload exists if the type isn't explicitly optional/nullable
        // Tauri might send null/undefined in some edge cases even if type suggests otherwise.
        // Adjust this check based on your specific SignalPayload definitions and guarantees.
        if (e.payload !== undefined && e.payload !== null) {
          callback(e.payload);
        }
      };
      unlistenFn = await listen<SignalPayload<K>>(event, eventCallback);
    }

    listenAndSetup();

    return () => {
      unlistenFn?.(); // Cleanup on unmount
    };
  }, [event, callback]);
};