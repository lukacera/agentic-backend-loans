# Checkbox Filling - Testing Guide

## Overview

This guide provides CURL and Postman examples to test the new checkbox selection functionality via the Vapi webhook endpoint.

---

## Prerequisites

- Backend running locally (default: `http://localhost:3000`)
- Or use your deployed endpoint URL

---

## Test 1: Capture Entity Type (Single-Select)

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-001"
      },
      "toolCallList": [{
        "id": "tool-001",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"group\":\"entity\",\"value\":\"LLC\"}"
        }
      }]
    }
  }'
```

### Postman

**Method:** `POST`
**URL:** `http://localhost:3000/vapi-ai`
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-001"
    },
    "toolCallList": [{
      "id": "tool-001",
      "function": {
        "name": "captureCheckboxSelection",
        "arguments": "{\"group\":\"entity\",\"value\":\"LLC\"}"
      }
    }]
  }
}
```

**Expected Response:**
```json
{
  "results": [{
    "toolCallId": "tool-001",
    "result": "{\"success\":true,\"message\":\"Captured entity: LLC\"}"
  }]
}
```

---

## Test 2: Capture Veteran Status

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-002"
      },
      "toolCallList": [{
        "id": "tool-002",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"group\":\"veteranStatus\",\"value\":\"Veteran\"}"
        }
      }]
    }
  }'
```

### Postman Body

```json
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-002"
    },
    "toolCallList": [{
      "id": "tool-002",
      "function": {
        "name": "captureCheckboxSelection",
        "arguments": "{\"group\":\"veteranStatus\",\"value\":\"Veteran\"}"
      }
    }]
  }
}
```

---

## Test 3: Capture Sex

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-003"
      },
      "toolCallList": [{
        "id": "tool-003",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"group\":\"sex\",\"value\":\"Male\"}"
        }
      }]
    }
  }'
```

---

## Test 4: Capture Race

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-004"
      },
      "toolCallList": [{
        "id": "tool-004",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"group\":\"race\",\"value\":\"Asian\"}"
        }
      }]
    }
  }'
```

---

## Test 5: Capture Ethnicity

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-005"
      },
      "toolCallList": [{
        "id": "tool-005",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"group\":\"ethnicity\",\"value\":\"Hispanic or Latino\"}"
        }
      }]
    }
  }'
```

---

## Test 6: Error Case - Missing Group

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-006"
      },
      "toolCallList": [{
        "id": "tool-006",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"value\":\"LLC\"}"
        }
      }]
    }
  }'
```

**Expected Response:**
```json
{
  "results": [{
    "toolCallId": "tool-006",
    "result": "{\"success\":false,\"error\":\"Both group and value are required\"}"
  }]
}
```

---

## Test 7: Error Case - Invalid Value

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-007"
      },
      "toolCallList": [{
        "id": "tool-007",
        "function": {
          "name": "captureCheckboxSelection",
          "arguments": "{\"group\":\"entity\",\"value\":\"InvalidType\"}"
        }
      }]
    }
  }'
```

**Note:** This will still succeed at the handler level (stores the value), but will fail when filling the PDF because "InvalidType" doesn't exist in the `entity` options.

---

## Test 8: Multiple Checkbox Selections in One Call

### CURL

```bash
curl -X POST http://localhost:3000/vapi-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": {
        "id": "test-call-008"
      },
      "toolCallList": [
        {
          "id": "tool-008a",
          "function": {
            "name": "captureCheckboxSelection",
            "arguments": "{\"group\":\"entity\",\"value\":\"S-Corp\"}"
          }
        },
        {
          "id": "tool-008b",
          "function": {
            "name": "captureCheckboxSelection",
            "arguments": "{\"group\":\"sex\",\"value\":\"Female\"}"
          }
        },
        {
          "id": "tool-008c",
          "function": {
            "name": "captureCheckboxSelection",
            "arguments": "{\"group\":\"race\",\"value\":\"White\"}"
          }
        }
      ]
    }
  }'
