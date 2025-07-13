import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken, verifyWalletSignature } from '../services/authService';
import { findUserByEmail, getVoterByEmail, updateVoterAuthNonce, updateVoterStatusAndWallet } from '../services/mysqlService';
import { Voter, User } from '../types/index.d'; // Import User type
import { v4 as uuidv4 } from 'uuid'; // For generating unique nonces

// Message to be signed by the voter's wallet for authentication
export const VOTER_AUTH_MESSAGE_PREFIX = "Authenticate to VoteX: ";

// Admin Login
export const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user: User | null = await findUserByEmail(email); // Use User type

    if (!user || user.role !== 'admin') {
      return res.status(401).json({ error: 'Invalid credentials or not an admin user.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const payload = {
      id: user.id!, // Use non-null assertion as user exists
      email: user.email,
      role: user.role,
    };

    const token = generateToken(payload, '1h');

    res.status(200).json({
      message: 'Admin login successful!',
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ error: 'Failed to authenticate admin.' });
  }
};

// Voter Request Auth Message (Step 1 of Web3 Login)
export const requestVoterAuthMessage = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required to request an authentication message.' });
  }

  try {
    const voter: Voter | null = await getVoterByEmail(email); // Use Voter type

    if (!voter) {
      return res.status(404).json({ error: 'Voter profile not found. Please ensure you are registered by an admin.' });
    }

    const nonce = uuidv4();
    const messageToSign = `${VOTER_AUTH_MESSAGE_PREFIX}${nonce}`;

    await updateVoterAuthNonce(voter.id!, nonce); // Store the nonce

    res.status(200).json({
      message: 'Please sign this message with your linked wallet to authenticate.',
      messageToSign: messageToSign,
      voterEmail: email,
    });
  } catch (error) {
    console.error('Error requesting voter auth message:', error);
    res.status(500).json({ error: 'Failed to prepare authentication message.' });
  }
};


// Voter Authenticate (Step 2 of Web3 Login)
export const voterAuthenticate = async (req: Request, res: Response) => {
  const { message, signature, walletAddress, email } = req.body;

  if (!message || !signature || !walletAddress || !email) {
    return res.status(400).json({ error: 'Message, signature, wallet address, and email are required.' });
  }

  try {
    const voter: Voter | null = await getVoterByEmail(email);

    if (!voter) {
      return res.status(404).json({ error: 'Voter profile not found.' });
    }

    const expectedNonce = voter.auth_nonce;
    if (!expectedNonce || message !== `${VOTER_AUTH_MESSAGE_PREFIX}${expectedNonce}`) {
      return res.status(400).json({ error: 'Invalid or outdated authentication message.' });
    }

    const recoveredAddress = verifyWalletSignature(message, signature);

    if (!recoveredAddress || recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ error: 'Signature verification failed. Invalid signature or wallet address.' });
    }

    // If wallet address is not yet linked or different, update it
    if (!voter.wallet_address || voter.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      await updateVoterStatusAndWallet(voter.id!, walletAddress.toLowerCase(), 'wallet_linked', null); // Link wallet, clear nonce
      console.log(`Voter ${voter.email} wallet linked: ${walletAddress}`);
    } else {
      await updateVoterAuthNonce(voter.id!, null); // Clear nonce after successful auth
    }

    const payload = {
      id: voter.id!,
      email: voter.email,
      walletAddress: walletAddress.toLowerCase(),
      name: voter.name,
      role: 'voter',
    };
    const token = generateToken(payload, '12h');

    res.status(200).json({
      message: 'Voter authentication successful!',
      token,
      user: {
        id: voter.id,
        email: voter.email,
        walletAddress: walletAddress.toLowerCase(),
        name: voter.name,
        role: 'voter',
      },
    });
  } catch (error) {
    console.error('Error during voter authentication:', error);
    res.status(500).json({ error: `Failed to authenticate voter: ${(error as Error).message}` });
  }
};