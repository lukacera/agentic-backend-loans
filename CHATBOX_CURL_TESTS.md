# Chatbox API Testing with cURL

Test the Claude AI-powered chatbox agent using these curl commands.

## Prerequisites

Make sure your server is running:
```bash
npm run dev
```

Default server URL: `http://localhost:3000`

---

## 1. Create a Chat Session

First, create a new chat session to get a `sessionId`:

```bash
curl -X POST http://localhost:3000/api/chat/sessions \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123-def456-ghi789",
    "createdAt": "2025-12-21T08:00:00.000Z"
  }
}
```

**Save the `sessionId` for subsequent requests!**

---

## 2. Test Basic Conversation

Send a greeting message:

```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hi, I need help applying for a business loan"
  }'
```

**Replace `{SESSION_ID}` with your actual session ID.**

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "message": "Hello! I'm Jessica, Torvely's AI loan specialist assistant. I'd be happy to help you with your SBA loan application. To get started, could you tell me your name?",
    "userData": {}
  }
}
```

---

## 3. Test Data Capture - Name

Provide your name (triggers `captureUserName` tool):

```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My name is John Smith"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "message": "Great to meet you, John! Are you looking to get a loan for an existing business you own, or are you buying a business?",
    "toolResults": [
      {
        "name": "captureUserName",
        "success": true,
        "message": "Captured user name: John Smith"
      }
    ],
    "userData": {
      "name": "John Smith"
    }
  }
}
```

---

## 4. Test User Type Capture

Specify if you're a business owner or buyer:

```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I own an existing business"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "message": "Perfect! Let me gather some information about your business. When was your business founded?",
    "toolResults": [
      {
        "name": "captureUserTypeNewApplication",
        "success": true,
        "message": "Captured user type: owner"
      }
    ],
    "userData": {
      "name": "John Smith",
      "userType": "owner"
    }
  }
}
```

---

## 5. Test Financial Data Capture

Provide business financials:

**Year Founded:**
```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My business was founded in 2018"
  }'
```

**Monthly Revenue:**
```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "We make about $50,000 per month"
  }'
```

**Credit Score:**
```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My credit score is 720"
  }'
```

---

## 6. Test Multiple Data Points

Send a message with multiple pieces of information:

```bash
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My business is called Acme Corp, phone number is 555-1234, and I need $100,000 for equipment"
  }'
```

**Expected:** Claude should capture business name, phone, loan amount, and loan purpose all at once.

---

## 7. Get Session Details

Retrieve the full session with captured data:

```bash
curl -X GET http://localhost:3000/api/chat/sessions/{SESSION_ID} \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123-def456-ghi789",
    "messages": [
      {
        "role": "user",
        "content": "Hi, I need help applying for a business loan",
        "timestamp": "2025-12-21T08:00:00.000Z"
      },
      {
        "role": "assistant",
        "content": "Hello! I'm Jessica...",
        "timestamp": "2025-12-21T08:00:01.000Z"
      }
      // ... more messages
    ],
    "userData": {
      "name": "John Smith",
      "userType": "owner",
      "businessName": "Acme Corp",
      "businessPhoneNumber": "555-1234",
      "yearFounded": 2018,
      "monthlyRevenue": 50000,
      "creditScore": 720,
      "requestedLoanAmount": 100000,
      "loanPurpose": "equipment"
    },
    "createdAt": "2025-12-21T08:00:00.000Z",
    "updatedAt": "2025-12-21T08:05:00.000Z"
  }
}
```

---

## 8. Get Just the User Data

Get only the captured user data:

```bash
curl -X GET http://localhost:3000/api/chat/sessions/{SESSION_ID}/userData \
  -H "Content-Type: application/json"
```

---

## 9. Get Message History

Get all messages in the conversation:

```bash
curl -X GET http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json"
```

---

## 10. Delete Session

Clean up when done:

```bash
curl -X DELETE http://localhost:3000/api/chat/sessions/{SESSION_ID} \
  -H "Content-Type: application/json"
