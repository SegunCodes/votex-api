
import dotenv from 'dotenv';
dotenv.config();

import app from './src/app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`VoteX Backend server running on port ${PORT}`);
  console.log(`Access backend API at: http://localhost:${PORT}/api`);
});