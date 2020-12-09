pragma solidity >0.4.22;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract TestTokenB is ERC20 {
    constructor(uint initialSupply) ERC20("TestTokenB", "TESTB") public{
        _mint(msg.sender, initialSupply);
    }
}
