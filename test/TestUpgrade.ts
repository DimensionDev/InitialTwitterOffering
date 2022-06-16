import proxyAdminABI from "@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json";
import { assert, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import itoJsonABI from "../artifacts/contracts/ito.sol/HappyTokenPool.json";
import itoJsonABI_V1_0 from "../artifacts/contracts/ito_v1.0.sol/HappyTokenPool_v1_0.json";
//types
import type { HappyTokenPool_v1_0, QLF, TestToken } from "../types";
import { amount, base_timestamp, eth_address, PASSWORD, tokenC_address_index } from "./constants";
import {
  advanceTimeAndBlock,
  getAvailability,
  getResultFromPoolFill,
  getVerification,
  revertToSnapShot,
  takeSnapshot,
} from "./helper";

const { expect } = use(chaiAsPromised);

let snapshotId;
let testTokenADeployed;
let testTokenBDeployed;
let testTokenCDeployed;

let qualificationTesterDeployed;

let signers;
let creator;
let pool_user;
let createParams;

let verification;
let happyTokenPoolDeployed_v1_0;
let exchange_amount;

describe("smart contract upgrade", async () => {
  before(async () => {
    signers = await ethers.getSigners();
    creator = signers[0];
    pool_user = signers[2];

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

    const transfer_amount = ethers.utils.parseEther("100000000");
    await testTokenBDeployed.connect(creator).transfer(pool_user.address, transfer_amount);
    await testTokenCDeployed.connect(creator).transfer(pool_user.address, transfer_amount);
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

    const HappyTokenPool_v1_0 = await ethers.getContractFactory("HappyTokenPool_v1_0");
    const HappyTokenPoolProxy_v1_0 = await upgrades.deployProxy(HappyTokenPool_v1_0, [base_timestamp], {
      unsafeAllow: ["delegatecall"],
    });
    happyTokenPoolDeployed_v1_0 = new ethers.Contract(
      HappyTokenPoolProxy_v1_0.address,
      itoJsonABI_V1_0.abi,
      creator,
    ) as HappyTokenPool_v1_0;

    await testTokenADeployed
      .connect(creator)
      .approve(happyTokenPoolDeployed_v1_0.address, ethers.utils.parseEther("100000000"));

    const pool_user_address = await pool_user.getAddress();
    const r = getVerification(PASSWORD, pool_user_address);
    verification = r.verification;

    exchange_amount = BigNumber.from("10000000000");
  });

  afterEach(async () => {
    await revertToSnapShot(snapshotId);
  });

  it("Should non-owner not be able to update implementation", async () => {
    // make sure `others` can NOT upgrade
    const proxyAdmin = await getProxyAdmin(happyTokenPoolDeployed_v1_0.address);
    const adminOnChain = await proxyAdmin.getProxyAdmin(happyTokenPoolDeployed_v1_0.address);
    expect(proxyAdmin.address.toUpperCase()).that.to.be.eq(adminOnChain.toUpperCase());
    const owner = await proxyAdmin.owner();
    expect(owner.toUpperCase()).that.to.be.eq(creator.address.toUpperCase());
    await expect(
      proxyAdmin.connect(pool_user).upgrade(happyTokenPoolDeployed_v1_0.address, qualificationTesterDeployed.address),
    ).to.be.revertedWith("caller is not the owner");
  });

  it("Should ITO v1.0 be compatible with latest, upgrade after claim", async () => {
    const approve_amount = ethers.utils.parseEther("0.000000001");
    exchange_amount = approve_amount;

    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, createParams);

    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);

    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = createParams.exchange_ratios[5] / createParams.exchange_ratios[4]; // tokenA <=> tokenC
    const exchanged_tokenA_amount = exchange_amount * ratio;
    {
      await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);

      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
      await happyTokenPoolDeployed_v1_0
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      {
        const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);

        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability).to.not.have.property("claimed");
      }
      // Check SwapSuccess event
      {
        const events = await happyTokenPoolDeployed_v1_0.queryFilter(happyTokenPoolDeployed_v1_0.filters.SwapSuccess());
        const event = events[0];
        const result = event?.args;
        expect(result).to.have.property("id").that.to.not.be.null;
        expect(result).to.have.property("swapper").that.to.not.be.null;
        expect(result.from_value.toString()).that.to.be.eq(String(exchange_amount));
        expect(result.to_value.toString()).that.to.be.eq(String(exchanged_tokenA_amount));
        expect(result).to.have.property("from_address").that.to.be.eq(testTokenCDeployed.address);
        expect(result).to.have.property("to_address").that.to.be.eq(testTokenADeployed.address);
        expect(result).to.not.have.property("claimed");
      }
      // check token C balance after swap
      {
        const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
        const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
          contractTokenCBalanceBeforeSwap.add(exchange_amount),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(userTokenCBalanceBeforeSwap.sub(exchange_amount));
      }
      //-------------------------------------------------------------------------------------------------------------
      await advanceTimeAndBlock(createParams.lock_time);
      await happyTokenPoolDeployed_v1_0.connect(pool_user).claim([pool_id]);
      {
        const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
        // previous behavior(tag: v1.0), changed already
        expect(availability.swapped.toString()).to.be.eq("0");
        expect(availability).to.not.have.property("claimed");
      }
      // check token A balance after claim
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
    }

    // upgrade contract to latest

    const HappyTokenPoolFactory = await ethers.getContractFactory("HappyTokenPool");
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPoolFactory, {
      unsafeAllow: ["delegatecall"],
    });

    const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
    {
      const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
      // minor problem
      expect(availability.swapped.toString()).to.be.eq("0");
      expect(availability.claimed).to.be.false;
      await deployedUpgraded.connect(pool_user).claim([pool_id]);
      // claim-again, check token A balance
      {
        await happyTokenPoolDeployed_v1_0.connect(pool_user).claim([pool_id]);
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
    }
  });

  it("Should ITO v1.0 be compatible with latest, upgrade before claim", async () => {
    const approve_amount = BigNumber.from("10000000000");
    exchange_amount = approve_amount;
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, createParams);

    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = createParams.exchange_ratios[5] / createParams.exchange_ratios[4]; // tokenA <=> tokenC
    const exchanged_tokenA_amount = exchange_amount * ratio;
    {
      await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);

      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);

      await happyTokenPoolDeployed_v1_0
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      {
        const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability).to.not.have.property("claimed");
      }

      // Check SwapSuccess event
      {
        const events = await happyTokenPoolDeployed_v1_0.queryFilter(happyTokenPoolDeployed_v1_0.filters.SwapSuccess());
        const event = events[0];
        const result = event?.args;
        expect(result).to.have.property("id").that.to.not.be.null;
        expect(result).to.have.property("swapper").that.to.not.be.null;
        expect(result.from_value.toString()).that.to.be.eq(String(exchange_amount));
        expect(result.to_value.toString()).that.to.be.eq(String(exchanged_tokenA_amount));
        expect(result).to.have.property("from_address").that.to.be.eq(testTokenCDeployed.address);
        expect(result).to.have.property("to_address").that.to.be.eq(testTokenADeployed.address);
        expect(result).to.not.have.property("claimed");
      }
      // check token C balance after swap
      {
        const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
        const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
          contractTokenCBalanceBeforeSwap.add(exchange_amount),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(userTokenCBalanceBeforeSwap.sub(exchange_amount));
      }
      {
        const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability).to.not.have.property("claimed");
      }
    }
    //-------------------------------------------------------------------------------------------------------------
    // upgrade contract to latest
    const HappyTokenPoolFactory = await ethers.getContractFactory("HappyTokenPool");
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPoolFactory, {
      unsafeAllow: ["delegatecall"],
    });
    const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
    //-------------------------------------------------------------------------------------------------------------
    {
      await advanceTimeAndBlock(createParams.lock_time);
      await deployedUpgraded.connect(pool_user).claim([pool_id]);
      {
        const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability.claimed).to.be.true;
      }
      // check token A balance after claim
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(deployedUpgraded.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
    }

    {
      const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);

      expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
      expect(availability.claimed).to.be.true;
      await deployedUpgraded.connect(pool_user).claim([pool_id]);
      // claim-again, check token A balance
      {
        await happyTokenPoolDeployed_v1_0.connect(pool_user).claim([pool_id]);
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
    }
  });

  it("Should ITO v1.0 be compatible with latest, unlocktime == 0, upgrade after swap", async () => {
    createParams.lock_time = 0;
    const approve_amount = BigNumber.from("100000000000");
    exchange_amount = approve_amount;
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, createParams);
    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = createParams.exchange_ratios[5] / createParams.exchange_ratios[4]; // tokenA <=> tokenC
    const exchanged_tokenA_amount = exchange_amount * ratio;
    await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);
    {
      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
      await happyTokenPoolDeployed_v1_0
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      {
        const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability).to.not.have.property("claimed");
      }

      // check token C balance after swap
      {
        const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
        const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
          contractTokenCBalanceBeforeSwap.add(exchange_amount),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(userTokenCBalanceBeforeSwap.sub(exchange_amount));
      }
      // check token A balance after swap
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
      {
        const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability).to.not.have.property("claimed");
      }
    }
    //-------------------------------------------------------------------------------------------------------------
    // upgrade contract to latest
    const HappyTokenPoolFactory = await ethers.getContractFactory("HappyTokenPool");
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPoolFactory, {
      unsafeAllow: ["delegatecall"],
    });
    const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
    //-------------------------------------------------------------------------------------------------------------
    {
      await deployedUpgraded.connect(pool_user).claim([pool_id]);
      {
        const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability.claimed).to.be.true;
      }
      // check token A balance after claim
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(deployedUpgraded.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
    }
  });

  it("Should ITO v1.0 be compatible with latest, unlocktime == 0, upgrade before swap", async () => {
    createParams.lock_time = 0;
    const approve_amount = BigNumber.from("10000000000");
    exchange_amount = approve_amount;
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, createParams);
    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = createParams.exchange_ratios[5] / createParams.exchange_ratios[4]; // tokenA <=> tokenC
    const exchanged_tokenA_amount = exchange_amount * ratio;
    await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);
    //-------------------------------------------------------------------------------------------------------------
    // upgrade contract to latest
    const HappyTokenPoolFactory = await ethers.getContractFactory("HappyTokenPool");
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPoolFactory, {
      unsafeAllow: ["delegatecall"],
    });
    const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
    //-------------------------------------------------------------------------------------------------------------
    {
      const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
      const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
      await happyTokenPoolDeployed_v1_0
        .connect(pool_user)
        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
      {
        const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability.claimed).to.be.true;
      }

      // check token C balance after swap
      {
        const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
        const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
          contractTokenCBalanceBeforeSwap.add(exchange_amount),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(userTokenCBalanceBeforeSwap.sub(exchange_amount));
      }
      // check token A balance after swap
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
      {
        const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability.claimed).to.be.true;
      }
    }
    {
      await deployedUpgraded.connect(pool_user).claim([pool_id]);
      {
        const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
        expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
        expect(availability.claimed).to.be.true;
      }
      // check token A balance after claim
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(deployedUpgraded.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          contractTokenABalanceBeforeSwap.sub(exchanged_tokenA_amount),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          userTokenABalanceBeforeSwap.add(exchanged_tokenA_amount),
        );
      }
    }
  });

  async function getProxyAdmin(deployedProxyAddr) {
    const adminStoragePosition = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    const storage = await ethers.provider.getStorageAt(deployedProxyAddr, adminStoragePosition);
    const addrStoragePrefix = "0x000000000000000000000000";
    assert.isTrue(storage.startsWith(addrStoragePrefix));
    const adminAddr = "0x" + storage.substring(addrStoragePrefix.length);
    const proxyAdmin = new ethers.Contract(adminAddr, proxyAdminABI.abi, creator);
    return proxyAdmin;
  }
});
