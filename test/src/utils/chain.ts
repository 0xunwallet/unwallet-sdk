import { baseSepolia } from "viem/chains";

export const currentChain = baseSepolia;

export const getTokenAddress = (chainId: number) => {
  switch (chainId) {
    case 84532:
      return "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
    case 421614:
      return "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d";
    default:
      throw new Error(`Token address not found for chainId: ${chainId}`);
  }
};
