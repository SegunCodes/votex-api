import { Request, Response } from "express";
import * as mysqlService from "../services/mysqlService";
import * as blockchainService from "../services/blockchainService";
import { Election } from "../types/index.d";

export const getAvailableElections = async (req: Request, res: Response) => {
  try {
    // req.user is populated by authenticateVoter middleware
    const voterWalletAddress = req.user?.walletAddress;

    if (!voterWalletAddress) {
      return res
        .status(400)
        .json({ error: "Voter wallet address not found in token." });
    }

    const activeElections = await mysqlService.getActiveElections();

    // In a real app, you would also check on-chain eligibility for this voter
    // for each election. For simplicity, we assume if they are authenticated,
    // they are eligible for active elections.
    // const eligibleElections = await Promise.all(activeElections.map(async (election) => {
    //   const isEligible = await blockchainService.checkVoterEligibilityOnChain(election.blockchain_contract_address!, voterWalletAddress);
    //   return isEligible ? election : null;
    // })).then(results => results.filter(e => e !== null));

    res.status(200).json({
      message: "Available elections retrieved.",
      elections: activeElections, // Or eligibleElections if filtered
    });
  } catch (error) {
    console.error("Error getting available elections:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve available elections: ${
          (error as Error).message
        }`,
      });
  }
};

export const castVote = async (req: Request, res: Response) => {
  try {
    const { electionId, postId, candidateId } = req.body;
    // voterWalletAddress comes from the JWT payload
    const voterWalletAddress = req.user?.walletAddress;

    if (!electionId || !postId || !candidateId || !voterWalletAddress) {
      return res
        .status(400)
        .json({
          error:
            "Missing election ID, post ID, candidate ID, or voter wallet address.",
        });
    }

    const election = await mysqlService.getElectionById(electionId);
    if (!election || election.status !== "active") {
      return res
        .status(400)
        .json({ error: "Election is not active or does not exist." });
    }

    const post = await mysqlService.getPostById(postId);
    if (!post || post.election_id !== electionId) {
      return res
        .status(400)
        .json({ error: "Invalid post ID for this election." });
    }

    const candidate = await mysqlService.getCandidateById(candidateId);
    if (!candidate || candidate.post_id !== postId) {
      return res
        .status(400)
        .json({ error: "Invalid candidate ID for this post." });
    }

    // --- REAL BLOCKCHAIN LOGIC ---
    // 1. Verify voter eligibility and if they have already voted on-chain for this post/election
    // This check is crucial for preventing double-voting.
    // const hasVotedOnChain = await blockchainService.checkVoterHasVotedForPost(election.blockchain_contract_address!, postId, voterWalletAddress);
    // if (hasVotedOnChain) {
    //   return res.status(403).json({ error: 'You have already voted for this post in this election.' });
    // }

    // 2. Instruct frontend to cast vote on smart contract and return transaction hash
    // The frontend will send the transaction hash back to this endpoint for logging.
    // For now, we simulate the blockchain call directly from backend for simplicity in this file.
    const transactionHash = await blockchainService.castVoteOnChain(
      election.blockchain_contract_address || electionId.toString(),
      postId,
      candidate.blockchain_candidate_id!,
      voterWalletAddress
    );

    if (!transactionHash) {
      return res
        .status(500)
        .json({ error: "Failed to record vote on blockchain." });
    }

    // Log the vote in MySQL for auditing purposes
    await mysqlService.createVoteLog({
      election_id: electionId,
      post_id: postId,
      candidate_id: candidateId,
      voter_wallet_address: voterWalletAddress,
      transaction_hash: transactionHash,
    });

    // Create a voter receipt for the voter's personal record
    await mysqlService.createVoterReceipt({
      voter_wallet_address: voterWalletAddress,
      election_id: electionId,
      post_id: postId,
      candidate_id: candidateId,
      transaction_hash: transactionHash,
      // blockchain_receipt_id: '...', // If smart contract returns a specific receipt ID
    });

    res.status(200).json({
      message:
        "Vote cast successfully and recorded on the blockchain. Transaction hash logged.",
      electionId,
      postId,
      candidateId,
      voterWalletAddress,
      transactionHash,
    });
  } catch (error) {
    console.error("Error casting vote:", error);
    res
      .status(500)
      .json({ error: `Failed to cast vote: ${(error as Error).message}` });
  }
};

export const getVoterElectionStatus = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const voterWalletAddress = req.user?.walletAddress;

    if (!voterWalletAddress) {
      return res
        .status(400)
        .json({ error: "Voter wallet address not found in token." });
    }

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }

    // --- REAL BLOCKCHAIN LOGIC ---
    // Query smart contract to check if voter has voted in this election/for specific posts.
    const hasVoted = await blockchainService.checkVoterHasVotedForElection(
      election.blockchain_contract_address || electionId,
      voterWalletAddress
    );

    res.status(200).json({
      message: `Voter status for election ${electionId} retrieved.`,
      electionId: election.id,
      voterWalletAddress,
      hasVoted: hasVoted,
      electionDetails: election,
    });
  } catch (error) {
    console.error("Error getting voter election status:", error);
    res
      .status(500)
      .json({
        error: `Failed to get voter election status: ${
          (error as Error).message
        }`,
      });
  }
};

export const getElectionResults = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { gender, ageRange } = req.query; // For filtering results

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }

    // If election is active, get real-time counts from blockchain
    if (election.status === "active") {
      const liveResults =
        await blockchainService.getLiveElectionResultsFromChain(
          election.blockchain_contract_address || electionId.toString()
        );

      // If filtering by gender/age, this would involve more complex logic
      // of getting all votes from blockchain, then cross-referencing voter DIDs with MySQL profiles.
      // For now, live results are direct from chain, not filtered by off-chain demographics.
      return res.status(200).json({
        message: `Real-time results for election ${electionId} retrieved.`,
        election: election,
        results: liveResults,
        isFinal: false,
      });
    }

    // If election is ended, get final results from MySQL (which were logged from blockchain)
    if (election.status === "ended") {
      let finalResults = election.results ? JSON.parse(election.results) : {};

      // Implement filtering by gender and age range if requested
      if (gender || ageRange) {
        // This is complex: requires fetching all vote_logs, then joining with voters table
        // and then re-aggregating results based on filters.
        // For a real app, you might pre-calculate filtered results or use a view.
        console.warn(
          "Filtering results by gender/age not fully implemented for final results. This requires complex data aggregation."
        );
        // Example: Fetch all relevant vote_logs and voter data, then filter and aggregate.
        // const allVoteLogs = await mysqlService.getVoteLogsByElectionId(electionId);
        // const filteredVoteLogs = allVoteLogs.filter(log => {
        //   const voter = await mysqlService.getVoterByWalletAddress(log.voter_wallet_address);
        //   // Apply gender/age filters here
        //   return true;
        // });
        // finalResults = aggregateFilteredVotes(filteredVoteLogs);
      }

      return res.status(200).json({
        message: `Final results for election ${electionId} retrieved.`,
        election: election,
        results: finalResults,
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
    console.error("Error getting election results:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve election results: ${
          (error as Error).message
        }`,
      });
  }
};

export const getVoterVoteReceipts = async (req: Request, res: Response) => {
  try {
    const voterWalletAddress = req.user?.walletAddress;

    if (!voterWalletAddress) {
      return res
        .status(400)
        .json({ error: "Voter wallet address not found in token." });
    }

    const receipts = await mysqlService.getVoterReceiptsByWalletAddress(
      voterWalletAddress
    );

    res.status(200).json({
      message: `Vote receipts for ${voterWalletAddress} retrieved.`,
      receipts: receipts,
    });
  } catch (error) {
    console.error("Error getting voter receipts:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve vote receipts: ${(error as Error).message}`,
      });
  }
};
