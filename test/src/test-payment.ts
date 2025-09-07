import dotenv from "dotenv";
import { processSinglePayment } from "unwallet-sdk";
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { currentChain, getTokenAddress } from "./utils/chain.js";

dotenv.config();

export const testProcessOnePayment = async () => {
  try {
    console.log("🔍 Testing processOnePayment function...");

    const privateKey = process.env.PRIVATE_KEY;
    const tokenAddress = getTokenAddress(currentChain.id);
    const recipientAddress = process.env.RECIPIENT_ADDRESS || "0xc6377415Ee98A7b71161Ee963603eE52fF7750FC";

    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required");
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: currentChain,
      transport: http(),
    });

    const publicClient = createPublicClient({
      chain: currentChain,
      transport: http(),
    });

    const result = await processSinglePayment({
      walletClient: walletClient as WalletClient,
      publicClient: publicClient as PublicClient,
      chainId: currentChain.id,
      tokenAddress,
      requestedAmount: "0.001",
      recipientAddress,
    });

    console.log("✅ Payment result:", result);

    if (result.success) {
      console.log("📊 Payment processed successfully");
      console.log("Payment details:", {
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        gasCost: result.gasCost,
        explorerUrl: result.explorerUrl,
        sponsorAddress: result.sponsorDetails?.sponsorAddress,
      });
    } else {
      console.log("❌ Payment processing failed");
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testProcessOnePayment();
}
