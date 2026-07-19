import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import type { Document, Filter, Sort } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";
import Groq from "groq-sdk";

dotenv.config();

const app: Application = express();

const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI as string;

// Middleware

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

app.use(express.json());

// MongoDB Client

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.CLIENT_URL,
      audience: process.env.CLIENT_URL,
    });

    const userId =
      typeof payload.id === "string"
        ? payload.id
        : typeof payload.sub === "string"
          ? payload.sub
          : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in authentication token",
      });
    }

    res.locals.userId = userId;

    res.locals.user = {
      id: userId,
      name: typeof payload.name === "string" ? payload.name : null,
      email: typeof payload.email === "string" ? payload.email : null,
      image: typeof payload.image === "string" ? payload.image : null,
    };

    next();
  } catch (error) {
    console.error("Token verification error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};

interface JobInput {
  title: string;
  companyName: string;
  companyLogo?: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  jobType: string;
  workMode: string;
  location: string;
  experienceLevel: string;
  salaryMin: number;
  salaryMax: number;
  applicationDeadline: string;
  skills: string[];
}

interface ContactMessageInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

type AIMessageRole = "user" | "assistant";

interface AIMessageDocument {
  id: string;
  role: AIMessageRole;
  content: string;
  createdAt: Date;
}

interface AIChatInput {
  conversationId?: string;
  message: string;
}

interface AIConversationDocument {
  _id?: ObjectId;
  userId: string;
  title: string;
  messages: AIMessageDocument[];
  createdAt: Date;
  updatedAt: Date;
}

interface AIStreamEvent {
  type: "conversation" | "delta" | "done" | "error";
  conversationId?: string;
  content?: string;
  suggestions?: string[];
  message?: string;
}

const CAREER_PILOT_SYSTEM_PROMPT = `
You are CareerPilot AI Assistant, an intelligent conversational assistant integrated into the CareerPilot job portal.

CareerPilot routes:
- / : Home page
- /jobs : Explore all public jobs
- /jobs/[id] : View a specific job
- /jobs/add : Publish a new job
- /jobs/manage : Manage the authenticated user's jobs
- /dashboard : View job statistics and recent activity
- /profile : View and edit profile information
- /about : Learn about CareerPilot
- /contact : Send a support or feedback message
- /ai-assistant : CareerPilot AI Assistant

CareerPilot job information may include:
- Job title
- Company name and logo
- Job description
- Category
- Job type
- Work mode
- Location
- Experience level
- Salary range
- Application deadline
- Required skills

Language and communication rules:
1. Always reply in the same language and writing style used by the user.
2. If the user writes English, reply in English.
3. If the user writes Bengali using Bengali script, reply in Bengali script.
4. If the user writes Bengali using English letters, reply in natural Roman Bangla using English letters.
5. Do not mix Hindi, Urdu or other languages with Bengali.
6. Do not use greetings such as "Namaste" unless the user uses that greeting first.
7. For Roman Bangla, use natural Bangladeshi wording and spelling.
8. Do not mention the user's name unless the user asks you to use it or it is necessary.
9. Respond naturally to greetings without giving an unnecessarily long introduction.
10. Keep simple answers concise. Give detailed explanations when the question requires them.

Your responsibilities:
1. Answer greetings and casual conversation naturally.
2. Answer general knowledge, educational, technical and everyday questions.
3. Answer career, job search, interview, skill and professional development questions.
4. Help users understand and navigate CareerPilot.
5. Explain how to explore, publish, edit and manage jobs.
6. Use previous conversation messages to understand follow-up questions.
7. Give clear, practical and accurate answers.
8. Mention relevant CareerPilot routes when navigation help is useful.
9. Never claim that you submitted an application, edited a job, deleted data or changed account information.
10. Do not invent CareerPilot job listings, user information or application data.
11. Clearly mention uncertainty when information requires current verification.
12. Politely refuse harmful, illegal or unsafe requests.

Response formatting rules:
1. Use Markdown when it improves readability.
2. Use short headings for long explanations.
3. Use bullet points or numbered lists when appropriate.
4. Put programming code inside fenced code blocks and include the language name.
5. Do not use unnecessary headings for simple greetings or short answers.
6. Do not overuse bold text, emojis or decorative symbols.
`;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  return new Groq({
    apiKey,
  });
}

function createAIMessageId() {
  return new ObjectId().toString();
}

function createConversationTitle(message: string) {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();

  if (normalizedMessage.length <= 55) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, 52)}...`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSuggestedPrompts(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("publish") ||
    normalizedMessage.includes("add job") ||
    normalizedMessage.includes("post job")
  ) {
    return [
      "What information is required to publish a job?",
      "How can I edit a published job?",
      "Where can I manage my jobs?",
    ];
  }

  if (
    normalizedMessage.includes("search") ||
    normalizedMessage.includes("find") ||
    normalizedMessage.includes("remote") ||
    normalizedMessage.includes("job")
  ) {
    return [
      "How do I use the job filters?",
      "How can I view complete job details?",
      "What should I check before applying?",
    ];
  }

  if (
    normalizedMessage.includes("profile") ||
    normalizedMessage.includes("account")
  ) {
    return [
      "How can I update my profile?",
      "Can I change my profile image?",
      "Where can I view my dashboard?",
    ];
  }

  if (
    normalizedMessage.includes("skill") ||
    normalizedMessage.includes("career")
  ) {
    return [
      "What skills should I learn next?",
      "How can I choose a career path?",
      "How should I prepare for an interview?",
    ];
  }

  return [
    "How do I explore jobs?",
    "How can I publish a job?",
    "Explain the CareerPilot dashboard",
  ];
}

function writeAIStreamEvent(res: Response, event: AIStreamEvent) {
  if (!res.writableEnded) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}

async function run() {
  try {
    // await client.connect();

    const db = client.db("careerpilot-db");
    const jobsCollection = db.collection("jobs");
    const messagesCollection = db.collection("messages");

    const aiConversationsCollection =
      db.collection<AIConversationDocument>("aiConversations");

    void aiConversationsCollection
      .createIndex({
        userId: 1,
        updatedAt: -1,
      })
      .catch((error) => {
        console.error("AI conversation index creation error:", error);
      });

    //AI ChatBOT API
    app.get(
      "/ai/conversations",
      verifyToken,
      async (_req: Request, res: Response) => {
        try {
          const userId = res.locals.userId as string;

          const conversations = await aiConversationsCollection
            .find({
              userId,
            })
            .sort({
              updatedAt: -1,
            })
            .limit(30)
            .toArray();

          const conversationList = conversations.map((conversation) => {
            const messages = conversation.messages || [];

            const lastMessage =
              messages.length > 0 ? messages[messages.length - 1] : null;

            return {
              _id: conversation._id.toString(),
              title: conversation.title,
              messageCount: messages.length,
              lastMessage: lastMessage?.content || "",
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
            };
          });

          return res.status(200).json({
            success: true,
            message: "AI conversations retrieved successfully.",
            data: conversationList,
          });
        } catch (error) {
          console.error("Get AI conversations error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to retrieve AI conversations.",
          });
        }
      },
    );

    app.get(
      "/ai/conversations/:id",
      verifyToken,
      async (req: Request, res: Response) => {
        try {
          const conversationId = req.params.id as string;

          const userId = res.locals.userId as string;

          if (!conversationId || !ObjectId.isValid(conversationId)) {
            return res.status(404).json({
              success: false,
              message: "Conversation not found.",
            });
          }

          const conversation = await aiConversationsCollection.findOne({
            _id: new ObjectId(conversationId),
            userId,
          });

          if (!conversation) {
            return res.status(404).json({
              success: false,
              message: "Conversation not found.",
            });
          }

          return res.status(200).json({
            success: true,
            message: "AI conversation retrieved successfully.",
            data: {
              _id: conversation._id.toString(),
              title: conversation.title,
              messages: conversation.messages || [],
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
            },
          });
        } catch (error) {
          console.error("Get AI conversation error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to retrieve the AI conversation.",
          });
        }
      },
    );

    app.delete(
      "/ai/conversations/:id",
      verifyToken,
      async (req: Request, res: Response) => {
        try {
          const conversationId = req.params.id as string;
          const userId = res.locals.userId as string;

          if (!conversationId || !ObjectId.isValid(conversationId)) {
            return res.status(404).json({
              success: false,
              message: "Conversation not found.",
            });
          }

          const result = await aiConversationsCollection.deleteOne({
            _id: new ObjectId(conversationId),
            userId,
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Conversation not found.",
            });
          }

          return res.status(200).json({
            success: true,
            message: "Conversation deleted successfully.",
          });
        } catch (error) {
          console.error("Delete AI conversation error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to delete the conversation.",
          });
        }
      },
    );

    app.post("/ai/chat", verifyToken, async (req: Request, res: Response) => {
      try {
        const { conversationId, message } = req.body as AIChatInput;

        const userId = res.locals.userId as string;

        const normalizedMessage = message?.trim();

        if (!normalizedMessage) {
          return res.status(400).json({
            success: false,
            message: "A message is required.",
          });
        }

        if (normalizedMessage.length > 2000) {
          return res.status(400).json({
            success: false,
            message: "Message cannot exceed 2000 characters.",
          });
        }

        const now = new Date();

        const userMessage: AIMessageDocument = {
          id: createAIMessageId(),
          role: "user",
          content: normalizedMessage,
          createdAt: now,
        };

        let activeConversationId: ObjectId;

        let conversationMessages: AIMessageDocument[] = [];

        // Continue an existing conversation
        if (conversationId) {
          if (!ObjectId.isValid(conversationId)) {
            return res.status(404).json({
              success: false,
              message: "Conversation not found.",
            });
          }

          activeConversationId = new ObjectId(conversationId);

          const conversation = await aiConversationsCollection.findOne({
            _id: activeConversationId,
            userId,
          });

          if (!conversation) {
            return res.status(404).json({
              success: false,
              message: "Conversation not found.",
            });
          }

          const previousMessages = conversation.messages || [];

          conversationMessages = [...previousMessages, userMessage];

          await aiConversationsCollection.updateOne(
            {
              _id: activeConversationId,
              userId,
            },
            {
              $push: {
                messages: userMessage,
              },
              $set: {
                updatedAt: now,
              },
            },
          );
        } else {
          // Create a new conversation
          const conversationDocument: AIConversationDocument = {
            userId,
            title: createConversationTitle(normalizedMessage),
            messages: [userMessage],
            createdAt: now,
            updatedAt: now,
          };

          const insertResult =
            await aiConversationsCollection.insertOne(conversationDocument);

          activeConversationId = insertResult.insertedId;

          conversationMessages = [userMessage];
        }

        // Streaming response headers
        res.status(200);

        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");

        res.setHeader("Cache-Control", "no-cache, no-transform");

        res.setHeader("Connection", "keep-alive");

        res.setHeader("X-Accel-Buffering", "no");

        res.flushHeaders();

        // Inform frontend of the active conversation ID
        writeAIStreamEvent(res, {
          type: "conversation",
          conversationId: activeConversationId.toString(),
        });

        const groq = getGroqClient();

        // Limit history to the latest 24 messages
        const recentMessages = conversationMessages.slice(-24);

        const groqMessages = [
          {
            role: "system" as const,
            content: CAREER_PILOT_SYSTEM_PROMPT,
          },
          ...recentMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
        ];

        const stream = await groq.chat.completions.create({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",

          messages: groqMessages,

          temperature: 0.4,

          max_completion_tokens: 1000,

          stream: true,
        });

        let assistantContent = "";

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;

          if (!content) {
            continue;
          }

          assistantContent += content;

          writeAIStreamEvent(res, {
            type: "delta",
            content,
          });
        }

        const normalizedAssistantContent = assistantContent.trim();

        if (!normalizedAssistantContent) {
          throw new Error("The AI provider returned an empty response.");
        }

        const assistantMessage: AIMessageDocument = {
          id: createAIMessageId(),
          role: "assistant",
          content: normalizedAssistantContent,
          createdAt: new Date(),
        };

        // Save completed assistant response
        await aiConversationsCollection.updateOne(
          {
            _id: activeConversationId,
            userId,
          },
          {
            $push: {
              messages: assistantMessage,
            },
            $set: {
              updatedAt: new Date(),
            },
          },
        );

        writeAIStreamEvent(res, {
          type: "done",
          conversationId: activeConversationId.toString(),
          suggestions: getSuggestedPrompts(normalizedMessage),
        });

        res.end();
      } catch (error) {
        console.error("AI chat error:", error);

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unable to generate an AI response.";

        // Streaming already শুরু হয়ে গেলে JSON response পাঠানো যাবে না
        if (res.headersSent) {
          writeAIStreamEvent(res, {
            type: "error",
            message: errorMessage,
          });

          res.end();
          return;
        }

        return res.status(500).json({
          success: false,
          message: "Unable to generate an AI response.",
        });
      }
    });

    // ALL Public API

    app.get("/jobs", async (req: Request, res: Response) => {
      try {
        const search =
          typeof req.query.search === "string" ? req.query.search.trim() : "";

        const category =
          typeof req.query.category === "string"
            ? req.query.category.trim()
            : "";

        const location =
          typeof req.query.location === "string"
            ? req.query.location.trim()
            : "";

        const jobType =
          typeof req.query.jobType === "string" ? req.query.jobType.trim() : "";

        const sort =
          typeof req.query.sort === "string" ? req.query.sort : "newest";

        const minSalary =
          typeof req.query.minSalary === "string"
            ? Number(req.query.minSalary)
            : Number.NaN;

        const maxSalary =
          typeof req.query.maxSalary === "string"
            ? Number(req.query.maxSalary)
            : Number.NaN;

        const requestedPage =
          typeof req.query.page === "string" ? Number(req.query.page) : 1;

        const requestedLimit =
          typeof req.query.limit === "string" ? Number(req.query.limit) : 8;

        const page =
          Number.isInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;

        const limit =
          Number.isInteger(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, 24)
            : 8;

        const skip = (page - 1) * limit;

        const query: Filter<Document> = {};

        // Search by title, company, description or skills
        if (search) {
          const safeSearch = escapeRegex(search);

          query.$or = [
            {
              title: {
                $regex: safeSearch,
                $options: "i",
              },
            },
            {
              companyName: {
                $regex: safeSearch,
                $options: "i",
              },
            },
            {
              shortDescription: {
                $regex: safeSearch,
                $options: "i",
              },
            },
            {
              skills: {
                $regex: safeSearch,
                $options: "i",
              },
            },
          ];
        }

        // Exact category filter
        if (category) {
          query.category = category;
        }

        // Exact job type filter
        if (jobType) {
          query.jobType = jobType;
        }

        // Location text filter
        if (location) {
          query.location = {
            $regex: escapeRegex(location),
            $options: "i",
          };
        }

        // Salary range filters
        if (Number.isFinite(minSalary) && minSalary >= 0) {
          query.salaryMax = {
            $gte: minSalary,
          };
        }

        if (Number.isFinite(maxSalary) && maxSalary >= 0) {
          query.salaryMin = {
            $lte: maxSalary,
          };
        }

        let sortOption: Record<string, 1 | -1> = {
          createdAt: -1,
        };

        switch (sort) {
          case "oldest":
            sortOption = {
              createdAt: 1,
            };
            break;

          case "salary-low":
            sortOption = {
              salaryMin: 1,
              createdAt: -1,
            };
            break;

          case "salary-high":
            sortOption = {
              salaryMax: -1,
              createdAt: -1,
            };
            break;

          case "deadline":
            sortOption = {
              applicationDeadline: 1,
              createdAt: -1,
            };
            break;

          default:
            sortOption = {
              createdAt: -1,
            };
        }

        const [jobs, totalItems] = await Promise.all([
          jobsCollection
            .find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .toArray(),

          jobsCollection.countDocuments(query),
        ]);

        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        return res.status(200).json({
          success: true,
          message: "Jobs retrieved successfully.",
          data: jobs,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems,
            itemsPerPage: limit,
            hasPreviousPage: page > 1,
            hasNextPage: page < totalPages,
          },
        });
      } catch (error) {
        console.error("Get public jobs error:", error);

        return res.status(500).json({
          success: false,
          message: "Unable to retrieve jobs.",
        });
      }
    });

    // Public single job details API

    app.get("/jobs/:id", async (req: Request, res: Response) => {
      try {
        const jobId = req.params.id as string;

        if (!jobId || !ObjectId.isValid(jobId)) {
          return res.status(404).json({
            success: false,
            message: "Job not found.",
          });
        }

        const objectJobId = new ObjectId(jobId);

        const job = await jobsCollection.findOne({
          _id: objectJobId,
        });

        if (!job) {
          return res.status(404).json({
            success: false,
            message: "Job not found.",
          });
        }

        const relatedJobs = await jobsCollection
          .find({
            _id: {
              $ne: objectJobId,
            },
            category: job.category,
          })
          .sort({
            createdAt: -1,
          })
          .limit(4)
          .toArray();

        return res.status(200).json({
          success: true,
          message: "Job details retrieved successfully.",
          data: {
            job,
            relatedJobs,
          },
        });
      } catch (error) {
        console.error("Get job details error:", error);

        return res.status(500).json({
          success: false,
          message: "Unable to retrieve job details.",
        });
      }
    });

    app.post("/messages", async (req: Request, res: Response) => {
      try {
        const { name, email, subject, message } =
          req.body as ContactMessageInput;

        const normalizedName = name?.trim();

        const normalizedEmail = email?.trim().toLowerCase();

        const normalizedSubject = subject?.trim();

        const normalizedMessage = message?.trim();

        if (
          !normalizedName ||
          !normalizedEmail ||
          !normalizedSubject ||
          !normalizedMessage
        ) {
          return res.status(400).json({
            success: false,
            message: "Please provide all required contact information.",
          });
        }

        if (normalizedName.length < 2 || normalizedName.length > 80) {
          return res.status(400).json({
            success: false,
            message: "Name must contain between 2 and 80 characters.",
          });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
          !emailPattern.test(normalizedEmail) ||
          normalizedEmail.length > 120
        ) {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid email address.",
          });
        }

        if (normalizedSubject.length < 3 || normalizedSubject.length > 150) {
          return res.status(400).json({
            success: false,
            message: "Subject must contain between 3 and 150 characters.",
          });
        }

        if (normalizedMessage.length < 10 || normalizedMessage.length > 2000) {
          return res.status(400).json({
            success: false,
            message: "Message must contain between 10 and 2000 characters.",
          });
        }

        const messageDocument = {
          name: normalizedName,
          email: normalizedEmail,
          subject: normalizedSubject,
          message: normalizedMessage,
          status: "new",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await messagesCollection.insertOne(messageDocument);

        return res.status(201).json({
          success: true,
          message: "Your message has been sent successfully.",
          data: {
            id: result.insertedId.toString(),
          },
        });
      } catch (error) {
        console.error("Save contact message error:", error);

        return res.status(500).json({
          success: false,
          message: "Unable to send your message.",
        });
      }
    });

    // Protected API
    app.post(
      "/manage/jobs",
      verifyToken,
      async (req: Request, res: Response) => {
        try {
          const {
            title,
            companyName,
            companyLogo,
            shortDescription,
            fullDescription,
            category,
            jobType,
            workMode,
            location,
            experienceLevel,
            salaryMin,
            salaryMax,
            applicationDeadline,
            skills,
          } = req.body as JobInput;

          if (
            !title?.trim() ||
            !companyName?.trim() ||
            !shortDescription?.trim() ||
            !fullDescription?.trim() ||
            !category?.trim() ||
            !jobType?.trim() ||
            !workMode?.trim() ||
            !location?.trim() ||
            !experienceLevel?.trim() ||
            !applicationDeadline
          ) {
            return res.status(400).json({
              success: false,
              message: "Please provide all required job information.",
            });
          }

          const minimumSalary = Number(salaryMin);
          const maximumSalary = Number(salaryMax);

          if (
            !Number.isFinite(minimumSalary) ||
            !Number.isFinite(maximumSalary) ||
            minimumSalary < 0 ||
            maximumSalary < 0
          ) {
            return res.status(400).json({
              success: false,
              message: "Please provide valid salary values.",
            });
          }

          if (minimumSalary > maximumSalary) {
            return res.status(400).json({
              success: false,
              message: "Minimum salary cannot exceed maximum salary.",
            });
          }

          const deadline = new Date(applicationDeadline);

          if (Number.isNaN(deadline.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Please provide a valid application deadline.",
            });
          }

          const normalizedSkills = Array.isArray(skills)
            ? skills.map((skill) => String(skill).trim()).filter(Boolean)
            : [];

          if (normalizedSkills.length === 0) {
            return res.status(400).json({
              success: false,
              message: "Please provide at least one required skill.",
            });
          }

          const jobDocument = {
            title: title.trim(),
            companyName: companyName.trim(),
            companyLogo: companyLogo?.trim() || null,
            shortDescription: shortDescription.trim(),
            fullDescription: fullDescription.trim(),
            category: category.trim(),
            jobType: jobType.trim(),
            workMode: workMode.trim(),
            location: location.trim(),
            experienceLevel: experienceLevel.trim(),
            salaryMin: minimumSalary,
            salaryMax: maximumSalary,
            applicationDeadline: deadline,
            skills: normalizedSkills,
            createdBy: res.locals.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await jobsCollection.insertOne(jobDocument);

          return res.status(201).json({
            success: true,
            message: "Job published successfully.",
            data: {
              ...jobDocument,
              _id: result.insertedId,
            },
          });
        } catch (error) {
          console.error("Add job error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to publish the job.",
          });
        }
      },
    );

    app.get(
      "/manage/jobs/my-jobs",
      verifyToken,
      async (req: Request, res: Response) => {
        try {
          const jobs = await jobsCollection
            .find({
              createdBy: res.locals.userId,
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

          return res.status(200).json({
            success: true,
            message: "Jobs retrieved successfully.",
            data: jobs,
          });
        } catch (error) {
          console.error("Get user jobs error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to retrieve your jobs.",
          });
        }
      },
    );

    app.patch(
      "/manage/jobs/:id",
      verifyToken,
      async (req: Request, res: Response) => {
        try {
          const jobId = req.params.id as string;

          if (!jobId || !ObjectId.isValid(jobId)) {
            return res.status(400).json({
              success: false,
              message: "Invalid job ID.",
            });
          }

          const {
            title,
            companyName,
            companyLogo,
            shortDescription,
            fullDescription,
            category,
            jobType,
            workMode,
            location,
            experienceLevel,
            salaryMin,
            salaryMax,
            applicationDeadline,
            skills,
          } = req.body as JobInput;

          if (
            !title?.trim() ||
            !companyName?.trim() ||
            !shortDescription?.trim() ||
            !fullDescription?.trim() ||
            !category?.trim() ||
            !jobType?.trim() ||
            !workMode?.trim() ||
            !location?.trim() ||
            !experienceLevel?.trim() ||
            !applicationDeadline
          ) {
            return res.status(400).json({
              success: false,
              message: "Please provide all required job information.",
            });
          }

          const minimumSalary = Number(salaryMin);
          const maximumSalary = Number(salaryMax);

          if (
            !Number.isFinite(minimumSalary) ||
            !Number.isFinite(maximumSalary) ||
            minimumSalary < 0 ||
            maximumSalary < 0
          ) {
            return res.status(400).json({
              success: false,
              message: "Please provide valid salary values.",
            });
          }

          if (minimumSalary > maximumSalary) {
            return res.status(400).json({
              success: false,
              message: "Minimum salary cannot exceed maximum salary.",
            });
          }

          const deadline = new Date(applicationDeadline);

          if (Number.isNaN(deadline.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Please provide a valid application deadline.",
            });
          }

          const normalizedSkills = Array.isArray(skills)
            ? skills.map((skill) => String(skill).trim()).filter(Boolean)
            : [];

          if (normalizedSkills.length === 0) {
            return res.status(400).json({
              success: false,
              message: "Please provide at least one required skill.",
            });
          }

          const updatedJob = await jobsCollection.findOneAndUpdate(
            {
              _id: new ObjectId(jobId),
              createdBy: res.locals.userId,
            },
            {
              $set: {
                title: title.trim(),
                companyName: companyName.trim(),
                companyLogo: companyLogo?.trim() || null,
                shortDescription: shortDescription.trim(),
                fullDescription: fullDescription.trim(),
                category: category.trim(),
                jobType: jobType.trim(),
                workMode: workMode.trim(),
                location: location.trim(),
                experienceLevel: experienceLevel.trim(),
                salaryMin: minimumSalary,
                salaryMax: maximumSalary,
                applicationDeadline: deadline,
                skills: normalizedSkills,
                updatedAt: new Date(),
              },
            },
            {
              returnDocument: "after",
            },
          );

          if (!updatedJob) {
            return res.status(404).json({
              success: false,
              message: "Job not found or you cannot edit this job.",
            });
          }

          return res.status(200).json({
            success: true,
            message: "Job updated successfully.",
            data: updatedJob,
          });
        } catch (error) {
          console.error("Update job error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to update the job.",
          });
        }
      },
    );

    app.delete(
      "/manage/jobs/:id",
      verifyToken,
      async (req: Request, res: Response) => {
        try {
          const jobId = req.params.id as string;

          if (!jobId || !ObjectId.isValid(jobId)) {
            return res.status(400).json({
              success: false,
              message: "Invalid job ID.",
            });
          }

          const result = await jobsCollection.deleteOne({
            _id: new ObjectId(jobId),
            createdBy: res.locals.userId,
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Job not found or you cannot delete this job.",
            });
          }

          return res.status(200).json({
            success: true,
            message: "Job deleted successfully.",
          });
        } catch (error) {
          console.error("Delete job error:", error);

          return res.status(500).json({
            success: false,
            message: "Unable to delete the job.",
          });
        }
      },
    );

    // await client.db("admin").command({ ping: 1 });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Server চলাকালীন MongoDB connection বন্ধ করব না
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (_req: Request, res: Response) => {
  res.send("CareerPilot Server is Running...");
});

// Listen

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
