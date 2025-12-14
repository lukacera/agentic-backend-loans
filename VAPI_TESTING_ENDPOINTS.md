# Vapi AI Testing Endpoints - Postman Collection

This document contains all cURL commands for testing Vapi AI integration with the Torvely backend.

## Table of Contents
- [Owner Data Capture Endpoints](#owner-data-capture-endpoints)
- [Buyer Data Capture Endpoints](#buyer-data-capture-endpoints)
- [Calculate SBA Approval Chances](#calculate-sba-approval-chances)
- [Data Retrieval Endpoints](#data-retrieval-endpoints)

---

## Owner Data Capture Endpoints

All these endpoints simulate Vapi AI sending captured data to your backend. Use the same `callId` to group all data together.

### 1. Capture User Name
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-1",
        "function": {
          "name": "TEST_captureUserName",
          "arguments": "{\"name\": \"John Smith\"}"
        }
      }
    ]
  }
}'
```

### 2. Capture Business Name
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-2",
        "function": {
          "name": "TEST_captureBusinessName",
          "arguments": "{\"businessName\": \"Garcia Auto Repair\"}"
        }
      }
    ]
  }
}'
```

### 3. Capture User Type (Owner)
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-3",
        "function": {
          "name": "TEST_captureUserTypeNewApplication",
          "arguments": "{\"type\": \"owner\"}"
        }
      }
    ]
  }
}'
```

### 4. Capture Year Founded
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-4",
        "function": {
          "name": "TEST_captureYearFounded",
          "arguments": "{\"yearFounded\": 2018}"
        }
      }
    ]
  }
}'
```

### 5. Capture Monthly Revenue
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-5",
        "function": {
          "name": "TEST_captureMonthlyRevenue",
          "arguments": "{\"monthlyRevenue\": 50000}"
        }
      }
    ]
  }
}'
```

### 6. Capture Monthly Expenses
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-6",
        "function": {
          "name": "TEST_captureMonthlyExpenses",
          "arguments": "{\"monthlyExpenses\": 35000}"
        }
      }
    ]
  }
}'
```

### 7. Capture Existing Debt Payment
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-7",
        "function": {
          "name": "TEST_captureExistingDebtPayment",
          "arguments": "{\"existingDebtPayment\": 2000}"
        }
      }
    ]
  }
}'
```

### 8. Capture Requested Loan Amount
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-8",
        "function": {
          "name": "TEST_captureRequestedLoanAmount",
          "arguments": "{\"requestedLoanAmount\": 75000}"
        }
      }
    ]
  }
}'
```

### 9. Capture Loan Purpose
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-9",
        "function": {
          "name": "TEST_captureLoanPurpose",
          "arguments": "{\"loanPurpose\": \"Working capital\"}"
        }
      }
    ]
  }
}'
```

### 10. Capture Credit Score
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-10",
        "function": {
          "name": "TEST_captureCreditScore",
          "arguments": "{\"creditScore\": 680}"
        }
      }
    ]
  }
}'
```

### 11. Capture US Citizen Status
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-11",
        "function": {
          "name": "TEST_captureUSCitizen",
          "arguments": "{\"usCitizen\": true}"
        }
      }
    ]
  }
}'
```

### 12. Capture Business Phone
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCalls": [
      {
        "id": "tool-call-12",
        "function": {
          "name": "TEST_captureBusinessPhone",
          "arguments": "{\"businessPhone\": \"555-1234\"}"
        }
      }
    ]
  }
}'
```

---

## Buyer Data Capture Endpoints

### 1. Capture User Type (Buyer)
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-1",
        "function": {
          "name": "TEST_captureUserTypeNewApplication",
          "arguments": "{\"type\": \"buyer\"}"
        }
      }
    ]
  }
}'
```

### 2. Capture Purchase Price
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-2",
        "function": {
          "name": "TEST_capturePurchasePrice",
          "arguments": "{\"purchasePrice\": 400000}"
        }
      }
    ]
  }
}'
```

