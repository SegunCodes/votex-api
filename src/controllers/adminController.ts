import { Request, Response } from 'express';
import * as mysqlService from '../services/mysqlService';
import * as blockchainService from '../services/blockchainService';
import * as cloudinaryService from '../services/cloudinaryService';
import { Election, Post, Candidate, Voter, PartyMember } from '../types/index.d';
import { ethers } from 'ethers'; // For address validation

// --- Election Management ---
export const createElection = async (req: Request, res: Response) => {
  try {
    const { title, description, startDate, endDate } = req.body;

    if (!title || !description || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required election fields.' });
    }

    const newElection: Omit<Election, 'id' | 'created_at' | 'updated_at' | 'status' | 'results' | 'winning_candidate_id' | 'blockchain_contract_address'> = {
      title,
      description,
      start_date: new Date(startDate),
      end_date: new Date(endDate),
    };

    // First, create in MySQL to get an ID
    const electionId = await mysqlService.createElection(newElection);
    const createdElection = await mysqlService.getElectionById(electionId);

    // Then, create on blockchain
    const systemContractAddress = process.env.ELECTION_SYSTEM_CONTRACT_ADDRESS;
    if (!systemContractAddress) {
      throw new Error('ELECTION_SYSTEM_CONTRACT_ADDRESS is not set in environment variables.');
    }

    const txHash = await blockchainService.createElectionOnChain(
      systemContractAddress,
      electionId,
      title,
      description,
      Math.floor(new Date(startDate).getTime() / 1000), // Convert to Unix timestamp
      Math.floor(new Date(endDate).getTime() / 1000)    // Convert to Unix timestamp
    );

    // Update MySQL with blockchain contract address (if it's a per-election contract)
    // In our case, we have one system contract, so we just confirm on-chain creation
    // and update the MySQL record with the transaction hash if desired.
    // For now, no need to update contract address in MySQL for this specific design.

    res.status(201).json({
      message: 'Election created successfully in MySQL and on blockchain.',
      election: createdElection,
      blockchainTxHash: txHash,
    });
  } catch (error) {
    console.error('Error creating election:', error);
    res.status(500).json({ error: `Failed to create election: ${(error as Error).message}` });
  }
};

export const getAllElections = async (req: Request, res: Response) => {
  try {
    const elections = await mysqlService.getAllElections();
    res.status(200).json({
      message: 'All elections retrieved.',
      elections: elections,
    });
  } catch (error) {
    console.error('Error getting all elections:', error);
    res.status(500).json({ error: `Failed to retrieve elections: ${(error as Error).message}` });
  }
};

export const updateElectionStatus = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { status, results, winningCandidateId } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }
    if (!['pending', 'active', 'ended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid election status.' });
    }

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }

    const updates: Partial<Election> = { status };
    if (status === 'ended') {
      updates.results = JSON.stringify(results); // Store results as JSON string
      updates.winning_candidate_id = winningCandidateId;
    }

    const success = await mysqlService.updateElection(parseInt(electionId), updates);

    if (success) {
      res.status(200).json({ message: `Election ${electionId} status updated to ${status}.`, election: { ...election, ...updates } });
    } else {
      res.status(400).json({ error: 'Failed to update election status.' });
    }
  } catch (error) {
    console.error('Error updating election status:', error);
    res.status(500).json({ error: `Failed to update election status: ${(error as Error).message}` });
  }
};


export const startElection = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const id = parseInt(electionId);

    const election = await mysqlService.getElectionById(id);
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (election.status !== 'pending') {
      return res.status(400).json({ error: `Election is already ${election.status}. Cannot start.` });
    }

    const systemContractAddress = process.env.ELECTION_SYSTEM_CONTRACT_ADDRESS;
    if (!systemContractAddress) {
      throw new Error('ELECTION_SYSTEM_CONTRACT_ADDRESS is not set in environment variables.');
    }

    // Call smart contract to officially open voting
    const txHash = await blockchainService.startElectionOnChain(systemContractAddress, id);

    await mysqlService.updateElection(id, { status: 'active' });

    res.status(200).json({
      message: `Election ${electionId} has been started. Voting is now active.`,
      blockchainTxHash: txHash,
    });
  } catch (error) {
    console.error('Error starting election:', error);
    res.status(500).json({ error: `Failed to start election: ${(error as Error).message}` });
  }
};

