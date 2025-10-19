// scripts/prepare-curl.ts
import { createWalletClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  prepareRegisterRequest,
  prettyPrintRegisterRequest,
  type AccountConfig,
  type SupportedChain,
} from 'unwallet';

const generateRandomEns = () => `agent-${Math.random().toString(36).slice(2, 10)}.wall8.eth`;

async function main() {
  // 1) Random throwaway wallet (or replace with your own PRIVATE_KEY)
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // 2) Minimal config
  const walletClient = createWalletClient({ account, chain: mainnet, transport: http() });
  const publicClient = walletClient; // not used by prepare* functions, but required by AccountConfig type

  const ens = generateRandomEns();

  const config: AccountConfig = {
    walletClient,
    publicClient: publicClient as any,
    chainId: mainnet.id as SupportedChain,
    ens,
    modules: [],
    defaultToken: '0xA0b86a33E6441b8c4C8C0C4A0b86a33E6441b8c4C', // dummy ERC20 addr for mainnet context
    needPrivacy: true,
    eigenAiEnabled: false,
  };

  const agentDetails = {
    email: `${ens}@wall8.eth`,
    website: `https://${ens}`,
    description: 'Autonomous wallet agent for secure programmable funds',
    twitter: ens.replace('.wall8.eth', ''),
    github: ens.replace('.wall8.eth', ''),
    telegram: ens.replace('.wall8.eth', ''),
    discord: `${ens.replace('.wall8.eth', '')}#1234`,
  };

  // 3) Build a fully signed RegisterRequest (no network call)
  const requestBody = await prepareRegisterRequest(config, agentDetails);

  // 4) Print pretty JSON for inspection
  console.log('----- RegisterRequest JSON -----');
  console.log(prettyPrintRegisterRequest(requestBody));

  // 5) Print ready-to-run curl to production ENS server
  const jsonEscaped = JSON.stringify(requestBody).replace(/'/g, "\\'");
  const curl = `curl -X POST https://tee.wall8.xyz/set -H "Content-Type: application/json" -d '${jsonEscaped}'`;
  console.log('\n----- Curl -----');
  console.log(curl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});