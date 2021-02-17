pragma solidity ^0.6.2;
import './ito.sol';

contract InternalFunctions is HappyTokenPool {
    function _unbox(uint256 base, uint16 position, uint16 size) public pure returns (uint256 boxed) {
        return unbox(base, position, size);
    }

    function _validRange(uint16 size, uint256 data) public pure returns (bool) {
        return validRange(size, data);
    }        
}
