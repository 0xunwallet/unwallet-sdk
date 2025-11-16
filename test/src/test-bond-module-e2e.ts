#!/usr/bin/env bun

/**
 * End-to-End Test for BondModule Installation - Using SDK
 * 
 * Tests all 4 scenarios:
 * 1. Base Sepolia → Base Sepolia (same chain)
 * 2. Arbitrum Sepolia → Arbitrum Sepolia (same chain)
 * 3. Base Sepolia → Arbitrum Sepolia (cross-chain)
 * 4. Arbitrum Sepolia → Base Sepolia (cross-chain)
 * 
 * For each scenario:
 * - Generates a random user account
 * - Creates orchestration request with BondModule using SDK
 * - Sends USDC from TEST_PRIVATE_KEY account to source account (always)
 * - Notifies server to trigger deployment using SDK
 * - Verifies account deployment
 * 
 * Key Features:
 * - Uses SDK functions for all operations
 * - Uses createBondModuleConfig and encodeBondModuleData from SDK
 * - Uses createOrchestrationData, deposit, notifyDeposit, pollOrchestrationStatus
 * - Always sends funds to source account address
 * 
 * Prerequisites:
 * - Server must be running or use production server
 * - TEST_PRIVATE_KEY environment variable must be set (account with USDC and ETH on both chains)
 * - Account must have USDC on both Base Sepolia and Arbitrum Sepolia
 * - Account must have ETH on both chains for gas
 * 
 * Usage: cd test && bun run src/test-bond-module-e2e.ts
 */

import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'
import {
  createOrchestrationData,
  notifyDeposit,
  pollOrchestrationStatus,
  getRequiredState,
  encodeBondModuleData,
  createBondModuleConfig,
  deposit,
} from 'unwallet'
import type { CurrentState, OrchestrationStatus } from 'unwallet'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Network configurations
const NETWORKS = {
  baseSepolia: {
    name: 'Base Sepolia',
    chainId: 84532,
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    contracts: {
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
    }
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    contracts: {
      usdcToken: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d' as Address,
    }
  }
}

// Test configuration
const TEST_CONFIG = {
  bridgeAmount: parseUnits('0.05', 6), // 0.05 USDC (6 decimals) - small amount for testing
  apiUrl: process.env.API_URL || process.env.TEST_SERVER_URL || process.env.SERVER_URL || 'https://tee.wall8.xyz',
  apiKey: process.env.API_KEY || 'test-api-key',
}

// ERC20 ABI
const ERC20_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

interface TestScenario {
  name: string
  sourceChain: keyof typeof NETWORKS
  destinationChain: keyof typeof NETWORKS
  sourceChainId: number
  destinationChainId: number
  isCrossChain: boolean
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'Base → Base (Same Chain)',
    sourceChain: 'baseSepolia',
    destinationChain: 'baseSepolia',
    sourceChainId: 84532,
    destinationChainId: 84532,
    isCrossChain: false,
  },
  {
    name: 'Arbitrum → Arbitrum (Same Chain)',
    sourceChain: 'arbitrumSepolia',
    destinationChain: 'arbitrumSepolia',
    sourceChainId: 421614,
    destinationChainId: 421614,
    isCrossChain: false,
  },
  {
    name: 'Base → Arbitrum (Cross-Chain)',
    sourceChain: 'baseSepolia',
    destinationChain: 'arbitrumSepolia',
    sourceChainId: 84532,
    destinationChainId: 421614,
    isCrossChain: true,
  },
  {
    name: 'Arbitrum → Base (Cross-Chain)',
    sourceChain: 'arbitrumSepolia',
    destinationChain: 'baseSepolia',
    sourceChainId: 421614,
    destinationChainId: 84532,
    isCrossChain: true,
  },
]

