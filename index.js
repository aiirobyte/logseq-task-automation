import '@logseq/libs';


let Markers;

const preferredMarkers = async () => {
  const { preferredWorkflow } = await logseq.App.getUserConfigs();
  return preferredWorkflow == 'now' ? {later: 'later',now: 'now',done: 'done'} : {later: 'todo',now: 'doing',done: 'done'};
};

//TODO get reference task status
async function getTaskMap (block) {
  let taskMap = {
    parent: null,
    current: {id:block.id, uuid:block.uuid, marker:block.marker},
    siblings: [],
    children: []
  };
  const blockId = block.id;
  const blockUuid = block.uuid;

  block = await logseq.Editor.getBlock(blockId,{includeChildren:true});

  //Add all children with marker
  block.children?.forEach(childBlock => {
    childBlock?.marker
      ? taskMap.children.push({id:childBlock.id, uuid:childBlock.uuid, marker:childBlock.marker.toLowerCase(), content:childBlock.content})
      : null ;
  })

  //Add parent with marker
  const parentBlock = await logseq.Editor.getBlock(block.parent.id);
  parentBlock?.marker
    ? taskMap.parent = {id:parentBlock.id, uuid:parentBlock.uuid, marker:parentBlock.marker.toLowerCase(), content:parentBlock.content}
    : null ;

  //Add all siblings with marker
  let previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(blockUuid);
  while (previousSiblingBlock && previousSiblingBlock?.marker) {
    taskMap.siblings.unshift({id:previousSiblingBlock.id, uuid:previousSiblingBlock.uuid, marker:previousSiblingBlock.marker.toLowerCase(), content:previousSiblingBlock.content});
    previousSiblingBlock = await logseq.Editor.getPreviousSiblingBlock(previousSiblingBlock.uuid);
  }
  let nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(blockUuid);
  while (nextSiblingBlock && nextSiblingBlock.marker?.marker) {
    taskMap.siblings.push({id:nextSiblingBlock.id, uuid:nextSiblingBlock.uuid, marker:nextSiblingBlock.marker.toLowerCase(), content: nextSiblingBlock.content});
    nextSiblingBlock = await logseq.Editor.getNextSiblingBlock(nextSiblingBlock.uuid);
  }

  return taskMap;
}

async function taskUpdate(uuid,markerChangedTo) {
  const currentBlock = await logseq.Editor.getBlock(uuid);
  const taskMap = await getTaskMap(currentBlock);

  switch (markerChangedTo) {
    case Markers.later:
      //Change parent and children marker from now to later
      if (taskMap.parent.marker == Markers.now) {
        //If at least one sibling which has a now marker, do not change parent marker
        const isHaveNow = taskMap.siblings.find(task => task.marker == Markers.now);
        if (!isHaveNow) {
          const content = taskMap.parent.content.slice(taskMap.parent.content.indexOf(' '));
          const markerContent = Markers.later.toUpperCase();
          logseq.Editor.updateBlock(taskMap.parent.uuid, markerContent+content);
        }
      }
      //All children's now marker changed to later
      taskMap.children.forEach(childBlock => {
        childBlock.marker == Markers.now
        ? logseq.Editor.updateBlock(childBlock.uuid, Markers.later.toUpperCase()+childBlock.content.slice(childBlock.content.indexOf(' ')))
        : null ;
      })
      break;
    case Markers.now:
      //Change parent marker to now
      taskMap.parent.marker == Markers.later
        ? logseq.Editor.updateBlock(taskMap.parent.uuid, Markers.now.toUpperCase()+taskMap.parent.content.slice(taskMap.parent.content.indexOf(' ')))
        : null ;
        break;
    case Markers.done:
      const isHaveNow = taskMap.siblings.find(task => task.marker == Markers.now);
      const isAllDone = taskMap.siblings.every(task => task.marker == Markers.done);
      
      if (isAllDone) {
        //When parent marker is not done, then if all siblings are done set parent marker to done
        if (taskMap.parent.marker !== Markers.done) {
          const content = taskMap.parent.content.slice(taskMap.parent.content.indexOf(' '));
          const markerContent = Markers.done.toUpperCase();
          logseq.Editor.updateBlock(taskMap.parent.uuid, markerContent+content);
        } 
      } else if (!isHaveNow) {
        //When parent marker is now, then if at least one sibling has a now marker, do not change parent marker
        if (taskMap.parent.marker == Markers.now) {
          const content = taskMap.parent.content.slice(taskMap.parent.content.indexOf(' '));
          const markerContent = Markers.later.toUpperCase();
          logseq.Editor.updateBlock(taskMap.parent.uuid, markerContent+content);
        }
      }
      //Change all child block to done
      taskMap.children.forEach(childBlock => {
        childBlock.marker !== Markers.done
        ? logseq.Editor.updateBlock(childBlock.uuid, Markers.done.toUpperCase()+childBlock.content.slice(childBlock.content.indexOf(' ')))
        : null ;
      })
  }
}

const main = async () => {
  console.log('Init automatic done service.')
  const mainContainer = parent.document.querySelector('#main-content-container');
  Markers = await preferredMarkers();

  //Use click on mainContentContainer as listener
  function addListenerToTask() {
    mainContainer.addEventListener('click', async (e) => {
      const targetBlockUuid = e.path[4]?.getAttribute('blockid');
      const targetElement = e.target;

      if (targetBlockUuid) {
        if (targetElement.tagName == 'A') {
          targetElement.classList.contains(`${Markers.later.toUpperCase()}`)
            ? taskUpdate(targetBlockUuid, Markers.later)
            : taskUpdate(targetBlockUuid, Markers.now) ;
        } else {
          targetElement.classList.contains('checked')
            ? taskUpdate(targetBlockUuid, Markers.later)
            : taskUpdate(targetBlockUuid, Markers.done) ;
        }
      }
    });
  }

  //Start listener on startup then on routeChanged restart listener
  addListenerToTask();
  logseq.App.onRouteChanged(() => {
    mainContainer.removeEventListener();
    addListenerToTask;
  });
};

logseq.ready(main).catch(console.error);