### 3. Capture Available Cash
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-3",
        "function": {
          "name": "TEST_captureAvailableCash",
          "arguments": "{\"availableCash\": 60000}"
        }
      }
    ]
  }
}'
```

### 4. Capture Business Cash Flow
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-4",
        "function": {
          "name": "TEST_captureBusinessCashFlow",
          "arguments": "{\"businessCashFlow\": 300000}"
        }
      }
    ]
  }
}'
```

### 5. Capture Industry Experience
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-5",
        "function": {
          "name": "TEST_captureIndustryExperience",
          "arguments": "{\"industryExperience\": \"Yes, 10 years\"}"
        }
      }
    ]
  }
}'
```

### 6. Capture Seller Financing Exists
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-6",
        "function": {
          "name": "TEST_captureIfSellerFinancingOnStandbyExists",
          "arguments": "{\"sellerFinancingOnStandbyExists\": true}"
        }
      }
    ]
  }
}'
```

### 7. Capture Seller Financing Percentage
```bash
curl --location 'http://localhost:3000/vapi-ai' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCalls": [
      {
        "id": "tool-call-7",
        "function": {
          "name": "TEST_captureSellingFinancingPercentage",
          "arguments": "{\"sellerFinancingPercentage\": 10}"
        }
      }
    ]
  }
}'
```

---

## Calculate SBA Approval Chances

### For Owner Application
```bash
curl --location 'http://localhost:3000/api/applications/calculate-chances' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "call": {
      "id": "test-call-owner-123"
    },
    "toolCallList": [
      {
        "id": "chance-calc-1"
      }
    ],
    "toolCalls": [
      {
        "function": {
          "arguments": {
            "type": "owner",
            "name": "John Smith",
            "businessName": "Garcia Auto Repair",
            "businessPhone": "555-1234",
            "monthlyRevenue": 50000,
            "monthlyExpenses": 35000,
            "existingDebtPayment": 2000,
            "requestedLoanAmount": 75000,
            "loanPurpose": "Working capital",
            "creditScore": 680,
            "yearFounded": 2018,
            "isUSCitizen": true
          }
        }
      }
    ]
  }
}'
```

**Response:** Returns approval chances (low/solid/great) and creates a draft application with generated PDFs.

### For Buyer Application
```bash
curl --location 'http://localhost:3000/api/applications/calculate-chances' \
--header 'Content-Type: application/json' \
--data '{
  "message": {
    "call": {
      "id": "test-call-buyer-456"
    },
    "toolCallList": [
      {
        "id": "chance-calc-2"
      }
    ],
    "toolCalls": [
      {
        "function": {
          "arguments": {
            "type": "buyer",
            "name": "Sarah Johnson",
            "businessName": "Main Street Bakery",
            "businessPhone": "555-5678",
            "purchasePrice": 400000,
            "availableCash": 60000,
            "businessCashFlow": 300000,
            "industryExperience": "Yes, 10 years",
            "creditScore": 720,
            "yearFounded": 2015,
            "isUSCitizen": true
          }
        }
      }
    ]
  }
}'
```

**Response Format:**
```json
{
  "results": [
    {
      "toolCallId": "chance-calc-1",
      "result": "Based on what you're telling me, well, you-you have great chances of getting approved! Your profile is exactly what SBA lenders look for."
    }
  ]
}
```

**Side Effects:**
- Creates a draft application in the database
- Generates PDF documents (form-1919, form-912)
- Generates presigned S3 URLs for PDFs (expires in 1 hour)
- Broadcasts `calculate-chances` event via WebSocket
- Broadcasts `form-reveal` event with presigned PDF URLs via WebSocket

**WebSocket Events Broadcasted:**

