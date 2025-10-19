import type { Address, Account, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generateInitialKeysOnClient } from './stealth-address';
import type { AccountConfig, EnsData, RegisterRequest } from '../types/account-types';

export type AgentDetails = {
  email: string;
  website: string;
  description: string;
  twitter: string;
  github: string;
  telegram: string;
  discord: string;
};

export type GeneratedPrivacyKeys = {
  spendingPrivateKey: Hex;
  spendingPublicKey: Hex;
  viewingPrivateKey: Hex;
};

export const generatePrivacyKeys = async (config: AccountConfig): Promise<GeneratedPrivacyKeys> => {
  const msgToSign = 'CREATE_ACCOUNT';
  const keyResult = await generateInitialKeysOnClient({
    walletClient: config.walletClient,
    chainId: config.chainId,
    uniqueNonces: [1],
    msgToSign,
  });

  const spendingPrivateKey = keyResult.spendingKeys[0] as Hex;
  const spendingAccount = privateKeyToAccount(spendingPrivateKey as `0x${string}`);
  const spendingPublicKey = spendingAccount.publicKey as Hex;

  return {
    spendingPrivateKey,
    spendingPublicKey,
    viewingPrivateKey: keyResult.viewingPrivateKey as Hex,
  };
};

export const buildEnsData = (
  config: AccountConfig,
  agentDetails: AgentDetails,
  spendingPublicKey?: Hex,
): EnsData => {
  return {
    ensUsername: config.ens,
    eoaAddress: config.walletClient.account?.address as Address,
    addresses: {
      '60': config.walletClient.account?.address as Address,
    },
    texts: {
      url: agentDetails.website || '',
      avatar: `${agentDetails.website || ''}/avatar`,
      email: agentDetails.email || '',
      website: agentDetails.website || '',
      description: agentDetails.description || '',
      encryptionPublicKey: (spendingPublicKey as string) || '0x',
      'com.twitter': agentDetails.twitter || '',
      'com.github': agentDetails.github || '',
      'com.discord': agentDetails.discord || '',
    },
    contenthash: '0x',
  };
};

export const buildRegistrationData = (
  config: AccountConfig,
  ensData: EnsData,
  privacyKeys?: GeneratedPrivacyKeys,
) => {
  return {
    ensData,
    supportedChains: [config.chainId.toString()],
    modules: config.modules,
    privacyEnabled: config.needPrivacy ?? false,
    privacyData:
      (config.needPrivacy ?? false)
        ? {
            spendingPublicKey: (privacyKeys?.spendingPublicKey as Hex) || '0x',
            viewingPrivateKey: (privacyKeys?.viewingPrivateKey as Hex) || '0x',
          }
        : undefined,
    eigenAiEnabled: config.eigenAiEnabled ?? false,
  };
};

export const signRegistrationData = async (
  config: AccountConfig,
  registrationData: ReturnType<typeof buildRegistrationData>,
) => {
  const messageToSign = JSON.stringify(registrationData);
  const signature = await config.walletClient.signMessage({
    account: config.walletClient.account as Account,
    message: messageToSign,
  });
  return { messageToSign, signature } as const;
};

export const prepareRegisterRequest = async (
  config: AccountConfig,
  agentDetails: AgentDetails,
): Promise<RegisterRequest> => {
  const privacyKeys = config.needPrivacy ? await generatePrivacyKeys(config) : undefined;
  const ensData = buildEnsData(config, agentDetails, privacyKeys?.spendingPublicKey);
  const registrationData = buildRegistrationData(config, ensData, privacyKeys);
  const { messageToSign, signature } = await signRegistrationData(config, registrationData);

  const expiration = Date.now() + 365 * 24 * 60 * 60 * 1000;

  const req: Omit<RegisterRequest, 'privacyData'> & {
    privacyData?: RegisterRequest['privacyData'];
  } = {
    ensData,
    supportedChains:
      registrationData.supportedChains as unknown as RegisterRequest['supportedChains'],
    modules: registrationData.modules,
    privacyEnabled: registrationData.privacyEnabled,
    eigenAiEnabled: registrationData.eigenAiEnabled,
    signature: {
      hash: signature as Hex,
      message: messageToSign,
      expiration,
      signature: signature as Hex,
    },
  };
  if (registrationData.privacyData !== undefined) {
    req.privacyData = registrationData.privacyData;
  }

  return req as RegisterRequest;
};

export const prettyPrintRegisterRequest = (request: RegisterRequest): string => {
  return JSON.stringify(request, null, 2);
};
