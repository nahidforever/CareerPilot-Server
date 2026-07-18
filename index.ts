import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
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

async function run() {
  try {
    await client.connect();

    const db = client.db("careerpilot-db");
    const jobsCollection = db.collection("jobs");

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
            views: 0,
            rating: 0,
            reviewCount: 0,
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

    app.patch("/manage/jobs/:id", verifyToken, async (req: Request, res: Response) => {
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
    });

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