```

**Expected Response:**
```json
{
  "results": [
    {
      "toolCallId": "tool-008a",
      "result": "{\"success\":true,\"message\":\"Captured entity: S-Corp\"}"
    },
    {
      "toolCallId": "tool-008b",
      "result": "{\"success\":true,\"message\":\"Captured sex: Female\"}"
    },
    {
      "toolCallId": "tool-008c",
      "result": "{\"success\":true,\"message\":\"Captured race: White\"}"
    }
  ]
}
```

---

## Available Checkbox Groups & Values

### entity
- `LLC`
- `C-Corp`
- `S-Corp`
- `Partnership`
- `Sole Proprietor`
- `Other`

### specialOwnershipType (multi-select - not yet implemented)
- `ESOP`
- `401k`
- `Cooperative`
- `Native American Tribe`
- `Other`

### veteranStatus
- `Non-Veteran`
- `Veteran`
- `Service-Disabled Veteran`
- `Veteran with Disability`
- `Veteran without Disability`

### sex
- `Male`
- `Female`

### race
- `American Indian or Alaska Native`
- `Asian`
- `Black or African American`
- `Native Hawaiian or Other Pacific Islander`
- `White`
- `Not Disclosed`

### ethnicity
- `Hispanic or Latino`
- `Not Hispanic or Latino`
- `Not Disclosed`

---

## WebSocket Events

When a checkbox is captured, the following WebSocket event is broadcast to the `global` room and call-specific room:

**Event:** `form-field-update`

**Payload:**
```json
{
  "callId": "test-call-001",
  "timestamp": "2025-12-17T12:34:56.789Z",
  "fields": {
    "checkbox_entity": "LLC"
  },
  "source": "toolfn-call",
  "fieldType": "checkbox"
}
```

---

## Testing PDF Generation with Checkboxes

To test if checkboxes are actually filled in the PDFs:

### Step 1: Capture checkbox data

Use any of the above tests to store checkbox values in `userDataStore`.

### Step 2: Trigger calculate-chances endpoint

```bash
curl -X POST http://localhost:3000/api/applications/calculate-chances \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCallList": [{
        "function": {
          "arguments": {
            "type": "owner",
            "checkbox_entity": "LLC",
            "checkbox_sex": "Male",
            "checkbox_race": "Asian",
            "checkbox_ethnicity": "Not Hispanic or Latino",
            "checkbox_veteranStatus": "Non-Veteran",
            "monthlyRevenue": "50000",
            "monthlyExpenses": "30000",
            "existingDebtPayment": "5000",
            "requestedLoanAmount": "100000",
            "creditScore": "720",
            "isUSCitizen": true,
            "businessYearsRunning": "5",
            "loanPurpose": "Working Capital"
          }
        }
      }]
    }
  }'
```

### Step 3: Check the generated PDF

The endpoint will return presigned URLs for the draft PDFs. Download them and verify that the appropriate checkboxes are filled.

---

## Logging

Watch your backend logs for these indicators:

✅ **Success logs:**
```
📋 Capturing checkbox selection: entity = LLC
✅ Checked checkbox: llc (entity: LLC)
✅ Filled checkbox group "entity" with value "LLC" in SBAForm1919.pdf
```

⚠️ **Warning logs:**
```
⚠️ Unknown checkbox group: invalidGroup
⚠️ Unknown value "InvalidValue" for group "entity". Available options: [ 'LLC', 'C-Corp', ... ]
⚠️ Field llc not found in PDF form
```

---

## Next Steps

1. Test single-select checkboxes (entity, sex, race, ethnicity, veteranStatus)
2. Verify WebSocket broadcasts to connected clients
3. Generate draft PDFs and confirm checkboxes are filled correctly
4. Implement multi-select support for `specialOwnershipType` (Phase 2)
5. Add Vapi assistant tool configuration to enable voice-driven checkbox selection
