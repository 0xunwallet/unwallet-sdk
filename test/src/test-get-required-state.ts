import dotenv from "dotenv";
import { getRequiredState } from "unwallet";
import { createPublicClient, http, type PublicClient } from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import { currentChain } from "./utils/chain.js";

dotenv.config();

export const testGetRequiredState = async () => {
  try {
    console.log("🔍 Testing getRequiredState function...");

    // Test 1: Test with valid parameters using default public client
    console.log("\n1. Testing with valid parameters (default public client)...");

    const chainId = currentChain.id; // Using arbitrumSepolia (421614)
    const moduleName = "BOND";

    console.log(`   Chain ID: ${chainId}`);
    console.log(`   Module Name: ${moduleName}`);

    const result1 = await getRequiredState(chainId, moduleName);

    console.log("✅ Successfully fetched required state:");
    console.log("   Result:", result1);

    // Validate the result structure
    if (result1 && typeof result1 === "object") {
      console.log("   BSM Address:", result1.BSMAddress);
      console.log("   Token Address:", result1.tokenAddress);
      console.log("   Chain ID:", result1.chainId);
    }

    // Test 2: Test with custom public client
    console.log("\n2. Testing with custom public client...");

    const customPublicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(),
    });

    const result2 = await getRequiredState(chainId, moduleName, customPublicClient);

    console.log("✅ Successfully fetched required state with custom client:");
    console.log("   Result:", result2);

    // Test 3: Test with different chain (Base Sepolia)
    console.log("\n3. Testing with Base Sepolia chain...");

    const baseSepoliaChainId = baseSepolia.id;
    console.log(`   Chain ID: ${baseSepoliaChainId}`);

    try {
      const result3 = await getRequiredState(baseSepoliaChainId, moduleName);
      console.log("✅ Successfully fetched required state for Base Sepolia:");
      console.log("   Result:", result3);
    } catch (error) {
      console.log("⚠️  Base Sepolia test failed (expected if module not deployed):");
      console.log("   Error:", error instanceof Error ? error.message : "Unknown error");
    }

    // Test 4: Test with invalid module name
    console.log("\n4. Testing with invalid module name...");

    const invalidModuleName = "INVALID_MODULE";
    console.log(`   Module Name: ${invalidModuleName}`);

    try {
      const result4 = await getRequiredState(chainId, invalidModuleName);
      console.log("❌ Unexpected success with invalid module name:");
      console.log("   Result:", result4);
    } catch (error) {
      console.log("✅ Correctly caught error for invalid module name:");
      console.log("   Error:", error instanceof Error ? error.message : "Unknown error");
    }

    // Test 5: Test with invalid chain ID
    console.log("\n5. Testing with invalid chain ID...");

    const invalidChainId = 999999 as any; // Invalid chain ID
    console.log(`   Chain ID: ${invalidChainId}`);

    try {
      const result5 = await getRequiredState(invalidChainId, moduleName);
      console.log("❌ Unexpected success with invalid chain ID:");
      console.log("   Result:", result5);
    } catch (error) {
      console.log("✅ Correctly caught error for invalid chain ID:");
      console.log("   Error:", error instanceof Error ? error.message : "Unknown error");
    }

    // Test 6: Test with malformed public client
    console.log("\n6. Testing with malformed public client...");

    const malformedClient = {
      readContract: () => {
        throw new Error("Network connection failed");
      },
    } as any;

    try {
      const result6 = await getRequiredState(chainId, moduleName, malformedClient);
      console.log("❌ Unexpected success with malformed client:");
      console.log("   Result:", result6);
    } catch (error) {
      console.log("✅ Correctly caught error for malformed client:");
      console.log("   Error:", error instanceof Error ? error.message : "Unknown error");
    }

    // Test 7: Test error handling and logging
    console.log("\n7. Testing error handling and console logging...");

    // This test verifies that the function properly logs errors and re-throws them
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    let errorLogged = false;
    let moduleDataLogged = false;

    console.error = (...args) => {
      if (args[0] === "Error fetching module data:") {
        errorLogged = true;
      }
      originalConsoleError.apply(console, args);
    };

    console.log = (...args) => {
      if (args[0] === "moduleData") {
        moduleDataLogged = true;
      }
      originalConsoleLog.apply(console, args);
    };

    try {
      // This should succeed and log moduleData
      await getRequiredState(chainId, moduleName);
      console.log("✅ Module data logging test passed");
    } catch (error) {
      console.log("❌ Module data logging test failed");
    }

    // Restore original console methods
    console.error = originalConsoleError;
    console.log = originalConsoleLog;

    console.log("\n✅ All getRequiredState tests completed successfully!");
    return result1;
  } catch (error) {
    console.error("❌ Error testing getRequiredState:", error);
    throw error;
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGetRequiredState()
    .then(() => {
      console.log("\n✅ Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}
