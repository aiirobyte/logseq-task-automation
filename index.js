/* eslint-disable no-unused-expressions */
import "@logseq/libs";

let Markers;
const CycleKeybindings = {};

const settings = [
  {
    key: "ToNextKeybinding",
    title: "Change to next status.",
    description:
      "Cycle among non-task, later, now, done. This keybinding is normal sequence.",
    type: "string",
    default: "mod+shift+enter",
  },
  {
    key: "ToPrevKeybinding",
    title: "Change to previous status.",
    description:
      "Cycle among non-task, later, now, done. This keybinding is reverse sequence.",
    type: "string",
    default: "mod+shift+alt+enter",
  },
];
logseq.useSettingsSchema(settings);

/**
 * Get current block task map.
 * @param {string} block - Current editing block
 * @return {object} taskMap
 */
async function getTaskMap(block) {
  // TODO get reference task status
  const taskMap = {
    parent: null,
    nextSibling: null,
    current: {
      id: block.id,
      uuid: block.uuid,
      marker: block.marker,
      content: block.content,
    },
    siblings: [],
    children: [],
  };
  const blockId = block.id;
  const blockUuid = block.uuid;

  const blockWithChildren = await logseq.Editor.getBlock(blockId, {
    includeChildren: true,
  });

  // Add all children with marker
  blockWithChildren.children?.forEach((childBlock) => {
    childBlock?.marker
      && taskMap.children.push({
        id: childBlock.id,
        uuid: childBlock.uuid,
        marker: childBlock.marker.toLowerCase(),
        content: childBlock.content,
      });
  });

  // Add parent with marker
  const parentBlock = await logseq.Editor.getBlock(block.parent.id);
  parentBlock?.marker
    && (taskMap.parent = {
      id: parentBlock.id,
      uuid: parentBlock.uuid,
      marker: parentBlock.marker.toLowerCase(),
      content: parentBlock.content,
    });

  // Add all siblings with marker
  let previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(
    blockUuid,
  );
  while (previousSiblingBlock) {
    previousSiblingBlock?.marker
      && taskMap.siblings.unshift({
        id: previousSiblingBlock.id,
        uuid: previousSiblingBlock.uuid,
        marker: previousSiblingBlock.marker.toLowerCase(),
        content: previousSiblingBlock.content,
      });
    previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(
      previousSiblingBlock.uuid,
    );
  }
  let nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(blockUuid);
  nextSiblingBlock?.marker
    && (taskMap.nextSibling = {
      id: nextSiblingBlock.id,
      uuid: nextSiblingBlock.uuid,
      marker: nextSiblingBlock.marker.toLowerCase(),
      content: nextSiblingBlock.content,
    });
  while (nextSiblingBlock) {
    nextSiblingBlock?.marker
      && taskMap.siblings.push({
        id: nextSiblingBlock.id,
        uuid: nextSiblingBlock.uuid,
        marker: nextSiblingBlock.marker.toLowerCase(),
        content: nextSiblingBlock.content,
      });
    nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(
      nextSiblingBlock.uuid,
    );
  }

  return taskMap;
}

/**
 * Update current task map.
 * @param {blockUuid} uuid - Current block UUID in task map.
 * @param {markerChangedTo} markerChangedTo - Which marker the current block changed to.
 * Available values: Markers.keys, nonMarker.
 */
async function updateTaskMap(uuid, markerChangedTo) {
  const currentBlock = await logseq.Editor.getBlock(uuid);
  const taskMap = await getTaskMap(currentBlock);

  const isSiblingsHaveNow = taskMap.siblings.find(
    (task) => task.marker === Markers.now,
  );
  const isSiblingsAllDone = taskMap.siblings.every(
    (task) => task.marker === Markers.done,
  );

  const updateMarker = async (
    block,
    targetMarker,
    { srcMarker, preventMarker, isCurrentBlock } = {},
  ) => {
    if (block) {
      const updateBlock = async () => {
        const content = block.content.slice(block.content.indexOf(" "));
        const marker = targetMarker !== undefined ? targetMarker.toUpperCase() : `${targetMarker.toUpperCase()} `;
        await logseq.Editor.updateBlock(block.uuid, marker + content);
        isCurrentBlock !== true && updateTaskMap(block.uuid, targetMarker);
      };
      if (block.marker !== targetMarker) {
        // If target marker is not current block marker, then run into next step.
        if (block.marker !== preventMarker && preventMarker !== undefined) {
          // If block marker is not the marker prevented from and has been defined, update block.
          updateBlock();
        } else if (block.marker === srcMarker) {
          // If block marker is the ideal source marker, then update block.
          updateBlock();
        } else if (srcMarker === undefined && preventMarker === undefined) {
          // If all source marker and preventMarker all not defined,
          // just update block to target block.
          updateBlock();
        }
      }
    }
  };

  switch (markerChangedTo) {
    case Markers.later:
      // If at least one sibling which has a now marker do not change parent marker,
      // otherwise only change parent marker to later when it's now.
      if (!isSiblingsHaveNow) {
        updateMarker(taskMap.parent, Markers.later, { srcMarker: Markers.now });
      }
      // Change current block to later.
      updateMarker(taskMap.current, Markers.later, { isCurrentBlock: true });
      // All children's now marker changed to later
      taskMap.children.forEach((childBlock) => {
        updateMarker(childBlock, Markers.later, { srcMarker: Markers.now });
      });
      break;
    case Markers.now:
      // Change parent block and current block to now
      updateMarker(taskMap.parent, Markers.now);
      updateMarker(taskMap.current, Markers.now, { isCurrentBlock: true });
      break;
    case Markers.done:
      // Change current block to done.
      updateMarker(taskMap.current, Markers.done, { isCurrentBlock: true });
      if (
        !(taskMap.nextSibling === null || taskMap.nextSibling?.marker === Markers.done)
        && taskMap.parent
      ) {
        // If next sibling and parent both have marker, then change nextSibling marker to now
        await updateMarker(taskMap.nextSibling, Markers.now);
      } else if (isSiblingsAllDone) {
        updateMarker(taskMap.parent, Markers.done);
      } else if (!isSiblingsHaveNow) {
        updateMarker(taskMap.parent, Markers.later, { srcMarker: Markers.now });
      }
      taskMap.children.forEach((childBlock) => {
        updateMarker(childBlock, Markers.done);
      });
      break;
    default:
  }
}

