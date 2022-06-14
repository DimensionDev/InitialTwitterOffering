import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import itoJsonABI from "../artifacts/contracts/ito.sol/HappyTokenPool.json";
//types
import type { HappyTokenPool, QLF, TestToken } from "../types";
import { amount, base_timestamp, eth_address, HappyPoolParamType, PASSWORD, tokenB_address_index } from "./constants";
import { getAvailability, getResultFromPoolFill, getVerification, revertToSnapShot, takeSnapshot } from "./helper";

const { expect } = use(chaiAsPromised);

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
  let creatorAddress: string;
  let user_address: string;

  before(async () => {
    signers = await ethers.getSigners();
    creator = signers[0];
    ito_user = signers[1];

    creatorAddress = await creator.getAddress();
    user_address = await ito_user.getAddress();

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

  describe("check_availability()", async () => {
    beforeEach(async () => {
      await testTokenADeployed.approve(happyTokenPoolDeployed.address, creationParams.total_tokens);
    });

    it("Should return empty when pool id does not exist", async () => {
      const invalidId = ethers.utils.formatBytes32String("id not exist");
      const result = await happyTokenPoolDeployed.connect(ito_user).check_availability(invalidId);
      await expect(result[0]).to.be.an("array").that.is.empty;
    });

    it("Should return status `started === true` when current time greater than start_time", async () => {
      const fakeTime = (new Date().getTime() - 1000 * 10) / 1000;
      creationParams.start_time = Math.ceil(fakeTime) - base_timestamp;
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);

      expect(result.started).to.be.true;
    });

    it("Should return status `started === false` when current time less than start_time", async () => {
      const fakeTime = (new Date().getTime() + 1000 * 10) / 1000;
      creationParams.start_time = Math.ceil(fakeTime) - base_timestamp;

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);

      expect(result.started).to.be.false;
    });

    it("Should return status `expired === true` when current time less than end_time", async () => {
      const fakeTime = (new Date().getTime() - 1000 * 10) / 1000;
      creationParams.end_time = Math.ceil(fakeTime) - base_timestamp;

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);

      expect(result.expired).to.be.true;
    });

    it("Should return status `expired === false` when current time less than end_time", async () => {
      const fakeTime = (new Date().getTime() + 1000 * 10) / 1000;
      creationParams.end_time = Math.ceil(fakeTime) - base_timestamp;

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);

      expect(result.expired).to.be.false;
    });

    it("Should return the same exchange_addrs which fill the happyTokenPoolDeployed", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      expect(result.exchange_addrs).to.eql([eth_address, testTokenBDeployed.address, testTokenCDeployed.address]);
    });

    it("Should return the exchanged_tokens filled with zero when there was no exchange", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      expect(result.exchanged_tokens.map((bn) => ethers.utils.parseEther(bn.toString()).toString())).to.eql([
        "0",
        "0",
        "0",
      ]);
    });

    it("Should return the zero swapped token when the spender did no exchange before", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      expect(ethers.utils.parseEther(result.swapped.toString()).toString()).to.be.eq("0");
    });

    it("Should return same number of remaining token as total tokens when there was no exchange", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      expect(result.remaining.toString()).to.be.eq(creationParams.total_tokens);
    });

    it("Should minus the number of remaining token by exchange amount after swap", async () => {
      const transfer_amount = ethers.utils.parseEther("100000000");
      const approve_amount = ethers.utils.parseEther("0.005");

      await testTokenBDeployed.connect(creator).transfer(user_address, transfer_amount);
      await testTokenBDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const availability_before = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      expect(availability_before.claimed).to.be.eq(false);
      const { verification, validation } = getVerification(PASSWORD, user_address);
      await happyTokenPoolDeployed
        .connect(ito_user)
        .swap(pool_id, verification, tokenB_address_index, approve_amount, [pool_id]);
      const availability_current = await getAvailability(happyTokenPoolDeployed, pool_id, creatorAddress);
      const ratio = (creationParams.exchange_ratios[3] as number) / (creationParams.exchange_ratios[2] as number); // tokenA <=> tokenB
      const exchange_tokenA_amount = approve_amount.mul(ratio * 100000).div(100000);
      expect(availability_before.remaining.sub(availability_current.remaining).toString()).to.be.eq(
        exchange_tokenA_amount.toString(),
      );
      expect(availability_current.claimed).to.be.eq(false);

      expect(availability_current.start_time.toString()).to.be.eq(
        (creationParams.start_time + base_timestamp).toString(),
      );
      expect(availability_current.end_time.toString()).to.be.eq((creationParams.end_time + base_timestamp).toString());
      expect(availability_current.unlock_time.toString()).to.be.eq(
        (creationParams.lock_time + base_timestamp).toString(),
      );
      expect(availability_current.qualification_addr).to.be.eq(creationParams.qualification);
    });

    it("Should return remaining token correctly when none of ratio gcd is not equal to 1 and tokens are very small", async () => {
      creationParams.exchange_ratios = [2, 7, 3, 2, 3, 11];
      creationParams.total_tokens = BigNumber.from("10");
      creationParams.limit = BigNumber.from("10");
      const signer = signers[1];
      creationParams.lock_time = 0;
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)
      const result_before = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      expect(result_before.remaining.toString()).to.be.eq(creationParams.total_tokens);
      expect(result_before.claimed).to.be.eq(false);

      const transfer_amount = BigNumber.from("2");
      const approve_amount = BigNumber.from("2");

      await testTokenBDeployed.connect(creator).transfer(user_address, transfer_amount);
      await testTokenBDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount);
      const { verification, validation } = getVerification(PASSWORD, user_address);
      await happyTokenPoolDeployed
        .connect(signer)
        .swap(pool_id, verification, tokenB_address_index, approve_amount, [pool_id]);
      const result_now = await getAvailability(happyTokenPoolDeployed, pool_id, user_address);
      const tokenB_balance = await testTokenBDeployed.balanceOf(user_address);
      const tokenA_balance = await testTokenADeployed.balanceOf(user_address);

      expect(tokenA_balance.toString()).to.be.eq("1");
      expect(tokenB_balance.toString()).to.be.eq("0");
      expect(result_now.remaining.toString()).to.be.eq("9");
      expect(result_now.claimed).to.be.eq(true);
    });
  });
});
