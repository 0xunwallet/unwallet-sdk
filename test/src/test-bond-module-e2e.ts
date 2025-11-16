#!/usr/bin/env bun

/**
 * End-to-End Test for BondModule Installation
 * 
 * Tests all 4 scenarios:
 * 1. Base Sepolia → Base Sepolia (same chain)
 * 2. Arbitrum Sepolia → Arbitrum Sepolia (same chain)
 * 3. Base Sepolia → Arbitrum Sepolia (cross-chain)
 * 4. Arbitrum Sepolia → Base Sepolia (cross-chain)
 * 
 * For each scenario:
 * - Generates a random user account
 * - Creates orchestration request with BondModule
 * - Sends USDC from TEST_PRIVATE_KEY account to random account
 * - Notifies server to trigger deployment
 * - Verifies account deployment
 * 
 * Prerequisites:
 * - Server must be running: bun run src/index.ts
 * - TEST_PRIVATE_KEY environment variable must be set (account with USDC and ETH on both chains)
 * - Account must have USDC on both Base Sepolia and Arbitrum Sepolia
 * - Account must have ETH on both chains for gas
 * 
 * Usage: bun run scripts/test-bond-module-e2e.ts
 */

import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  keccak256,
  toHex,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables
import 'dotenv/config'

// Load deployment data
const deploymentDataPath = path.join(__dirname, '../src/deployments/deployments.json')
const deploymentData = JSON.parse(fs.readFileSync(deploymentDataPath, 'utf8'))

// Network configurations
const NETWORKS = {
  baseSepolia: {
    name: 'Base Sepolia',
    chainId: 84532,
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    contracts: {
      bondModule: (deploymentData.networks?.baseSepolia?.modules?.bondModule?.address || '0xd68229d1e47ad39156766d71cde1787b64905dc5') as Address,
      usdcToken: deploymentData.networks.baseSepolia.externalIntegrations.usdcToken as Address,
    }
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    contracts: {
      bondModule: (deploymentData.networks?.arbitrumSepolia?.modules?.bondModule?.address || '0x2e56ca0a3212e1ebef0d7e33d7c33be55b50259d') as Address,
      usdcToken: deploymentData.networks.arbitrumSepolia.externalIntegrations.usdcToken as Address,
    }
  }
}

// API Configuration
const API_URL = process.env.API_URL || 'https://tee.unwallet.io'
const TEST_CONFIG = {
  apiUrl: API_URL,
  bridgeAmount: parseUnits('0.05', 6), // 0.05 USDC (6 decimals) - small amount for testing
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
    const response = await fetch(`${API_URL}/api/v1/orchestration/chains`)
    return response.ok
  } catch {
    return false
  }
}

async function createOrchestrationRequest(
  scenario: TestScenario,
  userAddress: Address
): Promise<any> {
  console.log(`\n📤 Creating orchestration request for: ${scenario.name}`)
  
  const sourceNetwork = NETWORKS[scenario.sourceChain]
  const destNetwork = NETWORKS[scenario.destinationChain]
  
  // Encode BondModule initData: (address[] tokenAddresses, uint256[] totalAmounts)
  const tokenAddresses = [destNetwork.contracts.usdcToken]
  const totalAmounts = [TEST_CONFIG.bridgeAmount]
  
  const bondModuleInitData = encodeAbiParameters(
    [
      { type: 'address[]', name: 'tokenAddresses' },
      { type: 'uint256[]', name: 'totalAmounts' }
    ],
    [tokenAddresses, totalAmounts]
  )
  
  const orchestrationRequest = {
    currentState: [
      {
        chainId: scenario.sourceChainId,
        tokenAddress: sourceNetwork.contracts.usdcToken,
        amount: TEST_CONFIG.bridgeAmount.toString(),
      }
    ],
    requiredStateData: [
      {
        chainId: scenario.destinationChainId,
        moduleAddress: destNetwork.contracts.bondModule,
        encodedData: bondModuleInitData, // Direct initData for BondModule
      }
    ],
    userAddress: userAddress,
    apiKey: TEST_CONFIG.apiKey,
  }
  
  console.log(`   Source Chain: ${scenario.sourceChainId} (${scenario.sourceChain})`)
  console.log(`   Destination Chain: ${scenario.destinationChainId} (${scenario.destinationChain})`)
  console.log(`   BondModule Address: ${destNetwork.contracts.bondModule}`)
  console.log(`   Token Addresses: ${tokenAddresses.join(', ')}`)
  console.log(`   Total Amounts: ${totalAmounts.map(a => formatUnits(a, 6)).join(', ')} USDC`)
  
  const response = await fetch(`${API_URL}/api/v1/orchestration/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orchestrationRequest),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Orchestration request failed: ${response.status} - ${error}`)
  }
  
  const result = await response.json() as any
  if (!result.success || !result.data) {
    throw new Error(`Orchestration request failed: ${result.error || 'Unknown error'}`)
  }
  const data = result.data
  console.log(`✅ Orchestration created successfully`)
  console.log(`   Request ID: ${data.requestId}`)
  console.log(`   Source Account: ${data.accountAddressOnSourceChain}`)
  console.log(`   Destination Account: ${data.accountAddressOnDestinationChain}`)
  return data
}

