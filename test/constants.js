const BigNumber = require('bignumber.js')

const base_timestamp = 1616976000
const eth_address = '0x0000000000000000000000000000000000000000'
const fill_success_encode = 'FillSuccess(uint256,bytes32,address,uint256,address,bytes32[])'
const fill_success_types = [
  { type: 'uint256', name: 'total' },
  { type: 'bytes32', name: 'id' },
  { type: 'address', name: 'creator' },
  { type: 'uint256', name: 'creation_time' },
  { type: 'address', name: 'token_address' },
  { type: 'bytes32[]', name: 'message' },
]
const swap_success_encode = 'SwapSuccess(bytes32,address,address,address,uint256,uint256)'
const swap_success_types = [
  { type: 'bytes32', name: 'id' },
  { type: 'address', name: 'swapper' },
  { type: 'address', name: 'from_address' },
  { type: 'address', name: 'to_address' },
  { type: 'uint256', name: 'from_value' },
  { type: 'uint256', name: 'to_value' },
]
const claim_success_encode = 'ClaimSuccess(bytes32,address,uint256,uint256,address)'
const claim_success_types = [
  { type: 'bytes32', name: 'id' },
  { type: 'address', name: 'claimer' },
  { type: 'uint256', name: 'timestamp' },
  { type: 'uint256', name: 'to_value' },
  { type: 'address', name: 'token_address' },
]
const destruct_success_encode = 'DestructSuccess(bytes32,address,uint256,uint128[])'
const destruct_success_types = [
  { type: 'bytes32', name: 'id' },
  { type: 'address', name: 'token_address' },
  { type: 'uint256', name: 'remaining_tokens' },
  { type: 'uint128[]', name: 'exchanged_values' },
]
const withdraw_success_encode = 'WithdrawSuccess(bytes32,address,uint256)'
const withdraw_success_types = [
  { type: 'bytes32', name: 'id' },
  { type: 'address', name: 'token_address' },
  { type: 'uint256', name: 'withdraw_balance' },
]
const qualification_encode = 'Qualification(address,bool,uint256,uint256)'
const qualification_types = [
  { type: 'address', name: 'account' },
  { type: 'bool', name: 'qualified' },
  { type: 'uint256', name: 'blockNumber' },
  { type: 'uint256', name: 'timestamp' },
]
const PASSWORD = '0x57d0aceec4e308e9af1dd11b09f45bce3fbc92d30ffda7b64f1aaa4005318e92'
const erc165_interface_id = '0x01ffc9a7'
const qualification_interface_id = '0xfb036a85'
const amount = new BigNumber('1e27').toFixed()
const ETH_address_index = 0
const tokenB_address_index = 1
const tokenC_address_index = 2
const pending_qualification_timestamp = 1718374426 // Jun 14 2024

module.exports = {
  base_timestamp,
  eth_address,
  fill_success_encode,
  fill_success_types,
  swap_success_encode,
  swap_success_types,
  claim_success_encode,
  claim_success_types,
  destruct_success_encode,
  destruct_success_types,
  withdraw_success_encode,
  withdraw_success_types,
  qualification_encode,
  qualification_types,
  erc165_interface_id,
  qualification_interface_id,
  PASSWORD,
  amount,
  ETH_address_index,
  tokenB_address_index,
  tokenC_address_index,
  pending_qualification_timestamp,
}
