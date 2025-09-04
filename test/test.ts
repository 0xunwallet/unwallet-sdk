import { processOnePayment } from "unwallet-sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { baseSepolia } from "viem/chains";

// generate stealth address for base sepolia
// createStealthAddress({
//   username: "kyskkysk",
//   chainId: 84532,
//   tokenAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
// }).then((address) => {
//   console.log(address);
// });

// [
//   {
//       "address": "0xc6377415Ee98A7b71161Ee963603eE52fF7750FC",
//       "balance": "0.5",
//       "symbol": "USDC",
//       "rawBalance": "500000",
//       "nonce": 4,
//       "decimals": 6,
//       "tokenAddress": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
//       "transactionHash": "0x15f8fab8dae7d26185187de8ae578b3c1ef1b19d36bbbfb36f64fc24ff57aaf1",
//       "stealthAddress": "0x2a00b3216b3d0aa61ebd360d87f3bd038adb2c9c",
//       "safeAddress": "0xb2ef339d0E760E7907EB17452a04535BFa678181",
//       "isFunded": true
//   },
//   {
//       "address": "0xc6377415Ee98A7b71161Ee963603eE52fF7750FC",
//       "balance": "1",
//       "symbol": "USDC",
//       "rawBalance": "1000000",
//       "nonce": 3,
//       "decimals": 6,
//       "tokenAddress": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
//       "transactionHash": "0xf0d9eefe6e1bc8e7c5fc04d8dbf74e2b78f2d00052ff9fbb9683e499cb108117",
//       "stealthAddress": "0x64e40b08c2bf8247a6c55d505704d4cd8a737e2d",
//       "safeAddress": "0x2E51915D95339DF362A39BC06C98b873ADFc6e3B",
//       "isFunded": true
//   }
// ]

const privateKey =
  "YOUR_PRIVATE_KEY";
const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

processOnePayment({
  nonce: 4,
  walletClient: walletClient as WalletClient,
  publicClient: publicClient as PublicClient,
  username: "kyskkysk",
  chainId: 84532,
  tokenAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  amount: "0.5",
  decimals: 6,
  token: "USDC",
  recipientAddress: "0xc6377415Ee98A7b71161Ee963603eE52fF7750FC",
}).then((address) => console.log("address", address));