export const endElection = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const id = parseInt(electionId);

    const election = await mysqlService.getElectionById(id);
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (election.status !== 'active') {
      return res.status(400).json({ error: `Election is not active. Current status: ${election.status}.` });
    }

    const systemContractAddress = process.env.ELECTION_SYSTEM_CONTRACT_ADDRESS;
    if (!systemContractAddress) {
      throw new Error('ELECTION_SYSTEM_CONTRACT_ADDRESS is not set in environment variables.');
    }

    // Call smart contract function to close voting and trigger tallying.
    const txHash = await blockchainService.endElectionOnChain(systemContractAddress, id);

    // Fetch final results from smart contract
    const candidates = await mysqlService.getCandidatesByElectionId(id);
    const blockchainCandidateIds = candidates.map(c => c.blockchain_candidate_id!).filter(Boolean) as string[];

    const finalBlockchainResults = await blockchainService.getFinalResultsFromChain(
      systemContractAddress,
      id,
      blockchainCandidateIds
    );

    // Determine winner (simple example)
    let winningCandidateId: number | undefined;
    let maxVotes = -1;
    let winnerBlockchainId: string | undefined;

    for (const bcId of blockchainCandidateIds) {
        if (finalBlockchainResults[bcId] > maxVotes) {
            maxVotes = finalBlockchainResults[bcId];
            winnerBlockchainId = bcId;
        }
    }

    if (winnerBlockchainId) {
        const winnerCandidate = candidates.find(c => c.blockchain_candidate_id === winnerBlockchainId);
        if (winnerCandidate) {
            winningCandidateId = winnerCandidate.id;
        }
    }

    await mysqlService.updateElection(id, {
      status: 'ended',
      results: JSON.stringify(finalBlockchainResults),
      winning_candidate_id: winningCandidateId,
    });

    res.status(200).json({
      message: `Election ${electionId} has ended and results finalized.`,
      results: finalBlockchainResults,
      blockchainTxHash: txHash,
    });
  } catch (error) {
    console.error('Error ending election:', error);
    res.status(500).json({ error: `Failed to end election: ${(error as Error).message}` });
  }
};

export const auditElection = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const id = parseInt(electionId);

    const election = await mysqlService.getElectionById(id);
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (!election.blockchain_contract_address) {
      return res.status(400).json({ error: 'Election has no deployed smart contract address for auditing.' });
    }

    const auditReport = await blockchainService.performAudit(
      election.blockchain_contract_address,
      id // Pass election ID to audit function
    );

    res.status(200).json({
      message: `Audit report for election ${electionId} generated from blockchain data.`,
      report: auditReport,
      electionMetadata: election,
    });
  } catch (error) {
    console.error('Error auditing election:', error);
    res.status(500).json({ error: `Failed to audit election: ${(error as Error).message}` });
  }
};

// --- Post Management ---
export const createPost = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { name, maxVotesPerVoter } = req.body;
    const election_id = parseInt(electionId);

    if (!name || !election_id) {
      return res.status(400).json({ error: 'Post name and election ID are required.' });
    }

    const election = await mysqlService.getElectionById(election_id);
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (!election.blockchain_contract_address) {
      return res.status(400).json({ error: 'Election has no deployed smart contract address.' });
    }

    const newPost: Omit<Post, 'id' | 'created_at' | 'updated_at'> = {
      election_id,
      name,
      max_votes_per_voter: maxVotesPerVoter || 1,
    };

    // First, create in MySQL
    const postId = await mysqlService.createPost(newPost);
    const createdPost = await mysqlService.getPostById(postId);

    // Then, create on blockchain
    const txHash = await blockchainService.createPostOnChain(
      election.blockchain_contract_address,
      election_id,
      postId,
      name,
      maxVotesPerVoter || 1
    );

    res.status(201).json({
      message: 'Election post created successfully in MySQL and on blockchain.',
      post: createdPost,
      blockchainTxHash: txHash,
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: `Failed to create post: ${(error as Error).message}` });
  }
};

