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

describe.only("HappyTokenPoolExpiredProcess", () => {
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

  beforeEach(async () => {
    snapshotId = await helper.takeSnapshot();
    fpp2 = {
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
    fpp2.end_time = nowTimeStamp + 10368000 - base_timestamp;
    // 150 days
    fpp2.lock_time = nowTimeStamp + 12960000 - base_timestamp;
  });

  describe("destruct()", async () => {
    before(async () => {
      await testTokenADeployed.approve(happyTokenPoolDeployed.address, new BigNumber("1e27").toFixed());
    });

    it("Should throw error when you're not the creator of the happyTokenPoolDeployed", async () => {
      const account_not_creator = signers[4].address;
      const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000;
      fpp2.end_time = Math.ceil(fakeTime) - base_timestamp;

      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);
      expect(happyTokenPoolDeployed.connect(account_not_creator).destruct(pool_id)).to.be.rejectedWith(Error);
    });

    it("Should throw error if happyTokenPoolDeployed is not expired", async () => {
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);
      expect(happyTokenPoolDeployed.connect(creator).destruct(pool_id)).to.be.rejectedWith(Error);
    });

    it("Should emit DestructSuccess event and withdraw all tokens", async () => {
      const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
      fpp2.end_time = Math.ceil(fakeTime) - base_timestamp;
      fpp2.exchange_ratios = [1, 75000, 1, 100, 1, 100];
      fpp2.limit = BigNumber("100000e18").toFixed();
      fpp2.total_tokens = BigNumber("1000000e18").toFixed();
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);
      let previous_eth_balance = await ethers.provider.getBalance(creator.address);
      const previous_tokenB_balance = await testTokenBDeployed.balanceOf(creator.address);
      const previous_tokenC_balance = await testTokenCDeployed.balanceOf(creator.address);

      const exchange_ETH_amount = BigNumber("1.3e18").toFixed();
      const { verification, validation } = getVerification(PASSWORD, signers[2].address);
      await happyTokenPoolDeployed
        .connect(signers[2])
        .swap(pool_id, verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
          value: exchange_ETH_amount,
        });

      const exchange_tokenB_amount = BigNumber("500e18").toFixed();
      await approveThenSwapToken(testTokenBDeployed, signers[5], tokenB_address_index, pool_id, exchange_tokenB_amount);

      const exchange_tokenC_amount = BigNumber("2000e18").toFixed();
      const exchange_tokenC_pool_limit = BigNumber("1000e18").toFixed();
      await approveThenSwapToken(testTokenCDeployed, signers[6], tokenC_address_index, pool_id, exchange_tokenC_amount);
      {
        const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[9].address);
        expect(result.destructed).to.false;
      }

      await helper.advanceTimeAndBlock(2000 * 1000);
      await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.DestructSuccess());
      const parsedLog = itoInterface.parseLog(logs[0]);
      const result = parsedLog.args;

      expect(result).to.have.property("id").that.to.be.eq(pool_id);
      expect(result).to.have.property("token_address").that.to.be.eq(testTokenADeployed.address);
      expect(result).to.have.property("remaining_balance");
      expect(result).to.have.property("exchanged_values");

      const ratioETH = fpp2.exchange_ratios[1] / fpp2.exchange_ratios[0];
      const ratioB = fpp2.exchange_ratios[3] / fpp2.exchange_ratios[2];
      const remaining_tokens = BigNumber(fpp2.total_tokens)
        .minus(
          BigNumber(ratioB)
            .times(BigNumber(exchange_tokenB_amount))
            .plus(BigNumber("100000e18"))
            .plus(BigNumber(ratioETH).times(BigNumber(exchange_ETH_amount))),
        )
        .toFixed();

      expect(remaining_tokens).to.be.eq(result.remaining_balance.toString());

      const eth_balance = await ethers.provider.getBalance(creator.address);
      const r = BigNumber(eth_balance.sub(previous_eth_balance).toString());

      expect(r.minus(BigNumber("1e18")).isGreaterThan(0)).to.be.true;
      expect(r.minus(BigNumber("1.3e18")).isLessThan(0)).to.be.true;

      const transfer_amount = BigNumber("1e26").toFixed();
      const tokenB_balance = await testTokenBDeployed.balanceOf(creator.address);
      expect(tokenB_balance.toString()).to.be.eq(
        BigNumber(previous_tokenB_balance.toString())
          .minus(BigNumber(transfer_amount))
          .plus(BigNumber(exchange_tokenB_amount))
          .toFixed(),
      );

      const tokenC_balance = await testTokenCDeployed.balanceOf(creator.address);
      expect(tokenC_balance.toString()).to.be.not.eq(
        BigNumber(previous_tokenC_balance.toString())
          .minus(BigNumber(transfer_amount))
          .plus(BigNumber(exchange_tokenC_amount))
          .toFixed(),
      );
      expect(tokenC_balance.toString()).to.be.eq(
        BigNumber(previous_tokenC_balance.toString())
          .minus(BigNumber(transfer_amount))
          .plus(
            BigNumber(exchange_tokenC_pool_limit), // 2000e18 exceeds limit
          )
          .toFixed(),
      );
      {
        // `exchanged_tokens` and `exchange_addrs` should still be available
        const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[9].address);
        expect(result.exchange_addrs).to.eql(fpp2.exchange_addrs);
        expect(result.exchanged_tokens.map((bn) => bn.toString())).to.eql([
          exchange_ETH_amount,
          exchange_tokenB_amount,
          exchange_tokenC_pool_limit,
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
      fpp2.limit = BigNumber("50000e18").toFixed();
      fpp2.total_tokens = BigNumber("50000e18").toFixed();
      const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp2);

      const exchange_tokenB_amount = BigNumber("500e18").toFixed();
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

    async function approveThenSwapToken(test_token, swapper, token_address_index, pool_id, exchange_amount) {
      const r = getVerification(PASSWORD, swapper.address);
      verification = r.verification;
      validation = r.validation;

      const transfer_amount = BigNumber("1e26").toFixed();
      await test_token.transfer(swapper.address, transfer_amount);
      const approve_amount = exchange_amount;
      await test_token.connect(swapper).approve(happyTokenPoolDeployed.address, approve_amount);
      await happyTokenPoolDeployed
        .connect(swapper)
        .swap(pool_id, verification, token_address_index, exchange_amount, [pool_id]);
    }

    async function getResultFromPoolFill(happyTokenPoolDeployed, fpp) {
      await happyTokenPoolDeployed.fill_pool(...Object.values(fpp));
      const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
      const result = itoInterface.parseLog(logs[0]);
      return result.args;
    }

    async function getAvailability(happyTokenPoolDeployed, pool_id, account) {
      const signer = await ethers.getSigner(account);
      happyTokenPoolDeployed = happyTokenPoolDeployed.connect(signer);
      return happyTokenPoolDeployed.check_availability(pool_id);
    }
  });

  afterEach(async () => {
    await helper.revertToSnapShot(snapshotId);
  });
});
