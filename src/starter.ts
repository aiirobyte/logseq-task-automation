import '@logseq/libs';
import { ISettings, Keybindings, Markers } from './utils';
import { updateTaskMap } from './map';
import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';

// Cycling shortcuts automation
function cycleShortcutsRegister(keybindings: Keybindings, markers: Markers) {
  logseq.App.registerCommandPalette(
    {
      key: 'task-automation-shortcuts-to-next',
      label: 'Cycle in normal sequence',
      keybinding: {
        mode: 'global',
        binding: keybindings.toNext,
      },
    },
    async () => {
      const block = await logseq.Editor.getCurrentBlock();
      switch (block?.marker) {
        case markers.later:
          // If block's marker is later, change it to now.
          updateTaskMap(block.uuid, markers.now, markers);
          break;
        case markers.now:
          // If block's marker is now, change it to done.
          updateTaskMap(block.uuid, markers.done, markers);
          break;
        case markers.done:
          // If block's marker is done, change it to later.
          updateTaskMap(block.uuid, markers.later, markers);
          break;
        default:
          // If block's marker is not later, now, done, just change it to later.
          if (block) updateTaskMap(block.uuid, markers.later, markers);
      }
    },
  );
  logseq.App.registerCommandPalette(
    {
      key: 'task-automation-shortcuts-to-prev',
      label: 'Cycle in reverse sequence',
      keybinding: {
        mode: 'global',
        binding: keybindings.toPrev,
      },
    },
    async () => {
      const block = await logseq.Editor.getCurrentBlock();
      switch (block?.marker?.toLowerCase()) {
        case markers.later:
          // If block's marker is later, change it to done.
          updateTaskMap(block.uuid, markers.done, markers);
          break;
        case markers.now:
          // If block's marker is now, change it to later.
          updateTaskMap(block.uuid, markers.later, markers);
          break;
        case markers.done:
          // If block's marker is done, change it to now.
          updateTaskMap(block.uuid, markers.now, markers);
          break;
        default:
          // If block's marker is not later, now, done, just change it to done.
          if (block) updateTaskMap(block.uuid, markers.done, markers);
      }
    },
  );
}

// Auto task starter
async function autoTaskStarter(settings: ISettings, markers: Markers) {
  if (settings.autoStartEnabled) {
    // task start function triggered by editing child block or using timestamp
    const autoStart = async (block: BlockEntity) => {
      const blockParent = await logseq.Editor.getBlock(block.parent?.id);
      if (blockParent?.marker === markers.later) {
        // only automatically start when parent task status is later and
        // current editing block has no status, as may cause conflict while updating task map.
        block?.marker === undefined &&
          (await updateTaskMap(blockParent.uuid, markers.now, markers));
      }
    };

    logseq.DB.onChanged(({ blocks, txData }) => {
      // only listen content changing
      if (txData.find((t) => t[1] === 'content')) {
        const changedBlocks = blocks;
        changedBlocks.forEach(async (block) => {
          autoStart(block);
        });
      }
    });
  }
}

// Timestamp shortcut register
function timestampShortcutsRegister(settings: ISettings, markers: Markers) {
  logseq.App.registerCommandPalette(
    {
      key: 'task-automation-shortcuts-add-timestamp',
      label: 'Add timestamp to block',
      keybinding: {
        mode: 'global',
        binding: settings.keybindings.addTimestamp,
      },
    },
    async () => {
      // get time
      const today = new Date();
      const time = `${String(today.getHours()).padStart(2, '0')}:${String(
        today.getMinutes(),
      ).padStart(2, '0')}`;

      const block = await logseq.Editor.getCurrentBlock();
      if (block) {
        await logseq.Editor.updateBlock(block.uuid, `${time} ${block.content}`);
        if (settings.autoStartEnabled === false) autoTaskStarter(settings, markers);
      }
    },
  );
}

// Marker clicking automation
function addTaskClickListner(markers: Markers) {
  const mainContainer = (<Window>top).document.querySelector('#main-content-container');

  // click event listener for inline marker
  const handleClick = (e: Event) => {
    console.log(e);
    const targetElement = e.target as HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetParentClassName = (e as any).path[1].className;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetBlockUuid = (e as any).path[4]?.getAttribute('blockid');
    type MarkerKey = 'later' | 'now' | 'done' | 'waiting' | 'canceled';

    if (targetBlockUuid) {
      Object.entries(markers).forEach(([key]) => {
        if (targetParentClassName === `inline ${markers[key as MarkerKey]?.toLowerCase()}`) {
          if (targetElement?.tagName === 'A') {
            // Later and now target elements have 'a' tag name
            // The changes match their parent class name\
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            updateTaskMap(targetBlockUuid, markers[key as MarkerKey]!, markers);
          } else if (targetParentClassName !== `inline ${markers.done.toLowerCase()}`) {
            // Done click box has another tag name
            // The changes don't match their parent class name
            // The class name can be later or now
            updateTaskMap(targetBlockUuid, markers.done, markers);
          } else {
            // When class name is not inline done,
            // this means user clicks the checkbox and set marker to later
            updateTaskMap(targetBlockUuid, markers.later, markers);
          }
        }
      });
    }
  };

  mainContainer?.addEventListener('click', handleClick, false);
  logseq.App.onRouteChanged(() => {
    mainContainer?.removeEventListener('click', handleClick);
    mainContainer?.addEventListener('click', handleClick, false);
  });
}

export { cycleShortcutsRegister, autoTaskStarter, timestampShortcutsRegister, addTaskClickListner };
