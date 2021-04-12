// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity >= 0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

abstract contract IQLF is IERC165{
    /**
     * @dev Returns if the given address is qualified, implemented on demand.
     */
    function ifQualified (address testee) virtual external view returns (bool);

    /**
     * @dev Logs if the given address is qualified, implemented on demand.
     */
    function logQualified (address testee) virtual external returns (bool);

    /**
     * @dev Ensure that custom contract implements `ifQualified` amd `logQualified` correctly.
     */
    function supportsInterface(bytes4 interfaceId) external override pure returns (bool) {
        return interfaceId == this.supportsInterface.selector || 
            interfaceId == (this.ifQualified.selector ^ this.logQualified.selector);
    }

    /**
     * @dev Emit when `ifQualified` is called to decide if the given `address`
     * is `qualified` according to the preset rule by the contract creator and 
     * the current block `number` and the current block `timestamp`.
     */
    event Qualification(address testee, bool qualified, uint256 number, uint256 timestamp);
}
