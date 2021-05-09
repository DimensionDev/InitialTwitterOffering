// SPDX-License-Identifier: MIT

/**
 * @author          Hancheng Zhou
 * @contact         z308114274@gmail.com
 * @author_time     05/09/2021
**/

pragma solidity >= 0.8.0;

abstract contract IMTS {
  /**
    * @dev Returns a historical position of MASK of an address.
    */  
  function get_balance(address addr) virtual view public returns (uint256);
}
