import pool from "../config/database";
import {
  User,
  Party,
  PartyMember,
  Voter,
  Election,
  Post,
  Candidate,
  VoteLog,
  VoterReceipt,
} from "../types/index.d";
import { RowDataPacket, OkPacket, ResultSetHeader } from "mysql2/promise";

// Helper type for query results
type QueryResult = [RowDataPacket[] | OkPacket | ResultSetHeader, any];

// --- User (Admin) Operations ---
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM users WHERE email = ?",
    [email]
  );
  return (rows as User[])[0] || null;
};

// --- Party Operations ---
export const getAllParties = async (): Promise<Party[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM parties");
  return rows as Party[];
};

export const getPartyById = async (id: number): Promise<Party | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM parties WHERE id = ?",
    [id]
  );
  return (rows as Party[])[0] || null;
};

// --- Party Member Operations ---
export const getAllPartyMembers = async (): Promise<PartyMember[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM party_members"
  );
  return rows as PartyMember[];
};

export const getPartyMembersByPartyId = async (
  partyId: number
): Promise<PartyMember[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM party_members WHERE party_id = ?",
    [partyId]
  );
  return rows as PartyMember[];
};

export const getPartyMemberById = async (
  id: number
): Promise<PartyMember | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM party_members WHERE id = ?",
    [id]
  );
  return (rows as PartyMember[])[0] || null;
};

export const createPartyMember = async (
  member: Omit<PartyMember, "id" | "created_at" | "updated_at">
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO party_members (party_id, name, email, image_url) VALUES (?, ?, ?, ?)",
    [member.party_id, member.name, member.email, member.image_url]
  );
  return result.insertId;
};

// --- Voter Operations ---
export const createVoter = async (
  voter: Omit<
    Voter,
    | "id"
    | "created_at"
    | "updated_at"
    | "registration_status"
    | "is_eligible_on_chain"
  >
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO voters (email, name, age, gender, national_id_number, wallet_address, registration_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      voter.email,
      voter.name,
      voter.age,
      voter.gender,
      voter.national_id_number || null,
      voter.wallet_address || null,
      "pending_email_verification",
    ]
  );
  return result.insertId;
};

export const getVoterByEmail = async (email: string): Promise<Voter | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM voters WHERE email = ?",
    [email]
  );
  return (rows as Voter[])[0] || null;
};

export const getVoterByWalletAddress = async (
  walletAddress: string
): Promise<Voter | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM voters WHERE wallet_address = ?",
    [walletAddress.toLowerCase()]
  );
  return (rows as Voter[])[0] || null;
};

export const updateVoter = async (
  id: number,
  updates: Partial<Voter>
): Promise<boolean> => {
  const fields = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(", ");
  const values = Object.values(updates);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE voters SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...values, id]
  );
  return result.affectedRows > 0;
};

export const updateVoterStatusAndWallet = async (
  voterId: number,
  walletAddress: string,
  status: Voter["registration_status"],
  authNonce: string | null = null
): Promise<boolean> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE voters SET wallet_address = ?, registration_status = ?, auth_nonce = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [walletAddress.toLowerCase(), status, authNonce, voterId]
  );
  return result.affectedRows > 0;
};

export const updateVoterAuthNonce = async (
  voterId: number,
  nonce: string
): Promise<boolean> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE voters SET auth_nonce = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [nonce, voterId]
  );
  return result.affectedRows > 0;
};

// --- Election Operations ---
export const createElection = async (
  election: Omit<
    Election,
    | "id"
    | "created_at"
    | "updated_at"
    | "status"
    | "results"
    | "winning_candidate_id"
  >
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO elections (title, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)",
    [
      election.title,
      election.description,
      election.start_date,
      election.end_date,
      "pending",
    ]
  );
  return result.insertId;
};

export const getElectionById = async (id: number): Promise<Election | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM elections WHERE id = ?",
    [id]
  );
  return (rows as Election[])[0] || null;
};

export const getAllElections = async (): Promise<Election[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM elections");
  return rows as Election[];
};

