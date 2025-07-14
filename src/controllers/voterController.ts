import { Request, Response } from 'express';
import * as mysqlService from '../services/mysqlService';
import * as blockchainService from '../services/blockchainService';
import { Election, VoteLog } from '../types/index.d'
import { ethers } from 'ethers'; // For address validation

export const getAvailableElections = async (req: Request, res: Response) => {
  try {
    const voterWalletAddress = req.user?.walletAddress;

    if (!voterWalletAddress) {
      return res.status(400).json({ error: 'Voter wallet address not found in token.' });
    }

    const activeElections = await mysqlService.getActiveElections();

    const systemContractAddress = process.env.ELECTION_SYSTEM_CONTRACT_ADDRESS;
    if (!systemContractAddress) {
      throw new Error('ELECTION_SYSTEM_CONTRACT_ADDRESS is not set in environment variables.');
    }

    // const eligibleElections = await Promise.all(activeElections.map(async (election) => {
    //   const isWhitelistedOnChain = await blockchainService.isVoterGloballyWhitelisted(systemContractAddress, voterWalletAddress);
    //   return isWhitelistedOnChain ? election : null;
    // })).then(results => results.filter(e => e !== null));

    res.status(200).json({
      message: 'Available elections.',
      elections: activeElections,
    });
  } catch (error) {
    console.error('Error getting available elections:', error);
    res.status(500).json({ error: `Failed to retrieve available elections: ${(error as Error).message}` });
  }
};

export const castVote = async (req: Request, res: Response) => {
  try {
    const { electionId, postId, candidateId } = req.body;
    const voterWalletAddress = req.user?.walletAddress;

    if (!electionId || !postId || !candidateId || !voterWalletAddress) {
      return res.status(400).json({ error: 'Missing election ID, post ID, candidate ID, or voter wallet address.' });
    }

    const election = await mysqlService.getElectionById(electionId);
    if (!election || election.status !== 'active') {
      return res.status(400).json({ error: 'Election is not active or does not exist.' });
    }

    const post = await mysqlService.getPostById(postId);
    if (!post || post.election_id !== electionId) {
      return res.status(400).json({ error: 'Invalid post ID for this election.' });
    }

    const candidate = await mysqlService.getCandidateById(candidateId);
    if (!candidate || candidate.post_id !== postId) {
      return res.status(400).json({ error: 'Invalid candidate ID for this post.' });
    }

    const systemContractAddress = process.env.ELECTION_SYSTEM_CONTRACT_ADDRESS;
    if (!systemContractAddress) {
      throw new Error('ELECTION_SYSTEM_CONTRACT_ADDRESS is not set in environment variables.');
    }

    // const isGloballyWhitelisted = await blockchainService.isVoterGloballyWhitelisted(systemContractAddress, voterWalletAddress);
    // if (!isGloballyWhitelisted) {
    //   return res.status(403).json({ error: 'You are not globally whitelisted to vote. Please ensure your wallet is linked.' });
    // }

    // Check double voting against MySQL vote_logs table
    const hasVotedForThisPost = await mysqlService.hasVoterVotedForPostInDB(electionId, postId, voterWalletAddress);
    if (hasVotedForThisPost) {
      return res.status(403).json({ error: 'You have already voted for this post in this election' });
    }

    // Cast vote on the smart contract
    const transactionHash = await blockchainService.castVoteOnChain(
      systemContractAddress,
      electionId,
      postId,
      candidate.blockchain_candidate_id!,
      voterWalletAddress
    );

    if (!transactionHash) {
      return res.status(500).json({ error: 'Failed to record vote on blockchain.' });
    }

    // Verify the transaction on-chain
    const isTxValid = await blockchainService.verifyVoteTransaction(
        transactionHash,
        systemContractAddress,
        electionId,
        postId,
        candidate.blockchain_candidate_id!,
        voterWalletAddress
    );

    if (!isTxValid) {
      console.error(`CRITICAL: Blockchain transaction ${transactionHash} for vote did not verify correctly.`);
    }

    // 4. Log the vote in MySQL for auditing purposes
    await mysqlService.createVoteLog({
      election_id: electionId,
      post_id: postId,
      candidate_id: candidateId,
      voter_wallet_address: voterWalletAddress,
      transaction_hash: transactionHash,
    });

    // 5. Create a voter receipt for the voter's personal record
    await mysqlService.createVoterReceipt({
      voter_wallet_address: voterWalletAddress,
      election_id: electionId,
      post_id: postId,
      candidate_id: candidateId,
      transaction_hash: transactionHash,
    });


    res.status(200).json({
      message: 'Vote cast successfully and recorded on the blockchain. Transaction hash logged.',
      electionId,
      postId,
      candidateId,
      voterWalletAddress,
      transactionHash,
    });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: `Failed to cast vote: ${(error as Error).message}` });
  }
};

