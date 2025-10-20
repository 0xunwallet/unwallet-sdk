import dotenv from "dotenv";
import { getApiKey, type ModuleUserInput } from "unwallet";
import { createWalletClient, createPublicClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Load environment variables
dotenv.config();

const generateRandomEnsName = (): string => {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `test-${randomSuffix}.wall8.eth`;
};

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
// Test getApiKey with modules
export const testGetApiKeyWithModules = async () => {
  try {
    console.log("🔑 Testing getApiKey with modules...");

    // Use the randomly generated private key from the top level

    // Test configuration
    const config = {
      walletClient,
      publicClient,
      chainId: baseSepolia.id,
      ens: generateRandomEnsName(), // Generate a random ENS name
      modules: [], // Empty modules array since we'll generate them
      defaultToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, // USDC on Base Sepolia
      needPrivacy: false,
      eigenAiEnabled: false,
    };

    // Agent details
    const agentDetails = {
      email: "test@example.com",
      website: "https://example.com",
      description: "Test wallet with modules",
      twitter: "@testwallet",
      github: "testwallet",
      telegram: "testwallet",
      discord: "testwallet#1234",
    };

    // Module user inputs
    const moduleUserInputs: ModuleUserInput[] = [
      {
        moduleId: "autoEarn",
        chainId: baseSepolia.id,
        inputs: {
          chainId: baseSepolia.id,
          tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
        },
      },
      {
        moduleId: "autoSwap",
        chainId: baseSepolia.id,
        inputs: {
          chainId: baseSepolia.id,
          defaultTokenAddress: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
        },
      },
    ];

    console.log("📋 Configuration:");
    console.log(`   ENS: ${config.ens}`);
    console.log(`   Chain: ${baseSepolia.name} (${baseSepolia.id})`);
    console.log(`   Default Token: ${config.defaultToken}`);
    console.log(`   Modules to enable: ${moduleUserInputs.length}`);
    moduleUserInputs.forEach((module, index) => {
      console.log(`     ${index + 1}. ${module.moduleId} on chain ${module.chainId}`);
    });

    console.log("\n🚀 Calling getApiKey with modules...");

    // Call getApiKey with modules
    const result = await getApiKey(config as any, {
      agentDetails,
      moduleUserInputs,
    });

    console.log("✅ getApiKey with modules completed successfully!");
    console.log("📊 Results:");
    console.log(`   API Key: ${result.apiKey ? "Generated" : "Not generated"}`);
    console.log(`   Signature: ${result.signature ? "Present" : "Missing"}`);
    console.log(`   Config Hash: ${result.configHash ? "Present" : "Missing"}`);

    if (result.ensCall) {
      console.log("📡 ENS Call Response:");
      console.log(`   Success: ${result.ensCall.success || "Unknown"}`);
      if (result.ensCall.apiKey) {
        console.log(`   API Key: ${result.ensCall.apiKey.substring(0, 10)}...`);
      }
    }

    return result;
  } catch (error) {
    console.error("❌ Error testing getApiKey with modules:", error);
    throw error;
  }
};

// Test getApiKey without modules (backward compatibility)
export const testGetApiKeyWithoutModules = async () => {
  try {
    console.log("🔑 Testing getApiKey without modules (backward compatibility)...");

    // Generate a new random private key for this test
    const testPrivateKey = generatePrivateKey();
    const testAccount = privateKeyToAccount(testPrivateKey as `0x${string}`);
    const testWalletClient = createWalletClient({
      account: testAccount,
      chain: baseSepolia,
      transport: http(),
    });

    const testPublicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    // Test configuration
    const config = {
      walletClient: testWalletClient,
      publicClient: testPublicClient,
      chainId: baseSepolia.id,
      ens: generateRandomEnsName(), // Generate a random ENS name
      modules: [], // Empty modules array
      defaultToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, // USDC on Base Sepolia
      needPrivacy: false,
      eigenAiEnabled: false,
    };

    // Agent details
    const agentDetails = {
      email: "test2@example.com",
      website: "https://example2.com",
      description: "Test wallet without modules",
      twitter: "@testwallet2",
      github: "testwallet2",
      telegram: "testwallet2",
      discord: "testwallet2#1234",
    };

    console.log("📋 Configuration:");
    console.log(`   ENS: ${config.ens}`);
    console.log(`   Chain: ${baseSepolia.name} (${baseSepolia.id})`);
    console.log(`   Default Token: ${config.defaultToken}`);
    console.log(`   Modules: None (backward compatibility test)`);

    console.log("\n🚀 Calling getApiKey without modules...");

    // Call getApiKey without modules (should work as before)
    const result = await getApiKey(config as any, {
      agentDetails,
      // No moduleUserInputs provided
    });

    console.log("✅ getApiKey without modules completed successfully!");
    console.log("📊 Results:");
    console.log(`   API Key: ${result.apiKey ? "Generated" : "Not generated"}`);
    console.log(`   Signature: ${result.signature ? "Present" : "Missing"}`);
    console.log(`   Config Hash: ${result.configHash ? "Present" : "Missing"}`);

    return result;
  } catch (error) {
    console.error("❌ Error testing getApiKey without modules:", error);
    throw error;
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.all([testGetApiKeyWithModules(), testGetApiKeyWithoutModules()])
    .then(() => {
      console.log("\n✅ All getApiKey tests completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ getApiKey tests failed:", error);
      process.exit(1);
    });
}
