// https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/event.ts#L14

export interface SignalInterface {
  action: string;
  data: any;
}

export interface SignalLog extends SignalInterface {
  action: 'log';
  data: {
    level?: 'info' | 'warn' | 'error' | 'debug' | string;
    message: string;
  }
}

export interface SignalInterfaceMapping {
  'log': SignalLog,
  'default': SignalInterface,
}

export type SignalType = keyof SignalInterfaceMapping;

export type SignalPayload<T extends SignalType> = SignalInterfaceMapping[T]['data'];


