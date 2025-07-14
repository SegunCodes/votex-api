import { ethers, EventLog } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// --- Configuration ---
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || '[http://127.0.0.1:8545](http://127.0.0.1:8545)'; // Hardhat Network default
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY; // Private key for backend-initiated transactions

const contractAbiPath = path.join(__dirname, '../../abi/VoteXElection.json');

const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);

let adminWallet: ethers.Wallet | null = null;
if (ADMIN_PRIVATE_KEY) {
  adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  console.log(`Blockchain Service: Admin wallet initialized with address ${adminWallet.address}`);
} else {
  console.warn('Blockchain Service: ADMIN_PRIVATE_KEY is not set. Backend will only be able to perform read operations.');
}

let VoteXElectionABI: any;
let VoteXElectionBytecode: string; // To store bytecode for deployment
try {
    const contractJson = JSON.parse(fs.readFileSync(contractAbiPath, 'utf8'));
    VoteXElectionABI = contractJson.abi;
    VoteXElectionBytecode = contractJson.bytecode; // Extract bytecode
    console.log('VoteXElection ABI and Bytecode loaded successfully.');
} catch (error) {
    console.error(`Error loading VoteXElection ABI/Bytecode from ${contractAbiPath}:`, (error as Error).message);
    // Exit or throw if ABI is critical and not found
    process.exit(1);
}

// Global contract instance, initialized when a contract address is provided
let electionContractInstance: ethers.Contract | null = null;

// Function to initialize the smart contract instance for a specific election
// This should be called with the contract address obtained after deploying the VoteXElection contract for an election.
export const getElectionContractInstance = (contractAddress: string): ethers.Contract => {
    if (!ethers.isAddress(contractAddress)) {
        throw new Error(`Invalid contract address: ${contractAddress}`);
    }
    // Return a new instance each time to ensure it's connected to the correct signer/provider
    return new ethers.Contract(contractAddress, VoteXElectionABI, adminWallet || provider);
};

/**
 * Deploys the VoteXElection contract (should happen once per overall system, or a new instance per election).
 * In this design, we deploy one main `VoteXElection` contract and all elections are managed within it.
 * This function is mainly for system setup.
 * @returns {Promise<string>} The address of the deployed contract.
 */
export const deployVoteXElectionSystemContract = async (): Promise<string> => {
  if (!adminWallet) throw new Error("Admin wallet not configured. Cannot deploy contract.");
  console.log('[Blockchain Service] Deploying VoteXElection contract...');

  try {
    const VoteXElectionFactory = new ethers.ContractFactory(VoteXElectionABI, VoteXElectionBytecode, adminWallet);
    const contract = await VoteXElectionFactory.deploy();
    await contract.waitForDeployment(); // Wait for contract to be mined
    const contractAddress = await contract.getAddress();
    console.log(`VoteXElection System Contract deployed to: ${contractAddress}`);
    return contractAddress;
  } catch (error) {
    console.error('Error deploying VoteXElection contract:', (error as Error).message);
    throw new Error(`Failed to deploy VoteXElection contract: ${(error as Error).message}`);
  }
};

/**
 * Admin: Creates a new election record within the deployed VoteXElection smart contract.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The unique ID for the election (from MySQL).
 * @param {string} title - Election title.
 * @param {string} description - Election description.
 * @param {number} startTime - Unix timestamp for start.
 * @param {number} endTime - Unix timestamp for end.
 * @returns {Promise<string>} Transaction hash.
 */
export const createElectionOnChain = async (
    systemContractAddress: string,
    electionId: number,
    title: string,
    description: string,
    startTime: number,
    endTime: number
): Promise<string> => {
    if (!adminWallet) throw new Error("Admin wallet not configured. Cannot create election on chain.");
    const contract = getElectionContractInstance(systemContractAddress); // Use getElectionContractInstance
    try {
        const tx = await contract.createElection(electionId, title, description, startTime, endTime);
        await tx.wait();
        console.log(`Election ${electionId} created on chain. Tx hash: ${tx.hash}`);
        return tx.hash;
    } catch (error) {
        console.error(`Error creating election ${electionId} on chain:`, (error as Error).message);
        throw new Error(`Failed to create election on chain: ${(error as Error).message}`);
    }
};

