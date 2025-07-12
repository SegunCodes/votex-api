import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken, verifyWalletSignature } from '../services/authService';
import { findUserByEmail, getVoterByEmail, updateVoterAuthNonce, getVoterByWalletAddress, updateVoterStatusAndWallet } from '../services/mysqlService';
import { Voter } from '../types/index.d';
import { v4 as uuidv4 } from 'uuid';

// Message to be signed by the voter's wallet for authentication
export const VOTER_AUTH_MESSAGE_PREFIX = "Authenticate to VoteX: ";

// Admin Login
export const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await findUserByEmail(email);

    if (!user || user.role !== 'admin') {
      return res.status(401).json({ error: 'Invalid credentials or not an admin user.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = generateToken(payload, '1h'); // Token expires in 1 hour

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
  const { email } = req.body; // Voter provides email to identify their profile

  if (!email) {
    return res.status(400).json({ error: 'Email is required to request an authentication message.' });
  }

  try {
    const voter = await getVoterByEmail(email);

    if (!voter) {
      return res.status(404).json({ error: 'Voter profile not found. Please ensure you are registered by an admin.' });
    }

    // Generate a unique nonce for this authentication attempt
    const nonce = uuidv4();
    const messageToSign = `${VOTER_AUTH_MESSAGE_PREFIX}${nonce}`;

    // Store the nonce in the voter's record in the database for verification
    await updateVoterAuthNonce(voter.id!, nonce); // Use voter.id! as it should exist here

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
    const voter = await getVoterByEmail(email);

    if (!voter) {
      return res.status(404).json({ error: 'Voter profile not found.' });
    }

    // Verify the message contains the expected prefix and the stored nonce
    const expectedNonce = voter.auth_nonce;
    if (!expectedNonce || message !== `${VOTER_AUTH_MESSAGE_PREFIX}${expectedNonce}`) {
      return res.status(400).json({ error: 'Invalid or outdated authentication message.' });
    }

    // Verify the wallet signature
    const recoveredAddress = verifyWalletSignature(message, signature);

    if (!recoveredAddress || recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ error: 'Signature verification failed. Invalid signature or wallet address.' });
    }

    // If this is the first time the wallet is linked or if it's a new wallet
    if (!voter.wallet_address || voter.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      // Link the wallet address to the voter profile and update status
      await updateVoterStatusAndWallet(voter.id!, walletAddress.toLowerCase(), 'wallet_linked', null); // Clear nonce after use
      console.log(`Voter ${voter.email} wallet linked: ${walletAddress}`);
    } else {
      // Wallet was already linked, just clear the nonce
      await updateVoterAuthNonce(voter.id!, null); // Clear nonce after successful auth
    }

    // Generate a JWT for the voter
    const payload = {
      id: voter.id,
      email: voter.email,
      walletAddress: walletAddress.toLowerCase(),
      role: 'voter',
    };
    const token = generateToken(payload, '12h'); // Token expires in 12 hours

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