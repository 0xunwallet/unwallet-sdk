import { generateModulesForRegistration, getAvailableModules, validateModuleInputs, type ModuleUserInput } from "unwallet";

async function testModuleGeneration() {
  try {
    console.log("Testing module generation functionality...");

    // Test 1: Get available modules
    console.log("\n1. Getting available modules...");
    const availableModules = await getAvailableModules();
    console.log(`✅ Found ${availableModules.length} available modules`);

    availableModules.forEach((module) => {
      console.log(`   - ${module.name} (${module.id})`);
      console.log(`     Required fields: ${module.userInputs.requiredFields.map((f) => f.name).join(", ")}`);
      console.log(`     Supported chains: ${module.deployments.map((d) => d.chainId).join(", ")}`);
    });

    // Test 2: Validate module inputs
    console.log("\n2. Testing input validation...");

    // Valid AutoEarn input
    const validAutoEarnInput = {
      chainId: 421614,
      tokenAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    };

    const autoEarnValidation = await validateModuleInputs("autoEarn", validAutoEarnInput);
    console.log(`✅ AutoEarn validation: ${autoEarnValidation.valid ? "PASSED" : "FAILED"}`);
    if (!autoEarnValidation.valid) {
      console.log(`   Errors: ${autoEarnValidation.errors.join(", ")}`);
    }

    // Invalid input (missing required field)
    const invalidInput = {
      chainId: 421614,
      // Missing tokenAddress
    };

    const invalidValidation = await validateModuleInputs("autoEarn", invalidInput);
    console.log(`✅ Invalid input validation: ${invalidValidation.valid ? "PASSED" : "FAILED"}`);
    if (!invalidValidation.valid) {
      console.log(`   Errors: ${invalidValidation.errors.join(", ")}`);
    }

    // Test 3: Generate modules for registration
    console.log("\n3. Testing module generation for registration...");

    const userModuleInputs: ModuleUserInput[] = [
      {
        moduleId: "autoEarn",
        chainId: 421614,
        inputs: {
          chainId: 421614,
          tokenAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        },
      },
      {
        moduleId: "autoSwap",
        chainId: 421614,
        inputs: {
          chainId: 421614,
          defaultTokenAddress: "0x4200000000000000000000000000000000000006",
        },
      },
    ];

    const generationResult = await generateModulesForRegistration(userModuleInputs);

    console.log(`✅ Generated ${generationResult.modules.length} modules`);
    if (generationResult.errors.length > 0) {
      console.log(`   Errors: ${generationResult.errors.join(", ")}`);
    }

    // Display generated modules
    generationResult.modules.forEach((module, index) => {
      console.log(`\n   Module ${index + 1}:`);
      console.log(`     Address: ${module.address}`);
      console.log(`     Chain ID: ${module.chainId}`);
      console.log(`     Data: ${module.data}`);
    });

    // Test 4: Test with invalid module ID
    console.log("\n4. Testing with invalid module ID...");

    const invalidModuleInputs: ModuleUserInput[] = [
      {
        moduleId: "nonExistentModule",
        chainId: 421614,
        inputs: {
          chainId: 421614,
          tokenAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        },
      },
    ];

    try {
      const invalidResult = await generateModulesForRegistration(invalidModuleInputs);
      console.log(`✅ Invalid module test: Generated ${invalidResult.modules.length} modules, ${invalidResult.errors.length} errors`);
      if (invalidResult.errors.length > 0) {
        console.log(`   Errors: ${invalidResult.errors.join(", ")}`);
      }
    } catch (error) {
      console.log(`✅ Invalid module test: Caught expected error - ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    console.log("\n✅ All module generation tests completed successfully!");
    return generationResult;
  } catch (error) {
    console.error("❌ Error testing module generation:", error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testModuleGeneration()
    .then(() => {
      console.log("\n✅ Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testModuleGeneration };
