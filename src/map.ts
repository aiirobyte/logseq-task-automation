import '@logseq/libs';
import { BlockEntity, BlockUUID, EntityID } from '@logseq/libs/dist/LSPlugin';
import { Markers } from './utils';

interface BaseBlockEntity {
  id: EntityID;
  uuid: BlockUUID;
  content: string;
  marker?: string;
}

interface TaskMap {
  current: BaseBlockEntity;
  parent?: BaseBlockEntity;
  children?: BaseBlockEntity[];
  siblings?: BaseBlockEntity[];
  nextSibling?: BaseBlockEntity;
}

/**
 * Get current block task map.
 * @param {string} block - Current editing block
 * @return {object} taskMap
 */
async function getTaskMap(block: BlockEntity): Promise<TaskMap> {
  // TODO get reference task status
  const blockId: EntityID = block.id;
  const blockUuid: BlockUUID = block.uuid;

  const blockWithChildren = (await logseq.Editor.getBlock(blockId, {
    includeChildren: true,
  })) as BlockEntity;

  const taskMap: TaskMap = {
    current: {
      id: blockId,
      uuid: blockUuid,
      content: block.content,
      marker: block?.marker,
    },
  };

  // Add all children with marker
  let children =
    blockWithChildren?.children
      ?.filter((child) => 'marker' in child) // filter out BlockUUIDTuple
      .map((child) => ({
        // map BlockEntity to BaseBlockEntity
        id: (<BlockEntity>child).id,
        uuid: (<BlockEntity>child).uuid,
        marker: (<BlockEntity>child).marker,
        content: (<BlockEntity>child).content,
      })) ?? []; // use empty array if null or undefined
  if (children.length > 0) taskMap.children = children;

  // Add parent with marker
  const parentBlock = await logseq.Editor.getBlock(block.parent.id);
  if (parentBlock?.marker) {
    taskMap.parent = {
      id: parentBlock.id,
      uuid: parentBlock.uuid,
      marker: parentBlock.marker,
      content: parentBlock.content,
    }
  };

  // Add all siblings with marker
  let previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(blockUuid);
  if (previousSiblingBlock) {
    taskMap.siblings = []
    while (previousSiblingBlock) {
      previousSiblingBlock?.marker &&
        (taskMap.siblings).unshift({
          id: previousSiblingBlock.id,
          uuid: previousSiblingBlock.uuid,
          marker: previousSiblingBlock.marker,
          content: previousSiblingBlock.content,
        });
      previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(previousSiblingBlock.uuid);
    }
  }

  let nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(blockUuid);
  if (nextSiblingBlock) {
    if (taskMap?.siblings === undefined) taskMap.siblings = [];
    nextSiblingBlock?.marker &&
      (taskMap.nextSibling = {
        id: nextSiblingBlock.id,
        uuid: nextSiblingBlock.uuid,
        marker: nextSiblingBlock.marker,
        content: nextSiblingBlock.content,
      });
    while (nextSiblingBlock) {
      nextSiblingBlock?.marker &&
        (taskMap.siblings).push({
          id: nextSiblingBlock.id,
          uuid: nextSiblingBlock.uuid,
          marker: nextSiblingBlock.marker,
          content: nextSiblingBlock.content,
        });
      nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(nextSiblingBlock.uuid);
    }
  }

  return taskMap;
}

/**
 * Update current task map.
 * @param {blockUuid} uuid - Current block UUID in task map.
 * @param {markerChangedTo} markerChangedTo - Which marker the current block changed to.
 * Available values: Markers.keys, nonMarker.
 */
export async function updateTaskMap(uuid: BlockUUID, markerChangedTo: string, markers: Markers) {
  const currentBlock = (await logseq.Editor.getBlock(uuid)) as BlockEntity;
  const taskMap = await getTaskMap(currentBlock);
  console.log(taskMap);

  const allNowSiblings = taskMap?.siblings?.filter((task) => task.marker === markers.now) ?? [];
  const isSiblingsAllDone = taskMap?.siblings?.every((task) => task.marker === markers.done);

  const updateMarker = async (
    block: BaseBlockEntity | undefined,
    targetMarker: string,
    {
      srcMarker = undefined as string | undefined,
      preventMarker = undefined as string | undefined,
      disableMapIterate = undefined as boolean | undefined,
    } = {},
  ) => {
    if (block) {
      const updateBlock = async () => {
        if (block?.marker) {
          const content = block.content.slice(block.content.indexOf(' '));
          const marker = targetMarker;
          await logseq.Editor.updateBlock(block.uuid, marker + content);
          // only iterate when updating task tree
          disableMapIterate !== true && updateTaskMap(block.uuid, targetMarker, markers);
        } else {
          // updated from non-task will not iterate
          const { content } = block;
          const marker = `${targetMarker} `;
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

  const updateMapMethod = async (markerToChange: string) => {
    switch (markerToChange) {
      case markers.later:
        // If at least one sibling which has a now marker do not change parent marker,
        // otherwise only change parent marker to later when it's now.
        if (allNowSiblings.length === 0 && taskMap.parent) {
          updateMarker(taskMap.parent, markers.later, { srcMarker: markers.now });
        }
        // All children's now marker changed to later
        if ((taskMap.children?.length ?? 0) > 0) {
          taskMap.children?.forEach((childBlock) => {
            updateMarker(childBlock, markers.later, { srcMarker: markers.now });
          });
        }
        break;
      case markers.now:
        // change parent block to now
        updateMarker(taskMap.parent, markers.now);
        // setting all now sibling block to later
        allNowSiblings.forEach((block) => {
          updateMarker(block, markers.later, { disableMapIterate: true });
        });
        break;
      case markers.done:
        if (
          !(taskMap.nextSibling === undefined || taskMap.nextSibling?.marker === markers.done) &&
          taskMap.parent
        ) {
          // If next sibling and parent both have marker, then change nextSibling marker to now
          await updateMarker(taskMap.nextSibling, markers.now);
        } else if (isSiblingsAllDone) {
          updateMarker(taskMap.parent, markers.done);
        } else if (allNowSiblings.length === 0) {
          updateMarker(taskMap.parent, markers.later, { srcMarker: markers.now });
        }
        taskMap.children?.forEach((childBlock) => {
          updateMarker(childBlock, markers.done);
        });
        break;
      default:
    }
  };

  // when current block don't have marker, only update task map when changed marker not later
  if (taskMap.current?.marker) {
    await updateMarker(taskMap.current, markerChangedTo, { disableMapIterate: true });
    await updateMapMethod(markerChangedTo);
  } else {
    markerChangedTo === markers.later
      ? await updateMarker(taskMap.current, markerChangedTo, { disableMapIterate: true })
      : await updateMarker(taskMap.current, markerChangedTo, { disableMapIterate: true }),
      await updateMapMethod(markerChangedTo);
  }
}
