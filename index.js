import '@logseq/libs';


//TODO get current parent blocks and child blocks status
//getBlockProperties
async function getWorkTree (currentBlockUuid) {
   
  return workTree;
}

//TODO specify conditions
//TODO update status method
async function updateStatus (block,status) {
  const blockUuid = block.uuid;
  const workTree = await getWorkTree(blockUuid);
  if (block.marker === status.todo) {
    console.log(`Get block marker: ${block.marker}`);
    let blockContent = block.content.slice(block.content.indexOf(' '));
    await logseq.Editor.updateBlock(currentBlockUuid, status.done + blockContent);
    logseq.UI.showMsg(`${block.marker}`);
  };
}

const main = async () => {
  console.log('Init automatic done service.')

  const config = await logseq.App.getUserConfigs();
  const preferredWorkflow = config.preferredWorkflow;

  let status = {};
  if (preferredWorkflow === 'now') {
      status = {todo: 'LATER',doing: 'NOW',done: 'DONE'};
    } else {
      status = {todo: 'TODO',doing: 'DOING',done: 'DONE'};
    }

  logseq.DB.onChanged(async () => {
    const block = await logseq.Editor.getCurrentBlock();
    const currentBlockUuid = block.uuid;

    //Only listen changes on the block which has a todo or doing marker
    if (block?.marker === status.todo || block?.marker === status.doing) {
      logseq.DB.onBlockChanged(currentBlockUuid, ({block,txData}) => {
        //Using txData for triggering block marker changed to done
        if (txData[10][2] === status.done){
          updateStatus(block,status);
        }
      });
    }
  });
};

logseq.ready(main).catch(console.error);
