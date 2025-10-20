import { getModules } from "unwallet";

async function testGetModules() {
  try {
    console.log("Testing getModules function...");

    const modules = await getModules();

    console.log("✅ Successfully fetched modules:");
    console.log(`Total modules: ${modules.totalModules}`);
    console.log(`Supported networks: ${modules.supportedNetworks.map((network) => network.name).join(", ")}`);

    if (modules.modules.length > 0) {
      console.log("\n📦 Available modules:");
      modules.modules.forEach((module, index) => {
        console.log(`\n${index + 1}. ${module.name} (${module.id})`);
        console.log(`   Description: ${module.description}`);
        console.log(`   Supported tokens: ${module.supportedTokens.join(", ")}`);
        console.log(`   Features: ${module.features.join(", ")}`);

        if (module.deployments.length > 0) {
          console.log("   Deployments:");
          module.deployments.forEach((deployment) => {
            console.log(`     - ${deployment.networkName} (${deployment.network}): ${deployment.address}`);
          });
        }
      });
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
