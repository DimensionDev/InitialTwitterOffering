/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity >= 0.6.0;

interface IQLF {
    /**
     * @dev Returns if the given address is qualified, implemented on demand.
     */
    function ifQualified (address testee) external view returns (bool);

    /**
     * @dev Logs if the given address is qualified, implemented on demand.
     */
    function logQualified (address testee) external;

    /**
     * @dev Emit when `ifQualified` is called to decide if the given `address`
     * is `qualified` according to the preset rule by the contract creator and 
     * the current block `number` and the current block `timestamp`.
     */
    event Qualification(bool qualified, uint256 number, uint256 timestamp);
}
