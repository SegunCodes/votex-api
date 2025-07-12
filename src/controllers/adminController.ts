import { Request, Response } from "express";
import * as mysqlService from "../services/mysqlService";
import * as blockchainService from "../services/blockchainService";
import * as cloudinaryService from "../services/cloudinaryService";
import {
  Election,
  Post,
  Candidate,
  Voter,
  PartyMember,
} from "../types/index.d";
import { RowDataPacket } from "mysql2";

export const createElection = async (req: Request, res: Response) => {
  try {
    const { title, description, startDate, endDate } = req.body;

    if (!title || !description || !startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "Missing required election fields." });
    }

    const newElection: Omit<
      Election,
      | "id"
      | "created_at"
      | "updated_at"
      | "status"
      | "results"
      | "winning_candidate_id"
    > = {
      title,
      description,
      start_date: new Date(startDate),
      end_date: new Date(endDate),
    };

    const electionId = await mysqlService.createElection(newElection);
    const createdElection = await mysqlService.getElectionById(electionId);

    res.status(201).json({
      message: "Election created successfully.",
      election: createdElection,
    });
  } catch (error) {
    console.error("Error creating election:", error);
    res
      .status(500)
      .json({
        error: `Failed to create election: ${(error as Error).message}`,
      });
  }
};

export const getAllElections = async (req: Request, res: Response) => {
  try {
    const elections = await mysqlService.getAllElections();
    res.status(200).json({
      message: "All elections retrieved.",
      elections: elections,
    });
  } catch (error) {
    console.error("Error getting all elections:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve elections: ${(error as Error).message}`,
      });
  }
};

export const updateElectionStatus = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { status, results, winningCandidateId } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required." });
    }
    if (!["pending", "active", "ended"].includes(status)) {
      return res.status(400).json({ error: "Invalid election status." });
    }

    const election = await mysqlService.getElectionById(parseInt(electionId));
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }

    const updates: Partial<Election> = { status };
    if (status === "ended") {
      updates.results = JSON.stringify(results); // Store results as JSON string
      updates.winning_candidate_id = winningCandidateId;
    }

    const success = await mysqlService.updateElection(
      parseInt(electionId),
      updates
    );

    if (success) {
      res
        .status(200)
        .json({
          message: `Election ${electionId} status updated to ${status}.`,
          election: { ...election, ...updates },
        });
    } else {
      res.status(400).json({ error: "Failed to update election status." });
    }
  } catch (error) {
    console.error("Error updating election status:", error);
    res
      .status(500)
      .json({
        error: `Failed to update election status: ${(error as Error).message}`,
      });
  }
};

export const startElection = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const id = parseInt(electionId);

    const election = await mysqlService.getElectionById(id);
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }
    if (election.status !== "pending") {
      return res
        .status(400)
        .json({
          error: `Election is already ${election.status}. Cannot start.`,
        });
    }

    // --- REAL BLOCKCHAIN LOGIC (Future) ---
    // Deploy smart contract for this election or call a method on a main contract
    // const contractAddress = await blockchainService.deployElectionContract(electionId, election.candidates); // Example
    // await mysqlService.updateElection(id, { blockchain_contract_address: contractAddress });
    // await blockchainService.startElectionOnChain(contractAddress); // Call smart contract to officially open voting

    await mysqlService.updateElection(id, { status: "active" });

    res.status(200).json({
      message: `Election ${electionId} has been started. Voting is now active.`,
    });
  } catch (error) {
    console.error("Error starting election:", error);
    res
      .status(500)
      .json({ error: `Failed to start election: ${(error as Error).message}` });
  }
};

export const endElection = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const id = parseInt(electionId);

    const election = await mysqlService.getElectionById(id);
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }
    if (election.status !== "active") {
      return res
        .status(400)
        .json({
          error: `Election is not active. Current status: ${election.status}.`,
        });
    }

    // --- REAL BLOCKCHAIN LOGIC (Future) ---
    // Call smart contract function to close voting and trigger tallying.
    // const blockchainResults = await blockchainService.endElectionOnChain(election.blockchain_contract_address || electionId);
    // const results = blockchainResults; // Use actual results from chain

    // Simulate results for now
    const dummyResults = {
      candidate_1: 120,
      candidate_2: 90,
      winner: "candidate_1_name",
    };
    const winningCandidateId = 1; // Placeholder

    await mysqlService.updateElection(id, {
      status: "ended",
      results: JSON.stringify(dummyResults),
      winning_candidate_id: winningCandidateId,
    });

    res.status(200).json({
      message: `Election ${electionId} has ended and results finalized.`,
      results: dummyResults,
    });
  } catch (error) {
    console.error("Error ending election:", error);
    res
      .status(500)
      .json({ error: `Failed to end election: ${(error as Error).message}` });
  }
};

