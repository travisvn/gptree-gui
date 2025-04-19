import { SignalLog } from '../../hooks/signals';
import { atomWithImmer } from 'jotai-immer';

// export const logsAtom = withImmer(atomWithStorage<SignalLog['data'][]>('logs', [], undefined, { getOnInit: true }));
export const logsAtom = atomWithImmer<SignalLog['data'][]>([]);

export const debugEnabledAtom = atomWithImmer(false);