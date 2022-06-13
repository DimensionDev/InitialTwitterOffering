import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber, BytesLike } from "ethers";
import {
  takeSnapshot,
  revertToSnapShot,
  getRevertMsg,
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
  ETH_address_index,
  tokenB_address_index,
  tokenC_address_index,
  pending_qualification_timestamp,
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
  let qualificationTesterDeployed2: QLF;

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

  describe("swap()", async () => {
    let verification;
    let validation;
    let exchange_amount;
    before(async () => {
      const transfer_amount = ethers.utils.parseEther("100000000");
      await testTokenBDeployed.connect(creator).transfer(user_address, transfer_amount);
      await testTokenCDeployed.connect(creator).transfer(user_address, transfer_amount);
    });

    beforeEach(async () => {
      await testTokenADeployed
        .connect(creator)
        .approve(happyTokenPoolDeployed.address, ethers.utils.parseEther("100000000"));
      const r = getVerification(PASSWORD, user_address);
      verification = r.verification;
      validation = r.validation;
      exchange_amount = BigNumber.from("10000000000");
    });

    it("Should throw error when happyTokenPoolDeployed id does not exist", async () => {
      const pool_id = ethers.utils.formatBytes32String("id not exist");
      await expect(
        happyTokenPoolDeployed.swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith("Transaction reverted: function call to a non-contract account");
    });

    it("Should throw error when happyTokenPoolDeployed is waiting for start", async () => {
      const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000;
      creationParams.start_time = Math.ceil(fakeTime) - base_timestamp;
      creationParams.end_time = creationParams.start_time + 10;
      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;
      await testTokenCDeployed.connect(creator).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      await expect(
        happyTokenPoolDeployed.swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith("reverted with reason string 'Not started.'");
    });

    it("Should throw error when swapped by a blocked account", async () => {
      creationParams.qualification = qualificationTesterDeployed2.address;
      const badGuy = signers[9];

      const { verification } = await prepare(badGuy);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      await expect(
        happyTokenPoolDeployed
          .connect(badGuy)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.reverted;

      async function prepare(signer) {
        const transfer_amount = ethers.utils.parseEther("100000000");
        await testTokenCDeployed.connect(creator).transfer(signer.address, transfer_amount);
        const approve_amount = BigNumber.from("10000000000");
        exchange_amount = approve_amount;
        await testTokenCDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount);
        return getVerification(PASSWORD, signer.address);
      }
    });

    it("Should throw error when happyTokenPoolDeployed is expired", async () => {
      const fakeTime = (new Date().getTime() - 1000 * 3600 * 24) / 1000;
      creationParams.end_time = Math.ceil(fakeTime) - base_timestamp;
      creationParams.start_time = creationParams.end_time - 10;
      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;
      await testTokenCDeployed.connect(creator).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      await expect(
        happyTokenPoolDeployed
          .connect(ito_user)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith(getRevertMsg("Expired."));
    });

    it("Should throw error when password wrong", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      const wrong_password: string = "0x65b6e837e8eb590ed46e2b27d4341c1f1696beb59978e32755da775c134c6231";
      await expect(
        happyTokenPoolDeployed.swap(pool_id, wrong_password, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith("reverted with reason string 'Wrong Password'");
    });

    it('Should throw error when "approved amount" less than "exchange amount"', async () => {
      const approve_amount = BigNumber.from("1000000000");
      exchange_amount = BigNumber.from("2000000000");

      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      await expect(
        happyTokenPoolDeployed
          .connect(ito_user)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.reverted;
    });

    it("Should better not draw water with a sieve", async () => {
      const approve_amount = BigNumber.from("0");
      exchange_amount = BigNumber.from("0");

      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      await expect(
        happyTokenPoolDeployed
          .connect(ito_user)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith("reverted with reason string 'Better not draw water with a sieve'");
    });

    it("Should throw error when one account swap more than once", async () => {
      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;
      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      await happyTokenPoolDeployed
        .connect(ito_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      await expect(
        happyTokenPoolDeployed
          .connect(ito_user)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith(getRevertMsg("Already swapped"));
    });

    it("Should throw error when swap-token-index is invalid", async () => {
      const ratio = 10 ** 10;
      creationParams.exchange_ratios = [1, ratio];
      creationParams.exchange_addrs = [eth_address];
      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;
      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      await expect(
        happyTokenPoolDeployed
          .connect(ito_user)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.reverted;
      await expect(
        happyTokenPoolDeployed.connect(ito_user).swap(pool_id, verification, 100, exchange_amount, [pool_id]),
      ).to.be.reverted;
    });

    it("Should throw error when ratio is not valid", async () => {
      // slightly smaller than 128 bits unsigned integer
      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;
      {
        // 128 bits integer overflow
        const tokenCRatio = BigNumber.from(`1${"0".repeat(38)}`);
        creationParams.exchange_ratios = [1, 75000, 1, 100, 1, tokenCRatio];
        await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
        const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
        await expect(
          happyTokenPoolDeployed
            .connect(ito_user)
            .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
        ).to.be.revertedWith("SafeCast: value doesn't fit in 128 bits");
      }
    });

    it("Should throw error when balance is not enough", async () => {
      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;

      let tokenCBalance = await testTokenCDeployed.balanceOf(user_address);
      assert.isTrue(tokenCBalance.gt(exchange_amount));

      // Transfer most tokens to another account, only "exchange_amount/2" left
      const leftAmount = ethers.BigNumber.from(exchange_amount).div(2);
      const transferAmount = tokenCBalance.sub(leftAmount);
      await testTokenCDeployed.connect(ito_user).transfer(creatorAddress, transferAmount);
      tokenCBalance = await testTokenCDeployed.balanceOf(user_address);
      assert.isFalse(tokenCBalance.gt(exchange_amount));

      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      await expect(
        happyTokenPoolDeployed
          .connect(ito_user)
          .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // Transfer test tokens back
      await testTokenCDeployed.connect(creator).transfer(user_address, transferAmount);

      tokenCBalance = await testTokenCDeployed.balanceOf(user_address);
      assert.isTrue(tokenCBalance.gt(exchange_amount));
    });

    it("Should emit swapSuccess when swap successful", async () => {
      const swapUser = signers[2];
      const swapUserAddress = await swapUser.getAddress();

      const approve_amount = BigNumber.from("10000000000");
      exchange_amount = approve_amount;

      await testTokenCDeployed.connect(creator).transfer(swapUserAddress, exchange_amount);

      await testTokenCDeployed.connect(swapUser).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(swapUserAddress);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

      const { verification } = await getVerification(PASSWORD, swapUserAddress);

      await happyTokenPoolDeployed
        .connect(swapUser)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;
      const ratio = (creationParams.exchange_ratios[5] as number) / (creationParams.exchange_ratios[4] as number); // tokenA <=> tokenC

      const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(swapUserAddress);
      const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

      expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(contractTokenCBalanceBeforeSwap.add(exchange_amount));
      expect(userTokenCBalanceAfterSwap).to.be.eq(userTokenCBalanceBeforeSwap.mod(exchange_amount));

      expect(result).to.have.property("id").that.to.not.be.null;
      expect(result).to.have.property("swapper").that.to.not.be.null;
      expect(result.from_value.toString()).that.to.be.eq(String(exchange_amount));
      expect(result.to_value.toString()).that.to.be.eq(String(exchange_amount * ratio));
      expect(result).to.have.property("from_address").that.to.be.eq(testTokenCDeployed.address);
      expect(result).to.have.property("to_address").that.to.be.eq(testTokenADeployed.address);
      expect(result).to.have.property("claimed").that.to.be.eq(false);
    });

    it("Should swap the maximum number of token equals to limit", async () => {
      const approve_amount = ethers.utils.parseEther("50000000");
      exchange_amount = approve_amount;
      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount);
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      await happyTokenPoolDeployed
        .connect(ito_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;
      const ratio = (creationParams.exchange_ratios[5] as number) / (creationParams.exchange_ratios[4] as number); // tokenA <=> tokenC

      await expect(result.to_value.toString())
        .to.be.eq(creationParams.limit)
        .and.to.not.be.eq(String(exchange_amount * ratio));
    });

    it("Should swap various numbers of token", async () => {
      creationParams.total_tokens = ethers.utils.parseEther("100");
      creationParams.limit = ethers.utils.parseEther("50");
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);
      // 0.004 ETH => 40 TESTA
      const approve_amount = ethers.utils.parseEther("0.004");
      exchange_amount = approve_amount;

      var vr = getVerification(PASSWORD, await signers[4].getAddress());

      await happyTokenPoolDeployed.connect(signers[4]).swap(pool_id, vr.verification, 0, exchange_amount, [pool_id], {
        value: approve_amount,
      });
      {
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
        const parsedLog = itoInterface.parseLog(logs[0]);
        const result_eth = parsedLog.args;
        const ratio_eth = (creationParams.exchange_ratios[1] as number) / (creationParams.exchange_ratios[0] as number); // tokenA <=> tokenC
        await expect(result_eth.to_value.toString()).that.to.be.eq(exchange_amount.mul(ratio_eth));
      }
      // 0.02 TESTB => 40 TESTA
      const _transfer_amount = ethers.utils.parseEther("0.02");
      await testTokenBDeployed.connect(creator).transfer(await signers[3].getAddress(), _transfer_amount);

      const approve_amount2 = ethers.utils.parseEther("0.02");
      const exchange_amount2 = approve_amount2;
      await testTokenBDeployed.connect(signers[3]).approve(happyTokenPoolDeployed.address, approve_amount2);

      var vr = getVerification(PASSWORD, await signers[3].getAddress());
      await happyTokenPoolDeployed.connect(signers[3]).swap(pool_id, vr.verification, 1, exchange_amount2, [pool_id]);
      {
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
        const parsedLog = itoInterface.parseLog(logs[0]);
        const result_b = parsedLog.args;
        const ratio_b = (creationParams.exchange_ratios[3] as number) / (creationParams.exchange_ratios[2] as number); // tokenA <=> tokenC

        await expect(result_b.to_value.toString()).that.to.be.eq(exchange_amount2.mul(ratio_b));
      }
      // 80000 TESTC => 20 TESTA
      const approve_amount3 = ethers.utils.parseEther("160000");
      const exchange_amount3 = approve_amount3;
      await testTokenCDeployed.connect(ito_user).approve(happyTokenPoolDeployed.address, approve_amount3);

      await happyTokenPoolDeployed
        .connect(ito_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount3, [pool_id]);
      {
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
        const parsedLog = itoInterface.parseLog(logs[0]);
        const result_c = parsedLog.args;

        const ratio_c = (creationParams.exchange_ratios[5] as number) / (creationParams.exchange_ratios[4] as number); // tokenA <=> tokenC

        await expect(result_c.to_value.toString()).that.to.not.be.eq(String(exchange_amount * ratio_c));
        await expect(result_c.to_value.toString()).that.to.not.be.eq(creationParams.limit);
        await expect(result_c.to_value.toString()).that.to.be.eq(ethers.utils.parseEther("20"));
      }
    });

    it("Should swap the remaining token when the amount of swap token is greater than total token", async () => {
      const ratio = 10 ** 10;
      creationParams.exchange_ratios = [1, ratio];
      creationParams.exchange_addrs = [eth_address];
      creationParams.limit = ethers.utils.parseEther("10000");
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, creationParams);

      // first, swap to make total tokens less than limit
      const swapperFirstETH = user_address;
      let exchange_ETH_amount = BigNumber.from("500000000000");
      const v1 = getVerification(PASSWORD, swapperFirstETH);
      await happyTokenPoolDeployed
        .connect(ito_user)
        .swap(pool_id, v1.verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
          value: exchange_ETH_amount,
        });

      // then, swap amount greater than total token
      let v2 = getVerification(PASSWORD, await signers[3].getAddress());
      const { remaining } = await getAvailability(happyTokenPoolDeployed, pool_id, await signers[3].getAddress());
      exchange_ETH_amount = BigNumber.from("1000000000000"); //1 * 10**12
      await happyTokenPoolDeployed
        .connect(signers[3])
        .swap(pool_id, v2.verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
          value: exchange_ETH_amount,
        });
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;
      const from_value = result.from_value;
      const to_value = result.to_value;
      await expect(remaining.toString()).to.be.eq(BigNumber.from("500000000000").mul(ratio));
      await expect(from_value.toString())
        .to.be.eq(BigNumber.from(remaining.toString()).div(ratio))
        .and.to.not.be.eq(exchange_ETH_amount);
      await expect(to_value.toString())
        .to.be.eq(remaining.toString())
        .and.to.not.be.eq(BigNumber.from(exchange_ETH_amount).mul(ratio));
    });
  });
});
