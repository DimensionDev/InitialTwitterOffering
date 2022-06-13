import { network, ethers } from "hardhat";
import { providers } from "ethers";
import { soliditySha3, hexToNumber, sha3 } from "web3-utils";

/**
 * @param {number} time second
 */
export async function advanceTime(time: number) {
  await network.provider.send("evm_increaseTime", [time]);
}

export async function advanceBlock() {
  await network.provider.send("evm_mine", []);
}

export async function takeSnapshot() {
  return network.provider.send("evm_snapshot", []);
}

/**
 * @param {string} id snapshot id
 */
export async function revertToSnapShot(id: string) {
  await network.provider.send("evm_revert", [id]);
}

export const getRevertMsg = (msg: string): string =>
  `VM Exception while processing transaction: reverted with reason string '${msg}'`;

/**
 * @param {number} time second
 * @return {Promise<providers.Block>} Get the latest block from the network
 */
export async function advanceTimeAndBlock(time: number): Promise<providers.Block> {
  await advanceTime(time);
  await advanceBlock();
  return Promise.resolve(ethers.provider.getBlock("latest"));
}

export function getVerification(password, account) {
  let hash: string | Uint8Array = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(password));
  let hash_bytes = Uint8Array.from(Buffer.from(hash.slice(2), "hex"));
  hash = hash_bytes.slice(0, 5);
  hash = "0x" + Buffer.from(hash).toString("hex");
  return {
    verification: soliditySha3(hexToNumber(hash), account),
    validation: sha3(account),
  };
}
