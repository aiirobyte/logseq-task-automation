import '@logseq/libs';
import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin';

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'to-next-keybinding',
    type: 'string',
    default: 'mod+shift+enter',
    title: 'Next Status Cycle Shortcut',
    description: 'Cycle among non-task, later, now, done. This keybinding is normal sequence.',
  },
  {
    key: 'to-prev-keybinding',
    type: 'string',
    default: 'mod+shift+alt+enter',
    title: 'Previous Status Cycle Shortcut',
    description: 'Cycle among non-task, done, now, later. This keybinding is reverse sequence.',
  },
  {
    key: 'auto-starter-enabled',
    type: 'boolean',
    default: true,
    title: 'Auto Task Starter',
    description: 'Enable auto parent task starter when editing child block.',
  },
  {
    key: 'timestamp-keybinding',
    type: 'string',
    default: 'mod+t',
    title: 'Timestamp Insert Shortcut',
    description: 'Insert timestamp to block, and auto start parent task.',
  },
];

export interface Keybindings {
  toNext: string;
  toPrev: string;
  addTimestamp: string;
}

export interface Markers {
  later: 'LATER' | 'TODO';
  now: 'NOW' | 'DOING';
  done: 'DONE';
  waiting?: 'WAITING';
  canceled?: 'CANCELED';
}

export interface ISettings {
  autoStartEnabled: boolean;
  preferredWorkflow: 'todo' | 'later';
  keybindings: Keybindings;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSettings(newSettings: any): Promise<ISettings> {
  logseq.useSettingsSchema(settingsSchema);
  const { preferredWorkflow } = await logseq.App.getUserConfigs();

  return {
    autoStartEnabled: newSettings['auto-starter-enabled'] as boolean,
    preferredWorkflow: preferredWorkflow as 'todo' | 'later',
    keybindings: {
      toNext: newSettings['to-next-keybinding'],
      toPrev: newSettings['to-prev-keybinding'],
      addTimestamp: newSettings['timestamp-keybinding'],
    },
  };
}

export function getMarkers(preferredWorkflow: 'todo' | 'later'): Markers {
  let markers: Markers;

  switch (preferredWorkflow) {
    case 'later':
      markers = {
        later: 'LATER',
        now: 'NOW',
        done: 'DONE',
      };
      break;
    case 'todo':
      markers = {
        later: 'TODO',
        now: 'DOING',
        done: 'DONE',
      };
      break;
    default:
      markers = {
        later: 'TODO',
        now: 'DOING',
        done: 'DONE',
      };
  }

  return markers;
}
