import { createStealthAddress } from 'unwallet-sdk';

// generate stealth address for base sepolia
createStealthAddress({
  username: 'kyskkysk',
  chainId: 84532,
  tokenAddress: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
}).then((address) => {
  console.log(address);
});