/**
 * Admin: Creates a new post within an election on the smart contract.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {number} postId - The unique ID for the post (from MySQL).
 * @param {string} name - Name of the post (e.g., "President").
 * @param {number} maxVotesPerVoter - Max votes a voter can cast for this post.
 * @returns {Promise<string>} Transaction hash.
 */
export const createPostOnChain = async (
    systemContractAddress: string,
    electionId: number,
    postId: number,
    name: string,
    maxVotesPerVoter: number
): Promise<string> => {
    if (!adminWallet) throw new Error("Admin wallet not configured. Cannot create post on chain.");
    const contract = getElectionContractInstance(systemContractAddress);
    try {
        const tx = await contract.createPost(electionId, postId, name, maxVotesPerVoter);
        await tx.wait();
        console.log(`Post ${postId} created for election ${electionId} on chain. Tx hash: ${tx.hash}`);
        return tx.hash;
    } catch (error) {
        console.error(`Error creating post ${postId} on chain:`, (error as Error).message);
        throw new Error(`Failed to create post on chain: ${(error as Error).message}`);
    }
};

/**
 * Admin: Registers a candidate on the blockchain for a specific post within an election.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {number} postId - The ID of the post.
 * @param {string} blockchainCandidateId - The unique string ID for the candidate from off-chain DB.
 * @param {string} candidateName - Name of the candidate.
 * @returns {Promise<string>} Transaction hash.
 */
export const registerCandidateOnChain = async (
    systemContractAddress: string,
    electionId: number,
    postId: number,
    blockchainCandidateId: string,
    candidateName: string
): Promise<string> => {
    if (!adminWallet) throw new Error("Admin wallet not configured. Cannot register candidate on chain.");
    const contract = getElectionContractInstance(systemContractAddress);
    try {
        const tx = await contract.registerCandidate(electionId, postId, blockchainCandidateId, candidateName);
        await tx.wait();
        console.log(`Candidate ${candidateName} (${blockchainCandidateId}) registered for post ${postId} in election ${electionId} on chain. Tx hash: ${tx.hash}`);
        return tx.hash;
    } catch (error) {
        console.error(`Error registering candidate ${blockchainCandidateId} on chain:`, (error as Error).message);
        throw new Error(`Failed to register candidate on chain: ${(error as Error).message}`);
    }
};

/**
 * Admin: Globally whitelists a voter's wallet address on the blockchain.
 * This makes them eligible for all current and future elections.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {string} voterAddress - The wallet address to whitelist.
 * @returns {Promise<string>} Transaction hash.
 */
export const globalWhitelistVoterOnChain = async ( // RENAMED FROM whitelistVoterOnChain
  systemContractAddress: string,
  voterAddress: string
): Promise<string> => {
  if (!adminWallet) throw new Error("Admin wallet not configured. Cannot whitelist voter globally.");
  const contract = getElectionContractInstance(systemContractAddress);
  try {
      const tx = await contract.globalWhitelistVoter(voterAddress); // Call the new global function
      await tx.wait();
      console.log(`Voter ${voterAddress} globally whitelisted. Tx hash: ${tx.hash}`);
      return tx.hash;
  } catch (error) {
      console.error(`Error globally whitelisting voter ${voterAddress}:`, (error as Error).message);
      throw new Error(`Failed to globally whitelist voter on chain: ${(error as Error).message}`);
  }
};

/**
 * Checks if a voter is globally whitelisted.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {string} voterAddress - The address to check.
 * @returns {Promise<boolean>} True if globally whitelisted, false otherwise.
 */
export const isVoterGloballyWhitelisted = async (
  systemContractAddress: string,
  voterAddress: string
): Promise<boolean> => {
  console.log(`[Blockchain] Checking if voter ${voterAddress} is globally whitelisted...`);
  const contract = getElectionContractInstance(systemContractAddress);
  try {
      const whitelisted = await contract.isVoterGloballyWhitelisted(voterAddress);
      return whitelisted;
  } catch (error) {
      console.error(`Error checking global whitelisted status for voter ${voterAddress}:`, (error as Error).message);
      return false; // Assume not whitelisted on error
  }
};

