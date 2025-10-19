import type { Address, Account, Hex } from 'viem';
// import { parseUnits } from 'viem';
import type { SupportedChain } from '../types/supported-chains';
import type {
  EnsData,
  RegisterRequest,
  AccountConfig,
  SignedAccountConfig,
} from '../types/account-types';
import { publicClintByChainId } from './chains-constants';
import { generateInitialKeysOnClient } from './stealth-address';
import { privateKeyToAccount } from 'viem/accounts';
import { SERVER_URL_ENS } from './constants';

export const signAccountConfig = async (config: AccountConfig): Promise<SignedAccountConfig> => {
  const configMessage = {
    chainId: config.chainId,
    ens: config.ens,
    modules: config.modules,
    defaultToken: config.defaultToken,
    needPrivacy: config.needPrivacy ?? false,
    eigenAiEnabled: config.eigenAiEnabled ?? false,
  };

  const messageToSign = JSON.stringify(configMessage);

  const signature = await config.walletClient.signMessage({
    account: config.walletClient.account!,
    message: messageToSign,
  });

  // For configHash, we'll use a simple hash of the message
  const configHash = `0x${Buffer.from(messageToSign).toString('hex')}` as `0x${string}`;

  return {
    ...config,
    signature,
    configHash,
  };
};

export const getApiKey = async (
  config: AccountConfig | SignedAccountConfig,
  {
    agentDetails,
  }: {
    agentDetails: {
      email: string;
      website: string;
      description: string;
      twitter: string;
      github: string;
      telegram: string;
      discord: string;
    };
  },
) => {
  // const isSufficentBalance = await checkBalanceGreaterThan(config, parseUnits('0.001', 6));
  // if (!isSufficentBalance) {
  //   throw new Error('Insufficient balance');
  // }

  const signedConfig = 'signature' in config ? config : await signAccountConfig(config);

  let stealthKeys: string[] = [];
  let spendingPublicKey: string | undefined;
  let viewingPrivateKey: string | undefined;

  //if privacy is enabled, generate stealth keys
  if (config.needPrivacy) {
    const msgToSign = 'CREATE_ACCOUNT';

    const keyResult = await generateInitialKeysOnClient({
      walletClient: config.walletClient || signedConfig.walletClient,
      chainId: config.chainId || signedConfig.chainId,
      uniqueNonces: [1],
      msgToSign,
    });

    stealthKeys = keyResult.spendingKeys;
    const spendingPrivateKey = stealthKeys[0];
    const spendingPrivateKeyAccount = privateKeyToAccount(spendingPrivateKey as `0x${string}`);

    spendingPublicKey = spendingPrivateKeyAccount.publicKey;
    viewingPrivateKey = keyResult.viewingPrivateKey;
    console.log('spendingPublicKey', spendingPublicKey);
  }

  //ens sign
  const nameData: EnsData = {
    ensUsername: config.ens,
    eoaAddress: config.walletClient.account?.address as Address,
    addresses: {
      '60': config.walletClient.account?.address as Address, // Ethereum address (default for all chains)
    },
    texts: {
      url: agentDetails.website || '',
      avatar: agentDetails.website + '/avatar' || '',
      email: agentDetails.email || '',
      website: agentDetails.website || '',
      description: agentDetails.description || '',
      encryptionPublicKey: (spendingPublicKey as Hex) || '0x',
      'com.twitter': agentDetails.twitter || '',
      'com.github': agentDetails.github || '',
      'com.discord': agentDetails.discord || '',
    },
    contenthash: '0x', // Empty content hash
  };

  const expiration = Date.now() + 365 * 24 * 60 * 60 * 1000;

  // Create the complete registration data that matches what the server expects
  const registrationData = {
    ensData: nameData,
    supportedChains: [config.chainId.toString()],
    modules: config.modules,
    privacyEnabled: config.needPrivacy ?? false,
    privacyData:
      (config.needPrivacy ?? false)
        ? {
            spendingPublicKey: (spendingPublicKey as Hex) || '0x',
            viewingPrivateKey: (viewingPrivateKey as Hex) || '0x',
          }
        : undefined,
    eigenAiEnabled: config.eigenAiEnabled ?? false,
  };

  const messageToSign = JSON.stringify(registrationData);

  const signature = await config.walletClient.signMessage({
    message: messageToSign,
    account: config.walletClient.account as Account,
  });

  const requestBodyAny: any = {
    ensData: nameData,
    supportedChains: [config.chainId.toString()] as unknown as RegisterRequest['supportedChains'],
    modules: config.modules,
    privacyEnabled: config.needPrivacy ?? false,
    eigenAiEnabled: config.eigenAiEnabled ?? false,
    signature: {
      hash: signature,
      message: messageToSign,
      expiration: expiration,
      signature: signature,
    },
  };

  if (config.needPrivacy) {
    requestBodyAny.privacyData = {
      spendingPublicKey: (spendingPublicKey as Hex) || '0x',
      viewingPrivateKey: (viewingPrivateKey as Hex) || '0x',
    };
  }

  const requestBody = requestBodyAny as RegisterRequest;

  console.log('Request body being sent:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${SERVER_URL_ENS}/set`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const result = await response.json();

  console.log('result', result);

  // Log detailed validation errors
  if (result.details && Array.isArray(result.details)) {
    console.log('Validation error details:');
    result.details.forEach((detail: unknown, index: number) => {
      const d = detail as {
        code: string;
        expected?: unknown;
        received?: unknown;
        path?: unknown;
        message: string;
      };
      console.log(`Error ${index + 1}:`, {
        code: d.code,
        expected: d.expected,
        received: d.received,
        path: d.path,
        message: d.message,
      });
    });
  }

  return {
    apiKey: result.apiKey,
    ensCall: result,

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
