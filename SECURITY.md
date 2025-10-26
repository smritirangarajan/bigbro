# Security & Sensitive Information Management

## Important: Sensitive Information Protection

This project handles sensitive API keys and credentials. **Never commit these to the repository.**

## Files Protected by .gitignore

The following files contain sensitive information and are **automatically ignored by git**:

### Configuration Files
- `config.js` - Chrome extension configuration (API keys)
- `webapp/config.js` - Web app configuration (API keys)
- `.env` - Root environment variables
- `vision/.env` - Vision server environment variables

### All Sensitive Data Includes:
- Claude API keys
- Gemini API keys
- Letta AI credentials
- Vapi AI keys and assistant IDs
- Supabase credentials
- Fish Labs API keys
- ChromaDB configuration

## Setup Instructions

### For Extension:
1. Copy `config_template.js` to `config.js`
2. Fill in your API keys in `config.js`
3. **Never commit `config.js`**

### For Web App:
1. Copy `webapp/config_template.js` to `webapp/config.js`
2. Fill in your API keys
3. **Never commit `webapp/config.js`**

### For Vision Server:
1. Create a `.env` file in the root directory
2. Add your API keys (see environment variables below)

## Required Environment Variables

```bash
# Claude AI
CLAUDE_API_KEY=your-key-here

# Gemini AI
GEMINI_API_KEY=your-key-here

# Fish Labs
FISH_LABS_API_KEY=your-key-here
FISH_LABS_MODEL_ID=your-model-id-here

# Vapi
VAPI_API_KEY=your-key-here
VAPI_PHONE_NUMBER_ID=your-phone-number-id
VAPI_SLACK_OFF_ASSISTANT_ID=your-assistant-id

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ChromaDB
CHROMADB_API_KEY=your-chromadb-key
CHROMADB_TENANT=your-tenant-id
CHROMADB_DATABASE=your-database-name
```

## Verification

To verify that sensitive files are protected, run:
```bash
git check-ignore config.js webapp/config.js .env
```

If all files are listed, they are properly ignored.

## Security Checklist

- [ ] `config.js` exists locally but is NOT in git
- [ ] `webapp/config.js` exists locally but is NOT in git
- [ ] `.env` files are NOT committed
- [ ] Template files (`*_template.js`) are committed (they're safe)
- [ ] No API keys in code comments
- [ ] No API keys in log messages
- [ ] `.gitignore` includes all sensitive files

## What to Do If You Accidentally Commit Sensitive Data

1. **Immediately** revoke the exposed API key
2. Remove the file from git history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch config.js" \
     --prune-empty --tag-name-filter cat -- --all
   ```
3. Force push (WARNING: This rewrites history)
4. Notify team members to re-clone the repository

## Best Practices

1. ✅ Always use `config_template.js` as a base
2. ✅ Keep API keys in environment variables when possible
3. ✅ Use `.env` files for local development
4. ✅ Never share API keys in messages or commits
5. ✅ Rotate keys regularly
6. ❌ Never commit `config.js` or `.env` files
7. ❌ Never share screenshots with visible keys
8. ❌ Never log API keys to console

## Template Files (Safe to Commit)

These files are safe to commit as they contain no real credentials:
- `config_template.js`
- `webapp/config_template.js`
- All `.md` documentation files
- SQL schema files (`*.sql`)