async function checkServerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${TEST_CONFIG.apiUrl}/api/v1/orchestration/chains`)
    return response.ok
  } catch {
    return false
  }
}

async function createOrchestrationRequest(
  scenario: TestScenario,
  userAddress: Address,
  destPublicClient: any
): Promise<any> {
  console.log(`\n📤 Creating orchestration request for: ${scenario.name}`)
  
  const sourceNetwork = NETWORKS[scenario.sourceChain]
  const destNetwork = NETWORKS[scenario.destinationChain]
  
  // Get required state using SDK - MUST use destination chain's public client
  console.log(`\n📊 Getting required state for BondModule on ${destNetwork.name} (chainId: ${scenario.destinationChainId})...`)
  
  // First, verify the BondModule contract exists on the destination chain
  let requiredState
  try {
    requiredState = await getRequiredState({
      sourceChainId: String(scenario.destinationChainId) as any,
      moduleName: 'BOND',
      publicClient: destPublicClient, // Use destination chain's public client
    })
  } catch (error: any) {
    const errorMsg = error?.message || error?.toString() || 'Unknown error'
    if (errorMsg.includes('getConfigInputTypeData') || errorMsg.includes('returned no data') || errorMsg.includes('reverted')) {
      throw new Error(
        `❌ BondModule does not exist or is not accessible on ${destNetwork.name} (chainId: ${scenario.destinationChainId}). ` +
        `Please ensure the BondModule is deployed on this chain before running the test. ` +
        `Error: ${errorMsg}`
      )
    }
    throw error
  }
  
  // Validate module address is not zero
  if (!requiredState.moduleAddress || requiredState.moduleAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(
      `❌ Invalid BondModule address on ${destNetwork.name} (chainId: ${scenario.destinationChainId}). ` +
      `Module address is zero address.`
    )
  }
  
  // Verify the contract exists at the module address
  const contractCode = await destPublicClient.getCode({ address: requiredState.moduleAddress as Address })
  if (!contractCode || contractCode === '0x') {
    throw new Error(
      `❌ BondModule contract does not exist at address ${requiredState.moduleAddress} on ${destNetwork.name} (chainId: ${scenario.destinationChainId}). ` +
      `Please ensure the BondModule is deployed at this address.`
    )
  }
  
  console.log(`✅ Module Address: ${requiredState.moduleAddress}`)
  console.log(`   Chain ID: ${requiredState.chainId}`)
  console.log(`   Contract verified: ${contractCode.length} bytes of code`)
  
  // Create BondModule config using SDK
  console.log('\n🔧 Creating BondModule configuration using SDK...')
  const bondConfig = createBondModuleConfig(
    [destNetwork.contracts.usdcToken], // Token addresses to bond
    [TEST_CONFIG.bridgeAmount] // Total amounts for each token
  )
  console.log(`✅ Created BondModule config:`)
  console.log(`   Token Addresses: ${bondConfig.tokenAddresses.join(', ')}`)
  console.log(`   Total Amounts: ${bondConfig.totalAmounts.map((a) => formatUnits(a, 6)).join(', ')} USDC`)
  
  // Encode BondModule data using SDK
  console.log('\n🔧 Encoding BondModule data using SDK...')
  const encodedData = encodeBondModuleData(bondConfig)
  console.log(`✅ Encoded BondModule data: ${encodedData.substring(0, 66)}...`)
  
  const currentState: CurrentState = {
    chainId: String(scenario.sourceChainId) as any,
    tokenAddress: sourceNetwork.contracts.usdcToken,
    tokenAmount: TEST_CONFIG.bridgeAmount.toString(),
    ownerAddress: userAddress,
  }
  
  console.log(`   Source Chain: ${scenario.sourceChainId} (${scenario.sourceChain})`)
  console.log(`   Destination Chain: ${scenario.destinationChainId} (${scenario.destinationChain})`)
  
  // Create orchestration data using SDK
  console.log('\n📤 Creating orchestration request using SDK...')
  const orchestrationData = await createOrchestrationData(
    currentState,
    requiredState,
    userAddress,
    TEST_CONFIG.apiKey,
    encodedData as Hex
  )
  
  console.log(`✅ Orchestration created successfully`)
  console.log(`   Request ID: ${orchestrationData.requestId}`)
  console.log(`   Source Account: ${orchestrationData.accountAddressOnSourceChain}`)
  console.log(`   Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`)
  return orchestrationData
}

async function sendUSDCToAccount(
  sourceChain: keyof typeof NETWORKS,
  recipient: Address,
  amount: bigint,
  walletClient: any,
  publicClient: any
): Promise<string> {
  const network = NETWORKS[sourceChain]
  
  console.log(`\n💰 Sending USDC to account using SDK`)
  console.log(`   Recipient: ${recipient}`)
  console.log(`   Amount: ${formatUnits(amount, 6)} USDC`)
  console.log(`   Token: ${network.contracts.usdcToken}`)
  
  // Check balance before
  const balanceBefore = await publicClient.readContract({
    address: network.contracts.usdcToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [recipient],
  }) as bigint
  
  console.log(`   Balance before: ${formatUnits(balanceBefore, 6)} USDC`)
  
  // Use SDK deposit function
  const depositResult = await deposit(
    recipient,
    network.contracts.usdcToken,
    amount,
    walletClient,
    publicClient
  )
  
  if (!depositResult.success || !depositResult.txHash) {
    throw new Error(`Deposit failed: ${depositResult.error}`)
  }
  
  console.log(`   Transaction hash: ${depositResult.txHash}`)
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: depositResult.txHash as `0x${string}`,
    confirmations: 2,
  })
  
  // Check balance after
  const balanceAfter = await publicClient.readContract({
    address: network.contracts.usdcToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [recipient],
  }) as bigint
  
  console.log(`   Balance after: ${formatUnits(balanceAfter, 6)} USDC`)
  console.log(`✅ USDC transfer confirmed`)
  
  return depositResult.txHash
}

async function notifyServer(
  requestId: Hex,
  transactionHash: Hex,
  blockNumber: string
): Promise<void> {
  console.log(`\n📢 Notifying server using SDK`)
  console.log(`   Request ID: ${requestId}`)
  
  // Use SDK notifyDeposit function
  await notifyDeposit({
    requestId: requestId,
    transactionHash: transactionHash,
    blockNumber: blockNumber,
  })
  
  console.log(`✅ Server notified`)
}

async function verifyAccountDeployment(
  chainId: number,
  accountAddress: Address,
  publicClient: any
): Promise<boolean> {
  console.log(`\n🔍 Verifying account deployment`)
  console.log(`   Chain ID: ${chainId}`)
  console.log(`   Account: ${accountAddress}`)
  
  const code = await publicClient.getCode({ address: accountAddress })
  const isDeployed = code && code !== '0x'
  
  if (isDeployed) {
    console.log(`✅ Account is deployed`)
    console.log(`   Code length: ${code.length} bytes`)
  } else {
    console.log(`❌ Account is not deployed`)
  }
  
  return isDeployed
}

// Removed - using pollOrchestrationStatus from SDK instead

async function checkBalances(
  scenario: TestScenario,
  accountAddress: Address,
  publicClient: any
): Promise<void> {
  // Use destination chain for checking balances (where the module is deployed)
  const network = NETWORKS[scenario.destinationChain]
  console.log(`\n💵 Checking USDC balance`)
  const balance = await publicClient.readContract({
    address: network.contracts.usdcToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [accountAddress],
  }) as bigint
  console.log(`   Account: ${accountAddress}`)
  console.log(`   Balance: ${formatUnits(balance, 6)} USDC`)
}

async function testScenario(
  scenario: TestScenario,
  testAccount: ReturnType<typeof privateKeyToAccount>,
  fundingAccount: ReturnType<typeof privateKeyToAccount>
): Promise<boolean> {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🧪 Testing Scenario: ${scenario.name}`)
  console.log(`${'='.repeat(80)}`)
  
  try {
    // Create clients
    const sourcePublicClient = createPublicClient({
      chain: NETWORKS[scenario.sourceChain].chain,
      transport: http(NETWORKS[scenario.sourceChain].rpcUrl),
    })
    
    const sourceWalletClient = createWalletClient({
      account: fundingAccount,
      chain: NETWORKS[scenario.sourceChain].chain,
      transport: http(NETWORKS[scenario.sourceChain].rpcUrl),
    })
    
    const destPublicClient = createPublicClient({
      chain: NETWORKS[scenario.destinationChain].chain,
      transport: http(NETWORKS[scenario.destinationChain].rpcUrl),
    })
    
    // Step 1: Create orchestration request using SDK
    // Pass destPublicClient because getRequiredState needs to query the destination chain
    const orchestrationData = await createOrchestrationRequest(
      scenario,
      testAccount.address,
      destPublicClient
    )
    
    const sourceAccountAddress = orchestrationData.accountAddressOnSourceChain as Address
    const destAccountAddress = orchestrationData.accountAddressOnDestinationChain as Address
    const requestId = orchestrationData.requestId as Hex
    
    // Step 2: ALWAYS send USDC to source account address
    console.log(`\n💡 Transfer strategy:`)
    console.log(`   Always send to source account address: ${sourceAccountAddress}`)
    
    const txHash = await sendUSDCToAccount(
      scenario.sourceChain,
      sourceAccountAddress, // Always send to source account
      TEST_CONFIG.bridgeAmount,
      sourceWalletClient,
      sourcePublicClient
    )
    
    // Get transaction receipt for block number
    const receipt = await sourcePublicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      confirmations: 2,
    })
    
    // Step 3: Notify server using SDK
    await notifyServer(requestId, receipt.transactionHash, receipt.blockNumber.toString())

    // Step 4: Poll orchestration status using SDK
    console.log(`\n⏳ Polling orchestration status using SDK...`)
    let finalStatus: OrchestrationStatus | null = null
    let completed = false
    
    try {
      const polledStatus = await pollOrchestrationStatus({
        requestId: requestId,
        interval: 3000,
        maxAttempts: 40,
        onStatusUpdate: (status: OrchestrationStatus) => {
          console.log(`\n[Status Update] ${status.status}`)
          if (status.updated_at || status.created_at) {
            console.log(
              `   Updated: ${new Date(status.updated_at || status.created_at || Date.now()).toLocaleString()}`
            )
          }
          if (status.error_message) {
            console.log(`   Error: ${status.error_message}`)
          }
        },
        onComplete: (status: OrchestrationStatus) => {
          console.log('\n🎉 Orchestration completed successfully!')
          console.log(`   Final Status: ${status.status}`)
          completed = true
          finalStatus = status
        },
        onError: (error: Error) => {
          console.log(`\n❌ Orchestration error: ${error.message}`)
        },
      })
      if (!finalStatus) {
        finalStatus = polledStatus
        completed = polledStatus.status === 'COMPLETED' || polledStatus.status === 'FAILED'
      }
    } catch (error) {
      console.log(`\n⚠️  Status polling completed or timed out`)
      if (error instanceof Error) {
        console.log(`   ${error.message}`)
      }
    }
    
    console.log(`\n📊 Orchestration Status:`)
    console.log(`   Status: ${finalStatus?.status || 'UNKNOWN'}`)

    // Step 6: Verify account deployments
    console.log(`\n🔍 Verifying deployments...`)
    let success = false
    if (scenario.isCrossChain) {
      // For cross-chain, verify both source and destination
      const sourceDeployed = await verifyAccountDeployment(
        scenario.sourceChainId,
        sourceAccountAddress,
        sourcePublicClient
      )
      const destDeployed = await verifyAccountDeployment(
        scenario.destinationChainId,
        destAccountAddress,
        destPublicClient
      )
      success = sourceDeployed && destDeployed
      if (!success) {
        console.log(`   ⚠️  Source deployed: ${sourceDeployed}, Destination deployed: ${destDeployed}`)
      }
    } else {
      // For same-chain, verify destination smart account deployment
      console.log(`   ℹ️  Same-chain scenario: verifying destination smart account`)
      success = await verifyAccountDeployment(
        scenario.destinationChainId,
        destAccountAddress, // Destination smart account with BondModule
        destPublicClient
      )
    }

    if (success) {
      console.log(`\n✅ Scenario ${scenario.name} completed successfully!`)
      // Check final balances for successful deployments
      // Always check destination account (where the module is deployed)
      await checkBalances(scenario, destAccountAddress, destPublicClient)
    } else {
      console.log(`\n❌ Scenario ${scenario.name} failed!`)
    }

    return success
    
  } catch (error: any) {
    console.error(`\n❌ Error in scenario ${scenario.name}:`, error.message)
    console.error(error.stack)
    return false
  }
}

