import dotenv from "dotenv";
import { createTransferWithAuthorization } from "unwallet";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { currentChain, getTokenAddress } from "./utils/chain.js";

dotenv.config();

export const testTransferWithAuthorization = async () => {
  try {
    console.log("🔍 Testing createTransferWithAuthorization function...");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error("❌ PRIVATE_KEY environment variable is required");
      return;
    }

    const tokenAddress = getTokenAddress(currentChain.id);
    const recipientAddress = process.env.RECIPIENT_ADDRESS || "0xc6377415Ee98A7b71161Ee963603eE52fF7750FC";

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: currentChain,
      transport: http(),
    });

    console.log("📋 Test parameters:", {
      from: account.address,
      to: recipientAddress,
      amount: "1000000", // 1 USDC (6 decimals)
      tokenAddress,
      chainId: currentChain.id,
    });

    const result = await createTransferWithAuthorization({
      walletClient: walletClient as WalletClient,
      chainId: currentChain.id,
      tokenAddress,
      recipientAddress,
      amount: "1000000", // 1 USDC (6 decimals)
      validAfter: "0",
      validBefore: Math.floor(Date.now() / 1000 + 3600).toString(), // 1 hour from now
    });

    console.log("✅ TransferWithAuthorization result:", result);

    if (result.success) {
      console.log("📊 TransferWithAuthorization created successfully");
      console.log("Authorization details:", {
        from: result.authorization.from,
        to: result.authorization.to,
        value: result.authorization.value,
        validAfter: result.authorization.validAfter,
        validBefore: result.authorization.validBefore,
        nonce: result.authorization.nonce,
      });
      console.log("Signature:", result.signature);
      console.log("Explorer URL:", result.explorerUrl);

      // Create x402 payload for testing
      const paymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "arbitrum-sepolia",
        payload: {
          signature: result.signature,
          authorization: result.authorization,
        },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      console.log("📦 X-PAYMENT header created:", paymentHeader);
      console.log("📦 X-PAYMENT header length:", paymentHeader.length);
    } else {
      console.log("❌ TransferWithAuthorization failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Starting test...");
  testTransferWithAuthorization().catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
}
