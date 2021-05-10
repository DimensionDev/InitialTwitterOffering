// SPDX-License-Identifier: MIT

/**
 * @author          Hancheng Zhou
 * @contact         z308114274@gmail.com
 * @author_time     05/09/2021
**/

pragma solidity >= 0.8.0;

import "./IQLF.sol";
import "./IMTS.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract QLF_HISTORY_POSITION_1000_MASK_ROPSTEN is IQLF {
    using SafeERC20 for IERC20;

    string private name;
    uint256 private creation_time;
    uint256 start_time;
    address creator;
    mapping(address => bool) black_list;

    modifier creatorOnly {
        require(msg.sender == creator, "Not Authorized");
        _;
    }

    constructor (string memory _name, uint256 _start_time) {
        name = _name;
        creation_time = block.timestamp;
        start_time = _start_time;
        creator = msg.sender;
    }

    function get_name() public view returns (string memory) {
        return name;
    }

    function get_creation_time() public view returns (uint256) {
        return creation_time;
    }

    function get_start_time() public view returns (uint256) {
        return start_time;
    }

    function set_start_time(uint256 _start_time) public creatorOnly {
        start_time = _start_time;
    }

    function ifQualified(address account) public view override returns (bool qualified) {
        if (IMTS(address(0x387C1417597eFd39fb61003E1e798b218eA5Be3B)).get_balance(account) < 1000) {
            return false;
        }
        qualified = true;
    } 

    function logQualified(address account, uint256 ito_start_time) public override returns (bool qualified) {
        if (tx.gasprice > 4e9) {
            return false;
        }

        if (IMTS(address(0x387C1417597eFd39fb61003E1e798b218eA5Be3B)).get_balance(account) < 1000) {
            return false;
        }              
        if (start_time > block.timestamp || ito_start_time > block.timestamp) {
            black_list[account] = true;
            return false;
        }
        if (black_list[account]) {
            return false;
        }
        emit Qualification(account, true, block.number, block.timestamp);
        return true;
    } 

    function supportsInterface(bytes4 interfaceId) external override pure returns (bool) {
        return interfaceId == this.supportsInterface.selector || 
            interfaceId == (this.ifQualified.selector ^ this.logQualified.selector) ||
            interfaceId == this.get_start_time.selector;
    }    
}