export const getElectionDetailsPublic = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    res.status(200).json({
      message: `Election ${electionId} details retrieved.`,
      election: election,
    });
  } catch (error) {
    console.error('Error getting public election details:', error);
    res.status(500).json({ error: `Failed to retrieve election details: ${(error as Error).message}` });
  }
};

export const getElectionPostsPublic = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const posts = await mysqlService.getPostsByElectionId(parseInt(electionId));
    res.status(200).json({
      message: `Posts for election ${electionId} retrieved.`,
      posts: posts,
    });
  } catch (error) {
    console.error('Error getting public election posts:', error);
    res.status(500).json({ error: `Failed to retrieve posts: ${(error as Error).message}` });
  }
};

export const getPostCandidatesPublic = async (req: Request, res: Response) => {
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
    console.error('Error getting public post candidates:', error);
    res.status(500).json({ error: `Failed to retrieve candidates: ${(error as Error).message}` });
  }
};

export const getVoterElectionStatus = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const voterWalletAddress = req.user?.walletAddress;

    if (!voterWalletAddress) {
      return res.status(400).json({ error: 'Voter wallet address not found in token.' });
    }

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (!election.blockchain_contract_address) {
      return res.status(400).json({ error: 'Election has no deployed smart contract address.' });
    }

    // Query smart contract to check if voter has voted in this election.
    const hasVoted = await blockchainService.checkVoterHasVotedForElection(
      election.blockchain_contract_address,
      parseInt(electionId),
      voterWalletAddress
    );

    // Also check if GLOBALLY whitelisted
    // const isGloballyWhitelisted = await blockchainService.isVoterGloballyWhitelisted(
    //   election.blockchain_contract_address,
    //   voterWalletAddress
    // );


    res.status(200).json({
      message: `Voter status for election ${electionId} retrieved.`,
      electionId: election.id,
      voterWalletAddress,
      hasVoted: hasVoted,
      isWhitelisted: true,
      electionDetails: election,
    });
  } catch (error) {
    console.error('Error getting voter election status:', error);
    res.status(500).json({ error: `Failed to get voter election status: ${(error as Error).message}` });
  }
};

