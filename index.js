import '@logseq/libs';

//Inputs 5 numbered blocks when called
// async function insertSomeBlocks (e) {
//   console.log('Open the calendar!')
//   let numberArray = [1, 2, 3, 4, 5]
//   for (const number in numberArray){
//   logseq.App.showMsg("Function has been run")
//   logseq.Editor.insertBlock(e.uuid, `This is block ${numberArray[number]}`, {sibling: true})}

//   }

//TODO get parent blocks and child block todo status
//getBlockProperties
async function getWorkTree (currentBlockUuid) {
  return;
}

//TODO specify conditions
//TODO update status method
async function updateStatus (currentBlockUuid,status) {
  const block = await logseq.Editor.getBlock(currentBlockUuid);
  const workTree = await getWorkTree(currentBlockUuid);
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
    let currentBlockUuid = block.uuid;

    updateStatus(currentBlockUuid,status);
  });
};

logseq.ready(main).catch(console.error);