export const getElectionPosts = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const posts = await mysqlService.getPostsByElectionId(parseInt(electionId));
    res.status(200).json({
      message: `Posts for election ${electionId} retrieved.`,
      posts: posts,
    });
  } catch (error) {
    console.error('Error getting election posts:', error);
    res.status(500).json({ error: `Failed to retrieve posts: ${(error as Error).message}` });
  }
};

// --- Candidate Management ---
export const addCandidateToPost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { partyMemberId, blockchainCandidateId } = req.body; // partyMemberId is from party_members table

    if (!partyMemberId) {
      return res.status(400).json({ error: 'Party member ID is required.' });
    }

    const post = await mysqlService.getPostById(parseInt(postId));
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    const election = await mysqlService.getElectionById(post.election_id);
    if (!election || !election.blockchain_contract_address) {
      return res.status(400).json({ error: 'Associated election not found or has no deployed smart contract.' });
    }

    const partyMember = await mysqlService.getPartyMemberById(partyMemberId);
    if (!partyMember) {
      return res.status(404).json({ error: 'Party member not found.' });
    }

    const newCandidate: Omit<Candidate, 'id' | 'created_at' | 'updated_at' | 'vote_count'> = {
      post_id: parseInt(postId),
      election_id: post.election_id,
      party_member_id: partyMemberId,
      blockchain_candidate_id: blockchainCandidateId || `candidate_${post.election_id}_${postId}_${partyMemberId}`, // Unique ID for blockchain
    };

    // First, create in MySQL
    const candidateId = await mysqlService.createCandidate(newCandidate);
    const createdCandidate = await mysqlService.getCandidateById(candidateId);

    // Then, register on blockchain
    const txHash = await blockchainService.registerCandidateOnChain(
      election.blockchain_contract_address,
      election.id!,
      post.id!,
      newCandidate.blockchain_candidate_id!,
      partyMember.name // Use party member's name as candidate name on chain
    );


    res.status(201).json({
      message: 'Candidate added to post successfully in MySQL and on blockchain.',
      candidate: createdCandidate,
      blockchainTxHash: txHash,
    });
  } catch (error) {
    console.error('Error adding candidate to post:', error);
    res.status(500).json({ error: `Failed to add candidate: ${(error as Error).message}` });
  }
};

export const getPostCandidates = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const candidates = await mysqlService.getCandidatesByPostId(parseInt(postId));

    const detailedCandidates = await Promise.all(candidates.map(async (candidate) => {
      const partyMember = await mysqlService.getPartyMemberById(candidate.party_member_id);
      let partyName = 'N/A';
      if (partyMember && partyMember.party_id) {
        const party = await mysqlService.getPartyById(partyMember.party_id);
        partyName = party ? party.name : 'N/A';
      }

      return {
        ...candidate,
        party_member_name: partyMember?.name,
        party_member_email: partyMember?.email,
        image_url: partyMember?.image_url,
        party_name: partyName,
      };
    }));

    res.status(200).json({
      message: `Candidates for post ${postId} retrieved.`,
      candidates: detailedCandidates,
    });
  } catch (error) {
    console.error('Error getting post candidates:', error);
    res.status(500).json({ error: `Failed to retrieve candidates: ${(error as Error).message}` });
  }
};