export const getElectionResults = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { gender, ageRange } = req.query; // ageRange can be string | string[] | ParsedQs | ParsedQs[]

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: 'Election not found.' });
    }
    if (!election.blockchain_contract_address) {
      return res.status(400).json({ error: 'Election has no deployed smart contract address for results.' });
    }

    // Fetch candidates associated with this election from MySQL
    const candidates = await mysqlService.getCandidatesByElectionId(parseInt(electionId));
    const blockchainCandidateIds = candidates.map(c => c.blockchain_candidate_id!).filter(Boolean) as string[];

    // If election is active, get real-time counts from blockchain
    if (election.status === 'active') {
      const liveResults = await blockchainService.getLiveElectionResultsFromChain(
        election.blockchain_contract_address,
        parseInt(electionId),
        blockchainCandidateIds
      );

      // Map blockchain IDs back to names for display
      const displayResults: Record<string, number> = {};
      for (const candidate of candidates) {
          if (candidate.blockchain_candidate_id && liveResults[candidate.blockchain_candidate_id]) {
              const partyMember = await mysqlService.getPartyMemberById(candidate.party_member_id);
              displayResults[partyMember?.name || candidate.blockchain_candidate_id] = liveResults[candidate.blockchain_candidate_id];
          }
      }

      return res.status(200).json({
        message: `Real-time results for election ${electionId} retrieved.`,
        election: election,
        results: displayResults,
        isFinal: false,
      });
    }

    // If election is ended, get final results from MySQL (which were logged from blockchain)
    if (election.status === 'ended') {
      let finalResults = election.results ? JSON.parse(election.results) : {};

      // Map blockchain IDs back to names for display
      const displayResults: Record<string, number> = {};
      for (const candidate of candidates) {
          if (candidate.blockchain_candidate_id && finalResults[candidate.blockchain_candidate_id]) {
              const partyMember = await mysqlService.getPartyMemberById(candidate.party_member_id);
              displayResults[partyMember?.name || candidate.blockchain_candidate_id] = finalResults[candidate.blockchain_candidate_id];
          }
      }

      // Filtering by gender and age range (requires joining vote_logs with voters table)
      if (gender || ageRange) {
        const allVoteLogs = await mysqlService.getVoteLogsByElectionId(parseInt(electionId));
        let filteredVoteLogs: VoteLog[] = allVoteLogs; // Initialize with the correct type

        // Apply gender filter
        if (typeof gender === 'string' && gender) { // Ensure gender is a string
          const votersPromises = filteredVoteLogs.map(log => mysqlService.getVoterByWalletAddress(log.voter_wallet_address));
          const voters = await Promise.all(votersPromises);

          filteredVoteLogs = filteredVoteLogs.filter((log, index) => {
            const voter = voters[index];
            return voter?.gender === gender;
          });
        }

        // Apply age range filter
        if (typeof ageRange === 'string' && ageRange) { // Ensure ageRange is a string
          const [minAgeStr, maxAgeStr] = ageRange.split('-');
          const minAge = parseInt(minAgeStr);
          const maxAge = parseInt(maxAgeStr);

          if (!isNaN(minAge) && !isNaN(maxAge)) {
            const votersPromises = filteredVoteLogs.map(log => mysqlService.getVoterByWalletAddress(log.voter_wallet_address));
            const voters = await Promise.all(votersPromises);

            filteredVoteLogs = filteredVoteLogs.filter((log, index) => {
              const voter = voters[index];
              return voter && voter.age >= minAge && voter.age <= maxAge;
            });
          }
        }

        // Re-aggregate results based on filtered logs
        const filteredAggregatedResults: Record<string, number> = {};
        for (const log of filteredVoteLogs) {
            const votedCandidate = candidates.find(c => c.id === log.candidate_id);
            if (votedCandidate && votedCandidate.blockchain_candidate_id) {
                const partyMember = await mysqlService.getPartyMemberById(votedCandidate.party_member_id);
                const candidateName = partyMember?.name || votedCandidate.blockchain_candidate_id;
                filteredAggregatedResults[candidateName] = (filteredAggregatedResults[candidateName] || 0) + 1;
            }
        }
        return res.status(200).json({
          message: `Final results for election ${electionId} filtered by ${gender || 'All Genders'} and ${ageRange || 'All Ages'}.`,
          election: election,
          results: filteredAggregatedResults,
          isFinal: true,
          filters: { gender, ageRange }
        });
      }

      return res.status(200).json({
        message: `Final results for election ${electionId} retrieved.`,
        election: election,
        results: displayResults,
        isFinal: true,
      });
    }

    // If election is pending
    return res.status(200).json({
      message: `Election ${electionId} is pending. Results are not available yet.`,
      election: election,
      results: {},
      isFinal: false,
    });

  } catch (error) {
    console.error('Error getting election results:', error);
    res.status(500).json({ error: `Failed to retrieve election results: ${(error as Error).message}` });
  }
};

export const getAllElectionsPublic = async (req: Request, res: Response) => {
  try {
    const elections = await mysqlService.getAllElections();
    res.status(200).json({
      message: 'All elections retrieved for public display.',
      elections: elections,
    });
  } catch (error) {
    console.error('Error getting all public elections:', error);
    res.status(500).json({ error: `Failed to retrieve all elections: ${(error as Error).message}` });
  }
};

export const getVoterVoteReceipts = async (req: Request, res: Response) => {
  try {
    const voterWalletAddress = req.user?.walletAddress;

    if (!voterWalletAddress) {
      return res.status(400).json({ error: 'Voter wallet address not found in token.' });
    }

    const receipts = await mysqlService.getVoterReceiptsByWalletAddress(voterWalletAddress);

    // For each receipt, fetch candidate and election details for better display
    const detailedReceipts = await Promise.all(receipts.map(async (receipt) => {
        const election = await mysqlService.getElectionById(receipt.election_id);
        const post = await mysqlService.getPostById(receipt.post_id);
        const candidate = await mysqlService.getCandidateById(receipt.candidate_id);
        let candidateName = 'Unknown Candidate';
        let electionTitle = 'Unknown Election';
        let postName = 'Unknown Post';

        if (candidate && candidate.party_member_id) {
            const partyMember = await mysqlService.getPartyMemberById(candidate.party_member_id);
            candidateName = partyMember?.name || candidateName;
        }
        if (election) electionTitle = election.title;
        if (post) postName = post.name;

        return {
            ...receipt,
            electionTitle,
            postName,
            candidateName,
            // You can add a link to block explorer here if needed
            blockExplorerUrl: `https://sepolia.etherscan.io/tx/${receipt.transaction_hash}` // Adjust for Hardhat if needed
        };
    }));

    res.status(200).json({
      message: `Vote receipts for ${voterWalletAddress} retrieved.`,
      receipts: detailedReceipts,
    });
  } catch (error) {
    console.error('Error getting voter receipts:', error);
    res.status(500).json({ error: `Failed to retrieve vote receipts: ${(error as Error).message}` });
  }
};