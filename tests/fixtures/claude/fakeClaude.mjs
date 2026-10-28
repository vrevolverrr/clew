#!/usr/bin/env node
// Stands in for `claude auth status`, which prints JSON and exits 1 when logged out (Claude Code 2.1.302).
const loggedIn = process.env.FAKE_CLAUDE_LOGGED_IN === '1';
if (process.argv[2] === 'auth' && process.argv[3] === 'status') {
  process.stdout.write(`${JSON.stringify({ loggedIn, authMethod: loggedIn ? 'claude.ai' : 'none', apiProvider: 'firstParty' }, null, 2)}\n`);
  process.exit(loggedIn ? 0 : 1);
}
process.exit(2);
