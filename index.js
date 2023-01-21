import '@logseq/libs';

let Markers;

const preferredMarkers = async () => {
  const { preferredWorkflow } = await logseq.App.getUserConfigs();
  return preferredWorkflow === 'now'
    ? { later: 'later', now: 'now', done: 'done' }
    : { later: 'todo', now: 'doing', done: 'done' };
};

/**
 * Get current block task map.
 * @param {string} block - The current clicked block
 * @return {object} taskMap
*/
async function getTaskMap(block) {
  // TODO get reference task status
  const taskMap = {
    parent: null,
    current: { id: block.id, uuid: block.uuid, marker: block.marker },
    siblings: [],
    children: [],
  };
  const blockId = block.id;
  const blockUuid = block.uuid;

  const blockWithChildren = await logseq.Editor.getBlock(blockId, { includeChildren: true });

  // Add all children with marker
  blockWithChildren.children?.forEach((childBlock) => {
    childBlock?.marker && taskMap.children.push({
      id: childBlock.id,
      uuid: childBlock.uuid,
      marker: childBlock.marker.toLowerCase(),
      content: childBlock.content,
    });
  });

  // Add parent with marker
  const parentBlock = await logseq.Editor.getBlock(block.parent.id);
  parentBlock?.marker && (taskMap.parent = {
    id: parentBlock.id,
    uuid: parentBlock.uuid,
    marker: parentBlock.marker.toLowerCase(),
    content: parentBlock.content,
  });

  // Add all siblings with marker
  let previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(blockUuid);
  while (previousSiblingBlock) {
    previousSiblingBlock?.marker && taskMap.siblings.unshift({
      id: previousSiblingBlock.id,
      uuid: previousSiblingBlock.uuid,
      marker: previousSiblingBlock.marker.toLowerCase(),
      content: previousSiblingBlock.content,
    });
    previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(previousSiblingBlock.uuid);
  }
  let nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(blockUuid);
  while (nextSiblingBlock) {
    nextSiblingBlock?.marker && taskMap.siblings.push({
      id: nextSiblingBlock.id,
      uuid: nextSiblingBlock.uuid,
      marker: nextSiblingBlock.marker.toLowerCase(),
      content: nextSiblingBlock.content,
    });
    nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(nextSiblingBlock.uuid);
  }

  return taskMap;
}

/**
 * Update current task map.
 * @param {blockUuid} uuid - The current block UUID in task map.
 * @param {markerChangedTo} markerChangedTo - Which marker the current block changed to.
 */
async function taskUpdate(uuid, markerChangedTo) {
  const currentBlock = await logseq.Editor.getBlock(uuid);
  const taskMap = await getTaskMap(currentBlock);

  const isSiblingsHaveNow = taskMap.siblings.find((task) => task.marker === Markers.now);
  const isSiblingsAllDone = taskMap.siblings.every((task) => task.marker === Markers.done);

  const updateMarker = async (block, targetMarker, { srcMarker, preventMarker } = {}) => {
    if (block) {
      const updateBlock = async () => {
        const content = block.content.slice(block.content.indexOf(' '));
        const marker = targetMarker.toUpperCase();
        await logseq.Editor.updateBlock(block.uuid, marker + content);
        taskUpdate(block.uuid, targetMarker);
      };
      if (block.marker !== targetMarker) {
        // If target marker is not current block marker, then run into next step.
        if (block.marker !== preventMarker && preventMarker !== undefined) {
          // If block marker is not the marker prevented from and has been defined, update block.
          updateBlock();
        } else if (block.marker === srcMarker) {
          // If block marker is the ideal source marker, then update block.
          updateBlock();
        } else if ((srcMarker === undefined && preventMarker === undefined)) {
          // If all source marker and preventMarker all not defined, just update block.
          updateBlock();
        }
      }
    }
  };

  switch (markerChangedTo) {
    case Markers.later:
      // If at least one sibling which has a now marker do not change parent marker,
      // otherwise change parent marker to later.
      if (!isSiblingsHaveNow) {
        updateMarker(taskMap.parent, Markers.later, { srcMarker: Markers.now });
      }
      // All children's now marker changed to later
      taskMap.children.forEach((childBlock) => {
        updateMarker(childBlock, Markers.later, { srcMarker: Markers.now });
      });
      break;
    case Markers.now:
      // Change parent marker to now
      updateMarker(taskMap.parent, Markers.now);
      break;
    case Markers.done:
      if (isSiblingsAllDone) {
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
  console.log('Init task automation service.');
  const mainContainer = parent.document.querySelector('#main-content-container');
  Markers = await preferredMarkers();

  // Use click on mainContentContainer as listener
  //TODO add 'mod+enter' keydown as listener
  function addListenerToTask() {
    //click event listener for inline marker
    mainContainer.addEventListener('click', async (e) => {
      const targetElement = e.target;
      const targetParentClassName = e.path[1].className;
      const targetBlockUuid = e.path[4]?.getAttribute('blockid');
      console.log(targetParentClassName);

      if (targetBlockUuid) {
        for (const key in Markers) {
          if (targetParentClassName === `inline ${Markers[key]}`) {
            if (targetElement.tagName === 'A') {
              taskUpdate(targetBlockUuid, Markers[key]);
            } else if (targetParentClassName !== `inline ${Markers.done}`) {
              taskUpdate(targetBlockUuid, Markers.done);
            } else {
              taskUpdate(targetBlockUuid, Markers.later);
            }
          }
        }
      }
    });
  }

  // Start listener on startup then on routeChanged restart listener
  addListenerToTask();
  logseq.App.onRouteChanged(() => {
    mainContainer.removeEventListener();
    addListenerToTask();
  });
};

logseq.ready(main).catch(console.error);
