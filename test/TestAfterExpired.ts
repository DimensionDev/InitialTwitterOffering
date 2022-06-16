import { assert, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import itoJsonABI from "../artifacts/contracts/ito.sol/HappyTokenPool.json";
//types
import type { HappyTokenPool, QLF, TestToken } from "../types";
import {
  amount,
  base_timestamp,
  eth_address,
  ETH_address_index,
  HappyPoolParamType,
  PASSWORD,
  tokenB_address_index,
  tokenC_address_index,
} from "./constants";
import {
  advanceTimeAndBlock,
  getAvailability,
  getResultFromPoolFill,
  getRevertMsg,
  getVerification,
  revertToSnapShot,
  takeSnapshot,
} from "./helper";

const { expect } = use(chaiAsPromised);

describe("HappyTokenPoolExpiredProcess destruct", () => {
  let createParams: HappyPoolParamType; // fill happyTokenPoolDeployed parameters
  let snapshotId: string;
  let testTokenADeployed: TestToken;
  let testTokenBDeployed: TestToken;
  let testTokenCDeployed: TestToken;

  let happyTokenPoolDeployed: HappyTokenPool;
  let qualificationTesterDeployed: QLF;

  let signers: Signer[];
  let creator: Signer;

  before(async () => {
    signers = await ethers.getSigners();
    creator = signers[0];

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

    await testTokenADeployed.approve(happyTokenPoolDeployed.address, ethers.utils.parseEther("1000000000"));
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
    createParams = {
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
    createParams.end_time = nowTimeStamp + 10368000 - base_timestamp;
    // 150 days
    createParams.lock_time = nowTimeStamp + 12960000 - base_timestamp;
  });

  afterEach(async () => {
    await revertToSnapShot(snapshotId);
    // reset advanced Time
    const blockNumber = ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    const currentTimestamp = Math.floor(new Date().getTime() / 1000);
    const currentDiff = currentTimestamp - block.timestamp;
    await advanceTimeAndBlock(currentDiff);
  });

  it("Should throw error when you're not the creator of the happyTokenPoolDeployed", async () => {
    const accountNotCreator = await signers[4].getAddress();
    const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000;
    createParams.end_time = Math.ceil(fakeTime) - base_timestamp;

    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, createParams);
    await expect(happyTokenPoolDeployed.connect(accountNotCreator).destruct(pool_id)).to.be.revertedWith(
      getRevertMsg("Only the pool creator can destruct."),
    );
  });

  it("Should throw error if happyTokenPoolDeployed is not expired", async () => {
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, createParams);
    await expect(happyTokenPoolDeployed.connect(creator).destruct(pool_id)).to.be.revertedWith(
      getRevertMsg("Not expired yet"),
    );
  });

  it("Should emit DestructSuccess event and withdraw all tokens", async () => {
    const creatorAddress = await creator.getAddress();
    const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
    createParams.end_time = Math.ceil(fakeTime) - base_timestamp;
    createParams.exchange_ratios = [1, 75000, 1, 100, 1, 100];
    createParams.limit = ethers.utils.parseEther("100000");
    createParams.total_tokens = ethers.utils.parseEther("1000000");
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, createParams);
    let previous_eth_balance = await ethers.provider.getBalance(creatorAddress);
    const previous_tokenB_balance = await testTokenBDeployed.balanceOf(creatorAddress);
    const previous_tokenC_balance = await testTokenCDeployed.balanceOf(creatorAddress);

    const exchange_ETH_amount = ethers.utils.parseEther("1.3");

    const verification_address = await signers[2].getAddress();
    const { verification, validation } = getVerification(PASSWORD, verification_address);

    await happyTokenPoolDeployed
      .connect(signers[2])
      .swap(pool_id, verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
        value: exchange_ETH_amount,
      });

    const exchange_tokenB_amount = ethers.utils.parseEther("500");

    await approveThenSwapToken(testTokenBDeployed, signers[5], tokenB_address_index, pool_id, exchange_tokenB_amount);

    const exchange_tokenC_amount = ethers.utils.parseEther("2000");
    const exchange_tokenC_pool_limit = ethers.utils.parseEther("1000");
    await approveThenSwapToken(testTokenCDeployed, signers[6], tokenC_address_index, pool_id, exchange_tokenC_amount);
    {
      const test_addr9 = await signers[9].getAddress();
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, test_addr9);
      expect(result.destructed).to.false;
    }

    await advanceTimeAndBlock(2000 * 1000);
    await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

    const destructSuccessEvents = await happyTokenPoolDeployed.queryFilter(
      happyTokenPoolDeployed.filters.DestructSuccess(),
    );
    const destructSuccessEvent = destructSuccessEvents[0];
    const result = destructSuccessEvent?.args;

    expect(result).to.have.property("id").that.to.be.eq(pool_id);
    expect(result).to.have.property("token_address").that.to.be.eq(testTokenADeployed.address);
    expect(result).to.have.property("remaining_balance");
    expect(result).to.have.property("exchanged_values");

    const ratioETH = BigNumber.from(createParams.exchange_ratios[1]).div(createParams.exchange_ratios[0]);
    const ratioB = BigNumber.from(createParams.exchange_ratios[3]).div(createParams.exchange_ratios[2]);
    const remaining_tokens = BigNumber.from(createParams.total_tokens).sub(
      ratioB.mul(exchange_tokenB_amount).add(ethers.utils.parseEther("100000")).add(ratioETH.mul(exchange_ETH_amount)),
    );

    expect(remaining_tokens).to.be.eq(result.remaining_balance);

    const eth_balance = await ethers.provider.getBalance(creatorAddress);
    const r = eth_balance.sub(previous_eth_balance);

    expect(r.sub(ethers.utils.parseEther("1")).gt(0)).to.be.true;
    expect(r.sub(ethers.utils.parseEther("1.3")).lt(0)).to.be.true;

    const transfer_amount = ethers.utils.parseEther("100000000");
    const tokenB_balance = await testTokenBDeployed.balanceOf(creatorAddress);
    expect(tokenB_balance).to.be.eq(previous_tokenB_balance.sub(transfer_amount).add(exchange_tokenB_amount));

    const tokenC_balance = await testTokenCDeployed.balanceOf(creatorAddress);
    expect(tokenC_balance).to.be.not.eq(previous_tokenC_balance.sub(transfer_amount).add(exchange_tokenC_amount));
    expect(tokenC_balance).to.be.eq(
      previous_tokenC_balance.sub(transfer_amount).add(exchange_tokenC_pool_limit), // 2000e18 exceeds limit
    );
    {
      // `exchanged_tokens` and `exchange_addrs` should still be available
      const test_addr9 = await signers[9].getAddress();
      const result = await getAvailability(happyTokenPoolDeployed, pool_id, test_addr9);

      expect(result.exchange_addrs).to.eql(createParams.exchange_addrs);
      expect(result.exchanged_tokens).to.eql([exchange_ETH_amount, exchange_tokenB_amount, exchange_tokenC_pool_limit]);
      expect(result.destructed).to.true;
    }
    {
      // destruct again, do nothing
      const contractTokenABalanceBeforeDestructAgain = await testTokenADeployed.balanceOf(
        happyTokenPoolDeployed.address,
      );
      const contractTokenBBalanceBeforeDestructAgain = await testTokenBDeployed.balanceOf(
        happyTokenPoolDeployed.address,
      );
      const contractTokenCBalanceBeforeDestructAgain = await testTokenCDeployed.balanceOf(
        happyTokenPoolDeployed.address,
      );
      await happyTokenPoolDeployed.connect(creator).destruct(pool_id);
      const contractTokenABalanceAfterDestructAgain = await testTokenADeployed.balanceOf(
        happyTokenPoolDeployed.address,
      );
      const contractTokenBBalanceAfterDestructAgain = await testTokenBDeployed.balanceOf(
        happyTokenPoolDeployed.address,
      );
      const contractTokenCBalanceAfterDestructAgain = await testTokenCDeployed.balanceOf(
        happyTokenPoolDeployed.address,
      );
      assert.isTrue(contractTokenABalanceBeforeDestructAgain.eq(contractTokenABalanceAfterDestructAgain));
      assert.isTrue(contractTokenBBalanceBeforeDestructAgain.eq(contractTokenBBalanceAfterDestructAgain));
      assert.isTrue(contractTokenCBalanceBeforeDestructAgain.eq(contractTokenCBalanceAfterDestructAgain));
    }
  });

  it("Should emit DestructSuccess event and withdraw all tokens when remaining_tokens is zero", async () => {
    const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
    createParams.end_time = Math.ceil(fakeTime) - base_timestamp;
    createParams.exchange_ratios = [1, 75000, 1, 100, 1, 100];
    createParams.limit = ethers.utils.parseEther("50000");
    createParams.total_tokens = ethers.utils.parseEther("50000");
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, createParams);

    const exchange_tokenB_amount = ethers.utils.parseEther("500");
    await approveThenSwapToken(testTokenBDeployed, signers[3], tokenB_address_index, pool_id, exchange_tokenB_amount);

    await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

    const events = await happyTokenPoolDeployed.queryFilter(happyTokenPoolDeployed.filters.DestructSuccess());
    const event = events[0];
    const result = event?.args;

    expect(result).to.have.property("id").that.to.be.eq(pool_id);
    expect(result).to.have.property("token_address").that.to.be.eq(testTokenADeployed.address);
    expect(result.remaining_balance).that.to.be.eq("0");
    expect(result).to.have.property("exchanged_values");
  });

  async function approveThenSwapToken(test_token, swapper_acc, token_address_index, pool_id, exchange_amount) {
    const swapper_addr = await swapper_acc.getAddress();
    const r = getVerification(PASSWORD, swapper_addr);

    const verification = r.verification;
    //const validation = r.validation;

    const transfer_amount = ethers.utils.parseEther("100000000");
    await test_token.transfer(swapper_addr, transfer_amount);
    const approve_amount = exchange_amount;
    await test_token.connect(swapper_acc).approve(happyTokenPoolDeployed.address, approve_amount);
    await happyTokenPoolDeployed
      .connect(swapper_acc)
      .swap(pool_id, verification, token_address_index, exchange_amount, [pool_id]);
  }
});
