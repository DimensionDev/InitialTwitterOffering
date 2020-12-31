pragma solidity >= 0.6.0;

import "./IQLF.sol";

contract QLF is IQLF {
    string private name;
    uint256 private creation_time;

    constructor (string memory _name) public {
        name = _name;
        creation_time = block.timestamp;
    }

    function get_name() public view returns (string memory) {
        return name;
    }

    function get_creation_time() public view returns (uint256) {
        return creation_time;
    }

    function ifQualified(address testee) public view override returns (bool) {
        bool qualified = true;
        return qualified;
    } 

    function logQualified(address testee) public override {
        bool qualified = true;
        emit Qualification(qualified, block.number, block.timestamp);
    } 
}
