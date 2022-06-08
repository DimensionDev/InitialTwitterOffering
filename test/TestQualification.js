const BigNumber = require("bignumber.js");
const { soliditySha3, hexToNumber, sha3 } = require("web3-utils");
const chai = require("chai");
const expect = chai.expect;
const assert = chai.assert;
chai.use(require("chai-as-promised"));
const helper = require("./helper");
const {
  base_timestamp,
  eth_address,
  erc165_interface_id,
  qualification_interface_id,
  PASSWORD,
  amount,
  ETH_address_index,
  tokenB_address_index,
  tokenC_address_index,
  pending_qualification_timestamp,
} = require("./constants");

//let base_timestamp_var = 1640966400; //2022-01-01 00:00:00

const itoJsonABI = require("../artifacts/contracts/ito.sol/HappyTokenPool.json");
const itoInterface = new ethers.utils.Interface(itoJsonABI.abi);

const itoJsonABI_V1_0 = require("../artifacts/contracts/ito_v1.0.sol/HappyTokenPool_v1_0.json");
const itoInterface_V1_0 = new ethers.utils.Interface(itoJsonABI_V1_0.abi);

const proxyAdminABI = require("@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json");

const qualificationJsonABI = require("../artifacts/contracts/qualification.sol/QLF.json");
const qualificationInterface = new ethers.utils.Interface(qualificationJsonABI.abi);

let qualificationTesterDeployed;

let signers;

describe("qualification", () => {
  before(async () => {
    signers = await ethers.getSigners();
    creator = signers[0];
    ito_user = signers[1];

    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    const TestTokenC = await ethers.getContractFactory("TestTokenC");
    const QualificationTester = await ethers.getContractFactory("QLF");

    const testTokenA = await TestTokenA.deploy(amount);
    const testTokenB = await TestTokenB.deploy(amount);
    const testTokenC = await TestTokenC.deploy(amount);
    const qualificationTester = await QualificationTester.deploy(0);
    const qualificationTester2 = await QualificationTester.deploy(pending_qualification_timestamp);

    testTokenADeployed = await testTokenA.deployed();
    testTokenBDeployed = await testTokenB.deployed();
    testTokenCDeployed = await testTokenC.deployed();
    qualificationTesterDeployed = await qualificationTester.deployed();
    qualificationTesterDeployed2 = await qualificationTester2.deployed();

    HappyTokenPool = await ethers.getContractFactory("HappyTokenPool");
    HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPool, [base_timestamp], {
      unsafeAllow: ["delegatecall"],
    });
    happyTokenPoolDeployed = new ethers.Contract(HappyTokenPoolProxy.address, itoJsonABI.abi, creator);
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
      await qualificationTesterDeployed2.connect(signers[10]).logQualified(signers[10].address, [fakeMerkleProof]);
      let result = await getLogResult();
      expect(result).to.be.null;

      await helper.advanceTimeAndBlock(pending_qualification_timestamp + 1000);
      await qualificationTesterDeployed2.connect(signers[11]).logQualified(signers[11].address, [fakeMerkleProof]);
      result = await getLogResult();
      expect(result.qualified).to.be.true;

      await qualificationTesterDeployed2.connect(signers[10]).logQualified(signers[10].address, [fakeMerkleProof]);
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
