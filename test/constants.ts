import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const base_timestamp: number = 1616976000;
export const eth_address: string = `0x${"0".repeat(40)}`;
export const PASSWORD: string = "0x57d0aceec4e308e9af1dd11b09f45bce3fbc92d30ffda7b64f1aaa4005318e92";
export const erc165_interface_id: string = "0x01ffc9a7";
export const qualification_interface_id: string = "0x6762aec5";
export const amount: BigNumber = ethers.utils.parseEther(`1${"0".repeat(9)}`);
export const ETH_address_index: number = 0;
export const tokenB_address_index: number = 1;
export const tokenC_address_index: number = 2;
export const pending_qualification_timestamp: number = 1718374426; // Jun 14 2024

export interface HappyPoolParamType {
  hash: string;
  start_time: number;
  end_time: number;
  message: string;
  exchange_addrs: string[];
  exchange_ratios: number[];
  lock_time: number;
  token_address: string;
  total_tokens: BigNumber;
  limit: BigNumber;
  qualification: string;
}
