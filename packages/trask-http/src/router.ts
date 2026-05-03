import { randomUUID } from "node:crypto";



import type { JsonTraskQueryRepository, TraskQueryRecord } from "@openkotor/persistence";

import { normalizeAuthHandlerError, type AuthHandlerThrown } from "@openkotor/platform/auth";

import type { SearchProvider } from "@openkotor/retrieval";

import type { ResearchWizardQueryHandler } from "@openkotor/trask";

import { Router, type Request, type Response, type RequestHandler } from "express";



export interface TraskHttpRuntime {

  searchProvider: SearchProvider;

  researchWizard: ResearchWizardQueryHandler;

  queryRepository: JsonTraskQueryRepository;

}



type ScalarOrObject = string | number | boolean | null | object | undefined;



/** Authenticated user; omit persistQueries or set true to write queries to disk. */

export interface TraskHttpUser {

  id: string;

  persistQueries?: boolean;

}



export interface TraskHttpAuth<TUser extends TraskHttpUser = TraskHttpUser> {

  requireAuth(handler: (req: Request, res: Response, user: TUser) => void | Promise<void>): RequestHandler;

}



/** Matches Holocron (`vendor/qa-webui`) `TraskSessionDto`. */

export interface TraskHttpSessionDto {

  loggedIn: boolean;

  oauthAvailable?: boolean;

  discord?: { id: string; username: string; displayName: string };

}



export interface CreateTraskHttpRouterOptions<TUser extends TraskHttpUser = TraskHttpUser> {

  runtime: TraskHttpRuntime | undefined;

  auth: TraskHttpAuth<TUser>;

  /** GET `/session`. Default: `{ loggedIn: false, oauthAvailable: false }`. */

  getSession?: (req: Request) => TraskHttpSessionDto | Promise<TraskHttpSessionDto>;

  /** POST `/auth/logout`. Default: `204` empty body. */

  onLogout?: (req: Request, res: Response) => void | Promise<void>;

}



const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;



export const isTraskThreadId = (value: string): boolean => UUID_RE.test(value.trim());



const normalizeTraskQuery = (value: ScalarOrObject | undefined): string => {

  if (typeof value !== "string") {

    throw Object.assign(new Error("Body must include a string query."), { status: 422 });

  }



  const query = value.trim();

  if (!query) {

    throw Object.assign(new Error("Query is required."), { status: 422 });

  }



  if (query.length > 200) {

    throw Object.assign(new Error("Query must be 200 characters or fewer."), { status: 422 });

  }



  return query;

};



const normalizeTraskHistoryLimit = (value: ScalarOrObject | undefined): number => {

  const raw = Number(value ?? 25);

  if (!Number.isFinite(raw)) return 25;

  return Math.max(1, Math.min(100, Math.trunc(raw)));

};



const readOptionalHttpStatus = (e: AuthHandlerThrown): number | undefined => {

  if (typeof e === "object" && e !== null) {

    const s = Reflect.get(e, "status");

    if (typeof s === "number" && Number.isFinite(s)) {

      return s;

    }

  }

  return undefined;

};



const mapTraskQueryRecord = (record: TraskQueryRecord): TraskQueryRecord => ({

  ...record,

  sources: record.sources.map((source) => ({ ...source })),

});



const shouldPersistForUser = (user: TraskHttpUser): boolean => {

  return user.persistQueries !== false;

};



const normalizeThreadIdFromBody = (raw: ScalarOrObject | undefined): string => {

  if (raw === undefined || raw === null) {

    return randomUUID();

  }

  if (typeof raw !== "string") {

    throw Object.assign(new Error("threadId must be a UUID string when provided."), { status: 422 });

  }

  const trimmed = raw.trim();

  if (!trimmed) {

    return randomUUID();

  }

  if (!isTraskThreadId(trimmed)) {

    throw Object.assign(new Error("threadId must be a valid UUID."), { status: 422 });

  }

  return trimmed;

};



