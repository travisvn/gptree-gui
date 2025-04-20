import { SignalLog } from '@/hooks/signals';
import { atomWithImmer } from 'jotai-immer';
import { AppSettings } from '@/lib/types';

// export const logsAtom = withImmer(atomWithStorage<SignalLog['data'][]>('logs', [], undefined, { getOnInit: true }));
export const logsAtom = atomWithImmer<SignalLog['data'][]>([]);

export const debugEnabledAtom = atomWithImmer(false);

// If null, settings have not been loaded yet
export const settingsAtom = atomWithImmer<AppSettings | null>(null);