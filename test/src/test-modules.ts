import { getModules } from "unwallet";

async function testGetModules() {
  try {
    console.log("Testing getModules function...");

    const modules = await getModules();

    console.log("✅ Successfully fetched modules:");
    console.log(`Total modules: ${modules.modules.length}`);

    if (modules.modules.length > 0) {
      console.log("\n📦 Available modules:");
      modules.modules.forEach((module, index) => {
        console.log(`\n${index + 1}. ${module.name} (${module.id})`);
        console.log(`   Description: ${module.description}`);

        // Display required fields
        if (module.userInputs.requiredFields.length > 0) {
          console.log("   Required fields:");
          module.userInputs.requiredFields.forEach((field) => {
            console.log(`     - ${field.name} (${field.type}): ${field.description}`);
            console.log(`       Example: ${field.example}`);
          });
        }

        // Display supported tokens by network
        if (Object.keys(module.userInputs.supportedTokens).length > 0) {
          console.log("   Supported tokens:");
          Object.entries(module.userInputs.supportedTokens).forEach(([network, networkTokens]) => {
            console.log(`     - ${network} (Chain ID: ${networkTokens.chainId}):`);
            networkTokens.tokens.forEach((token) => {
              console.log(`       * ${token.symbol}: ${token.address} (${token.decimals} decimals)`);
            });
          });
        }

        // Display deployments
        if (module.deployments.length > 0) {
          console.log("   Deployments:");
          module.deployments.forEach((deployment) => {
            console.log(`     - ${deployment.network} (Chain ID: ${deployment.chainId}): ${deployment.address}`);
          });
        }
      });

      // Display installation guide info
      if (modules.installationGuide) {
        console.log("\n🔧 Installation Guide:");
        console.log("   Module format:");
        console.log(`     - address: ${modules.installationGuide.moduleFormat.interface.address}`);
        console.log(`     - chainId: ${modules.installationGuide.moduleFormat.interface.chainId}`);
        console.log(`     - data: ${modules.installationGuide.moduleFormat.interface.data}`);

        if (Object.keys(modules.installationGuide.exampleRequests).length > 0) {
          console.log("\n   Example requests:");
          Object.entries(modules.installationGuide.exampleRequests).forEach(([moduleId, example]) => {
            console.log(`     - ${moduleId}:`);
            console.log(`       User input: ${JSON.stringify(example.userInput, null, 8)}`);
            console.log(`       Register format: ${JSON.stringify(example.registerRequestFormat, null, 8)}`);
          });
        }
      }
    }

    return modules;
  } catch (error) {
    console.error("❌ Error testing getModules:", error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGetModules()
    .then(() => {
      console.log("\n✅ Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testGetModules };