export const createTraskHttpRouter = <TUser extends TraskHttpUser = TraskHttpUser>(

  options: CreateTraskHttpRouterOptions<TUser>,

): Router => {

  const router = Router();



  const requireRuntime = (): TraskHttpRuntime => {

    if (!options.runtime) {

      throw Object.assign(new Error("Trask runtime is not configured on this server."), { status: 503 });

    }

    return options.runtime;

  };



  const handleTraskError = (res: Response, err: AuthHandlerThrown): void => {

    const { status, message } = normalizeAuthHandlerError(err);

    res.status(status).json({ error: message });

  };



  router.get("/session", async (req: Request, res: Response) => {

    try {

      const body = options.getSession

        ? await options.getSession(req)

        : { loggedIn: false, oauthAvailable: false };

      res.json(body);

    } catch (err) {

      handleTraskError(res, err as AuthHandlerThrown);

    }

  });



  router.post("/auth/logout", async (req: Request, res: Response) => {

    try {

      if (options.onLogout) {

        await options.onLogout(req, res);

      } else {

        res.status(204).end();

      }

    } catch (err) {

      handleTraskError(res, err as AuthHandlerThrown);

    }

  });



  router.get("/thread/:threadId", async (req: Request, res: Response) => {

    try {

      const threadId = typeof req.params.threadId === "string" ? req.params.threadId.trim() : "";

      if (!isTraskThreadId(threadId)) {

        res.status(400).json({ error: "Invalid thread id." });

        return;

      }

      const trask = requireRuntime();

      const history = await trask.queryRepository.listForThread(threadId);

      res.json({ history: history.map(mapTraskQueryRecord) });

    } catch (err) {

      handleTraskError(res, err as AuthHandlerThrown);

    }

  });



  router.get(

    "/sources",

    options.auth.requireAuth(async (_req, res, _user) => {

      try {

        const trask = requireRuntime();

        const sources = await trask.searchProvider.listSources();

        res.json({

          sources: sources.map((source) => ({

            id: source.id,

            name: source.name,

            kind: source.kind,

            homeUrl: source.homeUrl,

            description: source.description,

            freshnessPolicy: source.freshnessPolicy,

          })),

        });

      } catch (err) {

        handleTraskError(res, err as AuthHandlerThrown);

      }

    }),

  );



  router.get(

    "/history",

    options.auth.requireAuth(async (req, res, user) => {

      try {

        if (!shouldPersistForUser(user)) {

          res.json({ history: [] });

          return;

        }

        const trask = requireRuntime();

        const threadRaw = req.query.thread;

        const threadFilter =

          typeof threadRaw === "string" && isTraskThreadId(threadRaw.trim()) ? threadRaw.trim() : undefined;

        const history = await trask.queryRepository.listForUser(

          user.id,

          normalizeTraskHistoryLimit(req.query.limit),

          threadFilter,

        );

        res.json({ history: history.map(mapTraskQueryRecord) });

      } catch (err) {

        handleTraskError(res, err as AuthHandlerThrown);

      }

    }),

  );



  router.post(

    "/ask",

    options.auth.requireAuth(async (req, res, user) => {

      const trask = requireRuntime();

      let query: string;

      let threadId: string;

      const persist = shouldPersistForUser(user);



      try {

        const body = req.body as { query?: ScalarOrObject; threadId?: ScalarOrObject };

        query = normalizeTraskQuery(body.query);

        threadId = normalizeThreadIdFromBody(body.threadId);

      } catch (err) {

        const e = err as AuthHandlerThrown;

        const status = readOptionalHttpStatus(e) ?? 422;

        const message = e instanceof Error ? e.message : String(e);

        res.status(status).json({ error: message });

        return;

      }



      const queryId = randomUUID();

      const createdAt = new Date().toISOString();



      try {

        const result = await trask.researchWizard.answerQuestion(query);

        const record: TraskQueryRecord = {

          queryId,

          threadId,

          userId: user.id,

          query,

          status: "complete",

          answer: result.answer,

          sources: result.approvedSources.map((source) => ({

            id: source.id,

            name: source.name,

            url: source.homeUrl,

          })),

          error: null,

          createdAt,

          completedAt: new Date().toISOString(),

        };

        if (persist) {

          await trask.queryRepository.append(record);

        }

        res.status(201).json({ query: mapTraskQueryRecord(record) });

      } catch (err) {

        const e = err as AuthHandlerThrown;

        const status = readOptionalHttpStatus(e) ?? 502;

        const message = e instanceof Error ? e.message : String(e);

        const record: TraskQueryRecord = {

          queryId,

          threadId,

          userId: user.id,

          query,

          status: "failed",

          answer: null,

          sources: [],

          error: message,

          createdAt,

          completedAt: new Date().toISOString(),

        };

        if (persist) {

          await trask.queryRepository.append(record);

        }

        res.status(status).json({ error: message, query: mapTraskQueryRecord(record) });

      }

    }),

  );



  return router;

};


