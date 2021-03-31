async function advanceTime(time) {
  await network.provider.send('evm_increaseTime', [time])
}

async function advanceBlock() {
  await network.provider.send('evm_mine', [])
}

async function takeSnapshot() {
  return network.provider.send('evm_snapshot', [])
}

async function revertToSnapShot(id) {
  await network.provider.send('evm_revert', [id])
}

async function advanceTimeAndBlock(time) {
  await advanceTime(time)
  await advanceBlock()
  return Promise.resolve(ethers.provider.getBlock())
}
  
module.exports = {
  advanceTime,
  advanceBlock,
  advanceTimeAndBlock,
  takeSnapshot,
  revertToSnapShot
}
