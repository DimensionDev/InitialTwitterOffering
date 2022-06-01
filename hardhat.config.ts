import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-abi-exporter";
import { HardhatUserConfig } from "hardhat/config";
import {
  HardhatNetworkConfig,
  HardhatSolidityConfig,
  HardhatGasReporterConfig,
  EtherscanConfig,
} from "./SmartContractProjectConfig/config";

const networks = HardhatNetworkConfig;
const solidity = HardhatSolidityConfig;
const gasReporter = HardhatGasReporterConfig;
const etherscan = EtherscanConfig;

const config: HardhatUserConfig = {
  networks,
  mocha: {
    timeout: 500000,
  },
  solidity,
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  etherscan,
  gasReporter,
  abiExporter: {
    path: "./abi",
    runOnCompile: true,
    flat: true,
    only: ["HappyTokenPool", "QLF"],
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
    alwaysGenerateOverloads: false,
  },
};

export default config;
