pragma solidity >=0.5.0;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract Multicall is IERC721Receiver {
    struct Call {
        address target;
        bytes callData;
        uint256 value;
    }

    function aggregate(Call[] memory calls) external payable {
        for(uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory ret) = calls[i].target.call{ value: calls[i].value}(calls[i].callData);
            require(success, "Multicall: call failed");
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata)
            public override pure returns(bytes4) {
        return this.onERC721Received.selector;
    }
}
