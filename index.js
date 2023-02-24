/* eslint-disable no-unused-expressions */
import "@logseq/libs";

const SETTINGS_SCHEMA = [
  {
    key: "to-next-keybinding",
    title: "Next Status Cycle Shortcut",
    description:
      "Cycle among non-task, later, now, done. This keybinding is normal sequence.",
    type: "string",
    default: "mod+shift+enter",
  },
  {
    key: "to-prev-keybinding",
    title: "Previous Status Cycle Shortcut",
    description:
    "Cycle among non-task, done, now, later. This keybinding is reverse sequence.",
    type: "string",
    default: "mod+shift+alt+enter",
  },
  {
    key: "auto-starter-enabled",
    title: "Auto Task Starter",
    type: "boolean",
    description: "Enable auto parent task starter when editing child block.",
    default: true,
  },
  {
    key: "timestamp-keybinding",
    title: "Timestamp Insert Shortcut",
    description:
    "Insert timestamp to block, and auto start parent task.",
    type: "string",
    default: "mod+t",
  },
];

let MARKERS;
const KEYBINDINGS = {};

let autoStartEnabled = true;

async function updateConfig(newSettings) {
  const { preferredWorkflow } = await logseq.App.getUserConfigs();
  if (preferredWorkflow === "todo") {
    MARKERS = { later: "todo", now: "doing", done: "done" };
  } else {
    MARKERS = { later: "later", now: "now", done: "done" };
  }

  KEYBINDINGS.toNext = newSettings["to-next-keybinding"];
  KEYBINDINGS.toPrev = newSettings["to-prev-keybinding"];
  KEYBINDINGS.AddTimestamp = newSettings["timestamp-keybinding"];

  autoStartEnabled = newSettings["auto-starter-enabled"];
}

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

  const allNowSiblings = taskMap.siblings.filter(
    (task) => task.marker === MARKERS.now,
  );
  const isSiblingsAllDone = taskMap.siblings.every(
    (task) => task.marker === MARKERS.done,
  );

  const updateMarker = async (
    block,
    targetMarker,
    { srcMarker, preventMarker, disableMapIterate } = {},
  ) => {
    if (block) {
      const updateBlock = async () => {
        if (block?.marker) {
          const content = block.content.slice(block.content.indexOf(" "));
          const marker = targetMarker.toUpperCase();
          await logseq.Editor.updateBlock(block.uuid, marker + content);
          // only iterate when updating task tree
          disableMapIterate !== true && updateTaskMap(block.uuid, targetMarker);
        } else {
          // updated from non-task will not iterate
          const { content } = block;
          const marker = `${targetMarker.toUpperCase()} `;
          await logseq.Editor.updateBlock(block.uuid, marker + content);
        }
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
          // If all source marker and prevent marker all havn't been defined,
          // just update block to target marker.
          updateBlock();
        }
      }
    }
  };

  const updateMapMethod = async (markerToChange) => {
    switch (markerToChange) {
      case MARKERS.later:
        // If at least one sibling which has a now marker do not change parent marker,
        // otherwise only change parent marker to later when it's now.
        if (allNowSiblings.length === 0) {
          updateMarker(taskMap.parent, MARKERS.later, { srcMarker: MARKERS.now });
        }
        // All children's now marker changed to later
        taskMap.children.forEach((childBlock) => {
          updateMarker(childBlock, MARKERS.later, { srcMarker: MARKERS.now });
        });
        break;
      case MARKERS.now:
        // change parent block to now
        updateMarker(taskMap.parent, MARKERS.now);
        // setting all now sibling block to later
        allNowSiblings.forEach((block) => {
          updateMarker(block, MARKERS.later, { disableMapIterate: true });
        });
        break;
      case MARKERS.done:
        if (
          !(taskMap.nextSibling === null || taskMap.nextSibling?.marker === MARKERS.done)
          && taskMap.parent
        ) {
          // If next sibling and parent both have marker, then change nextSibling marker to now
          await updateMarker(taskMap.nextSibling, MARKERS.now);
        } else if (isSiblingsAllDone) {
          updateMarker(taskMap.parent, MARKERS.done);
        } else if (allNowSiblings.length === 0) {
          updateMarker(taskMap.parent, MARKERS.later, { srcMarker: MARKERS.now });
        }
        taskMap.children.forEach((childBlock) => {
          updateMarker(childBlock, MARKERS.done);
        });
        break;
      default:
    }
  };

  // when current block don't have marker, only update task map when changed marker not later
  if (taskMap.current?.marker) {
    updateMarker(taskMap.current, markerChangedTo, { disableMapIterate: true });
    updateMapMethod(markerChangedTo);
  } else {
    markerChangedTo === MARKERS.later
      ? updateMarker(taskMap.current, markerChangedTo, { disableMapIterate: true })
      : updateMarker(taskMap.current, markerChangedTo, { disableMapIterate: true })
        && updateMapMethod(markerChangedTo);
  }
}

