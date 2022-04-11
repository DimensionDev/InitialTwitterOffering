import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

const { base_timestamp } = require('../test/constants');
const ADDRESS_TABLE_PATH = path.resolve(__dirname, "..", "helper_scripts", "contract-addresses.csv");

type MyMapLikeType = Record<string, string>;

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const network = hre.hardhatArguments.network ?? 'ropsten';
  const deployedContracts = await loadDeployedAddress();
  const proxyAddress = deployedContracts[network];

  if (false) {
    // deploy, we normally do this only once
    if (true) {
      const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
      const HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPoolImpl, [base_timestamp]);
      await HappyTokenPoolProxy.deployed();
      console.log('HappyTokenPoolProxy: ' + HappyTokenPoolProxy.address);

      const admin = await upgrades.admin.getInstance();
      const impl_addr = await admin.getProxyImplementation(HappyTokenPoolProxy.address);
      console.log('Implementation address: ', impl_addr);
      await hre.run('verify:verify', {
        address: impl_addr,
        constructorArguments: [],
      });
    }

    if (false) {
      const tx = await deploy('QLF', {
        from: deployer,
        args: [0],
        log: true,
      });

      console.log(tx.address);
      await hre.run('verify:verify', {
        address: tx.address,
        constructorArguments: [0],
      });
    }
  } else {
    // upgrade contract
    const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
    const instance = await upgrades.upgradeProxy(proxyAddress, HappyTokenPoolImpl);

    await instance.deployTransaction.wait();
    const admin = await upgrades.admin.getInstance();
    const impl = await admin.getProxyImplementation(proxyAddress);
    // example: `npx hardhat verify --network rinkeby 0x8974Ce3955eE1306bA89687C558B6fC1E5be777B`
    await hre.run('verify:verify', {
      address: impl,
      constructorArguments: [],
    });
  }
};

async function loadDeployedAddress(): Promise<MyMapLikeType> {
  const data = await fs.readFile(ADDRESS_TABLE_PATH, "utf-8");
  const columns = ['Chain', 'HappyTokenPool', 'Qualification', 'v1Block', 'v2Block'];
  const records = parse(data, { delimiter: ',', columns, from: 2 });
  let deployedContract: MyMapLikeType = {};
  for (const { Chain, HappyTokenPool } of records) {
    deployedContract[Chain.toLowerCase()] = HappyTokenPool;
  }
  return deployedContract;
}

func.tags = ['HappyTokenPool'];

module.exports = func;
