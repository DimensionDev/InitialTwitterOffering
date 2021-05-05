// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity >= 0.8.0;

import "./IQLF.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// 400gwei gas price limit, 100 MASK holding require.
contract QLF_MORE_MASK_MAINNET is IQLF {
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
        if (IERC20(address(0x69af81e73A73B40adF4f3d4223Cd9b1ECE623074)).balanceOf(account) < 100e18) {
            return false;
        }
        qualified = true;
    } 

    function logQualified(address account, uint256 ito_start_time) public override returns (bool qualified) {
        if (tx.gasprice > 400e9) {
            return false;
        }

        if (IERC20(address(0x69af81e73A73B40adF4f3d4223Cd9b1ECE623074)).balanceOf(account) < 100e18) {
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
