import dotenv from "dotenv";
import { getRequiredState } from "unwallet";
import { currentChain } from "./utils/chain.js";

dotenv.config();

// All available module names
const AVAILABLE_MODULES = ["AUTOEARN", "AUTOSWAP", "AUTOBRIDGE", "BOND"] as const;

export const testAllModulesRequiredState = async () => {
  try {
    console.log("🔍 Testing getRequiredState function for ALL modules...");
    console.log(`📍 Current Chain: ${currentChain.name} (ID: ${currentChain.id})`);
    console.log(`📋 Available Modules: ${AVAILABLE_MODULES.join(", ")}\n`);

    const results: Record<string, any> = {};
    const errors: Record<string, any> = {};

    for (const moduleName of AVAILABLE_MODULES) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🧪 Testing Module: ${moduleName}`);
      console.log(`${"=".repeat(60)}`);

      try {
        const startTime = Date.now();

        const result = await getRequiredState({
          sourceChainId: currentChain.id,
          moduleName: moduleName,
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`✅ Success! (${duration}ms)`);
        console.log(`📊 Result Summary:`);
        console.log(`   - Chain ID: ${result.chainId}`);
        console.log(`   - Module Name: ${result.moduleName}`);
        console.log(`   - Config Input Type: ${result.configInputType}`);
        console.log(`   - Required Fields Count: ${result.requiredFields.length}`);
        console.log(`   - Required Fields: ${result.requiredFields.map((f) => f.name).join(", ")}`);
        console.log(`   - Config Template Keys: ${Object.keys(result.configTemplate).join(", ")}`);

        // Store detailed result
        results[moduleName] = {
          success: true,
          duration,
          data: result,
        };

        // Show full result for analysis
        console.log(`\n📋 Full Result:`);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.log(`❌ Error: ${errorMessage}`);
        if (errorStack) {
          console.log(`🔍 Stack Trace:`, errorStack);
        }

        errors[moduleName] = {
          success: false,
          error: errorMessage,
          fullError: error instanceof Error ? error.stack : String(error),
        };
      }
    }

    // Summary Report
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📊 COMPREHENSIVE SUMMARY REPORT`);
    console.log(`${"=".repeat(80)}`);

    console.log(`\n✅ Successful Tests: ${Object.keys(results).length}/${AVAILABLE_MODULES.length}`);
    for (const [moduleName, result] of Object.entries(results)) {
      console.log(`   - ${moduleName}: ${result.duration}ms, ${result.data.requiredFields.length} fields`);
    }

    if (Object.keys(errors).length > 0) {
      console.log(`\n❌ Failed Tests: ${Object.keys(errors).length}/${AVAILABLE_MODULES.length}`);
      for (const [moduleName, error] of Object.entries(errors)) {
        console.log(`   - ${moduleName}: ${error.error}`);
      }
    }

    // Analysis of different outputs
    console.log(`\n🔍 OUTPUT ANALYSIS:`);
    console.log(`\n1. Required Fields Comparison:`);
    const fieldAnalysis: Record<string, string[]> = {};
    for (const [moduleName, result] of Object.entries(results)) {
      // Explicitly type the field parameter as 'any'
      fieldAnalysis[moduleName] = result.data.requiredFields.map((f: any) => f.name);
    }

    for (const [moduleName, fields] of Object.entries(fieldAnalysis)) {
      console.log(`   ${moduleName}: [${fields.join(", ")}]`);
    }

    console.log(`\n2. Config Input Types Comparison:`);
    for (const [moduleName, result] of Object.entries(results)) {
      console.log(`   ${moduleName}: ${result.data.configInputType}`);
    }

    console.log(`\n3. Config Template Comparison:`);
    for (const [moduleName, result] of Object.entries(results)) {
      const templateKeys = Object.keys(result.data.configTemplate);
      console.log(`   ${moduleName}: [${templateKeys.join(", ")}]`);
    }

    // Unique field analysis
    const allFields = new Set<string>();
    for (const fields of Object.values(fieldAnalysis)) {
      fields.forEach((field) => allFields.add(field));
    }

    console.log(`\n4. Unique Fields Across All Modules:`);
    console.log(`   Total unique fields: ${allFields.size}`);
    console.log(`   Fields: [${Array.from(allFields).join(", ")}]`);

    // Field frequency analysis
    const fieldFrequency: Record<string, number> = {};
    for (const fields of Object.values(fieldAnalysis)) {
      fields.forEach((field) => {
        fieldFrequency[field] = (fieldFrequency[field] || 0) + 1;
      });
    }

    console.log(`\n5. Field Frequency Analysis:`);
    for (const [field, count] of Object.entries(fieldFrequency)) {
      console.log(`   ${field}: appears in ${count} module(s)`);
    }

    return { results, errors, fieldAnalysis, fieldFrequency };
  } catch (error) {
    console.error("❌ Error in comprehensive test:", error);
    throw error;
  }
};

// Run the test if this file is executed directly
(async () => {
  try {
    const summary = await testAllModulesRequiredState();
    console.log("\n✅ Comprehensive test completed successfully!");
    console.log(`📊 Final Summary: ${Object.keys(summary.results).length} successful, ${Object.keys(summary.errors).length} failed`);
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("\n❌ Comprehensive test failed:");
    console.error("Error message:", errorMessage);
    if (errorStack) {
      console.error("Stack trace:", errorStack);
    }
    console.error("Full error:", error);
    process.exit(1);
  }
})();
