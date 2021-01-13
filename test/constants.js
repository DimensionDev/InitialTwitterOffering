const base_timestamp = 1609372800
const eth_address = "0x0000000000000000000000000000000000000000"
const fill_success_encode = 'FillSuccess(uint256,bytes32,address,uint256,address,string,string)'
const fill_success_types = [
    { type: 'uint256', name: 'total' },
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'creator' },
    { type: 'uint256', name: 'creation_time' },
    { type: 'address', name: 'token_address' },
    { type: 'string', name: 'name' },
    { type: 'string', name: 'message' }
]
const swap_success_encode = 'SwapSuccess(bytes32,address,address,address,uint256,uint256)'
const swap_success_types = [
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'swapper' },
    { type: 'address', name: 'from_address' },
    { type: 'address', name: 'to_address' },
    { type: 'uint256', name: 'from_value' },
    { type: 'uint256', name: 'to_value' }
]
const destruct_success_encode = 'DestructSuccess(bytes32,address,uint256,uint128[])'
const destruct_success_types = [
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'token_address' },
    { type: 'uint256', name: 'remaining_tokens' },
    { type: 'uint128[]', name: 'exchanged_values' }
]
const withdraw_success_encode = 'WithdrawSuccess(bytes32,address,uint256)'
const withdraw_success_types = [
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'token_address' },
    { type: 'uint256', name: 'withdraw_balance' }
]
const PASSWORD = "password"

module.exports = {
    base_timestamp,
    eth_address,
    fill_success_encode,
    fill_success_types,
    swap_success_encode,
    swap_success_types,
    destruct_success_encode,
    destruct_success_types,
    withdraw_success_encode,
    withdraw_success_types,
    PASSWORD
  }