const main = async () => {
  // eslint-disable-next-line no-console
  console.log("Init task automation service.");
  const mainContainer = top.document.querySelector("#main-content-container");

  const updateConfig = async () => {
    const { preferredWorkflow } = await logseq.App.getUserConfigs();
    if (preferredWorkflow === "todo") {
      Markers = { later: "todo", now: "doing", done: "done" };
    } else {
      Markers = { later: "later", now: "now", done: "done" };
    }

    CycleKeybindings.ToNext = logseq.settings.ToNextKeybinding;
    CycleKeybindings.ToPrev = logseq.settings.ToPrevKeybinding;
  };

  // regist cycling shortcuts
  function shortcutRegister() {
    logseq.App.registerCommandPalette(
      {
        key: "task-automation-shortcuts-to-next",
        label: "Cycle in normal sequence",
        keybinding: {
          mode: "global",
          binding: CycleKeybindings.ToNext,
        },
      },
      async () => {
        const block = await logseq.Editor.getCurrentBlock();
        switch (block?.marker?.toLowerCase()) {
          case Markers.later:
            // If block's marker is later, change it to now.
            updateTaskMap(block.uuid, Markers.now);
            break;
          case Markers.now:
            // If block's marker is now, change it to done.
            updateTaskMap(block.uuid, Markers.done);
            break;
          case Markers.done:
            // If block's marker is done, change it to later.
            updateTaskMap(block.uuid, Markers.later);
            break;
          // case undefined:
          //   // If block's marker is nonMarker, change it to later.
          //   updateTaskMap(block.uuid, Markers.later);
          //   break;
          default:
            // If block's marker is not later, now, done, just change it to later.
            updateTaskMap(block.uuid, Markers.later);
        }
      },
    );
    logseq.App.registerCommandPalette(
      {
        key: "task-automation-shortcuts-to-prev",
        label: "Cycle in reverse sequence",
        keybinding: {
          mode: "global",
          binding: CycleKeybindings.ToPrev,
        },
      },
      async () => {
        const block = await logseq.Editor.getCurrentBlock();
        switch (block?.marker?.toLowerCase()) {
          case Markers.later:
            // If block's marker is later, change it to done.
            updateTaskMap(block.uuid, Markers.done);
            break;
          case Markers.now:
            // If block's marker is now, change it to later.
            updateTaskMap(block.uuid, Markers.later);
            break;
          case Markers.done:
            // If block's marker is done, change it to now.
            updateTaskMap(block.uuid, Markers.now);
            break;
          // case undefined:
          //   // If block's marker is nonMarker, change it to done.
          //   updateTaskMap(block.uuid, Markers.done);
          //   break;
          default:
            // If block's marker is not later, now, done, just change it to done.
            updateTaskMap(block.uuid, Markers.done);
        }
      },
    );
  }

  // listen click on markers
  function addTaskClickListner() {
    // click event listener for inline marker
    mainContainer.addEventListener("click", (e) => {
      const targetElement = e.target;
      const targetParentClassName = e.path[1].className;
      const targetBlockUuid = e.path[4]?.getAttribute("blockid");

      if (targetBlockUuid) {
        Object.keys(Markers).forEach((key) => {
          if (targetParentClassName === `inline ${Markers[key]}`) {
            if (targetElement.tagName === "A") {
              // Later and now target elements have "a" tag name
              // The changes match their parent class name
              updateTaskMap(targetBlockUuid, Markers[key]);
            } else if (targetParentClassName !== `inline ${Markers.done}`) {
              // Done click box has another tag name
              // The changes don't match their parent class name
              // The class name can be later or now
              updateTaskMap(targetBlockUuid, Markers.done);
            } else {
              // When class name is not inline done,
              // this means user clicks the checkbox and set marker to later
              updateTaskMap(targetBlockUuid, Markers.later);
            }
          }
        });
      }
    });
  }

  // get config when startup, then on setting changed update config
  await updateConfig();
  logseq.onSettingsChanged(async () => {
    await updateConfig();
  });

  // Start listener on startup then on routeChanged restart listener
  addTaskClickListner();
  logseq.App.onRouteChanged(() => {
    mainContainer.removeEventListener();
    addTaskClickListner();
  });
  // Start shortcut register on startup
  shortcutRegister();
};

// eslint-disable-next-line no-console
logseq.ready(main).catch(console.error);