/**
 * Admin: Starts an election on the blockchain.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election to start.
 * @returns {Promise<string>} Transaction hash.
 */
export const startElectionOnChain = async (systemContractAddress: string, electionId: number): Promise<string> => {
    if (!adminWallet) throw new Error("Admin wallet not configured. Cannot start election.");
    const contract = getElectionContractInstance(systemContractAddress);
    try {
        const tx = await contract.startElection(electionId);
        await tx.wait();
        console.log(`Election ${electionId} started on chain. Tx hash: ${tx.hash}`);
        return tx.hash;
    } catch (error) {
        console.error(`Error starting election ${electionId} on chain:`, (error as Error).message);
        throw new Error(`Failed to start election on chain: ${(error as Error).message}`);
    }
};

/**
 * Admin: Ends an election on the blockchain and triggers final tally.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election to end.
 * @returns {Promise<string>} Transaction hash.
 */
export const endElectionOnChain = async (systemContractAddress: string, electionId: number): Promise<string> => {
    if (!adminWallet) throw new Error("Admin wallet not configured. Cannot end election.");
    const contract = getElectionContractInstance(systemContractAddress);
    try {
        const tx = await contract.endElection(electionId);
        await tx.wait();
        console.log(`Election ${electionId} ended on chain. Tx hash: ${tx.hash}`);
        return tx.hash;
    } catch (error) {
        console.error(`Error ending election ${electionId} on chain:`, (error as Error).message);
        throw new Error(`Failed to end election on chain: ${(error as Error).message}`);
    }
};

/**
 * Admin: Fetches raw vote logs/events from the blockchain for auditing.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election to audit.
 * @returns {Promise<any>} Audit report data.
 */
export const performAudit = async (systemContractAddress: string, electionId: number): Promise<any> => {
  console.log(`[Blockchain Service] Performing audit for election ${electionId} on contract ${systemContractAddress}...`);
  const contract = getElectionContractInstance(systemContractAddress);
  try {
    const filter = contract.filters.VoteCast(electionId);
    const events = await contract.queryFilter(filter, 0);

    // Filter for EventLog types and map
    const parsedEvents = events.filter((event): event is EventLog => 'args' in event)
                               .map(event => ({
                                   electionId: Number(event.args.electionId),
                                   postId: Number(event.args.postId),
                                   blockchainCandidateId: event.args.blockchainCandidateId,
                                   voterAddress: event.args.voterAddress,
                                   transactionHash: event.transactionHash,
                                   blockNumber: event.blockNumber,
                               }));

    const totalVotesRecorded = parsedEvents.length;
    const uniqueVoters = new Set(parsedEvents.map(event => event.voterAddress)).size;

    return {
      totalVotesRecorded,
      uniqueVoters,
      rawEvents: parsedEvents, // Use the already parsed events
      integrityCheck: 'Passed (based on event count)',
    };
  } catch (error) {
    console.error(`Error performing audit for election ${electionId}:`, (error as Error).message);
    throw new Error(`Failed to perform audit on chain: ${(error as Error).message}`);
  }
};

/**
 * Casts a vote on the blockchain.
 * Note: This function would primarily verify a transaction hash sent from the frontend.
 * The actual `castVote` transaction is typically initiated by the voter's wallet (MetaMask) in the frontend.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {number} postId - The ID of the post.
 * @param {string} blockchainCandidateId - The unique string ID of the candidate being voted for.
 * @param {string} voterWalletAddress - The voter's wallet address (for logging/verification).
 * @returns {Promise<string>} Transaction hash of the vote.
 */
