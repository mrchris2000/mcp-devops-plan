#!/usr/bin/env node

// Configuration setup script for MCP DevOps Plan
import { readFileSync, writeFileSync } from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('MCP DevOps Plan Configuration Setup');
  console.log('====================================\n');
  
  const token = await question('Enter your Plan access token: ');
  const serverUrl = await question('Enter your Plan server URL (e.g., https://your-server.com/plan): ');
  const teamspaceId = await question('Enter your teamspace ID: ');
  
  const envContent = `# MCP DevOps Plan Configuration
PLAN_ACCESS_TOKEN=${token}
PLAN_SERVER_URL=${serverUrl}
PLAN_TEAMSPACE_ID=${teamspaceId}
`;

  try {
    writeFileSync('.env', envContent);
    console.log('Configuration saved to .env file');
    console.log('You can now run the MCP server with: node src/lib/server.js');
  } catch (error) {
    console.error('Error saving configuration:', error.message);
  }
  
  rl.close();
}

setup().catch(console.error);
