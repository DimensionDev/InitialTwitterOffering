import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { takeSnapshot, revertToSnapShot, getRevertMsg } from "./helper";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";

import { base_timestamp, eth_address, PASSWORD, amount, HappyPoolParamType } from "./constants";

const { expect } = use(chaiAsPromised);

import itoJsonABI from "../artifacts/contracts/ito.sol/HappyTokenPool.json";
const itoInterface = new ethers.utils.Interface(itoJsonABI.abi);

//types
import type { TestToken, HappyTokenPool, QLF } from "../types";

describe("HappyTokenPool", () => {
  let creationParams: HappyPoolParamType; // fill happyTokenPoolDeployed parameters
  let snapshotId: string;
  let testTokenADeployed: TestToken;
  let testTokenBDeployed: TestToken;
  let testTokenCDeployed: TestToken;

  let happyTokenPoolDeployed: HappyTokenPool;
  let qualificationTesterDeployed: QLF;

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

    testTokenADeployed = (await testTokenA.deployed()) as TestToken;
    testTokenBDeployed = (await testTokenB.deployed()) as TestToken;
    testTokenCDeployed = (await testTokenC.deployed()) as TestToken;
    qualificationTesterDeployed = (await qualificationTester.deployed()) as QLF;

    const HappyTokenPool = await ethers.getContractFactory("HappyTokenPool");
    const HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPool, [base_timestamp], {
      unsafeAllow: ["delegatecall"],
    });
    happyTokenPoolDeployed = new ethers.Contract(
      HappyTokenPoolProxy.address,
      itoJsonABI.abi,
      creator,
    ) as HappyTokenPool;
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
    creationParams = {
      hash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(PASSWORD)),
      start_time: 0,
      end_time: 10368000, // duration 120 days
      message: "Hello From the Outside Hello From the Outside",
      exchange_addrs: [eth_address, testTokenBDeployed.address, testTokenCDeployed.address],
      exchange_ratios: [1, 10000, 1, 2000, 4000, 1],
      lock_time: 12960000, // duration 150 days
      token_address: testTokenADeployed.address,
      total_tokens: ethers.utils.parseEther("10000"),
      limit: ethers.utils.parseEther("1000"),
      qualification: qualificationTesterDeployed.address,
    };
    const nowTimeStamp = Math.floor(new Date().getTime() / 1000);
    // 120 days
    creationParams.end_time = nowTimeStamp + 10368000 - base_timestamp;
    // 120 days
    creationParams.lock_time = nowTimeStamp + 12960000 - base_timestamp;
  });

  afterEach(async () => {
    await revertToSnapShot(snapshotId);
  });

  describe("constructor()", async () => {
    it("Should variables be initalized properly", async () => {
      const base_time = await happyTokenPoolDeployed.base_time();
      expect(base_time.toString()).that.to.be.eq(base_timestamp.toString());
    });
  });

  describe("fill_pool()", async () => {
    it("Should throw error when start time is greater than end time", async () => {
      const invalidParams = {
        ...creationParams,
        start_time: creationParams.end_time + 100,
      };

      await testTokenADeployed.approve(happyTokenPoolDeployed.address, invalidParams.total_tokens);

      await expect(happyTokenPoolDeployed.fill_pool.apply(null, Object.values(invalidParams))).to.be.revertedWith(
        getRevertMsg("Start time should be earlier than end time."),
      );
    });

    it("Should throw error when limit is greater than total_tokens", async () => {
      const invalidParams = {
        ...creationParams,
        limit: ethers.utils.parseEther("100001"),
        total_tokens: ethers.utils.parseEther("10000"),
      };

      await testTokenADeployed.approve(happyTokenPoolDeployed.address, creationParams.total_tokens);

      await expect(happyTokenPoolDeployed.fill_pool.apply(null, Object.values(invalidParams))).to.be.revertedWith(
        getRevertMsg("Limit needs to be less than or equal to the total supply"),
      );
    });

    it("Should throw error when the size of exchange_ratios does not correspond to exchange_addrs", async () => {
      const invalidParams = {
        ...creationParams,
        exchange_ratios: creationParams.exchange_ratios.concat([4000, 1]),
      };

      await testTokenADeployed.approve(happyTokenPoolDeployed.address, creationParams.total_tokens);

      await expect(happyTokenPoolDeployed.fill_pool.apply(null, Object.values(invalidParams))).to.be.revertedWith(
        getRevertMsg("Size of ratios = 2 * size of exchange_addrs"),
      );
    });

    it("Should throw error when tokens approved to spend is less than total_tokens", async () => {
      const tokens_approved = ethers.utils.parseEther("1000");
      const invalidParams = {
        ...creationParams,
        total_tokens: ethers.utils.parseEther("1001"),
      };

      await testTokenADeployed.approve(happyTokenPoolDeployed.address, tokens_approved);

      await expect(happyTokenPoolDeployed.fill_pool.apply(null, Object.values(invalidParams))).to.be.revertedWith(
        getRevertMsg("ERC20: transfer amount exceeds allowance"),
      );
    });

    // TODO: check
    // it("Should throw error when time is larger than 28 bits", async () => {
    //   const invalidParams = {
    //     ...creationParams,
    //     start_time: 2 ** 28 - 1,
    //     end_time: 2 ** 28 + 99,
    //     lock_time: 0,
    //   };

    //   await testTokenADeployed.approve(happyTokenPoolDeployed.address, creationParams.total_tokens);

    //   await expect(happyTokenPoolDeployed.fill_pool.apply(null, Object.values(invalidParams))).to.be.revertedWith(
    //     getRevertMsg("Time is larger than 28 bits"),
    //   );
    // });

    it("Should emit fillSuccess event correctly when a happyTokenPoolDeployed is filled", async () => {
      const creator_address = await creator.getAddress();
      const user_address = await ito_user.getAddress();

      expect(creationParams.token_address).that.to.be.eq(testTokenADeployed.address);

      const creatorBalanceBefore = await testTokenADeployed.balanceOf(creator_address);
      const contractBalanceBefore = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);

      await testTokenADeployed.approve(happyTokenPoolDeployed.address, creationParams.total_tokens);
      await happyTokenPoolDeployed.fill_pool.apply(null, Object.values(creationParams));
      {
        // filter with signature, should work
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
        const parsedLog = itoInterface.parseLog(logs[0]);
        const result = parsedLog.args;
        expect(result.total.toString()).that.to.be.eq(creationParams.total_tokens);
      }
      {
        // filtered with user's address(not creator), should not get anything
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess(user_address));
        expect(logs.length).that.to.be.eq(0);
      }

      // filter with *indexed creator*, should work as expected
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess(creator_address));
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;
      expect(result.total.toString()).that.to.be.eq(creationParams.total_tokens);
      expect(result).to.have.property("id").that.to.not.be.null;
      expect(result).to.have.property("creator").that.to.not.be.null;
      expect(result.creation_time.toString()).to.length(10);
      expect(result).to.have.property("token_address").that.to.be.eq(testTokenADeployed.address);
      expect(result.message).to.be.eq("Hello From the Outside Hello From the Outside");
      // TODO: add a new class(balanceChecker???) to get rid of duplicated code
      const creatorBalanceAfter = await testTokenADeployed.balanceOf(creator_address);
      const contractBalanceAfter = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
      expect(creatorBalanceAfter).to.be.eq(creatorBalanceBefore.sub(creationParams.total_tokens));
      expect(contractBalanceAfter).to.be.eq(contractBalanceBefore.add(creationParams.total_tokens));
    });

    it("Should emit fillSuccess event when none of ratio gcd is not equal to 1 and fill token is very small", async () => {
      const newCreationParams = {
        ...creationParams,
        exchange_ratios: [2, 7, 3, 2, 3, 11],
        total_tokens: BigNumber.from("1"),
        limit: BigNumber.from("0"),
      };

      await testTokenADeployed.approve(happyTokenPoolDeployed.address, creationParams.total_tokens);
      await happyTokenPoolDeployed.fill_pool.apply(null, Object.values(newCreationParams));
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;
      expect(result).to.have.property("id").that.to.not.be.null;
    });
  });
});