async function main() {
  console.log('🚀 BondModule End-to-End Test Suite (Using SDK)')
  console.log('='.repeat(80))
  console.log(`API URL: ${TEST_CONFIG.apiUrl}`)
  console.log(`Test Amount: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC`)
  
  // Check server status
  console.log(`\n📡 Checking server status...`)
  const serverRunning = await checkServerStatus()
  if (!serverRunning) {
    console.error('❌ Server is not running!')
    console.error('   Please start the server: bun run src/index.ts')
    process.exit(1)
  }
  console.log('✅ Server is running')
  
  // Setup accounts
  console.log(`\n🔐 Setting up accounts...`)
  const fundingPrivateKey = process.env.TEST_PRIVATE_KEY as Hex
  if (!fundingPrivateKey) {
    throw new Error('TEST_PRIVATE_KEY environment variable not set')
  }
  const fundingAccount = privateKeyToAccount(fundingPrivateKey)
  console.log(`✅ Funding account: ${fundingAccount.address}`)
  
  // Generate random test account
  const testPrivateKey = generatePrivateKey()
  const testAccount = privateKeyToAccount(testPrivateKey)
  console.log(`✅ Test account: ${testAccount.address}`)
  console.log(`   Private Key: ${testPrivateKey}`)
  console.log(`   ⚠️  Save this private key to use the smart accounts later!`)
  
  // Run all test scenarios
  const results: Array<{ scenario: string; success: boolean }> = []
  
  for (const scenario of TEST_SCENARIOS) {
    const success = await testScenario(scenario, testAccount, fundingAccount)
    results.push({
      scenario: scenario.name,
      success,
    })
    
    // Wait between tests
    if (scenario !== TEST_SCENARIOS[TEST_SCENARIOS.length - 1]) {
      console.log(`\n⏸️  Waiting 5 seconds before next test...`)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
  
  // Print summary
  console.log(`\n${'='.repeat(80)}`)
  console.log('📊 Test Summary')
  console.log(`${'='.repeat(80)}`)
  
  for (const result of results) {
    const icon = result.success ? '✅' : '❌'
    console.log(`${icon} ${result.scenario}: ${result.success ? 'PASSED' : 'FAILED'}`)
  }
  
  const passed = results.filter(r => r.success).length
  const total = results.length
  
  console.log(`\n📈 Results: ${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('🎉 All tests passed!')
    process.exit(0)
  } else {
    console.log('⚠️  Some tests failed')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

