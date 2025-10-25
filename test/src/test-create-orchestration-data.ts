import dotenv from "dotenv";
import { createOrchestrationData } from "unwallet";
import { currentChain } from "./utils/chain.js";
import type { CurrentState, RequiredState } from "unwallet";

dotenv.config();

export const testCreateOrchestrationData = async () => {
  try {
    console.log("🔍 Testing createOrchestrationData function...");

    // Create mock required state (bypassing getRequiredState to avoid RPC dependency)
    const requiredState: RequiredState = {
      chainId: "421614", // Arbitrum Sepolia
      moduleName: "BOND",
      configInputType: "tuple[](uint256 chainId, address tokenAddress)",
      requiredFields: [
        { type: "uint256", name: "chainId" },
        { type: "address", name: "tokenAddress" },
      ],
      configTemplate: {
        moduleAddress: "0x6e1fAc6e36f01615ef0c0898Bf6c5F260Bf2609a",
        sourceTokenAddress: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
        destinationTokenAddress: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
        tokenAddress: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
      },
    };
    console.log("Required state:", requiredState);

    // Create current state
    const currentState: CurrentState = {
      chainId: currentChain.id,
      tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      tokenAmount: "100000",
      ownerAddress: "0x1234567890123456789012345678901234567890",
    };

    const ownerAddress = "0x1234567890123456789012345678901234567890";
    const apiKey = "test-api-key";

    // Test the function
    const orchestrationData = await createOrchestrationData(currentState, requiredState, ownerAddress, apiKey);

    console.log("✅ Successfully created orchestration data:");
    console.log("Request ID:", orchestrationData.requestId);
    console.log("Source Chain ID:", orchestrationData.sourceChainId);
    console.log("Destination Chain ID:", orchestrationData.destinationChainId);
    console.log("Source Token Amount:", orchestrationData.sourceTokenAmount.toString());

    console.log("\n✅ Test completed successfully!");
    return orchestrationData;
  } catch (error) {
    console.error("❌ Error testing createOrchestrationData:", error);
    throw error;
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCreateOrchestrationData()
    .then(() => {
      console.log("\n✅ Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}