export const getActiveElections = async (): Promise<Election[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM elections WHERE status = ?",
    ["active"]
  );
  return rows as Election[];
};

export const updateElection = async (
  id: number,
  updates: Partial<Election>
): Promise<boolean> => {
  const fields = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(", ");
  const values = Object.values(updates);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE elections SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...values, id]
  );
  return result.affectedRows > 0;
};

// --- Post Operations (for election positions) ---
export const createPost = async (
  post: Omit<Post, "id" | "created_at" | "updated_at">
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO posts (election_id, name, max_votes_per_voter) VALUES (?, ?, ?)",
    [post.election_id, post.name, post.max_votes_per_voter]
  );
  return result.insertId;
};

export const getPostsByElectionId = async (
  electionId: number
): Promise<Post[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM posts WHERE election_id = ?",
    [electionId]
  );
  return rows as Post[];
};

export const getPostById = async (id: number): Promise<Post | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM posts WHERE id = ?",
    [id]
  );
  return (rows as Post[])[0] || null;
};

// --- Candidate Operations ---
export const createCandidate = async (
  candidate: Omit<Candidate, "id" | "created_at" | "updated_at" | "vote_count">
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO candidates (post_id, election_id, party_member_id, blockchain_candidate_id) VALUES (?, ?, ?, ?)",
    [
      candidate.post_id,
      candidate.election_id,
      candidate.party_member_id,
      candidate.blockchain_candidate_id || null,
    ]
  );
  return result.insertId;
};

export const getCandidatesByPostId = async (
  postId: number
): Promise<Candidate[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM candidates WHERE post_id = ?",
    [postId]
  );
  return rows as Candidate[];
};

export const getCandidateById = async (
  id: number
): Promise<Candidate | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM candidates WHERE id = ?",
    [id]
  );
  return (rows as Candidate[])[0] || null;
};

export const getCandidatesByElectionId = async (
  electionId: number
): Promise<Candidate[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT c.*, pm.name AS party_member_name, pm.email AS party_member_email, pm.image_url, p.name AS party_name
      FROM candidates c
      JOIN party_members pm ON c.party_member_id = pm.id
      JOIN parties p ON pm.party_id = p.id
      WHERE c.election_id = ?
    `,
    [electionId]
  );
  return rows as Candidate[];
};

export const updateCandidateVoteCount = async (
  id: number,
  voteCount: number
): Promise<boolean> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE candidates SET vote_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [voteCount, id]
  );
  return result.affectedRows > 0;
};

// --- Vote Log Operations (for backend auditing) ---
export const createVoteLog = async (
  log: Omit<VoteLog, "id" | "timestamp">
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO vote_logs (election_id, post_id, candidate_id, voter_wallet_address, transaction_hash) VALUES (?, ?, ?, ?, ?)",
    [
      log.election_id,
      log.post_id,
      log.candidate_id,
      log.voter_wallet_address.toLowerCase(),
      log.transaction_hash,
    ]
  );
  return result.insertId;
};

export const getVoteLogByTransactionHash = async (
  transactionHash: string
): Promise<VoteLog | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM vote_logs WHERE transaction_hash = ?",
    [transactionHash]
  );
  return (rows as VoteLog[])[0] || null;
};

// --- Voter Receipts Operations (for voters to verify their own vote) ---
export const createVoterReceipt = async (
  receipt: Omit<VoterReceipt, "id" | "timestamp">
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO voter_receipts (voter_wallet_address, election_id, post_id, candidate_id, transaction_hash, blockchain_receipt_id) VALUES (?, ?, ?, ?, ?, ?)",
    [
      receipt.voter_wallet_address.toLowerCase(),
      receipt.election_id,
      receipt.post_id,
      receipt.candidate_id,
      receipt.transaction_hash,
      receipt.blockchain_receipt_id || null,
    ]
  );
  return result.insertId;
};

export const getVoterReceiptsByWalletAddress = async (
  walletAddress: string
): Promise<VoterReceipt[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM voter_receipts WHERE voter_wallet_address = ?",
    [walletAddress.toLowerCase()]
  );
  return rows as VoterReceipt[];
};
