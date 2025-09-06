import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Test runner for all SDK functions
const runAllTests = async () => {
  console.log("🚀 Starting Unwallet SDK Tests...\n");

  try {
    // Import all test functions
    const { testCreateStealthAddress } = await import("./test-stealth-address.js");
    const { testGetTransactions } = await import("./test-transactions.js");
    const { testProcessOnePayment } = await import("./test-payment.js");

    // Test 1: Stealth Address Generation
    console.log("=".repeat(50));
    console.log("TEST 1: Stealth Address Generation");
    console.log("=".repeat(50));
    await testCreateStealthAddress();

    console.log("\n" + "=".repeat(50));
    console.log("TEST 2: Transaction Data Fetching");
    console.log("=".repeat(50));
    await testGetTransactions();

    console.log("\n" + "=".repeat(50));
    console.log("TEST 3: Payment Processing");
    console.log("=".repeat(50));
    await testProcessOnePayment();

    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests completed!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("❌ Test runner failed:", error);
  }
};

// Run all tests
runAllTests();
