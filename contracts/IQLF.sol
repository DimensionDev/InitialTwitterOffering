pragma solidity >= 0.6.0;

interface QLF {
    /**
     * @dev Returns if the given address is qualified, implemented on demand.
     */
    function qualified (address testee) external view returns(bool);
}
