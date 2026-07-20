# CareerPilot AI Server

### Backend API for the CareerPilot AI Job Portal

<p align="center">
  A secure Express.js, TypeScript, MongoDB, Better Auth, and Groq-powered backend for job management, contact messaging, and AI career assistance.
</p>

<p align="center">
  <a href="https://careerpilot-server-seven.vercel.app">
    <img src="https://img.shields.io/badge/Live_API-Open_Server-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Backend API" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-5.x-000000?logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white" alt="MongoDB Atlas" />
  <img src="https://img.shields.io/badge/Better_Auth-JWT-4F46E5" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Groq-AI-F55036" alt="Groq AI" />
  <img src="https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel" alt="Vercel" />
</p>


## Overview

**CareerPilot AI Server** is the backend service for the CareerPilot AI full-stack job portal.

It provides REST API endpoints for public job discovery, authenticated job management, contact-form submissions, AI conversation history, and real-time AI-generated career assistance.

The backend uses Express.js and TypeScript, stores application data in MongoDB Atlas, verifies protected requests using Better Auth JWT tokens, and integrates the Groq API for streamed AI responses.


## Live Links

| Service | URL |
|---|---|
| Backend API | [https://careerpilot-server-seven.vercel.app](https://careerpilot-server-seven.vercel.app) |
| Public Jobs API | [https://careerpilot-server-seven.vercel.app/jobs](https://careerpilot-server-seven.vercel.app/jobs) |
| Frontend Application | [https://careerpilot-vert-six.vercel.app](https://careerpilot-vert-six.vercel.app) |


## Main Backend Features

### Job API

- Retrieve public job listings
- Search jobs by title, company, description, or skill
- Filter jobs by category, job type, location, and salary
- Sort jobs by date, salary, or deadline
- Paginate large job collections
- Retrieve individual job details
- Retrieve related job opportunities
- Publish new jobs
- Retrieve jobs created by the authenticated user
- Update owned job listings
- Delete owned job listings

### Authentication and Authorization

- Better Auth JWT access-token verification
- Better Auth JWKS integration
- Protected API endpoints
- User identity extraction from verified JWT payloads
- Resource-ownership verification
- Unauthorized and expired-token handling

### AI Career Assistant

- Groq-powered AI responses
- Real-time response streaming
- NDJSON streaming format
- Saved AI conversation history
- Continue previous conversations
- Retrieve individual conversations
- Delete conversations
- User-specific conversation protection
- Suggested follow-up prompts
- Context-aware conversation handling
- Language-aware responses
- Roman Bangla communication support

### Contact Message API

- Public contact-form submission
- Name validation
- Email validation
- Subject validation
- Message-length validation
- MongoDB message storage
- Submission status and timestamps

### Database Reliability

- Reusable MongoDB client connection
- Connection pooling
- Automatic client recreation after a closed topology
- Route-level collection retrieval
- MongoDB ObjectId validation
- Input normalization
- Structured error handling


## Technology Stack

### Runtime and Framework

- Node.js
- Express.js
- TypeScript

### Database

- MongoDB Atlas
- MongoDB Node.js Driver
- MongoDB ObjectId

### Authentication

- Better Auth
- Better Auth JWKS
- JSON Web Token verification
- `jose-cjs`

### Artificial Intelligence

- Groq API
- Groq Node.js SDK
- Streaming chat completions

### Additional Packages

- CORS
- Dotenv

### Deployment

- Vercel
- Vercel Serverless Functions
- MongoDB Atlas
- Groq Cloud API


## Backend Architecture

```text
Client Application
        │
        │ HTTP Request
        ▼
Express.js API
        │
        ├── Public Routes
        │   ├── Job discovery
        │   ├── Job details
        │   └── Contact messages
        │
        ├── Authentication Middleware
        │   ├── Read Bearer token
        │   ├── Verify JWT
        │   ├── Validate issuer and audience
        │   └── Attach authenticated user
        │
        ├── Protected Job Routes
        │   ├── Create job
        │   ├── Retrieve owned jobs
        │   ├── Update owned job
        │   └── Delete owned job
        │
        ├── Protected AI Routes
        │   ├── Retrieve conversations
        │   ├── Retrieve one conversation
        │   ├── Delete conversation
        │   └── Stream AI response
        │
        ├── MongoDB Atlas
        │   ├── jobs
        │   ├── messages
        │   └── aiConversations
        │
        └── Groq API
            └── AI-generated streamed responses
```


## Project Structure

```text
careerpilot-server/
│
├── index.ts
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── vercel.json
└── README.md
```

### Main File Responsibilities

```text
│/index.ts
│
├── Environment configuration
├── Express application setup
├── CORS configuration
├── JSON middleware
├── MongoDB connection handling
├── Better Auth JWKS configuration
├── JWT verification middleware
├── Job interfaces and validation
├── AI conversation interfaces
├── Public API routes
├── Protected job routes
├── Protected AI routes
├── Contact message route
└── Server startup
```

## Database Collections

| Collection | Purpose |
|---|---|
| `jobs` | Stores published job listings |
| `messages` | Stores contact-form submissions |
| `aiConversations` | Stores authenticated users' AI conversation history |

Authentication-related collections are managed by Better Auth in the authentication database configuration used by the frontend application.


## API Base URL

### Production

```text
https://careerpilot-server-seven.vercel.app
```

### Local Development

```text
http://localhost:5000
```


## API Endpoints

## Server Health

### Check Backend Status

```http
GET /
```

Example response:

```text
CareerPilot Server is Running...
```

---

## Public Job Endpoints

### Retrieve Jobs

```http
GET /jobs
```

Supported query parameters:

| Parameter | Type | Description |
|---|---|---|
| `search` | String | Search title, company, description, or skill |
| `category` | String | Filter by job category |
| `location` | String | Filter by location |
| `jobType` | String | Filter by job type |
| `minSalary` | Number | Minimum acceptable salary |
| `maxSalary` | Number | Maximum acceptable salary |
| `sort` | String | Select sorting order |
| `page` | Number | Requested result page |
| `limit` | Number | Number of jobs per page |

Supported sorting values:

```text
newest
oldest
salary-low
salary-high
deadline
```

Example request:

```http
GET /jobs?search=developer&location=Dhaka&sort=newest&page=1&limit=8
```

Example response structure:

```json
{
  "success": true,
  "message": "Jobs retrieved successfully.",
  "data": [],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 0,
    "itemsPerPage": 8,
    "hasPreviousPage": false,
    "hasNextPage": false
  }
}
```


### Retrieve Job Details

```http
GET /jobs/:id
```

The response includes:

- Complete job information
- Related jobs from the same category

Example response structure:

```json
{
  "success": true,
  "message": "Job details retrieved successfully.",
  "data": {
    "job": {},
    "relatedJobs": []
  }
}
```


## Contact Endpoint

### Submit Contact Message

```http
POST /messages
```

Request body:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "CareerPilot Support",
  "message": "I would like to know more about the platform."
}
```

Successful response:

```json
{
  "success": true,
  "message": "Your message has been sent successfully.",
  "data": {
    "id": "mongodb_document_id"
  }
}
```


## Protected Job Endpoints

Protected endpoints require a valid Better Auth JWT access token.

```http
Authorization: Bearer <access_token>
```

### Publish a Job

```http
POST /manage/jobs
```

Request body:

```json
{
  "title": "Frontend Developer",
  "companyName": "Example Company",
  "companyLogo": "https://example.com/logo.png",
  "shortDescription": "Build modern frontend applications.",
  "fullDescription": "We are looking for a frontend developer to join our team.",
  "category": "Technology",
  "jobType": "Full-time",
  "workMode": "Remote",
  "location": "Dhaka, Bangladesh",
  "experienceLevel": "Mid Level",
  "salaryMin": 50000,
  "salaryMax": 80000,
  "applicationDeadline": "2026-12-31",
  "skills": [
    "React",
    "Next.js",
    "TypeScript"
  ]
}
```

### Retrieve Authenticated User's Jobs

```http
GET /manage/jobs/my-jobs
```

This endpoint returns only the jobs created by the authenticated user.


### Update an Owned Job

```http
PATCH /manage/jobs/:id
```

The authenticated user can update only jobs created by that same user.


### Delete an Owned Job

```http
DELETE /manage/jobs/:id
```

The authenticated user can delete only jobs created by that same user.


## Protected AI Endpoints

### Retrieve Conversation History

```http
GET /ai/conversations
```

Returns the authenticated user's recent AI conversations.


### Retrieve One Conversation

```http
GET /ai/conversations/:id
```

Returns a conversation only when it belongs to the authenticated user.


### Delete a Conversation

```http
DELETE /ai/conversations/:id
```

Deletes a conversation only when it belongs to the authenticated user.


### Send an AI Message

```http
POST /ai/chat
```

Request body for a new conversation:

```json
{
  "message": "How should I prepare for a frontend developer interview?"
}
```

Request body for continuing an existing conversation:

```json
{
  "conversationId": "mongodb_conversation_id",
  "message": "Can you give me a seven-day preparation plan?"
}
```

The endpoint streams newline-delimited JSON events.

Content type:

```http
application/x-ndjson
```

Possible stream events:

```json
{
  "type": "conversation",
  "conversationId": "conversation_id"
}
```

```json
{
  "type": "delta",
  "content": "Partial AI response"
}
```

```json
{
  "type": "done",
  "conversationId": "conversation_id",
  "suggestions": [
    "Suggested follow-up question"
  ]
}
```

```json
{
  "type": "error",
  "message": "Unable to generate an AI response."
}
```

## Authentication Flow

```text
1. User signs in through the CareerPilot frontend.
2. Better Auth creates the authenticated session.
3. The frontend obtains a JWT access token.
4. The frontend adds the token to the Authorization header.
5. The Express backend receives the protected request.
6. The backend verifies the token through Better Auth JWKS.
7. The backend extracts the authenticated user's ID.
8. The protected operation is processed for that user.
```

Authorization header format:

```http
Authorization: Bearer <access_token>
```

JWKS source:

```text
{CLIENT_URL}/api/auth/jwks
```


## MongoDB Connection Handling

The backend uses a reusable MongoDB connection strategy suitable for local development and serverless deployment.

Main connection behavior:

- A shared MongoDB client is reused when available
- Simultaneous requests share the same connection promise
- MongoDB connection pooling is enabled
- Closed topology events reset the cached client
- A new client is created after connection failure
- Collections are retrieved inside individual database routes
- The database connection is not closed after each request

Database name:

```text
careerpilot-db
```

Main connection settings:

```text
Maximum pool size: 10
Minimum pool size: 0
Maximum idle time: 30 seconds
MongoDB Server API: Version 1
```


## Local Development

## Prerequisites

Install or configure the following:

- Node.js 20 or later
- npm
- Git
- MongoDB Atlas account
- MongoDB connection string
- Groq API key
- Running CareerPilot frontend


## Installation

Clone the repository:

```bash
git clone https://github.com/nahidforever/CareerPilot-Server
```

Enter the project directory:

```bash
cd YOUR_BACKEND_REPOSITORY
```

Install dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000

MONGODB_URI=your_mongodb_atlas_connection_string
CLIENT_URL=http://localhost:3000

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

### Environment Variable Details

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Local Express server port; defaults to `5000` |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `CLIENT_URL` | Yes | Approved frontend origin and Better Auth issuer |
| `GROQ_API_KEY` | Yes | Groq API authentication key |
| `GROQ_MODEL` | No | Groq model used for AI responses |

Never commit the `.env` file.

Add it to `.gitignore`:

```gitignore
.env
.env.local
node_modules
dist
.vercel
```


## Start the Development Server

```bash
npm run dev
```

The server will run at:

```text
http://localhost:5000
```

Test the root endpoint:

```text
http://localhost:5000/
```

Test the public Jobs API:

```text
http://localhost:5000/jobs
```


## TypeScript Validation

Run the TypeScript type checker:

```bash
npm run type-check
```

Expected successful output:

```text
tsc --noEmit
```

When the command completes without showing an error, TypeScript validation has passed.


## API Testing Examples

### Test Server Status

```bash
curl http://localhost:5000/
```

### Retrieve Public Jobs

```bash
curl "http://localhost:5000/jobs?page=1&limit=8"
```

### Search Public Jobs

```bash
curl "http://localhost:5000/jobs?search=developer&sort=newest"
```

### Submit Contact Message

```bash
curl -X POST "http://localhost:5000/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "Project Question",
    "message": "I would like to know more about CareerPilot AI."
  }'
```

### Retrieve Protected Jobs

```bash
curl "http://localhost:5000/manage/jobs/my-jobs" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Stream an AI Response

```bash
curl -N -X POST "http://localhost:5000/ai/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "message": "How can I improve my interview skills?"
  }'
```


## Validation and Error Handling

The backend validates:

- Required job fields
- Minimum and maximum salary values
- Salary-range consistency
- Application deadline format
- Required skills
- Contact name length
- Contact email format
- Contact subject length
- Contact message length
- AI message length
- MongoDB ObjectIds
- Authentication tokens
- Resource ownership
- Conversation ownership

Common status codes:

| Status Code | Meaning |
|---|---|
| `200` | Request completed successfully |
| `201` | Resource created successfully |
| `400` | Invalid request or validation failure |
| `401` | Missing, invalid, or expired authentication |
| `404` | Requested resource was not found |
| `500` | Internal server or service error |


## Security

- Protected routes require verified JWT access tokens
- Better Auth JWKS is used for token verification
- Token issuer and audience are validated
- Users can update or delete only their own jobs
- Users can access only their own AI conversations
- MongoDB ObjectIds are validated
- Search text is escaped before regular-expression use
- User input is trimmed and normalized
- CORS allows only the configured frontend origin
- MongoDB credentials remain in environment variables
- Groq API credentials remain server-side
- Private environment files are excluded from Git

## CORS Configuration

The backend accepts requests from the frontend URL configured in:

```env
CLIENT_URL=http://localhost:3000
```

Production example:

```env
CLIENT_URL=https://careerpilot-vert-six.vercel.app
```

Credentials are enabled for approved cross-origin requests.


## Deployment on Vercel

### Deployment Steps

1. Push the backend repository to GitHub.
2. Sign in to Vercel.
3. Import the backend repository.
4. Add the required environment variables.
5. Deploy the project.
6. Copy the deployed backend URL.
7. Add the backend URL to the frontend environment variables.
8. Set the backend `CLIENT_URL` to the deployed frontend URL.
9. Redeploy both applications when environment variables change.

### Production Environment Variables

```env
MONGODB_URI=your_production_mongodb_connection_string
CLIENT_URL=https://careerpilot-vert-six.vercel.app

GROQ_API_KEY=your_production_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

Production backend:

```text
https://careerpilot-server-seven.vercel.app
```


## MongoDB Atlas Configuration

Before deploying:

1. Create a MongoDB Atlas cluster.
2. Create a database user.
3. Copy the database connection string.
4. Add the connection string as `MONGODB_URI`.
5. Configure Atlas Network Access for the deployment environment.
6. Confirm the database user has the required read and write permissions.
7. Never expose the MongoDB password in the repository.



## Deployment Testing Checklist

After deployment, verify:

- Root endpoint returns the server-running message
- Public Jobs API returns a successful response
- Search and filters work
- Pagination works
- Job details are retrieved
- Related jobs are retrieved
- Contact messages are stored
- JWT tokens are verified
- Invalid tokens return `401`
- Add Job creates a listing
- My Jobs returns only owned jobs
- Job update validates ownership
- Job deletion validates ownership
- AI responses stream correctly
- AI conversations are stored
- Previous conversations can be retrieved
- Conversations can be deleted
- Users cannot access another user's conversations
- MongoDB remains connected across requests
- CORS accepts requests from the production frontend


## Known External Dependencies

The backend depends on the availability of:

- MongoDB Atlas
- Better Auth JWKS endpoint
- Groq API
- Vercel serverless infrastructure

A failure or configuration problem in one of these services may cause the related API operation to fail.


## Future Improvements

- API rate limiting
- Request logging
- Centralized error-handling middleware
- Zod-based schema validation
- Automated API testing
- Unit and integration tests
- Redis caching
- Job-application endpoints
- Saved-job endpoints
- Email notification service
- User-role authorization
- Employer and candidate separation
- Administrative endpoints
- AI usage limits
- AI response moderation
- API documentation with Swagger or OpenAPI
- Performance monitoring

## Project Purpose

CareerPilot AI Server was developed to demonstrate:

- Express.js backend development
- TypeScript-based API design
- MongoDB CRUD operations
- Reliable MongoDB connection management
- JWT authentication and authorization
- Protected resource ownership
- Input validation
- Search, filtering, sorting, and pagination
- AI API integration
- Real-time streaming responses
- Conversation-history storage
- Serverless backend deployment
- Full-stack frontend and backend communication


## Related Frontend Repository

CareerPilot AI frontend application:

```text
https://careerpilot-vert-six.vercel.app
```

Frontend repository:

```text
https://github.com/nahidforever/CareerPilot-Client
```


## Author

**Md. Nahid Islam**

- GitHub: [https://github.com/nahidforever](https://github.com/nahidforever)
- LinkedIn: [https://www.linkedin.com/in/nahidforever/](https://www.linkedin.com/in/nahidforever/)
- Email: n.i.nahid02@gmail.com



<p align="center">
  Built with Express.js, TypeScript, MongoDB Atlas, Better Auth, and Groq AI.
</p>