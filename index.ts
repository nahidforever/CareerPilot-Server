import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import type { Document, Filter, Sort } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function run() {
  try {
    await client.connect();

    const db = client.db("careerpilot-db");
    const jobsCollection = db.collection("jobs");
    const messagesCollection = db.collection("messages");

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

    await client.db("admin").command({ ping: 1 });

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
