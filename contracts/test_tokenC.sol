//SPDX-License-Identifier: MIT 
pragma solidity >= 0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestTokenC is ERC20 {
    constructor(uint initialSupply) ERC20("TestTokenC", "TESTC") public{
        _mint(msg.sender, initialSupply);
    }
}
