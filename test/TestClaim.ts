import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber, FixedNumber } from "ethers";
import {
  takeSnapshot,
  revertToSnapShot,
  getRevertMsg,
  advanceTimeAndBlock,
  getVerification,
  getResultFromPoolFill,
  getAvailability,
} from "./helper";

import { use } from "chai";
import chaiAsPromised from "chai-as-promised";

import {
  HappyPoolParamType,
  base_timestamp,
  eth_address,
  PASSWORD,
  amount,
  tokenB_address_index,
  tokenC_address_index,
} from "./constants";

const { expect, assert } = use(chaiAsPromised);

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
  let pool_user: Signer;
  let pool_user_address: string;

  before(async () => {
    signers = await ethers.getSigners();
    creator = signers[0];
    pool_user = signers[2];

    pool_user_address = await pool_user.getAddress();

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

  describe("claim()", async () => {
    let verification;
    let validation;
    let exchange_amount;
    before(async () => {
      const transfer_amount = ethers.utils.parseEther("100000000");
      await testTokenBDeployed.connect(creator).transfer(pool_user_address, transfer_amount);
      await testTokenCDeployed.connect(creator).transfer(pool_user_address, transfer_amount);
    });

    beforeEach(async () => {
      await testTokenADeployed
        .connect(creator)
        .approve(happyTokenPoolDeployed.address, ethers.utils.parseEther("100000000"));
      const r = getVerification(PASSWORD, await signers[2].getAddress());
      verification = r.verification;
      validation = r.validation;
      exchange_amount = BigNumber.from("10000000000");
    });

    it("should does no affect when claimable is zero", async () => {
      creationParams.lock_time = 0;
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)
      await happyTokenPoolDeployed.connect(signers[3]).claim([pool_id]);
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
      expect(logs).to.have.length(0);
    });

    it("should emit multiple ClaimSuccess events when claim successfully and set claimable to zero", async () => {
      const approve_amount = BigNumber.from("10000000000"); // 1 * 10^10

      await testTokenBDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount);
      await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount);

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const { id: pool_id2 } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, creationParams.lock_time)

      const userTokenBBalanceBeforeSwap = await testTokenBDeployed.balanceOf(pool_user_address);
      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user_address);
      const contractTokenBBalanceBeforeSwap = await testTokenBDeployed.balanceOf(happyTokenPoolDeployed.address);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

      await happyTokenPoolDeployed
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, approve_amount, [pool_id]);

      await happyTokenPoolDeployed
        .connect(pool_user)
        .swap(pool_id2, verification, tokenB_address_index, approve_amount, [pool_id]);

      const userTokenABalanceBeforeClaim = await testTokenADeployed.balanceOf(pool_user_address);
      const userTokenBBalanceAfterSwap = await testTokenBDeployed.balanceOf(pool_user_address);
      const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user_address);
      const contractTokenABalanceBeforeClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
      const contractTokenBBalanceAfterSwap = await testTokenBDeployed.balanceOf(happyTokenPoolDeployed.address);
      const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

      expect(contractTokenBBalanceAfterSwap).to.be.eq(contractTokenBBalanceBeforeSwap.add(approve_amount));
      expect(contractTokenCBalanceAfterSwap).to.be.eq(contractTokenCBalanceBeforeSwap.add(approve_amount));
      expect(userTokenBBalanceAfterSwap).to.be.eq(userTokenBBalanceBeforeSwap.sub(approve_amount));
      expect(userTokenCBalanceAfterSwap).to.be.eq(userTokenCBalanceBeforeSwap.sub(approve_amount));

      const availabilityPrevious = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);

      expect(availabilityPrevious.swapped.toString())
        .to.be.eq(approve_amount.div(creationParams.exchange_ratios[tokenC_address_index * 2]).toString())
        .and.to.be.eq("2500000");
      expect(availabilityPrevious.claimed).to.be.false;

      const availabilityPrevious2 = await getAvailability(happyTokenPoolDeployed, pool_id2, pool_user_address);

      expect(availabilityPrevious2.swapped.toString())
        .to.be.eq(approve_amount.mul(creationParams.exchange_ratios[tokenB_address_index * 2 + 1]).toString())
        .and.to.be.eq("20000000000000");
      expect(availabilityPrevious2.claimed).to.be.false;

      await advanceTimeAndBlock(creationParams.lock_time);

      // contains duplicated pool-id and an invalid pool id
      const invalid_pool_id = "0x1234567833dc44ce38f1024d3ea7d861f13ac29112db0e5b9814c54b12345678";
      await happyTokenPoolDeployed.connect(pool_user).claim([pool_id, pool_id2, pool_id2, invalid_pool_id]);

      const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);
      expect(availabilityNow.claimed).to.be.true;

      const availabilityNow2 = await getAvailability(happyTokenPoolDeployed, pool_id2, pool_user_address);
      expect(availabilityNow2.claimed).to.be.true;

      const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user_address);
      const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);

      // tokenB ==> tokenA
      const ratio_b = (creationParams.exchange_ratios[3] as number) / (creationParams.exchange_ratios[2] as number);
      // tokenC ==> tokenA
      const ratio_c = (creationParams.exchange_ratios[5] as number) / (creationParams.exchange_ratios[4] as number);
      const exchangedTokenA_pool_1 = approve_amount.mul(ratio_c * 100000).div(100000);
      const exchangedTokenA_pool_2 = approve_amount.mul(ratio_b * 100000).div(100000);
      const exchangedTokenA_total = exchangedTokenA_pool_1.add(exchangedTokenA_pool_2);

      expect(userTokenABalanceAfterClaim.toString()).to.be.eq(userTokenABalanceBeforeClaim.add(exchangedTokenA_total));
      expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
        contractTokenABalanceBeforeClaim.sub(exchangedTokenA_total),
      );

      // "swapped amount" should not change
      expect(availabilityNow.swapped.toString())
        .to.be.eq(exchangedTokenA_pool_1.toString())
        .and.to.be.eq(availabilityPrevious.swapped.toString());

      expect(availabilityNow2.swapped.toString())
        .to.be.eq(exchangedTokenA_pool_2.toString())
        .and.to.be.eq(availabilityPrevious2.swapped.toString());

      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());

      expect(logs).to.have.length(2);

      let parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;
      parsedLog = itoInterface.parseLog(logs[1]);
      const result2 = parsedLog.args;

      expect(result.to_value.toString()).to.be.eq(availabilityPrevious.swapped.toString());

      expect(result2.to_value.toString()).to.be.eq(availabilityPrevious2.swapped.toString());
    });

    it("should still be able to claim after destruct pool", async () => {
      const approve_amount = BigNumber.from("10000000000"); // 1 * 10^10
      await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount);

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, creationParams.lock_time)
      await happyTokenPoolDeployed
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, approve_amount, [pool_id]);

      const availabilityPrevious = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);
      expect(availabilityPrevious.claimed).to.be.false;

      await advanceTimeAndBlock(creationParams.lock_time);

      await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

      await happyTokenPoolDeployed.connect(pool_user).claim([pool_id]);
      const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);

      expect(availabilityNow.swapped.toString()).and.to.be.eq(availabilityPrevious.swapped.toString());
      expect(availabilityNow.claimed).to.be.true;
      expect(availabilityNow.destructed).to.be.true;

      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;

      expect(result.to_value.toString()).to.be.eq(availabilityPrevious.swapped.toString());
    });

    describe("setUnlockTime()", async () => {
      it("should setUnlockTime work", async () => {
        const approve_amount = BigNumber.from("10000000000"); // 1 * 10^10
        await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);

        const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
        await happyTokenPoolDeployed
          .connect(signers[2])
          .swap(pool_id, verification, tokenC_address_index, approve_amount, [pool_id]);

        const availabilityPrevious = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);

        // should do nothing if pool is locked
        {
          await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id]);
          const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);

          expect(availabilityPrevious.swapped.toString())
            .to.be.eq(availabilityNow.swapped.toString())
            .and.to.be.eq(approve_amount.div(creationParams.exchange_ratios[tokenC_address_index * 2]).toString())
            .and.to.be.eq("2500000");
          expect(availabilityNow.claimed).to.be.false;

          const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());

          expect(logs).to.have.length(0);
        }
        {
          // can NOT set to 0
          await expect(happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)).to.be.revertedWith(
            getRevertMsg("Cannot set to 0"),
          );
        }
        if (true) {
          // 48 bits integer overflow, expect error
          const unlock_time = ethers.utils.parseEther("10000000000"); // 1 *10^28
          await expect(happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, unlock_time)).to.be.reverted;
        }
        const now_in_second = Math.floor(Date.now() / 1000);
        const new_unlock_time = now_in_second - base_timestamp;
        {
          // only the "pool owner" can setUnlockTime
          const accountNotCreator = signers[4];
          expect(
            happyTokenPoolDeployed.connect(accountNotCreator).setUnlockTime(pool_id, new_unlock_time),
          ).to.be.revertedWith(getRevertMsg("Pool Creator Only"));
        }
        {
          await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, new_unlock_time);
          {
            await advanceTimeAndBlock(1000);
            const { unlock_time: poolUnlockTime } = await getAvailability(
              happyTokenPoolDeployed,
              pool_id,
              pool_user_address,
            );
            expect(poolUnlockTime.toString()).and.to.be.eq(now_in_second.toString());
          }
          await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id]);
          const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);
          expect(availabilityNow.swapped.toString()).and.to.be.eq(availabilityPrevious.swapped.toString());
          expect(availabilityNow.claimed).to.be.true;

          const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
          const parsedLog = itoInterface.parseLog(logs[0]);
          const result = parsedLog.args;
          expect(result.to_value.toString()).to.be.eq(availabilityPrevious.swapped.toString());
        }
      });
    });

    it("should everything work when unlock_time is 0(no lock)", async () => {
      const approve_amount = BigNumber.from("10000000000");
      await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount);

      creationParams.exchange_ratios = [1, 1, 1, 1, 1, 1];
      creationParams.lock_time = 0;
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user_address);
      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user_address);
      const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

      await happyTokenPoolDeployed
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, approve_amount, [pool_id]);
      {
        const availability = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);
        expect(availability.swapped.toString()).to.be.eq(approve_amount.toString());
        expect(availability.claimed).to.be.true;
      }
      const userTokenABalanceAfterSwap = await testTokenADeployed.balanceOf(pool_user_address);
      const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user_address);
      const contractTokenABalanceAfterSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
      const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

      // tokens swapped immmediately
      expect(userTokenABalanceAfterSwap).to.be.eq(userTokenABalanceBeforeSwap.add(approve_amount));
      expect(contractTokenCBalanceAfterSwap).to.be.eq(contractTokenCBalanceBeforeSwap.add(approve_amount));
      expect(contractTokenABalanceAfterSwap.toString()).to.be.eq(contractTokenABalanceBeforeSwap.sub(approve_amount));
      expect(userTokenCBalanceAfterSwap).to.be.eq(userTokenCBalanceBeforeSwap.sub(approve_amount));
      {
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
        const parsedLog = itoInterface.parseLog(logs[0]);
        const result = parsedLog.args;
        expect(result).to.have.property("swapper").that.to.be.eq(pool_user_address);
        expect(result).to.have.property("claimed").that.to.be.eq(true);
      }
      {
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
        const parsedLog = itoInterface.parseLog(logs[0]);
        const result = parsedLog.args;
        expect(result).to.have.property("claimer").that.to.be.eq(pool_user_address);
      }
      // can not swap again
      {
        await expect(
          happyTokenPoolDeployed
            .connect(pool_user)
            .swap(pool_id, verification, tokenC_address_index, approve_amount, [pool_id]),
        ).to.be.revertedWith(getRevertMsg("Already swapped"));
      }
      // can not setUnlockTime when pool lock_time is 0
      {
        const now_in_second = Math.floor(Date.now() / 1000);
        const new_unlock_time = now_in_second - base_timestamp;
        await expect(
          happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, new_unlock_time),
        ).to.be.revertedWith("Too Late");
      }
      // can not claim
      {
        await happyTokenPoolDeployed.connect(pool_user).claim([pool_id]);
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user_address);
        const userTokenCBalanceAfterClaim = await testTokenCDeployed.balanceOf(pool_user_address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
        const contractTokenCBalanceAfterClaim = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);
        assert.isTrue(userTokenABalanceAfterSwap.eq(userTokenABalanceAfterClaim));
        assert.isTrue(userTokenCBalanceAfterSwap.eq(userTokenCBalanceAfterClaim));
        assert.isTrue(contractTokenABalanceAfterSwap.eq(contractTokenABalanceAfterClaim));
        assert.isTrue(contractTokenCBalanceAfterSwap.eq(contractTokenCBalanceAfterClaim));
      }
      {
        const availability = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user_address);
        expect(availability.swapped.toString()).to.be.eq(approve_amount.toString());
        expect(availability.claimed).to.be.true;
      }
    });
  });
});
