import dotenv from "dotenv";
import { getRequiredState } from "unwallet";
import { currentChain } from "./utils/chain.js";

dotenv.config();

// All available module names
const AVAILABLE_MODULES = ["AUTOEARN", "AUTOSWAP", "AUTOBRIDGE", "BOND"] as const;

async function testModule(moduleName: string) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Testing Module: ${moduleName}`);
  console.log(`${"=".repeat(50)}`);

  try {
    const result = await getRequiredState({
      sourceChainId: currentChain.id,
      moduleName: moduleName as any,
    });

    console.log(`✅ Success for ${moduleName}:`);
    console.log(`   Chain ID: ${result.chainId}`);
    console.log(`   Module Name: ${result.moduleName}`);
    console.log(`   Config Input Type: ${result.configInputType}`);
    console.log(`   Required Fields: ${result.requiredFields.map((f) => f.name).join(", ")}`);
    console.log(`   Config Template: ${JSON.stringify(result.configTemplate, null, 2)}`);

    return { success: true, data: result };
  } catch (error) {
    console.log(`❌ Error for ${moduleName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log(`🔍 Testing getRequiredState for all modules on chain ${currentChain.name} (${currentChain.id})`);

  const results: any = {};

  for (const moduleName of AVAILABLE_MODULES) {
    results[moduleName] = await testModule(moduleName);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${"=".repeat(80)}`);

  const successful = Object.values(results).filter((r: any) => r.success);
  const failed = Object.values(results).filter((r: any) => !r.success);

  console.log(`✅ Successful: ${successful.length}/${AVAILABLE_MODULES.length}`);
  console.log(`❌ Failed: ${failed.length}/${AVAILABLE_MODULES.length}`);

  if (successful.length > 0) {
    console.log(`\n📋 Required Fields Analysis:`);
    for (const [moduleName, result] of Object.entries(results)) {
      if ((result as any).success) {
        const fields = (result as any).data.requiredFields.map((f: any) => f.name);
        console.log(`   ${moduleName}: [${fields.join(", ")}]`);
      }
    }
  }
}

runAllTests().catch(console.error);


