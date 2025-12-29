# Migration from OpenAI to Claude AI

## Summary

This migration replaces OpenAI with Anthropic's Claude AI for all backend LLM processing operations. The Vapi voice assistant continues to use OpenAI as required by Vapi's platform.

## What Changed

### 1. Core Agent Infrastructure
- **BaseAgent.ts**: Changed from `ChatOpenAI` to `ChatAnthropic`
  - Model now defaults to `claude-3-5-sonnet-20241022`
  - API key changed from `OPENAI_API_KEY` to `ANTHROPIC_API_KEY`

### 2. Chat Agent
- **ChatboxAgent.ts**: Migrated to use `ChatAnthropic`
  - Function calling now uses Claude's function calling capabilities
  - All 23+ tool definitions remain compatible

### 3. Main Application
- **main.ts**: Transcript extraction now uses Claude
  - Changed `ChatOpenAI` to `ChatAnthropic` for `createLLM()` function
  - Model configurable via `ANTHROPIC_MODEL` env variable

### 4. Documentation
- **CLAUDE.md**: Updated all references to reflect Claude AI usage
- Added clarification about Vapi still using OpenAI

### 5. Dependencies
- **package.json**: Added `@langchain/anthropic@^1.3.2`
- Kept `@langchain/openai` for Vapi compatibility

## What Stayed the Same

### Vapi Voice Assistant
- **Vapi assistant creation** (`POST /api/create-vapi-assistant`) still uses OpenAI
- Reason: Vapi's platform requires OpenAI models
- The `gpt-5-mini` model configuration in Vapi remains unchanged

### API Structure
- All endpoints remain unchanged
- Tool definitions and function calling structure is the same
- WebSocket events are identical
- Response formats are unchanged

## Setup Instructions

### 1. Install Dependencies
Already done during migration:
```bash
npm install @langchain/anthropic --legacy-peer-deps
```

### 2. Environment Variables
Add to your `.env` file:
```bash
# Claude AI API Key (used by backend agents for LLM processing)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # Optional, this is the default

# OpenAI API Key (kept for Vapi voice assistant compatibility)
OPENAI_API_KEY=your_openai_key_here
```

### 3. Get Anthropic API Key
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Add it to your `.env` file as `ANTHROPIC_API_KEY`

### 4. Start the Server
```bash
npm run dev  # Development
# or
npm run build && npm start  # Production
```

## Benefits of Migration

### 1. Cost Efficiency
- Claude models often provide better value for complex reasoning tasks
- Competitive pricing compared to OpenAI

### 2. Performance
- Claude 3.5 Sonnet offers excellent performance for document processing
- Strong function calling capabilities for structured data extraction

### 3. Context Windows
- Larger context windows for processing long documents
- Better handling of complex loan application data

### 4. Safety & Alignment
- Strong constitutional AI principles
- Excellent at following instructions and constraints

## Testing Checklist

Before deploying to production, verify:

- [ ] Chat sessions work correctly (`POST /api/chat/sessions/:id/messages`)
- [ ] Email agent composes and replies properly
- [ ] Document processing agents extract data correctly
- [ ] Transcript extraction works in Vapi webhook handler
- [ ] All tool calls execute successfully
- [ ] WebSocket events broadcast correctly
- [ ] Draft application PDF generation works
- [ ] Eligibility calculations complete successfully

## Rollback Instructions

If you need to rollback to OpenAI:

1. **Revert BaseAgent.ts**:
   ```typescript
   import { ChatOpenAI } from '@langchain/openai';
   // Change ChatAnthropic back to ChatOpenAI
   // Change anthropicApiKey back to openAIApiKey
   // Change modelName back to 'gpt-3.5-turbo' or 'gpt-4'
   ```

2. **Revert ChatboxAgent.ts and main.ts**: Same changes as above

3. **Update .env**: Use `OPENAI_API_KEY` and `OPENAI_MODEL`

4. **Restart server**: `npm run dev`

## Support

For issues or questions:
1. Check the `CLAUDE.md` documentation
2. Review error logs for API key or configuration issues
3. Verify API key permissions in Anthropic Console
4. Ensure environment variables are loaded correctly

## Notes

- Both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` must be present in `.env`
- OpenAI key is required for Vapi voice assistant functionality
- Anthropic key is required for all backend LLM processing
- Model selection can be changed via `ANTHROPIC_MODEL` env variable
- Default model is `claude-3-5-sonnet-20241022` (recommended)
