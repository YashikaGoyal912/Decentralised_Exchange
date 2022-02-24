pragma solidity ^0.8.0;

// SPDX-License-Identifier: MIT

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract Yas is ERC20 {
constructor() ERC20('Yashika Token', 'YAS', 18) public {}  
function faucet(address to, uint amount) external {
    _mint(to, amount);
  } 

}