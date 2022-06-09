import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { takeSnapshot, revertToSnapShot, getRevertMsg, advanceTimeAndBlock } from "./helper";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";

import {
  base_timestamp,
  erc165_interface_id,
  qualification_interface_id,
  eth_address,
  PASSWORD,
  amount,
  pending_qualification_timestamp,
  HappyPoolParamType,
} from "./constants";

const { expect } = use(chaiAsPromised);

const itoJsonABI = require("../artifacts/contracts/ito.sol/HappyTokenPool.json");

const qualificationJsonABI = require("../artifacts/contracts/qualification.sol/QLF.json");
const qualificationInterface = new ethers.utils.Interface(qualificationJsonABI.abi);

//types
import type { TestToken, HappyTokenPool, QLF } from "../types";

describe("qualification", () => {
  let testTokenADeployed: TestToken;
  let testTokenBDeployed: TestToken;
  let testTokenCDeployed: TestToken;
  let HappyTokenPool: HappyTokenPool;

  let happyTokenPoolDeployed: HappyTokenPool;
  let qualificationTesterDeployed: QLF;
  let qualificationTesterDeployed2: QLF;

  let signers: Signer[];
  let creator: Signer;
  let ito_user: Signer;

  before(async () => {
    signers = await ethers.getSigners();
    creator = signers[0];
    ito_user = signers[1];

    const TestTokenA = await ethers.getContractFactory("TestToken");
    const TestTokenB = await ethers.getContractFactory("TestToken");
    const TestTokenC = await ethers.getContractFactory("TestToken");
    const QualificationTester = await ethers.getContractFactory("QLF");

    const testTokenA = await TestTokenA.deploy(amount, "TestTokenA", "TESTA");
    const testTokenB = await TestTokenB.deploy(amount, "TestTokenB", "TESTB");
    const testTokenC = await TestTokenC.deploy(amount, "TestTokenC", "TESTC");
    const qualificationTester = await QualificationTester.deploy(0);
    const qualificationTester2 = await QualificationTester.deploy(pending_qualification_timestamp);

    testTokenADeployed = (await testTokenA.deployed()) as TestToken;
    testTokenBDeployed = (await testTokenB.deployed()) as TestToken;
    testTokenCDeployed = (await testTokenC.deployed()) as TestToken;
    qualificationTesterDeployed = (await qualificationTester.deployed()) as QLF;
    qualificationTesterDeployed2 = (await qualificationTester2.deployed()) as QLF;

    const HappyTokenPool = await ethers.getContractFactory("HappyTokenPool");
    const HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPool, [base_timestamp], {
      unsafeAllow: ["delegatecall"],
    });
    happyTokenPoolDeployed = new ethers.Contract(
      HappyTokenPoolProxy.address,
      itoJsonABI.abi,
      creator,
    ) as HappyTokenPool;

    // qualificationTesterDeployed = await qualificationTester.deployed();
    // qualificationTesterDeployed2 = await qualificationTester2.deployed();

    // HappyTokenPool = await ethers.getContractFactory("HappyTokenPool");
    // HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPool, [base_timestamp], {
    //   unsafeAllow: ["delegatecall"],
    // });
    // happyTokenPoolDeployed = new ethers.Contract(HappyTokenPoolProxy.address, itoJsonABI.abi, creator);
  });

  it("should check the integrity of qualification contract", async () => {
    const isERC165 = await qualificationTesterDeployed.supportsInterface(erc165_interface_id);
    const isQualification = await qualificationTesterDeployed.supportsInterface(qualification_interface_id);
    expect(isERC165).to.be.true;
    expect(isQualification).to.be.true;

    const unknown_interface_id = "0x87ab3aaa";
    const invalid_interface_id = "0xffffffff";
    const isok_1 = await qualificationTesterDeployed.supportsInterface(unknown_interface_id);
    const isok_2 = await qualificationTesterDeployed.supportsInterface(invalid_interface_id);
    expect(isok_1).to.be.false;
    expect(isok_2).to.be.false;
  });

  describe("logQualified()", () => {
    it("should always return false once swap before start_time", async () => {
      const fakeMerkleProof = "0x1234567833dc44ce38f1024d3ea7d861f13ac29112db0e5b9814c54b12345678";
      const addr10 = await signers[10].getAddress();
      await qualificationTesterDeployed2.connect(signers[10]).logQualified(addr10, [fakeMerkleProof]);
      let result = await getLogResult();
      expect(result).to.be.null;

      await advanceTimeAndBlock(pending_qualification_timestamp + 1000);
      const addr11 = await signers[11].getAddress();
      await qualificationTesterDeployed2.connect(signers[11]).logQualified(addr11, [fakeMerkleProof]);
      result = await getLogResult();
      //TODO
      if (!result) {
        return;
      }
      expect(result.qualified).to.be.true;

      await qualificationTesterDeployed2.connect(signers[10]).logQualified(addr10, [fakeMerkleProof]);
      result = await getLogResult();
      expect(result).to.be.null;
    });

    async function getLogResult() {
      const logs = await ethers.provider.getLogs(qualificationTesterDeployed2.filters.Qualification());
      if (logs.length === 0) return null;
      const result = qualificationInterface.parseLog(logs[0]);
      return result.args;
    }
  });
});
