// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     04/01/2021
**/

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract HappyTokenVault {
    using SafeERC20 for IERC20;

    address immutable private _keeper;
    address rescue_team;

    modifier keepOnly {
        require(msg.sender == _keeper, "You Shall Not Pass.");
        _;
    }

    modifier recycling {
        require(msg.sender == _keeper || msg.sender == rescue_team, "You Are Not Part of The Team.");
        _;
    }

    constructor (address _rescue_team) {
        if (rescue_team != 0x0000000000000000000000000000000000000000)
            rescue_team = _rescue_team;
        _keeper = msg.sender;
    }

    function send (address token_address, address to, uint256 value) public keepOnly {
        IERC20(token_address).safeTransfer(to, value);
    }

    function retrieve (address[] memory token_addresses) public recycling {
        uint256 _balance;
        for(uint256 i = 0; i < token_addresses.length; i++) {
            _balance = IERC20(token_addresses[i]).balanceOf(address(this));
            if (_balance > 0) {
                IERC20(token_addresses[i]).transfer(msg.sender, _balance);
            }
        }
        
        _balance = address(this).balance;
        if (_balance > 0) 
            payable(msg.sender).transfer(_balance);

        selfdestruct(payable(msg.sender));
    }
}
