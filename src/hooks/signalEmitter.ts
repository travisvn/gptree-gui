// https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/event.ts#L14

import { emit } from '@tauri-apps/api/event';
import type { SignalType, SignalPayload } from './signals';

/**
 * Function to send a signal/event with a typed payload based on the event name.
 * @param event - The name of the event to emit, constrained to SignalType.
 * @param payload - Data to send with the event, typed according to SignalPayload<K>.
 */
export const sendSignal = <K extends SignalType>(event: K, payload: SignalPayload<K>): Promise<void> => {
  // Wrap emit in a Promise if you need to await it, otherwise void is fine.
  return emit(event, payload);
};