1. **`calculate-chances`** event:
```json
{
  "timestamp": "2025-12-14T...",
  "source": "calculate-chances",
  "result": {
    "score": 75,
    "chance": "great",
    "reasons": [...]
  }
}
```

2. **`form-reveal`** event:
```json
{
  "draftApplicationId": "abc123...",
  "pdfUrls": [
    {
      "fileName": "form-1919.pdf",
      "url": "https://s3.amazonaws.com/...?presigned-params",
      "generatedAt": "2025-12-14T...",
      "expiresIn": 3600
    },
    {
      "fileName": "form-912.pdf",
      "url": "https://s3.amazonaws.com/...?presigned-params",
      "generatedAt": "2025-12-14T...",
      "expiresIn": 3600
    }
  ],
  "callId": "test-call-owner-123",
  "timestamp": "2025-12-14T...",
  "source": "backend"
}
```

---

## Data Retrieval Endpoints

### 1. Get Specific Call Data by Call ID
```bash
curl --location 'http://localhost:3000/api/vapi/calls/test-call-owner-123'
```

### 2. Get Owner-Specific Fields Only
```bash
curl --location 'http://localhost:3000/api/vapi/calls/test-call-owner-123/owner-data'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "callId": "test-call-owner-123",
    "type": "owner",
    "name": "John Smith",
    "businessName": "Garcia Auto Repair",
    "businessPhone": "555-1234",
    "yearFounded": 2018,
    "monthlyRevenue": 50000,
    "monthlyExpenses": 35000,
    "existingDebtPayment": 2000,
    "requestedLoanAmount": 75000,
    "loanPurpose": "Working capital",
    "creditScore": 680,
    "usCitizen": true,
    "createdAt": "2025-12-14T...",
    "updatedAt": "2025-12-14T..."
  }
}
```

### 3. Get Buyer-Specific Fields Only
```bash
curl --location 'http://localhost:3000/api/vapi/calls/test-call-buyer-456/buyer-data'
```

### 4. Get All Owner Calls (Filtered)
```bash
curl --location 'http://localhost:3000/api/vapi/calls?type=owner'
```

### 5. Filter by Credit Score Range
```bash
curl --location 'http://localhost:3000/api/vapi/calls?type=owner&minCreditScore=650&maxCreditScore=750'
```

### 6. Filter by Business Name
```bash
curl --location 'http://localhost:3000/api/vapi/calls?type=owner&businessName=Garcia'
```

### 7. Filter by Date Range
```bash
curl --location 'http://localhost:3000/api/vapi/calls?type=owner&startDate=2025-01-01&endDate=2025-12-31'
```

### 8. Combine Multiple Filters
```bash
curl --location 'http://localhost:3000/api/vapi/calls?type=owner&minCreditScore=700&businessName=Auto'
```

### 9. Search Across Multiple Fields
```bash
curl --location 'http://localhost:3000/api/vapi/search?query=Garcia&limit=10&offset=0&sortBy=createdAt&sortOrder=desc'
```

### 10. Get Statistics
```bash
curl --location 'http://localhost:3000/api/vapi/stats'
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalCalls": 15,
    "ownerCalls": 8,
    "buyerCalls": 7,
    "completedCalls": 12,
    "averageCreditScore": 685.5,
    "totalRequestedAmount": 1250000,
    "usCitizens": 14,
    "recentCalls": [...]
  }
}
```

### 11. Update Call Data
```bash
curl --location --request PUT 'http://localhost:3000/api/vapi/calls/test-call-owner-123' \
--header 'Content-Type: application/json' \
--data '{
  "creditScore": 720,
  "requestedLoanAmount": 80000
}'
```

### 12. Delete Call Data
```bash
curl --location --request DELETE 'http://localhost:3000/api/vapi/calls/test-call-owner-123'
```

### 13. Export Call Data (JSON)
```bash
curl --location --request POST 'http://localhost:3000/api/vapi/calls/test-call-owner-123/export' \
--header 'Content-Type: application/json' \
--data '{
  "format": "json"
}'
```