// --- Voter Management (Admin Side) ---
export const registerVoterByAdmin = async (req: Request, res: Response) => {
  try {
    const { email, name, age, gender, nationalIdNumber } = req.body;

    if (!email || !name || !age || !gender) {
      return res.status(400).json({ error: 'Missing required voter fields (email, name, age, gender).' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender. Must be Male, Female, or Other.' });
    }
    if (typeof age !== 'number' || age < 18) {
      return res.status(400).json({ error: 'Age must be a number and 18 or older.' });
    }

    const existingVoter = await mysqlService.getVoterByEmail(email);
    if (existingVoter) {
      return res.status(409).json({ error: 'Voter with this email already registered.' });
    }

    const newVoter: Omit<Voter, 'id' | 'created_at' | 'updated_at' | 'registration_status' | 'is_eligible_on_chain' | 'wallet_address' | 'auth_nonce'> = {
      email,
      name,
      age,
      gender,
      national_id_number: nationalIdNumber || null,
    };

    const voterId = await mysqlService.createVoter(newVoter);
    const createdVoter = await mysqlService.getVoterByEmail(email);

    res.status(201).json({
      message: 'Voter registered by admin successfully. Voter will need to link their wallet during first login.',
      voter: createdVoter,
    });
  } catch (error) {
    console.error('Error registering voter by admin:', error);
    res.status(500).json({ error: `Failed to register voter: ${(error as Error).message}` });
  }
};

export const getAllVoters = async (req: Request, res: Response) => {
  try {
    const voters = await mysqlService.getAllVoters(); // Now exists in mysqlService
    res.status(200).json({
      message: 'All registered voters retrieved.',
      voters: voters,
    });
  } catch (error) {
    console.error('Error getting all voters:', error);
    res.status(500).json({ error: `Failed to retrieve voters: ${(error as Error).message}` });
  }
};

export const whitelistVoter = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { voterWalletAddress } = req.body;

    if (!voterWalletAddress) {
      return res.status(400).json({ error: 'Voter wallet address is required.' });
    }
    if (!ethers.isAddress(voterWalletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address format.' });
    }

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (!election.blockchain_contract_address) {
      return res.status(400).json({ error: 'Election has no deployed smart contract address.' });
    }

    // Update voter's off-chain profile to link wallet address
    const voter = await mysqlService.getVoterByEmail(req.body.email || ''); // Assuming email is also sent for lookup
    if (voter) {
      await mysqlService.updateVoter(voter.id!, { wallet_address: voterWalletAddress.toLowerCase(), registration_status: 'eligible_on_chain' });
    } else {
        // If voter not found by email, create a basic record or error
        console.warn(`Voter with email ${req.body.email} not found for wallet linking during whitelisting.`);
    }


    // Whitelist voter on the smart contract
    const txHash = await blockchainService.whitelistVoterOnChain(
      election.blockchain_contract_address,
      parseInt(electionId), // Pass electionId to contract
      voterWalletAddress
    );

    res.status(200).json({
      message: `Voter ${voterWalletAddress} whitelisted for election ${electionId} on blockchain.`,
      transactionHash: txHash,
    });
  } catch (error) {
    console.error('Error whitelisting voter:', error);
    res.status(500).json({ error: `Failed to whitelist voter: ${(error as Error).message}` });
  }
};

// --- Party and Party Member Management ---
export const getAllParties = async (req: Request, res: Response) => {
  try {
    const parties = await mysqlService.getAllParties();
    res.status(200).json({
      message: 'All parties retrieved.',
      parties: parties,
    });
  } catch (error) {
    console.error('Error getting all parties:', error);
    res.status(500).json({ error: `Failed to retrieve parties: ${(error as Error).message}` });
  }
};

export const getPartyMembers = async (req: Request, res: Response) => {
  try {
    const { partyId } = req.params;
    const members = await mysqlService.getPartyMembersByPartyId(parseInt(partyId));
    res.status(200).json({
      message: `Party members for party ${partyId} retrieved.`,
      members: members,
    });
  } catch (error) {
    console.error('Error getting party members:', error);
    res.status(500).json({ error: `Failed to retrieve party members: ${(error as Error).message}` });
  }
};

// --- Cloudinary Integration (Example for Image Upload) ---
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    const result = await cloudinaryService.uploadImage(imageBase64);
    res.status(200).json({
      message: 'Image uploaded successfully to Cloudinary.',
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    res.status(500).json({ error: `Failed to upload image: ${(error as Error).message}` });
  }
};