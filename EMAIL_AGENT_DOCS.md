# Email Agent API Documentation

## Overview
The Email Agent is an AI-powered service that can compose emails, generate replies, analyze email content, and manage email templates and drafts.

## Base URL
```
http://localhost:3000/api/emails
```

## Endpoints

### 1. Compose New Email
**POST** `/compose`

Generate a new email with AI assistance based on your requirements.

```json
{
  "recipients": ["john@example.com", "jane@example.com"],
  "subject": "Project Kickoff Meeting",
  "keyPoints": [
    "Schedule kickoff meeting for next week",
    "Discuss project timeline and milestones",
    "Assign team roles and responsibilities"
  ],
  "tone": "professional",
  "purpose": "invitation",
  "context": "We're starting a new software development project"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "draft-uuid",
    "subject": "Project Kickoff Meeting",
    "body": "Dear Team,\n\nI hope this email finds you well...",
    "to": ["john@example.com", "jane@example.com"],
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-01T10:00:00Z"
  },
  "processingTime": 1500
}
```

### 2. Generate Email Reply
**POST** `/reply`

Generate intelligent replies to existing emails.

```json
{
  "originalMessageId": "message-uuid",
  "replyType": "reply",
  "tone": "professional",
  "includeOriginal": true,
  "customInstructions": "Be polite and suggest a meeting time"
}
```

### 3. Analyze Email Content
**POST** `/analyze`

Analyze email content for sentiment, urgency, intent, and more.

```json
{
  "emailId": "message-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sentiment": "positive",
    "urgency": "medium",
    "intent": "Meeting request",
    "keyTopics": ["project", "meeting", "deadline"],
    "suggestedActions": ["Schedule meeting", "Confirm availability"],
    "requiresResponse": true,
    "estimatedResponseTime": "24 hours"
  }
}
```

### 4. Create Email from Template
**POST** `/templates/{templateId}/create`

Create emails using predefined templates with variable substitution.

```json
{
  "recipients": ["client@example.com"],
  "variables": {
    "recipientName": "John Smith",
    "senderName": "Jane Doe",
    "companyName": "TechCorp Inc.",
    "position": "Project Manager",
    "introduction": "I wanted to reach out regarding our upcoming collaboration",
    "callToAction": "Please let me know your availability for a brief call this week"
  }
}
```

### 5. Get All Templates
**GET** `/templates`

Retrieve all available email templates.

### 6. Manage Drafts

#### Get All Drafts
**GET** `/drafts`

#### Get Specific Draft
**GET** `/drafts/{draftId}`

#### Update Draft
**PUT** `/drafts/{draftId}`

```json
{
  "subject": "Updated Subject",
  "body": "Updated email body content"
}
```

#### Delete Draft
**DELETE** `/drafts/{draftId}`

### 7. Improve Email
**POST** `/drafts/{draftId}/improve`

Use AI to improve existing email drafts.

```json
{
  "improvementType": "clarity"
}
```

Available improvement types:
- `tone` - Adjust the tone of the email
- `clarity` - Make the email clearer and more understandable
- `length` - Make the email more concise
- `professionalism` - Increase professional language
- `engagement` - Make the email more engaging

### 8. Generate Subject Suggestions
**POST** `/subject-suggestions`

Generate multiple subject line options for email content.

```json
{
  "emailBody": "I wanted to follow up on our conversation about the project timeline...",
  "context": "Follow-up email about project discussion"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    "Follow-up: Project Timeline Discussion",
    "Next Steps for Our Project Timeline",
    "Project Timeline - Action Items from Our Call",
    "Moving Forward with Project Milestones",
    "Project Timeline Update and Next Steps"
  ]
}
```

### 9. Agent Status and Capabilities

#### Get Agent Status
**GET** `/agent/status`

#### Get Agent Capabilities
**GET** `/agent/capabilities`

## Email Tones Available
- `professional` - Business-appropriate, formal tone
- `friendly` - Warm and approachable
- `formal` - Very formal and official
- `casual` - Relaxed and informal
- `urgent` - Conveys urgency and importance
- `apologetic` - Expresses regret or apology
- `enthusiastic` - Excited and positive
- `neutral` - Balanced, neither formal nor casual

## Email Purposes Available
- `inquiry` - Asking questions or requesting information
- `response` - Answering or responding to something
- `follow_up` - Following up on previous communication
- `introduction` - Introducing yourself or others
- `thank_you` - Expressing gratitude
- `reminder` - Reminding about something
- `notification` - Informing about updates or changes
- `invitation` - Inviting to events or meetings
- `proposal` - Proposing ideas or solutions
- `complaint` - Expressing dissatisfaction
- `apology` - Apologizing for something

## Example Usage Scenarios

### Scenario 1: Business Introduction
```bash
curl -X POST http://localhost:3000/api/emails/compose \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["potential.client@example.com"],
    "subject": "Introduction from TechCorp",
    "keyPoints": [
      "Introduce our company and services",
      "Mention mutual connection from LinkedIn",
      "Propose a brief call to discuss potential collaboration"
    ],
    "tone": "professional",
    "purpose": "introduction",
    "context": "Reaching out to a potential client after connecting on LinkedIn"
  }'
```

### Scenario 2: Follow-up After Meeting
```bash
curl -X POST http://localhost:3000/api/emails/compose \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["team@example.com"],
    "subject": "Follow-up: Action Items from Today Meeting",
    "keyPoints": [
      "Thank everyone for their time",
      "Summarize key decisions made",
      "List action items and deadlines",
      "Schedule next meeting"
    ],
    "tone": "professional",
    "purpose": "follow_up"
  }'
```

### Scenario 3: Automated Reply Generation
First, create a message to reply to, then generate a reply:

```bash
# Create original message
curl -X POST http://localhost:3000/api/emails/messages \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Question about API Documentation",
    "from": "developer@client.com",
    "to": ["support@ourcompany.com"],
    "body": "Hi, I am trying to integrate with your API but cannot find documentation for the authentication endpoints. Could you please help?"
  }'

# Generate reply (use the returned message ID)
curl -X POST http://localhost:3000/api/emails/reply \
  -H "Content-Type: application/json" \
  -d '{
    "originalMessageId": "message-uuid-from-above",
    "replyType": "reply",
    "tone": "helpful",
    "customInstructions": "Provide helpful information and include link to documentation"
  }'
```

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required fields)
- `404` - Not Found (resource not found)
- `500` - Internal Server Error (processing failed)