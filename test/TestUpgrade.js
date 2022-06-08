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

let fpp2; // fill happyTokenPoolDeployed parameters
let snapshotId;
let testTokenADeployed;
let testTokenBDeployed;
let testTokenCDeployed;

let HappyTokenPool;
let happyTokenPoolDeployed;
let qualificationTesterDeployed;
let HappyTokenPoolProxy;

let signers;
let creator;
let ito_user;
let fpp;

describe("smart contract upgrade", async () => {
  let pool_user;
  let verification;
  let happyTokenPoolDeployed_v1_0;
  let exchange_amount;

  before(async () => {
    // signers = await ethers.getSigners();
    // creator = signers[0];
    // ito_user = signers[1];

    signers = await ethers.getSigners();
    creator = signers[0];
    //pool_user = signers[2];

    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    const TestTokenC = await ethers.getContractFactory("TestTokenC");
    const QualificationTester = await ethers.getContractFactory("QLF");

    const testTokenA = await TestTokenA.deploy(amount);
    const testTokenB = await TestTokenB.deploy(amount);
    const testTokenC = await TestTokenC.deploy(amount);
    const qualificationTester = await QualificationTester.deploy(0);
    // const qualificationTester2 = await QualificationTester.deploy(pending_qualification_timestamp);

    testTokenADeployed = await testTokenA.deployed();
    testTokenBDeployed = await testTokenB.deployed();
    testTokenCDeployed = await testTokenC.deployed();
    qualificationTesterDeployed = await qualificationTester.deployed();

    pool_user = signers[2];
    const transfer_amount = BigNumber("1e26").toFixed();
    await testTokenBDeployed.connect(creator).transfer(pool_user.address, transfer_amount);
    await testTokenCDeployed.connect(creator).transfer(pool_user.address, transfer_amount);
  });

  beforeEach(async () => {
    snapshotId = await helper.takeSnapshot();
    fpp = {
      hash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(PASSWORD)),
      start_time: 0,
      end_time: 10368000, // duration 120 days
      message: "Hello From the Outside Hello From the Outside",
      exchange_addrs: [eth_address, testTokenBDeployed.address, testTokenCDeployed.address],
      exchange_ratios: [1, 10000, 1, 2000, 4000, 1],
      lock_time: 12960000, // duration 150 days
      token_address: testTokenADeployed.address,
      total_tokens: BigNumber("1e22").toFixed(),
      limit: BigNumber("1e21").toFixed(),
      qualification: qualificationTesterDeployed.address,
    };
    const nowTimeStamp = Math.floor(new Date().getTime() / 1000);
    // 120 days
    fpp.end_time = nowTimeStamp + 10368000 - base_timestamp;
    // 120 days
    fpp.lock_time = nowTimeStamp + 12960000 - base_timestamp;

    const HappyTokenPool_v1_0 = await ethers.getContractFactory("HappyTokenPool_v1_0");
    const HappyTokenPoolProxy_v1_0 = await upgrades.deployProxy(HappyTokenPool_v1_0, [base_timestamp], {
      unsafeAllow: ["delegatecall"],
    });
    happyTokenPoolDeployed_v1_0 = new ethers.Contract(HappyTokenPoolProxy_v1_0.address, itoJsonABI_V1_0.abi, creator);

    await testTokenADeployed.connect(creator).approve(happyTokenPoolDeployed_v1_0.address, BigNumber("1e26").toFixed());
    const r = getVerification(PASSWORD, pool_user.address);
    verification = r.verification;

    exchange_amount = BigNumber("1e10").toFixed();
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
    ).to.be.rejectedWith("caller is not the owner");
  });

  it("Should ITO v1.0 be compatible with latest, upgrade after claim", async () => {
    const approve_amount = BigNumber("1e10").toFixed();
    exchange_amount = approve_amount;
    console.log("1111111\n");
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
    console.log(pool_id);
    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    console.log(userTokenABalanceBeforeSwap);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
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
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed_v1_0.filters.SwapSuccess());
        const parsedLog = itoInterface_V1_0.parseLog(logs[0]);
        const result = parsedLog.args;
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
          BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(exchange_amount)).toFixed(),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
          BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
        );
      }
      //-------------------------------------------------------------------------------------------------------------
      await helper.advanceTimeAndBlock(fpp.lock_time);
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
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
      }
    }

    // upgrade contract to latest
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool, {
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
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
      }
    }
  });

  it("Should ITO v1.0 be compatible with latest, upgrade before claim", async () => {
    const approve_amount = BigNumber("1e10").toFixed();
    exchange_amount = approve_amount;
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
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
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed_v1_0.filters.SwapSuccess());
        const parsedLog = itoInterface_V1_0.parseLog(logs[0]);
        const result = parsedLog.args;
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
          BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(exchange_amount)).toFixed(),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
          BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
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
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool, {
      unsafeAllow: ["delegatecall"],
    });
    const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
    //-------------------------------------------------------------------------------------------------------------
    {
      await helper.advanceTimeAndBlock(fpp.lock_time);
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
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
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
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
      }
    }
  });

  it("Should ITO v1.0 be compatible with latest, unlocktime == 0, upgrade after swap", async () => {
    fpp.lock_time = 0;
    const approve_amount = BigNumber("1e10").toFixed();
    exchange_amount = approve_amount;
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
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
          BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(exchange_amount)).toFixed(),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
          BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
        );
      }
      // check token A balance after swap
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
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
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool, {
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
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
      }
    }
  });

  it("Should ITO v1.0 be compatible with latest, unlocktime == 0, upgrade before swap", async () => {
    fpp.lock_time = 0;
    const approve_amount = BigNumber("1e10").toFixed();
    exchange_amount = approve_amount;
    const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
    const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
    const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
    const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
    const exchanged_tokenA_amount = exchange_amount * ratio;
    await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);
    //-------------------------------------------------------------------------------------------------------------
    // upgrade contract to latest
    await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool, {
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
          BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(exchange_amount)).toFixed(),
        );
        expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
          BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
        );
      }
      // check token A balance after swap
      {
        const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
        const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed_v1_0.address);
        expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
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
          BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
        expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
          BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(exchanged_tokenA_amount)).toFixed(),
        );
      }
    }
  });

  function getVerification(password, account) {
    var hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(password));
    var hash_bytes = Uint8Array.from(Buffer.from(hash.slice(2), "hex"));
    hash = hash_bytes.slice(0, 5);
    hash = "0x" + Buffer.from(hash).toString("hex");
    return {
      verification: soliditySha3(hexToNumber(hash), account),
      validation: sha3(account),
    };
  }

  async function getProxyAdmin(deployedProxyAddr) {
    const adminStoragePosition = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    const storage = await ethers.provider.getStorageAt(deployedProxyAddr, adminStoragePosition);
    const addrStoragePrefix = "0x000000000000000000000000";
    assert.isTrue(storage.startsWith(addrStoragePrefix));
    const adminAddr = "0x" + storage.substring(addrStoragePrefix.length);
    const proxyAdmin = new ethers.Contract(adminAddr, proxyAdminABI.abi, creator);
    return proxyAdmin;
  }

  async function getAvailability(happyTokenPoolDeployed, pool_id, account) {
    const signer = await ethers.getSigner(account);
    happyTokenPoolDeployed = happyTokenPoolDeployed.connect(signer);
    return happyTokenPoolDeployed.check_availability(pool_id);
  }

  async function getResultFromPoolFill(happyTokenPoolDeployed, fpp) {
    await happyTokenPoolDeployed.fill_pool(...Object.values(fpp));
    const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
    const result = itoInterface.parseLog(logs[0]);
    return result.args;
  }
});
