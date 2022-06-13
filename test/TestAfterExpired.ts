import { ethers, upgrades } from "hardhat";
import { BytesLike, Signer, BigNumber } from "ethers";
import {
  takeSnapshot,
  revertToSnapShot,
  getRevertMsg,
  advanceTimeAndBlock,
  getVerification,
  getResultFromPoolFill,
  getAvailability,
} from "./helper";
import { assert, use } from "chai";
import chaiAsPromised from "chai-as-promised";

const { expect } = use(chaiAsPromised);

import {
  base_timestamp,
  eth_address,
  PASSWORD,
  amount,
  ETH_address_index,
  tokenB_address_index,
  tokenC_address_index,
  HappyPoolParamType,
} from "./constants";

import itoJsonABI from "../artifacts/contracts/ito.sol/HappyTokenPool.json";
const itoInterface = new ethers.utils.Interface(itoJsonABI.abi);

//types
import type { TestToken, HappyTokenPool, QLF } from "../types";

describe("HappyTokenPoolExpiredProcess", () => {
  let fpp2: HappyPoolParamType; // fill happyTokenPoolDeployed parameters
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

  describe("destruct()", async () => {
    beforeEach(async () => {
      snapshotId = await takeSnapshot();
      fpp2 = {
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
      fpp2.end_time = nowTimeStamp + 10368000 - base_timestamp;
      // 150 days
      fpp2.lock_time = nowTimeStamp + 12960000 - base_timestamp;
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
      const account_not_creator = await signers[4].getAddress();
      const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000;
      fpp2.end_time = Math.ceil(fakeTime) - base_timestamp;

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);
      await expect(happyTokenPoolDeployed.connect(account_not_creator).destruct(pool_id)).to.be.revertedWith(
        getRevertMsg("Only the pool creator can destruct."),
      );
    });

    it("Should throw error if happyTokenPoolDeployed is not expired", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);
      await expect(happyTokenPoolDeployed.connect(creator).destruct(pool_id)).to.be.revertedWith(
        getRevertMsg("Not expired yet"),
      );
    });

    it("Should emit DestructSuccess event and withdraw all tokens", async () => {
      const creator_address = await creator.getAddress();
      const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
      fpp2.end_time = Math.ceil(fakeTime) - base_timestamp;
      fpp2.exchange_ratios = [1, 75000, 1, 100, 1, 100];
      fpp2.limit = ethers.utils.parseEther("100000");
      fpp2.total_tokens = ethers.utils.parseEther("1000000");
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);
      let previous_eth_balance = await ethers.provider.getBalance(creator_address);
      const previous_tokenB_balance = await testTokenBDeployed.balanceOf(creator_address);
      const previous_tokenC_balance = await testTokenCDeployed.balanceOf(creator_address);

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

      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.DestructSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;

      expect(result).to.have.property("id").that.to.be.eq(pool_id);
      expect(result).to.have.property("token_address").that.to.be.eq(testTokenADeployed.address);
      expect(result).to.have.property("remaining_balance");
      expect(result).to.have.property("exchanged_values");

      const ratioETH = BigNumber.from(fpp2.exchange_ratios[1]).div(fpp2.exchange_ratios[0]);
      const ratioB = BigNumber.from(fpp2.exchange_ratios[3]).div(fpp2.exchange_ratios[2]);
      const remaining_tokens = BigNumber.from(fpp2.total_tokens).sub(
        BigNumber.from(ratioB)
          .mul(exchange_tokenB_amount)
          .add(ethers.utils.parseEther("100000"))
          .add(ratioETH.mul(exchange_ETH_amount)),
      );

      expect(remaining_tokens).to.be.eq(result.remaining_balance.toString());

      const eth_balance = await ethers.provider.getBalance(creator_address);
      const r = BigNumber.from(eth_balance.sub(previous_eth_balance).toString());

      expect(r.sub(ethers.utils.parseEther("1")).gt(0)).to.be.true;
      expect(r.sub(ethers.utils.parseEther("1.3")).lt(0)).to.be.true;

      const transfer_amount = ethers.utils.parseEther("100000000");
      const tokenB_balance = await testTokenBDeployed.balanceOf(creator_address);
      expect(tokenB_balance.toString()).to.be.eq(
        BigNumber.from(previous_tokenB_balance.toString()).sub(transfer_amount).add(exchange_tokenB_amount),
      );

      const tokenC_balance = await testTokenCDeployed.balanceOf(creator_address);
      expect(tokenC_balance.toString()).to.be.not.eq(
        BigNumber.from(previous_tokenC_balance).sub(transfer_amount).add(exchange_tokenC_amount),
      );
      expect(tokenC_balance.toString()).to.be.eq(
        BigNumber.from(previous_tokenC_balance.toString()).sub(transfer_amount).add(exchange_tokenC_pool_limit), // 2000e18 exceeds limit
      );
      {
        // `exchanged_tokens` and `exchange_addrs` should still be available
        const test_addr9 = await signers[9].getAddress();
        const result = await getAvailability(happyTokenPoolDeployed, pool_id, test_addr9);

        expect(result.exchange_addrs).to.eql(fpp2.exchange_addrs);
        expect(result.exchanged_tokens.map((bn) => bn.toString())).to.eql([
          exchange_ETH_amount.toString(),
          exchange_tokenB_amount.toString(),
          exchange_tokenC_pool_limit.toString(),
        ]);
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
      fpp2.end_time = Math.ceil(fakeTime) - base_timestamp;
      fpp2.exchange_ratios = [1, 75000, 1, 100, 1, 100];
      fpp2.limit = ethers.utils.parseEther("50000");
      fpp2.total_tokens = ethers.utils.parseEther("50000");
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);

      const exchange_tokenB_amount = ethers.utils.parseEther("500");
      await approveThenSwapToken(testTokenBDeployed, signers[3], tokenB_address_index, pool_id, exchange_tokenB_amount);

      await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.DestructSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;

      expect(result).to.have.property("id").that.to.be.eq(pool_id);
      expect(result).to.have.property("token_address").that.to.be.eq(testTokenADeployed.address);
      expect(result.remaining_balance.toString()).that.to.be.eq("0");
      expect(result).to.have.property("exchanged_values");
    });

    async function approveThenSwapToken(test_token, swapper_acc, token_address_index, pool_id, exchange_amount) {
      const swapper_addr = await swapper_acc.getAddress();
      const r = getVerification(PASSWORD, swapper_addr);

      const verification = r.verification;
      const validation = r.validation;

      const transfer_amount = ethers.utils.parseEther("100000000");
      await test_token.transfer(swapper_addr, transfer_amount);
      const approve_amount = exchange_amount;
      await test_token.connect(swapper_acc).approve(happyTokenPoolDeployed.address, approve_amount);
      await happyTokenPoolDeployed
        .connect(swapper_acc)
        .swap(pool_id, verification, token_address_index, exchange_amount, [pool_id]);
    }
  });
});