### 14. Export Call Data (CSV)
```bash
curl --location --request POST 'http://localhost:3000/api/vapi/calls/test-call-owner-123/export' \
--header 'Content-Type: application/json' \
--data '{
  "format": "csv"
}'
```

### 15. Get Draft PDFs with Fresh Presigned URLs
```bash
curl --location 'http://localhost:3000/api/applications/ABC123DEF456/documents/draft?expiresIn=3600'
```

Replace `ABC123DEF456` with the actual `draftApplicationId` returned from the calculate-chances endpoint.

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationId": "ABC123DEF456",
    "status": "draft",
    "documents": [
      {
        "fileName": "form-1919.pdf",
        "url": "https://s3.amazonaws.com/...?presigned-params",
        "generatedAt": "2025-12-14T...",
        "expiresIn": 3600
      },
      {
        "fileName": "form-912.pdf",
        "url": "https://s3.amazonaws.com/...?presigned-params",
        "generatedAt": "2025-12-14T...",
        "expiresIn": 3600
      }
    ]
  }
}
```

---

## Complete Testing Flow Example

### Step 1: Capture All Owner Data
Run endpoints 1-12 from the "Owner Data Capture Endpoints" section with the same callId.

### Step 2: Calculate Approval Chances
Run the "Calculate SBA Approval Chances" endpoint for owners. This will return the approval assessment and broadcast PDF URLs via WebSocket.

### Step 3: Get Draft Application PDFs
After step 2, use the `draftApplicationId` from the WebSocket `form-reveal` event:
```bash
curl --location 'http://localhost:3000/api/applications/YOUR_DRAFT_APP_ID/documents/draft'
```

### Step 4: Retrieve Captured Data
```bash
curl --location 'http://localhost:3000/api/vapi/calls/test-call-owner-123/owner-data'
```

### Step 5: Check Statistics
```bash
curl --location 'http://localhost:3000/api/vapi/stats'
```

---

## Postman Import Instructions

1. Open Postman
2. Create a new Collection named "Vapi AI Testing"
3. For each cURL command above:
   - Click "Import" → "Raw text"
   - Paste the cURL command
   - Click "Import"
4. Organize requests into folders:
   - Owner Data Capture
   - Buyer Data Capture
   - Calculate Chances
   - Data Retrieval

---

## Environment Variables for Postman

Create a Postman environment with these variables:

```json
{
  "base_url": "http://localhost:3000",
  "owner_call_id": "test-call-owner-123",
  "buyer_call_id": "test-call-buyer-456"
}
```

Then replace hardcoded values in requests:
- `http://localhost:3000` → `{{base_url}}`
- `test-call-owner-123` → `{{owner_call_id}}`
- `test-call-buyer-456` → `{{buyer_call_id}}`

---

## Notes

- All data capture endpoints broadcast updates via WebSocket to the `global` room and the specific call room
- The `calculate-chances` endpoint creates a draft application and generates PDFs automatically
- **Presigned URLs**: All PDF URLs generated by the backend are presigned S3 URLs that expire after 1 hour (3600 seconds)
- Call IDs are case-sensitive
- Credit scores should be between 300-850
- All monetary values should be numbers (not strings with currency symbols)
- To get fresh presigned URLs for draft PDFs, use the `/api/applications/:applicationId/documents/draft` endpoint

---

## Troubleshooting

### "Call data not found" Error
- Ensure you've captured at least one field for that callId first
- Check that the callId matches exactly (case-sensitive)

### "Missing required fields" Error
- For owner: ensure monthlyRevenue, monthlyExpenses, and requestedLoanAmount are provided
- For buyer: ensure purchasePrice, availableCash, and businessCashFlow are provided

### WebSocket Not Broadcasting
- Check that your WebSocket connection is established
- Verify the server is running on the correct port (default: 3000)