export const auditElection = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const id = parseInt(electionId);

    const election = await mysqlService.getElectionById(id);
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }

    // --- REAL BLOCKCHAIN LOGIC (Future) ---
    // Fetch raw vote data or hashes from the blockchain for verification
    const auditReport = await blockchainService.performAudit(
      election.blockchain_contract_address || electionId.toString()
    );

    res.status(200).json({
      message: `Audit report for election ${electionId} generated from blockchain data.`,
      report: auditReport,
      electionMetadata: election,
    });
  } catch (error) {
    console.error("Error auditing election:", error);
    res
      .status(500)
      .json({ error: `Failed to audit election: ${(error as Error).message}` });
  }
};

// --- Post Management ---
export const createPost = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;
    const { name, maxVotesPerVoter } = req.body;
    const election_id = parseInt(electionId);

    if (!name || !election_id) {
      return res
        .status(400)
        .json({ error: "Post name and election ID are required." });
    }

    const election = await mysqlService.getElectionById(election_id);
    if (!election) {
      return res.status(404).json({ error: "Election not found." });
    }

    const newPost: Omit<Post, "id" | "created_at" | "updated_at"> = {
      election_id,
      name,
      max_votes_per_voter: maxVotesPerVoter || 1,
    };

    const postId = await mysqlService.createPost(newPost);
    const createdPost = await mysqlService.getPostById(postId);

    res.status(201).json({
      message: "Election post created successfully.",
      post: createdPost,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res
      .status(500)
      .json({ error: `Failed to create post: ${(error as Error).message}` });
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
    console.error("Error getting election posts:", error);
    res
      .status(500)
      .json({ error: `Failed to retrieve posts: ${(error as Error).message}` });
  }
};

// --- Candidate Management ---
export const addCandidateToPost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { partyMemberId, blockchainCandidateId } = req.body; // partyMemberId is from party_members table

    if (!partyMemberId) {
      return res.status(400).json({ error: "Party member ID is required." });
    }

    const post = await mysqlService.getPostById(parseInt(postId));
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const partyMember = await mysqlService.getPartyMemberById(partyMemberId);
    if (!partyMember) {
      return res.status(404).json({ error: "Party member not found." });
    }

    const newCandidate: Omit<
      Candidate,
      "id" | "created_at" | "updated_at" | "vote_count"
    > = {
      post_id: parseInt(postId),
      election_id: post.election_id,
      party_member_id: partyMemberId,
      blockchain_candidate_id:
        blockchainCandidateId || `candidate_${partyMemberId}_${Date.now()}`, // Unique ID for blockchain
    };

    const candidateId = await mysqlService.createCandidate(newCandidate);
    const createdCandidate = await mysqlService.getCandidateById(candidateId);

    // --- REAL BLOCKCHAIN LOGIC (Future) ---
    // If needed, register this candidate on the smart contract for this election/post
    // await blockchainService.registerCandidateOnChain(post.election_id, postId, blockchainCandidateId);

    res.status(201).json({
      message: "Candidate added to post successfully.",
      candidate: createdCandidate,
    });
  } catch (error) {
    console.error("Error adding candidate to post:", error);
    res
      .status(500)
      .json({ error: `Failed to add candidate: ${(error as Error).message}` });
  }
};

export const getPostCandidates = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const candidates = await mysqlService.getCandidatesByPostId(
      parseInt(postId)
    );

    // For each candidate, fetch party member details and party name
    const detailedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const partyMember = await mysqlService.getPartyMemberById(
          candidate.party_member_id
        );
        let partyName = "N/A";
        if (partyMember && partyMember.party_id) {
          const party = await mysqlService.getPartyById(partyMember.party_id);
          partyName = party ? party.name : "N/A";
        }

        return {
          ...candidate,
          party_member_name: partyMember?.name,
          party_member_email: partyMember?.email,
          image_url: partyMember?.image_url,
          party_name: partyName,
        };
      })
    );

    res.status(200).json({
      message: `Candidates for post ${postId} retrieved.`,
      candidates: detailedCandidates,
    });
  } catch (error) {
    console.error("Error getting post candidates:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve candidates: ${(error as Error).message}`,
      });
  }
};

