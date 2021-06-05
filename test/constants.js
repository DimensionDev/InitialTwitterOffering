const BigNumber = require('bignumber.js')

const base_timestamp = 1616976000
const eth_address = '0x0000000000000000000000000000000000000000'
const PASSWORD = '0x57d0aceec4e308e9af1dd11b09f45bce3fbc92d30ffda7b64f1aaa4005318e92'
const erc165_interface_id = '0x01ffc9a7'
const qualification_interface_id = '0x6762aec5'
const amount = new BigNumber('1e27').toFixed()
const ETH_address_index = 0
const tokenB_address_index = 1
const tokenC_address_index = 2
const pending_qualification_timestamp = 1718374426 // Jun 14 2024

module.exports = {
    base_timestamp,
    eth_address,
    erc165_interface_id,
    qualification_interface_id,
    PASSWORD,
    amount,
    ETH_address_index,
    tokenB_address_index,
    tokenC_address_index,
    pending_qualification_timestamp,
}
