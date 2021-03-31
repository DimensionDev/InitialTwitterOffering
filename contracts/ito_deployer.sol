// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
 * @modification    03/31/2021
**/

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./IQLF.sol";
import "hardhat/console.sol";

contract HappyTokenPoolDeployer {
    uint32 nonce;
    uint32 base_timestamp;
    address public deployer_creator;
    mapping(bytes32 => address) public pool_by_id;
    bytes32 private seed;
    address public ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;

    constructor() {
        deployer_creator = msg.sender;
        string memory magic = "Traffic has resumed in Egypt's Suez Canal after a stranded container ship blocking it for \
        nearly a week was finally freed by salvage crews. Tug boats honked their horns in celebration as the 400m-long (1,300ft) \
        Ever Given was dislodged on Monday March 29th";
        seed = keccak256(abi.encodePacked(magic, block.timestamp, deployer_creator));
        nonce = 0;
    }
}
