/* eslint-disable no-unused-expressions */
import '@logseq/libs';
import { ISettings, Markers, updateSettings, getMarkers, Keybindings } from './utils';
import * as starter from './starter';

let MARKERS: Markers;
let SETTINGS: ISettings;
let KEYBINDINGS: Keybindings;

const main = async () => {
  // eslint-disable-next-line no-console
  console.log('Init task automation service.');

  SETTINGS = await updateSettings(logseq.settings);
  MARKERS = getMarkers(SETTINGS.preferredWorkflow);
  KEYBINDINGS = SETTINGS.keybindings;

  logseq.onSettingsChanged(async () => {
    SETTINGS = await updateSettings(logseq.settings);
    MARKERS = getMarkers(SETTINGS.preferredWorkflow);
    KEYBINDINGS = SETTINGS.keybindings;
  });

  starter.addTaskClickListner(MARKERS);
  starter.autoTaskStarter(SETTINGS, MARKERS);
  starter.cycleShortcutsRegister(KEYBINDINGS, MARKERS);
  starter.timestampShortcutsRegister(SETTINGS, MARKERS);
};

// eslint-disable-next-line no-console
logseq.ready(main).catch(console.error);
