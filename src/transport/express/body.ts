import bodyParser from 'body-parser';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { RPCError } from '../../errors/RPCError';
import { PARSE_ERROR } from '../../errors/codes';


export interface ReadJsonOptions {
  limit?: string;
  verify?: (req: Request, res: Response, buf: Buffer, encoding: string) => void;
}

export function createJsonParser(options: ReadJsonOptions = {}): RequestHandler {
  return bodyParser.json({
    limit: options.limit ?? '1mb',
    verify:
      options.verify ??
      ((req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      }),
  });
}

export function readJson(req: Request, res: Response, parser: RequestHandler): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      parser(req, res, (error?: unknown) => {
        if (error) {
          return reject(new RPCError(PARSE_ERROR, 'Parse error', error instanceof Error ? error.message : error));
        }
        resolve((req as Request & { body?: unknown }).body);
      });
    } catch (error) {
      reject(new RPCError(PARSE_ERROR, 'Parse error', error instanceof Error ? error.message : error));
    }
  });
}

export type { NextFunction };
