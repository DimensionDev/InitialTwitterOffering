// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity >= 0.8.0;

import "./IQLF.sol";

contract QLF is IQLF {
    string private name;
    uint256 private creation_time;
    uint256 start_time;
    mapping(address => bool) black_list;

    constructor (string memory _name, uint256 _start_time) {
        name = _name;
        creation_time = block.timestamp;
        start_time = _start_time;
    }

    function get_name() public view returns (string memory) {
        return name;
    }

    function get_creation_time() public view returns (uint256) {
        return creation_time;
    }

    function ifQualified(address) public pure override returns (bool qualified) {
        qualified = true;
    } 

    function logQualified(address account) public override returns (bool qualified) {
        if (start_time > block.timestamp) {
            black_list[address(msg.sender)] = true;
            return false;
        }
        if (black_list[msg.sender]) {
            return false;
        }
        emit Qualification(account, true, block.number, block.timestamp);
        return true;
    } 

    function supportsInterface(bytes4 interfaceId) external override pure returns (bool) {
        return interfaceId == this.supportsInterface.selector || 
            interfaceId == (this.ifQualified.selector ^ this.logQualified.selector) ||
            interfaceId == this.get_creation_time.selector;
    }    
}
