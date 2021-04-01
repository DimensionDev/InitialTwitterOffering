// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity ^0.8.0;

interface IQLF {
    /**
     * @dev Returns if the given address is qualified, implemented on demand.
     * @dev View only
     */
    function ifQualified (address testee) external view returns (bool);

    /**
     * @dev Logs if the given address is qualified, implemented on demand.
     */
    function logQualified (address testee) external returns (bool);

    /**
     * @dev Emit when `ifQualified` is called to decide if the given `address`
     * is `qualified` according to the preset rule by the contract creator and 
     * the current block `number` and the current block `timestamp`.
     */
    event Qualification(address testee, bool qualified, uint256 number, uint256 timestamp);
}