const main = async () => {
  logseq.useSettingsSchema(SETTINGS_SCHEMA);
  await updateConfig(logseq.settings);
  logseq.onSettingsChanged(updateConfig);

  // eslint-disable-next-line no-console
  console.log("Init task automation service.");
  const mainContainer = top.document.querySelector("#main-content-container");

  // regist cycling shortcuts
  function CycleShortcutsRegister() {
    logseq.App.registerCommandPalette(
      {
        key: "task-automation-shortcuts-to-next",
        label: "Cycle in normal sequence",
        keybinding: {
          mode: "global",
          binding: KEYBINDINGS.toNext,
        },
      },
      async () => {
        const block = await logseq.Editor.getCurrentBlock();
        switch (block?.marker?.toLowerCase()) {
          case MARKERS.later:
            // If block's marker is later, change it to now.
            updateTaskMap(block.uuid, MARKERS.now);
            break;
          case MARKERS.now:
            // If block's marker is now, change it to done.
            updateTaskMap(block.uuid, MARKERS.done);
            break;
          case MARKERS.done:
            // If block's marker is done, change it to later.
            updateTaskMap(block.uuid, MARKERS.later);
            break;
          // case undefined:
          //   // If block's marker is nonMarker, change it to later.
          //   updateTaskMap(block.uuid, Markers.later);
          //   break;
          default:
            // If block's marker is not later, now, done, just change it to later.
            updateTaskMap(block.uuid, MARKERS.later);
        }
      },
    );
    logseq.App.registerCommandPalette(
      {
        key: "task-automation-shortcuts-to-prev",
        label: "Cycle in reverse sequence",
        keybinding: {
          mode: "global",
          binding: KEYBINDINGS.toPrev,
        },
      },
      async () => {
        const block = await logseq.Editor.getCurrentBlock();
        switch (block?.marker?.toLowerCase()) {
          case MARKERS.later:
            // If block's marker is later, change it to done.
            updateTaskMap(block.uuid, MARKERS.done);
            break;
          case MARKERS.now:
            // If block's marker is now, change it to later.
            updateTaskMap(block.uuid, MARKERS.later);
            break;
          case MARKERS.done:
            // If block's marker is done, change it to now.
            updateTaskMap(block.uuid, MARKERS.now);
            break;
          // case undefined:
          //   // If block's marker is nonMarker, change it to done.
          //   updateTaskMap(block.uuid, Markers.done);
          //   break;
          default:
            // If block's marker is not later, now, done, just change it to done.
            updateTaskMap(block.uuid, MARKERS.done);
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
        Object.keys(MARKERS).forEach((key) => {
          if (targetParentClassName === `inline ${MARKERS[key]}`) {
            if (targetElement.tagName === "A") {
              // Later and now target elements have "a" tag name
              // The changes match their parent class name
              updateTaskMap(targetBlockUuid, MARKERS[key]);
            } else if (targetParentClassName !== `inline ${MARKERS.done}`) {
              // Done click box has another tag name
              // The changes don't match their parent class name
              // The class name can be later or now
              updateTaskMap(targetBlockUuid, MARKERS.done);
            } else {
              // When class name is not inline done,
              // this means user clicks the checkbox and set marker to later
              updateTaskMap(targetBlockUuid, MARKERS.later);
            }
          }
        });
      }
    });
  }

  // task start function triggered by editing child block or using timestamp
  function taskStarter() {
    const autoStart = async (block) => {
      const blockParent = await logseq.Editor.getBlock(block?.parent?.id);
      if (blockParent?.marker?.toLowerCase() === MARKERS.later) {
        // only automatically start when parent task status is later and
        // current editing block has no status, as may cause conflict while updating task map.
        block?.marker === undefined && await updateTaskMap(blockParent.uuid, MARKERS.now);
      }
    };

    // Add auto task starter listener, if user enables it.
    if (autoStartEnabled) {
      logseq.DB.onChanged((e) => {
        const changedBlocks = e.blocks;
        changedBlocks.forEach(async (block) => {
          autoStart(block);
        });
      });
    }

    // timestamp shortcut register
    logseq.App.registerCommandPalette(
      {
        key: "task-automation-shortcuts-add-timestamp",
        label: "Add timestamp to block",
        keybinding: {
          mode: "global",
          binding: KEYBINDINGS.AddTimestamp,
        },
      },
      async () => {
        // get time
        const today = new Date();
        const time = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;

        const block = await logseq.Editor.getCurrentBlock();
        await logseq.Editor.updateBlock(block.uuid, `${time} ${block.content}`);
        autoStartEnabled === false && autoStart(block);
      },
    );
  }

  // Start functions
  addTaskClickListner();
  logseq.App.onRouteChanged(() => {
    mainContainer.removeEventListener();
    addTaskClickListner();
  });
  CycleShortcutsRegister();
  taskStarter();
};

// eslint-disable-next-line no-console
logseq.ready(main).catch(console.error);