```

---

## Complete Test Flow Script

Here's a complete bash script to test the entire flow:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "=== Creating Chat Session ==="
SESSION_RESPONSE=$(curl -s -X POST $BASE_URL/api/chat/sessions -H "Content-Type: application/json")
SESSION_ID=$(echo $SESSION_RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)
echo "Session ID: $SESSION_ID"
echo ""

if [ -z "$SESSION_ID" ]; then
    echo "Failed to create session"
    exit 1
fi

echo "=== Test 1: Greeting ==="
curl -s -X POST $BASE_URL/api/chat/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi, I need help with a business loan"}' | jq '.'
echo ""

sleep 2

echo "=== Test 2: Name Capture ==="
curl -s -X POST $BASE_URL/api/chat/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "My name is John Smith"}' | jq '.'
echo ""

sleep 2

echo "=== Test 3: User Type ==="
curl -s -X POST $BASE_URL/api/chat/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "I own an existing business"}' | jq '.'
echo ""

sleep 2

echo "=== Test 4: Year Founded ==="
curl -s -X POST $BASE_URL/api/chat/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "It was founded in 2018"}' | jq '.'
echo ""

sleep 2

echo "=== Test 5: Multiple Data Points ==="
curl -s -X POST $BASE_URL/api/chat/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "My business is called Acme Corp, monthly revenue is $50k, expenses are $30k, and I need $100,000 for new equipment"}' | jq '.'
echo ""

sleep 2

echo "=== Test 6: Credit Score ==="
curl -s -X POST $BASE_URL/api/chat/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "My credit score is 720"}' | jq '.'
echo ""

sleep 2

echo "=== Fetching Session Data ==="
curl -s -X GET $BASE_URL/api/chat/sessions/$SESSION_ID | jq '.'
echo ""

echo "=== Fetching User Data Only ==="
curl -s -X GET $BASE_URL/api/chat/sessions/$SESSION_ID/userData | jq '.'
echo ""

echo "=== Session ID: $SESSION_ID ==="
echo "Use this command to delete: curl -X DELETE $BASE_URL/api/chat/sessions/$SESSION_ID"
```

Save as `test_chatbox.sh`, make executable with `chmod +x test_chatbox.sh`, and run with `./test_chatbox.sh`

---

## Testing Claude AI Features

### Test Natural Language Understanding

Claude should understand various ways of expressing information:

```bash
# Informal language
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Yeah so like my credit is around 700ish"}'

# Formal language
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "I would like to inform you that my annual revenue is approximately $600,000"}'

# Conversational corrections
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Actually, I meant the business name is Smith Corp, not Acme"}'
```

### Test Complex Scenarios

```bash
# Business buyer flow
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "I want to buy a bakery for $400,000. I have $80,000 cash and the business makes about $300k a year"}'

# Multiple questions
curl -X POST http://localhost:3000/api/chat/sessions/{SESSION_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the requirements? How long does approval take? What interest rates should I expect?"}'
```

---

## Troubleshooting

### Error: "Session not found"
Make sure you're using the correct `sessionId` from the create session response.

### Error: "Message is required"
Ensure the request body includes a `message` field with a non-empty string.

### No tool calls triggered
Claude might not detect data in casual conversation. Try being more explicit:
- "My name is..." (explicit)
- vs "I'm..." (might work but less reliable)

### Rate limiting
Add `sleep` commands between requests if testing rapidly.

---

## Monitoring

Watch server logs for Claude AI responses and tool executions:
```bash
npm run dev
```

Look for these log patterns:
- `✅ Chatbox agent initialized successfully`
- `📋 Captured user name:...`
- `❌ Chatbox processing error:...` (if errors occur)

---

## Expected Tool Calls

The chatbox agent can trigger these tools:
- `captureUserName` - User's full name
- `captureBusinessName` - Business name
- `capturePhoneNumber` / `captureBusinessPhone` - Phone numbers
- `captureCreditScore` - Credit score (300-850)
- `captureYearFounded` - Year business started
- `captureUSCitizen` - US citizenship (boolean)
- `captureAnnualRevenue` - Annual revenue
- `captureMonthlyRevenue` - Monthly revenue
- `captureMonthlyExpenses` - Monthly expenses
- `captureRequestedLoanAmount` - Loan amount requested
- `captureLoanPurpose` - Purpose of loan
- `capturePurchasePrice` - Purchase price (for buyers)
- `captureAvailableCash` - Available cash/down payment
- `captureIndustryExperience` - Industry experience
- `captureUserTypeNewApplication` - Owner vs buyer
- `captureCheckboxSelection` - Form checkboxes
- `captureHighlightField` - Highlight form fields
- `captureOpenSBAForm` - Open specific SBA forms

All powered by Claude 3.5 Sonnet! 🚀