// --- Voter Management (Admin Side) ---
export const registerVoterByAdmin = async (req: Request, res: Response) => {
  try {
    const { email, name, age, gender, nationalIdNumber } = req.body;

    if (!email || !name || !age || !gender) {
      return res
        .status(400)
        .json({
          error: "Missing required voter fields (email, name, age, gender).",
        });
    }
    if (!["Male", "Female", "Other"].includes(gender)) {
      return res
        .status(400)
        .json({ error: "Invalid gender. Must be Male, Female, or Other." });
    }
    if (typeof age !== "number" || age < 18) {
      return res
        .status(400)
        .json({ error: "Age must be a number and 18 or older." });
    }

    // Check if voter already exists by email
    const existingVoter = await mysqlService.getVoterByEmail(email);
    if (existingVoter) {
      return res
        .status(409)
        .json({ error: "Voter with this email already registered." });
    }

    const newVoter: Omit<
      Voter,
      | "id"
      | "created_at"
      | "updated_at"
      | "registration_status"
      | "is_eligible_on_chain"
      | "wallet_address"
      | "auth_nonce"
    > = {
      email,
      name,
      age,
      gender,
      national_id_number: nationalIdNumber || null,
    };

    const voterId = await mysqlService.createVoter(newVoter);
    const createdVoter = await mysqlService.getVoterByEmail(email); // Fetch full voter record

    // --- REAL BLOCKCHAIN LOGIC (Future) ---
    // Here, admin would generate voting credentials on blockchain for this voter
    // This might involve whitelisting a future wallet address or generating a unique token.
    // For now, the wallet linking happens during voter's first web3 login.
    // The `is_eligible_on_chain` status will be updated when the voter links their wallet and is whitelisted.

    res.status(201).json({
      message:
        "Voter registered by admin successfully. Voter will need to link their wallet.",
      voter: createdVoter,
    });
  } catch (error) {
    console.error("Error registering voter by admin:", error);
    res
      .status(500)
      .json({ error: `Failed to register voter: ${(error as Error).message}` });
  }
};

export const getAllVoters = async (req: Request, res: Response) => {
  try {
    const voters = await mysqlService.getAllVoters();
    res.status(200).json({
      message: "All registered voters retrieved.",
      voters: voters,
    });
  } catch (error) {
    console.error("Error getting all voters:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve voters: ${(error as Error).message}`,
      });
  }
};

// --- Party and Party Member Management ---
export const getAllParties = async (req: Request, res: Response) => {
  try {
    const parties = await mysqlService.getAllParties();
    res.status(200).json({
      message: "All parties retrieved.",
      parties: parties,
    });
  } catch (error) {
    console.error("Error getting all parties:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve parties: ${(error as Error).message}`,
      });
  }
};

export const getPartyMembers = async (req: Request, res: Response) => {
  try {
    const { partyId } = req.params;
    const members = await mysqlService.getPartyMembersByPartyId(
      parseInt(partyId)
    );
    res.status(200).json({
      message: `Party members for party ${partyId} retrieved.`,
      members: members,
    });
  } catch (error) {
    console.error("Error getting party members:", error);
    res
      .status(500)
      .json({
        error: `Failed to retrieve party members: ${(error as Error).message}`,
      });
  }
};

// --- Cloudinary Integration (Example for Image Upload) ---
// This would typically be a separate endpoint for uploading files
// and then the URL is stored in the database.
// For simplicity, we'll assume the frontend sends a base64 string or a direct upload URL.
// A more robust solution would use multer for file uploads on the backend.
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body; // Expecting base64 encoded image

    if (!imageBase64) {
      return res.status(400).json({ error: "No image data provided." });
    }

    const result = await cloudinaryService.uploadImage(imageBase64);
    res.status(200).json({
      message: "Image uploaded successfully to Cloudinary.",
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error("Error uploading image to Cloudinary:", error);
    res
      .status(500)
      .json({ error: `Failed to upload image: ${(error as Error).message}` });
  }
};
