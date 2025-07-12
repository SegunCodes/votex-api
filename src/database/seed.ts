import pool from '../config/database';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';

async function seedDatabase() {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL for seeding.');

    // --- 1. Execute Schema SQL ---
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    const schemaStatements = schemaSql.split(';').filter(s => s.trim() !== '');

    console.log('Executing schema.sql...');
    for (const statement of schemaStatements) {
      await connection.query(statement);
    }
    console.log('Schema created successfully.');

    // --- 2. Seed Initial Data ---

    // Hash admin password
    const adminPassword = process.env.ADMIN_PASSWORD || 'adminpassword123';
    const passwordHash = await bcrypt.hash(adminPassword, 10); // Salt rounds: 10

    // Seed Users (Admin)
    const [userResult] = await connection.execute(
      `INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role);`,
      [process.env.ADMIN_EMAIL || 'admin@votex.com', passwordHash, 'admin']
    );
    console.log('Admin user seeded/updated.');

    // Seed Parties
    const [partyResult] = await connection.execute(
      `INSERT INTO parties (name, logo_url, description) VALUES
       ('Progressive Party', 'https://example.com/logo_pp.png', 'Focused on national development.'),
       ('Unity Alliance', 'https://example.com/logo_ua.png', 'Bringing people together.'),
       ('Democratic Front', 'https://example.com/logo_df.png', 'Advocating for citizen rights.')
       ON DUPLICATE KEY UPDATE name = VALUES(name);`
    );
    console.log('Parties seeded.');

    // Seed Party Members
    // Get party IDs first
    const [parties] = await connection.execute('SELECT id, name FROM parties;');
    const partyMap = (parties as any[]).reduce((acc, party) => {
      acc[party.name] = party.id;
      return acc;
    }, {});

    const [memberResult] = await connection.execute(
      `INSERT INTO party_members (party_id, name, email, image_url) VALUES
       (?, ?, ?, ?),
       (?, ?, ?, ?),
       (?, ?, ?, ?),
       (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), party_id = VALUES(party_id);`,
      [
        partyMap['Progressive Party'], 'Alice Johnson', 'alice.j@example.com', 'https://res.cloudinary.com/your_cloud_name/image/upload/v1/profile_alice.jpg',
        partyMap['Unity Alliance'], 'Bob Williams', 'bob.w@example.com', 'https://res.cloudinary.com/your_cloud_name/image/upload/v1/profile_bob.jpg',
        partyMap['Democratic Front'], 'Carol Davis', 'carol.d@example.com', 'https://res.cloudinary.com/your_cloud_name/image/upload/v1/profile_carol.jpg',
        partyMap['Progressive Party'], 'David Green', 'david.g@example.com', 'https://res.cloudinary.com/your_cloud_name/image/upload/v1/profile_david.jpg'
      ]
    );
    console.log('Party members seeded.');

    // Seed some initial Voters (admin registered)
    const [voterResult] = await connection.execute(
      `INSERT INTO voters (email, name, age, gender, registration_status) VALUES
       (?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name);`,
      [
        'voter1@example.com', 'Voter One', 30, 'Male', 'pending_email_verification',
        'voter2@example.com', 'Voter Two', 25, 'Female', 'pending_email_verification',
        'voter3@example.com', 'Voter Three', 40, 'Male', 'pending_email_verification'
      ]
    );
    console.log('Initial voters seeded.');


    console.log('Database seeding completed successfully!');

  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Ensure the script only runs when executed directly
if (require.main === module) {
  seedDatabase();
}