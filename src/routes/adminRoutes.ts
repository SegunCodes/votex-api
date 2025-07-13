import { Router, Request, Response, NextFunction } from "express";
import { adminLogin } from "../controllers/authController";
import * as adminController from "../controllers/adminController";
import { verifyToken } from "../services/authService";
import { DecodedToken } from "../types/index.d";

const router = Router();

const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authentication token required. Format: Bearer [token]" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }

  if (decoded.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Access denied. Admin role required." });
  }

  req.user = decoded;
  next();
};

router.post("/login", adminLogin);

router.use(authenticateAdmin);

// Election Management
router.post("/elections", adminController.createElection);
router.get("/elections", adminController.getAllElections);
router.put(
  "/elections/:electionId/status",
  adminController.updateElectionStatus
);
router.post("/elections/:electionId/start", adminController.startElection);
router.post("/elections/:electionId/end", adminController.endElection);
router.get("/elections/:electionId/audit", adminController.auditElection);
router.post('/elections/:electionId/whitelist-voter', adminController.whitelistVoter);

// Post Management within an Election
router.post("/elections/:electionId/posts", adminController.createPost);
router.get("/elections/:electionId/posts", adminController.getElectionPosts);

// Candidate Management
router.post("/posts/:postId/candidates", adminController.addCandidateToPost);
router.get("/posts/:postId/candidates", adminController.getPostCandidates);

// Voter Management (Admin's role in registering voters)
router.post("/voters", adminController.registerVoterByAdmin);
router.get("/voters", adminController.getAllVoters);

// Party and Party Member Management
router.get("/parties", adminController.getAllParties);
router.get("/parties/:partyId/members", adminController.getPartyMembers);

export default router;
