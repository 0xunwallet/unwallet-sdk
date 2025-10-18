import { Address, parseUnits, PublicClient, WalletClient, hashTypedData } from 'viem';
import { SupportedChain } from '../types/supported-chains';
import { publicClintByChainId } from './chains-constants';
import { generateInitialKeysOnClient } from './stealth-address';

export type Modules = {
  autoEarn: boolean;
  autoBridge: boolean;
};

export type AccountConfig = {
  walletClient: WalletClient;
  chainId: SupportedChain;
  ens: string;
  modules: Modules;
  defaultToken: Address;
  needPrivacy?: boolean;
  verifiableLink?: boolean;
  publicClient: PublicClient;
};

export type SignedAccountConfig = AccountConfig & {
  signature: `0x${string}`;
  configHash: `0x${string}`;
};

const CONFIG_DOMAIN = {
  name: 'Unwallet',
  version: '1.0.0',
} as const;

const CONFIG_TYPES = {
  AccountConfig: [
    { name: 'chainId', type: 'uint256' },
    { name: 'ens', type: 'string' },
    { name: 'modules', type: 'Modules' },
    { name: 'defaultToken', type: 'address' },
    { name: 'needPrivacy', type: 'bool' },
    { name: 'verifiableLink', type: 'bool' },
  ],
  Modules: [
    { name: 'autoEarn', type: 'bool' },
    { name: 'autoBridge', type: 'bool' },
  ],
} as const;

export const signAccountConfig = async (config: AccountConfig): Promise<SignedAccountConfig> => {
  const configMessage = {
    chainId: BigInt(config.chainId),
    ens: config.ens,
    modules: config.modules,
    defaultToken: config.defaultToken,
    needPrivacy: config.needPrivacy ?? false,
    verifiableLink: config.verifiableLink ?? false,
  };

  const signature = await config.walletClient.signTypedData({
    account: config.walletClient.account!,
    domain: {
      ...CONFIG_DOMAIN,
      chainId: config.chainId,
    },
    types: CONFIG_TYPES,
    primaryType: 'AccountConfig',
    message: configMessage,
  });

  const configHash = hashTypedData({
    domain: {
      ...CONFIG_DOMAIN,
      chainId: config.chainId,
    },
    types: CONFIG_TYPES,
    primaryType: 'AccountConfig',
    message: configMessage,
  });

  return {
    ...config,
    signature,
    configHash,
  };
};

export const getApiKey = async (config: AccountConfig | SignedAccountConfig) => {
  // const isSufficentBalance = await checkBalanceGreaterThan(config, parseUnits('0.001', 6));
  // if (!isSufficentBalance) {
  //   throw new Error('Insufficient balance');
  // }

  const signedConfig = 'signature' in config ? config : await signAccountConfig(config);

  let stealthKeys: string[] = [];

  if (config.needPrivacy) {
    const msgToSign = 'CREATE_ACCOUNT';

    stealthKeys = await generateInitialKeysOnClient({
      walletClient: config.walletClient || signedConfig.walletClient,
      chainId: config.chainId || signedConfig.chainId,
      uniqueNonces: [1],
      msgToSign,
    });

    console.log('stealthKeys', stealthKeys);
  }

  return {
    apiKey: 'DUMMY_API_KEY',
    signature: signedConfig.signature,
    configHash: signedConfig.configHash,
  };
};

export const getRecipientAccountData = async ({
  ens,
  chainId,
}: {
  ens: string;
  chainId: SupportedChain;
}) => {
  const address = await publicClintByChainId(chainId).getEnsAddress({
    name: ens,
  });

  return {
    address,
  };
};

export const checkBalanceGreaterThan = async (config: AccountConfig, amount: bigint) => {
  const balance = await getBalance(config);
  return balance > amount;
};

export const getBalance = async (config: AccountConfig) => {
  const publicClient = publicClintByChainId(config.chainId);

  const balance = await publicClient.getBalance({
    address: config.walletClient.account?.address as Address,
  });

  return balance;
};