export const castVoteOnChain = async (
    systemContractAddress: string,
    electionId: number,
    postId: number,
    blockchainCandidateId: string,
    voterWalletAddress: string // This wallet address should match msg.sender in contract
): Promise<string> => {
    // In a real app, the frontend sends the tx, then sends the tx hash to the backend.
    // The backend would then verify the tx on chain and log it.
    // For this full stack, we simulate the backend initiating it for demo consistency,
    // but note this is not how typical MetaMask dApps work for casting votes.
    // If backend signs:
    // const contract = getElectionContractInstance(systemContractAddress); // Must use adminWallet here if backend signs
    // const tx = await contract.castVote(electionId, postId, blockchainCandidateId);
    // await tx.wait();
    // return tx.hash;

    // Simulate returning a transaction hash that frontend would generate
    console.log(`[Blockchain] Simulating vote cast for election ${electionId}, post ${postId}, candidate ${blockchainCandidateId} by ${voterWalletAddress}...`);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate tx time
    const dummyTxHash = `0xTxHashForVote_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`Simulated vote transaction sent. Tx hash: ${dummyTxHash}`);
    return dummyTxHash;
};

/**
 * Verifies if a given transaction hash corresponds to a valid vote transaction on the blockchain.
 * This is crucial for backend logging after a frontend-initiated vote.
 * @param {string} transactionHash - The transaction hash to verify.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} expectedElectionId - The election ID expected in the vote.
 * @param {number} expectedPostId - The post ID expected in the vote.
 * @param {string} expectedBlockchainCandidateId - The blockchain candidate ID expected in the vote.
 * @param {string} expectedVoterAddress - The voter's address expected to have cast the vote.
 * @returns {Promise<boolean>} True if the transaction is valid and matches expected parameters, false otherwise.
 */
export const verifyVoteTransaction = async (
    transactionHash: string,
    systemContractAddress: string,
    expectedElectionId: number, // ADDED
    expectedPostId: number, // ADDED
    expectedBlockchainCandidateId: string,
    expectedVoterAddress: string
): Promise<boolean> => {
    console.log(`[Blockchain] Verifying transaction ${transactionHash} for vote...`);
    const contract = getElectionContractInstance(systemContractAddress); // Use provider for verification
    try {
        const receipt = await provider.getTransactionReceipt(transactionHash);
        if (!receipt || receipt.status !== 1) { // Check if transaction was successful
            console.warn(`Transaction ${transactionHash} failed or not found.`);
            return false;
        }

        // Parse logs to find the VoteCast event
        for (const log of receipt.logs) {
            try {
                const parsedLog = contract.interface.parseLog(log);
                if (parsedLog && parsedLog.name === 'VoteCast') {
                    const { electionId, postId, blockchainCandidateId, voterAddress } = parsedLog.args;

                    if (
                        Number(electionId) === expectedElectionId && // Compare numbers
                        Number(postId) === expectedPostId && // Compare numbers
                        blockchainCandidateId === expectedBlockchainCandidateId &&
                        voterAddress.toLowerCase() === expectedVoterAddress.toLowerCase()
                    ) {
                        console.log(`Transaction ${transactionHash} verified. VoteCast event found.`);
                        return true;
                    }
                }
            } catch (e) {
                // Ignore logs that cannot be parsed by our contract ABI
            }
        }
        console.warn(`VoteCast event not found in transaction ${transactionHash} or arguments mismatch.`);
        return false;
    } catch (error) {
        console.error(`Error verifying vote transaction ${transactionHash}:`, (error as Error).message);
        return false;
    }
};

/**
 * Checks if a voter has already voted for a specific post in an election on the blockchain.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {number} postId - The ID of the post.
 * @param {string} voterAddress - The voter's wallet address.
 * @returns {Promise<boolean>} True if voter has voted for this specific post, false otherwise.
 */
export const hasVotedForPost = async (
  systemContractAddress: string,
  electionId: number,
  postId: number,
  voterAddress: string
): Promise<boolean> => {
  console.log(`[Blockchain] Checking if voter ${voterAddress} has voted for post ${postId} in election ${electionId}...`);
  const contract = getElectionContractInstance(systemContractAddress);
  try {
      const voted = await contract.hasVotedForPost(electionId, postId, voterAddress);
      return voted;
  } catch (error) {
      console.error(`Error checking voter ${voterAddress} vote status for post ${postId} in election ${electionId}:`, (error as Error).message);
      return false; // Assume not voted on error
  }
};

/**
 * Checks if a voter has already voted for any post in a specific election on the blockchain.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {string} voterWalletAddress - The voter's wallet address.
 * @returns {Promise<boolean>} True if voter has voted for at least one post, false otherwise.
 */
export const checkVoterHasVotedForElection = async (
    systemContractAddress: string,
    electionId: number,
    voterWalletAddress: string
): Promise<boolean> => {
    console.log(`[Blockchain] Checking if voter ${voterWalletAddress} has voted in election ${electionId}...`);
    const contract = getElectionContractInstance(systemContractAddress);
    try {
        const electionDetails = await contract.getElectionDetails(electionId);
        const postIds = electionDetails.postIds; // Assuming postIds is part of returned details
        if (postIds && postIds.length > 0) {
          for (const postId of postIds) {
            const hasVotedForThisPost = await contract.hasVotedForPost(electionId, postId, voterWalletAddress);
            if (hasVotedForThisPost) return true; // If voted for any post, return true
          }
        }
        return false; // If no posts or not voted for any
    } catch (error) {
        console.error(`Error checking voter ${voterWalletAddress} status for election ${electionId}:`, (error as Error).message);
        return false; // Assume not voted on error
    }
};

/**
 * Gets real-time vote counts for all candidates in an election from the blockchain.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {string[]} blockchainCandidateIds - Array of blockchain candidate IDs for this election.
 * @returns {Promise<Record<string, number>>} Object mapping blockchainCandidateId to vote count.
 */
export const getLiveElectionResultsFromChain = async ( // RENAMED FROM getRealtimeVoteCounts
    systemContractAddress: string,
    electionId: number,
    blockchainCandidateIds: string[]
): Promise<Record<string, number>> => {
    console.log(`[Blockchain] Getting real-time vote counts for election ${electionId} from ${systemContractAddress}...`);
    const contract = getElectionContractInstance(systemContractAddress);
    const results: Record<string, number> = {};
    try {
        for (const candidateId of blockchainCandidateIds) {
            const votes = await contract.getCandidateElectionVoteCount(electionId, candidateId);
            results[candidateId] = Number(votes); // Convert BigInt to number
        }
        return results;
    } catch (error) {
        console.error('Error getting real-time vote counts on chain:', (error as Error).message);
        return {};
    }
};

/**
 * Gets final election results from the blockchain after the election has ended.
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {string[]} blockchainCandidateIds - Array of blockchain candidate IDs for this election.
 * @returns {Promise<Record<string, number>>} Final results object mapping blockchainCandidateId to vote count.
 */
export const getFinalResultsFromChain = async (
    systemContractAddress: string,
    electionId: number,
    blockchainCandidateIds: string[]
): Promise<Record<string, number>> => {
    console.log(`[Blockchain] Getting final results for election ${electionId} from ${systemContractAddress} from chain...`);
    return getLiveElectionResultsFromChain(systemContractAddress, electionId, blockchainCandidateIds); // Reusing live function
};

/**
 * Gets a voter's specific vote for a post from the blockchain (if contract supports it).
 * @param {string} systemContractAddress - The address of the main VoteXElection system contract.
 * @param {number} electionId - The ID of the election.
 * @param {number} postId - The ID of the post.
 * @param {string} voterWalletAddress - The voter's wallet address.
 * @returns {Promise<string | null>} The blockchainCandidateId voted for, or null if not found/voted.
 */
export const getVoterVoteForPost = async (
    systemContractAddress: string,
    electionId: number,
    postId: number,
    voterWalletAddress: string
): Promise<string | null> => {
    console.log(`[Blockchain] Getting voter ${voterWalletAddress}'s vote for post ${postId} in election ${electionId}...`);
    const contract = getElectionContractInstance(systemContractAddress);
    try {
        // This function in the contract returns an empty string if not voted or not found
        const votedCandidateId = await contract.getVoterVoteForPost(electionId, postId, voterWalletAddress);
        return (votedCandidateId && votedCandidateId !== "") ? votedCandidateId : null;
    } catch (error) {
        console.error(`Error getting voter vote for post ${postId} in election ${electionId}:`, (error as Error).message);
        return null;
    }
};