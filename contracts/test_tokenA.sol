pragma solidity >0.4.22;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract TestTokenA is ERC20 {
    constructor(uint initialSupply) ERC20("TestTokenA", "TESTA") public{
        _mint(msg.sender, initialSupply);
    }
}
