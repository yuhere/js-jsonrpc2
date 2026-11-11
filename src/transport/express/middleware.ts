import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import typeIs from 'type-is';
import { Repository } from '../../core/Repository';
import { RPCError } from '../../errors/RPCError';
import { INTERNAL_ERROR } from '../../errors/codes';
import type { InjectableFactory, Injections, RPCResponse, RPCErrorTransform } from '../../types';
import { createJsonParser, readJson } from './body';
import { respond } from './respond';
import { RPCVersion } from "../../schema/z/protocol";

export interface ExpressOptions {
  mkInjectable?: InjectableFactory;
  errorTransform?: RPCErrorTransform;
  bodyLimit?: string;
  useHtdoc?: boolean;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticDir = path.resolve(here, '..', '..', '..', 'htdoc');

export function createExpressRouter(
  repository: Repository,
  {
    mkInjectable = undefined,
    errorTransform = undefined,
    bodyLimit = '1mb',
    useHtdoc = process.env['NODE_ENV'] !== 'production',
  }: ExpressOptions = {}
): Router {
  const jsonParser = createJsonParser({ limit: bodyLimit });
  const router = express.Router();

  const handler: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    if (!typeIs(req, 'application/json')) {
      next();
      return;
    }
    try {
      const input = await readJson(req, res, jsonParser);
      const injectables = buildInjectables(mkInjectable, req, res, repository);
      const output = await repository.invoke(input, {
        injections: injectables,
        errorTransform: errorTransform
      });
      await respond(res, output);
    } catch (error) {
      await handleError(res, error);
    }
  };

  router.post('/', handler);
  if (useHtdoc === true) {
    router.use(express.static(defaultStaticDir));
  }
  return router;
}

function buildInjectables(
  factory: InjectableFactory | undefined,
  req: Request,
  res: Response,
  repository: Repository,
): Injections {

  const injections = typeof factory === 'function'
    ? {
      ...factory({
        request: req,
        session: (req as Request & { session?: unknown }).session,
        response: res
      }, repository),
      repository
    }
    : {
      request: req,
      session: (req as Request & { session?: unknown }).session,
      response: res,
      repository,
    }
  return { ...injections, injections: injections };
}

async function handleError(
  res: Response,
  error: unknown
): Promise<void> {
  if (error instanceof RPCError) {
    const payload = error.toPayload();
    if (process.env['NODE_ENV'] === 'production') delete payload.data;
    await respond(res, { jsonrpc: RPCVersion, id: null, error: payload });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  // if (process.env['NODE_ENV'] !== 'production') {
  //   console.error('Internal JSON-RPC error', message, error);
  // }
  await respond(res, {
    jsonrpc: RPCVersion,
    id: null,
    error: {
      code: INTERNAL_ERROR,
      message: 'Internal error',
      ...(process.env['NODE_ENV'] !== 'production' ? { data: message } : {}),
    },
  });
}

export type { RPCResponse };