async function sendUSDCToAccount(
  sourceChain: keyof typeof NETWORKS,
  recipient: Address,
  amount: bigint,
  walletClient: any,
  publicClient: any
): Promise<string> {
  const network = NETWORKS[sourceChain]
  
  console.log(`\n💰 Sending USDC to account`)
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
  
  // Send USDC
  const txHash = await walletClient.writeContract({
    address: network.contracts.usdcToken,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
  })
  
  console.log(`   Transaction hash: ${txHash}`)
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
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
  
  return txHash
}

async function notifyServer(
  requestId: Hex,
  transferType: number = 0,
  transactionHash?: Hex
): Promise<void> {
  console.log(`\n📢 Notifying server`)
  console.log(`   Request ID: ${requestId}`)
  console.log(`   Transfer Type: ${transferType} (${transferType === 0 ? 'NORMAL' : 'EIP-3009'})`)
  const notificationPayload: any = {
    requestId: requestId,
    transferType: transferType,
  }
  if (transactionHash) {
    notificationPayload.transactionHash = transactionHash
  }
  const response = await fetch(`${API_URL}/api/v1/notifications/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(notificationPayload),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Notification failed: ${response.status} - ${error}`)
  }
  const result = await response.json() as any
  if (!result.success) {
    throw new Error(`Notification failed: ${result.error || 'Unknown error'}`)
  }
  console.log(`✅ Server notified`)
  console.log(`   Message: ${result.message || 'Notification received'}`)
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

async function getOrchestrationStatus(requestId: Hex): Promise<any> {
  const response = await fetch(`${API_URL}/api/v1/orchestration/status/${requestId}`)
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get status: ${response.status} - ${errorText}`)
  }
  const result = await response.json() as any
  if (!result.success || !result.data) {
    throw new Error(`Failed to get status: ${result.error || 'Unknown error'}`)
  }
  return result.data
}

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
    
    // Step 1: Create orchestration request
    const orchestrationData = await createOrchestrationRequest(
      scenario,
      testAccount.address
    )
    
    const sourceAccountAddress = orchestrationData.accountAddressOnSourceChain as Address
    const destAccountAddress = orchestrationData.accountAddressOnDestinationChain as Address
    const requestId = orchestrationData.requestId as Hex
    // Step 2: Send USDC to the correct account
    // For same-chain: send to destination smart account (will be deployed)
    // For cross-chain: send to source account
    const recipientAddress = scenario.isCrossChain ? sourceAccountAddress : destAccountAddress
    console.log(`\n💡 Transfer strategy:`)
    if (scenario.isCrossChain) {
      console.log(`   Cross-chain: Send to source account → Bridge to destination`)
      console.log(`   Recipient: ${sourceAccountAddress} (source)`)
    } else {
      console.log(`   Same-chain: Send directly to destination smart account`)
      console.log(`   Recipient: ${destAccountAddress} (destination)`)
    }
    const txHash = await sendUSDCToAccount(
      scenario.sourceChain,
      recipientAddress,
      TEST_CONFIG.bridgeAmount,
      sourceWalletClient,
      sourcePublicClient
    )
    
    // Step 3: Notify server
    await notifyServer(requestId, 0, txHash as Hex)

    // Step 4: Wait based on scenario type (longer for cross-chain)
    const waitTime = scenario.isCrossChain ? 30000 : 15000 // 30s for cross-chain, 15s for same-chain
    console.log(`\n⏳ Waiting ${waitTime / 1000}s for ${scenario.isCrossChain ? 'cross-chain' : 'same-chain'} orchestration to process...`)
    await new Promise(resolve => setTimeout(resolve, waitTime))

    // Step 5: Check orchestration status
    const status = await getOrchestrationStatus(requestId)
    console.log(`\n📊 Orchestration Status:`)
    console.log(`   Status: ${status.status || 'UNKNOWN'}`)

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
  console.log('🚀 BondModule End-to-End Test Suite')
  console.log('='.repeat(80))
  console.log(`API URL: ${API_URL}`)
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

